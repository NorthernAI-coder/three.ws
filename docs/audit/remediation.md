# Audit Remediation — 2026-06-18

Companion to [2026-06-18-codebase-audit.md](./2026-06-18-codebase-audit.md).
What was changed in this pass, why, and how each change was verified. Internal
DRY refactors are deliberately kept as their own logical changes so the diff is
reviewable.

## Shipped

### 1. Clickjacking: secure-by-default framing (HIGH) — `vercel.json`
- **Change:** the global route default `frame-ancestors *` → `frame-ancestors 'self'`.
- **Why:** the catch-all `"/(.*)"` route applied `*` to every page, so `/`,
  `/marketplace`, `/agents`, `/forge`, `/launches`, `/chat` were all framable on
  any origin. Auth routes were already `'self'`.
- **Why not also add `x-frame-options: SAMEORIGIN` to the global default:** it
  would leak onto the embed/widget routes (which override CSP `frame-ancestors`
  back to `*` but not XFO), and browsers that honour XFO over CSP would then
  wrongly block legitimate embeds. CSP `frame-ancestors` is the modern,
  sufficient control and is what the embed routes already rely on.
- **Embed safety verified:** the embed loader scripts (`public/embed.js`,
  `public/widget-client.js`, `public/embed/v1.js`) only ever iframe `/widget`,
  `/embed/avatar(/:id)`, `/a/:chain/:id/embed`, `/agent/:id/embed`, and
  `/walk-embed` — **all of which keep an explicit `frame-ancestors *`.** The
  `model-viewer` embed renders inline (no iframe). No embed path regresses.
- **Verify:** `node -e "JSON.parse(...vercel.json)"` (valid); 8 `*` embed routes +
  2 `'self'` routes confirmed. **Changelog:** security entry added.

### 2. Contract ETH payouts: `.transfer()` → checked `.call` (MEDIUM) — `contracts/src/IdentityRegistry.sol`
- **Change:** `recipient.transfer(amountWei)` in `withdraw()` and `spend()` →
  `(bool ok, ) = recipient.call{value: amountWei}(""); if (!ok) revert EthTransferFailed();`
  (+ new `EthTransferFailed` error).
- **Why:** `.transfer()` forwards only 2300 gas and reverts when the recipient is
  a smart-contract wallet (Safe / AA) with a non-trivial `receive()`. This mirrors
  the already-audited pattern in the sibling `ReputationRegistry.sol`.
- **Safety:** both functions already use checks-effects-interactions (balance and
  allowance decremented *before* the external call) and `nonReentrant`, so the
  checked-call form introduces no reentrancy surface.
- **Verify:** pattern matches `ReputationRegistry`. ⚠️ `forge test` could **not**
  be run — `forge` is not installed in this environment. Run the Foundry suite
  before deploying.

### 3. DRY: shared pagination helper (MEDIUM) — `api/_lib/http-params.js` (new)
- **Change:** new `clampInt` / `parseLimit` / `parseOffset` helpers; migrated 7
  copy-pasted clamp sites (`pump-bounties`, `galaxy` ×2, `characters`,
  `agent/activity`, `_lib/x402/receipt-storage`, `_lib/pump-go`).
- **Bonus fix:** the old inline pattern produced `NaN` on non-numeric input
  (`?limit=abc`), silently disabling the clamp; the helper coerces junk to the
  default.
- **Verify:** new unit test `tests/api/http-params.test.js` — **11/11 pass**.

### 4. DRY: UUID validation consolidation (MEDIUM) — 60 `api/**` files
- **Change:** replaced the locally-redeclared `const UUID_RE = /…/i` + `.test()`
  in 60 handlers with the existing `isUuid()` from `api/_lib/validate.js`.
- **Excluded (correctly):** `api/skills/mint.js` and `api/x402/animation-download.js`
  use the regex *as a value* (zod `.regex()` / test export); `api/permissions/[action].js`
  uses it outside `.test()`. The codemod auto-skipped these.
- **Codemod self-check that paid off:** the first run also rewrote the *definition
  site* `validate.js`, turning `isUuid` into an infinite self-recursion. A runtime
  smoke test caught it immediately; `validate.js` was restored from HEAD and
  excluded. **No consumer shipped against a broken `isUuid`.**
- **Verify:** `node --check` on all changed files (parse ✓), `npm run typecheck`
  (✓ 0 errors), runtime check of `isUuid` for valid/uppercase/invalid/null/empty.
- **Test fallout fixed:** `tests/api/security-csrf-gates.test.js` mocked
  `validate.js` exporting only `parse`, so handlers newly calling `isUuid` failed
  in that suite. Switched the mock to `importOriginal()` spread (more robust —
  future `validate.js` exports pass through). Suite back to **24/24 pass**.

### 5. Lint: unblock the sole eslint error (LOW) — `eslint.config.js`
- **Change:** ignore `scripts/wf-*.mjs` (saved Workflow-DSL scripts use top-level
  `return`/`await` and injected runtime globals — not standalone ES modules). This
  was the only blocking `error` in an otherwise warnings-only lint run.

## Deferred (documented, not changed this pass)

- **L1 — knip duplicate exports (9):** collapse `OPENAI_EMBED_TAG`,
  `src/shared/log.js`, `src/agent-protocol.js`, etc. to single export forms.
- **L2 — `workers/**` eslint warnings:** ~5k `no-console`/`no-empty`/unused-var,
  mostly intentional operational logging; triage rather than churn.
- **L3 — knip unused exports** in `packages/*` MCP libs: prune the genuinely-dead
  ones (several are intentional public API).

## Verification summary

| Gate | Result |
|---|---|
| `npm run typecheck` | ✓ 0 errors |
| `npx eslint . --quiet` (errors only) | ✓ 0 errors (was 1: the `wf-*.mjs` parse error) |
| `node --check` on every changed `.js` | ✓ all parse |
| `tests/api/http-params.test.js` (new) | ✓ 11/11 |
| `tests/api/security-csrf-gates.test.js` | ✓ 24/24 (was failing on the mock) |
| `tests/api` suite | ✓ all pass **except** 4 files owned by concurrent agents (below) |
| `vercel.json` / `data/changelog.json` | ✓ valid JSON; `npm run build:pages` clean |
| `isUuid` runtime smoke | ✓ valid/uppercase true; invalid/null/empty false |

### Pre-existing / concurrent-agent test failures (NOT from this pass)
Observed failing in `tests/api`, all on endpoints **not** in this pass's diff, with
signatures matching other agents' in-flight work (CSRF gates, avatar-GLB renames,
the `onchain.js` SSRF guard) — left for their owners:
`avatars-glb-proxy.test.js`, `api-developer-mcp-test.test.js`,
`avatar-og.test.js`, `purchase-as-agent.test.js` (e.g. every assertion there gets
a `403` from a CSRF gate before the handler logic runs).

## Concurrency note

This worktree was shared with other active agents during the audit. Only the
files listed above are part of this pass; unrelated in-flight changes
(`serverError` refactors, SSRF guard, avatar-GLB renames, changelog regen) belong
to other agents and were left untouched. Stage explicit paths when committing.
