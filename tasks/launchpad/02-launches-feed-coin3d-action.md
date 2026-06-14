# 02 — /launches feed: add "View in 3D" action to every coin card

## Problem

Every launch card in [src/launches.js](../../src/launches.js) (`launchCard` function, lines ~398–470) has two action buttons:

1. `pump.fun ↗` — external link to the pump.fun trading page
2. `3D world` — links to `/communities/<mint>` (the social multiplayer world)

There is no link to `/coin3d?mint=<mint>` — the platform's own 3D token visualization page. `/coin3d` renders a spinning coin medallion with the token's logo, a top-holder galaxy sized by balance, and a graduation ring tracking bonding-curve progress. It is one of the most visually compelling pages on the platform and it is invisible from the primary launch discovery surface.

These are three distinct experiences:
- `/coin3d?mint=X` — data-driven 3D token snapshot (what this task adds)
- `/communities/<mint>` — social world for the coin's community
- `pump.fun/<mint>` — external trading

## Target files

- [src/launches.js](../../src/launches.js) — `launchCard` function, `actions` array construction
- [src/launches.css](../../src/launches.css) — `.lx-action` styling

## Outcome

Each mainnet launch card gains a third action button:

```
[ pump.fun ↗ ]  [ 3D view ]  [ 3D world ]
```

"3D view" is the new button:
- `href: /coin3d?mint=<mint>`
- `text: '3D view'`
- `aria-label: \`View ${launch.symbol || launch.name} in 3D\``
- Same `lx-action` class as the existing buttons
- Opens in a new tab (`target="_blank"`)
- Only rendered for mainnet launches (`!isDevnet`)

On devnet, keep only "Explorer ↗" (no coin3d or pump.fun links since the mint doesn't exist on mainnet).

## Implementation notes

In `launchCard` (src/launches.js), the `actions` array is built just before the card element is assembled. Currently:

```js
const actions = [
  el('a', { class: 'lx-action', href: tradeHref, target: '_blank', … }),
];
if (!isDevnet) {
  actions.push(el('a', { class: 'lx-action', href: `/communities/${launch.mint}`, … }));
}
```

Change to:

```js
const actions = [
  el('a', { class: 'lx-action', href: tradeHref, target: '_blank', … }),
];
if (!isDevnet) {
  actions.push(
    el('a', {
      class: 'lx-action',
      href: `/coin3d?mint=${encodeURIComponent(launch.mint)}`,
      target: '_blank',
      rel: 'noopener noreferrer',
      text: '3D view',
      'aria-label': `View ${launch.symbol || launch.name || 'coin'} in 3D`,
    }),
  );
  actions.push(el('a', { class: 'lx-action', href: `/communities/${launch.mint}`, … }));
}
```

Order: pump.fun ↗ | 3D view | 3D world — left to right from external to platform surfaces.

Check if `.lx-action` styling wraps cleanly at three items on a card; if not, add `flex-wrap: wrap` to the `.lx-actions` container in `launches.css`.

## Definition of done

- Start `npm run dev`, visit `/launches`.
- Every mainnet card shows three action buttons: "pump.fun ↗", "3D view", "3D world".
- "3D view" opens `/coin3d?mint=<correct mint>` in a new tab.
- On devnet cards, only "Explorer ↗" appears.
- Cards display without overflow or layout shift at 320px, 768px, and 1440px viewport widths.
- No console errors.
- `npm test` green.
- Completionist subagent run on changed files.
