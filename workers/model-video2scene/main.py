"""
model-video2scene — streaming video → 3D point-cloud reconstruction.

Wraps LingBot-Map (Apache-2.0, github.com/Robbyant/lingbot-map), a feed-forward
"Geometric Context Transformer" that reconstructs a dense world-space point cloud
from a monocular video or image sequence. We run the model's documented inference
path, fuse the per-frame world points + RGB into a single coloured point cloud,
write a binary little-endian PLY, and upload it to Cloud Storage. The three.ws
Scene Capture page renders that PLY directly with a WebGL point-cloud viewer.

API contract (mirrors the other three.ws model workers — triposr, hunyuan3d):
  POST /infer
    {
      video_url?:        https URL to an .mp4/.mov/.webm        (one of video_url
      images?:           [https url | data-uri, ...],           or images required)
      mode?:             "streaming" | "windowed"   (default streaming)
      fps?:              int,   frames/sec to sample from video (default 8)
      keyframe_interval? int,   cache every N-th frame          (default 4)
      num_scale_frames?  int,   bidirectional scale frames      (default 8)
      window_size?:      int,   windowed mode window            (default 128)
      overlap_size?:     int,   windowed mode overlap           (default 16)
      mask_sky?:         bool,  drop sky points                 (default true)
      conf_percentile?:  0..95, drop low-confidence points      (default 30)
      max_points?:       int,   downsample budget               (default 1_500_000)
      job_id?:           str    caller correlation id
    }
    → 202 { task_id, status: "queued" }

  GET  /tasks/:id → { task_id, status, result_gcs_url?, num_points?, frames?, error? }
  GET  /health    → { ok, model, gpu_available, model_loaded }

Model weights are mounted read-only from the shared weights bucket at
  WEIGHTS_DIR/lingbot-map-long.pt
(see cloudbuild.yaml --add-volume). Pre-populate once with:
  huggingface-cli download robbyant/lingbot-map-long --local-dir /tmp/lm
  gsutil -m cp -r /tmp/lm/* gs://three-ws-model-weights/lingbot-map/

Environment variables:
  API_KEY         — shared bearer secret (Cloud Run secret)
  GCS_BUCKET      — Cloud Storage bucket for output point clouds
  WEIGHTS_DIR     — local mount of model weights (default /weights/lingbot-map)
  MODEL_FILE      — checkpoint filename (default lingbot-map-long.pt)
  LINGBOT_DIR     — repo checkout on PYTHONPATH (default /opt/lingbot-map)
  MAX_CONCURRENT  — max parallel reconstructions (default 1 — heavy, long jobs)
"""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import struct
import tempfile
import time
import uuid
from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import Optional

import numpy as np
import torch
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from google.cloud import storage
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
log = logging.getLogger("video2scene")

API_KEY = os.environ["API_KEY"]
GCS_BUCKET = os.environ["GCS_BUCKET"]
WEIGHTS_DIR = os.environ.get("WEIGHTS_DIR", "/weights/lingbot-map")
MODEL_FILE = os.environ.get("MODEL_FILE", "lingbot-map-long.pt")
LINGBOT_DIR = os.environ.get("LINGBOT_DIR", "/opt/lingbot-map")
MAX_CONCURRENT = int(os.environ.get("MAX_CONCURRENT", "1"))

# Hard ceilings so a caller can't ask for an unbounded job.
MAX_FRAMES = 4000
MAX_POINT_BUDGET = 4_000_000

_model = None
_bucket: Optional[storage.Bucket] = None
_sem: Optional[asyncio.Semaphore] = None
_tasks: dict[str, dict] = {}
_device = "cuda" if torch.cuda.is_available() else "cpu"


# ── model loading ─────────────────────────────────────────────────────────────


def _default_args() -> SimpleNamespace:
    """The CLI arg surface LingBot-Map's demo.load_model() reads from.

    demo.load_model(args, device) reconstructs GCTStream and loads the checkpoint
    from args.model_path. We feed it the same namespace the CLI would build so the
    sanctioned loader (which reads model config out of the checkpoint) stays the
    single source of truth — no hand-reconstructed constructor args to drift.
    """
    return SimpleNamespace(
        model_path=os.path.join(WEIGHTS_DIR, MODEL_FILE),
        mode="streaming",
        num_scale_frames=8,
        keyframe_interval=4,
        window_size=128,
        overlap_size=16,
        overlap_keyframes=16,
        camera_num_iterations=4,
        downsample_factor=1,
        mask_sky=True,
        offload_to_cpu=False,
    )


