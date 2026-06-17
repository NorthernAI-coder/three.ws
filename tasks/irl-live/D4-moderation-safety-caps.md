# D4 — Moderation, safety & density caps

## Goal

Public placement needs guardrails. Build: content checks on caption + avatar name
at POST time, a report flow (report a pin → hide/queue), per-area **density caps**
(max pins per small geocell), per-user/device pin caps + rate limits, and
expiry/cleanup. Keep everything $THREE-only and brand-safe.

## Why it matters

The moment "anyone at a location sees anyone's placed agent" ships (D1), the
abuse surface opens: slurs in captions, impersonation, ad spam, a single actor
carpet-bombing a plaza with 500 pins, a pin pointing at a malicious x402
endpoint. Without caps and moderation, the shared world becomes a liability the
first day it's public. This is the task that makes D1–D3 safe to launch.

## Honest abuse vectors (design against each)

1. **Hate / harassment in caption or avatar name** — public, on third-party
   embeds. → content filter at POST.
2. **Density flooding** — one actor places hundreds of pins to dominate a spot or
   grief a venue. → per-geocell cap + per-device cap.
3. **Rate spam** — scripted rapid POSTs. → token-bucket rate limit per device/IP.
4. **Malicious x402 endpoint** — a pin whose "pay" points at a scam/non-$THREE or
   off-platform drain. → endpoint allow-list + $THREE-only guard.
5. **Impersonation** — avatar named like an official entity. → name checks +
   report flow.
6. **Stale/ghost pins** — anonymous pins never cleaned up. → expiry + reaper.
7. **Report abuse** — mass false reports to hide a legit pin. → threshold +
   owner-protected, queue not instant-delete.

## Current state (real lines)

- `api/irl/pins.js:130` `POST` — inserts caption / avatarName / x402Endpoint with
  **no content check, no caps, no rate limit** today. This is the chokepoint to
  harden.
- `api/irl/pins.js:145` anonymous pins already get a 7-day `expires_at`; the
  nearby query (`:113`) and `/mine` (`:72`) already filter `expires_at > NOW()`.
  Expiry exists — we add a **reaper** so dead rows don't accumulate forever.
- `src/profanity.js` `WORD_BLACKLIST` — lower-case substring slur/severe list,
  already used by `src/widgets/pumpfun-feed.js`. **Reuse it server-side** for
  captions + names.
- `api/_lib/granite-guardian.js` `assess(cfg, { input, risks })` + `decide()` +
  `FLAG_THRESHOLD` — the existing AI content-risk layer (`social_bias`, `harm`,
  etc.). Use it as a second tier above the wordlist for borderline captions.
- `api/_lib/auth.js` `getSessionUser` — to attribute caps to a user when signed
  in; `device_token` covers anonymous.

## What to build

### 1. Content check at POST (`api/irl/pins.js`)

```js
import { WORD_BLACKLIST } from '../../src/profanity.js'; // shared list
import { guardianConfig, assess, decide } from '../_lib/granite-guardian.js';

function hardBlocked(text) {
  const t = String(text || '').toLowerCase();
  return WORD_BLACKLIST.some(w => t.includes(w));
}
// In POST, before INSERT:
if (hardBlocked(body.caption) || hardBlocked(body.avatarName)) {
  return json(res, 422, { error: 'content', field: 'caption',
    message: 'That text isn’t allowed on a public pin.' });
}
// Tier 2 — borderline text → Granite Guardian (skip if not configured)
const cfg = guardianConfig();
if (cfg && body.caption) {
  const verdict = decide(await assess(cfg, { input: body.caption }));
  if (verdict.flagged) return json(res, 422, { error: 'content', … });
}
```

- Wordlist is the always-on hard gate (no external dependency, fails closed and
  fast). Guardian is the smart tier — **skip gracefully if unconfigured** so POST
  never 500s on a missing key (Rule 9). Caption/name length clamp too
  (caption ≤ 140, name ≤ 40).

### 2. x402 endpoint + $THREE safety

