# Audit 04 — Crypto / x402 / Payments / Agent-Economy demos

Scope: `/pay /bazaar /arbitrage /providers /ibm/x402-demo /fact-checker /tutor /unstoppable /shopper /forever /club /agent-exchange /agent-economy /agent-trade /three /three-live`

Date: 2026-06-18. Read-only audit — no files changed. Severity: **P0** broken / hard-rule · **P1** reachable-but-incomplete · **P2** mediocre · **P3** opportunity.

**Coin rule: PASS across all 16 pages.** No promoted token other than $THREE is hardcoded anywhere. `/three` (`pages/three.html:24`, `src/three-economy.js:24`) and `/three-live` (`pages/three-live.html:257`) reference only the canonical mint `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. x402 settles in USDC (and `/forever` in BTC via ordinalsbot) — stablecoin/settlement rails, not promoted coins, which is allowed. The standard Solana/Base/BSC USDC mint addresses hardcoded in `/pay` and `/bazaar` are correct canonical USDC addresses, not a coin-rule violation.

---

## /pay — public/pay/index.html
Verdict: Real x402 payment flows (Solana + Base + BSC) to `/api/mcp` with live `X-PAYMENT` headers; no mocks. Solid but a few unhandled async edges.

- [P1] public/pay/index.html:~1751 — SSE stream from `/api/x402-pay` has no `AbortController`; if the facilitator closes mid-stream the reader is left half-read. Fix: wrap in AbortController, abort on unmount/error.
- [P1] public/pay/index.html:~2048 — `waitForReceipt` polls BSC RPC every 1.5s for 60s with no `Retry-After` / backoff; hammers RPC on a slow tx. Fix: exponential backoff, honor Retry-After.
- [P2] public/pay/index.html:~1213 — Phantom balance fetch fails silently (label falls back to showing the address). Fix: surface "couldn't read balance" inline.
- [P2] public/pay/index.html:~1072 — No wallet-disconnect handling between render and sign; misleading "Phantom not found" vs "disconnected". Fix: distinguish the two states.
- [P3] public/pay/index.html — Demo agent wallet not labeled as shared/demo; users may think they can fund it. Fix: add a "shared demo wallet" note.

## /bazaar — public/bazaar.html (+ bazaar.js)
Verdict: Real discovery (`/api/bazaar/list`, `/api/bazaar/search`) + x402.js drop-in pay modal. Wired, cross-linked.

- [P1] public/bazaar.js:~174 — On `fetch()` network failure (vs `r.ok===false`) the loading spinner stays stuck; only the non-ok branch renders an error. Fix: catch network errors → error state.
- [P2] public/bazaar.html:491 — `<script src="/x402.js">` is the only thing wiring "Try it"; if it 404s the buttons silently no-op (`window.X402` undefined) until clicked. Fix: feature-detect and disable/explain.
- [P2] public/bazaar.js:~477 — `error.error` rendered into `ctxEl.innerHTML` unescaped on the context-fetch failure path. Fix: escapeHtml before insert.
- [P2] public/bazaar.js:~385 — "Try it" result has no `aria-live` announcement. Fix: add live region.

## /arbitrage — public/arbitrage.html (+ arbitrage.js)
Verdict: Real `/api/bazaar/arbitrage` feed, cross-links to bazaar + providers, x402.js pay-cheapest.

- [P1] public/arbitrage.js:~209 — Dynamic `/x402.js` loader: on 404 the promise rejects silently, button re-enables but user never told why nothing happened. Fix: show "payment modal failed to load" on the button.
- [P1] public/arbitrage.js:~226 — No timeout on the `/api/bazaar/arbitrage` fetch; if backend hangs the skeleton never resolves. Fix: 15–30s AbortSignal.timeout.
- [P2] public/arbitrage.html:~110 — Grid `minmax(340px,1fr)` forces horizontal scroll below 340px. Fix: lower the min to ~300px / single column.

## /providers — public/providers.html (+ providers.js)
Verdict: Real `/api/bazaar/providers` directory + profile view; XSS-safe (escapeHtml on host params).

- [P1] public/providers.js:~70 — On directory fetch failure the 6 skeleton cards are never replaced — users see grey boxes forever. Fix: render an error state on catch.
- [P2] public/providers.js:~86 — Sort falls back to `Infinity` when `medianPriceAtomic` is missing (stable but sloppy). Fix: explicit missing-price fallback.
- [P2] public/providers.html:~78 — No sticky header on long listings; category/network bars detach from provider name on deep scroll.

## /ibm/x402-demo — pages/ibm/x402-demo.html
Verdict: Strong. Real `/api/x402/forge` + `/api/x402/symbol-availability`, live 402-challenge preview, polls free `/api/forge`, full error states. Footer (line ~715) explicitly states $THREE is the only coin issued.

- [P1] pages/ibm/x402-demo.html:~1162 — `pollForWallet()` re-checks 8×350ms but never early-exits when a wallet is detected mid-poll; `eip6963:announceProvider` listener (~1168) only reachable after first poll. Fix: resolve immediately on detect / register the listener up front.
- [P2] pages/ibm/x402-demo.html:~1233 — If `model-viewer` script fails to load, the result panel renders an empty `<model-viewer>` that never upgrades (blank box). Fix: check `customElements.get('model-viewer')`, fall back to a "Download GLB" link.
- [P2] pages/ibm/x402-demo.html:~1476 — Forge poll caps at 150 tries (~6.5 min) then shows "still working" with no recourse. Fix: add a "continue in Forge" link.
- [P3] pages/ibm/x402-demo.html — Two large inline `<script>` blocks (~725–1574); would be more maintainable extracted to `/src/`.

## /fact-checker — pages/fact-checker.html (+ src/fact-checker-app.js)
Verdict: Real x402 `/api/x402/fact-check` POST with live 402 challenge + USDC price extraction; verdict/source/cost/attestation states all present. One hard-rule violation in the loading UX.

- [P1] src/fact-checker-app.js:257–284 — **Fake progress**: `LOADING_STAGES` ("Generating search queries…" → … → "Computing verdict…") are cycled by a `setInterval` every 2000ms unconnected to real backend progress. Violates CLAUDE.md "no setTimeout fake progress". Fix: drive stages from real server signal (SSE) or use a single honest "Checking…" indicator.
- [P1] pages/fact-checker.html:~1023 — Payment panel default "$0.10 per check" is static; if the 402 challenge parse fails (try/catch swallows it, app.js:~158) the user sees a price that may not match server. Fix: show "price unavailable" rather than a stale hardcoded number.
- [P1] pages/fact-checker.html — Minimal ARIA: form textarea/radios lack labels, submit lacks `aria-busy`, result panel not `aria-live`. Fix: label controls, mark result `aria-live="polite"`.
- [P2] src/fact-checker-app.js:~217 — Errors surface raw `HTTP <status>` to users. Fix: map 429/500/502 to friendly copy.
- [P2] pages/fact-checker.html:963–977 — Example claims hardcoded in HTML (acceptable as static UX seed, but can't be updated without a redeploy).
- [P2] pages/fact-checker.html:~88 — Below 480px, 32px side padding leaves ~296px content; source cards wrap aggressively. Fix: reduce padding at a 480px breakpoint.

## /tutor — public/tutor.html (+ public/tutor.js)
Verdict: Tight, real. Each question = real x402 `/api/x402/tutor` ($0.01); session close → real `/api/tutor/session` invoice with attestation. Import `/tutor.js` resolves correctly.

- [P1] public/tutor.js:~140 — `window.X402` checked at ask-time, but `/x402.js` and `/tutor.js` both load async; first ask before x402.js finishes shows a false "payment library failed to load". Fix: poll/await an `X402Ready` flag with short retry.
- [P1] public/tutor.js:~224 — `resume()` try/catch fails silently; if the session endpoint is down the user gets a blank thread with no "previous session unavailable" note. Fix: surface a recovery message.
- [P2] public/tutor.html:~214 — Textarea has no `maxlength`; only a `< 5` min check (app.js:~128). Fix: add maxlength + char counter.
- [P2] public/tutor.html:~212 — Sticky composer scrolls behind the mobile soft keyboard. Fix: switch to fixed + viewport-height adjust on focus.

## /unstoppable — pages/unstoppable.html (+ src/unstoppable-dashboard.js)
Verdict: Real `/api/agents/unstoppable-status` poll with 402→cached fallback and real `window.X402.pay()` donate. Accessibility and resilience are the weak spots.

- [P1] pages/unstoppable.html — **Zero ARIA / role / `:focus-visible`** across the page: live balance/stats not `aria-live`, donate button (~521) unlabeled, no visible keyboard focus. Screen-reader users can't operate it. Fix: add aria-live to live figures, labels to buttons, focus-visible styling.
- [P1] src/unstoppable-dashboard.js:~363 — `setInterval(poll, 60000)` never backs off on 5xx; failing backend gets hit every 60s forever. Fix: exponential backoff capped at ~5min, reset on 200/402.
- [P1] pages/unstoppable.html:~520 — Donate button keeps label/color "Donate" even when the 402 backdrop says "Pay $0.01 to see live data". Fix: toggle to "Unlock live data — $0.01" in the 402 state.
- [P2] src/unstoppable-dashboard.js:~204 — Cached-data banner has no timestamp ("cached data" — how old?). Fix: show relative age.
- [P2] src/unstoppable-dashboard.js:~344 — Donate failure (incl. insufficient funds) toasts but offers no top-up/retry path. Fix: keep button enabled, add "top up USDC then retry" link.
- [P2] pages/unstoppable.html:~493 — 3-col stats grid never wraps; numbers wrap at 320px. Fix: wrap to 2-col below 640px.

## /shopper — pages/shopper.html (+ shopper-app.js)
Verdict: Real `/api/agents/endpoint-shopper-run` with payment-required detection — but nav links are broken in prod and states are thin.

- [P1] pages/shopper.html:413–415 — **Dead nav links in prod**: `/pages/marketplace.html` and `/pages/fact-checker.html` (also `/pages/app-next.html`, ~419) are not routed — prod only serves `/marketplace`, `/fact-checker`, etc. These 404. Fix: use the canonical clean routes.
- [P1] pages/shopper.html — No wallet-not-connected / insufficient-budget pre-check before "Run Task"; only a generic error-card. Fix: gate the CTA and surface per-failure-type messages.
- [P2] src/shopper-app.js:~117 — Paywall prompt depends on the `payment-required` header being present with no fallback. Fix: defensive default message.
- [P2] pages/shopper.html:~476 — Empty state ("Enter a task and click Run Task") gives no guidance on wallet/budget. Fix: add contextual tips.

## /forever — public/forever.html (+ forever.js)
Verdict: Real Bitcoin inscription payments via api.ordinalsbot.com (no mock). BTC is a settlement rail here, not a promoted coin — coin-rule OK. Accessibility/states incomplete.

- [P1] public/forever.js:~80 — No wallet-balance / insufficient-funds check before prompting payment; user can start an inscription they can't fund. Fix: gate the "Inscribe forever" CTA on estimated fee vs balance.
- [P2] public/forever.html:281–292 — `.error-banner` has no `role="alert"`/`aria-live`; payment failures aren't announced. Fix: add `role="alert" aria-live="assertive"`.
- [P2] public/forever.html:256–279 — Three views (compose/pay/win) toggle via `.show` with no live-region announcing the state change for AT users. Fix: aria-live wrapper.
- [P2] public/forever.html:663–665 — `#openWallet` / `#mempoolLink` ship with `href="#"` until JS populates them; clickable dead links if a payment never completes. Fix: hide/disable until valid.
- [P2] public/forever.html:~242 — Fixed 240px bubble max-width risks overflow <320px. Fix: clamp.

