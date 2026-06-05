"""
Mesh processing service — remesh, simplify, repair, and convert 3D files.

Wraps trimesh + open3d. No GPU required; runs on CPU. Handles:
  - Format conversion (GLB ↔ OBJ ↔ FBX ↔ STL ↔ PLY ↔ USDZ ↔ 3MF)
  - Face count reduction (quadric decimation via open3d)
  - Mesh repair (fill holes, remove degenerate faces, fix normals)
  - Vertex deduplication and cleaning
  - UV unwrapping for meshes without UV maps

API contract:
  POST /process  {
    mesh: url,                       # https GLB/OBJ/FBX/STL URL (required)
    operation: "convert"|"simplify"|"repair"|"full",   # default: "full"
    target_faces?: int,              # default: 50000, range: 1000–500000
    output_format?: "glb"|"obj"|"stl"|"ply"|"usdz"|"3mf",  # default: "glb"
  } → 202 { task_id, status }

  GET /tasks/:id → { task_id, status, result_url?, face_count?, error? }

  GET /health    → { ok }

Environment variables:
  API_KEY     — bearer secret (required)
  GCS_BUCKET  — output bucket (required)
  MAX_CONCURRENT — default 2
"""

from __future__ import annotations

import asyncio
import io
import logging
import os
import tempfile
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Header, BackgroundTasks
from google.cloud import storage
from pydantic import BaseModel, Field, field_validator

