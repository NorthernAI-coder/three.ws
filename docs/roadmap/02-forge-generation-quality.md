# Prompt 02 — Forge generation: quality, reliability, speed (additive)

> Paste into a fresh Claude Code chat. Follow CLAUDE.md + `docs/roadmap/00-README.md`. Run `npm run gate` before and after. Prereq: 01 recommended.

## Context
The Forge pipeline (`packages/forge/`, `api/forge*.js`, `api/mcp-3d.js`) turns text/image/sketch into textured, rig-ready GLBs — free TRELLIS lane + paid tiers + auto-rig, with an IBM Granite prompt director. It's the heart of the platform. Improve it **without** changing existing tool names, default behavior, or response shapes.

## Objective
Make Forge generations **higher quality, more reliable, faster, and more useful** through additive options and internal hardening.

## Tasks (additive / back-compatible)
1. **Prompt-director upgrade.** Improve the Granite-directed prompt expansion (better geometry/material cues, negative prompts, style consistency). Keep the raw user prompt path intact; the director is an enhancement, not a replacement. Measure quality on a fixed prompt set before/after.
2. **Reliability & fallbacks.** Audit each provider call (TRELLIS/Hunyuan3D/Replicate). Add real retries with backoff, lane failover (free NIM lane cold-start handling), and a clear, actionable error at the boundary when all lanes fail. No silent failures, no fake progress. (CLAUDE.md: "No errors without solutions.")
3. **Result caching.** Add content-addressed caching keyed on (normalized prompt + params) so identical requests don't re-pay/re-compute. Cache GLB URLs with sane TTL. Opt-out param for force-regenerate. Must not serve a different user's private asset.
4. **Output options (new params, default off).** Add optional: polycount/quality tier, format (GLB default; optional Draco/meshopt-compressed variant), texture resolution, and a `seed` for reproducibility. Document them; old calls behave identically.
5. **Quality scoring.** Add an internal post-generation check (valid glTF, non-degenerate mesh, has textures, watertight-ish) that flags low-quality outputs and auto-retries once before returning. Return a quality signal in metadata.
6. **Speed.** Profile the path; parallelize independent steps (e.g. texture + rig prep), lazy-load heavy deps, stream where the provider supports it.

## Non-negotiables
- Existing Forge tool names, default params, and response shapes unchanged. New params optional, defaulting to current behavior.
- Real generation only; no canned/sample GLBs.

## Verification
- Run a fixed 10-prompt benchmark before/after; save GLB URLs + the quality signal to `docs/roadmap/_generated/02/benchmark.md`. Demonstrate measurable improvement (quality flag rate down, success rate up, latency same-or-better).
- Force a provider failure and confirm graceful failover + actionable error.
- Cache hit path returns instantly and never crosses user boundaries.
- `npm run gate` green. Changelog entry added; `npm run build:pages` passes.

## Definition of done
- Better, more reliable, optionally-tunable Forge output with caching and real failover — fully backward compatible.

## Hand-off
Report the benchmark delta, new optional params, and cache/failover behavior. Commit/push only if asked; both remotes.