## /club — pages/club.html (+ club.js, club-gate.js)
Verdict: Polished 3D stage with real x402 micro-tips (USDC on Base/Solana) + SSE `/api/club/tips-stream`. Cover charge correctly USDC-only. Best-built page in the group; edge cases remain.

- [P1] pages/club.js:~1331 — Tip buttons are tappable before `window.X402.pay` exists ("widget still loading" message but button not disabled). Fix: disable all tip buttons until X402 ready.
- [P1] public/.../club-gate.js:~48 — Cover-charge pass cached in `localStorage` (`club:pass:v1`) with no expiry — permanent free re-entry, survives a ban. Fix: add timestamp, expire (e.g. 24h) / clear on logout.
- [P1] pages/club.js:~1150 — Avatar load failure (`/api/play-style` 404/timeout) silently falls back to a hardcoded default with no user surface. Fix: show a re-select error state.
- [P2] pages/club.js:~88 — SSE reconnect is linear; long outages drop events. Fix: exponential backoff + jitter + backfill from `/api/club/tips`.
- [P2] pages/club.js:~269 — Tip-history error is one generic "Leaderboard unavailable"; doesn't distinguish network vs empty vs down. Fix: granular messages.
- [P2] pages/club.html:~1517 — Mobile bottom-sheet uses `calc(85dvh - 240px)` transform; brittle on notched phones (safe-area only applied to padding). Fix: account for safe-area in the transform.
- [P2] pages/club.html:~1999 — Pills/tip buttons ~11.5px font without enforced 44px touch target on mobile. Fix: min-height 44px.

