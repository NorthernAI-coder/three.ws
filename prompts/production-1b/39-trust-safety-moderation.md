# 39 — Trust, safety & moderation

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/production-1b/00-README.md`
> for shared context.

## Why this matters for $1B

A platform where anyone can generate and upload 3D content, avatars, and text is one
NSFW front-page screenshot away from losing app-store listings, payment processors,
and press goodwill. Brands, the chains we integrate with, and the press logos in our
footer all need to trust that three.ws is safe by default. Trust & safety is not a
cost center at scale — it is the license to operate.

## Mission

Gate every generation and upload path through content moderation, give users real
report/abuse flows, and back it all with rate-limited anti-spam — so unsafe content
is caught before it ships and removable after.

## Map (trust but verify — files move)

- **Text moderation** — [api/_lib/moderation.js](../../api/_lib/moderation.js)
  (`moderateAnonInput`, `moderationEnabled`, `parseVerdict`, `refusalReply`).
- **Image/vision moderation** — [api/_lib/vision.js](../../api/_lib/vision.js)
  (`describeImage`, `describeImageJson`, `visionConfigured`, `assertSafeImageUrl`).
- **Current call sites** — moderation is already used in [api/chat.js](../../api/chat.js),
  [api/brain/chat.js](../../api/brain/chat.js), [api/pump/[action].js](../../api/pump/[action].js),
  [api/widgets/[id]/[action].js](../../api/widgets/[id]/[action].js),
  [api/sns-subdomain.js](../../api/sns-subdomain.js), [api/wk.js](../../api/wk.js);
  vision in [api/ibm/vision.js](../../api/ibm/vision.js). Generation entry:
  [api/forge.js](../../api/forge.js), avatar reconstruct in [api/avatars/](../../api/avatars).
- **Rate limiting** — [api/_lib/rate-limit.js](../../api/_lib/rate-limit.js).
- **Alt-text / description helpers** — [api/_lib/avatar-alt-text.js](../../api/_lib/avatar-alt-text.js)
  (uses vision; a hook point for upload-time checks).

## Do this

1. **Map every user-generated input path**: text→3D prompts, text→avatar prompts,
   selfie/image uploads, image→3D, agent chat, page text, marketplace listings,
   usernames/SNS subdomains. For each, confirm whether moderation/vision is applied —
   build a coverage table.
2. **Close the gaps on generation.** Every prompt-driven generation (forge, avatars)
   must run text through `moderateAnonInput` before spending compute; block disallowed
   prompts with `refusalReply()`-style neutral copy (no echo of the unsafe text).
3. **Gate uploads.** Every selfie/image upload and image→3D path runs through
   `vision.js` NSFW/safety checks before reconstruction; reject unsafe images with a
   clear, non-judgmental message and no provider internals leaked.
4. **Fail safe, not open.** When a moderation provider is unconfigured or errors,
   decide the policy explicitly per surface (block vs. allow-with-flag) — never silently
   skip the check on a public generation path. Use the existing cockatiel resilience
   helper for provider calls.
5. **Report/abuse flow.** Add a "Report" affordance on user-facing content (avatars,
   agents, marketplace listings, embedded pages) that writes to a real moderation queue
   (a table + `api/` handler), captures reporter, target, and reason, and rate-limits
   submissions. No client-only fake report.
6. **Takedown path.** Reported/flagged content must be hideable/removable: a real admin
   action that sets a moderation status which the public surfaces respect (hidden content
   404s or shows a removed-content state).
7. **Anti-spam.** Apply `rate-limit.js` to generation, upload, report, and any unauthenticated
   write path so a single client can't flood the platform. Tune limits per surface; return
   a proper 429 with a designed retry message.
8. Run `npx vitest run` over moderation/vision/rate-limit specs (add cases for
   NSFW-blocked, unconfigured-provider, and over-limit). Note any policy-visible change in
   `data/changelog.json` (tag `security`) and `npm run build:pages`.

## Must-not

- Do not echo the unsafe user input back in any error, log line shown to the user, or
  share card.
- Do not let a public generation/upload path run when moderation is unconfigured without
  an explicit, documented fail-safe decision.
- Do not leak vendor/provider internals (billing, model names, raw verdicts) to end users.
- Do not reference any coin other than `$THREE` in moderation copy, tests, or fixtures.
- No mock moderation, no `// TODO: moderate later`, no stubbed report endpoint.

## Acceptance (all true before claiming done)

- [ ] Coverage table shows every user-generated input path and its moderation status;
      no public generation/upload path is unprotected.
- [ ] Prompt generation blocks unsafe text via moderation before spending compute, with
      neutral copy and no echo.
- [ ] Image uploads / image→3D run NSFW/safety vision checks before reconstruction.
- [ ] Unconfigured/erroring providers fail safe per an explicit per-surface policy.
- [ ] Real report/abuse flow writes to a moderation queue and rate-limits; takedown
      hides flagged content on every public surface.
- [ ] Generation, upload, report, and unauth writes are rate-limited with a designed 429.
- [ ] Moderation/vision/rate-limit tests pass with new safety cases; changelog updated.
