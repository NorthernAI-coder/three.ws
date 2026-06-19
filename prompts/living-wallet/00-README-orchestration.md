# Program: The Living Wallet — every avatar is an embodied, autonomous, social financial identity

> **Read this file in full before starting any task in this folder.** Every prompt
> here (`01-*` … `09-*`) assumes the context below and does not re-derive it. Each
> task is self-contained enough to hand to a fresh agent chat with no other briefing.

---

## Why this program exists

three.ws already ships the table-stakes wallet layer (see the sibling program
[`prompts/agent-wallets/`](../agent-wallets/): identity chip, HUD/drawer, vanity
studio, fork-to-own, sniper copilot, coverage QA). That work makes the wallet
**present and correct everywhere**. Necessary — but it is what a good team would
build. This program is what a *category-defining* team builds on top of it.

**The thesis.** Every crypto wallet on earth is a spreadsheet behind a connect
button. three.ws is the only place where a wallet belongs to a **living 3D agent**
that you can see, talk to, send into a world, and let act on its own. So our wallet
should be the only one that is **embodied** (you can see its wealth on the avatar's
body), **autonomous** (it runs strategies its owner taught it), **social** (two
avatars transact face-to-face in a shared world), **reputable** (its on-chain life
earns it standing), and **portable** (it monetizes anywhere it's embedded). Nobody
can copy this without first building the agent, the avatar, and the world. We can.

The bar for every task: **a stranger sees it once and screenshots it.** If a feature
would not make a trader switch platforms or a non-crypto user say "wait, that's
mine?", it is not done — raise it until it would.

---

## The ownership model — already correct in the backend, NEVER violate it

This is the rule the user cares about most. The backend already enforces it; your UI
must make it **legible and delightful** and must never leak across roles.

- **You own the wallet of the avatar you created.** Creating/uploading an avatar
  makes an `agent_identities` row with `user_id = creator` and provisions a fresh
  custodial Solana + EVM wallet (`api/_lib/agent-wallet.js`,
  `api/_lib/avatars.js` / `avatar-agent.js`).
- **Forking someone else's avatar mints a NEW wallet for the forker.**
  `POST /api/agents/fork` and `POST /api/avatars/fork` create a brand-new agent row
  owned by the caller, copy the GLB into the caller's namespace, **never copy wallet
  secrets**, and call `provisionAgentWallets()` for fresh keys. Lineage lives in
  `meta.forked_from`.
- **One agent = one owner.** `agent_identities.user_id` is immutable, never co-owned.
  Only the owner can withdraw, set spend/trade limits, grind/assign a vanity address,
  run autonomous strategies, or recover keys.

**The three viewer states every surface MUST distinguish:**

1. **Owner** — full controls: deposit, withdraw, vanity, limits, trade, snipe,
   strategies, custody trail, key recovery.
2. **Visitor (signed in, not the owner)** — read-only balance/holdings + **Tip** +
   **Pay · x402** + **Fork to get your own wallet**. Never withdraw, never grind a
   vanity onto an agent they don't own.
3. **Logged-out** — read-only + a sign-in / connect prompt on any money action.

Ownership is **server-authoritative**, never inferred from anything a client can
spoof. `GET /api/agents/:id` returns a decorated record whose `is_owner` is computed
from the session and whose owner-only fields are omitted for non-owners. The
marketplace detail (`/api/marketplace/agents/:id`) returns `is_owner` too. The
cacheable public list ships `author_id`; resolve per-card ownership against the
signed-in user (`/api/auth/me`). A tampered client flag must grant **nothing** —
every owner-only route re-authorizes server-side. Treat that as a hard requirement
when you add any new endpoint: re-check `user_id === auth.userId` on the server.

---

## The only coin — $THREE (absolute)

The only coin this platform may reference is **`$THREE`**, contract
`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never name, hardcode, link, render,
recommend, or seed test data with any other token — anywhere (code, copy, fixtures,
docs, commit messages). Two runtime-data-only exceptions: (1) coin-agnostic plumbing
where a mint is supplied at runtime by the user, and (2) platform launch directories
that render coins users launched through three.ws from real launch records
(`/launches`, agent launch history, `pump_agent_mints`). Never hardcode or promote a
specific non-`$THREE` mint. If you find a stray reference to another coin, remove it
like a leaked secret.

---

## Hard rules (from CLAUDE.md — non-negotiable, repeated so no task skips them)

- **No mocks. No fake data. No placeholders. No sample arrays.** Every number on
  screen comes from a real API hitting real Solana/EVM RPC, pump.fun, or a real DB
  row. A real balance of `0` shows `0` — never a decorative `$1,234`.
- **No TODOs, no stubs, no `throw new Error("not implemented")`, no commented-out
  code, no `setTimeout` fake progress.** If you write it, finish it and wire it.
- **Errors handled at boundaries**, with real fallbacks. "No errors without
  solutions" — every error has a root cause and a fix; find it.
- **Read before you write.** Match the existing patterns, naming, tokens, and file
  organization. Consistency compounds. Less code is better code — delete dead paths.
- **Every state is designed**: loading (skeletons, not spinners), empty (tells the
  user what to do), error (actionable recovery), populated, overflow, and — for this
  program — the three *viewer-role* states above.
- **Secrets never leave the server.** Never expose, log, or render a private key.

---

## The real API & data surface (use these — do not invent endpoints or fake reads)

**Custodial Solana wallet (per agent):**
- `GET  /api/agents/:id/solana` — public address + live SOL balance (anon-safe, 60s cache).
- `GET  /api/agents/:id/solana/holdings?network=` — SOL + SPL tokens (`is_owner` echoed).
- `GET  /api/agents/:id/solana/activity` — owner: recent signatures.
- `GET  /api/agents/:id/solana/custody?category=&before=` — owner: audited custody trail.
- `GET/POST /api/agents/:id/solana/vanity` — owner: vanity status + server grind (≤3 chars); browser grind at `/vanity-wallet` for longer, assigned via `POST /solana` with `secret_key`.
- `POST /api/agents/:id/solana/withdraw` — owner: sweep SOL/SPL (CSRF + spend policy).
- `GET/PUT /api/agents/:id/solana/limits` — owner: spend + trade policy (`frozen` kill switch).
- `GET  /api/agents/:id/solana/trade`, `/trade-history` — owner: discretionary buy/sell.
- `POST /api/agents/:id/solana/tip` — record a confirmed visitor tip signature.

**Agent commerce & identity:**
- `POST /api/x402-pay` (SSE/JSON), `GET /api/x402-pay?balance=1` — agent pays an x402 service.
- `POST /api/agents/fork`, `POST /api/avatars/fork` — fork → fresh wallet.
- `GET  /api/agents/:id` — `handleGetOne`: ownership-decorated record (`is_owner`).
- `GET  /api/marketplace/agents`, `/agents/:id`, `/agents/mine` — listing + detail (`is_owner`).
- `GET  /api/agents/:id/reputation` — reputation signals.
- `GET  /api/auth/me` — current user (`{ user: { id, ... } }`); cache once per page.

**On-chain / market data (real):**
- `/api/solana-rpc` — Helius RPC proxy (balances, ATAs, sigs). Respect its caching.
- pump.fun feed + `/api/pump/*` over `pump_agent_mints` (launches, the `/launches` feed).
- `api/_lib/coin/` — coin distribution: Drand-verifiable lottery, holder reflection,
  treasury (`coin_launches`, `coin_holders`, `coin_draws`, `coin_payouts`, `coin_events`).

**Client building blocks already in the tree:**
- `src/shared/agent-wallet-chip.js` — the canonical identity chip (owner→vanity,
  visitor→tip). The sibling program consolidates HUD/vanity/co-pilot under
  `src/shared/`. **Reuse these. One component per concern — never fork a variant.**
- `src/agent-wallet-hub/` — the owner management hub (deposit/withdraw/trade/util).
- `src/shared/agent-tip.js`, `agent-tip-modal.js` — non-custodial visitor tip flow.
- 3D: `model-viewer`, the `<threews-avatar>` / `agent-3d` web component, `three.js`.
- Surfaces: `avatar-page.js`, `agent-detail.js`, `marketplace.js`/`-detail.js`,
  `character.js`, `leaderboard.js`, `walk.js`, `app.js` + `play/arena.js`, `irl.js`,
  `voice/talk-mode.js`/`talk-scene.js`, the `avatar-sdk/` embed package.

> Before you assume an endpoint or field is missing, grep for it. If it is genuinely
> missing, **build it for real** (route under `api/`, persisted in Postgres/KV,
> ownership re-checked server-side) — do not stub or fake it.

---

## Design system — make it feel like one product

- **One violet wallet accent**, routed through CSS tokens/variables already in the
  codebase — never scattered raw hex. Vanity addresses get the emphasized variant.
- **One address formatter, one USD formatter, one SOL formatter, one ownership
  resolver.** If you need one and it doesn't exist, create it once under `src/shared/`
  and use it everywhere. Do not copy-paste.
- **Motion with intention**: enter/exit on opacity + transform, honor
  `prefers-reduced-motion`, no jank. Use `will-change`/`transform` for anything that
  animates per-frame. Lazy-load heavy 3D/SDK modules off the critical path.
- **Accessible by default**: semantic HTML, ARIA on interactive elements, keyboard
  paths, focus rings, sufficient contrast. Money UIs must be operable without a mouse.
- **Responsive**: works at 320 / 768 / 1440. Relative units, flex/grid.

---

## How to run a task (every agent follows this loop)

1. **Read** `00-README-orchestration.md` (this file) and your `0N-*.md` task in full.
2. **Map** the real surfaces/APIs the task touches — grep, read, understand existing
   patterns before writing a line.
3. **Build** the feature completely and wire it end-to-end with real APIs and real
   data. Design every state and every viewer role. No shortcuts.
4. **Verify** in a real browser via `npm run dev` (port 3000): no console errors,
   network tab shows real calls succeeding, owner/visitor/logged-out views all
   correct, `npm test` still passes. (Do **not** run `npm install` — node_modules is
   pinned in this environment.)
5. **Improve** — now that it works, ask: what would make this genuinely
   gamechanging that I haven't done yet? The keyboard shortcut, the share moment, the
   second-order connection to another surface, the empty-state delight. Do it.
6. **Changelog** — append a holder-readable entry to `data/changelog.json` (tags from
   feature/improvement/fix/sdk/infra/docs/security); `npm run build:pages` validates.
7. **Delete this prompt file** (`0N-*.md`) — the task is the code now, not the prompt.
8. **Commit & push to BOTH remotes** when the user asks: `git push threeD main` and
   `git push threews main`. Stage explicit paths only.

---

## Coordination & worktree safety (READ — agents share this checkout)

- **Concurrent agents edit `main` in this same worktree.** Stage **explicit paths
  only** — never `git add -A` / `git add .` (it sweeps other agents' in-flight work
  and unrelated files into your commit). Re-run `git status` and `git diff --staged`
  immediately before committing.
- **Push to both mirrors**: `threeD` (push-only) and `threews` (canonical). Never
  `pull`/`fetch`/`merge` from `threeD`.
- **`npx vercel build` overwrites `api/*.js` in place** with bundled output — check
  `head -1` of changed `api/` files for `__defProp`/`createRequire` before committing;
  recover with `git restore -- api/ public/`.
- If two tasks need the same shared component, the **first to land creates it**; the
  second imports it. Coordinate through the component, not a copy.

---

## Definition of done (every task must satisfy ALL)

- [ ] Feature is built, wired into the UI, reachable by navigation, and uses **real
      APIs with real data** — zero mocks, stubs, TODOs, or fake progress.
- [ ] All three viewer roles (owner / visitor / logged-out) render correctly, with no
      owner-only control or data shown to a non-owner.
- [ ] Every UI state designed: loading (skeleton), empty (actionable), error
      (recoverable), populated, overflow.
- [ ] No console errors/warnings from your code; network tab shows real calls.
- [ ] Hover/active/focus states on every interactive element; keyboard-operable; a11y
      labels; responsive at 320/768/1440; reduced-motion honored.
- [ ] Any new server route re-authorizes ownership server-side and never leaks secrets.
- [ ] `npm test` passes; `data/changelog.json` updated; `git diff` self-reviewed.
- [ ] You completed the **improve** pass and then **deleted this prompt file**.
- [ ] You would be proud to demo it to a room of senior engineers and pro traders.

---

## Task index

| # | Task | One-line |
|---|------|----------|
| 01 | [Living Avatar](./01-living-avatar-embodied-wallet.md) | The avatar's 3D body visibly reflects its wallet — wealth, holdings, vanity, live trades. |
| 02 | [Proximity Commerce](./02-proximity-commerce-worlds.md) | Two avatars near each other in a world transact face-to-face with visualized money flow. |
| 03 | [Autonomous Treasury](./03-autonomous-treasury-strategies.md) | Owners teach the wallet strategies; it acts on its own within real, audited guardrails. |
| 04 | [Wallet Trading Card](./04-wallet-trading-card-og.md) | A living, screenshot-worthy identity card + dynamic OG image for every agent wallet. |
| 05 | [Reputation, Credit & Access](./05-reputation-credit-access.md) | On-chain behavior earns a real reputation score that unlocks worlds, cosmetics, trust. |
| 06 | [Conversational Co-pilot](./06-conversational-wallet-copilot.md) | Talk or type to your agent to run real wallet actions, with simulation + confirmation. |
| 07 | [Embeddable Wallet](./07-embeddable-wallet-sdk.md) | The agent wallet as a portable tip/pay/x402 primitive that monetizes on any site. |
| 08 | [Living Economy Feed](./08-living-economy-feed.md) | The platform's real-time economic heartbeat — every tip, snipe, launch, payout, visualized. |
| 09 | [Integration & Viewer-Role QA](./09-integration-polish-qa.md) | Run last: one product, every surface covered, every role airtight, every seam polished. |
</content>
