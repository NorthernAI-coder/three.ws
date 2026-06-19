# Task 05 — The Sniper / Trading Co-pilot (the agent that trades for you)

> **Read [00-README-orchestration.md](./00-README-orchestration.md) first** for the
> ownership model, design tokens, real APIs, hard rules, definition of done, and the
> "improve then delete this file" close-out. Builds on the shared wallet component
> (**task 01**) and opens from the Wallet HUD (**task 02**). This task ships the
> **execution engine** that the invention layer (`08`/`09`/`10`) reuses — get the
> trade path, the spend-guard, and the audit trail right and shared.

## Mission

Every agent has a real, funded, self-custodial Solana wallet. Turn it into a
**best-in-class on-chain trading + launch-sniping cockpit** that lives inside the
agent. Faster than a Telegram sniper bot, clearer than Jupiter, safer than handing a
bot your seed phrase — because the keys never leave the server and every trade is
gated by the owner's spend policy and written to the custody trail.

The bar: a degen who snipes for a living tries it once and never goes back to their
bot. The reason they can't get this anywhere else: the wallet is welded to a real,
ownable, talking 3D agent, and the spend policy makes autonomous execution trustable.

## What exists (read it before building)

- Custodial signing: `recoverSolanaAgentKeypair(encryptedSecret, audit)` in
  [api/_lib/agent-wallet.js](../../api/_lib/agent-wallet.js) — the **only** way to
  sign; every recovery is audit-logged with a reason. Reuse it. Never expose a key.
- Withdraw path (your model for a safe money-moving endpoint):
  `POST /api/agents/:id/solana/withdraw` in
  [api/agents/solana-wallet.js](../../api/agents/solana-wallet.js) — owner auth, CSRF,
  destination validation, **spend-policy enforcement** (daily USD cap, per-tx ceiling,
  allowlist, freeze), build -> simulate -> sign -> send -> confirm, audit every step.
  Your trade endpoint must follow the same skeleton.
- Spend policy: `GET/PUT /api/agents/:id/solana/limits`. Trades consume the **same**
  daily/per-tx budget as withdrawals — one wallet, one policy, no bypass.
- Holdings + balances: `GET /api/agents/:id/solana/holdings`,
  `GET /api/agents/:id/solana` — what you can sell, valued in real USD.
- Launch feed: [api/_lib/agent-pumpfun.js](../../api/_lib/agent-pumpfun.js) and the
  pump.fun feed already in use — the real source of fresh launches to snipe.
- Solana RPC + price helpers already wired in `api/_lib/agent-wallet.js`.

## The execution engine (build it real — this is the shared deliverable)

Build `POST /api/agents/:id/solana/trade` (owner-only, CSRF, audited) that executes a
**real** swap on Solana via the **Jupiter aggregator** (real public quote/swap API)
for SPL<->SPL / SOL<->SPL, and a snipe path for fresh pump.fun launches via the
existing pump integration. Requirements, non-negotiable:

1. **Real quotes.** Fetch a real Jupiter quote (input mint, output mint, amount,
   slippage bps). Show the real price, price impact, minimum received, and route. No
   estimated/fake numbers.
2. **Spend-guard, server-side.** Before signing, value the trade in USD and enforce
   the agent's spend policy exactly as withdraw does (per-tx ceiling, remaining daily
   budget, freeze, allowlist where relevant). Reject over-limit with an honest,
   actionable error. The guard is the product — never bypass it for "speed."
3. **Build -> simulate -> sign -> send -> confirm.** Sign with
   `recoverSolanaAgentKeypair` (reason: `trade` / `snipe`). Simulate when possible.
   Return the real signature + explorer link. Handle partial fills / failed sends
   with a real status, never an optimistic fake.
4. **Slippage & priority fees** are real, user-set, and explained. Reserve rent +
   fees. Never strand SOL.
5. **Audit.** Every trade writes a custody-trail row (reason, mints, amounts in/out,
   USD, signature) so the owner sees exactly what their agent did.

`$THREE` is the only coin you ever **name, feature, default, or recommend**. The
trade UI may accept an **arbitrary runtime mint** the user pastes/snipes (the
coin-agnostic exception in CLAUDE.md) and the launches feed renders launch records —
but you never hardcode, suggest, or market any specific non-`$THREE` mint.

## The UI (cockpit, opened from the HUD)

- **Buy / Sell panel** — token in/out, amount with MAX (from real holdings), live
  real quote (price, impact, min-received, route), slippage + priority controls, a
  clear confirm. Real USD on everything. The agent's avatar is visibly the one
  acting — "Nova is buying..." — not a faceless form.
- **Snipe panel** — live fresh-launch feed from the real pump.fun source; one-tap
  snipe with a pre-set size and slippage, gated by the spend policy. Show real
  launch age, liquidity, and the real fill. Honest about MEV/slippage risk.
- **Positions** — current holdings valued live, with real unrealized P&L derived from
  real entry data (persist fills to compute cost basis; if no basis exists yet, show
  the honest "no entry data" state, never a fake P&L).
- **Order history** — every real fill with signature links, from the custody trail.

## Innovation mandate

- **The agent trades as a character.** The avatar reacts to a fill (a real,
  event-driven micro-animation — only on a real confirmed tx). This is the weld that
  no DEX has: a face on the trade.
- **Pre-flight, not regret.** Before any trade, a crisp, real risk read: price impact,
  remaining daily budget after this trade, honeypot / mint-authority checks where the
  data is real and available. Protect the user with truth.
- **One-tap, fully-gated snipe** — the speed of a sniper bot with the safety of a
  server-side spend policy. That combination is the moat; make it feel instant.
- Invent beyond this where it raises the bar — but every quote, fill, position, and
  P&L number traces to a real chain call you can see in the Network tab.

## States & edge cases (all designed)

Empty wallet (warm "fund me to trade" -> deposit); insufficient balance; over per-tx
or daily limit (show remaining budget, link to limits); slippage exceeded / failed
route; tx not confirmed / dropped (real retry or honest failure, funds reconciled
against real chain state); frozen wallet; expired session mid-trade; a launch that
rugs between quote and fill; dust; 0 / 1 / 1000 positions; very long token names;
network failure mid-send (re-check real on-chain state before reporting outcome).
Visitor / logged-out never see trade controls — UI **and** server enforce it.

## Definition of done

Per the orchestration README. Plus: a **real swap executes end-to-end** (devnet
acceptable) returning a real signature + explorer link; the spend policy genuinely
blocks an over-limit trade; positions/P&L reflect real holdings; the snipe panel
shows the real launch feed; owner-only enforced in UI and server; the
`POST .../trade` endpoint is reusable by tasks 08/09/10; no console errors;
responsive at 320/768/1440.

When done: self-review + improvement pass, changelog entry, commit (explicit paths
only, push to **both** remotes if asked), then **delete this file**
(`prompts/agent-wallets/05-sniper-trading-copilot.md`).
