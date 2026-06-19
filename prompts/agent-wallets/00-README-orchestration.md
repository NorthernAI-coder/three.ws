# Program: Agent Wallets — make every avatar a self-custodial financial identity

> **Read this file in full before starting any task in this folder.** Every prompt
> here (`01-*` … `06-*`) assumes the context below. Do not re-derive it.

## What we are building and why

three.ws is a platform where every 3D avatar is an autonomous agent. Each agent
already has a **custodial wallet** (Solana + EVM) provisioned automatically. Today
that wallet is almost invisible: a tiny violet chip in a few places. That is a
massive missed opportunity.

**The thesis:** an agent's wallet is its identity. It is how it gets tipped, how it
snipes a launch, how it trades, how it launches a coin, how it pays other agents,
how its owner withdraws profit. We are going to make the wallet a **first-class,
ubiquitous, beautiful, genuinely game-changing surface** — present everywhere an
avatar appears, and powerful enough that traders, snipers, and launchers choose
three.ws *because of it*.

We are not adding "a wallet widget." We are inventing the wallet layer that the
rest of crypto will copy. Hold that bar.

## The ownership model (already implemented — do NOT change the backend invariants)

This is the rule the user cares about most. It is already correct in the backend.
Your UI must make it **legible and delightful**, never violate it.

- **You own the wallet of the avatar you created.** When a user creates/uploads a
  3D avatar, an `agent_identities` row is created with `user_id = creator` and a
  fresh custodial Solana + EVM wallet is provisioned
  ([api/_lib/avatar-agent.js](../../api/_lib/avatar-agent.js),
  [api/_lib/agent-wallet.js](../../api/_lib/agent-wallet.js)).
- **Forking/saving someone else's avatar mints a NEW wallet for the forker.**
  `POST /api/agents/fork` ([api/agents/fork.js](../../api/agents/fork.js)) creates a
  brand-new agent row owned by the caller, copies the GLB into the caller's
  namespace, **never copies wallet secrets**, and calls `provisionAgentWallets()` to
  generate fresh keys. Lineage is stored in `meta.forked_from`
  (`{ agent_id, owner_id, owner_name, name, forked_at }`).
- **One agent = one owner.** `agent_identities.user_id` is immutable and never
  co-owned. Only the owner can withdraw, set spend limits, rebrand the vanity
  address, or recover keys. Everyone else sees a read-only / "tip" / "fork to get
  your own" view.
- **Custody:** private keys are AES-256-GCM encrypted at rest
  ([api/_lib/secret-box.js](../../api/_lib/secret-box.js)), decrypted only at signing
  time, every decrypt is audit-logged. Never expose, log, or render a secret key.

So the three viewer states your UI must always distinguish:

1. **Owner view** — full controls (deposit, withdraw, vanity, limits, trade, snipe,
   custody trail).
2. **Visitor view (public agent)** — read-only balance/holdings + Tip + a "Fork to
   get your own wallet" CTA.
3. **Logged-out** — read-only + sign-in / connect prompt.

## Hard rules (from CLAUDE.md — non-negotiable, repeated here so you don't skip them)

- **No mocks. No fake data. No placeholders. No sample arrays.** Every number on
  screen comes from a real API hitting real Solana/EVM RPC or a real DB row. If a
  balance is `0`, show a real `0`, never a fake `$1,234`.
- **No TODOs, no stubs, no `throw new Error("not implemented")`, no commented-out
  code, no `setTimeout` fake loading.** If you write it, finish it.
- **The only coin is `$THREE`** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).
  Never name, hardcode, or recommend any other token anywhere. Runtime-supplied
  mints (a user sniping an arbitrary launch, the launches feed) are the only
  exception, and you never hardcode or promote a specific non-$THREE mint.
- **Every state is designed:** loading (skeletons, not spinners), empty (tell the
  user what to do), error (actionable), populated, overflow.
- **Errors handled at boundaries**, with real working fallbacks. "No errors without
  solutions."
- **Accessibility:** semantic HTML, ARIA on interactive elements, keyboard nav,
  focus rings, contrast.
- **Match the design system.** See below — never hardcode hex/px.

## Design system (use these tokens, never invent values)

Source of truth: [public/tokens.css](../../public/tokens.css), imported globally.

- **Palette:** monochrome glass on near-black. `--bg-0:#0a0a0a`, surfaces
  `--surface-1/2/3` (white at 3/5/8% alpha), `--stroke`/`--stroke-strong`,
  `--accent:#fff`, text `--ink`/`--ink-dim`/`--ink-bright`/`--ink-faint`,
  `--success:#4ade80`, `--danger:#f87171`, `--warn:#fbbf24`.
- **Type:** `--font-display` (Space Grotesk), `--font-body` (Inter), `--font-mono`
  (JetBrains Mono — use for all addresses/amounts). Sizes `--text-2xs`…`--text-3xl`.
