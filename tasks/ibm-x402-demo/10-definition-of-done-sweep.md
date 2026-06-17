# Task 10 — Definition-of-done sweep (capstone sign-off)

## Context

three.ws workspace at `/workspaces/three.ws`. Deliverable + verified facts:
[00-PLAN.md](00-PLAN.md). The page is [`pages/ibm/x402-demo.html`](../../pages/ibm/x402-demo.html).

This is the final gate. Tasks 01–09 are done (their files are gone). This task proves the whole
thing is **100% production-ready, zero-error** before it represents IBM × three.ws publicly. It
edits nothing except to fix a blocker it uncovers — and it removes the last task files.

## The sweep — verify every item against evidence (not assumption)

1. **Real-money flow works.** Re-confirm task 01's result file shows `PASS` on both Base and
   Solana with explorer-verifiable transactions (or a clearly-owned `BLOCKED` with a funding
   note, surfaced to the user). The payment leg is real — never faked.
2. **Zero console errors/warnings** on load and through a full happy-path run, in at least two
   engines (Chromium + WebKit), light and dark.
3. **Foreign-origin + CSP.** Served from a non-three.ws origin under the strict (Base-only) CSP,
   the Base flow works with no resource outside `'self'` + `three.ws`; Solana degrades
   gracefully. No CSP violations. (Evidence: task 02 + `pages/ibm/HOSTING.md`.)
4. **Every state designed.** idle / preview-loading (skeleton) / success (animated) / and each
   error from task 03 — all on-brand and actionable. No stuck spinners, no `undefined`, no raw
   stacks.
5. **Responsive** at 320 / 768 / 1440, no overflow; mobile-without-wallet guidance present
   (task 05).
6. **Accessibility:** zero serious/critical axe violations, full keyboard operability, focus
   returns to the trigger on modal close, AA contrast in both themes (task 06).
7. **Cross-browser matrix** report exists; desktop all `PASS`, mobile `PASS`/`UNTESTED` honestly
   (task 07).
8. **Copy & compliance:** accurate, honest about real spend, IBM brand correct (or flagged),
   and **`$THREE` is the only coin** referenced anywhere on the page (task 08).
9. **Shipped:** reachable on three.ws preview URL, `pages.json`/sitemap/SEO updated, changelog
   entry validated, `pages/ibm/HOSTING.md` complete (task 09).
10. **Build + hygiene:** `npm run build` clean; `npm test` green (or unrelated-failure status
    noted); no esbuild bundle committed to `api/`/`public/`; repo root clean; only intended
    paths staged.

## Method

- Run the **completionist** subagent over the changed files (`pages/ibm/x402-demo.html`,
  `pages/ibm/HOSTING.md`, `pages/ibm/fonts/*`, `vite.config.js`, `data/pages.json`,
  `data/changelog.json`) and resolve everything it raises.
- Do a final human-style read of `git diff` — every changed line justified.
- Produce a one-page **sign-off report** to the user: each DoD item with PASS + its evidence
  (tx hashes, screenshots/paths, axe summary, matrix link), and any item the user must close
  (e.g. IBM brand sign-off, a `BLOCKED` funding leg).

## Definition of done

- Every item 1–10 above is `PASS` with cited evidence, or has a named owner/blocker surfaced to
  the user — nothing assumed.
- Sign-off report delivered. completionist clean. Build clean.
- Remove the last task files (this one and the now-empty plan) in the final commit:

```bash
git rm "tasks/ibm-x402-demo/10-definition-of-done-sweep.md" "tasks/ibm-x402-demo/00-PLAN.md"
```

(If any earlier `NN-*.md` still remains, that task is unfinished — do **not** delete it or the
plan; report it as outstanding instead.) Push to BOTH remotes only after the user approves.

<!-- AUTO:self-delete-on-complete -->
