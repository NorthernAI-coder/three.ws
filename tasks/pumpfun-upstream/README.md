# pump.fun upstream sync — task set

Generated 2026-06-08 from a recon pass over pump.fun's GitHub org
(`github.com/pump-fun`) and npm maintainers (`oussama-baton`, `security-baton`,
the publishers of the official `@pump-fun/*` packages).

Each `NN-*.md` here is a **self-contained prompt** — open a new chat in this repo
(`/workspaces/three.ws`) and paste the file's contents. They assume no prior
conversation context.

## Already done in the recon session (do NOT redo)

- ✅ Bumped `@pump-fun/pump-swap-sdk` manifest `^1.16.0 → ^1.17.0` in
  `package.json` (the lockfile already resolved 1.17.0; no reinstall needed).
- ✅ `@pump-fun/pump-sdk` confirmed current at `1.36.0`.
- ✅ Vendored pump.fun's public program docs + IDLs into
  [`docs/pumpfun-program/`](../../docs/pumpfun-program/) (snapshot of
  `pump-public-docs@1b82215`, 2026-06-08).
- ✅ Confirmed `@pump-fun/agent-payments-sdk` is a **local workspace**
  (`agent-payments-sdk/`, version 3.1.0) — `^3.1.0` resolves locally; in-repo
  installs are fine. (Upstream npm `latest` is 3.0.3 → see task 04.)

## Open tasks

| #   | File                                     | Priority | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ---------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | `01-v2-trade-instructions-usdc-audit.md` | **High** | Audit our buy/sell instruction building against the new `buy_v2`/`sell_v2` interface + decide/implement USDC-quoted-coin support.                                                                                                                                                                                                                                                                                                                                                            |
| 02  | `02-pump-fun-skills-upstream-sync.md`    | ✅ Done  | Diff our vendored `pump-fun-skills/` against the official repo's latest; sync drift while preserving our additions. Outcome: upstream dormant at `c8aaa6a8`, we're at/ahead — nothing to pull. Re-verified 2026-06-11 and fixed a three.ws-internal regression (coin-fees scripts used `isCreatorUsingSharingConfig`, removed in the `1.36.0` SDK we pin → renamed to `hasCoinCreatorMigratedToSharingConfig`, lock regenerated) → [`02-skills-drift-report.md`](02-skills-drift-report.md). |
| 03  | `03-pump-segments-sdk-investigation.md`  | Low      | Figure out what `pump-segments-sdk` (new, unpublished) is and whether three.ws should adopt it.                                                                                                                                                                                                                                                                                                                                                                                              |
| 04  | `04-agent-payments-sdk-reconcile.md`     | ✅ Done  | Decide how to handle our local `agent-payments-sdk@3.1.0` vs upstream's published 3.0.3. Outcome: kept as a deliberate fork, renamed `@three-ws/agent-payments` (workspace); root manifest pins real `@pump-fun/agent-payments-sdk@^3.0.3` for external-facing templates → [`agent-payments-sdk/FORK_NOTES.md`](../../agent-payments-sdk/FORK_NOTES.md).                                                                                                                                     |

## Constraints that apply to every task (from CLAUDE.md)

- **Only `$THREE` (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) may ever be
  referenced.** Never name, hardcode, or surface any other coin/mint — in code,
  tests, fixtures, docs, or commits. Generic coin-agnostic plumbing where a mint
  is supplied at runtime is the only exception.
- No mocks, no fake data, no placeholders, no TODOs, no stubs. Real APIs/SDKs only.
- Keep the repo root clean; throwaway scripts go in `scripts/` or are deleted.
- Before claiming done: `npx prettier --check` your changed files, run relevant
  tests, and review your own `git diff`.
- **Pushing:** only on explicit user approval, and push to **both** remotes
  (`git push threeD main` && `git push threews main`). Never pull/fetch from
  `threeD` (push-only mirror).
