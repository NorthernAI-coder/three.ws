# G03 — "Powered by three.ws" partner widget + co-brand surface

**Track:** Partnerships & Content · **Size:** M · **Priority:** P3 · **Depends on:** D07 embed

## Goal
A co-brandable embeddable widget and a partner showcase surface, so partners can drop three.ws
into their product with attribution and you can feature them — a two-way distribution loop.

## Why it matters
Partnerships compound when they're embeddable and visible. A clean "powered by three.ws" widget
gets the brand onto partner sites; a partner showcase on three.ws reciprocates and advertises the
relationships.

## Context
- Embed infra exists (`/embed`, D07 wizard). This adds co-brand options + attribution + a partner directory.
- Accuracy guardrails (memory): keep partner/trademark/affiliation language correct.

## Scope
- A co-brand mode for the embed (partner logo + "powered by three.ws" attribution, themeable within the design system) generated via the D07 wizard.
- A `/partners` showcase page listing real partners with honest descriptions and links (reuse Track B + the kit from G01).
- Don't claim partnerships that don't exist; founder confirms the partner list.

## Definition of done
- Partners can generate a co-branded embed with attribution; a `/partners` page showcases real, confirmed partners; affiliation language is accurate.

## Verify
- Generate a co-branded embed and render it externally; confirm attribution + theming; `/partners` lists only confirmed partners.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/site-overhaul/G-partnerships-content/G03-powered-by-partner-widget.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
