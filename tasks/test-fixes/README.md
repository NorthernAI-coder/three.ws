# Test-fix task prompts

Generated from a full `npx vitest run` — **28 failing test files**. Each `.md` here is a self-contained prompt to fix one file; hand them to agents (one per file) and they can run in parallel.

## Rules for every task
- Fix the root cause; never `.skip`, delete, or weaken a test to go green.
- Real implementations only (no mocks/fake data in source) — see `CLAUDE.md`.
- **$THREE is the only coin.**
- Stage explicit paths only; concurrent agents share this worktree.

## Files

| # | Task | Failing | Top error |
| - | ---- | ------- | --------- |
| 01 | [tests/agent-commerce.test.js](./01-agent-commerce.md) | 1/28 | AssertionError: expected '$0.001000' to be '$0.001' // Object.is equality |
| 02 | [tests/agora-humans.test.js](./02-agora-humans.md) | 0/— | Failed to resolve entry for package "@three-ws/solana-agent". The package may have incorre |
| 03 | [tests/api-agent-memory.test.js](./03-api-agent-memory.md) | 2/26 | Error: [vitest] No "isDbUnavailableError" export is defined on the "../api/_lib/db.js" moc |
| 04 | [tests/api/agent-memory.test.js](./04-api-agent-memory.md) | 1/22 | AssertionError: expected undefined to be defined |
| 05 | [tests/api/agent-subscription-tiers.test.js](./05-api-agent-subscription-tiers.md) | 2/24 | Error: [vitest] No "isDbUnavailableError" export is defined on the "../../api/_lib/db.js"  |
| 06 | [tests/api/all-modules-load.test.js](./06-api-all-modules-load.md) | 19/841 | Error: Failed to resolve entry for package "@nirholas/pump-sdk". The package may have inco |
| 07 | [tests/api/forge-credit-exhaustion-rescue.test.js](./07-api-forge-credit-exhaustion-rescue.md) | 1/2 | AssertionError: expected "vi.fn()" to be called at least once |
| 08 | [tests/api/mcp-3d-challenge.test.js](./08-api-mcp-3d-challenge.md) | 7/15 | TypeError: Cannot read properties of undefined (reading 'url') |
| 09 | [tests/api/mcp.test.js](./09-api-mcp.md) | 1/22 | Error: [vitest] No "isDbUnavailableError" export is defined on the "../../api/_lib/db.js"  |
| 10 | [tests/api/security-csrf-gates.test.js](./10-api-security-csrf-gates.md) | 0/— | Failed to resolve entry for package "@nirholas/pump-sdk". The package may have incorrect m |
| 11 | [tests/api/skill-mint.test.js](./11-api-skill-mint.md) | 2/11 | Error: [vitest] No "isDbUnavailableError" export is defined on the "../../api/_lib/db.js"  |
| 12 | [tests/api/widgets.test.js](./12-api-widgets.md) | 1/42 | Error: [vitest] No "isDbUnavailableError" export is defined on the "../../api/_lib/db.js"  |
| 13 | [tests/api/x402-discovery-green.test.js](./13-api-x402-discovery-green.md) | 2/4 | AssertionError: Resources with listing-quality warnings: |
| 14 | [tests/api/x402-discovery-parity.test.js](./14-api-x402-discovery-parity.md) | 1/4 | AssertionError: Paid x402 endpoints missing from /.well-known/x402-discovery: /api/x402/an |
| 15 | [tests/api/x402-gas-sponsoring.test.js](./15-api-x402-gas-sponsoring.md) | 3/5 | TypeError: Cannot read properties of undefined (reading 'eip2612GasSponsoring') |
| 16 | [tests/auto-rig-completion.test.js](./16-auto-rig-completion.md) | 3/5 | AssertionError: expected +0 to be 1 // Object.is equality |
| 17 | [tests/branding.test.js](./17-branding.md) | 4/4 | Error: Forbidden brand "Avaturn" found in 29 user-facing location(s): |
| 18 | [tests/embodiment-controller.test.js](./18-embodiment-controller.md) | 0/— | Cannot find module '../src/embodiment/controller.js' imported from /workspaces/three.ws/te |
| 19 | [tests/embodiment-face-expression.test.js](./19-embodiment-face-expression.md) | 0/— | Cannot find module '../src/embodiment/face-expression.js' imported from /workspaces/three. |
| 20 | [tests/embodiment-rig-mode.test.js](./20-embodiment-rig-mode.md) | 0/— | Cannot find module '../src/embodiment/rig-mode.js' imported from /workspaces/three.ws/test |
| 21 | [tests/embodiment-text-visemes.test.js](./21-embodiment-text-visemes.md) | 0/— | Cannot find module '../src/embodiment/text-visemes.js' imported from /workspaces/three.ws/ |
| 22 | [tests/mcp-auth-challenge.test.js](./22-mcp-auth-challenge.md) | 1/6 | AssertionError: expected undefined to be defined |
| 23 | [tests/mcp-forge-free.test.js](./23-mcp-forge-free.md) | 1/7 | AssertionError: expected 'provider_error' to be 'rate_limited' // Object.is equality |
| 24 | [tests/metering.test.js](./24-metering.md) | 1/11 | TypeError: __vite_ssr_import_0__.vi.dontMock is not a function |
| 25 | [tests/monetization-service.test.js](./25-monetization-service.md) | 1/41 | Error: [vitest] No "isDbUnavailableError" export is defined on the "../api/_lib/db.js" moc |
| 26 | [tests/oracle/sources-assemble.test.js](./26-oracle-sources-assemble.md) | 1/2 | Error: db query exceeded 15000ms deadline |
| 27 | [tests/signal-engine.test.js](./27-signal-engine.md) | 0/— | Failed to resolve entry for package "@nirholas/pump-sdk". The package may have incorrect m |
| 28 | [tests/walk-gestures.test.js](./28-walk-gestures.md) | 3/5 | AssertionError: expected [ 'dance', 'jog', 'sit', 'talking' ] to deeply equal [ 'dance', ' |

## Verify the whole batch is fixed
```bash
npx vitest run
```
Target: **0 failed**. (At authoring time: 58 failed across these 28 files; 9709 passing.)
