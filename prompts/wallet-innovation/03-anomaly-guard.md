# 03 — The Self-Defending Wallet: Real-Time Behavioral Anomaly Guard

> Read `00-README.md` first. Obey every rule there. Delete this file only when
> fully done + self-improved.

## The problem worth solving

Static caps (`daily_usd`, `per_tx_usd`) and a manual `frozen` switch protect the
*known* failure modes. They do nothing about the *unknown* one: an agent that
gets prompt-injected, a strategy that goes haywire at 3am, a leaked session that
drains within the daily cap, a sudden burst of payments to a never-seen
counterparty. By the time a human notices, the money is gone.

## The game-changing feature

Give every wallet an **immune system**. The platform continuously learns each
agent's *normal* spending behavior and scores every outbound action in real time;
when something looks anomalous, it **auto-freezes the wallet and pings the owner
with one-tap approve/deny** — before the questionable spend settles, not after.
"Your money defends itself" is a story no agent-wallet competitor can tell.

## What to build (wire all of it, for real)

1. **Behavioral baseline per agent.** Compute, from real `agent_custody_events`
   + on-chain history, a per-agent profile: typical spend velocity (count &
   $/hour), typical & p95 transaction size, set of known counterparties /
   destinations, active hours, asset mix, and token-age distribution for trades.
   Recompute incrementally as new events land. Real data only — if an agent has
   little history, say so and widen tolerances rather than fake a baseline.
2. **Real-time anomaly score.** On every outbound action (called from
   `enforceSpendLimit` / `reserveSpendUsd`, so it covers trade/snipe/x402/withdraw),
   score deviation across the dimensions above into an interpretable signal:
   each contributing factor named ("3× your largest-ever trade", "first payment
   to this address", "20 spends in 2 minutes — 10× your normal velocity",
   "first activity outside your agent's usual hours"). Deterministic, fast, no
   blocking network call in the hot path.
3. **Graduated response, owner-tunable.** Sensitivity presets (Relaxed / Balanced
   / Strict). Below threshold → allow + record the score. Above → **auto-freeze**
   (reuse `meta.spend_limits.frozen`; coordinate with the freeze in
   `agent-trade-guards.js`) and hold/deny the triggering action, then notify.
   Never fail open: if scoring errors, default to the safe side per sensitivity.
4. **One-tap owner adjudication.** The owner gets a real notification (wire web
   push / the existing notify channel — `api/_lib/notify.js` — and surface it in
   the hub) describing *exactly* why, with **Approve** (unfreeze + allowlist this
   pattern so it won't re-trip) and **Deny/Keep frozen** (and optionally one-tap
   "sweep funds to safety" → withdraw). Approving must teach the baseline so the
   wallet gets smarter, not naggier.
5. **Anomaly timeline.** An owner-facing feed of scored events (allowed +
   flagged), each explained in plain language, with the action taken — so the
   guard is transparent, never a black box.

## Architecture guidance

- Baseline + scoring in a new module (e.g. `api/_lib/wallet-anomaly.js`); pure,
  unit-testable scoring functions fed live numbers by callers. Persist baselines
  in `meta` or a new table via migration; never block signing on recompute.
- Hook the score check into the shared guards as an additional predicate
  alongside the freeze and caps — additive, minimal, well-commented (shared hot
  file; coordinate per `00-README.md`).
- Notifications must be real and timely. If push isn't configured for a user,
  degrade to in-app + email/Telegram via whatever the platform already uses —
  never silently swallow an alert about someone's money.

## Security & correctness

- The guard must not become an oracle that leaks behavior to attackers via error
  text. Owner-only detail; generic refusal to the agent path.
- Avoid false-positive fatigue: every approve should measurably reduce future
  false trips for that pattern. Avoid false negatives on the catastrophic cases
  (velocity spikes, brand-new high-value destinations) by weighting them hard.
- Idempotent freezes; no thrash (don't freeze→unfreeze→refreeze in a loop).

## Testing

- Unit tests for each anomaly dimension and the combined score; baseline math;
  the "low history → wide tolerance" path; totality / fail-safe on bad input.
- A simulated attack scenario (sudden drain within the daily cap to a new
  address) that asserts the guard freezes + records + notifies.

## Deliverables

Baseline engine, real-time scorer wired into the shared guards, graduated
auto-freeze + tunable sensitivity, real owner notifications with one-tap
adjudication that trains the baseline, anomaly timeline UI, tests, changelog
(feature/security).

## Before you finish

Then improve it: make the explanation human and specific (not "score 0.82" but
"10× your usual pace, to an address you've never used"), and wire the "sweep to
safety" shortcut so a flagged owner can act in one tap. Verify the attack
scenario in the browser, review your diff, then **delete this prompt file.**
