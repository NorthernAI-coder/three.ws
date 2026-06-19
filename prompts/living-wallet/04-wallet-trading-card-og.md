# Task 04 — Wallet Trading Card + dynamic OG image

> Read [00-README-orchestration.md](./00-README-orchestration.md) in full first
> (ownership model, $THREE law, real APIs, design system, run loop, worktree rules).

## Mission (one line)

Give every agent wallet a **living, screenshot-worthy trading card** — identity,
vanity address, live P&L, holdings, reputation — and a **dynamic OG image** so it
spreads itself across social.

## Why this is gamechanging

Identity that travels is growth. A beautiful, Pokémon-card-grade artifact for an
agent's wallet — its avatar, its glowing vanity "license plate," its real P&L and
holdings, its reputation tier — is the thing people *want* to post. Each post is a
billboard with a fork-to-own CTA. No wallet has a shareable identity object; ours is
the avatar itself. The screenshot moment is the product.

## What you are building

1. **The card component** (`src/shared/wallet-card.js` or under the consolidated
   shared wallet module) — a self-contained, real-data card rendering: the 3D-or-
   portrait avatar (reuse Task 01's identity layer), agent name, vanity-highlighted
   address, a live balance/holdings summary, real P&L (where derivable from custody/
   trade history), reputation tier (Task 05, degrade gracefully if not landed yet),
   $THREE-holder mark, and a fork/tip CTA. Rarity/finish styling scales with the real
   wealth/reputation tier — tasteful, not casino.
2. **A dynamic OG endpoint** (`api/og/agent/[id].js` or similar, using the project's
   existing image/OG approach — grep first) that renders the card to an image from
   **real data** for link unfurls (X/Telegram/Discord). Cache sensibly; never bake in
   stale or fake numbers.
3. **Share affordances** — a "Share card" action on every agent profile/hub that
   copies the canonical URL (with correct OG tags) and offers one-tap share. Owner and
   visitor both can share; the card respects viewer role for any sensitive field
   (never expose owner-only data like custody specifics or limits — public card shows
   public holdings/identity only).

## Real data & APIs

- Identity/holdings/balance: the public reads (`/api/agents/:id`,
  `/solana`, `/solana/holdings`). P&L: derive from real trade/custody history
  (`/solana/trade-history`, `/solana/custody`) — owner-rich, public-card uses only
  public-safe aggregates. Reputation: `/api/agents/:id/reputation` + Task 05.
- Avatar art: the real GLB/thumbnail the platform already serves (R2 thumbnail keys,
  model-viewer poster). OG image must use a real rendered/portrait frame, not a
  placeholder.
- $THREE mark from the CA in `00-README`.

## UX spec

- **States**: loading (skeleton card), empty wallet (a clean "new agent" card that
  still looks good and invites funding/forking — never broken), populated, error
  (fall back to a minimal valid card, never a broken unfurl), overflow (truncate long
  names/addresses gracefully).
- **Viewer roles**: public card shows public identity + public holdings + tip/fork;
  owner sees an extra "share / customize what's shown" affordance; logged-out gets the
  public card + connect-on-action. No owner-only datum ever appears on a public card.
- **Microinteractions**: hover tilt/shine on the card (reduced-motion: static),
  copy-link confirmation, the vanity prefix/suffix in the emphasized accent.
- **Accessibility**: the card is real semantic content with alt text for the OG image;
  fully keyboard-shareable; the OG endpoint sets proper meta tags server-side.
- **Performance**: OG generation cached + cheap; the on-page card lazy-loads heavy 3D
  and shows the portrait first.

## Edge cases

No wallet / zero balance (still a valid, attractive card) · very long name/vanity ·
no reputation yet · OG cache staleness vs. freshness · social crawler with no JS
(server-rendered meta + image required) · private/unlisted agent (respect visibility —
no card for what shouldn't be public) · RPC failure (card renders identity, balance
shows "—", never fake).

## Definition of done

Meets the README DoD, plus: pasting an agent URL into X/Telegram/Discord unfurls a
real, correct, attractive card image generated from real data; the on-page card
matches; viewer roles are respected; private agents don't leak; nothing is faked or
stubbed; the OG endpoint re-checks visibility server-side.

## Then: improve, then delete this file

Push it: seasonal/holo finishes tied to real reputation milestones, a "card evolved"
moment when the agent crosses a tier, or wiring shares into Task 08's feed. Update
`data/changelog.json`. **Then delete this prompt file.**
</content>
