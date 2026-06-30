# Site-wide UI/UX — game-feel rollout

Phase 2. The `prompts/swarms-ui/` set proved the pattern on one page. This set takes the
same bar to **every front-end surface** (~31 paired `src/<name>.js` + `.css` modules,
mapped in `STRUCTURE.md` and `data/pages.json`).

The key realization: don't re-implement count-ups, flashes, sparklines, and FLIP reorders
31 times. **Extract them once, adopt them everywhere.** Run these in order:

1. [`01-foundation-juice-library.md`](01-foundation-juice-library.md) — **run first.** Extract the proven game-feel primitives into one reusable, token-driven, reduced-motion-safe module (`src/ui-juice.js`). Everything else depends on this.
2. [`02-audit-and-prioritize.md`](02-audit-and-prioritize.md) — a real audit of all front-end surfaces; outputs a prioritized rollout table so the cluster work is data-driven, not guessed.
3. Cluster prompts — apply the foundation library, surface by surface. Order them by the audit's priority:
   - [`03-cluster-markets-standings.md`](03-cluster-markets-standings.md) — leaderboard, trader, signals, radar, pulse, watchlist, clash, vaults, labor-market (the compete-shaped surfaces — biggest payoff).
   - [`04-cluster-launch-flow.md`](04-cluster-launch-flow.md) — launches, launch-detail, launch-copilot, user-launcher, admin-launcher, deployments, genesis.
   - [`05-cluster-agents-identity.md`](05-cluster-agents-identity.md) — agent-detail, agent-picker, character(s), character-creator, avatar-gallery-picker, first-meet, theater, three-gate.
   - [`06-cluster-ai-reasoning.md`](06-cluster-ai-reasoning.md) — agi, alpha-copilot, reasoning-ledger.

Each cluster prompt is self-contained — open it in a fresh chat. They assume `01` has
shipped `src/ui-juice.js`; if it hasn't, run `01` first.

## The shared rails (every prompt restates these — non-negotiable)

- **Design tokens only.** Color/space/type/motion from `public/tokens.css` CSS variables. The motion ladder (`--duration-fast|base|slow`, `--ease-standard|emphasized|out`) and its global `prefers-reduced-motion` override already exist — *use the tokens* and reduced-motion safety comes for free. Never hardcode a hex, px, or raw `Xms` where a token exists.
- **Motion signals, never decorates.** No confetti, no sound, no gratuitous shimmer. Count-up, directional flash, snap, single accent ripple, FLIP reorder — that's the vocabulary.
- **No fake data.** Animate transitions between *real* values only. No invented data, fake progress, or `setTimeout` fake-loading (CLAUDE.md hard rule).
- **Consistency over cleverness.** Every surface should feel like the same product. Adopt the shared library; don't invent a per-page dialect.
- **Concurrent agents share this worktree.** Stage explicit paths only, re-check `git status` before committing, never `git add -A`. Don't commit unless the user asks.
