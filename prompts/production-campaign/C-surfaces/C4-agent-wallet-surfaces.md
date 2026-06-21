# C4 — Agent & wallet surfaces to the bar

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:**
Track A reliability green (wallet/RPC error states it produces render here).

## Why this matters for $1B

This is the **logged-in home** — the wallet, the dashboard, the agents a user owns and earns
from. It's the surface a returning user sees daily, so it carries the **retention** and
**trust-with-money** pillars at once. A dashboard that shows a blank balance while RPC warms,
an agent list that's empty with no "create your first agent" path, or an edit form that loses
work on a network blip will quietly bleed the daily-active users a $1B valuation is built on.
The logged-in surface must feel as considered as the marketing pages — more, because this is
where money actually moves.

## Surfaces in scope (the real pages)

- **Agent wallet:** `pages/agent-wallet.html` → `src/agent-wallet.js`, `src/agent-wallet/`,
  `src/agent-wallet-hub/`; chat variant `pages/avatar-wallet-chat.html`
- **Dashboard:** `pages/dashboard-next/index.html` (`/dashboard`) → `src/dashboard/`,
  `src/dashboard-next/`; tabs: `dashboard-next/portfolio.html`, `holders.html`,
  `referrals.html`, `monetize.html`, `analytics.html` (audit the dashboard shell + its tabs)
- **Account:** `pages/dashboard-next/account.html` (`/dashboard/account`)
- **My agents:** `pages/dashboard-next/agents.html` (`/dashboard/agents`)
- **Agent detail / edit:** `pages/agent-detail.html` → `src/agent-detail.js`,
  `src/agent-detail-market.js`; `pages/agent-edit.html`
- **Agent economy / exchange / trade:** `pages/agent-economy.html` → `src/agent-economy.js`;
  `pages/agent-exchange.html` → `src/agent-exchange.js`; `pages/agent-trade.html` →
  `src/agent-trade.js`
- Data sources: `api/agents/*` (solana register/card/reputation/skills),
  `api/agents/[id]/*`, wallet/balance endpoints, `api/discover-detail.js`.

## Current state (read before you write)

These pages render real wallet balances, agent metadata, and economy data. The gaps to find:
**balance/portfolio loading** that shows `0` or blank before RPC resolves (must skeleton, then
show real value); **empty agent list** with no onboarding path ("create your first agent");
**edit forms** with no dirty-state guard, no inline validation, and no save-failure recovery;
**error states** that swallow an RPC/API failure. Audit **overflow**: a wallet with $0 and one
with $10M, an agent with a 200-char name, a portfolio of 1000 holdings, an account with no
connected wallet at all.

## Your mission

### 1. Audit every surface for the five states — auth-aware
**Loading** = skeletons for balance, portfolio, agent cards (no flash of `0`). **Empty** =
designed onboarding: no agents → "create your first agent" with a CTA into the studio; no
wallet → a clear connect/claim path. **Error** = names the failure (RPC down, save failed) and
recovers. **Populated** = token-consistent, with microinteractions. **Overflow** = $0/$10M
formatting, long names, big portfolios, the not-signed-in state on every gated surface.

### 2. Harden the edit/account forms
`agent-edit` and `account` get real inline validation at the boundary, a dirty-state guard
(warn before navigating away from unsaved edits), an honest saving → saved → failed state
machine wired to the real API, and a save-failure path that preserves the user's input. No
silent loss of work.

### 3. Wallet & economy correctness in the UI
Balances, P&L, and economy numbers format correctly across the full range ($0 → $10M),
show their source-freshness, and never display a stale value as live. The not-signed-in state
on every gated surface routes to auth, not a blank page.

### 4. Mobile, a11y, microinteractions
Dashboard, wallet, and detail layouts work at **320 / 768 / 1440px** (cards stack, tables
reflow or scroll). Forms and tab navigation are fully keyboard-operable with labelled inputs
and visible focus rings; balance updates announced via `aria-live`. Honor
`prefers-reduced-motion`. Hover/active/focus on every control.

### 5. Dead-path elimination + design tokens
Every dashboard tab, agent CTA, and wallet action does something real. Replace hardcoded
colors/spacing/fonts with `public/tokens.css` tokens. Wire cross-links: an owned agent →
its public profile/detail; the economy → the exchange/trade surface; account → claim/SNS.

## Definition of done

Clears `00b-the-bar.md` §3 (five states, responsive, a11y), §1 (no fund-related action
without an honest failure state), §4 (inputs validated at the boundary). Inherits the
**global definition of done** in `00-README-orchestration.md`: real APIs only, `$THREE` the
only coin, tokens only, verified in a browser at `npm run dev` (signed-in and signed-out) with
zero console errors from your code and real network calls, existing tests pass (auth/wallet
paths covered). State which bars you cleared and how you verified each.

## Operating rules (override defaults)

No mocks / fake data / placeholders / TODOs / stubs / sample arrays. `$THREE`
(`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) is the only coin — agent launch history and
the economy render runtime user-launched mints and are the sole mechanical exception per
`CLAUDE.md`. Design tokens only (`public/tokens.css`). Stage explicit paths only (never
`git add -A`); check `head -1` of any `api/*.js` you touch for the `__defProp` bundle trap.
Own **only the pages listed here**; extend, don't rewrite, the shared nav/tokens.

## When finished

Run `CLAUDE.md`'s five self-review checks. Ship one improvement (e.g. a dirty-state guard
shared by all forms, a unified $0/$10M number formatter, or a one-click "create your first
agent" empty state on `/dashboard/agents`). Append a holder-readable `data/changelog.json`
entry if user-visible (`npm run build:pages` to validate). Then delete this prompt file
(`prompts/production-campaign/C-surfaces/C4-agent-wallet-surfaces.md`) and report what you
shipped, which bars you cleared and how you verified them, and any seam for the next agent.
