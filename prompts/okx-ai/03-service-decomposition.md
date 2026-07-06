# Work Order 03 — Decompose the 3D Studio into micro-priced A2MCP services

Read `prompts/okx-ai/00-CONTEXT.md`, `specs/okx-agent-payments.md`, and
`prompts/okx-ai/PROGRESS.md` (02 must be done — OKX rail live on the endpoint). Read
`/workspaces/three.ws/CLAUDE.md`. All bind you.

## Mission

The marketplace evidence is unambiguous: the top seller (174 sales) wins with **many tiny,
sharply-named, individually-priced A2MCP endpoints + free discovery**; the mega-catalog
seller (100+ services, one price) has zero. Our current listing is one mega-endpoint.
Restructure our offering into discrete services — each with its own URL, price, and
one-sentence-clear purpose — while keeping ONE implementation underneath.

## Target service catalog

Each row becomes: a distinct routable endpoint URL + a service entry for the #2632 listing
(the listing update itself is Work Order 05 — you build and document; 05 lists).

| Service | Backing capability (verify each in code first) | Price target |
|---|---|---|
| 3D Health & Catalog | free discovery: live status + machine-readable service index | free |
| Text → 3D Model (GLB) | free NIM/TRELLIS lane (`forge_free` path) | $0.01 |
| Text → 3D Model (Pro) | quality-tier generation (`mesh_forge` chain) | $0.30 |
| Image → 3D Model | image lane of mesh generation | $0.30 |
| Auto-Rig a GLB | rig pipeline (`rig_mesh`: skeleton + skinning, humanoid gate) | $0.25 |
| Text → Rigged Avatar | full chain (`forge_avatar`) | $0.50 |
| Animation Retarget | clip retargeting onto arbitrary humanoid rigs | $0.10 |
| Pose Seed | `get_pose_seed` | $0.02 |
| FBX Export (rig-preserving) | export path (Unity/Unreal-ready) | $0.10 |

Before building: open the MCP server code and confirm what each service maps to. If a row
has no real backing capability, CUT THE ROW and record why in PROGRESS.md — never ship a
service whose backend doesn't exist (CLAUDE.md hard rule). If a capability exists that isn't
listed here and fits the pattern, add it. Sanity-check prices against unit cost (GPU lane
cost per call — check the worker/proxy code) so no service sells below cost; adjust and
record the math.

## Architecture requirements

1. **One implementation, many fronts.** Routes like `/api/okx/3d/<service>` (follow existing
   `api/` routing conventions — read vercel.json and neighboring routes first) that map onto
   the existing MCP tool implementations. No logic duplication: thin routing + per-service
   pricing over the same engine mcp-3d.js uses.
2. **Per-service 402.** Each paid endpoint advertises ITS OWN price (via 02's OKX challenge
   builder) — one service, one price, no batch ambiguity. The paid replay executes exactly
   that service.
3. **Free lane is a real product.** Health returns live subsystem status (real checks against
   the actual GPU/proxy lanes, not `{ok:true}` hardcoded); Catalog returns the full service
   index — names, descriptions, prices, endpoint URLs, input schemas — generated FROM the
   catalog source-of-truth, so it can never drift from the listing.
4. **Catalog as data.** One module (e.g. `api/_lib/okx-catalog.js`) defines the catalog:
   name, 2-part description (① capability ② what the caller must provide — OKX's required
   format, ≤200 display-width chars each part), price string, endpoint URL, input schema.
   Endpoints, the free catalog service, tests, AND Work Order 05's listing update all read
   from this one module.
5. **Async jobs handled honestly.** Generation can take minutes. Follow the pay→job→poll
   pattern the existing forge endpoints use (status/preview polling free, per our listing
   description promise: "you pay only after a job succeeds; discovery, status, preview free").
   Verify how the existing pipeline sequences payment vs job completion and keep that
   contract.

## Testing (every service, no sampling)

- Unit tests: catalog integrity (every entry has all fields, prices parse, descriptions
  within length limits measured in East-Asian display width per the OKX rule), route→tool
  mapping, per-service 402 amounts.
- Integration, per service: unpaid call → correct 402 with correct price; paid path → real
  output (run the cheap/free lanes for real; for expensive GPU lanes run at least one real
  generation and verify the returned GLB parses — three.js loader or existing test utils).
- Free lane: health reflects a real dependency check; catalog validates against the catalog
  module 1:1.
- `npm test` green. Deploy to preview, re-verify one paid 402 + the full free lane against
  the deployed URLs.

## Definition of done

- [ ] Catalog module = single source of truth; all endpoints live on preview; zero stubs
- [ ] Every service backed by a verified-real capability; cut/added rows documented
- [ ] Per-service integration test evidence pasted (curl captures) in PROGRESS.md
- [ ] `npm test` green, output pasted
- [ ] Docs: `docs/okx-marketplace.md` — what each service does, pricing, one runnable curl
      example per service (real URLs); linked from `docs/start-here.md`; `STRUCTURE.md` row
      added for the new surface
- [ ] `data/changelog.json` entry (tags: `feature`; e.g. "3D generation, rigging, and export
      now available as individually-priced services for AI agents")
- [ ] `prompts/okx-ai/PROGRESS.md` appended incl. the FINAL catalog table (names, 2-part
      descriptions, prices, URLs) that 05 will submit verbatim
- [ ] Self-reviewed diff; committed (explicit paths) + pushed to both remotes

## Anti-laziness gates

- "The route exists and returns 402" is not done — the PAID path must produce the real
  artifact for every service you ship.
- Don't skip the display-width validation on descriptions (CJK=2, ASCII=1). OKX rejects
  over-length listings; catching it at review costs a week — 05 depends on these strings
  being submittable as-is.
- If GPU-lane funding/credits block a real generation test, run every lane that IS free,
  document exactly which paid lane needs what, and ask the owner — don't mark the row done.
