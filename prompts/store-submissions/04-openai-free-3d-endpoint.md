# Prompt 04 — OpenAI free, non-crypto 3D-generation MCP endpoint

> Paste into a fresh Claude Code chat in the three.ws repo. Follow CLAUDE.md. Use TodoWrite. Prereq: prompt 01 (tool inventory) helpful.

## Context
OpenAI's ChatGPT App Directory will **reject** our current MCP servers: their policy prohibits "tokens or credits," "embedded third-party payment solutions," and "crypto speculation schemes." So x402-per-call and every token/pump.fun tool are disqualifying.

The way in is a **separate, free, non-crypto app**: a clean MCP endpoint exposing only 3D-generation tools, with **zero** payment surface and **zero** token/crypto surface. This is a genuinely strong ChatGPT app — "turn a text prompt into a rigged 3D avatar" is real utility ChatGPT can't do natively.

Re-read the guidelines first: https://developers.openai.com/apps-sdk/app-submission-guidelines

## Scope — tools to expose (and ONLY these)
- `forge_free` — text → textured 3D GLB (free NVIDIA NIM / TRELLIS lane).
- `text_to_avatar` — text/image → 3D avatar GLB.
- `mesh_forge` — text/image → 3D mesh GLB.
- `rig_mesh` — static GLB → animation-ready rigged GLB.
- `forge_avatar` — one-call text → rigged avatar.

**Explicitly excluded:** every token/market/wallet/agent tool (`pump_snapshot`, `sentiment_pulse`, `vanity_grinder`, `aixbt_*`, `agenc_*`, `agent_*`, `ens_sns_resolve`, `get_pose_seed` is borderline—include only if it has no crypto framing). No `$THREE` or any coin mention anywhere in this endpoint, its descriptions, or its responses.

## Objective
Ship a new remote MCP endpoint `api/mcp-studio.js` (route `/api/mcp-studio`, e.g. branded "three.ws 3D Studio") that serves the five tools above **for free** — no x402, no `PaymentRequired`, no wallet — reusing the existing generation handlers.

## Tasks
1. **Create the endpoint** mirroring the structure of `api/_mcp3d/` but with the payment middleware removed. Reuse the real generation handlers — do not fork or mock them. The free NVIDIA NIM lane backs `forge_free`; for `text_to_avatar`/`mesh_forge`/`forge_avatar`/`rig_mesh`, the underlying providers (Replicate/TRELLIS/UniRig) currently sit behind x402. Decide the funding model and implement it for real:
   - Server-side API keys cover the provider cost (the app is free to the ChatGPT user). Add sane **rate limiting / abuse protection** (per-session or per-IP quota) since it's unauthenticated and costs us money. Implement real limits, not a comment.
2. **Tool definitions:** copy/trim from the inventory, ensure each has `title` + correct annotations. These are generation tools → `readOnlyHint: false`, `destructiveHint: false`, `openWorldHint: true` (external model APIs), `idempotentHint: false`. Inputs minimal and task-specific (a prompt, optional image, optional style) — no "just in case" fields, no chat-history requests (OpenAI checks this).
3. **Responses return only what's needed:** the GLB URL, a viewer link, and minimal metadata. **Strip** internal identifiers (session IDs, trace IDs, wallet addresses, x402 fields, pricing) — OpenAI rejects responses leaking internal/PII/auth data. Add structured content the Apps SDK component (prompt 05) can render: the GLB URL under a documented key.
4. **Register the route** in `vercel.json` with an appropriate `maxDuration` (generation is slow). Add `/.well-known` OAuth only if you choose authenticated mode — for a free app, no-auth is acceptable and simpler; confirm the Apps SDK supports the chosen auth mode.
5. **Manifest:** add `server-studio.json` describing this endpoint (no coin references, free, the five tools). Keep schema URL current.
6. **Docs + changelog:** add `docs/mcp-studio.md` (how to connect the free 3D Studio MCP) and a `data/changelog.json` entry; run `npm run build:pages`.

## Verification (must actually run)
- `npm run dev`, then `tools/list` on `/api/mcp-studio` returns exactly the five tools with titles + annotations and **no** payment/token fields anywhere.
- Call `forge_free` and `text_to_avatar` through the new endpoint with **no auth and no payment** — both return a real GLB URL you can open. Paste the URLs.
- Rate limiting demonstrably triggers after the configured quota.
- `grep` the new endpoint + manifest + docs for any coin/token/x402/wallet string — must be clean.
- `npm test` green (add a test asserting the studio endpoint exposes only the allowed tools and no payment surface).

## Definition of done
- `/api/mcp-studio` serves five generation tools, free, no crypto/payment surface, with real abuse protection and clean responses.
- Manifest + docs + changelog done. Tests green. Zero coin references.

## Hand-off
Report the endpoint URL, the funding/rate-limit approach, sample GLB URLs, and the structured-content key the component should read. Feeds prompt 05 (UI) and 06 (submission). Commit/push only if asked; stage touched paths; both remotes.
