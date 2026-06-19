# Moonshot 05 — The Reasoning Ledger (auditable agent track record & explainable decisions)

> Read [00-README-orchestration.md](./00-README-orchestration.md) and the repo-root
> `CLAUDE.md` first. Ships a complete trust-infrastructure feature — not a log viewer.

## The invention

Every consequential decision an agent makes — a trade, a snipe, a bounty award (Moonshot
01), a hire, a moderation action — is recorded as a structured, timestamped, **publicly
auditable "thought"**: what it decided, *why* (the reasoning + the inputs it saw), what it
predicted, and — crucially — what actually **happened**. The ledger is cryptographically
anchored (so entries can't be backdated or quietly edited) and rolls up into a **provable
reputation**: not vibes, but a track record you can interrogate. "This trading agent is up
40% — show me every call it made and whether it was right."

Today an agent's decisions are a black box: holders trust a number with no way to audit it.
The Reasoning Ledger makes agents **accountable and explainable**, turning track record
into a first-class, verifiable, *tradeable* asset.

Why it's gamechanging: trust is the bottleneck for autonomous agents handling real money.
An agent that can **prove** its reasoning and its hit-rate is worth more, gets hired more
(Moonshot 01), and commands a premium. It is the credit score / audited-track-record layer
the entire agent economy is missing — and it's only credible *because* three.ws agents take
real, on-chain, consequential actions (not simulated ones).

## Real systems to build on (already wired)

- **Decision sources** — `api/trades/`, `api/trading/`, `workers/agent-sniper/` (real
  trades + snipes), `api/brain/` (reasoning), Moonshot 01's labor decisions, `api/irl/report.js`
  (moderation actions). Capture decisions at these existing chokepoints — don't bolt on a
  parallel path; instrument the real ones.
- **Memory + embeddings** — `api/memory/` (working/recall/archival, RAG). The ledger is a
  durable, queryable decision memory; reuse the embedding/recall infra for semantic search.
- **Outcome data (ground truth)** — `api/_lib/helius.js` (on-chain trade confirmation),
  `api/_lib/birdeye.js` + Jupiter (price outcomes), `api/pump/` (graduation outcomes),
  `api/oracle/`. An entry isn't complete until its *outcome* is reconciled against reality.
- **On-chain anchoring** — `contracts/` (ERC-8004 attestation), `contracts/agent-invocation/`.
  Anchor a periodic Merkle root / commitment of the ledger so entries are tamper-evident
  without putting every thought on-chain. Expose verification.
- **Reputation** — align with the reputation registry direction in
  `tasks/trading-frontier/` (read it; build the durable, auditable substrate it implies).
- **Delivery** — `api/_lib/alerts.js` (Telegram, incl. oracle/sniper channels),
  `api/notifications/`. Surface notable calls + outcomes to holders.
- **LLM** — `api/chat.js`; when an agent acts, capture the *actual* reasoning trace, don't
  re-confabulate it after the fact. Use the latest Claude where summarization is needed.

## Scope — capture, reconcile, prove, surface

1. **Ledger data model + write path (`api/_lib/reasoning-ledger.js`)** — `agent_decisions`
   (agent_id, kind, inputs_snapshot, rationale, prediction, confidence, action_ref/tx_sig,
   decided_at, entry_hash, prev_hash) forming a **hash-chain per agent** (each entry commits
   to the previous → tamper-evident, cheap, no per-entry chain write). Plus `decision_outcomes`
   (decision_id, observed_result, was_correct, pnl/impact, reconciled_at). A single helper
   that every decision chokepoint calls — instrument the *real* trade/snipe/award paths so
   nothing consequential is unlogged. **Pure** hash-chain + scoring logic, unit-tested.

2. **Outcome reconciliation (`api/cron/reconcile-decisions.js` or a worker)** — periodically
   resolve open predictions against ground truth (Helius/Birdeye/Jupiter/pump/oracle): did
   the trade fill, did the call go the predicted way, did the launch graduate? Write the
   outcome, update the rolling reputation. Idempotent; handles late/again data without
   double-counting. Alert on anomalies (a sudden hit-rate collapse).

3. **Reputation rollup** — a transparent, **explainable** score derived only from logged
   decisions + reconciled outcomes (hit rate, calibration — does its 80%-confidence actually
   hit 80%? — risk-adjusted PnL, sample size, recency). No opaque magic number; every point
   traces to entries. Expose the formula. This score feeds Moonshot 01 (auto-award weighting)
   and the marketplace/leaderboard.

4. **Tamper-evidence + verification** — periodically anchor a Merkle root of each agent's new
   entries on-chain (ERC-8004 / attestation). `GET /ledger/verify/:agentId` re-computes the
   hash-chain + checks it against the anchored root, so anyone can prove the history wasn't
   edited. A backdated or altered "thought" must be detectable.

5. **The Reasoning Ledger surface (`src/reasoning-ledger.js` + a tab on `src/agent-detail.js`)** —
   a readable, filterable timeline of decisions with rationale, prediction, and the
   *resolved outcome* (right/wrong, by how much), plus the headline reputation with a
   "how is this computed" drill-down and a calibration chart. Make being wrong **visible** —
   honesty is the trust signal. Semantic search over decisions ("show me every time it sold
   into a pump"). Verification badge linking to the on-chain anchor.

6. **Cross-wire** — reputation badge on profiles, marketplace, leaderboard, the labor market
   (Moonshot 01), and genome lineage (Moonshot 03 — pedigree + track record together). Holder
   feed + Telegram for standout calls and their outcomes.

## Quality + security bar

- **Honest by construction.** Capture the *real* reasoning at decision time; reconcile against
  *real* outcomes; never retro-fit a flattering narrative. Losses and wrong calls are shown,
  not hidden — a ledger you can't trust is worthless.
- Hash-chain + on-chain anchoring + verification endpoint are mandatory (this is the whole
  point). Pure crypto/scoring logic is unit-tested with adversarial cases (tamper attempts,
  late outcomes, tiny samples).
- Every state designed: no decisions yet, pending-outcome, reconciled, anomaly-flagged,
  verifying, verified, verification-failed. Performant timeline (paginated, lazy). a11y,
  responsive, reduced-motion for the calibration chart.
- $THREE only. No PII in public entries; respect existing privacy rules where a decision
  touches IRL/moderation data (coarse only, per `api/irl` discipline).

## Then make it better (mandatory)

After it works: let holders **subscribe** to an agent's verified calls (x402-gated alerts);
a cross-agent calibration leaderboard ("most honest forecaster"); a "second opinion" where
one agent audits another's reasoning and stakes $THREE on the verdict. Pick the upgrade that
makes track record *tradeable trust*, build it, re-evaluate.

## Definition of done

Meets the README Definition of done. Specifically: real agent decisions (a real trade/snipe
at minimum) are captured with reasoning + prediction at decision time, reconciled against
real on-chain/market outcomes, rolled into an explainable reputation, and the per-agent
hash-chain is anchored on-chain and independently verifiable via `GET /ledger/verify` —
with a tamper attempt provably detected. `npm test` green (unit: hash-chain integrity,
calibration/scoring, tamper detection; e2e: decide → reconcile → verify). Changelog entry;
`npm run build:pages` validates.

## On completion — delete this file

```bash
git rm "prompts/moonshots/05-reasoning-ledger-reputation.md"
```
Stage it in the same commit as the implementation.
