# Program: Agent Wallets — Wave II — the wallet comes alive

> **Read this file in full before starting any task in this folder.** Every prompt
> here (`01-*` … `07-*`) assumes the context below. Do not re-derive it. This is the
> sequel to `prompts/agent-wallets/` (Wave I), which made every agent's wallet
> *visible* (the shared chip, the HUD/drawer, the vanity studio, fork-to-own, the
> sniper). Wave I is the foundation. **Wave II makes the wallet alive, social,
> autonomous, and embodied** — features no other platform has, that make a trader,
> a creator, or a degen choose three.ws *because the wallet does things their wallet
> can't.*

## The bar (read this twice)

We are not shipping wallet widgets. We are inventing the agent-money layer the rest
of crypto will copy. Every task here must be **genuinely novel** — if a feature
already exists in Phantom, in a generic DEX, or in "every other app," you have
missed the point. The unfair advantages we build on top of are unique to three.ws:

- Every agent is an **embodied 3D avatar** with a persona, a voice, and **memory**.
- Every agent already has a **custodial Solana + EVM wallet** provisioned at birth.
- Agents can **pay each other** (x402), **trade**, **snipe**, and **launch coins**.
- Agents exist **in the world** — a galaxy/constellation map, **IRL/AR placement**,
  a club, a marketplace, dashboards.
- We control the full stack: client, Vercel functions, workers, Solana RPC, the SDKs.

Hold the avatar's wallet against that backdrop. The wallet is the agent's **identity,
livelihood, relationships, and reputation** — not a balance readout. Build like it.

> Before you write a line: answer "what would make someone screenshot this and post
> it?" If the answer is "nothing," raise the design until the answer is obvious.

## The ownership model (already implemented — do NOT change the backend invariants)

This is the rule the user cares about most, and it is already correct in the backend.
Your UI must make it **legible and delightful**, and your new server code must
**enforce** it — never violate or weaken it.

- **You own the wallet of the avatar you created.** Creating/uploading an avatar
  makes an `agent_identities` row with `user_id = creator` and provisions a fresh
  custodial Solana + EVM wallet ([api/_lib/avatar-agent.js](../../api/_lib/avatar-agent.js),
  [api/_lib/agent-wallet.js](../../api/_lib/agent-wallet.js)).
- **Forking someone else's avatar mints a NEW wallet for the forker.**
  `POST /api/agents/fork` ([api/agents/fork.js](../../api/agents/fork.js)) creates a
  brand-new agent owned by the caller, copies the GLB into the caller's namespace,
  **never copies wallet secrets**, and calls `provisionAgentWallets()`. Lineage lives
  in `meta.forked_from`.
- **One agent = one owner.** `agent_identities.user_id` is immutable, never co-owned.
  Only the owner can withdraw, set spend/earn policy, rebrand the vanity address,
  recover keys, or arm autonomous behavior. Everyone else gets read-only + tip + "fork
  to get your own."
- **Custody:** keys are AES-256-GCM encrypted at rest
  ([api/_lib/secret-box.js](../../api/_lib/secret-box.js)), decrypted only at signing,
  every decrypt audit-logged. Never expose, log, or render a secret key.

Three viewer states every surface must distinguish:

1. **Owner** — full controls (deposit, withdraw, vanity, limits, autonomy, trade,
   snipe, custody trail, the new Wave II powers).
2. **Visitor (public agent)** — read-only balance/holdings + Tip + "Fork to get your
   own wallet." Any *new* visitor-facing money action (e.g. streaming a tip, claiming
   a bounty) is signed by the visitor's **own** wallet and never touches the agent's keys.
3. **Logged-out** — read-only + sign-in / connect prompt.

## Hard rules (from CLAUDE.md — non-negotiable, repeated so you don't skip them)

- **No mocks. No fake data. No placeholders. No sample arrays.** Every number on
  screen comes from a real API hitting real Solana/EVM RPC or a real DB row. If a
  balance is `0`, show a real `0`. If a feature needs data that doesn't exist yet,
  **build the real pipeline** — don't fake it to "demo."
- **No TODOs, no stubs, no `throw new Error("not implemented")`, no commented-out
  code, no `setTimeout` fake loading / fake progress.** If you write it, finish it.
- **The only coin is `$THREE`** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).
  Never name, hardcode, or recommend any other token anywhere — code, copy, fixtures,
  tests, commits. Runtime-supplied mints (a user sniping an arbitrary launch, the
  launches feed) are the only exception, and you never hardcode/promote a specific
  non-`$THREE` mint.
- **Every state is designed:** loading (skeletons, not spinners), empty (tell the user
  what to do next), error (actionable, with a real fallback), populated, overflow
  (0 / 1 / 1000 items, very long names).
- **Errors handled at boundaries**, with real working fallbacks. "No errors without
  solutions" — find the root cause and fix it.