- **Spacing:** phi scale `--space-2xs`…`--space-2xl`. **Radii:** only
  `--radius-sm/md/lg/pill`. **Shadows:** `--shadow-1/2/3`. **Blur:**
  `--blur-sm/md/lg`. **Motion:** `--duration-instant/fast/base`, `--ease-standard`.
- The existing wallet chip uses a violet accent (`#c4b5fd` /
  `rgba(139,92,246,…)`) to mark "wallet". Keep wallet UI in that violet family so
  the wallet layer reads as one coherent system across the app — but route it
  through a token (add `--wallet-accent` etc. to tokens.css if helpful) rather than
  scattering raw hex.

## The surfaces (everywhere an avatar/agent appears — the chip/HUD must reach all)

Audit and cover **all** of these. Add any you discover that are missing:

- Agent detail / profile — [src/agent-detail.js](../../src/agent-detail.js) (`/agent/:id`)
- Character page — [src/character.js](../../src/character.js) (`/character/:id`)
- Avatar page (3D viewer) — [src/avatar-page.js](../../src/avatar-page.js) (`/avatars/:id`)
- Marketplace detail — [src/marketplace-detail.js](../../src/marketplace-detail.js)
- Trending / leaderboard — feed driven by [api/trending.js](../../api/trending.js)
- Galaxy (3D star map) — [src/galaxy.js](../../src/galaxy.js)
- My Agents / dashboard — [src/agent-home.js](../../src/agent-home.js) and variants
- Launches feed — `/launches` and agent launch history
- Any agent card component shared across the above

## The real APIs you will use (all exist today — read them, don't reinvent)

Wallet endpoints live under `api/agents/` (mostly `api/agents/solana-wallet.js`,
`api/agents/eth-vanity.js`, `api/agents/fork.js`):

- `GET  /api/agents/:id/solana` — address + balance (public read)
- `POST /api/agents/:id/solana` — provision/import (owner)
- `GET  /api/agents/:id/solana/holdings` — withdrawable SOL + SPL assets
- `GET  /api/agents/:id/solana/activity` — recent signatures (owner)
- `POST /api/agents/:id/solana/withdraw` — sweep SOL/SPL (owner, CSRF, spend policy)
- `POST /api/agents/:id/solana/tip` — record a P2P tip (visitor)
- `GET/PUT /api/agents/:id/solana/limits` — spend policy (owner)
- `GET  /api/agents/:id/solana/custody` — custody audit trail (owner)
- `GET/POST /api/agents/:id/solana/vanity` — vanity status / grind+swap (owner)
- `GET/POST/DELETE /api/agents/:id/eth-vanity` — CREATE2 vanity record (owner)
- `POST /api/agents/fork` — fork → new owner + new wallets
- Pricing helpers + `$THREE` data, pump.fun feed, Solana RPC: see
  [api/_lib/agent-wallet.js](../../api/_lib/agent-wallet.js),
  [api/_lib/agent-pumpfun.js](../../api/_lib/agent-pumpfun.js).

CSRF: write endpoints expect a CSRF token (see how the existing wallet chip and
withdraw flow obtain it — recent commit "integrate CSRF token handling"). Reuse
that pattern; do not bypass it.

Auth: current user via session cookie (`getSessionUser`) or bearer
([api/_lib/auth.js](../../api/_lib/auth.js)). Ownership check =
`agent_identities.user_id === auth.userId`.

If an endpoint you need for an innovative feature genuinely does not exist, **build
it properly** (real implementation, real chain calls, owner auth, CSRF, audit log,
spend-limit enforcement) — do not fake it client-side.

## Shared component contract (so the surfaces stay consistent)

The single source of truth for the wallet chip is
[src/shared/agent-wallet-chip.js](../../src/shared/agent-wallet-chip.js). All shared
wallet UI you build (chip, HUD/drawer, vanity studio modal) must live under
`src/shared/` and be imported by every surface — never copy-paste per page. If you
extend the data contract (e.g. add P&L), update every caller. Coordinate via the
data attributes/exports already used by the chip.

## Working rules for THIS repo (traps that have bitten agents here)

- **Concurrent agents share this worktree.** Other agents (including your siblings
  in this program) may be committing on `main` while you work. **Stage explicit
  paths only** (`git add path/to/file`), never `git add -A`/`.`. Re-run
  `git status` + `git diff --staged` right before committing.
- **`npx vercel build` overwrites `api/*.js` with esbuild bundles.** If you build,
  check `head -1` of changed `api/` files for `__defProp`/`createRequire` and
  `git restore -- api/ public/` if bundled.
- **Never `git add -A`.** Never pull/fetch/merge from the `threeD` remote.
- Run `npm run dev` (port 3000) and exercise your feature in a real browser. No
  console errors/warnings from your code. Confirm real API calls in the Network tab.
