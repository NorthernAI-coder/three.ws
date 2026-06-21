# 36 — Trust, safety & moderation

> Part of **Production-Ready** (`prompts/production-ready/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 4 — Growth
**Owns:** content moderation for user generations (text prompts, images, avatars, names, listings), reporting/abuse handling, moderation tooling.
**Depends on:** `07`, `08`, `16`. Pairs with `37`.

## Why this matters for $1B
A platform where anyone generates 3D content from arbitrary prompts and lists it for
sale will attract abuse. Unmoderated abuse kills app-store distribution, payment-
processor relationships, brand, and enterprise deals. Trust & safety is a
prerequisite for scale, not an afterthought.

## Mission
Prevent, detect, and act on harmful content across every user-generated surface, with
clear policies, real moderation tooling, and user reporting — without crushing
legitimate creation.

## Map
- UGC surfaces: forge prompts/images (prompt `15`), avatars/names (prompt `21`),
  marketplace listings (prompt `16`), agent bios, communities, scenes, launch metadata.

## Do this
1. **Policy:** write clear, public content guidelines + acceptable-use policy (what's
   not allowed: illegal content, CSAM, hate, harassment, impersonation, IP theft,
   scams). Link in footer + onboarding (coordinate with prompt `37`).
2. **Input moderation:** screen generation prompts and uploaded images before
   generation (a vetted moderation API / classifier) and block disallowed requests
   with a clear, non-leaky message. Screen names/handles/bios/listing text for slurs/
   scams/impersonation.
3. **Output moderation:** scan generated images/models and listing media; quarantine
   or block violations; keep an audit trail.
4. **Reporting:** a real "report" flow on every public artifact (agent, listing,
   scene, launch, community post) that creates a triage-able case.
5. **Moderation tooling:** an internal queue/dashboard to review reports + flagged
   content, take action (warn/remove/ban), and record decisions. Role-gated (prompt
   `07`).
6. **Enforcement:** graduated actions (content removal, rate-limit, suspension, ban)
   with user notification and an appeal path. Tie repeat abuse to the rate-limit/abuse
   system (prompt `08`).
7. **Impersonation & scams:** specific guards for fake "official" agents/launches and
   $THREE-impersonation scams; verified badges where appropriate. Reinforce the
   one-coin rule (prompt `22`) — no other coin is ever promoted.
8. **CSAM/illegal escalation:** a documented, legally-aware escalation path (preserve
   evidence, report to authorities/NCMEC as required) — never just silently delete.

## Must-not
- Do not ship UGC surfaces with no moderation or no reporting.
- Do not let moderation messages leak internal details or the exact classifier rules.
- Do not over-block legitimate creation — tune for precision + appeal.
- Do not allow impersonation of three.ws/$THREE or promotion of other coins.

## Acceptance
- [ ] Public content guidelines + AUP, linked in footer + onboarding.
- [ ] Input (prompt/image/name) + output (model/media) moderation with clear blocks + audit trail.
- [ ] Report flow on every public artifact creating triage-able cases.
- [ ] Role-gated moderation queue/dashboard with action logging.
- [ ] Graduated enforcement + notification + appeal, tied to abuse system.
- [ ] Impersonation/scam guards; one-coin rule reinforced.
- [ ] Documented CSAM/illegal escalation path.
