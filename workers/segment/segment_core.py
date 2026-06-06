"""
Geometry-based part segmentation for triangle meshes.

Why geometry, not a learned model
---------------------------------
A learned 3D part-segmentation network (e.g. PartField / SAM-3D via a GPU
worker) can attach human labels ("head", "arm") but it brings a hard GPU
dependency, non-determinism, and an external-availability risk — and it still
fails on the long tail of stylised, low-poly, or non-organic meshes the forge
pipeline produces. Convex decomposition (CoACD/VHACD) over-fragments organic
shapes into dozens of convex shards that are not the parts a human would name.

We instead segment on the geometry the mesh already carries, which is fast,
deterministic, GPU-free (consistent with the CPU remesh worker), and works on
any topology:

  1. Connected components first. Anything physically disjoint — wheels, eyes,
     a weapon, loose accessories — separates immediately and perfectly.

  2. The minima rule within each connected component. Human shape perception
     segments objects at concave creases (Hoffman & Richards, 1984). We cut the
     face-adjacency graph along strong concave edges, then take the connected
     components of what remains. This finds the natural seam between a limb and
     a torso, a handle and a body, a wheel-arch and a fender.

  3. Cleanup. Tiny shards are merged back into their largest neighbour, and the
     part count is capped by repeatedly merging the smallest part into its
     largest neighbour — so the output is a handful of meaningful parts, not a
     thousand crease fragments.

Parts are named by their spatial region (top / lower-left / core …) so the
labels read meaningfully in the viewer, and each part is tinted a distinct hue
so segmentation is visible even on an untextured mesh.
"""

from __future__ import annotations

import colorsys
import math
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import trimesh
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

# A perceptually spread palette — distinct adjacent hues, golden-ratio stepped
# so even 20+ parts stay visually separable.
_GOLDEN = 0.61803398875


def _palette(n: int) -> list[tuple[int, int, int]]:
    colors = []
    h = 0.08
    for _ in range(max(n, 1)):
        r, g, b = colorsys.hsv_to_rgb(h % 1.0, 0.62, 0.95)
        colors.append((int(r * 255), int(g * 255), int(b * 255)))
        h += _GOLDEN
    return colors


@dataclass
class Part:
    index: int
    name: str
    mesh: "trimesh.Trimesh"
    color: tuple[int, int, int]
    region: str

    def manifest(self) -> dict:
        b = self.mesh.bounds  # (2,3) min,max
        centroid = self.mesh.centroid
        return {
            "id": f"part_{self.index:02d}",
            "name": self.name,
            "region": self.region,
            "face_count": int(len(self.mesh.faces)),
            "vertex_count": int(len(self.mesh.vertices)),
            "bbox": {
                "min": [float(x) for x in b[0]],
                "max": [float(x) for x in b[1]],
            },
            "centroid": [float(x) for x in centroid],
            "volume": float(abs(self.mesh.volume)) if self.mesh.is_volume else 0.0,
            "color": "#%02x%02x%02x" % self.color,
        }


@dataclass
class SegmentationResult:
    parts: list[Part]
    source_faces: int
    method: str
    warnings: list[str] = field(default_factory=list)


# ── mesh loading / normalisation ──────────────────────────────────────────────


def load_concatenated(data: bytes, suffix: str) -> "trimesh.Trimesh":
    """Load a mesh or scene and return a single Trimesh.

    A glTF scene's own node split is *not* a reliable part split — exporters
    routinely emit a whole character as one node, or shatter it into per-material
    nodes. We concatenate to a single mesh and re-derive parts from geometry so
    the result is consistent regardless of how the source was authored.
    """
    import io

    loaded = trimesh.load(
        io.BytesIO(data),
        file_type=suffix.lstrip("."),
        force="mesh",
        process=True,
    )
    if isinstance(loaded, trimesh.Scene):
        meshes = [g for g in loaded.geometry.values() if isinstance(g, trimesh.Trimesh)]
        if not meshes:
            raise ValueError("no triangle geometry found in the model")
        mesh = trimesh.util.concatenate(meshes)
    else:
        mesh = loaded
    if mesh.faces is None or len(mesh.faces) == 0:
        raise ValueError("mesh has no faces to segment")
    mesh.merge_vertices()
    return mesh


# ── core segmentation ─────────────────────────────────────────────────────────


