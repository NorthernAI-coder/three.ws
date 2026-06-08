# three.ws — Blender add-on

Generate a 3D model from a text prompt or a reference image with three.ws Forge,
directly inside Blender. The model is reconstructed on three.ws and imported into
your scene, selected and framed.

## Install

1. Zip the add-on folder so the archive contains the `three_ws/` directory:
   ```bash
   cd integrations/blender
   zip -r three_ws.zip three_ws
   ```
2. In Blender: **Edit ▸ Preferences ▸ Add-ons ▸ Install…**, pick `three_ws.zip`,
   then tick **three.ws** to enable it.
3. (Optional) In the add-on's preferences, set:
   - **API URL** — defaults to `https://three.ws`. Point at your own deployment
     if self-hosting.
   - **Provider API key** — only needed for the Meshy/Tripo *geometry* pipeline.
     The default *image* pipeline (FLUX→TRELLIS) is free.

## Use

Open the 3D Viewport sidebar (press **N**) → **three.ws** tab.

- **Text** mode: type a prompt, pick a quality tier, hit **Generate 3D model**.
- **Image** mode: choose a PNG/JPEG/WebP reference, hit **Generate**.
- **Pipeline**: *Image* (free, FLUX→TRELLIS) or *Geometry* (Meshy/Tripo, needs a
  provider key).
- **Test connection** confirms the deployment is reachable and lists live backends.

Generation runs on a background thread — Blender stays responsive, the panel
shows the real job status + elapsed seconds, and **Esc** cancels. The GLB import
happens on Blender's main thread when the job completes (bpy is not thread-safe).

## Notes

- Nothing is mocked: the panel reflects the real job state, and failures
  (unreachable deployment, missing provider key, generation error) surface as
  Blender error reports — never a fake model.
- The image pipeline requires object storage configured on the deployment for
  upload; if it isn't, the add-on reports that clearly.
- The Forge client (`three_ws_client.py`) is a vendored copy of
  `integrations/_pyclient/three_ws_client.py` — see the integrations README.