- **Accessibility:** semantic HTML, ARIA on interactive elements, keyboard nav, focus
  rings, contrast, `prefers-reduced-motion` respected on every animation you add.
- **Match the design system** (below). Never hardcode hex/px.
- **Money safety:** every value-moving server path enforces owner auth, CSRF, the
  per-agent spend policy ([api/_lib/agent-trade-guards.js](../../api/_lib/agent-trade-guards.js)),
  and writes a custody audit event. Visitor-signed transfers are non-custodial and
  verified on-chain before you record them.

## Design system (use these tokens, never invent values)

Source of truth: [public/tokens.css](../../public/tokens.css), imported globally.

- **Palette:** monochrome glass on near-black. `--bg-0:#0a0a0a`, `--surface-1/2/3`,
  `--stroke`/`--stroke-strong`, `--accent:#fff`, `--ink`/`--ink-dim`/`--ink-bright`,
  `--success:#4ade80`, `--danger:#f87171`, `--warn:#fbbf24`.
- **Wallet accent is violet** (`#c4b5fd` / `rgba(139,92,246,…)`) — the whole wallet
  layer reads as one system. Route it through a token (`--wallet-accent`, add to
  tokens.css if missing) rather than scattering raw hex.
- **Type:** `--font-display` (Space Grotesk), `--font-body` (Inter), `--font-mono`
  (JetBrains Mono — all addresses/amounts). **Spacing:** phi scale. **Radii:**
  `--radius-sm/md/lg/pill`. **Shadows:** `--shadow-1/2/3`. **Motion:**
  `--duration-instant/fast/base`, `--ease-standard`.

## The surfaces (Wave I wired the chip to ~24 of these — your features must reach the relevant ones)

