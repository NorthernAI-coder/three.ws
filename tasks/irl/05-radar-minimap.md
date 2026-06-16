# Task: IRL — Radar minimap showing nearby pins by direction

## What to build

A compact radar overlay in the corner of the IRL screen that shows nearby GPS-pinned agents as dots with their distance and compass bearing relative to the user. Think Pokémon Go's nearby tracker, but simpler — a circular radar with the user at center, north up, dots representing agents. Visible only in GPS pin mode.

## Where it lives

`pages/irl.html` — a new `<div id="irl-radar">` fixed to the top-right corner, visible only when `gpsModeActive` is true (add/remove a CSS class from body or the element itself).

## Design

```
┌──────────────┐
│   ·          │  ← radar circle, ~120px diameter
│      ●       │  ← user dot (center)
│         ·    │  ← nearby agent dot
│   ·          │
└──────────────┘
```

- Background: `rgba(0,0,0,0.55)` circle with subtle border
- User: white dot at exact center
- Agents: blue dots (`#88bbff`) scaled and positioned by bearing + distance
- Max radar radius = 150m (the `NEARBY_RADIUS`). An agent at 150m sits on the edge.
- Each dot is 8px; on hover shows the agent name in a tooltip
- Compass: faint N/S/E/W text labels at edges (optional, adds polish)

## CSS

```css
#irl-radar {
    position: fixed;
    top: calc(env(safe-area-inset-top, 0px) + 68px); /* below topbar */
    right: 16px;
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background: rgba(0,0,0,0.55);
    border: 1px solid rgba(255,255,255,0.12);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    z-index: 8;
    display: none; /* shown only in GPS mode */
    pointer-events: none;
}
body.gps-mode #irl-radar { display: block; }

.irl-radar-dot {
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #88bbff;
    transform: translate(-50%, -50%);
    pointer-events: auto;
    cursor: pointer;
    box-shadow: 0 0 6px rgba(136,187,255,0.6);
}
.irl-radar-self {
    position: absolute;
    top: 50%; left: 50%;
    width: 10px; height: 10px;
    border-radius: 50%;
    background: #fff;
    transform: translate(-50%, -50%);
    box-shadow: 0 0 8px rgba(255,255,255,0.8);
}
```

## JS changes in `src/irl.js`

Add `updateRadar()` called from `tick()` (only when `gpsModeActive`):

```js
function updateRadar() {
    const radar = document.getElementById('irl-radar');
    if (!radar || !gpsModeActive) return;

    // Remove old dots (keep .irl-radar-self)
    radar.querySelectorAll('.irl-radar-dot').forEach(d => d.remove());

    const R = 60; // radar radius in px (half of 120px container)
    const maxDist = NEARBY_RADIUS; // 150m

    for (const pin of nearbyPins) {
        if (!pin.group) continue;
        // World position relative to user (camera at 0,0,0)
        const wx = pin.group.position.x; // east
        const wz = pin.group.position.z; // south (positive = south)
        const dist = Math.sqrt(wx * wx + wz * wz);
        if (dist > maxDist) continue;

        const frac = Math.min(dist / maxDist, 1);
        const px = R + (wx / maxDist) * R;   // east = right
        const py = R + (-wz / maxDist) * R;  // north = up (wz negative = north)

        const dot = document.createElement('div');
        dot.className = 'irl-radar-dot';
        dot.style.left = `${px}px`;
        dot.style.top  = `${py}px`;
        dot.title = `${pin.avatar_name || 'Agent'} · ${pin.distance_m ?? Math.round(dist)}m`;
        dot.addEventListener('click', () => openPinSheet(pin));
        radar.appendChild(dot);
    }
}
```

Add `body.classList.add('gps-mode')` when `gpsModeActive = true` and remove when false.

Add the self-dot HTML inside `#irl-radar` in the HTML:
```html
<div id="irl-radar" aria-hidden="true">
    <div class="irl-radar-self"></div>
</div>
```

## Integration points

- `tick()` calls `updateRadar()` after `updateLabels()` — only meaningful when `gpsModeActive && gpsState.ready`
- `setLocked(true)` adds `body.classList.add('gps-mode')`
- `setLocked(false)` removes it
- Clicking a radar dot calls `openPinSheet(pin)` — same function used by the floating labels

## Checklist

- [ ] Radar visible only in GPS pin mode (`body.gps-mode`)
- [ ] Self dot at center
- [ ] Agent dots positioned correctly relative to GPS world space (east=right, north=up)
- [ ] Dots capped to radar edge at max distance
- [ ] Clicking a dot opens the interaction sheet for that pin
- [ ] Radar updates each frame (called from `tick()`)
- [ ] No performance regression — `updateRadar()` is O(n) in `nearbyPins.length` (max 50)
- [ ] Works on mobile (touch `click` events fire on tap)
- [ ] No console errors
