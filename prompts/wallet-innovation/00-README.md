# Wallet Innovation Suite — Shared Context (READ THIS FIRST)

> **Do NOT delete this file.** Every numbered prompt in this directory deletes
> itself when its task is complete; this README is the shared brief they all
> depend on and must persist for the whole program.

You are one of several senior engineers building the **most secure, most
delightful custodial agent wallet in the world** for three.ws. Each numbered
prompt (`01-*.md` … `08-*.md`) is a single, complete feature owned by one agent
chat. This file is the context every one of those agents must internalize before
writing a line of code.

---

## The mission

three.ws gives every AI agent a **real, custodial Solana wallet** that the agent
spends from autonomously (trade, snipe, x402 payments) while the human owner
sets the rules. This is **people's money**. The bar is not "works" — the bar is
"a security researcher would screenshot this and say *nobody else is doing
this*."

We are not cloning MetaMask, Phantom, or any incumbent. Every feature in this
suite must be something **we invent or meaningfully advance** — defensible,
genuinely useful, and impossible to dismiss as table stakes. If your feature
already ships in three other wallets exactly as you're building it, you have not
hit the bar. Find the angle that is uniquely ours.

## Non-negotiable rules (these OVERRIDE any instinct to cut corners)

1. **No mocks. No fake data. No placeholders. No `setTimeout` fake progress.**
   Real Solana RPC, real Postgres, real on-chain reads, real LLM calls through
   the existing worker proxies. If a credential is missing, find it in `.env` /
   `vercel env` or wire a real failsafe — never stub.
2. **Wire it 100%, end to end.** Data layer → API → state → UI → every state
   (loading / empty / error / populated / overflow). A button that exists must
   work. A link must go somewhere. No dead paths. No `TODO`, no
   `throw new Error("not implemented")`, no commented-out code.
3. **Errors handled at boundaries; internal code trusts itself.** Every error
   has a root cause and a fix — find it. Ship working fallbacks, never lazy
   propagation.
4. **This is money. Threat-model everything.** Assume a hostile caller, a
   compromised session, a malicious destination, a race, a replay, a DB-read
   attacker. Default to fail-safe (deny / freeze), never fail-open.
5. **$THREE is the only coin.** Contract `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`.
   Never reference, hardcode, or recommend any other coin anywhere — code,
   tests, fixtures, copy, comments. Generic runtime-supplied mints (the pump.fun
   launcher) and the platform launch directories are the only exceptions.
6. **Accessibility and polish are part of "done"**, not extras. Semantic HTML,
   ARIA, keyboard nav, focus rings, reduced-motion, responsive at 320/768/1440.
7. **Read before you write.** Match the existing patterns, naming, and design
   tokens. Consistency compounds.

## Definition of done (all must be true before you self-delete the prompt)

- [ ] Feature is fully wired and reachable by a real user via navigation.
- [ ] `npm run dev` (port 3000) started; feature exercised in a real browser.
- [ ] Network tab shows **real** API calls returning **real** data.
- [ ] No console errors or warnings from your code.
- [ ] Every interactive element has hover / active / focus states.
- [ ] Loading (skeletons), empty (actionable), and error (recoverable) states
      designed.
- [ ] New/changed server logic has tests. Existing tests still pass.
- [ ] A changelog entry was appended (see below) for anything user-visible.
- [ ] You reviewed your own `git diff` line by line and would demo it to a room
      of senior security engineers without flinching.

---

## Codebase orientation — the custody system you are building on

**Do not rediscover this. Build on it.** (Read `docs/internal/AGENT-WALLET-CUSTODY.md`
for the full model.)

### Key custody & crypto
- `api/_lib/secret-box.js` — **the single** AES-256-GCM secret box.
  `encryptSecret()` / `decryptSecret()` / `isEncryptedSecret()`. v2 scheme: HKDF
  from a dedicated `WALLET_ENCRYPTION_KEY`, random per-record salt, `v2:` prefix.
  All at-rest secret encryption goes through here — never write ad-hoc crypto.
- `api/_lib/agent-wallet.js` — `generateSolanaAgentWallet()`,
  `recoverSolanaAgentKeypair(enc, audit)` (decrypt-to-sign; audited),
  `ensureAgentWallet(agentId, userId, {reason})` (idempotent lazy provision).
  Wallets live at `agent_identities.meta.solana_address` (public) and
  `meta.encrypted_solana_secret` (ciphertext). Secrets are **never** returned,
  logged, or put in errors.
- `api/_lib/solana-signers.js` — registry of platform fee-paying signers (env).

