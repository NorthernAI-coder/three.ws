# B02 — Token migration rules (shared)

Goal: every `--(mk|pd|t|sdk|ibm|gx|ho|saas)-*` token disappears from `public/ pages/ src/`.
The B01 canonical tokens in `public/style.css :root` become the only design language.

## Canonical vocabulary (migration targets)

| Concept            | Canonical token(s)                                  |
|--------------------|-----------------------------------------------------|
| Pure black page bg | inline `#000` (no token)                            |
| Elevated surfaces  | `--surface-1`, `--surface-2`, `--surface-3`, `--surface-glass` |
| Borders            | `--stroke`, `--stroke-strong`                       |
| Text               | `--ink` (primary), `--ink-dim` (muted/faint)        |
| Bright/white text  | `--accent`                                           |
| Accent             | `--accent`, `--accent-soft`                          |
| Semantics          | `--success`, `--danger`, `--warn`                    |
| Radius             | `--radius-card`, `--radius-control`, `--radius-pill` |
| Spacing            | `--space-xs/sm/md/lg/xl/2xl`                          |
| Type               | `--text-xs..2xl`, `--font-display/body/mono`, `--header-h` |

## The core rule (covers ~90% of tokens)

Each namespace token is already defined as `--xx-foo: var(--CANONICAL, <fallback>)`.
Because the canonical var is always defined, the token already resolves to the canonical
value — the fallback literal is dead. Therefore:

> Replace every **usage** `var(--xx-foo)` with `var(--CANONICAL)` (the first arg of its
> definition), then **delete** the `--xx-foo` definition. Visual output is byte-identical.

Example: `--mk-panel: var(--surface-1, #0a0a0a)` ⇒ replace `var(--mk-panel)` → `var(--surface-1)`.

## Literal-only tokens (no canonical inner var) — preserve the value

- Pure black bg/ink (`--mk-bg:#000`, `--pd-bg:#000`, `--t-bg-0:#000`, `--t-accent-ink:#000`,
  `--ho-ink:#000`, `--saas-bg:#000`): inline `#000` at use sites.
- Semantic soft/border rgba tints (e.g. `--pd-warn-soft: rgba(251,191,36,0.14)`,
  `--pd-success-border`, `--ibm-shadow`, `--gx-shadow`, `--card`-like shadows): inline the
  literal rgba/shadow at the use sites (few uses each).
- Sizing (`--pd-sidebar-w:232px`, `--sdk-max:1120px`, `--saas-w-max`, `--saas-radius-lg:22px`,
  `--saas-pad-x`, `--ibm-font`, `--ibm-ease`, `--ibm-dur*`): inline the literal at use sites.
- SDK monochrome grays (`--sdk-accent:#a0a0a0`, `--sdk-cyan:#c3c3c3`, etc.): map text→`--ink`,
  muted/gray→`--ink-dim`, white→`--accent`; for off-grays with no clean canonical, inline the hex.

## Intentional aesthetic difference — IBM Carbon brand blue (theme layer)

`--ibm-blue*`, `--ibm-stroke`, `--gx-ibm*` are a real brand accent, NOT monochrome. Keep them,
but express as a documented **theme layer** named outside the banned prefixes. Use `--brand-*`:

```
:root {
  /* IBM Carbon brand accent — theme layer over the canonical monochrome system.
     Scoped visual identity for /ibm/* surfaces; everything else stays monochrome. */
  --brand-blue:        #0f62fe;
  --brand-blue-2:      #4589ff;
  --brand-blue-light:  #78a9ff;
  --brand-blue-dim:    rgba(15, 98, 254, 0.12);
  --brand-blue-glow:   rgba(15, 98, 254, 0.22);
  --brand-blue-stroke: rgba(120, 169, 255, 0.22);
}
```

Map `--ibm-blue`→`--brand-blue`, `--ibm-blue-2`→`--brand-blue-2`, `--ibm-blue-light`/`--ibm-blue-3`/`--ibm-light`→`--brand-blue-light`,
`--ibm-blue-dim`→`--brand-blue-dim`, `--ibm-blue-glow`→`--brand-blue-glow`, `--ibm-stroke`→`--brand-blue-stroke`,
`--gx-ibm`→`--brand-blue`, `--gx-ibm-light`→`--brand-blue-light`. All monochrome `--ibm-*`/`--gx-*` follow the core rule.

## Dead files (delete, don't migrate)

`public/home-overhaul.css` (`--ho-*`) and `public/home-saas.css` (`--saas-*`) are linked by no
HTML page — delete the files and scrub any comment references in `public/mobile.css`.

## Done check (per system)
`grep -rEn "\-\-xx-" <your files>` returns nothing; values unchanged.
