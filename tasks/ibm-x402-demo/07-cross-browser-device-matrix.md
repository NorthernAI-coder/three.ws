# Task 07 — Cross-browser / device matrix

## Context

three.ws workspace at `/workspaces/three.ws`. Deliverable + verified facts:
[00-PLAN.md](00-PLAN.md). The page is [`pages/ibm/x402-demo.html`](../../pages/ibm/x402-demo.html).

Layout (task 05) and a11y (task 06) are done; this task proves the page behaves across the
real browser/engine matrix — especially the parts that only break on specific engines (wallet
injection, font loading, the iOS layout-viewport gotcha). Mostly a **verification** task: fix
only defects you find, and serialize any fix with the editing tasks.

## Matrix

Desktop: **Chrome, Edge, Firefox, Safari**. Mobile: **iOS Safari, Android Chrome**, plus the
**MetaMask** and **Phantom** in-app browsers (the realistic mobile pay path). For each cell
check:

1. Page renders correctly; self-hosted fonts load (no FOUT/FOIT, no Google Fonts request).
2. The **402 preview** populates with the live price/networks.
3. The pay flow is reachable; the wallet modal opens and is usable.
4. **Zero console errors / warnings.**
5. No layout breakage; no horizontal overflow.

## Known engine-specific watch-items

- **iOS Safari:** the documented repo gotcha — a clipped horizontal overflow forces a
  desktop-width layout viewport so `@media` breakpoints stop firing, and a bare element
  selector (e.g. `footer{}`) can leak `display`/layout. Confirm neither happens here. Test on a
  real device or the iOS Simulator — headless Chromium/WebKit does **not** reproduce it.
- **Safari/WebKit:** `backdrop-filter`, `:focus-visible`, and `dvh`/`clamp()` support; the
  widget's modal uses `backdrop-filter` (has `-webkit-` prefix — confirm).
- **Firefox:** no wallet-injection assumptions that only hold in Chromium; EIP-1193/Solana
  provider detection still works.
- **In-app wallet browsers:** the most likely real audience path. Confirm Base pays in MetaMask
  mobile and Solana pays in Phantom mobile (overlaps task 05 — coordinate, don't duplicate the
  fix).

## Output (required)

A matrix report (browser/device × the 5 checks) with `PASS` / `FAIL` / `N/A` and a note per
failure. Save it to `~/.claude/ibm-x402-verify/browser-matrix.md` and report the summary to the
user. If a cell can't be tested (no device available), mark it `UNTESTED` — never `PASS` by
assumption.

## Definition of done

- Every desktop cell `PASS`. Mobile + in-app-wallet cells `PASS` or honestly `UNTESTED` with a
  reason (never assumed).
- No iOS layout-viewport regression; fonts load self-hosted everywhere.
- Any defect found is fixed, committed, and re-verified. Matrix report written. Run the
  **completionist** subagent if you changed code.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

```bash
git rm "tasks/ibm-x402-demo/07-cross-browser-device-matrix.md"
```

Stage the deletion in the same commit as any fix (or on its own if verification-only). A file
that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
