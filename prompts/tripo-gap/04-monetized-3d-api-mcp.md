# Task: Monetized public 3D-generation API + MCP tools (x402-gated)

## Why this exists

Tripo's commercial moat is a documented, credit-metered public API plus official
MCP generation tools (`text_to_3d`, `image_to_3d`). We have the generation
pipeline (`api/forge.js`) but it isn't packaged as a public, paid, documented
product, and our MCP server is pump-focused rather than exposing 3D generation.

Our structural advantage is **x402 + agent-payments**: an API that AI agents can
discover and pay for **autonomously**, in USDC, without a human signing up for a
credit plan. Tripo cannot copy this without rebuilding their billing around
agent payments. This task turns forge into that product: an x402-gated public
generation API and matching MCP tools.

## Rails (CLAUDE.md — non-negotiable; read the full file first)

- **No mocks, no fake data, no placeholders.** Real forge pipeline, real x402
  payment verification, real USDC settlement via the existing payment stack. No
  fake "payment accepted" path.
- **No TODOs, no stubs, no commented-out code, no `throw new Error("not implemented")`.**
  Wire 100%: x402 challenge → payment → generation → result.
- **The only coin is `$three`** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).
  Never reference, hardcode, or surface any other coin or token. Payments settle
  in USDC via the existing x402 plumbing where USDC is the protocol unit — that
  is generic payment rails, not a coin reference. Never display another token.
- **Done = a third-party caller (and an MCP client) can pay and generate
  end-to-end**, with docs, `npm test` green, `git diff` self-reviewed. Run the
  **completionist** subagent before stopping.
- **Push only when the user says so**, then to BOTH remotes (`threeD`, `threews`).

## Explore first (spawn before writing code)

### Subagent A (Explore) — the x402 / payment surface
> In `/workspaces/three.ws`, quote how an existing x402-gated endpoint works
> end-to-end. Read `api/x402/pump-launch.js` and `api/x402/vanity.js` (and any
> `api/x402/_lib`): the 402 challenge/response shape, how a payment proof is
> verified, what settles the USDC, and how price is declared. Also quote the
> `agent-payments-sdk/` public API and how `api/_lib` exposes payment helpers.
> I am adding a new x402-gated generation endpoint that must reuse this exactly.

### Subagent B (Explore) — forge internals + MCP server
> In `/workspaces/three.ws`, quote:
> 1. `api/forge.js` — the full submit/poll contract and `?catalog`, plus
>    `api/_lib/forge-tiers.js` cost/ETA fields.
> 2. The MCP server: where tools are defined (`api/_mcp/tools/` and the
>    `@3d-agent/mcp-server` package — find its source), how a tool is registered,
>    its input schema, and how it authenticates/meters. Quote one existing tool
>    (e.g. `api/_mcp/tools/animations.js`) verbatim as the template.
> 3. How usage/billing is currently metered (`usage_events`, plan gating — see
>    `api/avatar/video-generate`).

Wait for both before starting.

## What to build

### Step 1 — the x402-gated generation endpoint

Create `api/x402/forge.js` (or `api/x402/generate.js`) reusing the exact x402
pattern from Subagent A:

- Unpaid request → `402` with a price challenge derived from
  `api/_lib/forge-tiers.js` (draft/standard/high each priced; image vs text vs
  geometry path priced per the catalog).
- Valid payment proof → submit to the forge pipeline, return `202 { job_id }`.
- `GET` poll returns the forge status shape (`status`, `glb_url`,
  `preview_image_url`, `error`, `backend`).
- Price must be declared in the response and in `?catalog` so callers (human or
  agent) know the cost before paying.
- Real settlement via the existing payment stack — no bypass, no "free if header
  X" backdoor.

### Step 2 — MCP generation tools

Add to the MCP server (matching the `api/_mcp/tools/` registration pattern and
the `@3d-agent/mcp-server` package):

- `text_to_3d(prompt, tier?, backend?, aspect_ratio?)` → returns a job handle /
  result URL.
- `image_to_3d(image_url|image_urls, tier?, backend?)` → same.
- Each tool declares its price and pays via the agent-payments path so an agent
  using the MCP server settles autonomously. Reuse the metering/plan logic for
  any platform-account callers.
- Keep input schemas tight and validated; real errors on failure.

### Step 3 — OpenAPI + docs

- Publish an OpenAPI schema for the public generation API (submit, poll,
  catalog, pricing). Put it where the repo keeps API docs (check existing docs
  layout; otherwise `docs/api/forge-openapi.json` + a short `docs/api/forge.md`).
- The docs must include: auth/payment flow, pricing table (sourced from
  `forge-tiers.js`), request/response examples, and a worked x402 example using
  the agent-payments path. No other-coin references; USDC only where the protocol
  unit appears.

### Step 4 — rate / abuse guards

- Reuse the existing rate-limit + SSRF patterns already used by the public
  renderers (`api/render/glb.js` has a real SSRF guard + per-IP limit — match
  it). Image URLs supplied by callers must pass the SSRF guard before the worker
  fetches them.
- Set a sane `maxDuration` in `vercel.json` for the new endpoint consistent with
  other forge routes (generation is polled, not held — the function returns a
  job id quickly).

### Step 5 — tests

- Endpoint test: unpaid request → 402 with correct price; valid stubbed payment
  proof → job submitted; poll returns the forge shape. Stub the payment verifier
  and the forge submit at module boundaries.
- MCP tool test: `text_to_3d` / `image_to_3d` validate input, declare price,
  and route to the generation path (forge submit stubbed).
- Pricing test: catalog prices match `forge-tiers.js` (single source of truth —
  do not hardcode prices in two places).
- `npm test` green.

### Step 6 — docs / progress

- PROGRESS.md item.
- If this supersedes the API-key step in `03-blender-comfyui-plugins.md`, note
  that the plugins should target this public surface.

## Definition of done

- A third-party `curl` (or agent) hits the endpoint, receives a 402 with a real
  price, pays via x402/USDC, and gets a generated GLB — fully real, no bypass.
- `text_to_3d` and `image_to_3d` work as MCP tools with autonomous payment.
- OpenAPI schema + docs published; prices sourced solely from `forge-tiers.js`.
- SSRF guard + rate limit on caller-supplied inputs.
- `npm test` green; `git diff` self-reviewed; completionist run and findings fixed.

## Constraints

- Reuse the existing x402 + agent-payments stack — do not invent a parallel
  payment flow.
- Single source of truth for pricing (`forge-tiers.js`). No duplicated price
  constants.
- USDC is the only token surfaced, and only as the x402 protocol unit. Never
  reference any coin other than `$three`.
- No unpaid/backdoor generation route. No fake payment-accepted path, including
  in tests' happy path (stub at the verifier boundary, not by faking success
  inside the endpoint).
