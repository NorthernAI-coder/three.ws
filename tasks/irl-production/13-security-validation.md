# Task 13 — Security & validation hardening

**Phase:** 3 (backend) · **Effort:** M · **Files:** `api/irl/pins.js`, `api/irl/report.js`

## Why
The placement/report/calibrate endpoints accept untrusted input from anonymous
devices. They must validate strictly, never leak server internals, enforce
ownership and expiry, and resist abuse — all while preserving the deliberate
location-privacy lockdown (no widening of nearby reads).

## Read first (verify before fixing)
- Outfit bake error response (`detail: err?.message`) — `api/irl/pins.js:~400`
- Calibrate/outfit ownership + id handling — `api/irl/pins.js:~282-372`
- Pin expiry on mutations — `api/irl/pins.js:~285, 372`
- x402 endpoint allow-list parse — `api/irl/pins.js:~109-125`
- Report `detail` sanitization — `api/irl/report.js:~70-73`
- Report abuse caps (per-IP exists; per-pin?) — `api/irl/report.js`

## Scope — confirm, then fix

1. **No internal-detail disclosure.** The outfit-bake error must not echo
   `err.message` to the client (it can leak paths/upstream errors). Log full detail
   server-side; return a generic message. Sweep other endpoints for the same pattern.

2. **Strict id validation.** Validate pin `id` is a UUID (or the exact expected
   format) at the top of calibrate/outfit/delete paths — reject early with `400`.
   (SQL is already parameterized; this stops oversized/garbage ids reaching logs.)

3. **Ownership + expiry on mutations.** Calibrate, outfit, and delete must verify the
   `device_token`/owner AND that the pin is not expired (`expires_at IS NULL OR
   expires_at > NOW()`) before mutating. Confirm and add what's missing.

4. **Report input sanitization.** Sanitize/escape the `detail` field (strip control
   chars/null bytes, bound length) before storing, so the moderation console renders
   it safely.

5. **Report abuse caps.** In addition to per-IP limits, add a per-pin ceiling (e.g.
   reject once a pin exceeds N reports in 24h) so a distributed report flood can't
   hide a legitimate pin faster than intended. Keep the distinct-reporter dedup.

6. **Config validation.** If `IRL_X402_ALLOWED_HOSTS` is empty/malformed, fail safe
   (reject external x402 endpoints) rather than silently accepting a relative/blank
   host. Validate the parsed allow-list.

## Constraints
- **Do not widen the nearby read, add a location feed, or re-add pin broadcast.** The
  privacy lockdown stands.
- **Do not edit `data/changelog.json`** — return the proposed line in your summary.

## Definition of done
- [ ] No client response leaks internal error detail (coordinate with task 11).
- [ ] id/expiry/ownership/allow-list/report-detail validation covered by
      `tests/api/irl-*.test.js`.
- [ ] Per-pin report cap covered by a test.
- [ ] `npm test` green.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-production/13-security-validation.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
