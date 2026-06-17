# Task 08 — Copy, brand & $THREE-compliance review

## Context

three.ws workspace at `/workspaces/three.ws`. Deliverable + verified facts:
[00-PLAN.md](00-PLAN.md). The page is [`pages/ibm/x402-demo.html`](../../pages/ibm/x402-demo.html).

This page represents both three.ws and IBM. Every word must be accurate, enterprise-clear, and
compliant. Mind the repo's public-copy rule: professional and literal ("3D AI agents", "pay-per-call
API"), never sci-fi metaphor.

## Do this

1. **Technical accuracy.** Verify the x402 explanation is correct and crisp: HTTP `402` →
   machine-readable payment terms → signed stablecoin authorization → retry with `X-PAYMENT` →
   on-chain settlement. No overclaiming ("instant", "free", "no fees" — the network fee is
   sponsored, not nonexistent; say so precisely).
2. **Honesty about real money.** The page must be unambiguous that this spends **real USDC on
   mainnet** (a tenth of a cent) and needs a funded wallet. No dark patterns. The existing note
   is a good start — tighten it.
3. **IBM brand correctness.** The inline IBM mark is a placeholder `<rect>+text` SVG. Replace it
   with a correct treatment (the proper 8-bar IBM logo, or a clean wordmark) and confirm
   "IBM Business Partner" usage matches IBM's brand guidelines (lockup, spacing, the relationship
   wording). If unsure of exact rights, use a neutral, defensible treatment and flag it for the
   user to confirm with IBM. Use IBM Plex + Carbon blue `#0f62fe` (already in place).
4. **$THREE compliance (hard rule).** `$THREE` must be the **only** coin referenced anywhere on
   the page — copy, examples, metadata, comments. The footer line is present; keep it.
   - The default ticker `GRANITE` is IBM's model family, **not a coin** — fine.
   - The `symbol-availability` endpoint can surface real launched tickers at runtime in
     `similar[]` (the allowed launch-directory exception). Decide whether arbitrary
     user-launched tickers appearing on an IBM page is desirable. If not, prefer ticker inputs
     (like `GRANITE`) that return clean/empty results, and ensure nothing in **static** copy
     names another coin.
5. **Endpoint-narrative decision.** `symbol-availability` is pump.fun-flavored. Evaluate whether
   to keep it or swap to a cleaner enterprise data call (e.g. `/api/x402/skill-marketplace`,
   also $0.001 — "query the agent-skill marketplace"). **If you swap:** the price tag + 402
   preview are endpoint-agnostic, but the result-body renderer is symbol-availability-shaped, so
   update the renderer to the new response schema and re-verify with task 01's flow. Record the
   decision and rationale in the completion report. (Default: keep `symbol-availability` unless
   the enterprise narrative clearly improves — don't churn without reason.)
6. **Plain-language & scannability.** Headlines, the 3-step strip, button label, empty/idle copy,
   error copy (coordinate with task 03). Read it as a first-time enterprise visitor who has never
   heard of x402 — does each section land in seconds?
7. **Links & metadata.** Every link resolves (docs, bazaar, changelog). `<title>`,
   `meta description`, and any OG tags are accurate and partnership-appropriate.

## Definition of done

- Copy is accurate, professional, literal, and honest about real-money spend; no overclaiming,
  no metaphor.
- IBM brand treatment is correct (or a defensible neutral treatment flagged for IBM sign-off).
- `$THREE` is the only coin anywhere on the page; static copy names no other coin.
- The endpoint-narrative decision is made and recorded; if swapped, the renderer is updated and
  re-verified.
- All links resolve; title/description/OG accurate. No console errors. Run the **completionist**
  subagent.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

```bash
git rm "tasks/ibm-x402-demo/08-copy-brand-compliance.md"
```

Stage the deletion in the same commit as the implementation. A file that still exists is
unfinished work; a file that is gone has shipped. Do not delete early.
