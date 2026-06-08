# three.ws — ComfyUI nodes

Two nodes that drive the three.ws Forge pipeline from a ComfyUI graph:

- **three.ws Text→3D** — prompt → `glb_path`
- **three.ws Image→3D** — `IMAGE` → `glb_path`

The `glb_path` STRING output is a real `.glb` written to ComfyUI's output
directory — feed it to any 3D node (e.g. ComfyUI-3D-Pack viewers/savers) or use
it as the final artifact.

## Install

```bash
cd ComfyUI/custom_nodes
git clone <this-repo> three_ws_tmp        # or copy the folder
cp -r three_ws_tmp/integrations/comfyui/three_ws_nodes ./three_ws_nodes
rm -rf three_ws_tmp
```

Or simply copy `integrations/comfyui/three_ws_nodes/` into
`ComfyUI/custom_nodes/`. Restart ComfyUI. The nodes appear under the **three.ws**
category. They use only numpy + Pillow (already shipped with ComfyUI) plus the
Python standard library — nothing to install.

## Inputs

- **tier** — `draft` / `standard` / `high`.
- **pipeline** — `image` (free, FLUX→TRELLIS) or `geometry` (Meshy/Tripo, BYOK).
- **backend** — `auto`, or a specific backend.
- **api_url** — defaults to `https://three.ws`.
- **provider_key** — required only for the geometry pipeline.

## Caching

ComfyUI re-runs a node only when its inputs change, and the node also short-
circuits to the on-disk GLB when an identical request was already generated
(status `cached`). Change any input to force a fresh generation.

## Notes

- Failures raise a clear `RuntimeError` (shown in the ComfyUI error toast) — the
  node never emits a placeholder model.
- The Forge client (`three_ws_client.py`) is a vendored copy of
  `integrations/_pyclient/three_ws_client.py` — see the integrations README.
