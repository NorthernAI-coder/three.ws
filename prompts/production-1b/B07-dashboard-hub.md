# B07 — Dashboard hub + account + analytics + API keys production pass

> Phase B · Depends on: B06 · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
The dashboard is where a user manages agents, avatars, payments, API keys, MCP servers,
and monetization — the cockpit that turns a casual user into a power user and a payer.
Make every panel real, actionable, and consistent.

## Where this lives (real files)
- `src/dashboard/` — dashboard shell + panels (account, analytics, API keys, MCP, monetization, billing).
- `pages/dashboard*.html`, `data/pages.json` — routes incl. `/dashboard/three-token`, `/dashboard/holders`, `/dashboard/account`, `/dashboard/analytics`.
- `api/` — keys, usage, billing, MCP registration endpoints.

## Current state & gaps
- Multi-tab/state sync unclear; API-key rotation UX; billing/usage export; MCP server registration wizard; mobile nested-tab navigation.

## Build this
1. **Every panel complete:** agents/avatars list with real actions (edit, delete-with-confirm, archive); each panel has loading/empty/error/populated states and a helpful empty state that drives the next action.
2. **API keys:** create/rotate/revoke with clear one-time-reveal, scopes, last-used, and copy affordance; never re-expose a secret.
3. **Analytics:** real API-call volume + x402 spend + per-agent breakdowns, with date range, CSV export, and "updated Xm ago."
4. **Monetization/billing:** show earnings (from skills/x402/reflections), payout history with Solscan links, and pricing controls; everything reconciles with the on-chain ledger.
5. **MCP registration:** a guided flow to register/list MCP servers tied to the account.
6. **Consistency + mobile + a11y:** shared layout/tokens; nested tabs navigable on mobile; keyboard + focus management.

## Out of scope
- The token economy dashboard (A05) — link to it.

## Definition of done
- [ ] Every panel has all states + real actions; destructive actions confirm.
- [ ] API keys rotate safely; analytics export works; billing reconciles with on-chain data.
- [ ] MCP registration works; mobile nav + a11y verified; no console errors.
- [ ] `npx vitest run` green; changelog entry; committed + pushed to both remotes.

## Verify
- Rotate an API key and confirm the old one stops working; export analytics CSV; register an MCP server; navigate every tab on mobile.
