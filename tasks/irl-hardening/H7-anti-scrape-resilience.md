# H7 — Anti-scrape resilience, fail-closed reads, anomaly alerting

> Epic IRL-Hardening · Size **M** · Touches `api/irl/pins.js`,
> `api/_lib/rate-limit.js` (read its limiter semantics), `api/_lib/alerts.js`,
> and the H1 suite. Builds on **H3** (proof-of-presence).

## Goal

Prove — with tests and runtime behavior — that the public nearby read cannot be
turned into a bulk location-harvesting tool, and that it **fails closed** under
stress rather than opening the floodgates. Add anomaly detection so sweep-shaped
traffic is surfaced to ops, and document the residual threat model so the team
ships with eyes open.

## Why it matters

A location feed is only as private as its worst day. The dangerous failure mode is
silent: a limiter outage that fails *open*, a radius cap that's accidentally
widened, or a slow methodical sweep that never trips a per-minute counter. "We rate
limit it" is not a guarantee until it's tested at the boundary and the degradation
path is known. This task converts assumptions into asserted, monitored facts.

## Current state (verified)

- `api/irl/pins.js` read path: `radius` clamped `[10,60]`, default 40; IP
  rate-limit `limits.publicIp`; coarse allow-list projection; coords coarsened
  (`roundCoord`, shipped). With **H3**, reads also require a cell-bound fix token.
- `api/_lib/rate-limit.js` limiters return `{ success, reason }`; some buckets
  "fail closed" with `rate_limiter_unavailable`, others fail open (per the
  `redis-quota-incident` + `http.js` `rateLimited` reason handling). **The read
  path's degradation behavior must be verified, not assumed.**
- `api/_lib/alerts.js` `sendOpsAlert` exists (deduped by signature) and is already
  used for IRL pay events — reuse for anomaly alerts.

## What to build

### 1. Verify + enforce fail-closed on the read

Audit which limiter backs the nearby read and what it does when Redis is degraded.
For the **public location read**, a degraded limiter must **fail closed** (reject
with a retryable `rate_limiter_unavailable`, surfaced by the client as "temporarily
unavailable, retrying"), never fail open into an unmetered scrape window. If the
current bucket fails open, switch the read to a fail-closed bucket or add an
explicit guard. Document the decision in the handler.

### 2. Boundary tests (in the H1 suite)

- A request with `radius` > 60 is clamped to 60 (already true — pin it).
- A burst past the per-IP ceiling returns 429 with `Retry-After`.
- With the limiter forced into its degraded state, the read **rejects** (closed),
  not serves.
- With **H3** active: a single fix token can only read its own cell (+ neighbors),
  so a token-per-cell sweep needs a real fix per cell — assert a far-cell read
  with a near-cell token is denied.

### 3. Sweep anomaly detection → ops alert

Add lightweight per-IP/-device counters (Redis, short TTL) tracking **distinct
cells read** within a window. A single caller reading many distinct geocells in a
short time is sweep-shaped (a real user stays in ~1 cell). Past a threshold, fire a
deduped `sendOpsAlert('IRL sweep suspected', …)` with the IP/device hash and cell
count — **never** with any coordinate or token (route through the same discipline
as `redactUrl`). Optionally auto-tighten that caller's limit for a cooldown.

### 4. Document the residual threat model

Add a short, honest `THREAT-MODEL.md` (in this folder or `docs/`) stating what the
read protects against (remote browsing, bulk harvest, deanonymization via owner id,
log/Referer credential leak) and the accepted residual (someone physically present
can, by definition, see the handful of pins right where they stand — that's the
product). No silent caps: if any limit drops coverage, it's written down.

## Data / API changes

- No new public endpoints. New internal Redis counters (short TTL).
- New ops-alert signal `IRL sweep suspected` (coordinate-free).
- New doc: `THREAT-MODEL.md`.

## Acceptance checklist

- [ ] The nearby read fails **closed** under limiter degradation (verified by test).
- [ ] Radius clamp, burst 429, and (with H3) cross-cell denial are asserted in H1.
- [ ] Distinct-cell sweep detection fires a deduped, coordinate-free ops alert past threshold.
- [ ] `THREAT-MODEL.md` documents protections + accepted residual + any coverage caps.
- [ ] No alert/log path emits a coordinate or token (reuse the redaction discipline).
- [ ] `npm test` + `npm run typecheck` green.

## Out of scope

The proof-of-presence mechanism itself (**H3**, a dependency) and per-account
reputation/banning (future). This task verifies, monitors, and documents.

## Verify

Run the boundary tests green. Locally force the limiter degraded and confirm the
read rejects. Simulate a multi-cell sweep against a dev instance and confirm a
single deduped ops alert fires with counts only — no coordinates.
