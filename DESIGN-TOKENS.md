# three.ws — Design Tokens (B01)

One vocabulary for the whole platform. Every colour, surface, spacing, type,
radius, shadow, blur, and motion value comes from **`public/tokens.css`** — the
single source of truth. Reference tokens by name; never hardcode a value a token
already expresses.

> The eight legacy per-surface namespaces (`--mk-*`, `--pd-*`, `--ibm-*`,
> `--gx-*`, `--ho-*`, `--saas-*`, `--sdk-*`, `--t-*`) were removed in B02. Do not
> reintroduce a parallel palette.

## Where it lives & how it loads

- **`public/tokens.css`** — canonical primitives (this is what you edit to change
  a global value).
- **`public/style.css`** `@import`s it first, then layers *component* tokens on
  top (buttons, cards, badges, skeleton — all referencing primitives via `var()`).
- **`public/nav.css`** also `@import`s it, so pages that inject the shared nav but
  don't load the full `style.css` (embed / standalone surfaces) still resolve the
  vocabulary.

A page is covered if it links **`/style.css`** *or* injects the shared nav
(`/nav.css`). New pages should do one of those — never redefine tokens locally.

## The naming convention

Tokens use **flat, semantic, unprefixed names** (`--surface-1`, `--ink`,
`--space-md`). That set is already adopted across the site, so it is the
canonical prefix — there is no `--ds-`/`--nxt-` rename. `--nxt-*` (app shell)
and `--nv-*` (nav) are thin alias layers that resolve *to* these tokens via
`var(--surface-1, …)`; keep them as aliases, don't fork them.

## Vocabulary

### Colour — ink (text)
| Token | Use |
|-------|-----|
| `--ink-bright` | pure-white headings, primary CTA labels |
| `--ink` | default body text |
| `--ink-dim` | secondary / muted text |
| `--ink-faint` | tertiary hints, disabled, watermark labels |

### Colour — surfaces, strokes, accent, backgrounds
| Token | Use |
|-------|-----|
| `--bg-0` / `--bg-1` | opaque page background / raised solid panel |
| `--surface-1/2/3` | translucent glass fills (low → high) |
| `--surface-glass` | gradient glass for cards/docks |
| `--stroke` / `--stroke-strong` | hairline border / emphasized border |
| `--accent` / `--accent-soft` | accent (white) / 10% accent wash |

### Colour — state
`--success` `#4ade80` · `--danger` `#f87171` · `--warn` `#fbbf24`. Tinted
variants (e.g. badge/button danger fills) are derived in the component layer of
`style.css` — reuse those, don't re-derive.

### Spacing (φ = 1.618 scale)
`--space-3xs` `--space-2xs` `--space-xs` `--space-sm` `--space-md` (16px base)
`--space-lg` `--space-xl` `--space-2xl`. Use for padding, gap, margin.

### Typography
- **Sizes:** `--text-2xs` (11px) `--text-xs` `--text-sm` `--text-md` (13px, the
  common UI size) `--text-ui` (14px) `--text-base` (16px) `--text-lg` `--text-xl`
  `--text-2xl` `--text-3xl`.
- **Families:** `--font-display` (Space Grotesk) · `--font-body` (Inter) ·
  `--font-mono` (JetBrains Mono).
- **Weights:** `--weight-regular|medium|semibold|bold`.
- **Line height:** `--leading-tight|normal|loose`.

### Radius (4-token scale)
`--radius-sm` (6px, chips/inputs) · `--radius-md` (10px, controls) ·
`--radius-lg` (14px, cards/modals) · `--radius-pill` (999px). Legacy aliases
`--radius-control`→md, `--radius-card`→lg remain for existing consumers.

### Elevation / shadow
`--shadow-1` (resting panel) · `--shadow-2` (card) · `--shadow-3` (lifted/hover/
modal). Utility classes `.elev-1/2/3` apply them.

### Blur (backdrop glass)
`--blur-sm` (8px) · `--blur-md` (16px) · `--blur-lg` (28px). Pair with a
`--surface-*` fill: `backdrop-filter: blur(var(--blur-md));`.

### Motion
- **Durations:** `--duration-instant` (80ms) · `--duration-fast` (140ms,
  controls) · `--duration-base` (220ms, panels) · `--duration-slow` (420ms,
  reveals).
- **Easings:** `--ease-standard` (default UI) · `--ease-emphasized` (expressive
  enter) · `--ease-out` (decelerate-only).
- Durations collapse to `0ms` under `prefers-reduced-motion: reduce` (handled in
  `tokens.css`).

```css
transition: transform var(--duration-fast) var(--ease-standard),
            opacity   var(--duration-fast) var(--ease-standard);
```

### Layout
`--header-h` (3.5rem) · `--phi` (1.618).

### Semantic alias layer (B12)
Thin, intention-named synonyms that resolve *to* the primitives above (same
sanctioned pattern as `--nxt-*` / `--nv-*` — they alias, never fork). Reach for
these when an intention name reads clearer than the primitive:

- **Colour:** `--color-bg`→`--bg-0` · `--color-surface`→`--surface-1` ·
  `--color-text`→`--ink` · `--color-text-bright`→`--ink-bright` ·
  `--color-text-dim`→`--ink-dim` · `--color-text-faint`→`--ink-faint` ·
  `--color-accent`→`--accent` · `--color-border`/`--color-hairline`→`--stroke` ·
  `--color-danger`→`--danger` · `--color-success`→`--success` ·
  `--color-warning`→`--warn`. Because they point at the remapped primitives they
  flip automatically under `[data-theme='light']`.
- **Spacing (4px UI grid):** `--space-1`…`--space-8` (4/8/12/16/20/24/28/32px).
  Complements — does not replace — the φ display scale (`--space-sm/md/lg…`).
  Use the φ rungs for marketing rhythm; use the 4px ramp for product chrome
  (nav/cards/forms) where dense layouts sit on a 4px grid.
- **Radius:** `--radius-full`→`--radius-pill`.
- **Motion:** `--dur-fast`→`--duration-fast` · `--dur-med`→`--duration-base`.

## The rule: no hardcoded values

Before typing a literal, check for a token:

| ❌ Don't | ✅ Do |
|---------|------|
| `color: #888` | `color: var(--ink-dim)` |
| `background: #0a0a0a` | `background: var(--bg-0)` |
| `border: 1px solid rgba(255,255,255,.08)` | `border: 1px solid var(--stroke)` |
| `padding: 16px` | `padding: var(--space-md)` |
| `font-size: 13px` | `font-size: var(--text-md)` |
| `border-radius: 14px` | `border-radius: var(--radius-lg)` |
| `box-shadow: 0 8px 32px rgba(0,0,0,.5)` | `box-shadow: var(--shadow-3)` |
| `backdrop-filter: blur(16px)` | `backdrop-filter: blur(var(--blur-md))` |
| `transition: .2s ease` | `transition: var(--duration-base) var(--ease-standard)` |

Need a value no token expresses? Add the token to `public/tokens.css` (with a
comment), then reference it — don't inline a one-off. Migrating existing
hardcoded values to tokens is tracked under **B08**.

## Brand themes

A surface needing a distinct brand accent (e.g. IBM Carbon blue at `/ibm/*`)
remaps tokens in a small scoped theme layer — it never ships a standalone
palette:

```css
.ibm-surface { --accent: #0f62fe; --accent-soft: rgba(15,98,254,.12); }
```
