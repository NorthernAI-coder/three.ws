# Task 07 — Embeddable Wallet: the portable monetization primitive

> Read [00-README-orchestration.md](./00-README-orchestration.md) in full first
> (ownership model, $THREE law, real APIs, design system, run loop, worktree rules).

## Mission (one line)

Make an agent's wallet a **drop-in widget + SDK** that works on *any* external site —
so every embedded avatar becomes a real tip / pay / x402 surface, and three.ws's
wallet layer spreads across the web.

## Why this is gamechanging

The avatar SDK already lets anyone embed a three.ws agent on their blog, store, or
docs. If that embed can also **receive tips and accept x402 payments** — with a real,
non-custodial visitor flow and the correct one-agent-one-owner rules — then every
embed is a monetization endpoint and a fork-to-own funnel. Creators embed their agent
everywhere; each placement earns and recruits. No wallet ships as a portable,
agent-branded payment primitive you paste into a `<script>` tag. The screenshot
moment: a creator's personal site with their glowing agent and a working "Tip ◎"
button that actually settles on Solana.

## What you are building

1. **Embeddable wallet in the avatar web component** — extend the existing
   `<threews-avatar>` / `agent-3d` component and the `avatar-sdk/` package so an
   embed can opt into a wallet affordance: the public address + balance, **Tip**
   (non-custodial, visitor's own wallet), **Pay · x402**, and **Fork/Open on
   three.ws**. Attributes/props to control which actions show. Default off; explicit
   opt-in (`wallet`, `tip`, `pay` attrs) so existing embeds don't change unexpectedly.
2. **A framework-agnostic SDK surface** — update the React wrapper (`avatar-sdk/
   src/react.jsx`) and vanilla entry so devs get typed props for the wallet, plus a
   tiny headless API (`mountAgentTip(el, { agentId })`) for custom UIs. Document it.
3. **Cross-origin-safe money flow** — the visitor tip uses their browser wallet
   (Phantom/Backpack/Solflare) and submits through the public RPC proxy; x402 calls
   the agent's real service. CSRF/CORS handled correctly for cross-origin embeds;
   confirmations recorded via the real tip-record endpoint. **No secret ever ships to
   the embed.** Owner-only actions (withdraw, vanity, limits, strategies) are **never**
   exposed in an embed — embeds are visitor-context by definition.

## Real data & APIs

- Public reads: `GET /api/agents/:id/solana`, `/solana/holdings` (anon-safe, cached).
- Tip: the real non-custodial flow (`src/shared/agent-tip.js` logic, RPC proxy
  `/api/solana-rpc`), recorded via `POST /api/agents/:id/solana/tip`.
- Pay: `POST /api/x402-pay` semantics for the agent's service.
- Fork/open: deep-link to `/agent/:id` / fork on three.ws (auth happens there).
- Respect agent **visibility/embed-policy** (`/api/agents/:id/embed-policy`) — an
  owner who disables embedding/monetization must be honored server-side.
- $THREE by the CA in `00-README`.

## UX spec

- **States**: loading, no-wallet (show identity + Fork/Open only), populated (address
  + balance + actions), connecting wallet, signing, sending, confirmed, failed
  (recoverable), embedding-disabled (respect policy — render bare avatar).
- **Always visitor/logged-out context**: only Tip / Pay / Fork / Open. The widget can
  never present owner controls. Make the "this is someone's agent — fork to get your
  own" path obvious.
- **Microinteractions/a11y**: works in an iframe and as a custom element; keyboard +
  screen-reader operable; respects host page `prefers-reduced-motion`; the violet
  accent is themeable via a documented CSS var so it fits host sites.
- **Performance & footprint**: tiny core; lazy-load the wallet-adapter and tip modal
  only on first interaction; no heavy deps forced on the host page; SSR/no-JS shows a
  sensible link fallback.

## Edge cases

Cross-origin CSRF/CORS · host page CSP blocking wallet popups (detect + guide) · no
browser wallet installed (offer install / mobile deep link) · agent embedding
disabled by owner policy (respect it) · private/unlisted agent (no embed) · multiple
embeds on one page · RPC failure (balance "—", tip still attemptable) · mobile in-app
browsers · theming clashes with host CSS (scope styles).

## Definition of done

Meets the README DoD, plus: a real agent embedded on a separate origin shows a working
wallet, a **real** tip settles on-chain from a visitor's browser wallet and is
recorded, x402 pay works, owner controls are impossible to reach from the embed, embed
policy/visibility is honored server-side, the SDK + attributes are documented (and the
docs use only $THREE or a synthetic placeholder), and the core stays lightweight.

## Then: improve, then delete this file

Push it: a copy-paste snippet generator in the embed/widget studio, per-embed
attribution so creators see which placement earns, or a "tip goal" bar. Update
`data/changelog.json`. **Then delete this prompt file.**
</content>
