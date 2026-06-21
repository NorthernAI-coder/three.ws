# B04 — Marketplace + detail + creator profiles production pass

> Phase B · Depends on: B03 (payment) · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
The marketplace is where supply (agents, skills, avatars) meets demand and where GMV — and
the platform's 50%-to-buyback revenue — is generated. It's already large and capable; this
pass closes the gaps that cost conversions and makes browsing → buying frictionless.

## Where this lives (real files)
- `src/marketplace.js` (~8.4k lines) + `src/marketplace-detail.js` — browse/search, fork, buy skills, creator profiles, live chat preview, ratings.
- `src/marketplace-analytics.js` (~197 lines) — stats (under-built).
- `src/payment-modal.js` — purchase.
- `api/` marketplace endpoints + `api/_lib/skill-license-onchain.js` — skill licenses.

## Current state & gaps
- Detail avatar can stay on an emoji placeholder if render fails; live chat preview (SSE) drops silently with no reconnect; creator-profile modal lacks a skeleton; mobile sidebar may not fully render <600px; skill-purchase → agent-chat handoff unverified; rating freshness/weighting undocumented.
- Analytics surface is thin (no clear chart lib, no "last updated," mobile axis overlap, generic error).

## Build this
1. **Detail integrity:** guarantee the 3D avatar renders or shows a designed fallback (never a stuck emoji); live chat preview reconnects with backoff + status; creator modal has a skeleton.
2. **Buy → use loop:** after purchasing a skill, the buyer lands in the agent with the skill active; show it in their collection (`/collection`). Verify the on-chain skill-license path end-to-end.
3. **Search/sort/filter:** URL-encode state so back/forward and sharing work; designed empty state for no results; pagination/infinite scroll without layout shift.
4. **Analytics rebuild:** real charts with a named lib, "updated Xm ago," CSV export, mobile-legible axes, and a fallback to cached history on API failure.
5. **Mobile + a11y:** sidebar/hamburger works <600px; cards keyboard-navigable; ratings accessible.

## Out of scope
- The payment modal internals (B03) — reuse them.

## Definition of done
- [ ] Detail avatar never stuck on placeholder; chat preview reconnects; creator modal skeleton.
- [ ] Purchase → skill active in agent → visible in collection, verified on-chain.
- [ ] Search/sort/filter state in the URL; empty state designed; no layout shift.
- [ ] Analytics shows real charts + last-updated + export, mobile-legible.
- [ ] `npx vitest run` green; changelog entry; committed + pushed to both remotes.

## Verify
- Buy a skill end-to-end; confirm it's usable + in `/collection`; share a filtered URL and reopen it.
