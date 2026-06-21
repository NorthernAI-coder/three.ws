# 28 — Incident response & on-call

**Phase 7. Serial.** Pairs with [27 — launch runbook](27-launch-runbook.md);
this is what you reach for when launch (or any day after) goes sideways.

## Where you are

`/workspaces/three.ws` — three.ws, 3D AI-agent platform handling real money
(Solana, x402 USDC, pump.fun, $THREE). Observability + alerting were built in
[11](11-observability.md), resilience in [10](10-resilience-external-calls.md).
Read [CLAUDE.md](../../CLAUDE.md). The only coin is **$THREE**.

## Objective

A real incident-response capability: documented severity levels, runbooks for the
most likely failures, clear ownership and escalation, a rollback that works, and
a blameless post-mortem process. When something breaks at scale, the team
responds in minutes with a known procedure — not improvisation.

## Why it matters

At a billion-dollar scale, the question is not *if* something breaks but *how
fast you recover* and *whether users lose money or trust*. A money platform with
no incident plan is one bad night from a reputation it can't recover. Operational
maturity is part of what makes the valuation defensible.

## Instructions

1. **Severity model.** Define SEV1–SEV4 with concrete examples for this platform:
   - SEV1: payments failing / funds at risk / total outage / suspected key
     compromise.
   - SEV2: a core journey down (forge, login, marketplace) for many users.
   - SEV3: degraded/slow, single feature broken, elevated error rate.
   - SEV4: cosmetic / low-impact.
   Each severity gets a response-time target and an escalation path.
2. **Runbooks for the likely failures** (in `docs/runbooks/`):
   - Solana RPC outage / throttling → failover behavior, manual endpoint swap.
   - pump.fun feed down → degraded mode, what users see.
   - LLM proxy (OpenAI/Anthropic) failure → fallback/queue.
   - x402 facilitator / payment failure → how to stop charges, reconcile, refund.
   - Database / KV outage → read-only mode, cache-serve.
   - Suspected secret/key compromise → immediate rotation steps (ties to
     [07](07-secrets-and-env-hardening.md)), revoke, audit.
   - Bad deploy → the one-command rollback from
     [27 — launch runbook](27-launch-runbook.md).
   Each runbook: detection signal → immediate mitigation → root-cause steps →
   verification → comms.
3. **Detection → response wiring.** Confirm the alerts from
   [11 — observability](11-observability.md) map to these runbooks: an alert
   names the likely runbook. No alert without an action.
4. **Ownership & escalation.** Document who's on call, how they're paged, and the
   escalation chain. Even a small team needs a defined first responder and
   backup. Status-page updates ([26 — trust surfaces](26-trust-surfaces.md)) are
   part of SEV1/SEV2 response.
5. **User-facing comms templates.** Pre-written, honest templates for status-page
   updates and announcements during an incident — $THREE-compliant, no
   speculation, clear on user impact and ETA.
6. **Money-incident specifics.** A precise procedure for payment incidents: how
   to halt the affected flow, identify impacted transactions (from the receipts/
   ledger in [24](24-monetization-completeness.md)), reconcile, and make users
   whole. Funds-at-risk is always SEV1.
7. **Post-mortem process.** A blameless template (timeline, impact, root cause,
   what worked, action items with owners) and the rule that every SEV1/SEV2 gets
   one. Action items feed back into the backlog.
8. **Rehearse.** Run one tabletop/game-day for a SEV1 (e.g. "RPC is down and
   payments are failing") and confirm the runbook actually leads to recovery.
   Note gaps and fix them.

## Definition of done

- [ ] SEV1–SEV4 model with examples, response-time targets, and escalation paths
      documented.
- [ ] Runbooks in `docs/runbooks/` for RPC, pump feed, LLM proxy, x402/payments,
      DB/KV, key compromise, and bad-deploy rollback — each with
      detection→mitigation→root-cause→verify→comms.
- [ ] Every alert maps to a runbook (no alert without an action).
- [ ] On-call ownership + escalation + status-page update process documented.
- [ ] Honest, $THREE-compliant incident comms templates ready.
- [ ] A precise money-incident procedure (halt → identify → reconcile → make
      whole).
- [ ] Blameless post-mortem template + the SEV1/SEV2-always rule.
- [ ] One SEV1 tabletop rehearsed; gaps found are fixed.
- [ ] Changelog: skip (internal ops).
