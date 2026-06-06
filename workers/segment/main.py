"""
Part-segmentation service — split a 3D model into addressable, named parts.

Wraps trimesh + a geometry-based segmenter (see segment_core.py). No GPU
required; runs on CPU like the remesh worker. It:
  - splits a mesh at its physically disconnected shells (wheels, eyes, props),
  - applies the minima rule inside each shell (cut at concave creases) to find
    natural part seams (limb↔torso, handle↔body, …),
  - merges shards and caps the part count to a meaningful handful,
  - tints each part a distinct colour, and
  - emits a GLB whose nodes are the parts (node name = part id) plus a parts
    manifest (id, name, region, bbox, centroid, face/vertex counts, colour).

Optionally exports a single part on its own (`only_part`).

API contract:
  POST /segment  {
    mesh: url,                               # https GLB/OBJ/STL/PLY/FBX URL (required)
    method?: "auto"|"connected"|"crease",    # default: "auto"
    max_parts?: int,                         # default: 24, range 2–64
    min_part_faces?: int,                    # default: 64, range 4–100000
    crease_angle?: float,                    # default: 40 (degrees), range 5–170
    only_part?: str,                         # export just this part id/name (e.g. "part_03")
  } → 202 { task_id, status }

  GET /tasks/:id → {
    task_id, status,
    result_url?, manifest_url?,
    parts?, part_count?, source_faces?, method?,
    error?
  }

  GET /health    → { ok }

Environment variables:
  API_KEY        — bearer secret (required)
  GCS_BUCKET     — output bucket (required)
  MAX_CONCURRENT — default 2
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
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
log = logging.getLogger("segment")

API_KEY = os.environ["API_KEY"]
GCS_BUCKET = os.environ["GCS_BUCKET"]
MAX_CONCURRENT = int(os.environ.get("MAX_CONCURRENT", "2"))

_bucket: Optional[storage.Bucket] = None
_sem: Optional[asyncio.Semaphore] = None
_tasks: dict[str, dict] = {}

SUPPORTED_INPUT_FORMATS = {".glb", ".gltf", ".obj", ".stl", ".ply", ".fbx", ".off", ".dae"}
VALID_METHODS = {"auto", "connected", "crease"}
MAX_MESH_BYTES = 128 * 1024 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _bucket, _sem
    _bucket = storage.Client().bucket(GCS_BUCKET)
    _sem = asyncio.Semaphore(MAX_CONCURRENT)
    import trimesh
    log.info("segment service ready — trimesh %s", trimesh.__version__)
    yield


app = FastAPI(title="segment-service", lifespan=lifespan)


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


def _run_segmentation(
    mesh_url: str,
    method: str,
    max_parts: int,
    min_part_faces: int,
    crease_angle: float,
    only_part: Optional[str],
) -> tuple[bytes, dict]:
    """Fetch, segment, and return (glb_bytes, manifest). Runs in a thread."""
    import segment_core as seg

    data, suffix = _fetch_mesh(mesh_url)
    mesh = seg.load_concatenated(data, suffix)
    result = seg.segment(
        mesh,
        method=method,
        max_parts=max_parts,
        min_part_faces=min_part_faces,
        crease_angle_deg=crease_angle,
    )

    parts = result.parts
    if only_part:
        wanted = only_part.strip().lower()
        match = next(
            (
                p
                for p in parts
                if f"part_{p.index:02d}" == wanted or p.name.lower() == wanted
            ),
            None,
        )
        if match is None:
            available = ", ".join(f"part_{p.index:02d} ({p.name})" for p in parts)
            raise ValueError(f"part '{only_part}' not found. Available: {available}")
        parts = [match]

    scene = seg.build_scene(parts)
    glb_bytes = scene.export(file_type="glb")

    manifest = seg.manifest(result)
    if only_part:
        manifest["parts"] = [p.manifest() for p in parts]
        manifest["part_count"] = len(parts)
        manifest["only_part"] = f"part_{parts[0].index:02d}"
        # The cap/merge warning describes the full run, not this single-part
        # export — drop it so the response isn't misleading.
        manifest["warnings"] = []

    return glb_bytes, manifest


async def _process(
    task_id: str,
    mesh_url: str,
    method: str,
    max_parts: int,
    min_part_faces: int,
    crease_angle: float,
    only_part: Optional[str],
) -> None:
    async with _sem:
        _tasks[task_id]["status"] = "running"
        loop = asyncio.get_event_loop()
        t0 = time.time()
        try:
            glb_bytes, manifest = await loop.run_in_executor(
                None,
                _run_segmentation,
                mesh_url,
                method,
                max_parts,
                min_part_faces,
                crease_angle,
                only_part,
            )

            glb_name = f"segment/{task_id}.glb"
            manifest_name = f"segment/{task_id}.parts.json"

            glb_blob = _bucket.blob(glb_name)
            manifest_blob = _bucket.blob(manifest_name)
            await loop.run_in_executor(
                None,
                lambda: glb_blob.upload_from_string(
                    glb_bytes, content_type="model/gltf-binary"
                ),
            )
            await loop.run_in_executor(
                None,
                lambda: manifest_blob.upload_from_string(
                    json.dumps(manifest), content_type="application/json"
                ),
            )

            result_url = f"https://storage.googleapis.com/{GCS_BUCKET}/{glb_name}"
            manifest_url = f"https://storage.googleapis.com/{GCS_BUCKET}/{manifest_name}"

            elapsed = time.time() - t0
            _tasks[task_id].update({
                "status": "done",
                "result_url": result_url,
                "manifest_url": manifest_url,
                "parts": manifest["parts"],
                "part_count": manifest["part_count"],
                "source_faces": manifest["source_faces"],
                "method": manifest["method"],
                "warnings": manifest.get("warnings", []),
                "bytes": len(glb_bytes),
                "elapsed_ms": int(elapsed * 1000),
            })
            log.info(
                "[%s] done in %.2fs — %d parts, %d bytes → %s",
                task_id, elapsed, manifest["part_count"], len(glb_bytes), result_url,
            )

        except Exception as exc:
            _tasks[task_id].update({
                "status": "failed",
                "error": safe_error(exc, context=f"[{task_id}] segment"),
                "elapsed_ms": int((time.time() - t0) * 1000),
            })


class SegmentRequest(BaseModel):
    mesh: str = Field(..., description="https URL to input mesh (GLB/OBJ/FBX/STL/PLY)")
    method: str = Field(default="auto", description="auto|connected|crease")
    max_parts: int = Field(default=24, ge=2, le=64)
    min_part_faces: int = Field(default=64, ge=4, le=100_000)
    crease_angle: float = Field(default=40.0, ge=5.0, le=170.0)
    only_part: Optional[str] = Field(default=None, max_length=64)

    @field_validator("method")
    @classmethod
    def validate_method(cls, v: str) -> str:
        v = v.lower().strip()
        if v not in VALID_METHODS:
            raise ValueError(f"method must be one of {sorted(VALID_METHODS)}")
        return v


@app.post("/segment", status_code=202)
async def segment_mesh(
    body: SegmentRequest,
    background_tasks: BackgroundTasks,
    authorization: str = Header(...),
) -> dict:
    _require_api_key(authorization)
    task_id = str(uuid.uuid4())
    _tasks[task_id] = {
        "task_id": task_id,
        "status": "queued",
        "method": body.method,
    }
    background_tasks.add_task(
        _process,
        task_id,
        body.mesh,
        body.method,
        body.max_parts,
        body.min_part_faces,
        body.crease_angle,
        body.only_part,
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
    return {"ok": True, "service": "segment"}
