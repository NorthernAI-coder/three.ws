# Task 02 — CSP + cross-origin hardening for live.ibm.com

## Context

three.ws workspace at `/workspaces/three.ws`. Deliverable + verified facts:
[00-PLAN.md](00-PLAN.md). The page is [`pages/ibm/x402-demo.html`](../../pages/ibm/x402-demo.html).

The demo will be hosted on **`live.ibm.com`**, a foreign origin whose **own
Content-Security-Policy governs the page**. The cross-origin API calls already work
(three.ws sends `access-control-allow-origin: *` — verified). The risk is the *outbound*
resources the page loads being blocked by IBM's CSP, and the page being embedded in an iframe.
This task makes the page robust under a realistic enterprise CSP and produces the exact CSP
header IBM should set.

## What the page currently loads (audit and confirm)

| Resource | Origin | Needed for | CSP directive |
|----------|--------|-----------|---------------|
| `x402.js` | `https://three.ws` | everything | `script-src` |
| 402 + paid fetch | `https://three.ws` | the data call | `connect-src` |
| IBM Plex fonts (CSS + woff2) | `fonts.googleapis.com`, `fonts.gstatic.com` | typography | `style-src`, `font-src` |
| `@solana/web3.js` | `https://esm.sh` | **Solana path only** | `script-src` (dynamic import) |
| `/api/x402-checkout` POST | `https://three.ws` | **Solana path only** | `connect-src` |
| keccak (`@noble/hashes`) | `https://esm.sh` | **Solana SIWX only** | `script-src` |

## Do this

1. **Remove the Google Fonts dependency.** Self-host IBM Plex (it is open source — `@ibm/plex`)
   by inlining a minimal `@font-face` set served from the **same origin** as the page, or fall
   back cleanly to a system stack (`'IBM Plex Sans', system-ui, -apple-system, Segoe UI, Roboto,
   sans-serif`). The page must render correctly with **no** `fonts.googleapis.com` request, so a
   `style-src 'self'` CSP doesn't break it. If self-hosting the woff2, place the files under
   `pages/ibm/fonts/` and reference them relatively so they travel with the file to IBM's host.
2. **Make the Base path the zero-third-party default.** Confirm the full Base pay flow needs
   only `three.ws` (script + connect) — no `esm.sh`. The Solana path needs `esm.sh` + the
   checkout helper. Add a small, honest UI note (or graceful degradation) so that if `esm.sh` is
   blocked, the Solana button fails with a clear message and the Base button still works. Do not
   hide Solana — just ensure a strict-CSP host degrades to Base gracefully instead of throwing.
3. **Test as a top-level document on a foreign origin.** Serve `pages/ibm/x402-demo.html` from a
   port that is NOT three.ws (e.g. `npx http-server pages/ibm -p 8088`) and load
   `http://localhost:8088/x402-demo.html`. Then re-test with a locally-enforced CSP that mimics a
   strict IBM policy (use a `<meta http-equiv="Content-Security-Policy">` injected via a tiny
   proxy, or browser DevTools "Content-Security-Policy" override). Confirm: Base flow works under
   `script-src 'self' https://three.ws; connect-src https://three.ws; style-src 'self' 'unsafe-inline'; font-src 'self'`.
4. **Test embedded in an `<iframe>`** on a foreign origin (IBM may iframe this, as the existing
   IBM landing page iframes other tools). Confirm the wallet modal still opens and is usable
   inside the iframe, popups/wallet extensions aren't blocked, and there's no `X-Frame-Options`
   / `frame-ancestors` conflict. If wallet extensions can't inject into a cross-origin iframe in
   some browsers, document it and recommend top-level hosting in the handoff.
5. **No mixed content, no console CSP violations** in any configuration.

## Output (required)

Add a recommended CSP to the handoff (task 09 will package it). Two tiers:

- **Strict (Base-only):** `script-src 'self' https://three.ws; connect-src https://three.ws; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:;`
- **Full (Base + Solana):** add `https://esm.sh` to `script-src` and `https://three.ws` (already present) to `connect-src`.

Write these into a short note `pages/ibm/HOSTING.md` (task 09 will expand it).

## Definition of done

- The page renders and the **Base pay flow works with no resource outside `'self'` + `three.ws`** —
  verified under an enforced strict CSP, served from a non-three.ws origin.
- The Solana path works when `esm.sh` is allowed and degrades with a clear message when it isn't.
- Works both as a top-level page and inside a cross-origin iframe (or the iframe limitation is
  documented).
- Zero console errors / CSP violations in every configuration tested. Fonts load self-hosted (no
  Google Fonts request).
- `pages/ibm/HOSTING.md` contains the two CSP tiers. Run the **completionist** subagent.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

```bash
git rm "tasks/ibm-x402-demo/02-csp-and-cross-origin-hardening.md"
```

Stage the deletion in the same commit as the implementation. A file that still exists is
unfinished work; a file that is gone has shipped. Do not delete early.
