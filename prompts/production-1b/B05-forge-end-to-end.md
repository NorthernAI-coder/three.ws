# B05 — Forge (text/image → 3D) end-to-end production pass

> Phase B · Depends on: D01 (pipeline) ideally · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
Forge is the platform's "wow" — text/photos → a real 3D model — and a primary paid surface
(quality tiers). The magic only converts if it's reliable and honest about progress,
failures, and cost. Take the whole generate → reveal → refine → pay loop to production.

## Where this lives (real files)
- `src/forge.js` (~2.5k lines) + `src/forge-pay.js`, `src/forge-enhance.js`, `src/forge-prompt-studio.js`, `src/forge-optimize.js`, `src/forge-reveal.js`, `src/forge-ar.js`.
- `api/forge.js`, `api/x402/forge.js`, `api/_lib/forge-health.js`, `api/_lib/forge-tiers.js`.
- Generation workers: `workers/model-*`, `workers/trellis`, etc.; free lane: NVIDIA NIM (TRELLIS).

## Current state & gaps
- 5-min poll can time out silently; engine failures don't say which engine or why; high-tier payment integration (`forge-pay.js`) handoff unclear; sketch-mode availability depends on a catalog health check with no clear fallback; multi-view fusion doesn't show which views were used; free-tier rate limits aren't surfaced; AR/download not validated on mobile.

## Build this
1. **Honest progress:** real per-stage progress; on timeout, a "taking longer than usual — keep waiting / retry / try another engine" state, never a silent stall.
2. **Engine transparency + fallback:** show the active engine + health; on failure, name it and auto-fall-back across the engine chain (free NIM/TRELLIS primary), surfacing what happened.
3. **Paid tiers wired:** Pro/High generation routes cleanly through `forge-pay.js` + the 402 modal (A11), tier discount applied (A03); show cost before charging; receipt after.
4. **Quotas surfaced:** show remaining free generations and the upgrade path when the free lane is exhausted.
5. **Result actions:** reliable download (GLB), AR (WebXR/Quick Look) tested on mobile, save-to-account, list-on-marketplace, and "rig + animate" handoff (D01).
6. **All states + a11y + mobile:** loading/empty/error designed; keyboard + screen-reader labels; usable at 320px.

## Out of scope
- The generation worker internals/pipeline reliability (**D01**) — wire to and surface them.

## Definition of done
- [ ] No silent timeouts; engine failures are explained and fall back; sketch/multi-view degrade gracefully.
- [ ] Paid tiers charge correctly (tier discount applied) with cost preview + receipt; free quota shown.
- [ ] Download + AR + save + list all work, verified on mobile.
- [ ] `npx vitest run` green; changelog entry; committed + pushed to both remotes.

## Verify
- Generate free + paid; force an engine failure → fallback + message; test AR + download on a phone.
