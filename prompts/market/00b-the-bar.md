# The Bar — what "production-ready" and "$1B" mean concretely

Every agent in this campaign reads this before starting. "Make it good" is not a spec.
This is the spec. These are the measurable thresholds that separate a demo from a platform
worth a billion dollars. When your task is done, it clears these bars — or it isn't done.

---

## 1. Reliability bars (Track A is the gate for all of these)

- **No unhandled rejections, no uncaught exceptions** reach the user. Every network call,
  every wallet/RPC interaction, every payment has an error boundary that produces an
  *actionable* state — never a blank screen, a spinner that spins forever, or a raw stack trace.
- **No money is ever lost or double-spent.** Payment, mint, send, and trade paths are
  idempotent, retry-safe, and confirm on-chain before claiming success. A failed transaction
  surfaces a clear "this did not go through, your funds are safe" state.
- **Graceful degradation, always.** When an upstream is down (a 3D engine, an RPC, an LLM,
  pump.fun), the surface degrades to a useful state with a real retry — exactly the failure
  we already see on Forge ("free engines all busy"). That state must offer a path forward
  (switch engine, queue, notify-me), not a dead end.
- **Observability is total.** Every error is captured (Sentry/Axiom — already wired in
  `api/_lib/sentry.js`, `api/_lib/axiom.js`, `api/client-errors.js`), every paid call is
  traced, every worker reports health. If it can fail silently today, it can't after.

## 2. Performance bars

- **Largest Contentful Paint < 2.5s, CLS < 0.1, INP < 200ms** on a mid-tier mobile over 4G,
  on every primary surface. `.lighthouserc.json` already exists — wire it into CI and hold it.
- **3D loads progressively.** No surface blocks on a multi-MB GLB. Lazy-load Three.js and
  heavy modules, show a real loading skeleton, draco/meshopt-compress assets, dispose GPU
  resources on unmount. 60fps on the avatar presence; no jank on scroll.
- **No layout shift, no FOUC.** Theme boots before paint (`inject-theme-boot.mjs` exists).
  Fonts and tokens resolve before content renders.

## 3. Polish bars (the "screenshot test")

For every surface, all five states are deliberately designed and reachable:
- **Loading** — skeleton screens that match the populated layout, not a centered spinner.
- **Empty** — explains what this is and gives the user the next action (a button, an example,
  a prompt idea). Never a blank void or the word "No data."
- **Error** — names what went wrong in plain language and gives a real recovery action.
- **Populated** — the design tokens, spacing rhythm, and typography are consistent with the
  rest of the platform. Microinteractions (hover, active, focus, state-change transitions).
- **Overflow** — 0, 1, 1000 items; a 200-character name; a wallet with $0 and one with $10M.

Plus: keyboard-navigable, screen-reader-labelled, `prefers-reduced-motion` honored, contrast
≥ WCAG AA, responsive at 320 / 768 / 1440px. **If you would not screenshot it and post it,
raise it before moving on.**

## 4. Trust & correctness bars

- **The only coin is `$THREE`** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Zero
  references to any other token anywhere — code, copy, tests, fixtures, metadata. (Runtime
  user-launch directories are the sole mechanical exception per `CLAUDE.md`.)
- **No secrets in the client.** Every API key lives server-side behind a proxy. Grep the
  built client bundle for key patterns as part of done.
- **Inputs are validated at the boundary** and trusted internally. Rate-limited where
  abusable (`@upstash/ratelimit` is available). CSRF-protected where state-changing
  (`api/csrf-token.js` exists).
- **Honest UI.** No fake progress bars, no `setTimeout` loaders, no sample arrays shipped to
  production, no "coming soon" buttons that look live. If it renders, it works.

## 5. Growth & monetization bars

- **Activation is measured.** Every primary surface emits real analytics events
  (`src/acquisition-analytics.js` exists) into a funnel you can read. "We think users like
  it" is not data.
- **The first-run path reaches value in under 60 seconds** with no signup wall before the
  first "wow" (the Forge free lane, the walk companion, a sample agent).
- **Every shareable moment has an OG card and a share action.** A generated model, a trade
  win, an agent profile — each produces a link that unfurls beautifully (many `*-og.js`
  endpoints already exist; make them universal and gorgeous).
- **$THREE holding unlocks visible, consistent value** across every surface that gates on it
  (we already gate Forge "High quality" on holders) — same tiering, same upgrade path,
  everywhere. Revenue surfaces (billing, x402 paid endpoints, marketplace fees) actually
  charge, actually settle, actually reconcile.

## 6. Ecosystem bars

- **An outside developer can go from zero to a working integration in 10 minutes** using the
  published docs and an SDK, without reading our source.
- **Every SDK and MCP server has:** a real README with a copy-paste quickstart, typed
  surfaces, a runnable example, semantic versioning, and a smoke test in CI
  (`audit:mcp`, `smoke:mcp`, `test:mcp` already exist — they must pass and be enforced).

---

## How to use this doc

When you pick up a prompt, map its task to the bars above and treat the relevant ones as
acceptance criteria. In your completion report, state which bars you cleared and how you
verified each (the number, the screenshot, the trace, the passing test). "Looks good" is
not verification. A measured threshold is.

The accumulation of these decisions — every state designed, every error caught, every
millisecond shaved, every surface shareable — *is* the difference between a project and a
billion-dollar platform. There is no single feature that gets us there. There is only the
bar, held on every surface, every time.
