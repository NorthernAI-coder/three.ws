# Task 01 — First-run activation: auto-launch the tour + repair the `/start` wizard

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. Inherit every
> rule there. This task is in **Track A — Activation**. It has no hard dependencies and
> should land early; other Track A/B work links to the onboarding entry points you finish.

## The thesis

Activation is the single highest-leverage lever on valuation: a platform that turns first
visits into first success compounds; one that drops new users on a blank page does not.
three.ws already built most of the machinery — it just doesn't fire for the people who
need it.

## What exists today (read these before touching anything)

- **Feature tour** — [src/feature-tour/](../../src/feature-tour/) (director, narrator,
  guide-avatar, free-roam, controls; recently added). Wired to `/tour?track=quick|full`
  and `?tour=start|1|0`, state in `sessionStorage`. It is **not** auto-offered to
  first-time visitors anywhere — you reach it only via a deep link or nav.
- **Getting-started checklist** — [public/getting-started.js](../../public/getting-started.js):
  floating checklist (create → brain → embed core + optional on-chain/monetize), milestones
  in `localStorage`, skippable welcome modal.
- **Dashboard onboarding panel** — [src/dashboard-next/pages/home.js](../../src/dashboard-next/pages/home.js):
  reconciles progress with server data.
- **Onboarding plan of record** — [docs/onboarding/ONBOARDING-PLAN-2026-06-19.md](../../docs/onboarding/ONBOARDING-PLAN-2026-06-19.md):
  read it; it defines the intended phases. Honor it.
- **`/start` wizard** — listed in [data/pages.json](../../data/pages.json) as a "5-step
  onboarding wizard" but **the page does not exist** (`pages/start.html` is missing). This
  is a documented-but-dead route: a conversion blocker and an `audit:pages` liability.

## The gap

1. New visitors are never offered the tour or a guided path — the machinery sits idle.
2. `/start` is advertised but 404s / is unbuilt. Either build the real wizard or remove the
   route from the manifest — no dead advertised paths. **Build it** (it's the better first
   step than dropping a cold user into `/forge` or `/create`).
3. The tour, the getting-started checklist, and the dashboard panel track progress in three
   different stores and don't agree. Onboarding state should be one source of truth.

## What to build

1. **First-run offer.** On a first-ever visit (no returning-visitor marker), show a tasteful,
   dismissible prompt to take the guided tour / start the wizard — on the home page and/or
   via [public/nav.js](../../public/nav.js). Respect `prefers-reduced-motion`. Never nag: one
   offer, remembered if dismissed or completed. Don't show it to returning/known users.
2. **Build the real `/start` wizard** (`pages/start.html` + its module). Five real steps that
   end in a real first success (e.g. create-or-pick an avatar → connect a brain → generate or
   embed → optional on-chain/monetize). Each step does real work via the existing
   create/forge/brain/embed APIs — no fake progress. Designed empty/loading/error states per
   step; back/skip; resumable. Reuse the feature-tour and getting-started infrastructure
   rather than forking a third system.
3. **Unify onboarding progress** into one source of truth (prefer the server-backed model the
   dashboard already reconciles against), and have the checklist, the wizard, and the
   dashboard panel all read/write it. Completing a step anywhere advances it everywhere.
4. **Instrument it.** Fire the real activation funnel events through
   [src/analytics.js](../../src/analytics.js) (it already defines an activation funnel —
   `LANDING_VIEWED` → … → `AGENT_CREATED`). Add the wizard's per-step start/complete/skip
   events so drop-off is measurable. No new analytics vendor; use what's wired.

## Definition of done

Everything in the README DoD, plus:
- A brand-new visitor (fresh browser profile) is offered a path and can complete a real first
  success without dead ends.
- `/start` exists, passes `npm run audit:pages` (route ↔ manifest parity), is reachable from
  nav and the first-run offer, and is fully responsive (320 / 768 / 1440).
- Onboarding progress is consistent across the checklist, the wizard, and the dashboard.
- Activation + per-step events fire (verify in the Network tab / analytics debug).
- Changelog entry (`feature`). Then run the self-review and improve the weakest step.

Delete this file when done.
