# F04 — Lifecycle / onboarding communications

**Track:** Advertise & Value · **Size:** M · **Priority:** P3

## Goal
A value-led lifecycle comms sequence (welcome → activate → first embed → optional monetize) that
re-engages users with the right next step at the right time.

## Why it matters
Activation and retention need nudges. Users who create an avatar but never embed it, or sign up
but never create, are recoverable with honest, helpful, well-timed messages.

## Context
- Check what email/notification infrastructure already exists (transactional email provider in `.env`/`api/`, the D02 notification center) before adding anything — reuse it.
- Coordinate with C03 (getting started) so in-app and out-of-app onboarding tell one story.

## Scope
- Define the lifecycle stages and the one helpful message each (in-app via D02 and/or email via the existing provider). Each message: one clear value + one CTA; honest; easy unsubscribe.
- Trigger on real events (created avatar, no embed after N days, etc.) — no spam, real triggers only.
- If no email provider is configured, implement the in-app (D02) path and flag the email gap to the founder rather than stubbing.

## Definition of done
- Real lifecycle triggers send one helpful, honest message via available channels, each driving a concrete next step, with working unsubscribe.

## Verify
- Simulate a real trigger (e.g. created-but-not-embedded) and confirm the correct message fires through the real channel.
