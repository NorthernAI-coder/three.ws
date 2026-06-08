"""three.ws Forge client — shared by the Blender add-on and the ComfyUI nodes.

Single source of truth for the public Forge generation contract
(``api/forge.js`` + ``api/forge-upload.js``). Stdlib-only (``urllib``) so it
runs unmodified inside Blender's bundled Python and inside ComfyUI without
forcing a ``pip install`` into either host.

Public contract this wraps
---------------------------
* ``POST /api/forge``            ``{prompt, aspect_ratio?, path?, tier?, backend?}``  → text→3D
* ``POST /api/forge``            ``{image_urls[], prompt?, path?, tier?, backend?}``  → image→3D
* ``GET  /api/forge?job=<id>``   → poll ``{status, glb_url?, error?, backend?, ...}``
* ``GET  /api/forge?catalog``    → tier/backend/cost matrix
* ``POST /api/forge-upload``     ``{content_type, size_bytes, checksum_sha256?}`` → presigned PUT

Generation is auth-free (IP rate-limited, scoped to an anonymous client handle).
The geometry path (Meshy/Tripo) is BYOK: pass ``provider_key`` and it travels as
the ``x-forge-provider-key`` header.

This file is vendored byte-for-byte into each plugin package; the canonical copy
lives at ``integrations/_pyclient/three_ws_client.py`` and a drift test keeps the
vendored copies identical.
"""

from __future__ import annotations

import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import Callable, Optional

DEFAULT_BASE_URL = "https://three.ws"
DEFAULT_TIMEOUT = 30.0          # per HTTP request
DEFAULT_POLL_INTERVAL = 2.0     # seconds between job polls
DEFAULT_POLL_TIMEOUT = 300.0    # overall ceiling for a generation

# Mirrors api/_lib/forge-tiers.js so the plugins can present choices without a
# network round-trip. ``get_catalog()`` fetches the live matrix when needed.
TIERS = ("draft", "standard", "high")
PATHS = ("image", "geometry")
BACKENDS = ("trellis", "meshy", "tripo", "hunyuan3d")
ASPECT_RATIOS = ("1:1", "4:3", "3:4", "16:9", "9:16")

_CONTENT_TYPE_BY_EXT = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
}


class ThreeWSError(Exception):
    """A Forge request failed. ``message`` is safe to show a user."""

    def __init__(self, message: str, *, code: str = "", status: int = 0):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status


def content_type_for_path(path: str) -> str:
    """Map an image filename to the content-type Forge accepts, or raise."""
    ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    ct = _CONTENT_TYPE_BY_EXT.get(ext)
    if not ct:
        raise ThreeWSError(
            f"Unsupported image type '.{ext}'. Use PNG, JPEG, or WebP.",
            code="invalid_content_type",
        )
    return ct