Agent detail [src/agent-detail.js], character page [src/character.js], avatar page
[src/avatar-page.js], marketplace + detail [src/marketplace.js, src/marketplace-detail.js],
characters grid [src/characters.js], trending [pages/trending.html], leaderboard
[src/leaderboard.js], galaxy star map [src/galaxy.js], dashboards
[src/dashboard-next/pages/*, src/a-me.js, src/agent-home.js], launches
[src/launches.js, src/launch-detail.js], IRL/AR [src/irl.js], club, worlds. **The
single source of truth for shared wallet UI is
[src/shared/agent-wallet-chip.js](../../src/shared/agent-wallet-chip.js) +
[src/shared/agent-tip.js](../../src/shared/agent-tip.js) +
[src/shared/agent-tip-modal.js](../../src/shared/agent-tip-modal.js).** Extend these;
never copy-paste per page. New shared UI lives under `src/shared/`.

## The real APIs & primitives you build on (all exist today — read them, don't reinvent)

- Wallet: `GET/POST /api/agents/:id/solana` (address+balance / provision),
  `/solana/holdings` (withdrawable assets), `/solana/activity` (signatures),
  `POST /solana/withdraw` (owner, CSRF, spend policy), `GET/PUT /solana/limits`
  (spend policy), `GET /solana/custody` (audit trail), `GET/POST /solana/vanity`
  (grind+swap). Dispatcher: [api/agents/solana-wallet.js](../../api/agents/solana-wallet.js).
- Custody ledger + guardrails: `recordCustodyEvent`, `listCustodyEvents`,
  `enforceSpendLimit`, spend/trade limits — [api/_lib/agent-trade-guards.js](../../api/_lib/agent-trade-guards.js).
  Table: `agent_custody_events` ([api/_lib/migrations/20260617000000_agent_custody.sql](../../api/_lib/migrations/20260617000000_agent_custody.sql)).
- Visitor-signed transfers (tips): [src/shared/agent-tip.js](../../src/shared/agent-tip.js)
  (SOL + USDC, Phantom/Backpack/Solflare, same-origin RPC proxy).
- Trading/sniping: [src/swap-jupiter.js](../../src/swap-jupiter.js),
  [api/agents/solana-trade.js](../../api/agents/solana-trade.js). Staking:
  [src/solana-stake.js](../../src/solana-stake.js). $THREE/server payment flow:
  [src/token-pay.js](../../src/token-pay.js), `/api/token/*`.
- Agent-to-agent payments (x402): [api/x402-pay.js](../../api/x402-pay.js),
  [src/agent-x402-pay.js](../../src/agent-x402-pay.js),
  [solana-agent-sdk/src/x402-exact/](../../solana-agent-sdk/src/x402-exact/).
- Agent memory (for relationships): `/api/agent-memory` + the memory UI in
  [src/agent-detail.js]. Persona/voice/chat (for the conversational copilot):
  preview session in [src/agent-detail-market.js], [api/agents/talk.js].
- World/IRL: [src/galaxy.js] + [api/galaxy.js], [src/irl.js] + [api/irl/pins.js] +
  [api/irl/agent-summary.js]. Pump.fun: [api/agents/pumpfun/], [src/pump/].
- RPC + pricing: [api/_lib/agent-pumpfun.js](../../api/_lib/agent-pumpfun.js),
  same-origin proxy `/api/solana-rpc`.
- Auth: `getSessionUser` / bearer ([api/_lib/auth.js](../../api/_lib/auth.js)).
  Ownership = `agent_identities.user_id === auth.userId`. CSRF: reuse the existing
  wallet/withdraw CSRF pattern (`consumeCsrfToken` in [src/api.js]); never bypass it.

If a feature genuinely needs an endpoint that doesn't exist, **build it properly** —
real implementation, real chain calls, owner auth, CSRF, audit log, spend-limit
enforcement, rate limiting. Add a migration if you need a table; follow the style of
the existing `api/_lib/migrations/*.sql`.

## Working rules for THIS repo (traps that have bitten agents here)

- **Concurrent agents share this worktree.** Siblings in this program (and Wave I) may
  be committing on `main` while you work. **Stage explicit paths only**
  (`git add path/to/file`), never `git add -A`/`.`. Re-run `git status` +
  `git diff --staged` right before committing. Re-check before every commit.
- **`npx vercel build` overwrites `api/*.js` with esbuild bundles.** If you build,
  check `head -1` of changed `api/` files for `__defProp`/`createRequire` and
  `git restore -- api/ public/` if bundled.
- **Never `git add -A`. Never pull/fetch/merge from the `threeD` remote.** Pushes go to
  BOTH remotes (`git push threeD main` and `git push threews main`) only when the user
  asks.
- **Do NOT run `npm install`** in the dev container — node_modules + npm cache are in a
  state where install hangs the box. Use the deps already present.
- Run `npm run dev` (port 3000) and exercise your feature in a real browser. No console
  errors/warnings from your code. Confirm real API calls + real data in the Network tab.
- Existing tests must still pass (`vitest run`).

## Definition of done (per task)

1. Code written, wired into the UI, reachable by navigation across **all** relevant
   surfaces. Shared logic lives in `src/shared/` and is imported, not copied.
2. Exercised in a real browser via `npm run dev`. No console errors/warnings.
3. Network tab shows real API calls returning real on-chain / DB data. No fakes.
4. Every interactive element has hover/active/focus; every state designed; owner /
   visitor / logged-out all correct.
5. Money paths enforce owner auth + CSRF + spend policy + audit log; visitor transfers
   verified on-chain before recording.
6. `vitest run` passes. Changelog entry added to [data/changelog.json](../../data/changelog.json)
   (plain-language, tags from feature/improvement/fix/sdk/infra/docs/security); run
   `npm run build:pages` to validate.
7. You would proudly demo this to a room of senior engineers AND to a room of degens
   who snipe for a living.

## Then: improve, then delete this task

After you meet the definition of done, **do not stop.** Run the self-review protocol
from [CLAUDE.md](../../CLAUDE.md): the lazy check (any shortcut? any half-wired path?),
the user check (would a first-timer find + understand it?), the integration check (does
it connect to the rest of the platform — link the surfaces, share the state?), the
edge-case check (0 / 1 / 1000 items, very long names, network failure mid-op, expired
session, RPC throttled), the pride check. Find the single biggest weakness in what you
built and **fix it now.** Then look one level up: does what you built unlock something
adjacent? Wire that connection too.

**Finally, when the task is truly complete and committed, delete your own prompt file**
(`prompts/agent-wallets-ii/0X-*.md`) so the task board reflects reality. Leave this
`00-README-orchestration.md` until the whole wave is done.

## The wave (suggested order / dependencies)

- **01 — Money Streams** (pay-per-second to agents). Net-new settlement primitive;
  several later tasks consume it.
- **02 — Wallet Intents + Conversational Copilot** (talk to your money; NL→enforced
  policy). The autonomy engine; foundational for 05/06.
- **03 — Embodied Finance** (the avatar's look reflects its real wallet health/P&L).
  Consumes balances/P&L; touches every surface that renders an avatar.
- **04 — The Money Constellation** (live value-flow map). Consumes custody/on-chain
  flows; extends the galaxy.
- **05 — Patronage, Relationships & Tip-to-Unlock** (tips build memory-backed
  relationships, tiers, perks). Consumes tips (01) + memory.
- **06 — IRL Money Drops & Bounties** (geo-located, AR-claimable SOL). Consumes IRL +
  visitor-signed transfers.
- **07 — Proof-of-Reserves & Financial Reputation** (verifiable transparency + on-chain
  behavioral score). Consumes everything; the trust layer.

`01` and `02` are the new primitives — land or coordinate them early. `03`–`07` build on
the shared chip/HUD from Wave I and the primitives from `01`/`02`, and can run in parallel.
