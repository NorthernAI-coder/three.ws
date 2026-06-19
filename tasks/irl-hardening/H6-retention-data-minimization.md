# H6 — Retention + data-minimization (reaper + interactions)

> Epic IRL-Hardening · Size **S** · Touches `api/cron/irl-reap.js`,
> `api/irl/interactions.js` (`ensureTable`), and the H1 suite.

## Goal

Stop location-bearing data from outliving its purpose. The hourly reaper currently
deletes expired anonymous pins and orphaned reports — but **never touches
`irl_interactions`**, which store a `viewer_device` and the pin's `lat`/`lng` on
every tap/view/message/pay. Those rows linger after their pin is gone, and forever
for permanent pins. Add a retention policy: cascade-delete interactions when their
pin dies, and age out old interaction rows so a place someone visited isn't kept
indefinitely.

## Why it matters

Data minimization is the cheapest, most durable privacy control: data you don't
keep can't leak. An interaction row is a record that *device X was at coordinate
Y at time T* — exactly the kind of trail that should not accumulate. Closing this
gap shrinks the blast radius of any future incident to "live pins only."

## Current state (verified)

- `api/cron/irl-reap.js` (hourly, cron-secret-gated): deletes `irl_pins` with
  `expires_at < NOW() - INTERVAL '1 day'`, and `irl_pin_reports` orphaned by a
  missing pin. **No `irl_interactions` cleanup at all.**
- `api/irl/interactions.js` `ensureTable()` creates `irl_interactions` with
  `pin_id`, `viewer_device`, `lat`, `lng`, `created_at`, etc. and the pay/earnings
  columns. No retention index, no FK cascade.
- Permanent (signed-in) pins never expire, so their interaction trail grows
  unbounded.

## What to build

### 1. Cascade orphaned interactions in the reaper

In `api/cron/irl-reap.js`, after the pin delete, add a guarded delete of
interactions whose pin no longer exists (mirror the `irl_pin_reports` orphan
sweep, with the same `to_regclass` existence guard so a fresh DB never 500s):

```js
const reapedIx = ixTable
  ? await sql`
      DELETE FROM irl_interactions ix
      WHERE NOT EXISTS (SELECT 1 FROM irl_pins p WHERE p.id = ix.pin_id)
      RETURNING ix.id`
  : [];
```

Return `reapedInteractions` in the JSON summary alongside `reapedPins` /
`reapedReports`.

### 2. Age-out window for interactions

Add a retention window (e.g. delete interactions older than 180 days regardless of
pin state — choose and document the number). This bounds the trail even for
permanent pins. Keep `pay` rows if they're needed for earnings history, OR move the
durable earnings aggregate elsewhere and still age out the raw geo-bearing row —
decide explicitly and write the rationale in the file header.

```sql
DELETE FROM irl_interactions
WHERE created_at < NOW() - INTERVAL '180 days'
RETURNING id;
```

Add `CREATE INDEX IF NOT EXISTS irl_interactions_created ON irl_interactions (created_at)`
in `ensureTable()` so the sweep is index-backed.

### 3. Minimize what's stored going forward

Review the columns `irl_interactions` actually needs. The stored `lat`/`lng` are
the *pin's* location (already owned by the pin) — confirm whether duplicating them
on every interaction row earns its keep or can be dropped/joined on read. If kept,
note why. Don't store anything the owner inbox doesn't render.

## Data / API changes

- `api/cron/irl-reap.js`: deletes orphaned + aged-out interactions; richer summary.
- `api/irl/interactions.js`: new `created_at` index; documented retention window.
- No new endpoints. The on-demand cascade for user-initiated deletes lives in **H5**.

## Acceptance checklist

- [ ] Reaper deletes interactions orphaned by a removed pin (existence-guarded).
- [ ] Reaper ages out interactions past the documented window; index-backed.
- [ ] Reaper summary reports `reapedInteractions`; idempotent re-run deletes nothing new.
- [ ] Retention window + any column-minimization decision documented in the file header.
- [ ] H1 suite extended: an orphaned interaction is reaped; a fresh-DB run (no table) doesn't 500.
- [ ] `npm test` + `npm run typecheck` green.

## Out of scope

The user-facing "delete my data / forget device" actions (**H5** — which call the
same cascade on demand). Changing pin expiry windows.

## Verify

Invoke the reaper locally with the cron secret against a DB seeded with an
interaction whose pin was deleted and one older than the window; confirm both are
removed and the summary counts them; re-run and confirm zero further deletions.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-hardening/H6-retention-data-minimization.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
