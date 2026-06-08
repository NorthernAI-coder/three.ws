"""Tests for the shared three.ws Forge client.

Runs a real in-process HTTP server that mimics the Forge contract — no live
network — so the submit/upload/poll/download paths and error handling are all
exercised end to end. Run with:  ``python -m pytest integrations/_pyclient``
or directly:  ``python integrations/_pyclient/test_three_ws_client.py``.
"""

from __future__ import annotations

import json
import threading
import unittest
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer

from three_ws_client import ThreeWSClient, ThreeWSError, content_type_for_path


class _Handler(BaseHTTPRequestHandler):
    """A minimal Forge stand-in. ``server.state`` drives behaviour per test."""

    def log_message(self, *args):  # silence test output
        pass

    def _send(self, status, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get("content-length", 0))
        raw = self.rfile.read(length) if length else b""
        try:
            return json.loads(raw.decode("utf-8")) if raw else {}
        except ValueError:
            return {}

    def do_GET(self):
        state = self.server.state
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
        if parsed.path == "/api/forge" and "catalog" in qs:
            return self._send(200, {"tiers": [{"id": "standard"}], "backends": []})
        if parsed.path == "/api/forge" and "job" in qs:
            state["poll_count"] += 1
            # Record the client handle so the test can assert scoping.
            state["last_client_handle"] = self.headers.get("x-forge-client")
            if state.get("fail_poll"):
                return self._send(200, {"job_id": qs["job"][0], "status": "failed", "error": "render exploded"})
            if state["poll_count"] >= state["done_after"]:
                return self._send(200, {"job_id": qs["job"][0], "status": "done", "glb_url": state["glb_url"]})
            return self._send(200, {"job_id": qs["job"][0], "status": "running"})
        if parsed.path == state["glb_path"]:
            data = b"glTF-binary-bytes"
            self.send_response(200)
            self.send_header("content-type", "model/gltf-binary")
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        return self._send(404, {"error": "not_found"})

    def do_POST(self):
        state = self.server.state
        parsed = urllib.parse.urlparse(self.path)
        body = self._read_body()
        if parsed.path == "/api/forge-upload":
            host = f"http://127.0.0.1:{self.server.server_address[1]}"
            return self._send(200, {
                "storage_key": "forge/uploads/x/y.png",
                "upload_url": f"{host}/_put/y.png",
                "public_url": "https://cdn.example/forge/uploads/x/y.png",
                "method": "PUT",
                "headers": {"content-type": body.get("content_type", "image/png")},
                "expires_in": 300,
            })
        if parsed.path == "/api/forge":
            state["last_submit"] = body
            state["last_provider_key"] = self.headers.get("x-forge-provider-key")
            forced = state.get("submit_error")
            if forced:
                return self._send(200, forced)
            return self._send(200, {"job_id": "job_123", "status": "queued", "backend": "trellis"})
        return self._send(404, {"error": "not_found"})

    def do_PUT(self):
        # Accept the presigned image upload.
        length = int(self.headers.get("content-length", 0))
        self.rfile.read(length)
        self.server.state["uploaded_bytes"] = length
        self.send_response(200)
        self.send_header("content-length", "0")
        self.end_headers()


class ForgeClientTest(unittest.TestCase):
    def setUp(self):
        self.server = HTTPServer(("127.0.0.1", 0), _Handler)
        self.server.state = {
            "poll_count": 0,
            "done_after": 2,
            "glb_path": "/_glb/model.glb",
            "glb_url": None,
            "submit_error": None,
            "uploaded_bytes": 0,
        }
        port = self.server.server_address[1]
        self.server.state["glb_url"] = f"http://127.0.0.1:{port}{self.server.state['glb_path']}"
        self.base = f"http://127.0.0.1:{port}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        # Fast polling for tests.
        self.client = ThreeWSClient(self.base, client_handle="test-handle")

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def test_catalog(self):
        cat = self.client.get_catalog()
        self.assertIn("tiers", cat)

    def test_text_to_3d_end_to_end(self):
        glb = self.client.generate_text_to_3d(
            "a brass steampunk owl", tier="high", backend="trellis", poll_timeout=10
        )
        self.assertEqual(glb, self.server.state["glb_url"])
        # The submit body carried the right fields.
        self.assertEqual(self.server.state["last_submit"]["prompt"], "a brass steampunk owl")
        self.assertEqual(self.server.state["last_submit"]["tier"], "high")
        # Polling re-sent the anonymous client handle for scoping.
        self.assertEqual(self.server.state["last_client_handle"], "test-handle")
        self.assertGreaterEqual(self.server.state["poll_count"], 2)

    def test_image_to_3d_uploads_then_submits(self):
        glb = self.client.generate_image_to_3d(b"\x89PNG fake bytes", "image/png", poll_timeout=10)
        self.assertEqual(glb, self.server.state["glb_url"])
        self.assertGreater(self.server.state["uploaded_bytes"], 0)
        self.assertEqual(self.server.state["last_submit"]["image_urls"], ["https://cdn.example/forge/uploads/x/y.png"])

    def test_provider_key_header(self):
        client = ThreeWSClient(self.base, provider_key="secret-key", client_handle="h")
        client.submit_text_to_3d("a red ceramic teapot", backend="tripo")
        self.assertEqual(self.server.state["last_provider_key"], "secret-key")

    def test_needs_key_error(self):
        self.server.state["submit_error"] = {"error": "needs_key"}
        with self.assertRaises(ThreeWSError) as ctx:
            self.client.submit_text_to_3d("a model", backend="meshy")
        self.assertEqual(ctx.exception.code, "needs_key")

    def test_failed_job_raises_at_poll(self):
        # Submit succeeds (job queued); the failure surfaces during polling.
        self.server.state["fail_poll"] = True
        job = self.client.submit_text_to_3d("a model that will fail")
        with self.assertRaises(ThreeWSError) as ctx:
            self.client.poll(job["job_id"], interval=0.01, timeout=5)
        self.assertEqual(ctx.exception.code, "failed")
        self.assertIn("render exploded", ctx.exception.message)

    def test_short_prompt_rejected(self):
        with self.assertRaises(ThreeWSError) as ctx:
            self.client.submit_text_to_3d("hi")
        self.assertEqual(ctx.exception.code, "invalid_prompt")

    def test_download(self):
        import tempfile, os
        dest = os.path.join(tempfile.mkdtemp(), "out.glb")
        path = self.client.download(self.server.state["glb_url"], dest)
        with open(path, "rb") as fh:
            self.assertEqual(fh.read(), b"glTF-binary-bytes")

    def test_content_type_for_path(self):
        self.assertEqual(content_type_for_path("/a/b.PNG"), "image/png")
        self.assertEqual(content_type_for_path("photo.jpeg"), "image/jpeg")
        with self.assertRaises(ThreeWSError):
            content_type_for_path("model.gif")

    def test_poll_timeout(self):
        self.server.state["done_after"] = 9999
        with self.assertRaises(ThreeWSError) as ctx:
            self.client.poll("job_123", interval=0.01, timeout=0.05)
        self.assertEqual(ctx.exception.code, "timeout")


if __name__ == "__main__":
    unittest.main()
