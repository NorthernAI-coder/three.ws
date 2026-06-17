# Task 05 — Responsive (320 / 768 / 1440) + mobile in-wallet browsers

## Context

three.ws workspace at `/workspaces/three.ws`. Deliverable + verified facts:
[00-PLAN.md](00-PLAN.md). The page is [`pages/ibm/x402-demo.html`](../../pages/ibm/x402-demo.html).
Run **after** task 04 (consume its tokens/states; don't regress them).

Two jobs: flawless layout at every width, and correct behavior in the **mobile wallet
reality** — on phones, `window.ethereum` / `window.solana` only exist inside a wallet's in-app
browser, not in mobile Safari/Chrome.

## Layout — test at 320 / 768 / 1440

1. **No horizontal overflow at 320px.** Watch the long mono strings (payTo addresses, tx
   hashes, contract addresses) — they must wrap/ellipsize, not push the layout wide. The repo
   has a documented iOS gotcha: clipped horizontal overflow forces a desktop-width layout
   viewport and breaks `@media`. Verify none of that here.
2. **The 3-up "how it works" strip** collapses to one column cleanly.
3. **The demo card head** (title + price tag) stacks sensibly; the price stays legible.
4. **The field row** (ticker input + pay button) stacks on narrow screens with the button going
   full-width (started — verify and refine). Tap targets ≥ 44×44px.
5. **The receipt grid** and **matches list** reflow without overlap; the raw-JSON `<pre>`
   scrolls horizontally inside its box rather than blowing out the page.
6. **The dark code block** (embed snippet) scrolls internally; never causes page overflow.
7. Use the existing `clamp()`/grid/flex patterns; avoid fixed px widths.

## Mobile wallet behavior

8. On **mobile Safari / Chrome with no injected wallet**, the widget shows "not detected". The
   page must make the next step obvious — add concise guidance: "On mobile, open this page
   inside your MetaMask or Phantom browser to pay." Keep the 402 preview fully functional there
   (read-only) so the demo still communicates even without a wallet.
9. Inside the **MetaMask mobile in-app browser** (Base) and **Phantom mobile in-app browser**
   (Solana), confirm the full pay flow is reachable and the modal is usable on a small screen
   (the widget renders as a bottom-style sheet on mobile — verify it isn't clipped).
10. Confirm wallet approval round-trips work in the in-app browser (these are the most common
    real-world mobile path for x402 demos).

## Method

- `npx http-server pages/ibm -p 8088`; DevTools device toolbar at 320 / 360 / 768 / 1024 / 1440.
- Then a **real phone**: open via the wallet in-app browsers. (If a real device is unavailable,
  document that the in-app-browser legs are unverified and recommend task 07 cover them.)

## Definition of done

- No overflow / overlap / unreadable text at 320 / 768 / 1440. Tap targets ≥ 44px.
- Long addresses/hashes wrap or ellipsize; no element forces a wide viewport.
- Mobile-without-wallet shows clear guidance and a working read-only preview.
- Pay flow verified (or explicitly flagged unverified) inside MetaMask & Phantom mobile
  browsers. No console errors at any width. Run the **completionist** subagent.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

```bash
git rm "tasks/ibm-x402-demo/05-responsive-and-mobile-wallets.md"
```

Stage the deletion in the same commit as the implementation. A file that still exists is
unfinished work; a file that is gone has shipped. Do not delete early.
