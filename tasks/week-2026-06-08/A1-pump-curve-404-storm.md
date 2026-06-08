# A1 — Stop the `/api/pump/curve` 404 + Solana-RPC storm

**Track:** A — production fire · **Priority:** P0 · **Effort:** 2–3h · **Depends on:** none

## Context (evidence)

In the last 24h of production logs (`docs/3dagent-log-export-2026-06-07T03-58-54.json`):

- **1,716 × HTTP 404** on `GET /api/pump/curve` — **1,712 of them for the exact same mint**:
  `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (this is **USDC**, which has no pump.fun bonding
  curve and never will).
- This single endpoint is the platform's **heaviest function** (567 MB / 4096 MB per call).
- Each call fires **3 Solana RPC reads that 429** — `[sdk-bridge] getBondingCurveState/getGraduationProgress/getTokenPrice failed: Account does not exist or has no data` — which together are the bulk of the 1,408 `level:warning` lines in the export.

### Root cause (already investigated — do not re-investigate, verify)

The polling widget `src/widgets/bonding-curve.js` (`poll()` at lines 495–540) **already self-terminates
on a 404** (`stopPolling()` at line 514). So this is **not** one runaway poller. It is **~850 fresh
mounts/day of a bonding-curve widget that is misconfigured with the USDC mint**, each firing ~2
curve calls before stopping. The comment at line 507 even documents the prior incident:
"exactly what turned a misconfigured demo into a 404 storm." The stop-on-404 patch treated the
symptom; the **USDC misconfiguration that re-triggers on every mount still exists**.

## What to do

Two layers. **Layer 1 is the robust, caller-agnostic fix and is mandatory. Layer 2 removes the
trigger.**

### Layer 1 — Server-side short-circuit (mandatory)

In the curve handler — `api/pump/[action].js`, the `handleCurve` function (the branch that serves
`/api/pump/curve`) — return early for any mint that **cannot** have a pump.fun bonding curve,
**before** issuing any Solana RPC call:

- A pump.fun mint address ends in the literal suffix `pump`. Any mint that does **not** end in
  `pump` is not a pump token.
- Additionally short-circuit a small known-non-curve set: USDC
  (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`), wrapped SOL
  (`So11111111111111111111111111111111111111112`), USDC-devnet
  (whatever `SOLANA_USDC_MINT_DEVNET` resolves to in `api/_lib/`), and USDT
  (`Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`).
- For those, respond **without touching RPC**. Return `404` with a clear JSON body
  (e.g. `{ error: 'not_a_pump_mint', message: 'mint has no pump.fun bonding curve' }`) so the
  client's existing stop-on-404 path fires. Keep the response shape consistent with the current
  404 the handler already returns.
- Add a short negative-cache header (e.g. `Cache-Control: public, s-maxage=300`) on this
  short-circuit response so repeated probes from scanners are served from the CDN edge, not the
  function.

This caps the blast radius regardless of which client misconfigures: no 567 MB cold start, no
RPC 429s, no warning spam.

> Do **not** define the non-pump suffix check as the only gate if the codebase already has a
> canonical "is this a pump mint" helper — search `api/_lib/` (e.g. `pump.js`) first and reuse it.
> If none exists, add a tiny `isPumpMint(mint)` helper next to the handler and use it.

### Layer 2 — Fix the USDC-misconfigured mount (remove the trigger)

Find the client that mounts a bonding-curve widget with the USDC mint and correct it.

- The only direct callers of `/api/pump/curve` are `src/widgets/bonding-curve.js` (the poller) and
  `src/communities.js` (one-shot fetch). Start there.
- Trace what `mint` value is passed in. The widget is mounted via `mountBondingCurve(...)` and via
  the generic `<three-ws-widget type="bonding-curve" mint="…">` custom element (registered in
  `src/widgets/kol-trades.js`, dispatched from `src/app.js`). Check `src/widget-types.js` for a
  default mint.
- The correct $THREE mint is `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. If a curve widget is
  meant to show $THREE but is wired to USDC, fix the wiring. If a widget is being mounted for a
  settlement token (USDC) where a bonding curve makes no sense, **don't mount the curve widget
  there at all** — guard the mount with the same non-pump-mint check.

If, after tracing, the USDC mount turns out to come from an external embed you don't control,
Layer 1 still fully resolves the production impact — document that finding in your commit message
and the negative-cache header becomes the durable mitigation.

## Acceptance criteria

- [ ] `GET /api/pump/curve?mint=<USDC>` returns its 404 **without any Solana RPC call** (no
      `[sdk-bridge] … failed` warnings emitted for that request).
- [ ] `GET /api/pump/curve?mint=<a real pump mint ending in "pump">` still returns live curve data
      exactly as before (no regression).
- [ ] The short-circuit response carries a negative-cache header.
- [ ] The USDC-misconfigured mount is located and corrected, **or** documented as external with
      justification.
- [ ] No new console warnings/errors from your changed code.

## Verification

1. Run the unit tests touching the curve widget: `npx vitest run src/widgets/bonding-curve.test.js`.
2. `npm run dev` (port 3000). In the browser, exercise the page(s) that previously mounted the
   curve widget; confirm the Network tab shows **no** `/api/pump/curve?mint=<USDC>` requests, and
   that a real pump token's curve still renders.
3. Hit the endpoint directly for both a USDC mint and a real pump mint; confirm correct status +
   body + that the USDC one is fast (no RPC latency).

## Rules

Obey [CLAUDE.md](../../CLAUDE.md). No mocks, no fake data. Never hardcode or surface a non-$THREE
mint as a *promoted* token — the mint constants here are coin-agnostic settlement plumbing (the
allowed mechanical exception), used only to *exclude* them from curve lookups.

## Completion protocol

1. Re-read your diff (`git diff`) and confirm every line is justified.
2. Delete this file: `tasks/week-2026-06-08/A1-pump-curve-404-storm.md`.
3. Commit your code change **and** this file's deletion together, e.g.:
   `git add -A && git commit -m "fix(pump): short-circuit non-pump mints in /api/pump/curve to kill 404+RPC storm; close A1"`
4. Do **not** push — the human controls pushes.
