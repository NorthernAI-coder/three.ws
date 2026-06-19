# Hygiene & SDK Remediation — 2026-06-18

Companion / execution record to the 2026-06-18 audit set produced in parallel:
[2026-06-18-codebase-audit.md](./2026-06-18-codebase-audit.md) (security / DRY /
contracts), [PLATFORM-AUDIT-2026-06-18.md](./PLATFORM-AUDIT-2026-06-18.md)
(build/test health), and [WIRING-UX-AUDIT-2026-06-18.md](./WIRING-UX-AUDIT-2026-06-18.md).
Those docs flag; this doc records what was actually **fixed** in the
repo-hygiene + published-SDK slice, with verification.

Scope was chosen to not collide with the concurrent `api/` remediation in this
shared worktree (a 58-file refactor was in flight). This pass touches only root
files, `agent-protocol-sdk/`, and `docs/`.

## Baseline health — green

Confirmed independently here (full detail in `PLATFORM-AUDIT-2026-06-18.md`):

| Check | Result |
|---|---|
| `audit:pages` | ✓ 103 routes audited, all 174 documented in `pages.json` |
| `audit:handlers` | ✓ all 872 API handlers export a body |
| `audit:mcp` | ✓ 14 MCP manifests consistent |
| `audit:deploy` | ✓ no committed symlinks, no unsatisfied peers, no undeclared api imports |
| `agent-protocol-sdk` tests | ✓ 9/9 (new this pass) |
| `$THREE`-only rule | ✓ no foreign-coin references in source, fixtures, or docs |

> Note: the full Vitest suite shows transient failures isolated to `tests/api/*`
> caused by the **in-flight `api/` refactor** by a concurrent agent — none touch
> any path changed in this pass (`agent-protocol-sdk/` tests pass standalone).

## Fixed in this pass

Scope was deliberately limited to paths **not** under concurrent edit. At audit
time another agent held a 58-file refactor across `api/`, so all `api/` and
`src/` product fixes are deferred to the backlog to avoid clobbering in-flight
work in this shared worktree.

### A. Repo-hygiene violations (CLAUDE.md "Repo hygiene")

1. **`club.mp3` (33 MB) tracked in repo root** — a byte-for-byte duplicate of
   the canonical `public/club/audio/club.mp3` that the app actually loads. The
   root copy is referenced by nothing. Removed from git: a 33 MB binary in the
   tree root is both a hygiene violation and clone-weight dead-weight.
2. **`inspect.mjs` tracked in repo root** — a throwaway Playwright snippet that
   navigates to `localhost:3000` and dumps shadow-DOM skeleton state. Exactly
   the "one-off inspection tool" the rules say belongs in `scripts/` or deleted.
   Removed.
3. **`player.html` tracked in repo root** — an unwired "Club · T.Pain" scratch
   page wired to no route, linked from nothing, that `fetch()`es
   `im-in-love-wit-a-stripper-fast.mp3` — a gitignored local file that does not
   exist in production, so the page is broken anywhere but the author's box.
   Removed.
4. **`im-in-love-wit-a-stripper-fast.mp3`** — gitignored local scratch audio
   (not tracked). Deleted from the working tree to clear clutter.

### B. Published-package polish

5. **`agent-protocol-sdk` had no `exports` map** — a published CommonJS package
   shipping `dist/index.js` with only `main`/`types`. Its siblings
   (`solana-agent-sdk`, `sdk`) declare `exports`. Added a non-breaking
   conditional `exports` map (types + require + default, plus `./package.json`)
   so modern resolvers and bundlers pick the right entry and the package can
   never accidentally expose unlisted internals.
6. **`agent-protocol-sdk` had zero tests** — added `agent-protocol-sdk/test/sdk.test.js`
   (node:test, mirroring `sdk/test`) plus `pretest`/`test` scripts. Nine cases
   cover the network-free public surface: the exported on-chain limits, a valid
   base58 program id, the `invoke_skill` IDL instruction, deterministic
   `deriveAgentPda` derivation against the `[b"agent", authority]` seeds + a
   custom program id, and `invokeSkill`'s client-side validation — including the
   subtle case that the skill-name limit is enforced in **bytes**, not
   `String#length` (a 20-emoji name is 40 UTF-16 units but 80 bytes → rejected).

## Backlog (prioritized)

### P1 — robustness / external-consumer quality

- **`api/pump-fun-mcp.js` (~L1030)** — `Buffer.from(decodeURIComponent(payload))`
  on a `data:` URI can throw `URIError` on malformed percent-encoding; wrap and
  return `rpcError(-32602)`. *(Deferred: `api/` under concurrent refactor.)*
- **Published SDKs without tests** — `agent-payments-sdk`, `agent-protocol-sdk`,
  `agent-ui-sdk`, `avatar-sdk`, `mcp-server` ship no test suite. Add smoke
  coverage for each public entry following `solana-agent-sdk/tests`.
- **Data-driven views without retry on fetch failure** — e.g.
  `src/marketplace-detail.js` renders "Loading…" but a mid-load API failure
  leaves no retry affordance. Standardize a load→error→retry pattern.
  *(Deferred: `src/` partly under concurrent edit.)*
- **`character-studio/` `no-undef` real bugs** — tracked in [ISSUES.md](../../ISSUES.md#1)
  (`testWallet`, `connection`, `ethereum`, `addChildAtFirst`, `network`,
  `optimized`, `index` referencing out-of-scope identifiers). Fix path-by-path
  with the feature exercised, then burn down `no-unused-vars`.

### P2 — accessibility / consistency

- **Non-button clickable `div`s with inline `onclick`** — `src/validation-ui.js`,
  `src/game/coincommunities-ui.js` (overlay close handlers). Convert to
  `<button>` or add `role="button"` + `tabindex` + keydown. *(Deferred: `src/`.)*
- **`mcp-bridge` has no `exports`/`types`** — acceptable: it is a CLI-only
  package (`bin` entry, no programmatic surface). No action unless it gains a
  library import path.
- **Orphaned `pages/*`** — a set of demo/legacy pages (`a-edit.html`,
  `avatar-studio-demo.html`, `bulk-launch.html`, `create-prompt.html`,
  `marketplace-analytics.html`, etc.) carry no inbound links. Decide per page:
  wire into nav, or remove. They are documented in `pages.json` so they do not
  fail `audit:pages`; this is a product-surface decision, not a bug.

### Verified NOT issues (don't "fix" these)

- **`api/agent-memory.js` anonymous → `{entries:[]}` (200, not 401)** —
  intentional and documented: public embeds boot this fetch on every page load;
  ownership is still enforced, no data leaks. Leave as-is.
- **Wrapped-SOL / USDC mint constants in `api/pump/*`** — legitimate bonding-curve
  quote-pair plumbing, not foreign-coin promotion. `$THREE` remains the only
  promoted coin.
- **Thin `api/pump/*` stub routes** — intentional delegators to the consolidated
  `[action]` handler, not incomplete code.
