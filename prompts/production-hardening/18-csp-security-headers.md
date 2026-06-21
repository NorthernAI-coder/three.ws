# 18 · Global CSP + security headers

> **Phase 3 — Security** · **Depends on:** none · **Parallel-safe:** yes · **Effort:** M

## Mission
Baseline security headers are set (`x-content-type-options`, `x-frame-options: DENY`,
`referrer-policy`), but **Content-Security-Policy appears only on `artifact.js`, not globally**. For
a platform handling wallets and payments, a site-wide CSP (plus the rest of the modern header set)
is table stakes against XSS and clickjacking. Roll out a strict, tested CSP everywhere without
breaking the 3D viewers, wallet adapters, or embeds.

## Context (read first)
- `CLAUDE.md`.
- `api/_lib/http.js` (header helpers; current CORS + base headers ~lines 236–290), `api/artifact.js` (has a CSP line — generalize it), `vercel.json` (static asset headers).
- Third-party surfaces that must keep working: `model-viewer`, Three.js (WASM/workers), Solana/EVM wallet adapters, livekit/colyseus, `@vercel/og`, embed scripts, the chat app.

## Build this
1. **Inventory sources** — enumerate what pages legitimately load (scripts, styles, fonts, images, `connect-src` for RPC/API/facilitator/CDN, `worker-src`/`wasm-unsafe-eval` for Three.js, `frame-src` for embeds).
2. **Author a strict CSP** — default-deny, explicit allowlists, `frame-ancestors` to control embedding (the SDK embeds need framing — scope it, don't blanket-allow). Avoid `unsafe-inline` for scripts; use nonces/hashes for any inline. Set `object-src 'none'`, `base-uri 'self'`.
3. **Apply globally** — both dynamic responses (`api/_lib/http.js` for HTML) and static assets (`vercel.json` headers), with per-surface overrides where embeds need looser `frame-ancestors`.
4. **Round out headers** — `Strict-Transport-Security`, `Permissions-Policy` (lock down camera/mic/geo except where the selfie/AR features need them), `Cross-Origin-Opener-Policy`/`-Resource-Policy` as compatible.
5. **Report-only first** — ship `Content-Security-Policy-Report-Only` with a report sink, verify zero legit breakage across the top pages + viewers + wallet flows, then flip to enforcing. Add a Playwright check that the top pages load with no CSP violations.

## Files likely in play
`api/_lib/http.js`, `vercel.json`, `api/artifact.js` (consolidate), a CSP source-of-truth module, a CSP-violation report endpoint, Playwright check.

## Definition of done
- [ ] Strict CSP enforced site-wide; embeds/viewers/wallet flows verified working.
- [ ] Full modern header set present on HTML + static responses.
- [ ] Report-only soak done; zero legit violations before enforcing.
- [ ] Playwright asserts no CSP violations on the top pages.
- [ ] Changelog: **security** entry.

## Guardrails
Follow CLAUDE.md. Test 3D viewers, wallet connect, and embeds explicitly — these break first under CSP. Don't weaken to `unsafe-inline` to "make it work"; use nonces. Push both remotes.