## /agent-exchange — pages/agent-exchange.html (+ agent-exchange.js)
Verdict: Real Solana-mainnet USDC settlement, balance pre-check (`/api/x402-pay?balance=1`), live receipts. Two dead nav links + incomplete failure states.

- [P1] pages/agent-exchange.html:302 — **Dead link** `/ibm/trust-layer` — no route in vercel.json, no file under `pages/ibm/`. Fix: point at an existing surface or remove. (Note: `/pay` at line 298 IS valid — routed in vercel.json.)
- [P1] pages/agent-exchange.js:24–31 — Payment `STAGES` array (challenge→built→submitted→confirmed→settled) has no `error`/`timeout`/`rejected` stage; a rejected/slow payment has no terminal UI. Fix: add an error stage.
- [P1] pages/agent-exchange.js:~307 — `/api/x402-pay` fetch has no AbortSignal/timeout; a slow backend hangs the user indefinitely. Fix: 30s timeout + error state.
- [P2] pages/agent-exchange.js:~363 — Receipt render assumes `payment.tx`; when missing, Solscan links render as `#`. Fix: validate before linking.
- [P2] pages/agent-exchange.html:320–340 — No focus moved to the receipt on success; keyboard users stranded. Fix: focus the receipt heading.
- [P2] pages/agent-exchange.html:~270 — `#walletState` panel appears dynamically but isn't `aria-live`; AT users miss low-balance warnings.

