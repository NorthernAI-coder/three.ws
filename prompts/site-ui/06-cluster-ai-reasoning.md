# Site UI — cluster: AI & reasoning

You are working in `/workspaces/three.ws`. Apply the shared game-feel library to the
**AI / reasoning** surfaces — copilots and the reasoning ledger. These stream model output
and decisions; the UI should make thinking *visible* and legible, not a wall of text.

**Prerequisite:** `src/ui-juice.js` from `prompts/site-ui/01-foundation-juice-library.md`.
Run that first if it's missing.

## Surfaces in this cluster

`src/agi.{js,css}`, `src/alpha-copilot.{js,css}`, `src/reasoning-ledger.{js,css}`.

These touch LLM output. If you adjust any model call, model id, or provider behavior,
consult the `claude-api` skill first per the harness rules — but most of this work is the
**presentation** layer, not the model calls.

## The treatment (apply what fits each surface)

1. **Streaming with intent.** Where tokens/steps stream in, use `enterRow`/staggered reveal so reasoning steps land legibly instead of dumping. A `liveDot` for active generation. Honest streaming state from the **real** stream — never a fake typewriter over already-complete text.
2. **The reasoning ledger as a feed.** `reasoning-ledger`: each logged decision enters with `enterRow`; outcome/score values get `countUp`/`flashValue`; a `sparkline` of decision quality over time if the data is real. Make the ledger feel alive and auditable.
3. **Copilot affordances.** `agi`, `alpha-copilot`: polished input states, real in-flight indicators (no fake progress), clear error/retry on a failed call, designed empty state ("ask me…") that guides the user.
4. **Surface the signal.** Where the copilot returns structured results (signals, recommendations), render them as scannable cards with the deciding metric dominant — not raw text where structure exists.
5. **State coverage + consistency.** Loading/empty/error/overflow all designed; tokens from `public/tokens.css`; hover/active/focus everywhere; match `/swarms` vocabulary.

## Rails (non-negotiable)

- Tokens only. No raw hex/px/ms where a token exists.
- Reduced motion verified (token override + library final-state paths). Streaming reveals must degrade to instant under reduced motion.
- **No fake data, no fake streaming** — every token/step/value comes from the real model stream or API. Don't simulate thinking over static content.
- Consult `claude-api` before changing any model call; default to presentation-only changes.
- Concurrent agents edit `main`: stage explicit paths only, re-check `git status`, never `git add -A`.

## Definition of done (per surface)

- `npm run dev`, run a real copilot query / load the real ledger — confirm streaming reveals, count-ups, and states behave against real data. No console errors.
- All states verified. Reduced-motion verified. `npm test` passes.
- `data/changelog.json` entry per surface (or batched), tag `improvement`.
- Review your `git diff`. Don't commit unless asked.

Track with TodoWrite (one item per surface); report done vs deferred.
