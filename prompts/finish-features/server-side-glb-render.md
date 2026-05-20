# Task: Server-side GLB → PNG renderer for OG cards

## Repo context

Working tree: `/workspaces/three.ws`. The avatar thumbnail flow today
(after the recent `avatar-snapshot` ship documented in
`docs/internal/PROGRESS.md` item 4):

- Client renders a JPEG snapshot of the current three.js frame
  (`src/voice/avatar-snapshot.js`) after the customizer Save lands.
- The snapshot is presigned + uploaded to R2 via
  `/api/avatars/...` (presign-thumbnail).
- `/api/avatars/...?action=auto-tag` runs Claude Haiku vision on the
  snapshot to generate tags + a description.
- `thumbnail_key` on the avatar row points to the R2 object.

What's missing: **crawl-time OG card generation.** When Twitter,
Discord, Slack, etc. crawl an avatar's public page, they fetch
`/api/avatar-og.js?id=...` (or similar). If the avatar has no
client-uploaded thumbnail yet (the customizer was never saved, or the
avatar was created via API), the OG endpoint cannot produce a real
PNG. Today it likely falls back to a generic placeholder.

`docs/internal/NEXT.md` documents the deferred decision and recommends
`puppeteer-core` + `@sparticuz/chromium-min` as the lowest-friction
path despite the ~60 MB function bundle hit.

## Rails (CLAUDE.md — non-negotiable)

- No mocks. No fake data. No placeholders. No fallback sample
  arrays.
- Real APIs only — the renderer must actually render the avatar GLB
  in a real browser engine, not an SVG approximation.
- Done = a server-side render endpoint returns a real PNG for any
  avatar; OG crawlers fetching the avatar page see a real preview
  image; `npm test` green.
- Push to both remotes only when the user says push.

## Subagent delegation

### Subagent A (Explore)

> In `/workspaces/three.ws`, map the existing OG card and thumbnail
> flow. Return:
>
> 1. The path + signature of the avatar OG endpoint (likely
>    `api/avatar-og.js` or `api/a-og.js`). Quote the file.
> 2. The path + signature of `api/avatars/...?action=auto-tag` and
>    `api/avatars/...?action=presign-thumbnail`.
> 3. `src/voice/avatar-snapshot.js` — its exported API and where
>    it's called.
> 4. The avatar page handler that emits OG meta tags (likely
>    `api/avatar-page.js` or `pages/avatar-page.html` + a runtime
>    that injects meta).
> 5. The R2 / storage path scheme: what key does the client-uploaded
>    thumbnail land at? What key would a server-rendered PNG land at?

### Subagent B (Explore)

> Read `docs/internal/NEXT.md` and quote the section on server-side
> GLB → PNG render. Then assess feasibility:
>
> 1. Current Vercel function size budget for this repo (check
>    `vercel.json`, `package.json` for any `maxDuration` /
>    `regions` / size hints, and any existing large dep).
> 2. The current cold-start latency of a similarly-sized function
>    in this repo (look at any function that imports puppeteer-core
>    or @sparticuz/chromium today — there may already be one).
> 3. Whether the function should live under `api/` (Vercel) or in a
>    separate worker. The size budget answer determines this.

Wait for both before starting Step 1.

## What to implement

### Step 1 — install deps

```bash
npm install puppeteer-core @sparticuz/chromium-min
```

These go into runtime `dependencies`, not devDependencies — they
ship with the function.

### Step 2 — build the renderer

Create `api/_lib/render-glb.js` (or co-located under the existing
`api/_lib/` patterns Subagent A surfaces). Export:

```js
export async function renderGlbToPng({ glbUrl, width = 1200, height = 630, background = 'transparent' }) {
  // Launches headless chromium, loads a tiny static viewer HTML page,
  // posts the glb URL into it, waits for the model to load + first
  // paint, screenshots the canvas, returns a PNG Buffer.
}
```

Implementation:

1. Use `chromium.executablePath` from `@sparticuz/chromium-min`.
2. Launch `puppeteer-core` with `chromium.args` and
   `headless: chromium.headless`.
3. Navigate to a tiny static HTML page bundled into the function.
   The HTML loads three.js + GLTFLoader + the provided GLB, renders
   one frame at the target resolution with deterministic camera +
   lighting, and exposes `window.__renderDone = true` when ready.
4. `page.waitForFunction('window.__renderDone === true', { timeout:
   15_000 })`.
5. `page.screenshot({ type: 'png', omitBackground: background ===
   'transparent', clip: { x: 0, y: 0, width, height } })`.
6. Close the browser. Return the buffer.

