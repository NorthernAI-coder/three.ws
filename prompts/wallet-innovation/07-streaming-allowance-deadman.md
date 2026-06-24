# 07 — Streaming Allowances + Dead-Man's Switch Recovery

> Read `00-README.md` first. Obey every rule there. Delete this file only when
> fully done + self-improved.

## The problem worth solving

Two gaps the current caps don't cover:

1. **A daily cap is a cliff, not a leash.** An agent can spend the *entire*
   day's budget in the first second — a compromised or runaway agent drains the
   full `daily_usd` instantly, then waits for the window to reset and does it
   again. The cap limits the total but not the *rate*, so it can't contain a fast
   drain within the window.
2. **No recovery if the owner disappears.** If an owner loses access, dies, or
   simply abandons an agent, the funds in its custodial wallet are stranded
   forever, still exposed to the agent's autonomous activity.

## The game-changing feature

Make **time a first-class safety primitive**:

- **Streaming allowances:** spendable budget **vests continuously** (e.g. $X
  accrues per hour up to a ceiling), like a Sablier-style stream but enforced on
  a custodial autonomous wallet. An agent can never spend faster than its budget
  vests — a drain is throttled to the stream rate, turning a catastrophic instant
  loss into a slow, observable, freezable trickle. Unused allowance can roll up
  to a cap. This is a genuinely new spend-control primitive for agent wallets.
- **Dead-man's switch:** if the owner is inactive for a configurable period, the
  wallet automatically protects the funds — escalating from *freeze autonomous
  spending* → *notify on every channel* → *auto-sweep to a pre-set recovery
  address* (a real on-chain withdraw the owner pre-authorized). Owner heartbeats
  (any authenticated wallet interaction, or an explicit "I'm here" tap) reset the
  timer. Inheritance/recovery for autonomous money, done safely.

## What to build (wire all of it, for real)

### Streaming allowance
1. **Vesting model.** Define a stream: `rate` (USD or SOL per interval), `cap`
   (max accrued), optional `cliff`. Available-to-spend at time *t* = clamp(prior
   balance + rate·elapsed, 0, cap) minus what's been spent since. Store config in
   `meta`; compute available amount deterministically from `now()` + the custody
   ledger — no background drip job required for correctness, but a clear readout.
2. **Enforcement.** Add a stream check to the shared guards
   (`enforceSpendLimit` / `reserveSpendUsd`) alongside the existing caps: an
   autonomous spend is allowed only if it fits within the **currently-vested**
   available amount. Compose with daily/per-tx caps and policy — the tightest
   wins. Advisory-locked accounting so concurrent spends can't overspend the
   vested balance. Owner withdraw is not throttled by the stream.
3. **Live UX.** Show the allowance **filling in real time** in the wallet hub —
   a smooth, accessible meter ("$12.40 of $50 available, +$2.08/hr") with
   reduced-motion support. Make the safety property legible: "your agent can
   spend at most $2.08 in the next hour." All states designed.

### Dead-man's switch
4. **Heartbeat + timer.** Track last owner activity (auth events / explicit
   check-in). Owner configures the inactivity threshold and the escalation
   ladder. A real cron (`api/cron/`) evaluates timers and drives escalation;
   each step writes a custody event and notifies.
5. **Recovery address + auto-sweep.** Owner pre-sets a recovery destination
   (validated, on-curve, ideally allowlisted; consider requiring passkey step-up
   from `05` to set/change it). On final escalation, perform a **real** withdraw
   sweep to that address via the existing signed withdraw path — fully audited,
   idempotent, reusing `loadOwnedWallet`/withdraw plumbing where possible.
6. **Guardrails on the switch itself.** Generous warnings before any sweep
   (notify well ahead), an easy reset/heartbeat, and a clear cancel. The switch
   must never fire on a transient outage — require a real, sustained inactivity
   signal and confirm the recovery address is still valid before sweeping.

## Architecture guidance

- Vesting math + dead-man evaluation in pure, unit-tested modules; cron drives
  the time-based actions; guards consume the vested-amount function in the hot
  path. New config in `meta`; new state (heartbeat, escalation status) in `meta`
  or a new table via migration.
- Reuse the freeze (`frozen`) for the intermediate escalation step and the
  existing withdraw path for the sweep — don't reinvent signing.

## Security & correctness

- Fail safe: if the vested amount can't be computed, deny the autonomous spend.
- The dead-man sweep is high-stakes — make setting/altering the recovery address
  a step-up action, warn loudly, and make accidental firing essentially
  impossible (sustained inactivity + advance notice + easy reset).
- No way for the agent (vs the owner) to disable the switch or change the
  recovery address.

## Testing

- Unit tests: vesting accrual + ceiling + spend-against-vested under concurrency;
  guard composition (stream vs daily vs per-tx — tightest wins); dead-man
  escalation ladder transitions; "transient blip does not fire" logic.
- A real devnet run: configure a stream, attempt a spend over the vested amount
  (blocked) then within it (allowed); drive the dead-man timer to fire and assert
  a real sweep to the recovery address with a correct audit trail.

## Deliverables

Streaming-allowance model + enforcement + live meter UI, dead-man's switch
(heartbeat, escalation cron, recovery address, real audited auto-sweep), new
migration(s), tests, changelog (feature/security).

## Before you finish

Then improve it: let owners pick from human presets ("$2/hr, $50/day ceiling")
and visualize the stream so the throttle is obvious; make the dead-man status a
calm, reassuring readout ("Active — last seen 2h ago; protection arms after 30
days"). Verify both flows on devnet in the browser, review your diff, then
**delete this prompt file.**

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/wallet-innovation/07-streaming-allowance-deadman.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
