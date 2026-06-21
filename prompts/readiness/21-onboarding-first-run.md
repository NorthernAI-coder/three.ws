# 21 — Onboarding & first-run experience

**Phase 5. [parallel-safe]** with 18–20.

## Where you are

`/workspaces/three.ws` — three.ws, 3D AI-agent platform. There's a getting-
started surface (`public/getting-started.js`), a feature tour
(`src/feature-tour/`), feature-discovery (`public/feature-discovery.js`), and a
tour SDK (`tour-sdk/`). Read [CLAUDE.md](../../CLAUDE.md). The product's hook is
"give your AI a body — type a prompt, Forge a 3D model in 60 seconds." The only
coin is **$THREE**.

## Objective

A first-time visitor reaches the platform's "aha" — a generated 3D agent — within
60 seconds, with zero confusion and no forced signup before value. The path from
landing → first creation → save/share → next step is guided, fast, and obviously
valuable.

## Why it matters

Activation is the top of every growth model. A billion-dollar valuation is a
function of how many visitors become active users and how fast. The first 60
seconds decide it. A confusing or gated first run caps the entire funnel
regardless of how good everything downstream is.

## Instructions

1. **Map the current first-run.** As a brand-new user (incognito, no wallet),
   walk: land on home → get to forge → generate → view → save/share → "what
   next." Time it. Note every point of confusion, friction, or premature gate.
2. **Define the activation moment** explicitly (first successful 3D generation)
   and instrument it (coordinate with [25 — analytics](25-analytics-funnel.md))
   so activation rate is measurable.
3. **Remove premature gates.** Per the README hook, the free draft tier needs no
   account. Confirm a visitor can Forge and see a result before any signup/wallet
   prompt. Move auth to the moment it's actually required (save permanently,
   mint, pay) and explain why at that moment.
4. **Guide, don't dump.** A focused first-run: a clear primary CTA on the landing
   ("Forge your first agent"), an inline example prompt they can one-click try,
   and a lightweight tour (reuse `src/feature-tour/` — don't build a new one)
   that highlights the 2–3 things that matter, skippable and non-blocking.
5. **Empty states as onboarding.** New-user empty states (no agents, no
   collection) double as guidance with a real next action — coordinate with
   [18 — state design](18-state-design-sweep.md).
6. **First success → next step.** After the first generation, surface the obvious
   next actions (animate it, embed it, give it a brain, register it, share it).
   Wire these as real links (no dead ends — ties to
   [05 — dead paths](05-dead-path-and-handler-audit.md)).
7. **Shareable result.** The first creation should be one-click shareable with a
   real OG preview (coordinate with [22 — SEO/shareability](22-seo-and-shareability.md))
   — the share IS the growth loop.
8. **Returning-user state.** A returning user skips the intro and lands on
   something useful (their agents / dashboard), not the cold landing.
9. **Verify end-to-end** in a clean session and time it again; prove < 60s to
   first generated model.

## Definition of done

- [ ] New, unauthenticated user can reach a generated 3D agent in under 60s,
      verified in a clean session (time recorded before/after).
- [ ] No signup/wallet gate before first value; auth appears only when truly
      required, with an explanation.
- [ ] A skippable, non-blocking first-run guide (reusing `src/feature-tour/`)
      highlights the key actions.
- [ ] New-user empty states guide to a real next action.
- [ ] Post-first-success next steps are surfaced and wired (animate / embed /
      brain / register / share — no dead links).
- [ ] First creation is one-click shareable with a real OG preview.
- [ ] Returning users land on something useful, not the cold intro.
- [ ] Activation event instrumented and measurable.
- [ ] `npm test` passes. Changelog: `feature`/`improvement` entry ("Faster,
      guided first-run experience").