def _load_model():
    global _model
    import sys

    if LINGBOT_DIR not in sys.path:
        sys.path.insert(0, LINGBOT_DIR)
    # demo.py is the repo's own entrypoint; load_model() is the documented,
    # checkpoint-config-driven constructor used by demo.py and demo_render.
    from demo import load_model

    ckpt = os.path.join(WEIGHTS_DIR, MODEL_FILE)
    if not os.path.exists(ckpt):
        raise FileNotFoundError(f"checkpoint not found: {ckpt}")
    log.info("Loading LingBot-Map checkpoint %s on %s", ckpt, _device)
    _model = load_model(_default_args(), torch.device(_device))
    _model.eval()
    log.info("LingBot-Map model loaded")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _bucket, _sem
    _bucket = storage.Client().bucket(GCS_BUCKET)
    _sem = asyncio.Semaphore(MAX_CONCURRENT)
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _load_model)
    log.info("Service ready — max_concurrent=%d device=%s", MAX_CONCURRENT, _device)
    yield


app = FastAPI(title="model-video2scene", lifespan=lifespan)


def _require_api_key(authorization: str) -> None:
    try:
        require_api_key(authorization, API_KEY)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


# ── input acquisition ─────────────────────────────────────────────────────────


def _fetch_video(video_url: str, dst_dir: str) -> str:
    try:
        data = fetch_remote_bytes(video_url, timeout=120, max_bytes=512 * 1024 * 1024)
    except UnsafeUrlError as exc:
        raise ValueError(f"refused to fetch video source: {exc}") from exc
    ext = os.path.splitext(video_url.split("?", 1)[0])[1].lower()
    if ext not in (".mp4", ".mov", ".webm", ".mkv", ".avi"):
        ext = ".mp4"
    path = os.path.join(dst_dir, f"input{ext}")
    with open(path, "wb") as fh:
        fh.write(data)
    return path


def _materialize_images(images: list[str], dst_dir: str) -> str:
    """Write caller-supplied frames to a folder LingBot-Map's loader can read."""
    folder = os.path.join(dst_dir, "frames")
    os.makedirs(folder, exist_ok=True)
    for i, src in enumerate(images[:MAX_FRAMES]):
        if src.startswith("data:image"):
            payload = base64.b64decode(src.split(",", 1)[1])
        elif src.startswith("https://"):
            try:
                payload = fetch_remote_bytes(src, timeout=30)
            except UnsafeUrlError as exc:
                raise ValueError(f"refused to fetch frame {i}: {exc}") from exc
        else:
            raise ValueError(f"unsupported image source at {i}: {src[:48]}")
        with open(os.path.join(folder, f"{i:06d}.jpg"), "wb") as fh:
            fh.write(payload)
    return folder


# ── point-cloud fusion + PLY export ───────────────────────────────────────────


def _to_np(x) -> np.ndarray:
    if isinstance(x, torch.Tensor):
        return x.detach().to("cpu").float().numpy()
    return np.asarray(x)


def _voxel_downsample(
    pts: np.ndarray, cols: np.ndarray, voxel: float
) -> tuple[np.ndarray, np.ndarray]:
    """Merge points sharing a voxel cell into one averaged, colour-averaged point.

    Far higher quality than blind stride subsampling: it removes the redundant
    overlap where many frames re-observe the same surface, evens out density, and
    suppresses single-frame noise — while preserving the true shape. Deterministic
    (no RNG). ``voxel`` is the cell edge length in world units.
    """
    if voxel <= 0 or pts.shape[0] == 0:
        return pts, cols
    keys = np.floor(pts / voxel).astype(np.int64)
    # Order points by voxel cell, then reduce each contiguous run to its mean.
    order = np.lexsort((keys[:, 2], keys[:, 1], keys[:, 0]))
    keys, pts, cols = keys[order], pts[order], cols[order]
    boundaries = np.any(np.diff(keys, axis=0) != 0, axis=1)
    starts = np.concatenate(([0], np.nonzero(boundaries)[0] + 1))
    ends = np.concatenate((starts[1:], [pts.shape[0]]))
    out_pts = np.empty((starts.shape[0], 3), dtype=np.float32)
    out_cols = np.empty((starts.shape[0], 3), dtype=np.uint8)
    colf = cols.astype(np.float32)
    for i, (s, e) in enumerate(zip(starts, ends)):
        out_pts[i] = pts[s:e].mean(axis=0)
        out_cols[i] = np.clip(colf[s:e].mean(axis=0), 0, 255).astype(np.uint8)
    return out_pts, out_cols


