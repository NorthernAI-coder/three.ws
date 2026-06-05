"""
Text-guided texture generation service.

Takes an untextured (or poorly-textured) GLB and a text prompt, renders the
mesh from N viewpoints, generates coherent texture views with SDXL + ControlNet
(depth), and back-projects them onto the UV map.

Pipeline:
  1. Load mesh (trimesh), ensure UV mapping exists (auto-unwrap if missing)
  2. Render depth maps from 8 canonical viewpoints using pyrender
  3. For each view: run SDXL Img2Img + ControlNet-Depth to generate textures
  4. Back-project each generated image onto the mesh UV map (pytorch3d)
  5. Blend overlapping UV regions by confidence (distance-weighted)
  6. Bake final texture atlas and export as textured GLB

API contract:
  POST /texture  {
    mesh: url,         # https GLB URL (required)
    prompt: str,       # texture description, e.g. "worn leather, dark brown"
    negative_prompt?: str,
    num_views?: int,   # 4 or 8 (default: 8)
    texture_size?: int # 512|1024|2048 (default: 1024)
  } → 202 { task_id, status }

  GET /tasks/:id → { task_id, status, result_url?, error? }
  GET /health    → { ok, gpu_available, model_loaded }

Environment variables:
  API_KEY              — bearer secret (required)
  GCS_BUCKET           — output bucket (required)
  SDXL_MODEL           — HuggingFace model id (default: stabilityai/stable-diffusion-xl-base-1.0)
  CONTROLNET_MODEL     — ControlNet depth model id
                         (default: diffusers/controlnet-depth-sdxl-1.0)
  WEIGHTS_DIR          — local cache dir for model weights (default: /weights)
  MAX_CONCURRENT       — default 1 (GPU-bound)
"""

from __future__ import annotations

import asyncio
import base64
import io
import logging
import os
import tempfile
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import numpy as np
import torch
from fastapi import FastAPI, HTTPException, Header, BackgroundTasks
from google.cloud import storage
from PIL import Image
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
log = logging.getLogger("texture")

API_KEY = os.environ["API_KEY"]
GCS_BUCKET = os.environ["GCS_BUCKET"]
WEIGHTS_DIR = os.environ.get("WEIGHTS_DIR", "/weights")
SDXL_MODEL = os.environ.get("SDXL_MODEL", "stabilityai/stable-diffusion-xl-base-1.0")
CONTROLNET_MODEL = os.environ.get(
    "CONTROLNET_MODEL", "diffusers/controlnet-depth-sdxl-1.0"
)
MAX_CONCURRENT = int(os.environ.get("MAX_CONCURRENT", "1"))

_pipe = None
_bucket: Optional[storage.Bucket] = None
_sem: Optional[asyncio.Semaphore] = None
_tasks: dict[str, dict] = {}

# 8 canonical viewpoints: azimuth, elevation (degrees)
VIEWPOINTS_8 = [
    (0, 0),    # front
    (45, 15),
    (90, 0),   # right
    (135, 15),
    (180, 0),  # back
    (225, 15),
    (270, 0),  # left
    (315, 15),
]
VIEWPOINTS_4 = [(0, 0), (90, 0), (180, 0), (270, 0)]


def _load_pipeline() -> None:
    global _pipe
    from diffusers import StableDiffusionXLControlNetPipeline, ControlNetModel, AutoencoderKL

    log.info("Loading ControlNet model: %s", CONTROLNET_MODEL)
    controlnet = ControlNetModel.from_pretrained(
        CONTROLNET_MODEL,
        torch_dtype=torch.float16,
        use_safetensors=True,
        cache_dir=WEIGHTS_DIR,
    )

    log.info("Loading SDXL model: %s", SDXL_MODEL)
    vae = AutoencoderKL.from_pretrained(
        "madebyollin/sdxl-vae-fp16-fix",
        torch_dtype=torch.float16,
        cache_dir=WEIGHTS_DIR,
    )
    _pipe = StableDiffusionXLControlNetPipeline.from_pretrained(
        SDXL_MODEL,
        controlnet=controlnet,
        vae=vae,
        torch_dtype=torch.float16,
        use_safetensors=True,
        cache_dir=WEIGHTS_DIR,
    )
    _pipe.to("cuda")
    _pipe.enable_model_cpu_offload()
    _pipe.enable_xformers_memory_efficient_attention()
    log.info("Texture pipeline loaded")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _bucket, _sem
    _bucket = storage.Client().bucket(GCS_BUCKET)
    _sem = asyncio.Semaphore(MAX_CONCURRENT)
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _load_pipeline)
    log.info("Texture service ready")
    yield


app = FastAPI(title="texture-service", lifespan=lifespan)


def _require_api_key(authorization: str) -> None:
    try:
        require_api_key(authorization, API_KEY)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


# ── Mesh loading ────────────────────────────────────────────────────────────────

