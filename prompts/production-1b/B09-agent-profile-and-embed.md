# B09 — Agent profile pages + embeddable widget production pass

> Phase B · Depends on: A10 (reputation) optional · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
Agent profiles are the platform's shareable unit — the link that spreads on social, the
embed that lives on other sites. Every profile is a billboard and a storefront. Make them
load fast, render the 3D agent flawlessly, convert to chat/buy, and embed anywhere.

## Where this lives (real files)
- `src/agent-detail.js` (~2.1k lines), `src/agent-home.js`, `src/agent-detail-market.js`, `src/agent-embed-modal.js`.
- `avatar-sdk/` (`<agent-3d>` web component), `page-agent-sdk/`.
- OG: `api/agent-og.js`, `api/a-og.js`; identity: `contracts/`, ERC-8004/Solana badges.

## Current state & gaps
- On-chain identity badges load async and can show a placeholder; embed code needs cross-browser verification; fork semantics (does it copy memory/skills?) undocumented; private-agent access shows ambiguous 404 vs no-access.

## Build this
1. **Flawless render:** the 3D agent loads with a skeleton then renders, or a designed fallback — never a stuck placeholder; identity badges resolve without layout shift.
2. **Convert:** prominent chat + buy/fork CTAs; show reputation (A10) and launch history; "powered by three.ws" embed builder that produces a working snippet, tested on a real third-party page.
3. **Fork/remix clarity:** state exactly what a fork copies (body/brain/skills/memory) and complete the flow end-to-end.
4. **Access control:** private agents return a clear "no access / sign in" state, not a bare 404; public ones are crawlable.
5. **Dynamic OG:** per-agent OG image (avatar + name + stats) so shares look great.
6. **Perf + a11y + mobile:** lazy-load 3D, `prefers-reduced-motion`, semantic structure, 320px.

## Out of scope
- Reputation scoring (A10) — display it.

## Definition of done
- [ ] 3D render + badges never stick on placeholder; embed snippet works on an external page across Chrome/Safari/Firefox.
- [ ] Chat/buy/fork CTAs work; fork copies the documented set; private access state is clear.
- [ ] Dynamic OG renders; Lighthouse a11y ≥95; mobile verified.
- [ ] `npx vitest run` green; changelog entry; committed + pushed to both remotes.

## Verify
- Open a profile, chat, fork; paste the embed on a scratch HTML page and confirm it loads; share the URL and check the OG preview.
