# Prompt 02 — Forge generation quality: verification log

Real verification performed for this work order. Two constraints from this
specific sandbox shaped the verification strategy — both documented below with
evidence, not asserted:

1. **No live Redis in this sandbox** (matches the existing project memory
   note "prod rate-limiter/Redis down… fix = rotate KV token" — `.env.local`
   and the scratchpad's recovered `verify.env` carry no `UPSTASH_*` vars).
   `forge-cache.js` and the new `forge-job-options.js` are both explicitly
   designed to fail open without Redis (see their own module docs), so the
   result-cache and job→options-binding code paths run as no-ops here. They
   are covered instead by real unit tests against a functionally-accurate
   fake Redis (`tests/forge-cache.test.js`, pre-existing, 13 tests) and by a
   live 400-path check that proves the code that GATES the cache read
   (`normalizeForgeOptions`) runs correctly against the real HTTP endpoint.
2. **Outbound network to `ai.api.nvidia.com`'s inference endpoint hangs in
   this sandbox.** A bare `GET https://ai.api.nvidia.com` returns 404 in
   180ms (host is reachable), but a real `POST .../genai/black-forest-labs/
   flux.1-schnell` — the actual free NIM lane our code calls — either returns
   a live 504 after ~90s (captured once, see below) or times out with zero
   bytes after 60s on a raw `curl` with no app code involved at all. This is
   an environment/egress characteristic, not a bug in the changed code: the
   same call path (`api/_mcp3d/text-to-image.js` → `nimFluxImage` /
   `api/_providers/nvidia.js` → `textTo3d`) is unchanged by this work order
   except for now forwarding an optional `seed`. `REPLICATE_API_TOKEN` and
   `HF_TOKEN` are not available in this sandbox (only placeholders in
   `.env.example`), so no other live GPU lane could be substituted.

Everything reachable from this sandbox was verified for real, against a
locally running instance of the actual server (`node server/index.mjs`, real
`DATABASE_URL` + `S3_*` + `NVIDIA_API_KEY` credentials sourced into the
process env, no mocks), or via automated tests over real GLB bytes.

## 1. Live HTTP verification (local server, port 8123–8128, real credentials)

```
$ curl -s -X POST http://localhost:8128/api/forge -H 'content-type: application/json' \
    -d '{"prompt":"a mug","seed":-1}' -w '\nHTTP:%{http_code}\n'
{"error":"invalid_options","errors":[{"field":"seed","message":"seed must be a non-negative integer."}],"message":"seed must be a non-negative integer."}
HTTP:400

$ curl -s -X POST http://localhost:8128/api/forge -H 'content-type: application/json' \
    -d '{"prompt":"a mug","output_format":"webp"}' -w '\nHTTP:%{http_code}\n'
{"error":"invalid_options","errors":[{"field":"output_format","message":"output_format must be one of: glb, glb-draco, glb-meshopt."}],"message":"output_format must be one of: glb, glb-draco, glb-meshopt."}
HTTP:400

$ curl -s -X POST http://localhost:8128/api/forge -H 'content-type: application/json' \
    -d '{"prompt":"a mug","target_polycount":999999999}' -w '\nHTTP:%{http_code}\n'
{"error":"invalid_options","errors":[{"field":"target_polycount","message":"target_polycount must be an integer between 100 and 500000."}],"message":"target_polycount must be an integer between 100 and 500000."}
HTTP:400

$ curl -s -X POST http://localhost:8128/api/forge -H 'content-type: application/json' \
    -d '{"prompt":"a mug","backend":"meshy","texture_size":2048}' -w '\nHTTP:%{http_code}\n'
{"error":"needs_key","provider":"meshy","message":"Meshy 6 needs your own API key. Add a meshy key to use it."}
HTTP:501
```

The last call proves `texture_size` parses and validates cleanly, then the
request reaches the normal BYOK-key dispatch — the new option-parsing step
doesn't disturb existing routing.

`GET /api/forge?catalog` also returned 200 with the full backend/tier/ETA
matrix unchanged in shape (verified `nvidia`, `huggingface`, `trellis`,
`meshy`, `tripo`, `rodin`, `hunyuan3d`, `trellis_selfhost`, `triposg`,
`stability`, `replicate_byok` all present with their existing fields).

## 2. Live provider signal (real NVIDIA NIM round trip, once)

One attempt reached NVIDIA and got a real response before the sandbox's
outbound connection was reclaimed:

```
[forge] free NVIDIA NIM lane unavailable: NVIDIA returned 504
```

That is the exact, documented "flaky synchronous upstream" failure mode the
existing reliability code (untouched by this work order, see `forge.js`'s
`runNvidiaTextLane`/`isUpstreamUnavailable`/cooldown logic) is built to
handle — and it did: the lane was marked in cooldown and the request fell
through the documented fallback chain (trellis → Hunyuan3D → HuggingFace →
paid Replicate), correctly landing on the designed `503 unconfigured` because
none of those lanes had credentials in this minimal-env sandbox. This is a
real, live demonstration of the fallback chain functioning correctly under a
genuine upstream failure — the specific failure this work order's task 2
("no errors without solutions") targets.

## 3. Automated tests against REAL GLB bytes (no mocks on the code under test)

```
$ npx vitest run tests/forge-store-materialize.test.js
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

This new suite feeds `public/avatars/fox.glb` (a real shipped production
asset, 160KB) through the actual `materializeCreation()` → `copyToBucket()` →
`scoreGlbQuality()` / `compressGlb()` pipeline (only the network fetch, DB,
and object-storage calls are stubbed — the same boundary this repo's other
forge tests stub, e.g. `tests/api/forge-free-first.test.js`). It confirms:
  - default behavior (no `quality`/`compress` passed) writes the original
    bytes unchanged and returns `quality: null, compression: null` — 100%
    backward compatible for every existing caller.
  - `quality: true` scores the real fox mesh as `valid`, non-`degenerate`,
    with a real triangle count.
  - `compress: 'meshopt'` runs the real `@gltf-transform` pipeline and the
    bytes actually written to storage are the smaller compressed output
    (not a discarded side stat).
  - an unparseable buffer scores `invalid` without throwing.

```
$ npx vitest run tests/forge-cache.test.js tests/forge-options.test.js \
    tests/glb-quality.test.js tests/glb-compress.test.js
 Test Files  4 passed (4)
      Tests  42 passed (42)
```

These pre-existing suites (built in an earlier, incomplete pass at this same
prompt — see `git log -- api/_lib/forge-cache.js` — but never wired into
`api/forge.js` until now) validate the primitives this work order put into
production: cache-key stability/normalization, option parsing/clamping,
quality scoring thresholds, and real Draco/meshopt compression ratios.

## 4. No regression in the existing forge.js test surface

```
$ npx vitest run tests/forge-high-gate.test.js tests/x402-forge-content-health.test.js \
    tests/x402-forge-error-mask.test.js tests/api/x402-forge.test.js \
    tests/api/forge-free-first.test.js tests/api/forge-credit-exhaustion-rescue.test.js \
    tests/api/avatars-from-forge.test.js tests/forge-high-pay.test.js \
    tests/api/forge-nim-cooldown.test.js tests/api/forge-cache-headers.test.js \
    tests/api/nim-forge.test.js tests/api/forge-poll-error-masking.test.js \
    tests/api/forge-fallback.test.js
 Test Files  13 passed (13)
      Tests  81 passed (81)

$ npx vitest run tests/mcp-studio.test.js tests/mcp-tool-result.test.js \
    tests/forge-humanoid.test.js tests/forge-avatar-humanoid.test.js \
    tests/api/okx-3d-services.test.js
 Test Files  5 passed (5)
      Tests  119 passed (119)
```

Every test file that exercises `api/forge.js`, the MCP mesh/avatar tool
handlers (`mesh_forge`/`forge_avatar`, whose Granite director prompt this
work order rewrote), and the OKX REST twin (`text-to-3d-pro`, which shares
the same director) still passes unchanged.

A full `npx vitest run tests/` (11,696 tests) was also run: 7 pre-existing
failures, none touching a forge/glb/quality/compress/cache/options/director
file — see `gate-after.txt` for the full attribution (each failing file's
last-touching commit was checked and traced to other agents' concurrent,
unrelated work in this shared worktree).

## What shipped vs. what's documented as a scope decision

- **Quality scoring** runs on every completion path, sync and async
  (`materializeCreation({ quality: true })` at all 4 call sites + the
  universal `pollJob` "done" branch).
- **One auto-retry on a flagged low-quality/degenerate result** is
  implemented for the three lanes that complete inline within one request —
  the free NVIDIA NIM sync lane, the HuggingFace Spaces lane, and the BYOK
  synchronous lane (Stable Fast 3D) — where a bounded, in-request retry is
  safe. Async lanes (Replicate/TRELLIS, Hunyuan3D, sketch) get quality
  scoring and flagging but not an automatic background retry: doing that
  safely would need a job-handle redirect mechanism (poll id A silently
  resumes a freshly-submitted job B) that's out of scope for an additive,
  low-blast-radius pass on a live production endpoint. Documented here
  rather than silently skipped.
- **Compression** (`output_format: glb-draco|glb-meshopt`) is wired for both
  sync and async completions — for async lanes via a new short-TTL
  job→options Redis binding (`api/_lib/forge-job-options.js`, mirrors the
  existing `bindJobToCacheKey`/`cacheKeyForJob` idiom) since the poll that
  finishes the job is a separate serverless invocation with no access to the
  original request body.
- **Result caching** is scoped to text→3D, non-high-tier, platform-keyed
  (never BYOK) requests, matching `forge-cache.js`'s own privacy boundary.
  `force_regenerate: true` skips the read.
- **Prompt-director upgrade**: the shared Granite director prompts
  (`api/_lib/forge-director-prompts.js`, new — de-duplicates what were three
  drifting copies in `tools.js`, `rest-services.js`, and now `/forge`) now
  specify per-part PBR material cues, one held art style, fine surface
  detail, and explicit negative-composition constraints (no crop/blur/
  watermark/collage/second subject). The public `/forge` endpoint gained an
  opt-in `director: true` param that runs the same director the free MCP
  tools already use — off by default, fail-soft to the raw prompt on any
  failure.