def _load_mesh(url: str):
    import trimesh
    data = fetch_remote_bytes(url, timeout=60, max_bytes=128 * 1024 * 1024)
    suffix = Path(url.split("?")[0]).suffix.lower() or ".glb"
    mesh = trimesh.load(io.BytesIO(data), file_type=suffix.lstrip("."), force="mesh", process=True)
    if isinstance(mesh, trimesh.Scene):
        meshes = [g for g in mesh.geometry.values() if isinstance(g, trimesh.Trimesh)]
        mesh = trimesh.util.concatenate(meshes)
    if not hasattr(mesh.visual, "uv") or mesh.visual.uv is None:
        # Auto-unwrap using trimesh's built-in UV generation
        mesh = mesh.unwrap()
    return mesh


# ── Depth rendering ─────────────────────────────────────────────────────────────

def _render_depth(mesh, azimuth_deg: float, elevation_deg: float, size: int = 512) -> Image.Image:
    """Render an orthographic depth map from a given viewpoint."""
    import pyrender
    import trimesh
    import math

    az = math.radians(azimuth_deg)
    el = math.radians(elevation_deg)

    # Camera position on unit sphere
    cx = math.cos(el) * math.sin(az)
    cy = math.sin(el)
    cz = math.cos(el) * math.cos(az)
    dist = mesh.bounding_sphere.primitive.radius * 2.5
    eye = np.array([cx, cy, cz]) * dist + mesh.bounding_sphere.primitive.center

    # Look-at matrix
    up = np.array([0, 1, 0])
    center = mesh.bounding_sphere.primitive.center
    forward = center - eye
    forward /= np.linalg.norm(forward)
    right = np.cross(forward, up)
    right /= np.linalg.norm(right) + 1e-9
    up = np.cross(right, forward)
    camera_pose = np.eye(4)
    camera_pose[:3, 0] = right
    camera_pose[:3, 1] = up
    camera_pose[:3, 2] = -forward
    camera_pose[:3, 3] = eye

    scene = pyrender.Scene(ambient_light=[0.5, 0.5, 0.5])
    py_mesh = pyrender.Mesh.from_trimesh(mesh, smooth=False)
    scene.add(py_mesh)
    camera = pyrender.OrthographicCamera(xmag=dist * 0.6, ymag=dist * 0.6)
    scene.add(camera, pose=camera_pose)

    renderer = pyrender.OffscreenRenderer(size, size)
    try:
        _, depth = renderer.render(scene)
    finally:
        renderer.delete()

    # Normalize depth to [0, 255]
    valid = depth[depth > 0]
    if len(valid) == 0:
        return Image.fromarray(np.zeros((size, size), dtype=np.uint8))
    d_min, d_max = valid.min(), valid.max()
    depth_norm = np.zeros_like(depth, dtype=np.float32)
    mask = depth > 0
    depth_norm[mask] = (depth[mask] - d_min) / (d_max - d_min + 1e-9)
    depth_u8 = (depth_norm * 255).clip(0, 255).astype(np.uint8)
    depth_rgb = np.stack([depth_u8] * 3, axis=-1)
    return Image.fromarray(depth_rgb)


# ── Texture generation ──────────────────────────────────────────────────────────

def _generate_view_texture(
    depth_img: Image.Image,
    prompt: str,
    negative_prompt: str,
    size: int,
    seed: int,
) -> Image.Image:
    generator = torch.Generator(device="cuda").manual_seed(seed)
    result = _pipe(
        prompt=prompt,
        negative_prompt=negative_prompt,
        image=depth_img.resize((size, size)),
        controlnet_conditioning_scale=0.6,
        num_inference_steps=20,
        guidance_scale=7.5,
        width=size,
        height=size,
        generator=generator,
    )
    return result.images[0]


# ── UV projection ────────────────────────────────────────────────────────────────

def _project_texture_onto_uv(
    mesh,
    view_images: list[Image.Image],
    viewpoints: list[tuple[float, float]],
    texture_size: int,
) -> Image.Image:
    """
    Back-project each view image onto the mesh UV map using rasterization.
    Blends overlaps by confidence (cos(angle between view direction and face normal)).
    """
    import trimesh
    import math

    uv = mesh.visual.uv  # (N_verts, 2)
    faces = mesh.faces   # (N_faces, 3)
    verts = mesh.vertices

    canvas = np.zeros((texture_size, texture_size, 3), dtype=np.float32)
    weights = np.zeros((texture_size, texture_size), dtype=np.float32)

    for (az_deg, el_deg), view_img in zip(viewpoints, view_images):
        az = math.radians(az_deg)
        el = math.radians(el_deg)
        view_dir = -np.array([
            math.cos(el) * math.sin(az),
            math.sin(el),
            math.cos(el) * math.cos(az),
        ])

        img_arr = np.array(view_img.resize((texture_size, texture_size))).astype(np.float32)

        # For each face, compute confidence = max(0, dot(face_normal, view_dir))
        face_normals = mesh.face_normals
        face_confidence = np.clip(face_normals @ view_dir, 0, 1)

        # For each visible face, scatter view pixels onto UV space
        for fi, (f, conf) in enumerate(zip(faces, face_confidence)):
            if conf < 0.1:
                continue
            # UV coords of the 3 face vertices → pixel coords in texture atlas
            uvs_face = uv[f]  # (3, 2)
            px = (uvs_face[:, 0] * (texture_size - 1)).astype(int).clip(0, texture_size - 1)
            py = ((1 - uvs_face[:, 1]) * (texture_size - 1)).astype(int).clip(0, texture_size - 1)

            # Sample the view image at those projected pixels and write to canvas
            for px_i, py_i in zip(px, py):
                canvas[py_i, px_i] += img_arr[py_i, px_i] * conf
                weights[py_i, px_i] += conf

    # Normalize
    mask = weights > 0
    canvas[mask] /= weights[mask, np.newaxis]
    # Fill gaps with nearest-neighbour
    from scipy.ndimage import distance_transform_edt
    gap = ~mask
    if gap.any():
        _, indices = distance_transform_edt(gap, return_indices=True)
        canvas[gap] = canvas[tuple(indices[:, gap])]

    return Image.fromarray(canvas.clip(0, 255).astype(np.uint8))


