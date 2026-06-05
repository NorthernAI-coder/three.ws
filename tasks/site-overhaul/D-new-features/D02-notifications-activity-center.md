# D02 — Unified notifications / activity center

**Track:** New Features · **Size:** M · **Priority:** P2 · **Builds on:** the feed bus

## Goal
A per-user notifications/activity center in the nav: launches, sales/tips, agent events,
follows, system messages — built on the existing site-wide feed bus, not a new system.

## Why it matters
Engagement and retention depend on a reason to come back. The platform already has a feed bus
(`feed:events` on Redis) powering the site-wide FOMO ticker — extend it into a personalized,
persistent inbox.

## Context
- Memory: live activity feed uses the Redis `feed:events` bus (API + multiplayer producers), nav-loaded widget `public/feed.js`; **extend the event shape, don't fork it.**
- Personalization needs a per-user filter/store on top of the existing events.

## Scope
- A nav bell with unread count opening a panel of the user's relevant events (their agents' launches/sales/tips, follows, system notices).
- Persist read/unread per user; mark-all-read; deep links to the relevant surface.
- Reuse `feed:events`; add only the fields/filtering needed (per memory, extend the shape). Real events only — no fabricated notifications.
- Designed empty ("You're all caught up"), loading, error states.

## Definition of done
- Signed-in users see real, personalized notifications from the existing bus, with unread state and deep links; the global ticker still works unchanged.

## Verify
- Trigger a real event (e.g. a launch) and confirm it appears for the relevant user with a working deep link; unread count updates.
