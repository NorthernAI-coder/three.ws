"""
UniRig auto-rigging service — adds skeleton, skinning weights, and ARKit-52
blendshapes to raw meshes from the 3D generation models.

VAST-AI-Research/UniRig (MIT, SIGGRAPH 2025) predicts:
  - Skeleton joint placement (humanoid hierarchy)
  - Per-vertex skinning weights
  - Blendshape transfer from a template head mesh

API contract (consumed by the Pipeline Controller):
  POST /rig   { mesh_gcs_url: str, template?: str, blendshapes?: bool, job_id?: str }
           →  202 { task_id, status: "queued" }

  GET  /tasks/:id → { task_id, status, rigged_gcs_url?, error? }

  GET  /health    → { ok, model, gpu_available }

Model weights pre-population:
  pip install huggingface_hub
  huggingface-cli download VAST-AI/UniRig --local-dir /tmp/unirig
  gsutil -m cp -r /tmp/unirig gs://three-ws-model-weights/unirig/

Environment variables:
  API_KEY           — shared bearer secret
  GCS_BUCKET        — Cloud Storage bucket for output rigged GLBs
  WEIGHTS_DIR       — local path to UniRig model weights (default: /weights/unirig)
  TEMPLATES_DIR     — local path to skeleton/blendshape templates (default: /app/templates)
  MAX_CONCURRENT    — max parallel rigging jobs (default: 1)
"""

from __future__ import annotations

import asyncio
import io
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from typing import Optional

import torch
import trimesh
from fastapi import FastAPI, HTTPException, Header, BackgroundTasks
from google.cloud import storage
from pydantic import BaseModel, Field

from rig_glb import build_rigged_glb
from worker_security import (
    UnsafeUrlError,
    fetch_remote_bytes_async,
    require_api_key,
    safe_error,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("unirig")

API_KEY = os.environ["API_KEY"]
GCS_BUCKET = os.environ["GCS_BUCKET"]
WEIGHTS_DIR = os.environ.get("WEIGHTS_DIR", "/weights/unirig")
TEMPLATES_DIR = os.environ.get("TEMPLATES_DIR", "/app/templates")
MAX_CONCURRENT = int(os.environ.get("MAX_CONCURRENT", "1"))

_model = None
_bucket: Optional[storage.Bucket] = None
_sem: Optional[asyncio.Semaphore] = None
_tasks: dict[str, dict] = {}


def _load_model():
    global _model
    from unirig import UniRigModel

    log.info("Loading UniRig model from %s", WEIGHTS_DIR)
    _model = UniRigModel.from_pretrained(WEIGHTS_DIR)
    _model = _model.to("cuda")
    _model.eval()
    log.info("UniRig model loaded")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _bucket, _sem
    _bucket = storage.Client().bucket(GCS_BUCKET)
    _sem = asyncio.Semaphore(MAX_CONCURRENT)
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _load_model)
    log.info("Service ready — max_concurrent=%d", MAX_CONCURRENT)
    yield


app = FastAPI(title="unirig", lifespan=lifespan)


def _require_api_key(authorization: str) -> None:
    try:
        require_api_key(authorization, API_KEY)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc



async def _run_rigging(
    task_id: str,
    mesh_gcs_url: str,
    template: str,
    blendshapes: bool,
) -> None:
    async with _sem:
        _tasks[task_id]["status"] = "running"
        loop = asyncio.get_event_loop()
        t0 = time.time()
        try:
            # Download the raw mesh from GCS. SSRF-hardened: https-only,
            # private/loopback/link-local/metadata IPs rejected after DNS
            # resolution, redirects re-validated per hop, response size bounded.
            import httpx
            async with httpx.AsyncClient(timeout=60, follow_redirects=False) as client:
                try:
                    mesh_bytes = await fetch_remote_bytes_async(client, mesh_gcs_url)
                except UnsafeUrlError as exc:
                    raise RuntimeError(f"refused to fetch mesh url: {exc}") from exc

            def _rig():
                mesh = trimesh.load(io.BytesIO(mesh_bytes), file_type="glb", force="mesh")

                with torch.no_grad():
                    result = _model.rig(
                        vertices=torch.tensor(mesh.vertices, dtype=torch.float32, device="cuda"),
                        faces=torch.tensor(mesh.faces, dtype=torch.long, device="cuda"),
                    )

                skeleton = result["skeleton"]
                skinning_weights = result["skinning_weights"]

                joints = skeleton["joints"].cpu().numpy()
                parents = skeleton["parents"].cpu().numpy()
                weights = skinning_weights.cpu().numpy()

                blendshape_data = result.get("blendshapes") if blendshapes else None
                return build_rigged_glb(
                    mesh_bytes, mesh, joints, parents, weights, blendshape_data,
                )

            rigged_bytes = await loop.run_in_executor(None, _rig)

            blob_name = f"rigged-meshes/{task_id}.glb"
            blob = _bucket.blob(blob_name)
            await loop.run_in_executor(
                None,
                lambda: blob.upload_from_string(rigged_bytes, content_type="model/gltf-binary"),
            )
            gcs_url = f"https://storage.googleapis.com/{GCS_BUCKET}/{blob_name}"

            elapsed = time.time() - t0
            _tasks[task_id].update({
                "status": "done",
                "rigged_gcs_url": gcs_url,
                "elapsed_ms": int(elapsed * 1000),
            })
            log.info("[%s] rigging done in %.1fs — %d bytes → %s", task_id, elapsed, len(rigged_bytes), gcs_url)

        except Exception as exc:
            _tasks[task_id].update({
                "status": "failed",
                "error": safe_error(exc, context=f"[{task_id}] rigging"),
                "elapsed_ms": int((time.time() - t0) * 1000),
            })



class RigRequest(BaseModel):
    mesh_gcs_url: str
    template: str = "wolf3d_neutral"
    blendshapes: bool = True
    job_id: str | None = None


@app.post("/rig", status_code=202)
async def rig(
    body: RigRequest,
    background_tasks: BackgroundTasks,
    authorization: str = Header(...),
) -> dict:
    _require_api_key(authorization)
    task_id = str(uuid.uuid4())
    _tasks[task_id] = {"task_id": task_id, "status": "queued"}
    background_tasks.add_task(
        _run_rigging, task_id, body.mesh_gcs_url, body.template, body.blendshapes,
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
    return {
        "ok": True,
        "model": "unirig",
        "gpu_available": torch.cuda.is_available(),
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "model_loaded": _model is not None,
    }
