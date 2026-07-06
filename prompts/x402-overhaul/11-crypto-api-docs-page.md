# 11 — Free Crypto Data API: Public Docs / Landing Page

Read `prompts/x402-overhaul/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
Independent work order — completes fully on its own. Does NOT require 01–10; it documents the
whole free Crypto Data API and degrades gracefully for endpoints not yet live (mark them
"live" vs "coming soon" by probing `/api/crypto` at build/runtime, or list the full intended
set — never blank).

## Goal
A screenshot-worthy public page — `three.ws/crypto` (or `/docs/crypto-api`, follow existing
docs/page conventions) — that makes an agent developer go "I'm wiring this in right now."
This is a marketing surface AND the funnel top: free data here, paid uniques (Forge, Vanity,
Pump Launcher) linked as the next step.

## Build
- Follow the repo's existing page system (read `data/pages.json`, an existing docs/landing
  page, and `DESIGN-TOKENS.md` before writing a line — match the design system, don't invent).
- Content: hero ("Free crypto data for AI agents — one keyless API"), a live endpoint table
  (name, one-line purpose, method+path, price=Free), a copy-paste quickstart (curl + a JS
  `fetch` snippet that actually runs), per-endpoint request/response examples using REAL
  responses (call the live endpoints; if one isn't live yet, mark "coming soon"), and a
  "when you're ready to build" CTA linking Forge / Vanity / Pump Launcher.
- Every code sample must run. Every link must resolve.
- All states designed: works at 320px / 768px / 1440px; light + dark; hover/focus states;
  loading skeleton if it fetches live data client-side.

## Register it
- `data/pages.json`: path, title, description, `added` date (feeds sitemap/llms.txt/changelog).
- Link it from the site nav / docs index per existing conventions.
- `STRUCTURE.md`: row if it's a new surface.

## Tests / verification
- `npm run dev`, open the page, exercise it in a real browser: no console errors, live
  examples render, all links resolve. Capture what you verified in PROGRESS.md.
- `npm run build:pages` green.

## Definition of done
Inherit 00-CONTEXT DoD + gates. Plus:
- [ ] Page live in dev, screenshot-worthy, responsive, a11y-clean, zero console errors.
- [ ] Every curl/fetch sample executed and confirmed working (paste one real run in PROGRESS).
- [ ] `data/pages.json` + nav link + `STRUCTURE.md` done.
- [ ] `data/changelog.json` (tags: `feature`,`docs`; `link` = the page path) — "New: three.ws
      Crypto Data API docs".
