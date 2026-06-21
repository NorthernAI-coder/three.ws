# 04 — No-mocks / no-fake-data / no-TODO / no-stub sweep

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/production-1b/00-README.md`
> for shared context.

## Why this matters for $1B

`/CLAUDE.md`'s hard rules are absolute: no mocks, no fake data, no placeholders,
no TODOs, no stub functions, no `setTimeout` fake-loading, no fallback sample
arrays shipped to production. Every one of these is a promise the product can't
keep — a "feature" that secretly renders canned data, a progress bar that fakes
work, a handler that quietly does nothing. A $1B platform cannot ship a single
one. This sweep finds and eliminates them across the real source tree.

## Mission

Quantify every shortcut marker in shipped source, then fix or delete each one so
the codebase contains no TODO/FIXME, no `not implemented`, no production
mock/fake/sample arrays, and no fake `setTimeout` loading — per `/CLAUDE.md`.

## Map (trust but verify — files move)

- **Shipped source to sweep** — [api/](../../api) (~961 handlers), [src/](../../src)
  (~810 modules), [public/](../../public), [workers/](../../workers) (18). Exclude
  test files (`*.test.js`, `*.spec.js`), `node_modules`, and vendored dirs.
- **Hard rules reference** — [/CLAUDE.md](../../CLAUDE.md) "Hard rules
  (non-negotiable)" §1–6 and "The only coin — $THREE".
- **Empty-handler guard (catches stub handlers)** — [scripts/audit-empty-handlers.mjs](../../scripts/audit-empty-handlers.mjs)
  (`npm run audit:handlers`): fails on any `api/*.js` that exports nothing.
- **Resilience helpers to use instead of fakes** — [api/_lib/](../../api/_lib)
  (`forge-health.js`, `x402-spec.js`, `rate-limit.js`; `cockatiel` for real
  retries/circuit-breakers — never a `setTimeout` stand-in).
- **Baseline marker counts (re-measure first — they drift):** ~62 `// TODO`
  comments, ~6 `FIXME`, ~2 `const sample|mock|fake = [...]` arrays, ~7
  `setTimeout` calls near `progress`/`loading`/`width` in `src/`, 0
  `throw … not implemented`. Confirm with the greps below before you start.

## Do this

1. **Quantify first.** Run, and record the exact counts (re-run at the end to
   prove zero):
   - TODO/FIXME: `grep -rIn --include='*.js' --include='*.mjs' --include='*.html' -E 'TODO|FIXME' api src public workers | grep -v node_modules`
   - not implemented: `grep -rIn -iE "not implemented|notImplemented|throw new Error\(['\"\`].*not impl" api src public workers`
   - prod sample/mock/fake arrays: `grep -rIn -E 'const (sample|mock|fake|dummy)[A-Za-z]*\s*=\s*\[' api src public workers`
   - fake loading: `grep -rIn -E 'setTimeout' src | grep -iE 'progress|loading|fake|width'`
   - commented-out code blocks and `implement later`/`stub`/`placeholder`.
2. **TODO/FIXME — implement or delete.** For each, either build the real behavior
   the comment describes, or remove it if it's stale. No TODO survives. If a
   comment documents a genuine known limitation, convert it to honest user-facing
   handling (designed error/empty state), not a silent gap.
3. **Stub functions / empty handlers — finish them.** Run `npm run audit:handlers`;
   any flagged file gets a real implementation or is deleted along with its route.
   Hunt for functions that `return null`/`return []`/do nothing where the caller
   expects real data, and wire them to the real API.
4. **Production sample/mock/fake arrays — replace with real fetch.** Any
   `const sampleAgents = [...]` or fallback array rendered to users must become a
   real call to the live endpoint, with designed loading/empty/error states.
   Mocks belong only in `tests/` — leave those alone.
5. **Fake `setTimeout` loading/progress — make it real.** Replace simulated
   progress and `setTimeout` "loading" with progress driven by the actual async
   operation (real fetch/stream/poll). If the operation has no progress signal,
   use an honest indeterminate indicator (skeleton/spinner), not a faked bar.
6. **Commented-out code — delete or implement.** Per `/CLAUDE.md` §3, no
   commented-out code in committed work.
7. **`throw new Error("not implemented")` — implement it.** None should exist; if
   the grep surfaces any, build the real path.
8. **Verify and log.** Re-run every grep from step 1 and confirm zero in shipped
   source. Run `npm run audit:handlers`, `npx vitest run`, and exercise any
   surface you changed in a real browser (`npm run dev`). Add a `data/changelog.json`
   entry for any user-visible change (e.g. a screen that now shows real data), then
   `npm run build:pages`.

## Must-not

- Do not touch or remove mocks inside `tests/` — those are legitimate test doubles.
- Do not delete a feature to make a marker disappear; build the real version.
- Do not swap one shortcut for another (e.g. a sample array for a hardcoded
  constant) — wire the real data source.
- Do not reference any coin other than `$THREE` in any replacement data, fixture,
  or copy; use the $THREE CA or a clearly-synthetic placeholder.
- Do not refactor working code beyond what removing the marker requires.

## Acceptance (all true before claiming done)

- [ ] Start-of-task marker counts are recorded; end-of-task re-run shows **zero**
      TODO/FIXME/`not implemented`/prod sample-array/fake-`setTimeout` markers in
      `api`, `src`, `public`, `workers` (tests excluded).
- [ ] `npm run audit:handlers` exits clean (no empty/export-less handlers).
- [ ] Every former mock/sample surface now fetches real data with designed
      loading/empty/error states, verified in a real browser.
- [ ] No commented-out code remains in the files touched.
- [ ] No coin other than `$THREE` introduced anywhere.
- [ ] `npx vitest run` passes; changelog updated for user-visible changes and
      `npm run build:pages` is clean.
