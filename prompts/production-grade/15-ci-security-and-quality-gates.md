# Task 15 — CI hardening: dependency scanning, blocking typecheck, bundle budget

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. **Track E —
> Engineering excellence.** Independent of `14` but completes the CI story. Mostly CI/config
> work — much of it may be internal-only (no changelog entry) per CLAUDE.md.

## The thesis

A $1B platform doesn't merge unvetted dependencies, ship type-unsafe contract changes, or let
multi-megabyte bundles slip in silently. three.ws's CI is good but has three holes: no
dependency/vulnerability scanning, typecheck is advisory (`continue-on-error`), and the bundle
size limit is a warning, not a gate. Close them.

## What exists today (read first)

- **CI** — [.github/workflows/ci.yml](../../.github/workflows/ci.yml): lint, vitest, source
  guards, build check. Typecheck runs with `continue-on-error: true` (~line 78) — advisory only.
- **No dependency scanning** — no `.github/dependabot.yml`, no `npm audit` gate, no SBOM. With
  ~20 workspaces and 100+ direct deps, transitive CVEs can ship unnoticed.
- **Bundle limit is a warning** — [vite.config.js](../../vite.config.js)
  `chunkSizeWarningLimit: 1000` (~line 219) warns but never fails; multi-MB chunks ship silently.
- **Typecheck setup** — `npm run typecheck` (`tsc -p jsconfig.json`) passes today (0 errors per
  the audit), so flipping it to blocking is low-risk and locks in the win.

## What to build

1. **Dependency / vulnerability scanning in CI.** Add Dependabot (`.github/dependabot.yml`) for
   the npm workspaces (grouped, sensible cadence) **and** a CI step that runs `npm audit` (or an
   equivalent scanner) and fails on high/critical advisories. Tune the severity threshold so the
   gate is meaningful but not noise — document any allowlisted advisory with a reason.
2. **Make typecheck blocking.** Flip the typecheck job off `continue-on-error` in
   [ci.yml](../../.github/workflows/ci.yml) now that it's clean, so a type regression blocks
   merge. If flipping surfaces latent errors, fix them (don't re-disable). Consider adding
   `@ts-check` to high-value `api/` handlers incrementally to widen real coverage — but don't
   boil the ocean; the gate is the win.
3. **Bundle-size budget gate.** Turn the bundle limit into a real gate: fail CI when a chunk
   exceeds a budget you set from current real sizes (with a little headroom), so regressions are
   caught. Keep heavy-but-intentional chunks (three.js, solana) within explicit, documented
   budgets rather than an undifferentiated global number.
4. **Wire the existing audit scripts into the gate.** The repo already has
   `audit:handlers`/`audit:pages`/`audit:mcp`/`audit:deploy` — ensure the ones that should block
   merge actually run in CI (audit which are gated vs manual; close the gaps).

## Hard rules specific to this task

- **Gates must be trustworthy, not theatrical.** A scanner that always fails on irrelevant
  advisories gets bypassed. Set thresholds a real team would keep green, and document
  exceptions.
- Don't break existing green CI for unrelated PRs. Roll out blocking gates in a way that's
  immediately passing on `main` (fix-forward, not disable).

## Definition of done

README DoD adapted for infra: Dependabot configured; an `npm audit` (or equivalent) gate fails
on high/critical; typecheck is blocking and green; a bundle-size budget gate is in place and
green; the appropriate `audit:*` scripts run in CI. Demonstrate each gate catches a planted
regression (then revert the plant). Changelog only if user-visible (likely omit — internal).
Self-review, then tighten the weakest gate.

Delete this file when done.
