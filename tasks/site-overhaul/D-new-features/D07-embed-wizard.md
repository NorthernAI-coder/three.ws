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

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/site-overhaul/D-new-features/D07-embed-wizard.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