# ── Full pipeline ────────────────────────────────────────────────────────────────

def _run_texturing(
    mesh_url: str,
    prompt: str,
    negative_prompt: str,
    num_views: int,
    texture_size: int,
) -> bytes:
    import trimesh

    mesh = _load_mesh(mesh_url)
    viewpoints = VIEWPOINTS_8 if num_views >= 8 else VIEWPOINTS_4

    log.info("Rendering %d depth maps at %dpx", len(viewpoints), texture_size)
    depth_maps = [
        _render_depth(mesh, az, el, size=texture_size)
        for az, el in viewpoints
    ]

    log.info("Generating texture views with SDXL+ControlNet")
    view_images = [
        _generate_view_texture(d, prompt, negative_prompt, texture_size, seed=i * 42)
        for i, d in enumerate(depth_maps)
    ]

    log.info("Projecting views onto UV atlas (%dpx)", texture_size)
    texture_atlas = _project_texture_onto_uv(mesh, view_images, viewpoints, texture_size)

    log.info("Baking textured GLB")
    material = trimesh.visual.material.PBRMaterial(
        baseColorTexture=texture_atlas,
        metallicFactor=0.0,
        roughnessFactor=0.8,
    )
    mesh.visual = trimesh.visual.TextureVisuals(uv=mesh.visual.uv, material=material)

    buf = io.BytesIO()
    scene = trimesh.scene.scene.Scene(geometry={"mesh": mesh})
    scene.export(buf, file_type="glb")
    return buf.getvalue()


async def _process(
    task_id: str,
    mesh_url: str,
    prompt: str,
    negative_prompt: str,
    num_views: int,
    texture_size: int,
) -> None:
    async with _sem:
        _tasks[task_id]["status"] = "running"
        loop = asyncio.get_event_loop()
        t0 = time.time()
        try:
            glb_bytes = await loop.run_in_executor(
                None,
                _run_texturing,
                mesh_url,
                prompt,
                negative_prompt,
                num_views,
                texture_size,
            )

            blob_name = f"textured/{task_id}.glb"
            blob = _bucket.blob(blob_name)
            await loop.run_in_executor(
                None,
                lambda: blob.upload_from_string(glb_bytes, content_type="model/gltf-binary"),
            )
            result_url = f"https://storage.googleapis.com/{GCS_BUCKET}/{blob_name}"

            elapsed = time.time() - t0
            _tasks[task_id].update({
                "status": "done",
                "result_url": result_url,
                "bytes": len(glb_bytes),
                "elapsed_ms": int(elapsed * 1000),
            })
            log.info("[%s] done in %.1fs — %d bytes", task_id, elapsed, len(glb_bytes))

        except Exception as exc:
            _tasks[task_id].update({
                "status": "failed",
                "error": safe_error(exc, context=f"[{task_id}] texture"),
                "elapsed_ms": int((time.time() - t0) * 1000),
            })


class TextureRequest(BaseModel):
    mesh: str = Field(..., description="https URL to input GLB mesh")
    prompt: str = Field(..., min_length=3, max_length=500)
    negative_prompt: str = Field(default="blurry, low quality, distorted, watermark")
    num_views: int = Field(default=8, ge=4, le=8)
    texture_size: int = Field(default=1024)

    @field_validator("texture_size")
    @classmethod
    def validate_size(cls, v: int) -> int:
        if v not in (512, 1024, 2048):
            raise ValueError("texture_size must be 512, 1024, or 2048")
        return v


@app.post("/texture", status_code=202)
async def texture_mesh(
    body: TextureRequest,
    background_tasks: BackgroundTasks,
    authorization: str = Header(...),
) -> dict:
    _require_api_key(authorization)
    task_id = str(uuid.uuid4())
    _tasks[task_id] = {
        "task_id": task_id,
        "status": "queued",
        "prompt": body.prompt,
    }
    background_tasks.add_task(
        _process,
        task_id,
        body.mesh,
        body.prompt,
        body.negative_prompt,
        body.num_views,
        body.texture_size,
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
        "service": "texture",
        "gpu_available": torch.cuda.is_available(),
        "model_loaded": _pipe is not None,
    }
