# D03 — Agent template gallery / "clone this agent"

**Track:** New Features · **Size:** M · **Priority:** P1 · **Pairs with:** C02 use-cases

## Goal
A gallery of ready-made agent templates (customer-service bot, streamer companion, community
mascot, etc.) that a user can clone in one click and customize — turning the blank-page problem
into a pick-and-go.

## Why it matters
The audit's #1 newcomer gap is "what's an agent and why would I make one?" Templates answer it by
example and collapse time-to-first-agent. It also directly supports the C02 use-cases.

## Context
- Agent creation/registration exists (`agent-identities`, the create/deploy flows). A template is a pre-filled agent config (persona, brain, skills, sample avatar) the user can fork.
- Discover/marketplace surfaces exist to host the gallery; reuse Track B cards.

## Scope
- Define a template schema + a curated, real set (no fake data — each template is a working agent config). Store them where the app can read them (DB table or a versioned JSON the build ships).
- A gallery surface (under `/discover` or a new `/templates`) with cards, preview, and "Use this template" → creates a real editable agent from the template.
- Each template maps to a C02 use-case and explains who it's for.

## Definition of done
- A user can browse templates, preview one, and clone it into a real, editable agent in their account; every template is genuinely functional.

## Verify
- Clone 2 templates; confirm they produce working agents pre-filled correctly and are independently editable.