The tiny static HTML page should be **inlined as a string constant**
in `render-glb.js` so the function bundle does not need a separate
file. The string can reference three.js from a known CDN
(`https://unpkg.com/three@0.<ver>/...`) — version must match
`package.json` so the renderer behaves the same as the in-app viewer.

### Step 3 — wire it into the avatar OG endpoint

In whichever file Subagent A identified as the OG endpoint:

1. Try the client-uploaded thumbnail first. If `thumbnail_key` is
   set and the R2 object exists, redirect (or stream) the existing
   PNG/JPEG.
2. If no thumbnail exists, fall through to the server renderer:
   - Look up the avatar's GLB URL (the same URL the viewer loads).
   - Call `renderGlbToPng({ glbUrl, width: 1200, height: 630 })`.
   - Upload the resulting PNG to R2 under the documented key.
   - Update `thumbnail_key` on the avatar row.
   - Stream the PNG back to the crawler with the correct
     `Content-Type` and cache headers.

Subsequent crawls of the same avatar should hit the cached thumbnail
in R2 — the server render is amortized.

### Step 4 — concurrency + budget guards

Cold-start latency for chromium is real. Guard against:

1. Concurrent renders for the same avatar: use a simple in-memory
   lock (Map of `avatarId → Promise`) so two simultaneous crawls do
   not both spin up chromium. The second one awaits the first.
2. Function timeout: set `maxDuration: 30` in `vercel.json` for this
   endpoint (or whatever the platform's max allows). Render budget
   is 15s + 5s overhead.
3. Bytes returned: if the GLB itself is >10 MB, the renderer will
   be slow and may OOM. Add a size precheck — head request the GLB
   URL, abort with a fallback placeholder if Content-Length > 10 MB.
   The placeholder is the **generic site logo**, not a synthetic
   "no preview" SVG.

### Step 5 — manual end-to-end test

```bash
npm run dev
```

(Note: `puppeteer-core` + `@sparticuz/chromium-min` are designed for
Vercel runtime; on local dev the chromium binary download from
`@sparticuz/chromium-min` is a one-time blob.)

1. Pick an avatar that has no `thumbnail_key` yet (or set
   `thumbnail_key = null` on a test row in dev).
2. `curl -o /tmp/og.png 'http://localhost:3000/api/avatar-og.js?id=
   <id>'`
3. Open `/tmp/og.png` — confirm it shows the avatar, not a
   placeholder.
4. Curl again, confirm the second call is faster (cached path).
5. Check Twitter's card validator / a meta-tag inspector against the
   public avatar page URL once deployed.

### Step 6 — tests

`tests/render-glb.test.js`. The full render path needs a real
chromium and a real GLB, which makes it slow and CI-unfriendly. Two
test layers:

1. Unit: assert that `renderGlbToPng({ glbUrl: '...' })` returns a
   Buffer whose first 8 bytes are the PNG magic
   (`\x89PNG\r\n\x1a\n`). Use a tiny test GLB committed under
   `tests/fixtures/` (or generate one programmatically). Skip the
   test under CI by checking an env var (e.g. `process.env.CI &&
   !process.env.RUN_HEADFUL_TESTS`); document the skip.
2. Integration with the OG endpoint: stub `renderGlbToPng` at the
   module boundary (since the unit test exercises the real path).
   Assert the endpoint reads `thumbnail_key`, falls through correctly,
   uploads to R2, updates the row.

### Step 7 — clean up `docs/internal/NEXT.md`

Remove the "deferred — server-side GLB → PNG render" section. Add a
line under PROGRESS.md (item N+1) describing what was implemented.

## Definition of done

- `api/_lib/render-glb.js` exists and renders real GLB files to real
  PNGs via headless chromium.
- The avatar OG endpoint serves: (a) the client thumbnail if
  present, (b) a freshly-rendered PNG if not, (c) a real fallback
  image (site logo) only if the GLB is too large.
- Subsequent OG crawls hit the cached R2 object.
- `npm test` is green (with the headful test appropriately skipped
  in CI).
- A real social-media-card debugger shows the rendered preview for
  the avatar's public page.
- `docs/internal/NEXT.md` no longer lists this as a deferred decision.

## Constraints

- Do not bundle `puppeteer` (full). Only `puppeteer-core` +
  `@sparticuz/chromium-min`. The full puppeteer ships a chromium
  download — incompatible with Vercel.
- Do not call this renderer on every request. Always check the R2
  cache first.
- Do not use a sentinel PNG (single-color or "no preview" SVG) as
  the fallback. CLAUDE.md forbids placeholder data — either render
  the avatar, or serve the real site logo, full stop.
- Do not lock the function for >20s waiting for a render. If it
  times out, return the fallback and surface the timeout in logs
  (not as an error to the crawler — a 200 with the logo is better
  than a 500).
