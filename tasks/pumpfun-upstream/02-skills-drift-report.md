# Drift report: `pump-fun-skills/` vs official upstream

**First run:** 2026-06-08 · **Re-verified + fix applied:** 2026-06-11
**Task:** [02-pump-fun-skills-upstream-sync.md](02-pump-fun-skills-upstream-sync.md)
**Upstream:** `github.com/pump-fun/pump-fun-skills` — branch `main`,
HEAD `c8aaa6a8` (`Merge pull request #9 from pump-fun/bump-sdk-versions`,
committed + `pushed_at` 2026-04-23). No tags, no releases, **no new commits since
the 2026-06-08 run** — upstream is still dormant at the same HEAD.

## TL;DR

**Upstream has not moved since the first run; our vendored copy remains at or
ahead of upstream HEAD on every shared file, so there is still nothing to _pull_
from upstream.**

The 2026-06-11 re-verification did, however, surface and fix one **three.ws-internal
regression** that the first run missed: the `coin-fees` scripts imported a
pump-sdk symbol (`isCreatorUsingSharingConfig`) that was **removed in
`@pump-fun/pump-sdk@1.36.0`** — the version our own manifest pins. The skill ran
only because its stale lockfile silently resolved the old `1.32.0`. Fixed by
renaming to the exact-signature successor `hasCoinCreatorMigratedToSharingConfig`
and regenerating the `coin-fees` lock to `1.36.0` so manifest, lock, and scripts
all agree. Details under [coin-fees SDK-symbol fix](#coin-fees-sdk-symbol-fix-202606-11).

Everything else is unchanged from the first run: the only diffs against upstream
are deliberate three.ws customizations (the `3ws…` brand mark, the `reactive/`
skill, the README row, SDK-version bumps, and the plugin-wrapper files), and the
transaction-building logic is byte-identical to upstream.

## Method

Cloned upstream `main` at HEAD (`c8aaa6a8`) and ran a byte-level recursive diff
(`diff -rq`) of each shared skill folder, plus full-content diffs of every file
that differed. Compared SKILL.md, all `scripts/**`, all `scripts/lib/**`, and all
`references/**` — not just SKILL.md. Cross-checked SDK pins against the live npm
registry and **executed every script with `--help` against the installed
`@pump-fun/pump-sdk@1.36.0`** (this is what caught the removed-symbol regression
the first run's `--help` check masked behind a shell pipe).

## Per-skill drift (vs upstream)

| Skill                | Shared files differing from upstream                                                | Verdict                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **create-coin**      | `SKILL.md`, `scripts/build-create-coin-tx.mjs`, `package.json`, `package-lock.json` | All differences are three.ws-deliberate (brand mark + SDK bump) or benign lock noise. Nothing to pull.                         |
| **swap**             | `package.json` only                                                                 | SDK bump (we're ahead). All scripts + SKILL.md byte-identical. Nothing to pull.                                                |
| **coin-fees**        | `package.json`, `package-lock.json`, `SKILL.md`, 5 `scripts/*.mjs`                  | `package.json` = SDK bump (was already ahead). The rest are **our 2026-06-11 SDK-symbol fix** (see below), not upstream drift. |
| **tokenized-agents** | none                                                                                | Fully byte-identical to upstream (SKILL.md, SCENARIOS.md, WALLET_INTEGRATION.md, both `references/**`).                        |

Files present only in our tree (intentional, not upstream regressions):
`reactive/` (our skill), `*/handlers.js`, `*/manifest.json`, `*/tools.json`,
`.claude-plugin/plugin.json` (our plugin-wrapper layer), and
`create-coin/scripts/lib/vanity.mjs` (our brand-mark grinder).

### Critically: the transaction logic still has **zero** upstream drift

Every `scripts/lib/*.mjs` across all four skills — `args`, `coin-api`,
`coin-resolve`, `compute`, `constants`, `env`, `jito`, `tx-build` — is
byte-identical to upstream HEAD. No upstream changes to SDK calls, program IDs,
fee/cashback/mayhem/buyback constants, Jito tip accounts, or instruction-building
have landed since our copy. The `--help` surface of `build-create-coin-tx.mjs`
confirms the full feature set: `--mayhem-mode`, `--cashback`,
`--tokenized-agent`, `--buyback-bps`, `--front-runner-protection` (Jito),
`--alt-address`, RPC priority-fee handling.

## coin-fees SDK-symbol fix (2026-06-11)

**What was wrong.** All five `coin-fees` scripts plus `SKILL.md` imported and
called `isCreatorUsingSharingConfig({ mint, creator })` from
`@pump-fun/pump-sdk`. That export was **removed** somewhere between SDK `1.32.0`
and `1.36.0` and replaced by `hasCoinCreatorMigratedToSharingConfig({ mint, creator })`
— same `{ mint, creator } → boolean` signature, same semantics. Verified directly:

- `@pump-fun/pump-sdk@1.32.0` exports `isCreatorUsingSharingConfig`, **not** the new name.
- `@pump-fun/pump-sdk@1.36.0` (npm `latest`, what we pin) exports
  `hasCoinCreatorMigratedToSharingConfig`, **not** the old name. The two names
  never coexist in any single release.

Our `coin-fees/package.json` pins `^1.36.0`, so a fresh `npm install` resolves
`1.36.0` and every script throws `SyntaxError: … does not provide an export named
'isCreatorUsingSharingConfig'` on import. It worked in practice **only** because
the committed `coin-fees/package-lock.json` was stale and still resolved `1.32.0`
(an `npm ci` artifact); the manifest, lock, and scripts disagreed.

This is **not** upstream drift — upstream still uses the old symbol and pins
`^1.33.0`, so upstream's own `coin-fees` skill is equally broken against current
SDK. It is a three.ws-internal regression: our deliberate SDK bump to `^1.36.0`
(commit `ebbd69f8`) was never wired through the scripts or the lock.

**Fix applied.**

1. Renamed `isCreatorUsingSharingConfig` → `hasCoinCreatorMigratedToSharingConfig`
   in the 5 scripts (`build-collect-fee-tx`, `build-distribute-fees-tx`,
   `build-sharing-config-tx`, `fetch-fee-info`, `fetch-distributable-info`) and in
   `SKILL.md` (import example + decision-flow diagram). The other fee-sharing
   exports the scripts use — `feeSharingConfigPda(mint)` and
   `isSharingConfigEditable({ sharingConfig })` — are unchanged in `1.36.0` and
   were left as-is.
2. Regenerated `coin-fees/package-lock.json` (`npm install --package-lock-only`)
   so it resolves `@pump-fun/pump-sdk@1.36.0` (and `@pump-fun/pump-swap-sdk@1.17.0`,
   satisfying its `^1.16.0`), matching the manifest and the renamed scripts.

**Verified:** all six `coin-fees` scripts now import and exit 0 on `--help`
against `1.36.0`; the renamed files are byte-identical to upstream **modulo the
single symbol rename** (no reflow, no other change). `coin-fees` is the only skill
affected — `create-coin` and `swap` scripts import no removed symbol and run clean
against `1.36.0` unchanged.

> Direction note: we adapted the scripts **forward** to the SDK we actually ship
> (`1.36.0`, also what the root repo and the other skills use) rather than
> downgrading `coin-fees` back to a `1.3x` pin. Downgrading would split SDK
> versions across skills and contradict the standing "don't downgrade below
> upstream" decision below.

## Deliberate three.ws divergences (preserved — do **not** clobber)

1. **`3ws…` brand mark on created mints.** `create-coin/SKILL.md` and
   `create-coin/scripts/build-create-coin-tx.mjs` replace upstream's bare
   `Keypair.generate()` with `grindMarkedMint()` from our local
   `scripts/lib/vanity.mjs`, so a scripted launch carries the same on-chain
   brand provenance as a web-UI launch. The mark string lives in one constant
   (`THREE_WS_MARK = "3ws"`) and mirrors the canonical
   [`src/solana/vanity/brand.js`](../../src/solana/vanity/brand.js). Added by
   commit `14259dff`. The SKILL.md brand section also re-asserts the `$THREE`-only
   rule inline.
2. **`reactive/` skill.** Our addition (PumpPortal feed → avatar gestures). Not in
   upstream. Untouched. (Also: deliberately kept out of `.prettierignore` so it
   stays prettier-enforced — see compliance section.)
3. **README row.** Our README adds one row linking the Reactive Avatar skill;
   otherwise identical to upstream.
4. **Plugin-wrapper files.** `handlers.js` / `manifest.json` / `tools.json` per
   skill and `.claude-plugin/plugin.json` are our skill→plugin adapter layer, not
   upstream files. Note: `handlers.js` calls the hosted pump.fun agent API
   (`fun-block.pump.fun/agents/*`); the local `scripts/*.mjs` are the standalone
   "custom integration" path. The coin-fees regression above only affected the
   script path, not the hosted-API tool path.

## SDK versions: we remain ahead of upstream

`diff` direction below is `upstream → ours`.

| Package                                           | Upstream HEAD | Our `package.json` | npm `latest` (2026-06-11) | Note                                                                                                                                                                                                                                   |
| ------------------------------------------------- | ------------- | ------------------ | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@pump-fun/pump-sdk`                              | `^1.33.0`     | `^1.36.0`          | `1.36.0`                  | We match npm latest; ahead of upstream.                                                                                                                                                                                                |
| `@pump-fun/pump-swap-sdk`                         | `^1.15.0`     | `^1.16.0`          | `1.17.0`                  | Ahead of upstream; manifests one minor behind npm latest (locks resolve `1.17.0`).                                                                                                                                                     |
| `@pump-fun/agent-payments-sdk` (create-coin only) | `^3.0.3`      | `^3.0.3`           | `3.0.3`                   | **Now matches upstream + npm.** Settled by [task 04](04-agent-payments-sdk-reconcile.md): the local workspace fork was renamed `@three-ws/agent-payments`; the skill manifest pins the real published `^3.0.3` for external templates. |

**Decision: keep our pins; do not downgrade to upstream.** Reverting to upstream's
`^1.33.0/^1.15.0` would be a regression, and applying upstream's
`bump-sdk-versions` commit is a no-op since we already exceed it.

### Lockfile state (post-fix)

- **`coin-fees`** — lock **regenerated** to `1.36.0` / `1.17.0` as part of the
  symbol fix above. Manifest, lock, and scripts now agree.
- **`swap`** — lock still byte-identical to upstream (resolves old `1.32.0/1.15.0`)
  while the manifest asks `^1.36.0/^1.16.0`. **Left as-is on purpose:** the swap
  scripts import no removed symbol, so they run correctly against both the old and
  new SDK — there is no correctness driver, and regenerating would only move the
  lock further from upstream. Flagged as harmless drift, not fixed.
- **`create-coin`** — lock differs from upstream only by environment-generated
  noise (optional native deps `bufferutil`/`utf-8-validate`, two dropped
  `"peer": true` flags) and pins the real `agent-payments-sdk@^3.0.3`. Scripts run
  clean against `1.36.0`. Left as-is.

## `$THREE`-only compliance

No other-coin or non-`$THREE` mint references exist in `pump-fun-skills/`, and none
were introduced by the symbol fix (it touches only an SDK function name). A targeted
scan for foreign token names/tickers came back clean. Every base58 string in the
tree is a protocol constant or a synthetic placeholder, all byte-identical to
upstream:

- `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` — USDC mint (real settlement asset
  used by `tokenized-agents`, not a meme/launched coin).
- `So11111111111111111111111111111111111111112` — wrapped-SOL native mint.
- `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` — pump.fun **program** ID.
- `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` — SPL Token-2022 **program** ID.
- Jito tip accounts (`scripts/lib/jito.mjs`) and pump.fun fee/program accounts
  (`scripts/lib/constants.mjs`) — protocol constants (byte-identical to upstream).
- `ABcDeFgHiJkLmNoPqRsTuVwXyZ123456789abcdefg`, `CreatorWalletAddress…`,
  `BondingCurveAddress…` — explicit synthetic placeholders in sample JSON.

The `$THREE` CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump` is the only mint
presented as a coin (in `create-coin/SKILL.md`).

### Prettier / formatting

The vendored mirror has always followed upstream's formatting, which does **not**
satisfy our repo `prettier` config — upstream's own copies of these files fail
`prettier --check` identically. Reformatting them would diverge the mirror from
upstream wholesale. Resolved the same way as the sibling vendored snapshot
`docs/pumpfun-program/`: added the four vendored skill dirs (`create-coin/`,
`swap/`, `coin-fees/`, `tokenized-agents/`) plus `.claude-plugin/plugin.json` to
[`.prettierignore`](../../.prettierignore) under "Vendored / external library
code." This makes `prettier --check` green, documents intent, and guards against a
future `--write` clobbering the upstream-faithful formatting. **Our own
`reactive/` skill is intentionally left out of the ignore list and remains
prettier-clean and enforced.**

## Duplicates elsewhere in the repo

| Location                                                                 | What it is                                                                                                                                                                                                                                       | Action                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `dist/pump-fun-skills/`                                                  | Build output — `cpSync` of `pump-fun-skills/` ([vite.config.js](../../vite.config.js)) and [scripts/build-local-skill-packs.mjs](../../scripts/build-local-skill-packs.mjs). `dist`/`dist-lib`/`dist-artifact` are gitignored (0 tracked files). | **Do not hand-edit.** Regenerates from source on next build.  |
| `examples/skills/pump-fun/`, `public/skills/pump-fun/`, `data/skills/**` | A **different**, three.ws-native skill set (e.g. the read-only `pump-fun` market-intel skill that calls `/api/pump-fun-mcp`). **Not** vendored copies of the upstream create-coin/swap/coin-fees skills.                                         | **Out of scope.** No upstream relationship; no update needed. |

## Actions taken (2026-06-11)

- **Re-verified** upstream is unchanged since 2026-06-08 (still HEAD `c8aaa6a8`,
  no new commits/tags/releases) — nothing to pull.
- **Fixed** the `coin-fees` removed-SDK-symbol regression: renamed the export in 5
  scripts + `SKILL.md`, regenerated `coin-fees/package-lock.json` to `1.36.0`.
- **Added** the four vendored skill dirs + `plugin.json` to `.prettierignore`
  (mirror is now `prettier --check` clean; `reactive/` stays enforced).
- **Corrected** the SDK table for the now-settled `agent-payments-sdk@^3.0.3` pin
  (task 04).
- No upstream content pulled; no `$THREE`-only violation introduced.

## Follow-ups (not in this task)

1. Optionally bump `@pump-fun/pump-swap-sdk` in the `swap` and `create-coin`
   **skill** `package.json` files from `^1.16.0` to `^1.17.0` to match the root
   manifest, and regenerate the `swap` lock in the same pass. Independent of
   upstream (still on `1.15.0`); no correctness driver today.
2. Re-run this drift check when upstream next pushes (dormant since 2026-04-23).
3. If upstream eventually adopts SDK ≥ `1.34` and updates `coin-fees` to the
   `hasCoinCreatorMigratedToSharingConfig` API, our rename will converge with
   theirs — re-diff at that point to confirm.
   </content>
   </invoke>
