# Road to $1B — production-readiness program

> Read this first, then `/CLAUDE.md`. Every prompt in this folder assumes both.

This is the **spine** that takes three.ws from "impressive demo" to a platform a
serious diligence team, a million users, and a $THREE holder base would all trust.
It is deliberately separate from the feature-expansion prompt libraries elsewhere in
`prompts/` (`feature-innovation/`, `agent-studio/`, `living-agents/`, …) — those add
surface area; **this track makes the surface area we already have correct, safe, fast,
and fundable.**

The only coin is **$THREE** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). No
exceptions, anywhere. See `/CLAUDE.md`.

## How to run this

Each numbered file is a **self-contained prompt for a fresh chat**. Open a new
session, paste the file's contents (or say "do `prompts/road-to-1b/NN-*.md`"), and let
the agent execute it end to end. One prompt = one focused, shippable unit of work.

Run **in number order within a phase**. Phases are mostly sequential; inside a phase,
prompts marked `Parallel-safe with:` can run in separate chats at the same time.
Foundation (Phase 0) and hardening (Phase 1) come before everything — you cannot
polish or grow on top of stubs and security holes.

Each prompt ends with an **Acceptance** checklist. A prompt is not done until every
box is checked, `npm test` is green, and any user-visible change has a
`data/changelog.json` entry (`npm run build:pages` validates it).

## The repo in one breath

Vanilla-JS + Vite monorepo, 20 npm workspaces. ~125 pages (`pages/`), ~810 front-end
modules (`src/`), ~961 Vercel functions (`api/`), Cloudflare workers (`workers/`),
Three.js for 3D, Solana + pump.fun + x402 for money, real OpenAI/Anthropic via worker
proxies. `STRUCTURE.md` maps every surface to its directory — read it before
exploring. Useful existing gates: `npm run audit:web`, `audit:pages`,
`audit:handlers`, `audit:empty-handlers`, `check:images`, `test:gate`, `verify:solana`,
`smoke:onchain`, `audit:deploy`, `lint`, `typecheck`.

## Phase map

| # | Prompt | Phase |
|---|---|---|
| 01 | Production-readiness audit & scorecard | 0 — Foundation & truth |
| 02 | No stubs, mocks, TODOs — hard-rule cleanup | 0 |
| 03 | Dead paths, broken links & empty handlers | 0 |
| 04 | $THREE-only compliance sweep | 0 |
| 05 | Secrets & env hygiene | 1 — Correctness & hardening |
| 06 | Error handling & resilience | 1 |
| 07 | Security hardening | 1 |
| 08 | Rate limiting & abuse prevention | 1 |
| 09 | Test suite green & CI gate | 1 |
| 10 | Resilience of external calls | 2 — Reliability at scale |
| 11 | Observability (logs, metrics, alerts) | 2 |
| 12 | Frontend performance & Core Web Vitals | 3 — Experience quality |
| 13 | Accessibility (WCAG 2.2 AA) | 3 |
| 14 | Responsive & mobile | 3 |
| 15 | Every state designed + design-system consistency | 3 |
| 16 | SEO, metadata, Open Graph & structured data | 3 |
| 17 | Cross-browser & device QA | 3 |
| 18 | Studio suite completeness (Forge, Avatar, Animation, Scene) | 4 — Surface completeness |
| 19 | Agent creation & Agent Studio | 4 |
| 20 | Marketplace, skills & purchase flow | 4 |
| 21 | Trading & intelligence suite (Oracle, radars, leaderboards) | 4 |
| 22 | Launch suite (Launch a Coin, Launchpad, Coin Intel, Claim) | 4 |
| 23 | Worlds, Coin Clash & multiplayer | 4 |
| 24 | Wallets & payments (x402, agent wallets, USDC, pay-by-name) | 4 |
| 25 | SDK release-readiness | 5 — Developer platform |
| 26 | MCP servers & agent interoperability | 5 |
| 27 | Docs, tutorials & API reference | 5 |
| 28 | Onboarding, guided tour & activation funnel | 5 |
| 29 | Conversion funnel & landing optimization | 6 — Growth & business |
| 30 | Analytics & growth instrumentation | 6 |
| 31 | Monetization, pricing & $THREE utility | 6 |
| 32 | Legal, compliance & trust | 6 |
| 33 | Infrastructure, CI/CD & deploy safety | 6 |
| 34 | Launch-readiness gate & go-to-market QA | 6 |

## Why "$1B" is the bar, concretely

A $1B platform is not "more features." It is: **nothing is fake** (Phase 0), **nothing
leaks or breaks under load or attack** (Phases 1–2), **it feels world-class on any
device** (Phase 3), **every surface a user can reach is finished** (Phase 4),
**developers can build on it** (Phase 5), and **the funnel from first visit to paying,
retained user is measured and optimized** (Phase 6). Each phase is a precondition for
the next being worth anything.

## Prompt template (for adding new ones)

```
# NN — Title

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** N — <name>
**Owns:** <paths/surfaces this prompt may change>
**Depends on:** <numbers or "none">  ·  **Parallel-safe with:** <numbers or "—">

## Why this matters for $1B
<2–4 lines tying the work to trust / fundability / growth>

## Mission
<one crisp sentence>

## Map
<real repo paths, scripts, surfaces>

## Do this
1. …  (specific, ordered, references real scripts/paths — never generic)

## Must-not
- …

## Acceptance
- [ ] … ; `npm test` green; changelog entry if user-visible.
```

## Global definition of done (applies to every prompt)

- No mocks, fake data, placeholders, TODOs, stubs, or `throw "not implemented"`.
- Every interactive element has hover/active/focus states; every page has designed
  loading/empty/error/populated states.
- Real APIs only; errors handled at network/input boundaries.
- `npm test` green; `npm run lint` and `npm run typecheck` clean for touched code.
- `git diff` self-reviewed; every changed line justified.
- User-visible change → `data/changelog.json` entry (plain language, holder-readable).
- You would demo it, unprompted, to a room of senior engineers.