## /agent-economy — pages/agent-economy.html (+ src/agent-economy.js)
Verdict: Real Solana payment flow (`/api/agent-economy/status`, `/api/agent-economy/transact`) with proper `wallet_unconfigured` / `insufficient_balance` / `no_recipient` handling and real receipts. Two dead links.

- [P1] pages/agent-economy.html:542 — **Dead link** `/ibm/galaxy` — no route, no file. Fix: remove or repoint.
- [P1] pages/agent-economy.html:456 — Noscript fallback links to **`/docs/ibm`** which does not exist (no `docs/ibm`). Fix: point at a live docs page.
- [P2] pages/agent-economy.js — CTA buttons lack explicit aria-labels; dynamic balance/fund-alert not `aria-live`. Fix: add labels + live region. (`/x402` link at line 544 is valid.)

## /agent-trade — pages/agent-trade.html (+ src/agent-trade.js)
Verdict: Real 3D x402 demo over SSE `/api/agent-trade/demo` with a genuine config pre-flight (`?check=1`) that blocks the UI when buyer/seller keypairs aren't set. Honest, no mocks.

- [P1] pages/agent-trade.js:~516 — When env (`AGENT_BUYER_SECRET`/`AGENT_SELLER_SECRET`) is unconfigured the page is a blank gated overlay with no alternative; on a fresh deploy this reads as broken. Fix: link to setup docs / a clearly-labeled read-only walkthrough.
- [P2] pages/agent-trade.html — No cross-links back to `/agent-economy` or `/three-live`; dead-ends after the demo. Fix: add related-surface links.
- [P2] pages/agent-trade.js — No keyboard focus management on the overlay; OrbitControls only. Fix: focus trap / dismiss affordance.

