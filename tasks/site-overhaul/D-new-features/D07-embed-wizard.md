# D07 — One-click "embed on your site" wizard

**Track:** New Features · **Size:** M · **Priority:** P1

## Goal
A guided wizard that turns any agent/avatar into a copy-paste embed snippet with a live preview,
configuration (size, theme, behavior), and platform-specific instructions (plain HTML,
React, WordPress, Webflow, Shopify).

## Why it matters
"Embed anywhere" is a core value prop and a top use-case (C02), but the audit notes users don't
know *how* or *why*. A great embed wizard converts a created avatar into real-world usage — the
platform's stickiest outcome.

## Context
- Embed infrastructure exists: `/embed`, `/embed/v1.js`, `pages/widget.html`, avatar/agent embed pages, CSP-safe iframes.
- Reuse the existing embed endpoints; this is the *guided UX* around them.

## Scope
- A wizard (in the dashboard and/or on each agent page) that: picks the agent, configures appearance/behavior, shows a **live preview** of the actual embed, generates the real snippet, and gives copy buttons + per-platform paste instructions.
- Validate the snippet works (the preview *is* the embed). Designed states throughout.
- Plain language — assume the user has never embedded anything.

## Definition of done
- A user selects an agent, configures it, sees a live working preview, and copies a snippet that actually renders that agent on an external page.

## Verify
- Generate a snippet, paste it into a blank HTML file served locally — the agent renders and works.
