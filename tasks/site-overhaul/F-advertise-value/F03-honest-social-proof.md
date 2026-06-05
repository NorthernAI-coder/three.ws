# F03 — Honest social-proof & traction surfaces

**Track:** Advertise & Value · **Size:** S/M · **Priority:** P2

## Goal
Surface real platform traction — agents created, coins launched, live activity, notable creations
— as honest social proof on the homepage and landing pages.

## Why it matters
Social proof converts, but the founder's honesty rule is absolute: **no fabricated numbers or
fake live data** (memory: homepage marketing must be honest examples). This task wires *real*
signals so the proof is both persuasive and true.

## Context
- Real signals: the activity feed bus (`feed:events`), counts from the agents/coins tables, the leaderboard (D06).
- Memory: homepage-honesty — marketing visuals must be honest examples; no fake live data.

## Scope
- A live "real activity" strip (recent real launches/creations) and honest aggregate counts, sourced from real endpoints, on the homepage and key landing pages.
- If a real number is too small to impress, show it honestly or show a qualitative proof (real featured creations) instead of inflating — never fake.
- Designed empty state for low-activity windows.

## Definition of done
- Homepage/landing pages show real, live traction signals that match the underlying data; nothing is fabricated; low-data states degrade honestly.

## Verify
- Cross-check displayed counts/activity against the database/feed; confirm they're real and update.
