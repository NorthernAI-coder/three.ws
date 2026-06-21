# 38 — Referral & virality loops

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/production-1b/00-README.md`
> for shared context.

## Why this matters for $1B

Paid acquisition does not scale to a billion-dollar platform — loops do. Every
creation a user makes is a potential ad: a share card that lands in a feed, an
embedded `<agent-3d>` widget on someone else's site carrying a "made with three.ws"
mark, a referral link that pulls in the next builder. The platform already has
OG-image endpoints, embeddable web components, and a referral schema — this prompt
turns those scattered parts into closed, measurable viral loops.

## Mission

Make sharing a creation one click, make every shared/embedded artifact carry
attribution back to three.ws, and make the existing referral mechanics complete,
rewarding, and instrumented end-to-end.

## Map (trust but verify — files move)

- **Share cards (@vercel/og)** — [api/forge-og.js](../../api/forge-og.js),
  [api/avatar-og.js](../../api/avatar-og.js), [api/agent-og.js](../../api/agent-og.js),
  [api/agent-detail-og.js](../../api/agent-detail-og.js), [api/play-og.js](../../api/play-og.js),
  [api/trader-og.js](../../api/trader-og.js), [api/walk-og.js](../../api/walk-og.js),
  [api/page-og.js](../../api/page-og.js), [api/u-og.js](../../api/u-og.js).
- **Share UI** — [src/share-panel.js](../../src/share-panel.js),
  [src/share-panel-builders.js](../../src/share-panel-builders.js),
  [src/share-panel.css](../../src/share-panel.css),
  [src/pose-share.js](../../src/pose-share.js); server share endpoints
  [api/forge-share.js](../../api/forge-share.js), [api/agent-share.js](../../api/agent-share.js),
  [api/oracle-share.js](../../api/oracle-share.js).
- **Embeddable web components** — `<agent-3d>` in [src/element.js](../../src/element.js),
  `<agent-stage>` in [src/stage-element.js](../../src/stage-element.js); embed loaders
  [public/embed.js](../../public/embed.js), [public/embed/v1.js](../../public/embed/v1.js).
- **Referral mechanics** — [api/users/referrals.js](../../api/users/referrals.js),
  [api/users/referral-claim.js](../../api/users/referral-claim.js),
  [api/friends/index.js](../../api/friends/index.js), schema in
  [api/_lib/migrations/001_add_referrals.sql](../../api/_lib/migrations/001_add_referrals.sql).
- **"Made with three.ws" attribution** — search current usage in
  [src/avatar-page.js](../../src/avatar-page.js), [public/studio/studio.js](../../public/studio/studio.js).

## Do this

1. **One-click share on every creation surface** (Forge result, avatar page, agent
   profile, pose, oracle, walk). Use the Web Share API where available, with a copy-link
   + X/Telegram/Farcaster fallback. Wire the existing `share-panel.js` everywhere a
   creation is finished; no surface should dead-end without a share affordance.
2. **Verify every OG endpoint renders a real, branded card** for real entity IDs (not a
   1px or fallback image): correct title, creator, thumbnail, consistent brand. Fix any
   `*-og.js` that throws or renders an empty card; add the `og:`/`twitter:` meta tags on
   the shareable pages so the card actually appears when pasted into a social platform.
3. **Embed carries attribution.** Every `<agent-3d>` / `<agent-stage>` / iframe embed
   renders a subtle, non-intrusive "made with three.ws" mark that links back with a
   referral/UTM param. Confirm it survives the embed-strip build step and shows in a
   third-party iframe.
4. **Close the referral loop.** Audit `referrals.js` + `referral-claim.js`: a user gets
   a unique link, a new user arriving via it is attributed, the referrer is credited,
   and the reward is real (not a no-op). Build the user-facing referral UI (link, copy
   button, status: invited / joined / rewarded) if it's missing.
5. **Attribution params flow through.** Embed marks, share links, and referral links all
   set a consistent UTM/ref param; landing pages read it, persist it through signup, and
   credit the right referrer. No param dropped on redirect.
6. **Instrument the loop** so growth analytics (see prompt 36) can measure it: emit
   events for share-initiated, share-completed, embed-impression, referral-click,
   referral-signup. Use the existing analytics plumbing, not a new one.
7. **Design every state**: share success toast, copy-confirmed, share-unsupported
   fallback, referral empty state ("invite your first builder"), and rewarded state.
8. Run the relevant tests (`npx vitest run` over share/og/referral specs), add a
   `data/changelog.json` entry (tag `feature`) for the new sharing/referral UX, and
   `npm run build:pages`.

## Must-not

- Do not generate share cards or referral copy that reference any coin other than
  `$THREE`.
- Do not register a service worker from inside embeds, and do not strip the attribution
  mark — both must survive `scripts/strip-sw-from-embeds.mjs`.
- Do not fake referral rewards or counts; credit only real, verified signups.
- Do not break working OG routes; verify each renders before and after edits.
- No `setTimeout` fake share progress; real async only.

## Acceptance (all true before claiming done)

- [ ] Every creation surface (forge, avatar, agent, pose, oracle, walk) has working
      one-click share with a copy-link fallback.
- [ ] Every `*-og.js` renders a real branded card for real IDs; shareable pages carry
      `og:`/`twitter:` meta and preview correctly when pasted.
- [ ] Embeds show a "made with three.ws" mark linking back with a ref/UTM param,
      surviving the embed-strip build.
- [ ] Referral link → attributed signup → real reward works end-to-end with a
      user-facing referral UI (all states designed).
- [ ] Loop events are instrumented through the existing analytics layer.
- [ ] Tests pass; changelog updated; `npm run build:pages` clean.
