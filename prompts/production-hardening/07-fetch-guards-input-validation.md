# 07 · Fetch `.ok` guards + universal input validation

> **Phase 1 — Reliability** · **Depends on:** none · **Parallel-safe:** yes · **Effort:** M

## Mission
Two systemic gaps from the audit: (1) **20+ `await res.json()` calls without a prior `if (!res.ok)`
guard** — an upstream 4xx/5xx throws a confusing `JSON.parse` error instead of a clean failure; and
(2) **public read endpoints trust raw query params** while POST bodies are well-validated with zod.
Close both so every external response and every inbound request is validated at the boundary.

## Context (read first)
- `CLAUDE.md` ("Errors handled at boundaries (network, user input)").
- Validation infra: `zod` (dependency), `api/_lib/validate.js` (existing schemas), `readJson(req)` helper.
- Confirmed unguarded fetches: `api/play-og.js:74`, `api/pump/curve.js:45`, `api/agent-wallet-bridge.js:126`.
- Confirmed weak param handling: `api/galaxy.js:179` (`readJson().catch(() => ({}))` → empty query proceeds), `api/explore-item.js:23` (`kind` unparsed), `api/play-og.js:199` (`coin` empty-string accepted).

## Build this
1. **A safe fetch-JSON helper** — `api/_lib/fetch-json.js` exporting something like `fetchJson(url, opts)` that: respects existing SSRF guards (`api/_lib/ssrf.js` / `guardedFetch`), checks `res.ok`, and throws a structured error with status + a snippet of the body on failure. Replace the raw `await res.json()` sites with it.
2. **Query/param validation** — add zod schemas for query params on read endpoints (mirror the POST-body pattern). Validate at entry; return a clean 400 on bad input; never let `undefined`/empty silently flow downstream.
3. **`readJson` fallback discipline** — anywhere `readJson().catch(() => ({}))` is used, validate the parsed body with a schema and 400 on failure instead of proceeding with an empty object.
4. **A lint guard** — add a check (ESLint rule or a `scripts/audit-*.mjs`) that flags `await <x>.json()` not preceded by an `.ok` check / not going through `fetchJson`, and `readJson(` without a nearby `.parse(`. Wire into CI so it can't regress.

## Files likely in play
`api/_lib/fetch-json.js` (new), the unguarded-fetch + weak-param files above, broader `api/` sweep, `api/_lib/validate.js` (new query schemas), `.eslintrc`/`scripts/audit-*.mjs`, `.github/workflows`.

## Definition of done
- [ ] No raw `await res.json()` without `.ok`/`fetchJson` in `api/`; lint guard enforces it.
- [ ] Read endpoints validate query params with zod and return clean 400s.
- [ ] No `readJson().catch(() => ({}))` proceeding on empty/invalid input.
- [ ] Tests: add cases for malformed input → 400 and upstream-error → structured failure.
- [ ] Changelog: internal hardening → **no** entry (unless a user-visible error message improves).

## Guardrails
Follow CLAUDE.md. Keep using `guardedFetch`/SSRF protections — do **not** route new fetches through `axios` (see prompt 15). Push both remotes.