def _fuse_point_cloud(
    predictions: dict,
    conf_percentile: float,
    max_points: int,
    voxel_size: float = 0.0,
) -> tuple[np.ndarray, np.ndarray]:
    """Flatten per-frame world points + RGB into one coloured cloud.

    LingBot-Map returns world_points (..., 3) in a shared world frame, an aligned
    world_points_conf, and the source images. We drop the low-confidence tail,
    colour each surviving point from its pixel, optionally voxel-downsample to
    de-duplicate overlapping observations, and cap the total at max_points.
    """
    pts = _to_np(predictions["world_points"]).reshape(-1, 3)

    imgs = _to_np(predictions["images"])
    # Images may arrive as (..., 3) HWC or (..., 3, H, W) CHW. Normalize to (-1, 3).
    if imgs.shape[-1] == 3:
        cols = imgs.reshape(-1, 3)
    elif imgs.ndim >= 3 and imgs.shape[-3] == 3:
        cols = np.moveaxis(imgs, -3, -1).reshape(-1, 3)
    else:
        cols = imgs.reshape(-1, 3)
    if cols.shape[0] != pts.shape[0]:
        # Defensive: fall back to a neutral grey if the loader changed layout.
        cols = np.full((pts.shape[0], 3), 0.7, dtype=np.float32)
    if cols.max() <= 1.0 + 1e-6:
        cols = cols * 255.0
    cols = np.clip(cols, 0, 255).astype(np.uint8)

    conf = predictions.get("world_points_conf")
    mask = np.isfinite(pts).all(axis=1)
    if conf is not None:
        conf = _to_np(conf).reshape(-1)
        if conf.shape[0] == pts.shape[0] and conf_percentile > 0:
            thresh = np.percentile(conf[np.isfinite(conf)], conf_percentile)
            mask &= conf >= thresh
    pts, cols = pts[mask], cols[mask]

    # Voxel-merge overlapping observations first (quality), then hard-cap.
    if voxel_size > 0:
        pts, cols = _voxel_downsample(pts.astype(np.float32), cols, voxel_size)

    if pts.shape[0] > max_points:
        # Deterministic stride subsample — preserves spatial spread without RNG.
        idx = np.linspace(0, pts.shape[0] - 1, max_points).astype(np.int64)
        pts, cols = pts[idx], cols[idx]

    return pts.astype(np.float32), cols


def _write_ply(points: np.ndarray, colors: np.ndarray) -> bytes:
    """Binary little-endian PLY: x y z float + red green blue uchar."""
    n = points.shape[0]
    header = (
        "ply\n"
        "format binary_little_endian 1.0\n"
        f"comment generated by three.ws model-video2scene (LingBot-Map)\n"
        f"element vertex {n}\n"
        "property float x\nproperty float y\nproperty float z\n"
        "property uchar red\nproperty uchar green\nproperty uchar blue\n"
        "end_header\n"
    ).encode("ascii")
    # Interleave xyz(f32) + rgb(u8) into a packed structured buffer.
    body = np.empty(n, dtype=[("xyz", "<f4", 3), ("rgb", "u1", 3)])
    body["xyz"] = points
    body["rgb"] = colors
    return header + body.tobytes()


# ── inference ─────────────────────────────────────────────────────────────────


