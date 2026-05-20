# Task: Audit Resend integration end-to-end

## Repo context

Working tree: `/workspaces/three.ws`. Vanilla JS + Vite frontend
(`npm run dev` → port 3000). Backend: Vercel functions in `api/`, workers in
`workers/`. Email is sent through Resend via `api/_lib/email.js`. The
codebase ships email for: auth (signup, password reset), SIWE/SIWS auth flows,
payments (EVM + Solana), cron jobs, newsletter subscribe.

## Rails (CLAUDE.md — non-negotiable)

- No mocks, no fake data, no placeholders, no TODOs, no stubs, no
  `throw new Error('not implemented')`, no commented-out code, no
  `setTimeout` fake-loading, no fallback sample arrays.
- Real APIs only — for tests, use fixture-based assertions against real
  Resend response shapes, not mocked Resend clients.
- Errors handled at boundaries only.
- Done = `npm test` green, `git diff` reviewed.
- Push to both remotes only when the user says push.

## Problem

`api/_lib/email.js` is the single send path, but call sites have drifted.
Some risks:

1. `RESEND_API_KEY` is unset in dev and on preview deploys. Every caller
   must handle that without throwing — return early, no-op, log once.
2. Template names and argument shapes may have diverged between caller and
   the helper (a renamed prop silently breaks the rendered HTML).
3. Some templates may render invalid HTML (unclosed tags, broken URLs,
   missing alt text) — never noticed because no one inspects the rendered
   output.
4. There are no fixture-based unit tests under `tests/email.test.js`.

## What to implement

### Step 1 — map every caller (delegate to subagent)

Spawn an **Explore** subagent with this prompt:

> Find every file in `/workspaces/three.ws` that imports from
> `api/_lib/email.js` or calls `sendEmail` / `sendTemplate` / similar
> exports. For each hit, return: file path, line number, the exact call
> shape (function name + arg keys), and the calling endpoint or job name.
> Exclude `node_modules`, `dist`, `publish`, `agent-voice-chat/` (vendored),
> `agent-payments-sdk/` (vendored). Return as a markdown table.

Use the returned table as the audit checklist.

### Step 2 — audit each call site sequentially

For each caller in the table:

1. Read the file. Confirm it handles the no-API-key case **without
   throwing**. The helper itself should already return early on missing
   key — the caller should likewise not block the user-facing flow.
2. Confirm the template name passed to the helper exists in
   `api/_lib/email.js` (or wherever templates live).
3. Confirm the argument shape matches what the template expects (no
   missing keys; no extra keys silently dropped).
4. Render the template once locally (via a script under `scripts/` if
   one helps) and visually scan the HTML for: unclosed tags, broken
   image URLs (must be absolute https), broken action URLs, missing
   `<title>`, missing plain-text alternative.

Fix any issue you find in place. Do not leave a TODO. Do not stub a
template.

### Step 3 — write fixture-based unit tests

Create `tests/email.test.js` (or extend it if it exists). For each
template, write a test that:

1. Calls the template-render function with a realistic argument set.
2. Asserts the rendered HTML contains the key user-facing strings
   (subject, action URL, recipient display name).
3. Asserts the HTML parses as a valid DOM (use `linkedom` or `jsdom`
   — both are in the repo's deps; check `package.json` before adding).
4. Asserts that when `RESEND_API_KEY` is unset, the public `sendEmail`
   export returns the documented "skipped" shape and does not throw.

Do not mock the Resend client itself. Use the helper's documented
no-key short-circuit behavior to exercise the skipped path. For the
"would-send" path, assert the payload constructed before the network
call (the helper should expose this either by returning it under a
`debug` key in test mode, or via a separate `buildPayload` export — if
neither exists, add the export rather than mocking fetch).

### Step 4 — run the suite

```bash
npm test
```

All existing tests must still pass. New tests must pass.

### Step 5 — summarize what changed

Write to the response: which call sites were broken, how you fixed each
one, what tests you added. Do not commit unless the user asks.

## Definition of done

- Every call site of `api/_lib/email.js` is documented and audited.
- Every caller handles missing `RESEND_API_KEY` without throwing.
- Every template renders valid HTML with the expected user-facing
  strings.
- `tests/email.test.js` exists with at least one fixture-based test per
  template.
- `npm test` is green.
- `git diff` shows only intentional changes.

## Constraints

- Do not mock the Resend SDK. Use real payload assertions.
- Do not add new templates unless an existing caller is broken because
  the template it references is missing.
- Do not change the public signature of `sendEmail` unless every caller
  is updated in the same diff.
- If you discover that the audit reveals more than ~6 broken call sites,
  stop and report — the user may want to triage rather than fix all in
  one pass.