def _crease_labels(mesh: "trimesh.Trimesh", crease_angle_rad: float) -> np.ndarray:
    """Label faces by minima-rule region growing.

    Faces stay connected across an edge unless that edge is concave and its
    dihedral angle exceeds the threshold; the connected components of the
    surviving graph are the regions.
    """
    n_faces = len(mesh.faces)
    adjacency = mesh.face_adjacency  # (E, 2)
    if len(adjacency) == 0:
        return np.zeros(n_faces, dtype=np.int64)

    angles = mesh.face_adjacency_angles  # (E,) radians, unsigned
    convex = mesh.face_adjacency_convex  # (E,) bool, True where the edge bulges out

    # The minima rule: cut only at *concave* creases sharper than the threshold.
    cut = (~convex) & (angles > crease_angle_rad)
    keep = adjacency[~cut]

    if len(keep) == 0:
        # Every interior edge is a sharp concave crease — nothing to grow.
        return np.arange(n_faces, dtype=np.int64)

    rows = np.concatenate([keep[:, 0], keep[:, 1]])
    cols = np.concatenate([keep[:, 1], keep[:, 0]])
    data = np.ones(len(rows), dtype=np.uint8)
    graph = coo_matrix((data, (rows, cols)), shape=(n_faces, n_faces))
    _, labels = connected_components(graph, directed=False)
    return labels


def _label_adjacency(mesh: "trimesh.Trimesh", labels: np.ndarray) -> dict[int, set[int]]:
    """Which labels touch which, via the full face-adjacency graph."""
    neighbours: dict[int, set[int]] = {}
    fa = mesh.face_adjacency
    if len(fa) == 0:
        return neighbours
    la = labels[fa[:, 0]]
    lb = labels[fa[:, 1]]
    diff = la != lb
    for a, b in zip(la[diff], lb[diff]):
        neighbours.setdefault(int(a), set()).add(int(b))
        neighbours.setdefault(int(b), set()).add(int(a))
    return neighbours


def _merge_small_and_cap(
    mesh: "trimesh.Trimesh",
    labels: np.ndarray,
    min_part_faces: int,
    max_parts: int,
) -> np.ndarray:
    """Merge sub-threshold parts into their largest neighbour, then cap count.

    Both passes reassign labels in place and recompute neighbours afterwards so
    the adjacency stays correct as parts coalesce.
    """
    labels = labels.copy()

    def sizes() -> dict[int, int]:
        uniq, counts = np.unique(labels, return_counts=True)
        return {int(u): int(c) for u, c in zip(uniq, counts)}

    def largest_neighbour(label: int, neigh: dict[int, set[int]], sz: dict[int, int]) -> Optional[int]:
        cands = neigh.get(label, set())
        if not cands:
            return None
        return max(cands, key=lambda c: sz.get(c, 0))

    # Pass 1 — dissolve shards below the face floor.
    while True:
        sz = sizes()
        if len(sz) <= 1:
            break
        small = [lbl for lbl, c in sz.items() if c < min_part_faces]
        if not small:
            break
        neigh = _label_adjacency(mesh, labels)
        # Smallest first, so a chain of shards collapses outward.
        small.sort(key=lambda l: sz[l])
        merged_any = False
        for lbl in small:
            target = largest_neighbour(lbl, neigh, sz)
            if target is None or target == lbl:
                continue
            labels[labels == lbl] = target
            merged_any = True
            break  # recompute sizes/adjacency after each merge
        if not merged_any:
            break

    # Pass 2 — cap the part count by merging the smallest into its largest neighbour.
    while True:
        sz = sizes()
        if len(sz) <= max_parts:
            break
        neigh = _label_adjacency(mesh, labels)
        smallest = min(sz, key=lambda l: sz[l])
        target = largest_neighbour(smallest, neigh, sz)
        if target is None:
            # Disconnected leftover with no neighbour to merge into — keep the
            # largest `max_parts` and fold the rest into the overall biggest.
            ordered = sorted(sz, key=lambda l: sz[l], reverse=True)
            keep_set = set(ordered[: max_parts - 1])
            biggest = ordered[0]
            for lbl in ordered[max_parts - 1:]:
                if lbl not in keep_set:
                    labels[labels == lbl] = biggest
            break
        labels[labels == smallest] = target

    return labels


def _region_name(centroid: np.ndarray, bounds: np.ndarray) -> str:
    """A human-readable spatial label from a part centroid within the bbox.

    Y is up (glTF convention). Vertical band dominates the name (top/lower/…);
    a left/right/front/back qualifier is added when the part sits clearly off
    the central axis.
    """
    span = bounds[1] - bounds[0]
    span[span == 0] = 1.0
    rel = (centroid - bounds[0]) / span  # 0..1 per axis

    y = rel[1]
    if y >= 0.78:
        vert = "top"
    elif y >= 0.58:
        vert = "upper"
    elif y >= 0.42:
        vert = "mid"
    elif y >= 0.22:
        vert = "lower"
    else:
        vert = "bottom"

    quals = []
    x = rel[0]
    if x <= 0.34:
        quals.append("left")
    elif x >= 0.66:
        quals.append("right")
    z = rel[2]
    if z <= 0.30:
        quals.append("back")
    elif z >= 0.70:
        quals.append("front")

    return "-".join([vert, *quals]) if quals else ("core" if vert == "mid" else vert)


