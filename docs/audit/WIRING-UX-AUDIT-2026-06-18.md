# three.ws — Wiring, UX & Boundary Audit (2026-06-18)

Companion to [2026-06-18-codebase-audit.md](./2026-06-18-codebase-audit.md)
(security / DRY / contracts) and
[PLATFORM-AUDIT-2026-06-18.md](./PLATFORM-AUDIT-2026-06-18.md) (build/test health,
branding, a11y). This pass focuses on a **disjoint** cluster those two did not
cover in depth: dead navigation paths, missing UI error states, shipped
"coming soon" placeholders, one stored-SSRF gap, a fire-and-forget custody-ledger
write, and the EVM payment-SDK zero-address guard.

Method: project audit tooling (`tsc` ✅, `eslint` ✅ exit 0, `audit:handlers` ✅,
`audit:pages` ✅) + three parallel deep-dive passes (api/workers, frontend,
SDK/MCP), each finding re-verified by hand against the real route map
(`vercel.json`, `vite.config.js`) and API surface before inclusion. No
foreign-coin references, leaked secrets, or SQL injection found.

## Findings & remediation

All items below are fixed in this pass unless marked otherwise.

### Dead navigation (route drift from classic → dashboard-next)

| # | File | Issue | Fix |
|---|---|---|---|
| F1 | `src/erc8004/deploy-button.js:414` | "View plans" → `/billing.html` (no such page) | → `/pricing.html` ✅ |
| F5 | `pages/app-next.html` | "Classic viewer" → `/app-classic` (no page/route) | → `/app` ✅ |
| F6 | `pages/aws-marketplace/welcome.html` | 3× links to `/api-keys` (no route) | → `/dashboard/api` ✅ |
| F9 | `pages/create-selfie.html` | `/dashboard/settings#api-keys` (anchor absent) | → `/dashboard/api` ✅ |
| B5 | `src/go.js:27` | `loadUser()` fetches `/api/me` (no handler) — account button never renders | → `/api/auth/me` (handled at `api/auth/[action].js:307`) ✅ |
| F14 | `src/dashboard/dashboard.js` | Audit claimed "dead code, delete." **Correction:** it is still imported by `public/dashboard/index.html:1502`, so it is NOT unreferenced. `/dashboard` is now served by dashboard-next (vercel→`/dashboard-next/index.html`), so the classic SPA is superseded at the canonical route but reachable directly. Deleting 6157 lines + the public page during the concurrent classic→next migration is unsafe and overlaps work the team owns. **Deferred** — surfaced, not removed. |

### Shipped "coming soon" placeholders (CLAUDE.md violations)

| # | File | Issue | Fix |
|---|---|---|---|
| F2 | `src/dashboard-next/pages/three-token.js:377` | Disabled "Claim — coming soon" button, no backing API | removed until distribution endpoint exists ✅ |
| F3 | `src/character-creator.js:276` | "unlock it in the shop (coming soon)" toast, no shop | premium chips hidden until shop ships ✅ |
| F4 | `src/dashboard-next/pages/developers.js` | Unity/Unreal cards render fake SDK code for SDKs that don't exist | replaced fake code with honest roadmap note ✅ |

`src/create.js` "video avatar coming soon" is a **correct runtime feature flag**
(`features.videoAvatar` off a real API, real `/create/video` page) — left as-is.

### Missing / broken UI states ("every state is designed")

| # | File | Issue | Fix |
|---|---|---|---|
| F7 | `src/agents-directory.js` | Primary discovery page renders blank grid on fetch failure | visible error + retry ✅ |
| F8 | `src/leaderboard.js` | Blank board on first-load failure | explicit error state + retry ✅ |
| F10 | `src/marketplace.js` | `loadPublicAvatars()` skeletons render forever on error | error state + flag flip ✅ |
| F11 | `src/bounties.js` | Load-more pagination failures silent | inline error on load-more failure ✅ |
| F12 | `src/communities.js` | Per-coin profile fetch fails silently | error message in coin-profile container ✅ |
| F13 | `src/collection.js` | No error state for subscription/collection lists | error banner + retry ✅ |

### Backend boundary hardening

| # | File | Issue | Fix |
|---|---|---|---|
| B1 | `api/widgets/[id]/[action].js` | Stored SSRF: `callCustomProxy` bare-fetches owner-supplied URL, bypassing `ssrf-guard` | routed through `fetchSafePublicUrlPinned` ✅ |
| B2 | `workers/agent-sniper/executor.js` | Fire-and-forget `recordSnipeSpend` can let daily custody cap be exceeded | spend recorded before success returns ✅ |
| B3 | `api/agents/solana/_handlers.js` | `catch {}` makes transient DB errors indistinguishable from "no data" | per-section `degraded` marker ✅ |
| B4 | `api/chat/models.js:31` | Unguarded `.json()` 500s instead of the file's own `{data:[]}` fallback | wrapped + falls back ✅ |
| B6 | `api/pump/helius-stats.js` | `catch {}` returns `sol_price: 0` indistinguishable from "unavailable" | logs + `stale` flag ✅ |

### SDK — agent-payments-sdk EVM path

| # | File | Issue | Fix |
|---|---|---|---|
| S1 | `agent-payments-sdk/src/evm/{addresses,EvmAgentOffline}.ts` | Contract resolves to zero address on all 6 chains, no guard → tx to `0x000…0` | constructor throws on zero-address contract ✅ |
| S2 | `agent-payments-sdk/src/evm/transaction.ts` | `eth_call` allowance read ignores `res.ok`/JSON-RPC `error` → cryptic `BigInt(undefined)` | checks `res.ok` + `json.error` ✅ |

## Out of scope here (owned by sibling audit docs / concurrent pass)

- Clickjacking `frame-ancestors` default, UUID-regex dedup, pagination-clamp
  helper, `IdentityRegistry.sol` `.transfer()` → handled in
  [2026-06-18-codebase-audit.md](./2026-06-18-codebase-audit.md).
- ESLint parse error, USDZ meshopt decoder, branding leaks, empty `llms.txt`,
  README CDN version, modal a11y → handled in
  [PLATFORM-AUDIT-2026-06-18.md](./PLATFORM-AUDIT-2026-06-18.md).
