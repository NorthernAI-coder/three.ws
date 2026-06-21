# Production Issues — three.ws / 3D-Agent — Archive 2026-06

Resolved items moved here from [ISSUES.md](../../ISSUES.md). Newest first.

---

## 1. `character-studio/` — pre-existing lint debt (added 2026-06-11, RESOLVED 2026-06-21)

**Context:** The eslint 8→10 upgrade migrated character-studio to flat config
(`character-studio/eslint.config.mjs`), surfacing pre-existing findings across the
vendored CharacterStudio fork that all predated the upgrade.

**Runtime `no-undef` bugs — FIXED 2026-06-18** (full table in
[AUDIT-2026-06-18.md](AUDIT-2026-06-18.md)): twelve references that threw
`ReferenceError` the moment their code path ran were corrected and verified by a
clean `no-undef`-only sweep.

**Cosmetic burndown — RESOLVED 2026-06-21.** Every remaining finding in
`character-studio/src` was cleared, file by file, with minimal behaviour-preserving
edits. The full tree (`eslint character-studio/src`) now reports **0 problems**.

Findings cleared (178 total across 48 files):

| rule | count | how it was fixed |
|---|---|---|
| `no-unused-vars` | 119 | dead imports/locals removed; side-effecting calls kept as statements; unused trailing params dropped; positional destructure holes (`[, x]`); unused catch bindings → optional `catch {}` |
| `no-async-promise-executor` | 17 | executors with no `await` → dropped the gratuitous `async`; executors using `await` → inner `(async () => { … })().catch(reject)` IIFE so thrown errors reject the promise instead of going unhandled |
| `no-useless-escape` | 10 | stray `\` before whitespace in GLSL template literals (`particle/shader.js`) removed — string contents unchanged |
| `no-useless-assignment` | 10 | dead initializers/assignments removed (RHS kept only when side-effecting) |
| `no-unreachable` | 9 | dead code after early `return`/`throw` deleted (the early exit — the intended behaviour — was kept) |
| `no-prototype-builtins` | 4 | `obj.hasOwnProperty(k)` → `Object.prototype.hasOwnProperty.call(obj, k)` |
| `no-empty` | 4 | `/* noop */` comments added; no control-flow change |
| `no-constant-binary-expression` | 2 | `maxTextureSize: 1024 \|\| Infinity` → `1024` (the `\|\| Infinity` was always dead) |
| `no-dupe-class-members` | 1 | duplicate `unlockManifestByIndex` removed (kept the later, winning definition) |
| `preserve-caught-error` | 1 | re-thrown error now carries `{ cause }` |
| unused eslint-disable directive | 1 | removed (`lipsync.js`) |

**Latent bugs surfaced while clearing dead code (noted, not "fixed" — behaviour
was preserved to keep this a lint-only pass):**

- `download-utils.js` `getRebindedVRMExpressionManager` — the entire blendshape
  re-bind implementation sat behind an early `return oldExpressionManager;`, so it
  has been dead in this fork. The unreachable body was removed; the feature remains
  effectively disabled (unchanged from before).
- `addLookAtMouse(…, enable = true)` (`characterManager.js`) — the `enable`
  parameter was never read (`lookAtManager.enabled = true` is hardcoded); the unused
  param was dropped.
- `ktxtools.js:47` — `uastcRDODictSize` ternary copies `userBasisuOptions.uastcRDOQualityScalar`
  in its truthy branch (looks like a copy-paste error); left as-is, outside lint scope.
- `textureImageDataRenderer.js` `render()` — the empty-textures branch assigned the
  solid-colour fallback to the `texture` param, which is never read afterward (only
  `textures` is), so the fallback was discarded; the dead assignment was removed and
  current behaviour preserved.

These are tracked here for a future correctness pass; none are regressions from this
work.
