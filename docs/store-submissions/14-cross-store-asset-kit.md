# Prompt 14 — Cross-store asset kit + submission tracker

> Paste into a fresh Claude Code chat in the three.ws repo. Follow CLAUDE.md. Use TodoWrite. Run early — every other prompt (03, 06, 07, 10, 12, 13) reuses these assets. Re-run near the end to fill the tracker.

## Context
Every listing — Claude Connectors, Claude plugins, OpenAI Apps, GPT Store, MCP directories — asks for the same raw materials: an icon, screenshots/demo media at specific sizes, a name, a tagline, a short and a long description, categories, and example prompts. Producing these ad hoc per submission causes drift and wasted work. This chat builds **one canonical asset + copy kit** every other prompt draws from, and a **tracker** that shows submission state across all stores at a glance.

Note the two-audience rule: the **paid/crypto-positioned** copy (Claude side) and the **free, zero-crypto** copy (OpenAI side) are different. Maintain both variants; never let a crypto string reach an OpenAI asset.

## Objective
A single source of truth for brand assets and listing copy at every required dimension/length, split into the Claude (full) and OpenAI (zero-crypto) variants, plus a live submission tracker.

## Tasks
1. **Brand assets.** Produce/collect under `docs/store-submissions/_generated/assets/`:
   - App/connector icon at the sizes each store requires (square PNG/SVG; common: 512×512, 256×256, plus favicon). Use the real three.ws mark — find the existing logo in `public/` and export sizes; don't invent a new brand.
   - At least 3 screenshots and 1 short demo capture (GIF/MP4) at the dimensions OpenAI + Claude specify. The hero shot is a **real generated 3D model rendering inline** (reuse prompt 05/07 output). Capture from the real app, not mockups.
2. **Copy matrix.** Create `docs/store-submissions/_generated/listing-copy.md` with, for **each** of `{Claude-full, OpenAI-free}`:
   - Name candidates (descriptive, IP we own, no generic dictionary word for OpenAI).
   - Tagline (≤60 chars), short description (≤2 lines), long description.
   - Category + tags per store.
   - 4–6 example prompts that reliably demo the product.
   - Keep the OpenAI variant provably crypto-free; keep the Claude variant `$THREE`-only.
3. **Example-prompt validation.** Actually run each example prompt against the relevant live surface and confirm it produces the described result. Drop any that don't. Paste evidence.
4. **Compliance gate on assets.** grep all generated copy + asset filenames/alt-text for coin/token/wallet/x402/pump/aixbt strings; the OpenAI variant must be zero. Paste the result.
5. **Submission tracker.** Create `docs/store-submissions/_generated/TRACKER.md`: a table of every target (Claude Connectors, Claude plugin marketplace, Claude Skills pack, OpenAI Apps, OpenAI GPT Store, official MCP registry, Smithery, Glama, mcp.so, PulseMCP, LobeHub) × columns: status (not-started / blocked / ready-to-submit / submitted / live), owning prompt file, blocking `[HUMAN: ...]` items, listing URL once live. Initialize from the current repo state.
6. **Changelog.** No user-visible product change here — this is internal submission tooling, so **no changelog entry** (per CLAUDE.md, internal-only chores are skipped). State that explicitly in the report.

## Verification (must actually run)
- Every required asset exists at the correct dimensions (list them with sizes).
- Every example prompt in the copy matrix was run and produced the claimed result.
- The OpenAI-variant compliance grep returns zero crypto hits (paste it).
- The tracker reflects actual current state of each target.

## Definition of done
- Canonical assets + dual-variant copy matrix complete and validated against the live app.
- Tracker initialized and accurate. No changelog entry (internal tooling).

## Hand-off
Report the asset inventory with sizes, the copy-matrix path, the validated example prompts, and the tracker path with current per-target status. This kit is the input to 03, 06, 07, 10, 12, 13 — note which assets each consumes. Commit/push only if asked; stage touched paths; both remotes.
