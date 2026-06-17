# Task: Blender add-on + ComfyUI node for three.ws generation

## Why this exists

Tripo's biggest distribution advantage is its plugin ecosystem — Blender, Unity,
Unreal, ComfyUI, Godot, Cocos. We have **zero** plugin coverage. Game and film
artists never have to leave their tool to use Tripo; they have to leave their
tool entirely to use us. This task ships the two highest-leverage plugins — a
**Blender add-on** and a **ComfyUI custom node** — both driving our existing
`api/forge.js` generation pipeline, so an artist can generate a three.ws model
without leaving their DCC.

## Rails (CLAUDE.md — non-negotiable; read the full file first)

- **No mocks, no fake data, no placeholders.** The plugins call the real forge
  API and import the real returned GLB. No bundled sample models, no fake
  progress. If an API key flow is needed, build the real one.
- **No TODOs, no stubs, no commented-out code, no `raise NotImplementedError`.**
  Wire 100%: auth → submit → poll → import.
- **The only coin is `$three`** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).
  Never reference any other coin anywhere.
- **Repo hygiene:** plugins live in a dedicated top-level dir (`integrations/`),
  not the repo root. No scratch files committed.
- **Done = installable and exercised** against a running API, README with install
  steps, `npm test` still green (no regressions to the web app). Run the
  **completionist** subagent before stopping.
- **Push only when the user says so**, then to BOTH remotes (`threeD`, `threews`).

## Explore first (spawn before writing code)

### Subagent A (Explore) — the forge API surface
> In `/workspaces/three.ws`, quote the complete external contract of
> `api/forge.js`: the `POST /api/forge` request body (`prompt`, `image_urls`,
> `path`, `tier`, `backend`, `aspect_ratio`), the `?job=<id>` poll response
> (`status`, `glb_url`, `image_url`, `preview_image_url`, `error`, `backend`),
> and `?catalog`. Then document the authentication model for external callers:
> how does an API key / token get issued and verified? Look for an API-keys
> system (the git status referenced `tests/api/api-keys.test.js`) — quote how a
> key is created and how an endpoint authenticates one. The plugins must use the
> real auth path, not an unauthenticated backdoor.

### Subagent B (Explore) — existing SDK / packaging conventions
> In `/workspaces/three.ws`, check `sdk/`, `solana-agent-sdk/`,
> `agent-payments-sdk/`, and any existing `integrations/` or `plugins/` dir for
> packaging conventions (how a distributable artifact is structured, versioned,
> and documented). Also confirm the public base URL of the deployed API (check
> `vercel.json` rewrites, `api/_lib/env.js` for APP_ORIGIN, and any docs). The
> plugins need a correct default endpoint.

Wait for both before starting.

## What to build

### Step 1 — Blender add-on

Create `integrations/blender/three_ws/` — a proper Blender add-on package:

- `__init__.py` with `bl_info` (name "three.ws", category "Import-Export",
  Blender ≥ 4.0).
- A preferences panel for the **API base URL** and **API key** (using the real
  key system Subagent A documented).
- An N-panel UI in the 3D viewport sidebar with:
  - A prompt field + Generate (text → 3D).
  - An image picker + Generate (image → 3D).
  - Tier / backend dropdowns populated from `GET /api/forge?catalog`.
  - A real progress readout driven by polling `?job=<id>` on a modal/timer
    operator (Blender's `modal()` pattern — never block the UI thread).
- On completion: download the `glb_url` and import it into the current scene via
  Blender's glTF importer, selected and framed.
- Real error surfacing in the Blender report system (auth failure, generation
  failure, network) — actionable, never swallowed.
- `README.md` with install steps (zip the folder → Edit ▸ Preferences ▸ Add-ons ▸
  Install) and a key-setup walkthrough.

### Step 2 — ComfyUI custom node

Create `integrations/comfyui/three_ws_nodes/`:

- `__init__.py` exporting `NODE_CLASS_MAPPINGS` / `NODE_DISPLAY_NAME_MAPPINGS`.
- A **"three.ws Text→3D"** node: inputs `prompt`, `tier`, `backend`, `api_key`,
  `api_url`; output the path to the downloaded GLB (a `STRING`/path output other
  nodes can consume) plus the preview image as an `IMAGE` output.
- A **"three.ws Image→3D"** node: `IMAGE` input → GLB path output.
- Both submit to forge, poll to completion inside the node's execution, and
  download the result to ComfyUI's output dir. Honor ComfyUI's caching so a
  re-run with identical inputs doesn't re-generate.
- Real error raising with clear messages on failure.
- `requirements.txt` (just `requests` if that's all that's needed) and a
  `README.md` with install steps (clone into `ComfyUI/custom_nodes/`).

### Step 3 — shared client (avoid duplication)

Factor the submit-and-poll logic into one small Python module reused by both
plugins (e.g. `integrations/_pyclient/three_ws_client.py`) so the forge contract
lives in one place. Keep it dependency-light (stdlib `urllib` or `requests`).

### Step 4 — make the API external-ready (only if needed)

If Subagent A finds the forge API is currently locked to same-origin /
session-cookie auth and has no API-key path for external callers, add **real**
API-key authentication to `api/forge.js` using the existing key system — issue,
store (hashed), and verify a key, with a scope for generation. Do not open an
unauthenticated route. (If prompt `04-monetized-3d-api-mcp.md` has already
shipped, target that public surface instead and skip this step.)

### Step 5 — tests + verification

- Python: a unit test for the shared client against a stubbed HTTP server
  (assert it submits the right body and polls to completion). No live network in
  CI.
- If you touched `api/forge.js` auth, add/extend a JS test (see
  `tests/api/api-keys.test.js`) asserting a valid key authenticates and an
  invalid one is rejected. `npm test` must stay green.
- Manually verify the Blender add-on installs and generates against a running
  API; verify the ComfyUI node loads and outputs a GLB path. Document the manual
  steps you ran.

### Step 6 — docs

- `integrations/README.md` indexing both plugins.
- A PROGRESS.md item.

## Definition of done

- `integrations/blender/three_ws/` installs as a Blender add-on, authenticates
  with a real key, generates from text and image, and imports the GLB into the
  scene with live progress.
- `integrations/comfyui/three_ws_nodes/` loads in ComfyUI and outputs a real GLB
  from Text→3D and Image→3D nodes.
- Shared Python client; no duplicated forge logic.
- API-key auth is real (existing system or new, hashed, scoped) — no
  unauthenticated generation route.
- `npm test` green; Python client test green.
- `git diff` self-reviewed; completionist subagent run and findings fixed.

## Constraints

- Plugins live under `integrations/` — never the repo root.
- No bundled sample/placeholder models or fake progress in either plugin.
- Blender polling must use the modal/timer pattern — never block Blender's UI.
- Respect ComfyUI caching semantics.
- If you add external auth, use the existing key system; never ship an open
  generation endpoint.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/tripo-gap/03-blender-comfyui-plugins.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
