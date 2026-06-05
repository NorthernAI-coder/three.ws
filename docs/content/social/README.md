# Social Content Engine

The repeatable system for three.ws social. Five files turn our real product surfaces and (when they land) G02's video scripts into weeks of platform-specific posts — without re-inventing each post and without ever fabricating a number, a quote, or a user.

This is the **content source**, not a posting bot. Nothing here schedules or publishes. A human picks posts off the calendar, fills the bracketed source/permission gates with real values, and posts them.

## The files

| File | What it is |
| --- | --- |
| [calendar-4-week.md](calendar-4-week.md) | A 4-week calendar (~3–5 posts/week) rotating the four formats across X, Farcaster, LinkedIn, and YouTube Shorts/TikTok. Each row ties to a real feature or clip and a source link. No metric cells. |
| [post-templates.md](post-templates.md) | One reusable template per format (build-in-public, feature spotlight, user creation, dev tip) with per-platform variants. |
| [hooks-library.md](hooks-library.md) | 25–40 reusable opening lines grouped by angle. Honest by construction. |
| [clip-plan.md](clip-plan.md) | For each of G02's five scripts (or the real flows they derive from), the strongest beats to cut, target platforms, aspect ratio, caption, and CTA URL. |

## Honesty rules — non-negotiable

These are the entire reason this engine is credible. A skeptical follower should be unable to find a single unprovable claim in anything we ship.

1. **No fabricated engagement.** Never invent likes, views, reposts, follower counts, or "this blew up."
2. **No invented user, download, or revenue numbers.** We do not have a public user count. Do not state one. Where a real figure belongs, write a gate, not a guess:
   - `[SOURCE: pull real figure from <where>]` — a number that must come from a real, named source before posting.
   - `[HUMAN: real quote, do not invent]` — a quote that a real person must supply and approve.
   A placeholder that says "insert real number" is correct. A made-up number presented as fact is a brand violation.
3. **No fake testimonials and no staged "a user said…" posts.** User creations are showcased **only with explicit permission** (see the user-creation template's `[PERMISSION CONFIRMED?]` gate), and staged content is never passed off as organic.
4. **Every feature claim maps to a real capability** documented in [`README.md`](../../../README.md), with a proof link (a route, a doc, a commit). If you can't link proof, don't claim it.
5. **Affiliation language is exact.** Anything touching IBM/watsonx says **"built on watsonx.ai"** or "community-built connector" — never "official IBM partner," never "endorsed by IBM." The `/ibm/*` demos are independent tools three.ws built for developers, not IBM products. Apply the same caution to every other company (AWS: "AWS Partner / Marketplace listing in review," not "AWS-endorsed").
6. **`/play` is never described as single-player.** It is a live, shared coin world — peer avatars, chat, emotes. Call it that.
7. **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never reference any other coin or token — including ones the project itself has launched. When example data needs a mint, use $THREE or a clearly-synthetic placeholder.

If a draft can't satisfy all seven, it doesn't ship. Convert the offending claim to a `[SOURCE: …]` / `[HUMAN: …]` gate or delete it.

## Per-platform reality

| Platform | Norms we match |
| --- | --- |
| **X** | Text + media; threads for depth; hook in the first line; one idea per post. |
| **Farcaster** | Crypto-native audience; casts and frames; technical specificity rewarded; link the on-chain proof. |
| **LinkedIn** | Longer-form, professional/BD tone; lead with the problem and the outcome; no degen slang. |
| **YouTube Shorts / TikTok** | Vertical 9:16 clips cut from G02 scripts; on-screen text; payoff in the first 2 seconds; CTA in caption + end card. |

## How to operate the calendar weekly

1. **Monday — pick the week.** Open [calendar-4-week.md](calendar-4-week.md), read the current week's ~3–5 rows. Each names a platform, format, topic, the asset needed, and a source link.
2. **Gather assets.** Capture the real screen recording, screenshot, or commit link the row's "Asset needed" column calls for. For a user creation, get written permission first.
3. **Draft from the template.** Open [post-templates.md](post-templates.md), copy the matching format's template + the platform variant, and fill it in.
4. **Resolve every gate.** Replace each `[SOURCE: …]` with a real, sourced figure and each `[HUMAN: …]` with an approved real quote. If you can't, cut that line.
5. **Pick a hook.** Pull an opener from [hooks-library.md](hooks-library.md) matched to the angle. If the hook carries a `[SOURCE: …]`, resolve it too.
6. **Skeptic pass.** Re-read as a follower who wants to catch us lying. Any unprovable claim → gate or delete.
7. **Hand to a human to post.** Posting, replies, and any partnership-status claims (see G01) stay human-owned.

When G02's scripts land under `docs/content/video-scripts/`, refresh [clip-plan.md](clip-plan.md) to point at the actual beat tables; until then it derives clips from the same real flows in `README.md`. For IBM-specific posts, link to the IBM co-marketing social kit (`docs/ibm-co-marketing/social-kit.md`) when it exists rather than duplicating its posts here. Launch-day rows reference G04's press kit rather than restating it.