## /three — pages/three.html (+ src/three-economy.js)
Verdict: 36-line shell that boots `src/three-economy.js` (~1439 lines). Real `/api/three/{catalog,stats,tier,name-quote}` + `/api/token/price`. Imports `./three-access.js` and `./wallet.js` (present). $THREE-only. Not a dead-end — cross-links to `/three-token`.

- [P1] src/three-economy.js — Hero/stats have no explicit error state; if `/api/three/stats` fails on first load it silently stays on "—" placeholders. Fix: render a "live figures unavailable" notice on fetch failure.
- [P2] src/three-economy.js — CTA buttons could use aria-labels; otherwise responsive (clamp/auto-fit/560px) and clean.

## /three-live — pages/three-live.html
Verdict: Strong. Real on-chain trade stream via SSE `/api/agents/pumpfun-feed?kind=trades&mint=<THREE>` + 8s `/api/three-token/stats` poll; every particle/shockwave is a real trade; robust exponential reconnect; connecting/live/quiet/error hero states all designed. $THREE-only, shader comment explicitly avoids buy/sell directional bias.

- [P1] pages/three-live.html:~577 — Stats-poll failure is silent on the first failure; a toast only appears after 2+ failures. Fix: badge the error on first failure for faster feedback.
- [P3] pages/three-live.html — Ticker `<ol>` could carry `role="list"`; minor.

---

## Group summary

**Coin rule: PASS** — only $THREE is promoted; USDC/BTC are settlement rails. No P0 coin violations anywhere in this group.

**P0 — 0.** No broken-beyond-use pages and no hard-rule (mock-payment / fake-data / coin) violations. All paid flows hit real endpoints/facilitators.

**P1 — top issues (reachable but incomplete):**
1. `src/fact-checker-app.js:257–284` — fake `setInterval` progress stages (CLAUDE.md "no fake progress" violation) — replace with real/honest progress.
2. `pages/shopper.html:413–419` — nav links to `/pages/marketplace.html`, `/pages/fact-checker.html`, `/pages/app-next.html` 404 in prod — use clean routes.
3. Dead links: `pages/agent-exchange.html:302` `/ibm/trust-layer`; `pages/agent-economy.html:542` `/ibm/galaxy` and `:456` `/docs/ibm` — repoint/remove (no routes/files exist).
4. `pages/unstoppable.html` — zero ARIA/keyboard support + `setInterval` poll with no backoff; `pages/club.js`/`club-gate.js` — tip buttons live before X402 ready, cover-charge pass cached forever in localStorage.
5. Missing fetch timeouts / AbortControllers on paid or polling calls: `/pay` SSE + BSC poll, `/arbitrage` feed, `/agent-exchange` `/api/x402-pay` — slow backends hang the UI.

**Recurring P2 themes:** payment-modal (`/x402.js`) load failures fail silently; stuck skeletons on network (vs `!r.ok`) errors; thin/absent ARIA + focus management on dynamic payment results; mobile touch targets <44px and a few sub-340px grid overflows.
