# IBM × three.ws — x402 Live Demo: Production-Readiness Plan

Goal: take the single-file x402 demo at [`pages/ibm/x402-demo.html`](../../pages/ibm/x402-demo.html)
from "built and data-layer-verified" to **100% production-ready, zero-error, best-in-class
UX** — hostable on `live.ibm.com` as the public face of the IBM × three.ws partnership.

This is the index. Each `NN-*.md` below is a self-contained brief an agent can execute from
a fresh session at repo root. CLAUDE.md auto-loads in every session, so each assumes those
rules (no mocks, real APIs, every state designed, push to both remotes).

## The deliverable

One self-contained HTML file (inline CSS + JS, no build step) that:

- loads the drop-in widget from `https://three.ws/x402.js`,
- shows the live `402` challenge for a real paid endpoint,
- lets a visitor pay **$0.001 USDC** from their own wallet (MetaMask → Base, Phantom →
  Solana) to call a real three.ws data API, and
- renders the result + on-chain receipt.

It will be copied onto `live.ibm.com`, and (task 09) also served at
`https://three.ws/pages/ibm/x402-demo.html` as a preview.

## Verified ground truth (2026-06-17 — do not re-derive)

- Widget `https://three.ws/x402.js` → **200**, served as an ES module. Public API:
  `window.X402.pay({ endpoint, method, body, merchant, action, caps }) → { ok, result, payment, response }`
  (the returned promise rejects with `err.code === 'cancelled'` when the user closes the
  modal). It also auto-binds any element carrying `data-x402-endpoint` and dispatches
  `x402:result` / `x402:error` CustomEvents. Source: [`public/x402.js`](../../public/x402.js).
- Endpoint `https://three.ws/api/x402/symbol-availability` → **HTTP 402** with
  `access-control-allow-origin: *` (verified from an `Origin: https://live.ibm.com` request)
  and `access-control-expose-headers` including `PAYMENT-REQUIRED` and `x-payment-response`.
  Price **1000 atomics = $0.001 USDC**. Accepts:
  - Base (`eip155:8453`) → payTo `0x4022de2d36c334e73c7a108805cea11c0564f402`,
    USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (plus a Permit2 sibling the modal ignores).
  - Solana (`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`) → payTo
    `wwwPqsM4N7T9J69tB82nLyzxqsH159j4orftLTQfUGV`,
    USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.
- The Solana helper `https://three.ws/api/x402-checkout` preflight (OPTIONS) → **204**, wildcard CORS.
- **The Base path is the most embed-robust:** EIP-3009 typed data is signed entirely
  client-side; the only external dependency is `x402.js` + one cross-origin fetch to the
  wildcard-CORS endpoint. **The Solana path additionally** dynamic-imports
  `@solana/web3.js` from `https://esm.sh` and POSTs to `/api/x402-checkout`. This distinction
  drives the CSP work in task 02.
- The page drives payment programmatically via `window.X402.pay()` (button `#payBtn`), shows
  a live 402 preview, and renders symbol-availability-shaped results (`recommendation`,
  `exact_matches[]`, `similar[]`) plus a receipt. **The price tag and 402 preview are
  endpoint-agnostic; the result-body renderer is symbol-availability-specific** (relevant to
  task 08 if the endpoint is swapped).

## Task list

| #  | Task                                                        | Phase | Edits the HTML? |
|----|-------------------------------------------------------------|-------|-----------------|
| 01 | Real-wallet end-to-end verification (Base + Solana)         | 1     | only to fix a found bug |
| 02 | CSP + cross-origin hardening for `live.ibm.com`             | 1     | yes |
| 03 | Error states + resilience (every failure mode)              | 2     | yes |
| 04 | UX polish + microinteractions + motion                      | 2     | yes |
| 05 | Responsive 320/768/1440 + mobile in-wallet browsers         | 2     | yes |
| 06 | Accessibility pass (WCAG 2.1 AA)                             | 2     | yes |
| 07 | Cross-browser / device matrix                               | 3     | only to fix a found bug |
| 08 | Copy, brand & $THREE-compliance review                      | 3     | yes |
| 09 | Deploy: three.ws preview route + telemetry + IBM handoff    | 4     | yes (+ build wiring) |
| 10 | Definition-of-done sweep (capstone sign-off)                | 4     | no (verifies) |

## Running order — one file, so serialize edits

Unlike a multi-page sprint, **every editing task mutates the same file**
(`pages/ibm/x402-demo.html`). Do not run editing tasks concurrently — in this shared worktree
they will clobber one another.

- **Phase 1 (foundation):** 01 then 02. (01 is mostly read/verify; 02 makes the first
  structural edits — self-hosted fonts, CSP-safe loading.)
- **Phase 2 (polish, strictly in order):** 03 → 04 → 05 → 06. Each consumes the prior; 04 may
  introduce CSS tokens that 05/06 reuse.
- **Phase 3 (validate + content):** run 08 (edits copy/brand) then 07 (verifies across
  browsers; fixes only if it finds a defect).
- **Phase 4 (ship):** 09 then 10. 10 is the final gate.

Read/verify-only tasks (01, 07) may run against the current file anytime, but any fix they
produce must be serialized with the editing tasks.

## Definition of done (whole plan)

- A funded visitor can pay $0.001 and get real data on **both** Base (MetaMask) and Solana
  (Phantom), in a real browser, with the on-chain tx visible on Basescan/Solscan — proven by
  task 01's result file.
- Zero console errors/warnings in any supported browser, desktop or mobile.
- The page works served from a **foreign origin** (not three.ws) under a realistic IBM CSP —
  at minimum the Base path with no third-party CDN beyond `three.ws`.
- Every state (idle / preview / loading / success / each distinct error) is designed,
  on-brand, and actionable. WCAG 2.1 AA. Flawless at 320 / 768 / 1440.
- `$THREE` is the only coin referenced anywhere on the page. IBM brand usage is correct.
- The IBM handoff package exists: the file, a hosting README, and a recommended CSP header.
- `npm run build` clean; changelog entry added; completionist subagent run.

## Hard rules (inherited from CLAUDE.md)

- The only coin is `$THREE` (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never reference
  any other coin in code, copy, fixtures, or docs.
- No mocks, no fake data, no stubs, no fake-loading. Real endpoint, real wallet, real
  settlement. If you lack mainnet USDC for a verification step, **say so** — do not simulate
  the payment leg.
- Errors handled at boundaries; every error has a designed, actionable UI state.
- Stage explicit paths before committing (concurrent agents share this worktree). Never
  `git add -A` / `git add .`.
- `npx vercel build` clobbers `api/*.js` and `public/*` with esbuild bundles — never commit those.
- Push to BOTH remotes (`threeD`, `threews`) only when the user approves.

---

Each `NN-*.md` is a unit of work that **deletes itself on completion** (`git rm`, staged in
the same commit). A file that still exists is unfinished; a file that is gone has shipped.
This `00-PLAN.md` is the last to go — task 10 removes it as part of the final sign-off.
