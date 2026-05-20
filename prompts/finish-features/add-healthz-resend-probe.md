# Task: Add Resend probe to `/api/healthz`

## Repo context

Working tree: `/workspaces/three.ws`. Backend: Vercel functions in `api/`.
The existing health endpoint is `api/healthz.js`. It already reports the
status of the things the app depends on (database, R2, etc.). Email is
sent through Resend via `api/_lib/email.js`. There is no Resend probe
yet, so a broken / missing key only surfaces when a user-facing flow
tries to send.

## Rails (CLAUDE.md — non-negotiable)

- No mocks, no fake data, no placeholders, no TODOs, no stubs, no
  `throw new Error('not implemented')`, no commented-out code, no
  `setTimeout` fake-loading, no fallback sample arrays.
- Real APIs only — the probe must hit Resend over the network.
- Errors handled at boundaries only.
- Done = `curl /api/healthz` against `npm run dev` returns the new field,
  `npm test` green, `git diff` reviewed.
- Push to both remotes only when the user says push.

## Problem

`api/healthz.js` should expose a `resend` field with one of three values:

- `"configured"` — `RESEND_API_KEY` is set and the key is accepted by
  Resend.
- `"missing"` — `RESEND_API_KEY` is unset or empty.
- `"key_invalid"` — `RESEND_API_KEY` is set but Resend rejected it as
  invalid (HTTP 401 with `restricted_api_key` is treated as **valid**,
  since send-only keys legitimately can't list domains).

The probe must be cheap and rate-limited — Resend will complain if we
hammer it. Cache the result for **5 minutes** in module scope.

## What to implement

### Step 1 — read the current endpoint

Open `api/healthz.js`. Note how existing probes (db, r2) are structured.
Match the same pattern.

### Step 2 — add the Resend probe

Inside the handler (or as a small module-scoped helper above the
handler):

```js
// Module-scoped cache: { value, expiresAt }
let _resendCache = { value: null, expiresAt: 0 };

async function probeResend() {
  const now = Date.now();
  if (_resendCache.value && _resendCache.expiresAt > now) {
    return _resendCache.value;
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    _resendCache = { value: 'missing', expiresAt: now + 5 * 60 * 1000 };
    return 'missing';
  }

  let result;
  try {
    const r = await fetch('https://api.resend.com/domains', {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}` },
      // 3s upper bound — healthz must stay fast
      signal: AbortSignal.timeout(3000),
    });
    if (r.ok) result = 'configured';
    else if (r.status === 401) {
      // Could be a restricted (send-only) key, which is still valid.
      const body = await r.text().catch(() => '');
      result = body.includes('restricted_api_key') ? 'configured' : 'key_invalid';
    } else if (r.status === 403) result = 'configured'; // send-only often returns 403
    else result = 'key_invalid';
  } catch {
    // Network error / timeout — don't fail healthz, report as missing-signal.
    // Caller treats this conservatively as "unknown" → 'key_invalid'.
    result = 'key_invalid';
  }

  _resendCache = { value: result, expiresAt: now + 5 * 60 * 1000 };
  return result;
}
```

Call `probeResend()` inside the handler and include the result under
the key `resend` in the JSON response. Place it alongside the other
dependency-status fields.

### Step 3 — add a test

`tests/healthz.test.js` (create if it does not exist). Use `vitest`
(the repo's test runner — confirm by reading `package.json`). The test
should:

1. Stub `globalThis.fetch` for the Resend call only (other healthz
   probes hit the real db; do not mock those — instead skip the test
   under no-db env, the same way other tests in the repo skip).
   Override `fetch` with a small function that returns `{ ok: true,
   status: 200 }` to assert `resend === 'configured'`.
2. Reset the module-scoped cache between cases. Either re-import with
   `vi.resetModules()`, or export a `_resetResendCache` helper from
   `api/healthz.js` for test use. Pick whichever fits the existing
   pattern in `tests/`.
3. Cases: `missing`, `configured` (200), `configured` (401 with
   `restricted_api_key` body), `key_invalid` (401 without it),
   `key_invalid` (500), `key_invalid` (timeout — reject fetch).

Do **not** call the real Resend API in tests. The probe itself in
production hits the real API; tests assert the dispatch logic.

### Step 4 — verify in dev

```bash
npm run dev
curl http://localhost:3000/api/healthz
```

Confirm the response includes `resend: "..."`. If `RESEND_API_KEY` is
set in `.env`, expect `configured`. If unset, expect `missing`.

### Step 5 — run the full suite

```bash
npm test
```

## Definition of done

- `api/healthz.js` returns a `resend` field with one of the three
  documented values.
- The result is cached for 5 minutes in module scope.
- `tests/healthz.test.js` covers all five branches without calling the
  real Resend API.
- `curl /api/healthz` against `npm run dev` shows the new field.
- `npm test` is green.

## Constraints

- Do not increase healthz latency beyond ~3 seconds upper bound.
- Do not log the API key value anywhere.
- Do not delete or rewrite the existing probes — only add `resend`.
- Cache TTL is exactly 5 minutes, not configurable via env. Hard-code it.
