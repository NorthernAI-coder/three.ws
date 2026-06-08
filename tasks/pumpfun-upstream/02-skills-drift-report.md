# Drift report: `pump-fun-skills/` vs official upstream

**Date:** 2026-06-08
**Task:** [02-pump-fun-skills-upstream-sync.md](02-pump-fun-skills-upstream-sync.md)
**Upstream:** `github.com/pump-fun/pump-fun-skills` — branch `main`,
HEAD `c8aaa6a8` (`Merge pull request #9 from pump-fun/bump-sdk-versions`,
committed 2026-04-23, `pushed_at` 2026-04-23). No tags, no releases, no commits
after that date.

## TL;DR

**Our vendored copy is at or ahead of upstream HEAD on every shared file. There
is nothing actionable to pull from upstream, so no skill content was changed.**

The only differences between our tree and upstream are deliberate three.ws
customizations (the `3ws…` brand mark, the `reactive/` skill, the README row for
it, SDK-version bumps, and the plugin-wrapper files). Upstream's most recent work
— the `bump-sdk-versions` commit that motivated this drift check — landed
versions _older_ than the ones we already pin, and every transaction-building
script and reference doc is byte-identical to ours.

One pre-existing internal inconsistency surfaced (the per-skill
`package-lock.json` files are stale relative to their bumped `package.json`).
It is interlinked with the `agent-payments-sdk@3.1.0` situation already owned by
[task 04](04-agent-payments-sdk-reconcile.md); recommendation below, not fixed
here.

## Method

Cloned upstream `main` at HEAD and ran a byte-level recursive diff
(`diff -rq`) of each shared skill folder, plus full-content diffs of every file
that differed. Compared SKILL.md, all `scripts/**`, all `scripts/lib/**`, and all
`references/**` — not just SKILL.md. Cross-checked SDK pins against the live npm
registry (`npm view <pkg> versions`).

## Per-skill drift