class ThreeWSClient:
    """Submit, poll, and download three.ws Forge generations.

    Parameters
    ----------
    base_url:       deployment origin (default ``https://three.ws``).
    provider_key:   optional Meshy/Tripo key for the BYOK geometry path.
    client_handle:  anonymous handle that scopes creations; generated if omitted.
    timeout:        per-request timeout in seconds.
    """

    def __init__(
        self,
        base_url: str = DEFAULT_BASE_URL,
        *,
        provider_key: Optional[str] = None,
        client_handle: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT,
    ):
        self.base_url = (base_url or DEFAULT_BASE_URL).rstrip("/")
        self.provider_key = (provider_key or "").strip() or None
        self.client_handle = client_handle or uuid.uuid4().hex
        self.timeout = timeout

    # -- low-level HTTP ------------------------------------------------------

    def _headers(self, extra: Optional[dict] = None) -> dict:
        headers = {
            "accept": "application/json",
            "x-forge-client": self.client_handle,
            "user-agent": "three-ws-plugin/1.0",
        }
        if self.provider_key:
            headers["x-forge-provider-key"] = self.provider_key
        if extra:
            headers.update(extra)
        return headers

    def _request(self, method: str, path: str, *, body: Optional[dict] = None) -> dict:
        url = f"{self.base_url}{path}"
        data = None
        headers = self._headers()
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["content-type"] = "application/json"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                payload = resp.read()
        except urllib.error.HTTPError as exc:
            payload = exc.read()
            parsed = _safe_json(payload)
            raise ThreeWSError(
                parsed.get("message") or parsed.get("error") or f"HTTP {exc.code}",
                code=parsed.get("error", ""),
                status=exc.code,
            ) from exc
        except urllib.error.URLError as exc:
            raise ThreeWSError(
                f"Could not reach {self.base_url}: {exc.reason}",
                code="unreachable",
            ) from exc
        return _safe_json(payload)

    # -- catalog -------------------------------------------------------------

    def get_catalog(self) -> dict:
        """Live tier/backend/cost matrix from ``GET /api/forge?catalog``."""
        return self._request("GET", "/api/forge?catalog")

    # -- image upload (image→3D needs a public URL) --------------------------

    def upload_image(self, image_bytes: bytes, content_type: str) -> str:
        """Presign + PUT an image, returning its public URL for image→3D.

        Raises ThreeWSError with actionable guidance if storage is not
        configured on the deployment (the caller may pass a public URL instead).
        """
        if not image_bytes:
            raise ThreeWSError("Image is empty.", code="invalid_size")
        checksum = hashlib.sha256(image_bytes).hexdigest()
        presign = self._request(
            "POST",
            "/api/forge-upload",
            body={
                "content_type": content_type,
                "size_bytes": len(image_bytes),
                "checksum_sha256": checksum,
            },
        )
        upload_url = presign.get("upload_url")
        public_url = presign.get("public_url")
        if not upload_url or not public_url:
            raise ThreeWSError("Upload presign returned no URL.", code="presign_failed")
        put_headers = presign.get("headers") or {"content-type": content_type}
        put_req = urllib.request.Request(
            upload_url, data=image_bytes, headers=put_headers, method="PUT"
        )
        try:
            with urllib.request.urlopen(put_req, timeout=max(self.timeout, 60)) as resp:
                resp.read()
        except urllib.error.HTTPError as exc:
            raise ThreeWSError(
                f"Image upload failed (HTTP {exc.code}).", code="upload_failed", status=exc.code
            ) from exc
        except urllib.error.URLError as exc:
            raise ThreeWSError(f"Image upload failed: {exc.reason}", code="upload_failed") from exc
        return public_url

    # -- submit --------------------------------------------------------------

    def submit_text_to_3d(
        self,
        prompt: str,
        *,
        tier: str = "standard",
        backend: Optional[str] = None,
        path: str = "image",
        aspect_ratio: str = "1:1",
    ) -> dict:
        prompt = (prompt or "").strip()
        if len(prompt) < 3:
            raise ThreeWSError("Describe one subject in at least 3 characters.", code="invalid_prompt")
        body = {"prompt": prompt, "tier": tier, "path": path, "aspect_ratio": aspect_ratio}
        if backend:
            body["backend"] = backend
        return self._submit(body)

    def submit_image_to_3d(
        self,
        image_urls,
        *,
        prompt: str = "",
        tier: str = "standard",
        backend: Optional[str] = None,
        path: str = "image",
    ) -> dict:
        if isinstance(image_urls, str):
            image_urls = [image_urls]
        image_urls = [u for u in image_urls if isinstance(u, str) and u.startswith("https://")]
        if not image_urls:
            raise ThreeWSError("image_to_3d needs at least one public https image URL.", code="invalid_image_urls")
        body = {"image_urls": image_urls, "tier": tier, "path": path}
        if prompt.strip():
            body["prompt"] = prompt.strip()
        if backend:
            body["backend"] = backend
        return self._submit(body)

    def _submit(self, body: dict) -> dict:
        result = self._request("POST", "/api/forge", body=body)
        err = result.get("error")
        if err == "needs_key":
            raise ThreeWSError(
                "This backend (Meshy/Tripo) needs your provider API key. "
                "Set it in the add-on preferences / node input.",
                code="needs_key",
            )
        if err == "backend_unconfigured":
            raise ThreeWSError(
                result.get("message") or "That backend is not configured on this deployment.",
                code="backend_unconfigured",
            )
        if err == "unconfigured":
            raise ThreeWSError(
                result.get("message") or "Generation is not configured on this deployment.",
                code="unconfigured",
            )
        if err:
            raise ThreeWSError(result.get("message") or err, code=err)
        job_id = result.get("job_id")
        if not job_id:
            raise ThreeWSError("Forge returned no job id.", code="no_job")
        return result

    # -- poll ----------------------------------------------------------------

    def poll(
        self,
        job_id: str,
        *,
        on_progress: Optional[Callable[[str, float], None]] = None,
        interval: float = DEFAULT_POLL_INTERVAL,
        timeout: float = DEFAULT_POLL_TIMEOUT,
        should_cancel: Optional[Callable[[], bool]] = None,
        _now: Callable[[], float] = time.monotonic,
        _sleep: Callable[[float], None] = time.sleep,
    ) -> str:
        """Block until the job is done; return its GLB URL.

        ``on_progress(status, elapsed_seconds)`` is called each tick. Raises
        ThreeWSError on failure or timeout. ``should_cancel`` lets a host abort.
        """
        start = _now()
        path = f"/api/forge?job={urllib.parse.quote(job_id)}"
        while True:
            if should_cancel and should_cancel():
                raise ThreeWSError("Generation cancelled.", code="cancelled")
            elapsed = _now() - start
            if elapsed > timeout:
                raise ThreeWSError(
                    f"Generation timed out after {int(elapsed)}s.", code="timeout"
                )
            result = self._request("GET", path)
            status = result.get("status", "running")
            if on_progress:
                on_progress(status, elapsed)
            if status == "done" and result.get("glb_url"):
                return result["glb_url"]
            if status == "failed":
                raise ThreeWSError(result.get("error") or "Generation failed.", code="failed")
            _sleep(interval)

    # -- download ------------------------------------------------------------

    def download(self, url: str, dest_path: str) -> str:
        """Stream a GLB (or any URL) to ``dest_path``; return the path."""
        req = urllib.request.Request(url, headers={"user-agent": "three-ws-plugin/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=max(self.timeout, 120)) as resp, open(
                dest_path, "wb"
            ) as out:
                while True:
                    chunk = resp.read(64 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
        except (urllib.error.HTTPError, urllib.error.URLError) as exc:
            raise ThreeWSError(f"Download failed: {exc}", code="download_failed") from exc
        return dest_path

    # -- high-level convenience ---------------------------------------------

    def generate_text_to_3d(
        self,
        prompt: str,
        *,
        tier: str = "standard",
        backend: Optional[str] = None,
        path: str = "image",
        aspect_ratio: str = "1:1",
        on_progress: Optional[Callable[[str, float], None]] = None,
        should_cancel: Optional[Callable[[], bool]] = None,
        poll_timeout: float = DEFAULT_POLL_TIMEOUT,
    ) -> str:
        job = self.submit_text_to_3d(
            prompt, tier=tier, backend=backend, path=path, aspect_ratio=aspect_ratio
        )
        return self.poll(
            job["job_id"], on_progress=on_progress, should_cancel=should_cancel, timeout=poll_timeout
        )

    def generate_image_to_3d(
        self,
        image_bytes: bytes,
        content_type: str,
        *,
        prompt: str = "",
        tier: str = "standard",
        backend: Optional[str] = None,
        path: str = "image",
        on_progress: Optional[Callable[[str, float], None]] = None,
        should_cancel: Optional[Callable[[], bool]] = None,
        poll_timeout: float = DEFAULT_POLL_TIMEOUT,
    ) -> str:
        public_url = self.upload_image(image_bytes, content_type)
        job = self.submit_image_to_3d(public_url, prompt=prompt, tier=tier, backend=backend, path=path)
        return self.poll(
            job["job_id"], on_progress=on_progress, should_cancel=should_cancel, timeout=poll_timeout
        )


def _safe_json(payload: bytes) -> dict:
    try:
        parsed = json.loads(payload.decode("utf-8"))
        return parsed if isinstance(parsed, dict) else {"value": parsed}
    except (ValueError, UnicodeDecodeError):
        return {}