def _run(req: "InferRequest", dst_dir: str) -> tuple[bytes, int, int]:
    import sys

    if LINGBOT_DIR not in sys.path:
        sys.path.insert(0, LINGBOT_DIR)
    from demo import load_images, postprocess

    if req.video_url:
        video_path = _fetch_video(req.video_url, dst_dir)
        images = load_images(video_path=video_path, fps=req.fps)
    else:
        folder = _materialize_images(req.images or [], dst_dir)
        images = load_images(image_folder=folder)

    frames = int(images.shape[0]) if hasattr(images, "shape") else len(images)
    if frames == 0:
        raise ValueError("no frames decoded from input")

    images = images.to(_device)
    with torch.no_grad():
        if req.mode == "windowed":
            predictions = _model.inference_windowed(
                images,
                window_size=req.window_size,
                overlap_size=req.overlap_size,
                num_scale_frames=req.num_scale_frames,
                keyframe_interval=req.keyframe_interval,
                output_device=torch.device("cpu"),
            )
        else:
            predictions = _model.inference_streaming(
                images,
                num_scale_frames=req.num_scale_frames,
                keyframe_interval=req.keyframe_interval,
                output_device=torch.device("cpu"),
            )
    predictions, _ = postprocess(predictions, images.to("cpu"))

    pts, cols = _fuse_point_cloud(
        predictions, req.conf_percentile, req.max_points, req.voxel_size
    )
    if pts.shape[0] == 0:
        raise ValueError("reconstruction produced no points above the confidence floor")
    return _write_ply(pts, cols), pts.shape[0], frames


async def _run_inference(task_id: str, req: "InferRequest") -> None:
    async with _sem:
        _tasks[task_id]["status"] = "running"
        loop = asyncio.get_event_loop()
        t0 = time.time()
        try:
            with tempfile.TemporaryDirectory() as dst_dir:
                ply_bytes, num_points, frames = await loop.run_in_executor(
                    None, _run, req, dst_dir
                )

            blob_name = f"scenes/video2scene/{task_id}.ply"
            blob = _bucket.blob(blob_name)
            await loop.run_in_executor(
                None,
                lambda: blob.upload_from_string(
                    ply_bytes, content_type="application/octet-stream"
                ),
            )
            gcs_url = f"https://storage.googleapis.com/{GCS_BUCKET}/{blob_name}"

            elapsed = time.time() - t0
            _tasks[task_id].update(
                {
                    "status": "done",
                    "result_gcs_url": gcs_url,
                    "num_points": num_points,
                    "frames": frames,
                    "bytes": len(ply_bytes),
                    "elapsed_ms": int(elapsed * 1000),
                }
            )
            log.info(
                "[%s] done in %.1fs — %d frames → %d points (%d bytes) → %s",
                task_id, elapsed, frames, num_points, len(ply_bytes), gcs_url,
            )
        except Exception as exc:  # noqa: BLE001 — surfaced opaquely below
            _tasks[task_id].update(
                {
                    "status": "failed",
                    "error": safe_error(exc, context=f"[{task_id}] reconstruction"),
                    "elapsed_ms": int((time.time() - t0) * 1000),
                }
            )


# ── API ───────────────────────────────────────────────────────────────────────


class InferRequest(BaseModel):
    video_url: str | None = None
    images: list[str] | None = Field(default=None, max_length=MAX_FRAMES)
    mode: str = "streaming"
    fps: int = Field(default=8, ge=1, le=30)
    keyframe_interval: int = Field(default=4, ge=1, le=64)
    num_scale_frames: int = Field(default=8, ge=2, le=16)
    window_size: int = Field(default=128, ge=16, le=512)
    overlap_size: int = Field(default=16, ge=0, le=128)
    mask_sky: bool = True
    conf_percentile: float = Field(default=30.0, ge=0.0, le=95.0)
    max_points: int = Field(default=1_500_000, ge=10_000, le=MAX_POINT_BUDGET)
    voxel_size: float = Field(default=0.0, ge=0.0, le=10.0)
    job_id: str | None = None


@app.post("/infer", status_code=202)
async def infer(
    body: InferRequest,
    background_tasks: BackgroundTasks,
    authorization: str = Header(...),
) -> dict:
    _require_api_key(authorization)
    if not body.video_url and not (body.images and len(body.images) > 0):
        raise HTTPException(status_code=400, detail="provide video_url or images[]")
    if body.mode not in ("streaming", "windowed"):
        raise HTTPException(status_code=400, detail="mode must be streaming or windowed")
    task_id = str(uuid.uuid4())
    _tasks[task_id] = {"task_id": task_id, "status": "queued", "model": "video2scene"}
    background_tasks.add_task(_run_inference, task_id, body)
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
        "model": "video2scene",
        "gpu_available": torch.cuda.is_available(),
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "model_loaded": _model is not None,
    }
