# F01 — Interactive feature showcase / live tour landing

**Track:** Advertise & Value · **Size:** M · **Priority:** P1

## Goal
A landing surface that *demonstrates* each core capability live (not just describes it): a
scrollable, interactive tour where a visitor sees a real avatar animate, a real agent reply, a
real embed, etc. — proving the value in seconds.

## Why it matters
The audit found users don't realize all the capabilities are one platform, and telling beats
showing poorly. A "show, don't tell" showcase is the strongest top-of-funnel asset and is highly
screenshot/share-worthy (`CLAUDE.md` quality bar).

## Context
- Real capabilities to demo: selfie→3D, 70+ animations, AI chat, embed, optional on-chain/x402.
- Honesty rule (memory): demos must be real, no fake live data. Use real renders/agents.
- Headless WebGL caveat (memory): verify 3D via `renderer.info`/DOM, not pixel screenshots.

## Scope
- An interactive showcase (its own page or a homepage section) where each capability is a live, working mini-demo with a CTA into the real flow.
- Performance-conscious: lazy-load heavy 3D, intersection-observer to start demos on scroll, graceful fallback for low-power devices.
- Built on Track B; mobile-friendly.

## Definition of done
- A visitor can interact with a real demo of each core capability on one page and click through to do it themselves; demos use real data; no jank.

## Verify
- `npm run dev`; scroll the showcase, interact with each demo, confirm real behavior and working CTAs; check mobile + performance.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/site-overhaul/F-advertise-value/F01-interactive-feature-showcase.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
