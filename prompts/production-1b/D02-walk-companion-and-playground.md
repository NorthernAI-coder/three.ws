# D02 — Walk companion + playground + leaderboard + embed production pass

> Phase D · Depends on: D01 · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
The walk companion is a viral embed — a 3D avatar that strolls across any website, with a
global distance leaderboard and a full playground. It's top-of-funnel reach: every embed is
a billboard. Make it rock-solid, reconnect reliably, and look great on any host and device.

## Where this lives (real files)
- `src/walk.js` (~5k lines), `src/walk-playground.js`, `src/walk-embed-preview.js`, `src/walk-leaderboard.js`, `src/walk-net.js` (networking).
- `walk-sdk/` → `@three-ws/walk`; `/walk`, `/temporary`, `/walk-leaderboard` routes.

## Current state & gaps
- AR passthrough camera-permission denial not clearly handled; `walk-net.js` reconnects only once then stalls; leaderboard sort/pagination state not URL-encoded; mobile joystick sizing not responsive; embed iframe can fail silently if a host blocks third-party frames; Chrome-extension install/permissions undocumented.

## Build this
1. **Resilient networking:** reconnect with exponential backoff (not single-attempt); clear "live/reconnecting/offline" status; no stuck state.
2. **AR + controls:** camera-permission denial → designed fallback (non-AR mode); responsive joystick sized to viewport/orientation; touch + keyboard parity.
3. **Embed robustness:** detect blocked-iframe/CORS and show a fallback message + link; document required embed headers; verify on a real third-party page.
4. **Leaderboard:** URL-encode sort/pagination; document the distance/time scoring; basic cheat detection (teleport); freshness + all states.
5. **Cross-surface avatar:** uses the same pipeline as D01 (no T-pose); diverse avatar picker works.
6. **Perf + a11y + mobile:** steady frame rate, `prefers-reduced-motion`, keyboard, 320px.

## Out of scope
- The avatar pipeline internals (**D01**).

## Definition of done
- [ ] Reconnect is resilient with clear status; AR denial + blocked-embed have designed fallbacks.
- [ ] Leaderboard state in URL with documented scoring + cheat guard; joystick responsive.
- [ ] Embed verified on an external site; `@three-ws/walk` builds; mobile + a11y verified.
- [ ] `npx vitest run` green; changelog entry; committed + pushed to both remotes.

## Verify
- Embed on a scratch site (and one that blocks frames → fallback); kill the network mid-walk → reconnects; deny camera → non-AR fallback; play on a phone.
