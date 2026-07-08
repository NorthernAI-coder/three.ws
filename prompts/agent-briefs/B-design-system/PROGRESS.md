# B-design-system — migration status

Tracks the per-namespace rollout described in [B02-migration-rules.md](B02-migration-rules.md):
every `--(mk|pd|t|sdk|ibm|gx|ho|saas)-*` token collapses onto the canonical `public/style.css` /
`public/tokens.css` vocabulary (B01).

| Namespace | Surface(s) | Status | Notes |
|---|---|---|---|
| `--mk-*` | marketplace pages | done | core rule (var → canonical var) |
| `--pd-*` | product/dashboard pages | done | core rule + inlined rgba soft/border tints |
| `--t-*` | talk/theater surfaces | done | core rule; `#000` bg/ink inlined |
| `--sdk-*` | SDK docs pages | done | core rule; monochrome grays mapped to `--ink`/`--ink-dim`; `--sdk-max` inlined |
| `--ibm-*` | `/ibm/*` (IBM Carbon demo) | done | brand exception — kept as a thin alias layer in `public/ibm.css` remapped onto `--brand-blue*` (real accent color, not monochrome); legacy pages still reference `var(--ibm-*)` by design |
| `--ho-*` | `public/home-overhaul.css` | done | file was dead (linked by no page) — deleted, not migrated |
| `--saas-*` | `public/home-saas.css` | done | file was dead (linked by no page) — deleted, not migrated |
| `--gx-*` | `src/genesis.css` (`pages/genesis.html`) | done (2026-07-08) | core rule for gap/radius/surface; `--gx-border`/`--gx-border-strong` (literal shorthand) → `1px solid var(--stroke)` / `1px solid var(--stroke-strong)`; `--gx-max: 1080px` inlined (no canonical max-width token); `--gx-gold` was **not** a new brand exception — it already wrapped the canonical `--gold-rgb` channel (B08, same one `public/features.css`/`public/style.css` use), so usages became `rgb(var(--gold-rgb))` directly, no `--brand-gold` layer needed. File stayed (854→844 lines, real component CSS, not a dead token shell). |

## Done check

```
grep -rEn -- "--(mk|pd|t|sdk|gx|ho|saas)-" public/ pages/ src/
```
Returns nothing (excluding built/vendored bundles, e.g. `public/chat/assets/*.js`).
`--ibm-*` is excluded from this grep by design — see the brand-exception note above.
