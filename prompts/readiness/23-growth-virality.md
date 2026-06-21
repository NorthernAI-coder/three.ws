# 23 — Growth & virality loops

**Phase 6. [parallel-safe]** with 22, 24–26.

## Where you are

`/workspaces/three.ws` — three.ws, 3D AI-agent platform. There's referral capture
(`public/referral-capture.js`), an embed SDK (`public/embed-sdk.js`,
`public/embed.js`), a walk companion SDK (`walk-sdk/`), a page-agent SDK
(`page-agent-sdk/`), and newsletter capture (`public/footer-newsletter.js`). Read
[CLAUDE.md](../../CLAUDE.md). The only coin is **$THREE**.

## Objective

Build and complete the loops that make growth compound: every created agent is
shareable and embeddable (each embed is an ad on someone else's site), referrals
are tracked and rewarded, and the product's natural artifacts (3D models,
profiles, launches) are designed to be shared. Close the loops that already half
-exist rather than inventing new ones.

## Why it matters

A $1B valuation requires a growth coefficient that doesn't depend on paid
acquisition. The embed SDK and walk companion are inherently viral — a three.ws
agent on a thousand other sites is a thousand acquisition surfaces. These loops
must be frictionless and instrumented, or the compounding never starts.

## Instructions

1. **Map existing loops and find the leaks.** For each: share-a-model,
   embed-an-agent, walk-companion-on-a-site, referral, launch-announcement —
   trace the full loop (trigger → artifact → recipient → return visit → reactivate)
   and find where it breaks or isn't instrumented.
2. **Embed = growth surface.** Make embedding an agent trivial: a one-click
   "Embed" with copy-paste snippet (the `<agent-3d>` / `<page-agent>` web
   components), live preview, and customization. Every embed should carry a
   subtle, non-obnoxious "Made with three.ws" attribution linking back (with a
   referral param). Verify the embed SDK actually works on a third-party page.
3. **Shareability.** Every agent/model/profile/launch has a prominent Share that
   produces a rich link (depends on [22 — OG images](22-seo-and-shareability.md))
   and pre-filled share text for X/Telegram/Discord. The generated 3D model is
   the hero of the share.
4. **Referrals, completed.** `referral-capture.js` captures inbound refs —
   confirm the full loop: attribution persists through signup, the referrer is
   credited, and there's a real, honest reward (in-product benefit; if anything
   token-related, it is **$THREE** only and must follow the coin rules). Build a
   simple "invite" surface with the user's ref link + their referral stats.
5. **Reactivation.** Newsletter + the existing Telegram changelog channel are
   reactivation channels — confirm capture works, double-opt-in where required,
   and that there's a reason to come back (new features, their agent's activity).
   No dark patterns.
6. **Instrument every loop** (coordinate with [25 — analytics](25-analytics-funnel.md)):
   share clicks, embed installs, embed impressions, referral signups, K-factor.
   You can't grow what you don't measure.
7. **Verify each loop end-to-end** with a real second browser/account: share a
   model and open the link, embed on a scratch HTML page and confirm it loads +
   attributes, sign up via a ref link and confirm credit.

## Definition of done

- [ ] One-click Embed with working snippet + live preview + back-link attribution;
      verified loading on a real third-party page.
- [ ] Every shareable entity has a prominent Share producing a rich link with
      pre-filled platform-appropriate text.
- [ ] Referral loop complete: capture → persist → signup attribution → referrer
      credit → invite surface with stats. Any reward is $THREE-only and
      rule-compliant.
- [ ] Reactivation channels (newsletter, Telegram) capture correctly with proper
      opt-in; no dark patterns.
- [ ] Every loop instrumented (share/embed/referral/K-factor) and visible in
      analytics.
- [ ] Each loop verified end-to-end with a second account/browser.
- [ ] `npm test` passes. Changelog: `feature` entry ("Share & embed your agents
      anywhere; invite friends").