- Validate `x402Endpoint`: must be `https:`, must resolve to a three.ws /
  allow-listed payment host (or the agent's own registered endpoint), reject
  arbitrary external URLs. Never let a pin advertise a non-$THREE token anywhere
  in caption/name — the wordlist gains a small **off-brand-coin guard** (reject
  captions naming a competing token; $THREE is the only coin).

### 3. Density + per-user caps (`api/irl/pins.js` POST)

```js
// Per fine geocell (precision-7, ~150m) density cap.
const cellPins = await sql`
  SELECT count(*)::int AS n FROM irl_pins
  WHERE geocell7 = ${cell7} AND (expires_at IS NULL OR expires_at > NOW())`;
if (cellPins[0].n >= MAX_PINS_PER_CELL /* e.g. 40 */)
  return json(res, 429, { error: 'area_full',
    message: 'This area already has the maximum number of agents.' });

// Per device/user active-pin cap.
const ownerKey = session?.id ?? body.deviceToken;
const owned = await sql`SELECT count(*)::int AS n FROM irl_pins
  WHERE (user_id = ${session?.id ?? null} OR device_token = ${body.deviceToken ?? ''})
    AND (expires_at IS NULL OR expires_at > NOW())`;
if (owned[0].n >= MAX_PINS_PER_OWNER /* e.g. 20 anon, higher when signed in */)
  return json(res, 429, { error: 'pin_limit', message: 'You’ve reached your active pin limit.' });
```

### 4. Rate limit (token bucket)

- Per device_token + IP: e.g. **5 POSTs / minute, 30 / hour**. Reuse the existing
  rate-limit store (the Redis `three-ratelimit` limiter referenced across the
  API). Return `429 { error:'rate', retryAfter }`. Fail-open-but-logged if the
  limiter store is down (don't block legit placement on an infra hiccup, but
  alert).

### 5. Report flow

- New `POST /api/irl/report { pinId, reason, deviceToken }` → insert into a new
  `irl_pin_reports` table `(id, pin_id, reporter_token, reason, created_at)`.
- When a pin crosses `REPORT_HIDE_THRESHOLD` distinct reporters (e.g. 3), set
  `irl_pins.hidden_at = NOW()`; the nearby query (`api/irl/pins.js:113`) adds
  `AND hidden_at IS NULL` so hidden pins vanish for everyone **and** D1 emits a
  `pin:remove`. Hidden, not deleted — queued for review, owner can appeal.
- Owner-placed pins still need ≥ threshold *distinct* reporters; a single actor
  can't hide a pin. Reporter token dedup prevents report-bombing inflation.
- UI: a "Report" affordance in `openPinSheet()` (`irl.js:1135`) → reason sheet →
  POST → toast "Thanks, we'll review it." (state-kit success/error states).

### 6. Expiry & cleanup reaper

- A cron (Vercel cron or the multiplayer host) deletes rows where
  `expires_at < NOW() - INTERVAL '1 day'` and purges resolved reports. Keeps the
  table and every geocell room lean. Signed-in permanent pins (`expires_at IS
  NULL`) are never reaped.

## Data / API changes

- `irl_pins`: add `geocell7 TEXT` (indexed, for density), `hidden_at TIMESTAMPTZ`.
  Nearby + mine queries gain `AND hidden_at IS NULL`.
- New table `irl_pin_reports (id, pin_id, reporter_token, reason, created_at)`
  with a unique `(pin_id, reporter_token)` to dedup.
- New `POST /api/irl/report`; route in `vercel.json`.
- `POST /api/irl/pins` gains content check → cap check → rate check, in that
  order (cheapest/most-decisive first), each with a designed error code.

## Connecting / reconnecting / offline states (state-kit)

- POST rejections (`content`/`area_full`/`pin_limit`/`rate`) surface as designed,
  actionable messages in the caption panel / status line (`setStatus(..., {
  error:true })`) — never a silent failure or a raw 4xx. Each tells the user
  exactly what to do (shorten text, move, wait, remove an old pin).
- Report sheet has loading / success / error states; a failed report is
  retryable, never a dead button.

## Acceptance checklist

- [ ] Caption/name containing a blacklisted term → `422`, designed message, no row inserted.
- [ ] Borderline caption flagged by Guardian when configured; POST still works (no 500) when it isn't.
- [ ] 41st pin in a precision-7 cell → `429 area_full`.
- [ ] Anonymous device past its active-pin cap → `429 pin_limit`.
- [ ] >5 POSTs/min from one device → `429 rate` with `retryAfter`.
- [ ] x402 endpoint outside the allow-list rejected; no non-$THREE token nameable in caption.
- [ ] 3 distinct reporters hide a pin (it vanishes for all viewers + D1 `pin:remove`); a single reporter cannot.
- [ ] Reaper purges expired anon pins; permanent signed-in pins untouched.
- [ ] No console errors; limiter-down degrades gracefully and logs.

## Out of scope

- The realtime transport itself → **D1**. Presence/ghosts → **D2**. Owner inbox →
  **C4**. Full human-review console for the report queue (this task only hides at
  threshold + queues; a moderator dashboard is a later epic).

## Verify

Hit `POST /api/irl/pins` with a blacklisted caption (422), spam to trip the rate
limit (429), fill a test geocell past the density cap (429), then file 3 reports
from 3 device tokens against one pin and confirm it disappears from
`GET /api/irl/pins` and D1 emits `pin:remove`.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-live/D4-moderation-safety-caps.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