- Existing tests must still pass (`npm test`).
- **Changelog:** every user-visible change gets an entry in
  [data/changelog.json](../../data/changelog.json) (plain-language title + summary,
  tags from feature/improvement/fix/sdk/infra/docs/security). Run
  `npm run build:pages` to validate.

## Definition of done (per task)

1. Code written, wired into the UI, reachable by navigation across **all** relevant
   surfaces.
2. Exercised in a real browser via `npm run dev`. No console errors/warnings.
3. Network tab shows real API calls returning real data.
4. Every interactive element has hover/active/focus states; every state (loading/
   empty/error/populated/overflow) designed.
5. Owner / visitor / logged-out states all correct and tested.
6. `npm test` passes. Changelog entry added. `git diff` self-reviewed.
7. You would proudly demo this to a room of senior engineers and to a room of
   degens who snipe for a living.

## Then: improve, then delete this task

After you meet the definition of done, **do not stop**. Run the self-review
protocol from [CLAUDE.md](../../CLAUDE.md): the lazy check, the user check, the
integration check, the edge-case check (0 / 1 / 1000 items, very long names,
network failure mid-op, expired session), the pride check. Find the single biggest
weakness in what you built and **fix it now** — add the keyboard shortcut, the
empty-state illustration, the cross-feature link, the micro-animation that makes it
feel alive. Then look one level up: does what you built unlock something adjacent?
Wire that connection too.

**Finally, when the task is truly complete and committed, delete your own prompt
file** (`prompts/agent-wallets/0X-*.md`) so the task board reflects reality. Leave
this `00-README-orchestration.md` in place until the whole program is done.

## The invention bar (read this twice)

The user does not want a wallet that other platforms already have. A balance card, a
send/receive screen, a vanity grinder — those are table stakes (tasks `01`–`05`
build them, and they must be best-in-class, but they are the *floor*). The ceiling
is the **invention layer** (`07`–`12`): features that are **only possible because
three.ws is the one platform where a real, funded, self-custodial wallet is welded
to a rigged, talking, ownable 3D agent.** That combination is the moat. Every
invention-layer feature must answer "why can *only* three.ws do this?" — if the
answer is "anyone could," it's not done; raise it until it's something users would
switch platforms for and screenshot to their group chat.

Rules for the invention layer, on top of every rule above:

- **Novel, not derivative.** Do not reskin Phantom/Jupiter/a CEX. Invent the
  interaction. If a competitor has it, you have not gone far enough.
- **Uniquely ours.** The feature must exploit the avatar↔wallet↔identity weld.
  A number on a card is not enough; the *agent* must visibly be the one acting.
- **Still 100% real.** Inventiveness is never an excuse for fake data. Every visual,
  flow, and number traces to a real chain call, real feed, or real DB row. No
  simulated trades, no mock balances, no decorative-only animation — every animation
  is driven by a real event.
- **Safe by construction.** Anything that moves custodial funds (voice trades,
  mirror-trades, autonomous strategies, recovery transfers) is owner-only, gated by
  the server-side spend policy, requires explicit consent, and is fully audited in
  the custody trail. Invention does not bypass safety; it showcases it.

## Suggested order / dependencies

**Floor (best-in-class table stakes):**

- **`01` (Wallet Identity Layer)** is the foundation — the shared chip + data
  contract everything else hangs off. Ideally land first, or coordinate closely.
- **`02` (Wallet HUD/Drawer)**, **`03` (Vanity Studio)**, **`04` (Ownership /
  Fork-to-own)** build on `01`'s shared component and can run in parallel.
- **`05` (Sniper / Trading Co-pilot)** is the trading engine; it consumes the HUD
  and balances from `01`/`02`. The invention layer's trading features reuse its
  execution + spend-guard path.

**Invention layer (the moat — what no one else has):**

- **`07` (Net-Worth-Reactive Avatar)** — the 3D agent physically *wears its wallet*.
  Depends on `01` (real balances/holdings).
- **`08` (Conversational Wallet — talk-to-trade)** — speak/type intent to your
  avatar; it executes real, limit-gated wallet ops. Depends on `02`/`05`.
- **`09` (Mirror / Copy-Trade Social Graph)** — follow an agent's wallet; your agent
  mirrors within your limits. Depends on `05`.
- **`10` (Strategy Objects)** — encode a snipe/trade strategy as a real, ownable,
  shareable on-chain object agents can equip. Depends on `05`.
- **`11` (Social Recovery & Inheritance)** — guardians + dead-man's-switch for
  custodial agent wallets. Depends on `02`.
- **`12` (Galaxy Money-Cam)** — the 3D galaxy renders real money flowing between
  agent wallets, live. Depends on `01`.

These six are independent of each other and can each run in their own agent chat in
parallel once their dependency (`01`/`02`/`05`) exists. Coordinate only on the shared
`src/shared/` modules.

**Last:**

- **`06` (Integration & QA pass)** runs last — verifies every surface, every state,
  every viewer role, every invention-layer feature, end to end in the browser.