### Spend policy + custody ledger (the heart of safety)
- `api/_lib/agent-trade-guards.js` — the ONE policy enforced on every outbound
  path. `enforceSpendLimit()` and `reserveSpendUsd()` (atomic, advisory-locked,
  TOCTOU-safe). `recordCustodyEvent()` / `updateCustodyEvent()` /
  `listCustodyEvents()`. Limits stored at `agent_identities.meta.spend_limits`
  (`daily_usd`, `per_tx_usd`, `withdraw_allowlist`, `frozen`) and
  `meta.trade_limits` (`per_trade_sol`, `daily_budget_sol`, `max_price_impact_pct`,
  `max_slippage_bps`, `max_concurrent`, `kill_switch`).
- Table `agent_custody_events` — audit trail + spend ledger
  (migration `api/_lib/migrations/20260617000000_agent_custody.sql`). Event types:
  `key_recover`, `withdraw`, `spend` (category: trade|snipe|x402|withdraw),
  `limit_change`. This is your source of truth for behavioral history.

### Endpoints (all owner-authenticated, CSRF-gated on mutations, rate-limited)
- `api/agents/solana-wallet.js` — withdraw, limits (GET/PUT), custody feed,
  holdings, activity, provision, vanity.
- `api/agents/solana-trade.js` — discretionary buy/sell (preview + execute).
- `api/x402-pay.js` — x402 settlement from the agent wallet.
- Owner gate pattern: `loadOwnedWallet(req,res,id)` → auth → ownership → wallet.
  Reuse it. CSRF via `requireCsrf(req,res,userId)` (`api/_lib/csrf.js`);
  bearer/API-key callers exempt.

### Frontend wallet hub
- `src/agent-wallet-hub/` — tabbed shell (`index.js` + `registry.js` +
  `util.js`), tabs in `tabs/` (balance, deposit, trade, snipe, pay, withdraw).
  Dependency-free vanilla JS. Owner-only tabs gate on `agent.is_owner`.
- API clients: `src/agent-solana-wallet.js`, `src/agent-x402-pay.js`.
- CSRF on the client: `import { consumeCsrfToken } from '../../api.js'` and send
  `x-csrf-token` on mutating fetches. The hub never holds the private key.
- The wallet chip appears across the app: `src/shared/agent-wallet-chip.js`.

### Auth, infra, real APIs
- Auth: `api/_lib/auth.js` (`getSessionUser`, `__Host-sid` cookie, SameSite=Lax),
  bearer + `sk_live_` API keys. Rate limits: `api/_lib/rate-limit.js`.
- DB: `api/_lib/db.js` (`sql` tagged template, Neon Postgres). Migrations:
  `api/_lib/migrations/<UTC-timestamp>_<name>.sql`, wrapped in `begin;`/`commit;`,
  idempotent (`create table if not exists`, `create index if not exists`).
- LLM: route through the existing worker proxies (Anthropic/OpenAI) — see
  `workers/` and how current features call them. **Never** put a raw key client-side.
  Use the latest Claude models (Opus 4.8 / Sonnet 4.6) for any LLM step.
- Solana: `@solana/web3.js`, `@solana/spl-token`; connections via
  `solanaConnection(network)` in `api/_lib/agent-pumpfun.js`. Prices via
  `solUsdPrice()` (`api/_lib/avatar-wallet.js`).
- 3D/visual: Three.js is available platform-wide if a feature benefits from
  visualization.

---

## Shared-worktree coordination (CRITICAL — multiple agents run at once)

Other agents are editing and committing on `main` in **this same worktree** while
you work. To avoid clobbering each other:

- **Stage explicit paths only** — never `git add -A` / `git add .`.
- Re-run `git status` and `git diff --staged` immediately before any commit.
- Prefer **new files** over editing shared hot files. When you must touch a
  shared file (`agent-trade-guards.js`, `agent-wallet.js`, `solana-wallet.js`,
  the hub `index.js`/`registry.js`), make minimal, additive, clearly-commented
  changes and assume someone else is in there too.
- Add new wallet-hub surfaces as **new tabs/modules** registered via
  `registry.js` rather than rewriting existing tabs.
- New DB columns go in `agent_identities.meta` (jsonb) or a **new table** via a
  new migration — never alter another feature's table shape.
- Never pull/fetch/merge from the `threeD` mirror. `threews` is canonical.

## Changelog (every user-visible change)

Append a holder-readable entry to `data/changelog.json` (plain language, no
commit jargon; tags from feature|improvement|fix|sdk|infra|docs|security), then
`npm run build:pages` to regenerate + validate. Skip for internal-only chores.

## When you finish your task

1. **Ship the feature** to the definition of done above.
2. **Then think harder: how can this be better?** Re-read your own work as a
   skeptical founder. What's the second-order win you skipped? The empty state
   that's still weak? The attack you hand-waved? The cross-feature wire you could
   add (does your data unlock something in another tab)? **Do that improvement
   now** — don't leave it.
3. **Verify again** (browser + tests + diff review).
4. **Delete your prompt file** (`prompts/wallet-innovation/<your-number>-*.md`)
   as the final step, signaling the task is complete. Leave this README.

Build like the platform's reputation rides on your feature. It does.
