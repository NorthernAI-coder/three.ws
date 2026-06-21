# 35 — Referral & virality loops

> Part of **Production-Ready** (`prompts/production-ready/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 4 — Growth
**Owns:** sharing surfaces, OG image generation (`api/forge-og.js` + a general OG service), embeds, referral mechanics, public/embeddable artifacts.
**Depends on:** `14`, `17`, `24`, `30`, `33`. Pairs with `31`.

## Why this matters for $1B
Paid acquisition can't get you to $1B alone — viral loops (k-factor > sharing friction)
do. three.ws is unusually shareable: every output is a 3D model, an agent, a launch.
Engineering the loops so creations spread is the highest-leverage growth work.

## Mission
Make every creation effortlessly shareable and embeddable, with attribution that
pulls viewers back, plus referral mechanics that reward bringing others in.

## Do this
1. **Share everywhere:** every artifact (forged model, agent profile, scene, launch,
   marketplace listing) has a one-tap Share with a great destination URL, copy, and a
   real, dynamic OG/Twitter image (prompt `14`) that renders the actual 3D
   output. Verify cards on the major platforms.
2. **Embeds as a loop:** the `<agent-3d>`, walk companion, and page-agent embeds
   (prompt `24`) carry tasteful, non-spammy attribution back to three.ws — every embed
   on the web is a billboard. One-click "embed this" with copy-paste code.
3. **Dynamic OG image service:** a real endpoint that renders share images for agents/
   models/launches on the fly (extend `api/forge-og.js`; cached, fast, resilient —
   prompt `06`). No generic placeholder image.
4. **Referral mechanics:** a referral program where inviting a user who activates
   (prompt `30`) rewards both sides (credits toward paid lanes, etc. — accounted per
   prompt `26`). Track invites → signups → activations (prompt `33`). Abuse-guarded
   (prompt `08`).
5. **Built-in share prompts:** at the first-win moment (prompt `30`) and other natural
   peaks, invite the user to share — without being naggy. Make sharing feel good, not
   transactional.
6. **Public galleries:** the launches feed, a community/creations gallery, and agent
   directories are public, indexable (prompt `14`), and link inward — discovery
   surfaces that also pull SEO traffic.
7. **Measure k-factor:** instrument shares → visits → signups so the loop's
   coefficient is visible and improvable (prompt `33`).

## Must-not
- Do not ship a generic/static OG image where a dynamic one belongs.
- Do not make embeds spammy or attribution obnoxious — tasteful only.
- Do not allow self-referral/abuse to drain rewards (guard it).
- Do not reference any coin other than $THREE in share copy.

## Acceptance
- [ ] Every artifact has one-tap share with great copy + dynamic 3D OG image (cards validated).
- [ ] Embeds carry tasteful inbound attribution; one-click embed-code copy.
- [ ] Real, cached, resilient dynamic OG-image service (no placeholders).
- [ ] Referral program rewards both sides on activation; tracked + abuse-guarded.
- [ ] First-win + peak-moment share prompts (non-naggy).
- [ ] Public indexable galleries that link inward.
- [ ] Share→visit→signup instrumented; k-factor visible.