def _unique_names(regions: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    out = []
    counts = {r: regions.count(r) for r in regions}
    for r in regions:
        if counts[r] == 1:
            out.append(r)
        else:
            seen[r] = seen.get(r, 0) + 1
            out.append(f"{r}-{seen[r]}")
    return out


def segment(
    mesh: "trimesh.Trimesh",
    *,
    method: str = "auto",
    max_parts: int = 24,
    min_part_faces: int = 64,
    crease_angle_deg: float = 40.0,
) -> SegmentationResult:
    """Split `mesh` into named parts.

    method:
      - "connected": split only at physically disconnected shells.
      - "crease":    minima-rule crease segmentation over the whole mesh.
      - "auto":      connected components, then crease-split any component large
                     enough to plausibly contain multiple parts. Best default.
    """
    source_faces = int(len(mesh.faces))
    warnings: list[str] = []
    crease_rad = math.radians(max(5.0, min(170.0, crease_angle_deg)))

    # Step 1 — connected components are always honoured; they are unambiguous parts.
    components = mesh.split(only_watertight=False)
    if len(components) == 0:
        components = [mesh]

    region_meshes: list["trimesh.Trimesh"] = []

    for comp in components:
        if method == "connected":
            region_meshes.append(comp)
            continue

        # crease / auto: grow regions inside this component.
        # In auto mode, skip the (expensive, pointless) crease pass on tiny
        # components that are obviously a single part already.
        if method == "auto" and len(comp.faces) < max(min_part_faces * 2, 200):
            region_meshes.append(comp)
            continue

        labels = _crease_labels(comp, crease_rad)
        labels = _merge_small_and_cap(comp, labels, min_part_faces, max_parts)
        for lbl in np.unique(labels):
            face_idx = np.where(labels == lbl)[0]
            sub = comp.submesh([face_idx], append=True, repair=False)
            if isinstance(sub, list):
                sub = sub[0] if sub else None
            if sub is not None and len(sub.faces) > 0:
                region_meshes.append(sub)

    # Global cap across all components combined.
    if len(region_meshes) > max_parts:
        region_meshes.sort(key=lambda m: len(m.faces), reverse=True)
        head = region_meshes[: max_parts - 1]
        tail = region_meshes[max_parts - 1:]
        merged = trimesh.util.concatenate(tail)
        region_meshes = head + [merged]
        warnings.append(
            f"capped to {max_parts} parts; {len(tail)} smaller fragments were combined"
        )

    if not region_meshes:
        region_meshes = [mesh]

    # Order parts top→bottom, then larger→smaller, so the list reads naturally.
    overall_bounds = mesh.bounds

    def sort_key(m: "trimesh.Trimesh"):
        return (-(m.centroid[1]), -len(m.faces))

    region_meshes.sort(key=sort_key)

    regions = [_region_name(m.centroid, overall_bounds) for m in region_meshes]
    names = _unique_names(regions)
    colors = _palette(len(region_meshes))

    parts: list[Part] = []
    for i, (m, name, region, color) in enumerate(zip(region_meshes, names, regions, colors)):
        # Tint each part so segmentation is visible without textures, and so a
        # downstream viewer/exporter has a stable per-part colour to fall back on.
        m.visual = trimesh.visual.ColorVisuals(
            mesh=m, face_colors=np.tile([*color, 255], (len(m.faces), 1))
        )
        parts.append(Part(index=i + 1, name=name, mesh=m, color=color, region=region))

    return SegmentationResult(
        parts=parts, source_faces=source_faces, method=method, warnings=warnings
    )


def build_scene(parts: list[Part]) -> "trimesh.Scene":
    """A scene whose node names are the part ids — so a GLB consumer can address,
    hide, recolour or export each part by name."""
    scene = trimesh.Scene()
    for p in parts:
        node_name = f"part_{p.index:02d}"
        scene.add_geometry(p.mesh, geom_name=node_name, node_name=node_name)
    return scene


def manifest(result: SegmentationResult) -> dict:
    return {
        "method": result.method,
        "source_faces": result.source_faces,
        "part_count": len(result.parts),
        "parts": [p.manifest() for p in result.parts],
        "warnings": result.warnings,
    }