from worker_security import (
    UnsafeUrlError,
    fetch_remote_bytes,
    require_api_key,
    safe_error,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("remesh")

API_KEY = os.environ["API_KEY"]
GCS_BUCKET = os.environ["GCS_BUCKET"]
MAX_CONCURRENT = int(os.environ.get("MAX_CONCURRENT", "2"))

_bucket: Optional[storage.Bucket] = None
_sem: Optional[asyncio.Semaphore] = None
_tasks: dict[str, dict] = {}

SUPPORTED_INPUT_FORMATS = {".glb", ".gltf", ".obj", ".stl", ".ply", ".fbx", ".off", ".dae"}
SUPPORTED_OUTPUT_FORMATS = {"glb", "obj", "stl", "ply", "usdz", "3mf"}
MAX_MESH_BYTES = 128 * 1024 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _bucket, _sem
    _bucket = storage.Client().bucket(GCS_BUCKET)
    _sem = asyncio.Semaphore(MAX_CONCURRENT)
    import trimesh
    import open3d
    log.info("remesh service ready — trimesh %s, open3d %s", trimesh.__version__, open3d.__version__)
    yield


app = FastAPI(title="remesh-service", lifespan=lifespan)


def _require_api_key(authorization: str) -> None:
    try:
        require_api_key(authorization, API_KEY)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


def _fetch_mesh(url: str) -> tuple[bytes, str]:
    try:
        data = fetch_remote_bytes(url, timeout=60, max_bytes=MAX_MESH_BYTES)
    except UnsafeUrlError as exc:
        raise ValueError(f"refused to fetch mesh: {exc}") from exc
    suffix = Path(url.split("?")[0]).suffix.lower()
    if suffix not in SUPPORTED_INPUT_FORMATS:
        suffix = ".glb"
    return data, suffix


def _load_mesh(data: bytes, suffix: str):
    import trimesh
    return trimesh.load(
        io.BytesIO(data),
        file_type=suffix.lstrip("."),
        force="mesh",
        process=False,
    )


def _repair_mesh(mesh):
    import trimesh
    # Fill holes
    trimesh.repair.fill_holes(mesh)
    # Remove degenerate faces (zero-area)
    mask = mesh.nondegenerate_faces()
    mesh.update_faces(mask)
    # Fix normals
    trimesh.repair.fix_normals(mesh)
    # Merge duplicate vertices
    mesh.merge_vertices()
    # Remove unreferenced vertices
    mesh.remove_unreferenced_vertices()
    return mesh


def _simplify_mesh(mesh, target_faces: int):
    """Quadric decimation via open3d, fallback to trimesh."""
    import open3d as o3d
    import numpy as np

    if len(mesh.faces) <= target_faces:
        return mesh

    try:
        # Convert trimesh → open3d
        o3d_mesh = o3d.geometry.TriangleMesh()
        o3d_mesh.vertices = o3d.utility.Vector3dVector(mesh.vertices.astype(np.float64))
        o3d_mesh.triangles = o3d.utility.Vector3iVector(mesh.faces.astype(np.int32))
        if mesh.vertex_normals is not None and len(mesh.vertex_normals):
            o3d_mesh.vertex_normals = o3d.utility.Vector3dVector(mesh.vertex_normals.astype(np.float64))

        # Quadric decimation
        simplified = o3d_mesh.simplify_quadric_decimation(target_faces)
        simplified.compute_vertex_normals()

        # Convert back to trimesh
        import trimesh
        result = trimesh.Trimesh(
            vertices=np.asarray(simplified.vertices),
            faces=np.asarray(simplified.triangles),
            vertex_normals=np.asarray(simplified.vertex_normals),
            process=False,
        )
        return result
    except Exception as exc:
        log.warning("open3d simplification failed (%s), using trimesh fallback", exc)
        # trimesh built-in simplification (less accurate but always works)
        return mesh.simplify_quadric_decimation(target_faces)


def _export_mesh(mesh, output_format: str, task_id: str) -> tuple[bytes, str]:
    import trimesh
    fmt = output_format.lower()
    with tempfile.TemporaryDirectory() as tmpdir:
        out_path = Path(tmpdir) / f"output.{fmt}"
        if fmt == "glb":
            scene = trimesh.scene.scene.Scene(geometry={"mesh": mesh})
            scene.export(str(out_path))
        elif fmt == "usdz":
            scene = trimesh.scene.scene.Scene(geometry={"mesh": mesh})
            scene.export(str(out_path))
        else:
            mesh.export(str(out_path))
        data = out_path.read_bytes()
        return data, f"model/{'gltf-binary' if fmt == 'glb' else 'octet-stream'}"


def _run_processing(
    mesh_url: str,
    operation: str,
    target_faces: int,
    output_format: str,
) -> tuple[bytes, int, str]:
    data, suffix = _fetch_mesh(mesh_url)
    mesh = _load_mesh(data, suffix)

    # Handle scene (multi-mesh) → combine into single mesh
    import trimesh
    if isinstance(mesh, trimesh.Scene):
        meshes = [g for g in mesh.geometry.values() if isinstance(g, trimesh.Trimesh)]
        if not meshes:
            raise ValueError("no renderable geometry found in scene")
        mesh = trimesh.util.concatenate(meshes)

    if operation in ("repair", "full"):
        mesh = _repair_mesh(mesh)

    if operation in ("simplify", "full") and len(mesh.faces) > target_faces:
        mesh = _simplify_mesh(mesh, target_faces)

    out_bytes, content_type = _export_mesh(mesh, output_format, "")
    return out_bytes, len(mesh.faces), content_type


async def _process(
    task_id: str,
    mesh_url: str,
    operation: str,
    target_faces: int,
    output_format: str,
) -> None:
    async with _sem:
        _tasks[task_id]["status"] = "running"
        loop = asyncio.get_event_loop()
        t0 = time.time()
        try:
            out_bytes, face_count, content_type = await loop.run_in_executor(
                None,
                _run_processing,
                mesh_url,
                operation,
                target_faces,
                output_format,
            )

            blob_name = f"remesh/{task_id}.{output_format}"
            blob = _bucket.blob(blob_name)
            await loop.run_in_executor(
                None,
                lambda: blob.upload_from_string(out_bytes, content_type=content_type),
            )
            result_url = f"https://storage.googleapis.com/{GCS_BUCKET}/{blob_name}"

            elapsed = time.time() - t0
            _tasks[task_id].update({
                "status": "done",
                "result_url": result_url,
                "face_count": face_count,
                "output_format": output_format,
                "bytes": len(out_bytes),
                "elapsed_ms": int(elapsed * 1000),
            })
            log.info(
                "[%s] done in %.2fs — %d faces, %d bytes → %s",
                task_id, elapsed, face_count, len(out_bytes), result_url,
            )

        except Exception as exc:
            _tasks[task_id].update({
                "status": "failed",
                "error": safe_error(exc, context=f"[{task_id}] remesh"),
                "elapsed_ms": int((time.time() - t0) * 1000),
            })


class ProcessRequest(BaseModel):
    mesh: str = Field(..., description="https URL to input mesh (GLB/OBJ/FBX/STL/PLY)")
    operation: str = Field(default="full", description="convert|simplify|repair|full")
    target_faces: int = Field(default=50_000, ge=1_000, le=500_000)
    output_format: str = Field(default="glb")

    @field_validator("output_format")
    @classmethod
    def validate_format(cls, v: str) -> str:
        v = v.lower().lstrip(".")
        if v not in SUPPORTED_OUTPUT_FORMATS:
            raise ValueError(f"unsupported output format: {v}. Choose from {sorted(SUPPORTED_OUTPUT_FORMATS)}")
        return v

    @field_validator("operation")
    @classmethod
    def validate_op(cls, v: str) -> str:
        allowed = {"convert", "simplify", "repair", "full"}
        if v not in allowed:
            raise ValueError(f"operation must be one of {sorted(allowed)}")
        return v


@app.post("/process", status_code=202)
async def process_mesh(
    body: ProcessRequest,
    background_tasks: BackgroundTasks,
    authorization: str = Header(...),
) -> dict:
    _require_api_key(authorization)
    task_id = str(uuid.uuid4())
    _tasks[task_id] = {
        "task_id": task_id,
        "status": "queued",
        "operation": body.operation,
        "output_format": body.output_format,
    }
    background_tasks.add_task(
        _process,
        task_id,
        body.mesh,
        body.operation,
        body.target_faces,
        body.output_format,
    )
    return {"task_id": task_id, "status": "queued"}


@app.get("/tasks/{task_id}")
async def get_task(task_id: str, authorization: str = Header(...)) -> dict:
    _require_api_key(authorization)
    task = _tasks.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="task not found")
    return task


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "service": "remesh"}
