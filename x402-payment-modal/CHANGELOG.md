# Changelog

All notable changes to `@three-ws/x402-payment-modal` are documented here. This
project adheres to [Semantic Versioning](https://semver.org).

## Unreleased

### Changed

- **Host-neutral by default.** The modal now settles a 402 challenge from any
  origin with zero configuration and **USDC as the always-on default settlement
  asset**. Branding (`brand`) and ERC-8021 builder-code self-attribution
  (`builderCode`) now default to empty — the footer "Powered by" link is hidden
  until you set your own `brand`, and no builder code is echoed unless you opt in.
  `checkoutOrigin` still resolves to the script's own origin by default. Set any
  of these via `configure()` or `data-*` attributes.
- **Token model clarified.** USDC is the default token everywhere. The `THREE`
  token shortcut remains supported as an **optional, opt-in** convenience
  (`solanaAccept({ token: 'three' })`, `THREE_MINT`) — recognized on sight but
  never a default. Any SPL mint works the same way via an explicit `mint`.

## 1.2.0

Hardening pass for scale and a UX/accessibility overhaul.

### Fixed

- **Token-2022 mints now settle.** `prepareSolanaCheckout`
  hardcoded the legacy SPL Token program, so building a payment in a Token-2022
  mint threw `TokenInvalidAccountOwnerError`. The server now detects each mint's owning
  program (legacy vs Token-2022) and derives ATAs, the idempotent-create, and
  `transferChecked` against the right one.

### Added — wallets

- **Multi-wallet detection.** Solana now detects Phantom, Solflare, Backpack,
  Glow, and Coinbase Wallet (was Phantom-only); EVM uses **EIP-6963** multi-
  provider discovery (falling back to `window.ethereum[.providers]`) so a user
  with several wallets isn't stuck with whichever won the injection race. The
  connect screen lists every detected wallet; auto-connect only fires when
  exactly one is present.

### Added — developer experience

- **First-class React export** — `import { X402Button, useX402 } from
  '@three-ws/x402-payment-modal/react'`. `useX402()` exposes a
  `{ pay, status, result, error, reset, isPaying }` state machine; both are
  SSR-safe (the browser-only core is dynamically imported on first use). `react`
  is an optional peer dependency.

### Added — reliability & scale

- **RPC failover** — `prepareSolanaCheckout` / `handleCheckout` accept `rpcUrls`
  (and `devnetRpcUrls`); each is tried in order on a transient RPC error.
  Connections are reused per URL, and unset RPC now warns (the public RPC is a
  load footgun).
- **Faster, cheaper prepare** — the independent RPC reads (decimals, recipient
  ATA existence, blockhash) run in parallel; USDC/THREE/wSOL decimals + program
  are short-circuited; recipient-ATA existence and mint metadata are cached
  (LRU-bounded). Cluster-scoped caches survive RPC failover.
- **Resilient crypto-helper loading** — the on-demand `@solana/web3.js` /
  `@noble/hashes` import now falls back across multiple independent CDNs with a
  per-attempt timeout, and is pre-warmed when the modal opens. A single CDN
  outage no longer breaks Solana payments. Set `configure({ esm })` to self-host.
- **Idempotency key** — one key per payment, reused across every retry and "Try
  again", sent as `Idempotency-Key` so a re-sent payment settles at most once.
- Unexpected checkout failures are now logged (root cause) instead of collapsing
  silently into a generic 502; pass `options.logger` to route them.

### Added — UX, UI & accessibility

- **Design-token theming** — the full palette is exposed as `--x402-*` CSS custom
  properties. `configure({ theme: 'light'|'dark'|'auto', cssVars, brand: { logo } })`
  forces a color scheme, brand-matches tokens at runtime, and shows a header logo.
- **Accessibility** — focus trap + focus restore, `aria-live` step announcements,
  `:focus-visible` rings, `prefers-reduced-motion` support, and WCAG-AA contrast.
- **Polish** — crisp inline SVG icons (close, lock, wallet, success check),
  an animated success receipt, step cross-fade, shimmer skeletons during
  discovery, a mobile bottom-sheet layout with safe-area insets, humanized error
  copy (no internal step ids), an install-a-wallet hint when none is detected,
  a "you authorize exactly X — nothing more" trust line, and prose rendering for
  string results.

## 1.1.0

### Added

- **Multiple Solana tokens with a token picker.** When a 402 challenge offers
  more than one Solana token, the modal renders a token picker so the buyer
  chooses which to pay in; the headline price and the built transaction follow the
  choice. USDC is recognized by mint, and an optional `THREE` token shortcut is
  recognized too — correct symbol, decimals, and branding even when the `accept`
  omits `extra.name`/`extra.decimals`.
- **`solanaAccept()` server helper** — build a spec-shaped Solana `accept` from
  `token: 'usdc'` (or an explicit `mint`, or the optional `'three'` shortcut) with
  the price as `uiAmount` (human) or `amount` (atomic). Exports `USDC_MINT_SOLANA`,
  `THREE_MINT`, and `WELL_KNOWN_SOLANA_TOKENS`.
- **`window.X402.tokens`** + client exports `USDC_MINT_SOLANA`, `THREE_MINT`,
  `KNOWN_SOLANA_TOKENS` for inline merchants composing challenges in the browser.

### Notes

- A floating-price (non-stablecoin) token can't be dollar-denominated in the
  browser, so client-side spending caps apply to stablecoins (USDC) only — enforce
  other tokens' caps server-side. Settlement is unchanged — the checkout endpoint
  already transfers any SPL mint named by the chosen `accept`.

## 1.0.0

Initial public release: a standalone, dependency-free package.

### Added

- **Drop-in payment modal** for any x402 paid endpoint — declarative
  (`data-x402-endpoint` auto-binding) and programmatic (`pay()` / `window.X402`).
- **Solana payments** via Phantom (USDC), backed by the bundled checkout server
  helpers (`prepare` / `encode`).
- **EVM payments** via any injected wallet (Base USDC, EIP-3009
  `transferWithAuthorization`) — signed entirely in the browser, no server call.
- **SIWX (Sign-In-With-X / CAIP-122) re-entry** — wallets that already paid can
  sign in instead of paying again, with automatic fallback to the pay flow.
- **Client-side spending caps** — per-call / hourly / daily limits enforced in
  `localStorage`, with rollback on failure.
- **`configure()` + script-tag `data-*` config** for checkout origin, branding,
  builder-code attribution, and esm.sh CDN URLs.
- **Framework-agnostic server module** with Express and Vercel adapters
  (`@three-ws/x402-payment-modal/server`).
- **Theming** — light + automatic dark mode, all classes overridable, `--x402-z`
  z-index custom property.
- **Automatic 429 throttle retry** — re-sends the same signed payment up to twice
  while an upstream rate limit resets (no double charge; payment isn't settled
  until the merchant call succeeds).
- TypeScript definitions, full docs (`docs/`), tutorial, and runnable examples
  (plain HTML, React, Express).
