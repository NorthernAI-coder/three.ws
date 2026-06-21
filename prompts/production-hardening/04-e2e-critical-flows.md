# 04 · E2E coverage for critical user journeys

> **Phase 0 — Test confidence** · **Depends on:** 01 · **Parallel-safe:** yes · **Effort:** L

## Mission
Playwright today has ~10 specs with high fidelity but thin breadth, and 4 are quarantined
(`.skip`) because they need live DB/Redis/WebSocket. Cover the journeys that *make money or make
users stay* end-to-end, and unquarantine the skipped specs by giving them deterministic synthetic
backends instead of live dependencies.

## Context (read first)
- `CLAUDE.md`; `playwright.config.*`; `tests/e2e/*.spec.*`.
- Tested today: launch-token-flow, coin-buy-trade, create-agent-avatar, nav-auth.
- Quarantined (`.skip`): club (needs Redis), avatar-edit (needs WebSocket server), gallery-picker (needs live DB), galaxy (needs IBM agent discovery).
- Fidelity pattern in use: real Solana `Transaction` objects, real modal code, **route-layer** deterministic responses (not client rewrites). Keep that pattern.

## Build this
1. **New journeys** (add specs):
   - **Forge generation** — enter prompt → Generate (free lane) → model appears in viewer → download/share affordances work.
   - **x402 checkout → confirm → delivery** — full paid path with route-layer-deterministic payment + settlement; assert the artifact/credit is delivered.
   - **Avatar create → personalize → use** — create, edit, and land it somewhere it's consumed (profile/walk).
   - **Wallet connect → balance → gated action** — connect, read balance, attempt a $THREE-gated action.
2. **Unquarantine the 4 skips** by introducing deterministic fakes at the *infrastructure boundary only* (a synthetic Redis/WebSocket/DB stub the test owns) — never by mocking the product logic under test. If a flow truly cannot be made deterministic in CI, document precisely why in the spec and keep it in a separate `@manual` project, not silently skipped.
3. **CI wiring** — ensure `npm run test:e2e` runs the deterministic specs headless in CI; heavy/manual ones are a separate, non-blocking project.

## Files likely in play
`tests/e2e/forge-generate.spec.*` (new), `tests/e2e/x402-checkout.spec.*` (new), `tests/e2e/avatar-lifecycle.spec.*` (new), `tests/e2e/wallet-gating.spec.*` (new), the 4 quarantined specs, `playwright.config.*`, `.github/workflows`.

## Definition of done
- [ ] New specs pass headless, deterministically (3 reruns).
- [ ] Previously-skipped specs either run green with synthetic backends or are moved to a clearly-labeled `@manual` project with a documented reason (no silent `.skip`).
- [ ] `npm run test:e2e` green in CI config.
- [ ] No product logic mocked — only infra boundaries.
- [ ] Changelog: internal → **no** entry.

## Guardrails
Follow CLAUDE.md. Use the real CA or synthetic placeholders for any token in fixtures. Keep route-layer determinism; don't rewrite client code to make tests pass. Push both remotes.
