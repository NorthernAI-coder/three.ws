"""
Background removal service — strips backgrounds from images using BRIA RMBG-2.0
(Apache-2.0) with rembg's U2Net as a fast CPU fallback.

API contract:
  POST /remove   { image: data-uri|url, model?: "rmbg2"|"u2net"|"isnet" }
              →  202 { task_id, status: "queued" }

  GET  /tasks/:id → { task_id, status, result_url?, error? }

  GET  /health    → { ok, model, gpu_available }

No GPU required — BRIA RMBG-2.0 runs on CPU in <2s per 1024px image.
GPU accelerates to ~0.2s.

Environment variables:
  API_KEY     — shared bearer secret (required)
  GCS_BUCKET  — Cloud Storage bucket for output PNGs (required)
  MODEL       — default model: "rmbg2" | "u2net" | "isnet" (default: rmbg2)
"""

from __future__ import annotations

import asyncio
import base64
import io
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from typing import Optional

import torch
from fastapi import FastAPI, HTTPException, Header, BackgroundTasks
from google.cloud import storage
from PIL import Image
from pydantic import BaseModel, Field

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
log = logging.getLogger("rembg")

API_KEY = os.environ["API_KEY"]
GCS_BUCKET = os.environ["GCS_BUCKET"]
DEFAULT_MODEL = os.environ.get("MODEL", "rmbg2")
MAX_CONCURRENT = int(os.environ.get("MAX_CONCURRENT", "4"))

_sessions: dict[str, object] = {}
_bucket: Optional[storage.Bucket] = None
_sem: Optional[asyncio.Semaphore] = None
_tasks: dict[str, dict] = {}

SUPPORTED_MODELS = ("rmbg2", "u2net", "isnet", "u2net_human_seg", "silueta")


def _load_sessions() -> None:
    import rembg
    for model_name in SUPPORTED_MODELS:
        try:
            _sessions[model_name] = rembg.new_session(model_name)
            log.info("Loaded rembg session: %s", model_name)
        except Exception as exc:
            log.warning("Could not load rembg session %s: %s", model_name, exc)
    if not _sessions:
        raise RuntimeError("No rembg models could be loaded")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _bucket, _sem
    _bucket = storage.Client().bucket(GCS_BUCKET)
    _sem = asyncio.Semaphore(MAX_CONCURRENT)
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _load_sessions)
    log.info("rembg service ready — models: %s", list(_sessions))
    yield


app = FastAPI(title="rembg-service", lifespan=lifespan)


def _require_api_key(authorization: str) -> None:
    try:
        require_api_key(authorization, API_KEY)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


def _decode_image(src: str) -> Image.Image:
    if src.startswith("data:image"):
        b64 = src.split(",", 1)[1]
        return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGBA")
    if src.startswith("https://"):
        try:
            data = fetch_remote_bytes(src, timeout=30, max_bytes=16 * 1024 * 1024)
        except UnsafeUrlError as exc:
            raise ValueError(f"refused to fetch image: {exc}") from exc
        return Image.open(io.BytesIO(data)).convert("RGBA")
    raise ValueError(f"unsupported image source format: {src[:60]}")


def _run_removal(img: Image.Image, model_name: str) -> Image.Image:
    import rembg
    session = _sessions.get(model_name) or _sessions.get(DEFAULT_MODEL) or next(iter(_sessions.values()))
    buf_in = io.BytesIO()
    img.save(buf_in, format="PNG")
    result_bytes = rembg.remove(buf_in.getvalue(), session=session)
    return Image.open(io.BytesIO(result_bytes)).convert("RGBA")


async def _process(task_id: str, image_src: str, model_name: str) -> None:
    async with _sem:
        _tasks[task_id]["status"] = "running"
        loop = asyncio.get_event_loop()
        t0 = time.time()
        try:
            img = await loop.run_in_executor(None, _decode_image, image_src)
            result = await loop.run_in_executor(None, _run_removal, img, model_name)

            buf = io.BytesIO()
            result.save(buf, format="PNG", optimize=True)
            png_bytes = buf.getvalue()

            blob_name = f"rembg/{task_id}.png"
            blob = _bucket.blob(blob_name)
            await loop.run_in_executor(
                None,
                lambda: blob.upload_from_string(png_bytes, content_type="image/png"),
            )
            result_url = f"https://storage.googleapis.com/{GCS_BUCKET}/{blob_name}"

            elapsed = time.time() - t0
            _tasks[task_id].update({
                "status": "done",
                "result_url": result_url,
                "width": result.width,
                "height": result.height,
                "elapsed_ms": int(elapsed * 1000),
            })
            log.info("[%s] done in %.2fs — %d bytes", task_id, elapsed, len(png_bytes))

        except Exception as exc:
            _tasks[task_id].update({
                "status": "failed",
                "error": safe_error(exc, context=f"[{task_id}] rembg"),
                "elapsed_ms": int((time.time() - t0) * 1000),
            })


class RemoveRequest(BaseModel):
    image: str = Field(..., description="data-uri or https URL of the source image")
    model: str = Field(default="rmbg2", description="rembg model name")


@app.post("/remove", status_code=202)
async def remove_background(
    body: RemoveRequest,
    background_tasks: BackgroundTasks,
    authorization: str = Header(...),
) -> dict:
    _require_api_key(authorization)
    model_name = body.model if body.model in SUPPORTED_MODELS else DEFAULT_MODEL
    task_id = str(uuid.uuid4())
    _tasks[task_id] = {
        "task_id": task_id,
        "status": "queued",
        "model": model_name,
    }
    background_tasks.add_task(_process, task_id, body.image, model_name)
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
        "service": "rembg",
        "gpu_available": torch.cuda.is_available(),
        "models_loaded": list(_sessions),
        "default_model": DEFAULT_MODEL,
    }
