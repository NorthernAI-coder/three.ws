# D01 — Site-wide command palette (⌘K)

**Track:** New Features · **Size:** M · **Priority:** P1

## Goal
A universal `⌘K` / `Ctrl-K` command palette to jump to any route, search agents/avatars/coins,
run actions (create, deploy, embed), and open docs — from anywhere on the site.

## Why it matters
With 200+ routes, discoverability is a real problem. A command palette is the single highest-
leverage navigation upgrade and a hallmark of top-tier products (Linear, Vercel). It also makes
the sprawling surface feel intentional.

## Context
- Routes are enumerable from the router config; agents/avatars/coins are queryable via existing APIs (`/api/agents`, discover endpoints, pump search).
- Shared nav is global ([public/nav.js](public/nav.js)) — a natural mount point so it's available everywhere.
- Track B components for styling; honest data only (real search results).

## Scope
- A global palette component (keyboard-opened, accessible, focus-trapped) mounted via the nav so every page gets it.
- Sources: static routes/pages, live agent/avatar/coin search (debounced, real API), quick actions, docs/glossary entries.
- Keyboard nav, recent/suggested items, empty + loading + error states.
- Mobile affordance (a search button in the nav opens the same palette).

## Definition of done
- `⌘K` opens the palette on any page; typing finds routes, real agents/coins, actions, and docs; selecting navigates/acts; all states designed; fully keyboard-accessible.

## Verify
- `npm run dev`; open the palette on 5 different pages, search a real agent and a real coin, run "create avatar," navigate via keyboard only.