| Skill                | Shared files differing from upstream                                                | Verdict                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **create-coin**      | `SKILL.md`, `scripts/build-create-coin-tx.mjs`, `package.json`, `package-lock.json` | All differences are three.ws-deliberate (brand mark + SDK bump) or benign lock noise. Nothing to pull.  |
| **swap**             | `package.json` only                                                                 | SDK bump (we're ahead). All scripts + SKILL.md byte-identical. Nothing to pull.                         |
| **coin-fees**        | `package.json` only                                                                 | SDK bump (we're ahead). All scripts + SKILL.md byte-identical. Nothing to pull.                         |
| **tokenized-agents** | none                                                                                | Fully byte-identical to upstream (SKILL.md, SCENARIOS.md, WALLET_INTEGRATION.md, both `references/**`). |

Files present only in our tree (intentional, not upstream regressions):
`reactive/` (our skill), `*/handlers.js`, `*/manifest.json`, `*/tools.json`,
`.claude-plugin/plugin.json` (our plugin-wrapper layer), and
`create-coin/scripts/lib/vanity.mjs` (our brand-mark grinder).

### Critically: the transaction logic has **zero** drift

Every `scripts/lib/*.mjs` across all four skills — `args`, `coin-api`,
`coin-resolve`, `compute`, `constants`, `env`, `jito`, `tx-build` — is
byte-identical to upstream HEAD. That means **no upstream changes to SDK calls,
program IDs, fee/cashback/mayhem/buyback constants, Jito tip accounts, or
instruction-building** have landed since our copy. The `--help` surface of
`build-create-coin-tx.mjs` confirms the full current feature set is present:
`--mayhem-mode`, `--cashback`, `--tokenized-agent`, `--buyback-bps`,
`--front-runner-protection` (Jito), `--alt-address`, RPC priority-fee handling.

## Deliberate three.ws divergences (preserved — do **not** clobber)

1. **`3ws…` brand mark on created mints.** `create-coin/SKILL.md` and
   `create-coin/scripts/build-create-coin-tx.mjs` replace upstream's bare
   `Keypair.generate()` with `grindMarkedMint()` from our local
   `scripts/lib/vanity.mjs`, so a scripted launch carries the same on-chain
   brand provenance as a web-UI launch. The mark string lives in one constant
   (`THREE_WS_MARK = "3ws"`) and mirrors the canonical
   [`src/solana/vanity/brand.js`](../../src/solana/vanity/brand.js)
   (verified: both define `THREE_WS_MARK = '3ws'` and matching `hasThreeWsMark`).
   Added by commit `14259dff`. The SKILL.md brand section also re-asserts the
   `$THREE`-only rule inline.
2. **`reactive/` skill.** Our addition (PumpPortal feed → avatar gestures). Not
   in upstream. Untouched.
3. **README row.** Our README adds one row linking the Reactive Avatar skill;
   otherwise identical to upstream.
4. **Plugin-wrapper files.** `handlers.js` / `manifest.json` / `tools.json` per
   skill and `.claude-plugin/plugin.json` are our skill→plugin adapter layer,
   not upstream files.

## SDK versions: we are ahead of upstream

`diff` direction below is `upstream → ours`.

| Package                                           | Upstream HEAD | Our `package.json` | npm `latest` (2026-06-08) | Note                                                                                                                                          |
| ------------------------------------------------- | ------------- | ------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `@pump-fun/pump-sdk`                              | `^1.33.0`     | `^1.36.0`          | `1.36.0`                  | We match npm latest; ahead of upstream.                                                                                                       |
| `@pump-fun/pump-swap-sdk`                         | `^1.15.0`     | `^1.16.0`          | `1.17.0`                  | Ahead of upstream; one minor behind npm latest.                                                                                               |
| `@pump-fun/agent-payments-sdk` (create-coin only) | `^3.0.3`      | `^3.1.0`           | `3.0.3`                   | `3.1.0` is **not on npm**; resolves via the local workspace at `agent-payments-sdk/`. Owned by [task 04](04-agent-payments-sdk-reconcile.md). |

**Decision: keep our pins; do not downgrade to upstream.** These were bumped on
purpose (commit `ebbd69f8`); reverting to upstream's `^1.33.0/^1.15.0/^3.0.3`
would be a regression, and applying upstream's `bump-sdk-versions` commit is a
no-op since we already exceed it.

### Pre-existing inconsistency (flagged, not fixed here)

The three per-skill `package-lock.json` files are **stale** relative to their
bumped `package.json`:

- `swap` and `coin-fees` locks are byte-identical to upstream and still resolve
  the old `1.33.0/1.15.0`, even though their `package.json` asks for
  `^1.36.0/^1.16.0`.
- `create-coin`'s lock differs from upstream only by environment-generated noise
  (optional native deps `bufferutil@4.1.0` and `utf-8-validate@6.0.6` added; two
  `"peer": true` flags dropped) and still pins `agent-payments-sdk@^3.0.3`, not
  our `^3.1.0`.

**Why not fixed in this task:**

- Regenerating these locks moves us _further_ from upstream — the opposite of a
  sync task's intent — and is not an "upstream improvement" to apply.
- A standalone `npm install` in `create-coin/` would **fail**: `agent-payments-sdk@^3.1.0`
  is unpublished and only resolves inside the repo workspace. That is exactly the
  gotcha [task 04](04-agent-payments-sdk-reconcile.md) exists to resolve.
- Nothing is broken today — scripts resolve and run (`--help` exits 0); the
  feature set is fully present.

**Recommendation:** fold a single coordinated `npm install` across all four skill
packages into task 04, once the `agent-payments-sdk` pin (workspace fork vs
published `3.0.3`) is settled, so all locks regenerate consistently and in sync
with the manifests.

## `$THREE`-only compliance

No other-coin or non-`$THREE` mint references exist in `pump-fun-skills/`, and
none were introduced (no upstream content was pulled). Every base58 string in the
tree is a protocol constant or a synthetic placeholder, all byte-identical to
upstream:

- `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` — USDC mint (real settlement
  asset used by `tokenized-agents`, not a meme/launched coin).
- `So11111111111111111111111111111111111111112` — wrapped-SOL native mint.
- `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` — pump.fun **program** ID.
- `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` — SPL Token-2022 **program** ID.
- Jito tip accounts (`scripts/lib/jito.mjs`) and pump.fun fee/program accounts
  (`scripts/lib/constants.mjs`) — protocol constants.
- `ABcDeFgHiJkLmNoPqRsTuVwXyZ123456789abcdefg`, `CreatorWalletAddress…`,
  `BondingCurveAddress…` — explicit synthetic placeholders in sample JSON.

The `$THREE` CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump` is the only mint
presented as a coin (in `create-coin/SKILL.md`).

## Duplicates elsewhere in the repo

| Location                                                                 | What it is                                                                                                                                                                                                                                                  | Action                                                        |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `dist/pump-fun-skills/`                                                  | Build output — `cpSync` of `pump-fun-skills/` ([vite.config.js:1153](../../vite.config.js#L1153)) and [scripts/build-local-skill-packs.mjs](../../scripts/build-local-skill-packs.mjs). `dist`/`dist-lib`/`dist-artifact` are gitignored (0 tracked files). | **Do not hand-edit.** Regenerates from source on next build.  |
| `examples/skills/pump-fun/`, `public/skills/pump-fun/`, `data/skills/**` | A **different**, three.ws-native skill set (e.g. the read-only `pump-fun` market-intel skill that calls `/api/pump-fun-mcp`). **Not** vendored copies of the upstream create-coin/swap/coin-fees skills.                                                    | **Out of scope.** No upstream relationship; no update needed. |

## Actions taken

- **Skill content / scripts:** none changed — no actionable upstream drift.
- **`package.json` / `package-lock.json`:** unchanged — we are ahead of upstream;
  lock reconcile deferred to task 04 (see above).
- **Report:** this file committed.

## Follow-ups (not in this task)

1. [Task 04](04-agent-payments-sdk-reconcile.md): settle the
   `agent-payments-sdk@3.1.0` local-workspace fork, then regenerate all four
   skill `package-lock.json` files in one pass so manifests and locks agree.
2. Optionally bump `@pump-fun/pump-swap-sdk` in the **skill** `package.json`
   files to `^1.17.0` during that same dependency pass — the root `package.json`
   was already moved to `^1.17.0` in the recon session, but the four skill
   packages still lag at `^1.16.0`. Independent of upstream, which is still on
   `1.15.0`.
3. Re-run this drift check when upstream next pushes (currently dormant since
   2026-04-23).
