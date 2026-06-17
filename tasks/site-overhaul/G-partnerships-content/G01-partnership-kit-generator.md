# G01 — Partnership one-pager / co-marketing kit system

**Track:** Partnerships & Content · **Size:** M · **Priority:** P2

## Goal
A repeatable co-marketing kit pattern for new partners (one-pager, messaging, solution brief,
social assets), generalized from the existing IBM kit so a new partnership can be packaged fast.

## Why it matters
You want more partnerships. Each one needs collateral. The IBM kit already proves the format —
turn it into a reusable template so partner #2..#N is a fill-in-the-blanks afternoon, not a
from-scratch project.

## Context
- Existing reference (memory): `docs/ibm-co-marketing/` — one-pager, messaging, press release, solution briefs, social, FAQ, with partner/trademark guardrails.
- The `/ibm` suite (E07) and `/aws` hub show the on-site partner-surface pattern.

## Scope
- Extract the IBM kit into a documented **template** (`docs/partner-kit-template/`) with placeholders and the trademark/affiliation guardrails baked in.
- A short "how to onboard a partner" guide: what assets to produce, where on-site surfaces live, accuracy/legal guardrails.
- Optionally a generator script that scaffolds a new `docs/<partner>-co-marketing/` from the template.

## Definition of done
- A reusable partner-kit template + onboarding guide exists; producing a new partner's kit is a guided fill-in, with guardrails preserved.

## Verify
- Dry-run the template for a hypothetical partner; confirm it yields a complete, guardrail-compliant kit skeleton.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/site-overhaul/G-partnerships-content/G01-partnership-kit-generator.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
