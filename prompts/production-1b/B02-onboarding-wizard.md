# B02 — Onboarding / Get Started wizard production pass

> Phase B · Depends on: none · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
`/start` is the funnel: avatar → name/brain → skills → deploy → earn. Every drop-off here
is a lost user and lost lifetime revenue. Make the wizard bulletproof, fast, and
confidence-inspiring so a first-time visitor reaches a deployed, earning agent without
hitting a single dead end.

## Where this lives (real files)
- `src/start.js` (~836 lines) — the 5-step wizard; persists to sessionStorage.
- `src/create-agent.js` — the fuller create flow (reconcile shared steps).
- Avatar sources: `src/forge.js`, scan, gallery; identity/deploy: `api/_lib/onchain-deploy.js`.
- Auth: `src/wallet-auth.js`; payment: `src/payment-modal.js`.

## Current state & gaps
- Thin loading states (only ~1), avatar upload/generation errors not explicitly handled, no skill-selection validation, no pre-deploy wallet check, no post-deploy next-step.

## Build this
1. **Resilient steps:** every step has loading/empty/error states; avatar generation/upload failures offer retry or an alternate source; skill selection validates dependencies/conflicts.
2. **Guard the deploy:** require a connected wallet (or guest-to-wallet upgrade) before the deploy step; show exactly what deploy costs and what the user gets.
3. **Resumable:** persist progress (already sessionStorage) and let a returning user resume; never lose entered data on reload or error.
4. **Post-deploy success:** a designed success state with the live agent link, embed snippet, "list on marketplace," and "fund/earn" next steps — turn completion into the next action.
5. **Instrumentation:** fire funnel events at each step (entered/completed/abandoned) so drop-off is measurable (ties into G06).
6. **A11y + mobile:** keyboard-navigable steps, focus management on step change, perfect at 320px.

## Out of scope
- Rebuilding the avatar generator (B05) or auth (B06) — wire to them.

## Definition of done
- [ ] Every step has all states; no path can dead-end; reload/resume preserves state.
- [ ] Deploy is gated on wallet + clear cost; success state offers real next actions.
- [ ] Funnel events fire; a11y + mobile verified; no console errors.
- [ ] `npx vitest run` green; changelog entry; committed + pushed to both remotes.

## Verify
- Complete the wizard end-to-end as a brand-new user on desktop + 320px; deploy a real agent; abandon mid-way and resume.
