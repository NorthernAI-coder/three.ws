# Moonshot 01 — The Agent Labor Market (autonomous A2A economy)

> Read [00-README-orchestration.md](./00-README-orchestration.md) and the repo-root
> `CLAUDE.md` first. This ships a real, end-to-end feature, not a prototype.

## The invention

**Agents hire agents.** A live marketplace where an agent posts a bounty (a task it
needs done), other agents discover it, bid on it, perform the work by **invoking each
other's licensed skills**, and get paid in **$THREE** — autonomously, with the whole
exchange settling and verifying **on-chain**. No human clicks "approve" in the loop.

This is the first self-sustaining **machine economy** on the platform: capability flows
to where it's needed and capital follows it, automatically. A chat-wrapper competitor
cannot ship this — it requires real agent wallets, real machine payments, a real A2A
invocation protocol, and on-chain skill licenses, all of which three.ws already has.

Why it's gamechanging: it turns a directory of agents into an **economy**. Every agent
becomes both a worker (earns by selling skills) and an employer (spends to get tasks
done). Holders watch real $THREE flow between agents. Builders publish a skill once and
earn royalties forever as other agents license and invoke it.

## Real systems to build on (all already wired — use them, don't reinvent)

- **Agent wallets** — `api/_lib/agent-wallet.js`, `api/agents/` (Solana + EVM, custody,
  spend policy, audit). Payments debit/credit these.
- **x402 machine payments** — `api/x402/`, `api/x402-pay.js`, `api/_lib/x402-spec.js`,
  `api/_lib/x402-paid-endpoint.js`. A bounty payout is an x402 settlement.
- **Agent-to-agent protocol** — `agent-protocol-sdk/`, `contracts/agent-invocation/`
  (Anchor program emitting verifiable invocation events). Use it to record "agent A
  invoked agent B's skill S, settled T".
- **On-chain skill licenses** — `contracts/skill-license/`, `api/_lib/skill-license-onchain.js`,
  `api/skills/`, `api/agent-skills.js`. A worker agent's capabilities ARE its licensed
  skills; royalties route to the skill author on each invocation.
- **LLM routing** — `api/chat.js`, `api/_lib/chat-models.js` (Anthropic/OpenAI/Groq/
  NVIDIA/watsonx). Use the latest, most capable Claude model for agent negotiation/
  matching reasoning. See the `claude-api` skill for current model IDs.
- **DB** — Neon Postgres via `api/_lib/db.js`; follow the lazy-`ensureTable` +
  `migrations/` pattern used across `api/`.
- **Notifications + alerts** — `api/notifications/`, `api/_lib/alerts.js` (Telegram).
- **Surfaces to cross-link** — agent profile (`src/agent-detail.js`), dashboard
  (`src/agent-home.js`), marketplace (`src/marketplace.js`), leaderboard
  (`src/leaderboard.js`).

## Scope — design the full path, then build every inch of it

1. **Data model (`api/_lib/migrations/`)** — `agent_bounties` (poster_agent_id, title,
   spec, reward_amount in $THREE atomic units, reward_mint = $THREE, required_skill,
   status, deadline, created_at), `agent_bids` (bounty_id, worker_agent_id, price,
   eta, pitch, status), `agent_jobs` (bounty_id, worker_agent_id, invocation_sig,
   settlement_sig, deliverable, verified_at, status). Index for the open-bounty feed
   and per-agent earnings. Money columns are atomic-unit integers, never floats.

2. **Bounty lifecycle (backend, `api/labor/`)** — `POST /post` (an agent, owned by the
   caller, escrows the reward from its wallet), `GET /feed` (open bounties, filterable
   by skill/reward), `POST /bid`, `POST /award` (poster or its autonomous policy selects
   a bid), `POST /deliver` (worker submits result), `POST /settle` (verify + release
   escrow → worker wallet, route skill royalty to author, record the A2A invocation
   on-chain). Enforce ownership server-side; make `/settle` **idempotent** by settlement
   signature so a retry never double-pays.

3. **Autonomy engine (`workers/` or `api/labor/match.js`)** — the part that makes it a
   *machine* economy. A worker agent's policy (opt-in, per agent) auto-bids on bounties
   matching its licensed skills within its spend/earn limits; a poster agent's policy
   auto-awards the best bid by a transparent score (price × eta × worker reputation).
   The matching/negotiation reasoning runs through the LLM router. Every autonomous
   action is logged with its rationale (this feeds Moonshot 05's reasoning ledger —
   emit a compatible event).

4. **Verification** — before escrow releases, the deliverable is checked: for a skill
   with a deterministic output, validate it; for open-ended work, a neutral verifier
   agent scores it against the spec. Record the verdict. No release without a pass.
   Failure path: refund the poster, mark the job failed, penalize nothing the worker
   didn't control (network failure ≠ bad work — distinguish them).

5. **The Labor Market surface (`src/labor-market.js` + `pages/labor-market.html`)** —
   a live feed of open bounties, in-flight jobs, and a real-time **$THREE flow** ticker
   ("agent X paid agent Y 1,200 $THREE for skill Z"). Per-agent "Work" tab on the
   profile (bounties posted, jobs done, total earned, reputation). Post-a-bounty flow
   for owners. Make the autonomous negotiation **visible** — show the bids arriving and
   the award reasoning, because watching agents haggle is the screenshot moment.

6. **Cross-wire** — surface "agents for hire" on the marketplace; show earnings on the
   agent wallet HUD; rank the leaderboard by labor earnings; fire a holder-facing feed
   event on large settlements.

## Quality + security bar

- Every state designed (no bounties yet → explain how to post one; bidding; awarded;
  working; verifying; settled; refunded; failed). Skeletons, microinteractions, a11y,
  responsive at 320/768/1440, reduced-motion.
- Escrow is real on-chain custody, not a DB flag — funds are actually held and actually
  released. CSRF on writes. Spend-limit + ownership enforced server-side. Idempotent settle.
- No other coin, anywhere. Rewards and royalties are $THREE (USDC only where the existing
  x402 path already supports it as a settlement asset — match existing behavior, add nothing new).

## Then make it better (mandatory)

Once it works, find the highest-leverage upgrade and ship it. Candidates: a reputation
score that compounds (good work → more auto-awards → an emergent agent labor aristocracy);
multi-step bounties where a worker sub-contracts part of the job to a third agent (real
supply chains); a "skill gap" signal that tells builders which in-demand skills have no
supply. Pick the one that makes the economy feel *alive*, build it, then re-evaluate.

## Definition of done

Meets every box in the README's Definition of done. Specifically: a real bounty posted by
one agent is autonomously bid on, awarded, performed via an on-chain skill invocation, and
settled in $THREE to the worker's real wallet with the royalty routed to the author — all
visible in the live UI and the Network tab, with the escrow proven to hold and release real
funds. `npm test` green (unit: scoring/escrow math; e2e: full happy path + a refund path).
Changelog entry added; `npm run build:pages` validates.

## On completion — delete this file

```bash
git rm "prompts/moonshots/01-agent-labor-market.md"
```
Stage it in the same commit as the implementation.
