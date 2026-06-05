# three.ws Site Overhaul — 50 agent prompts

A complete, grounded work program to: **fix the site, unify the UI, make the UX accessible
to non-crypto people, build and improve features, and advertise/explain the value** — plus a
partnerships & content track. Each file below is a self-contained prompt you can hand to one
agent and work with closely.

Every prompt was written against a real audit of this codebase (routes, design system, bugs,
and a non-crypto-user UX pass) — they reference real files, real line numbers, and real
findings, not generic advice.

## How to use this

- Each `.md` is one agent's mission. Open it, read the **Context**, hand it over.
- Tracks are ordered by leverage. **Do Track A (health) and B01–B02 first** — they unblock
  everything else (you can't unify UI on top of broken pages and 8 competing token systems).
- Files are numbered within each track. Dependencies are called out per file.
- All work obeys `CLAUDE.md`: real implementations only, no mocks/placeholders, `$THREE` is the
  only coin, monochrome design tokens, push to both remotes, run the completionist before done.

## The seven tracks

| Track | Theme (your goal) | Files |
|-------|-------------------|-------|
| **A — Health** | Fix errors & issues | `A01`–`A07` |
| **B — UI Uniformity** | One design system, site-wide | `B01`–`B09` |
| **C — UX for Newcomers** | Anyone (non-crypto) can use it | `C01`–`C09` |
| **D — New Features** | Build more | `D01`–`D08` |
| **E — Improve Features** | Make existing features better | `E01`–`E07` |
| **F — Advertise & Value** | Features understood & valued | `F01`–`F06` |
| **G — Partnerships & Content** | Partners, videos, content | `G01`–`G04` |

## Baseline (captured 2026-06-05, verify before trusting)

- **Build:** green (`npm run build` produces `dist/`, PWA precaches ~858 entries).
- **Tests:** 14 failing across 7 files, 3164 passing (`npm test`). Some red is swarm churn;
  one real regression is the `webhooks-replicate` auth test (see `A03`).
- **Routes:** 200+ user-facing routes; many duplicate/orphaned (home-v2/v3/v4/classic, stray
  `pages/*`). See `A06`, `A07`.
- **Design system:** 8+ competing CSS token systems (`--nxt-*`, `--mk-*`, `--pd-*`, `--ibm-*`,
  `--gx-*`, `--ho-*`, `--saas-*`, `--sdk-*`, `--t-*`), 387 unique button classes, ~40 pages with
  bespoke navs, ~60% pages with no footer, 100+ hardcoded colors that already have tokens.
  `public/app-next.css` (`--nxt-*`) is the best existing direction. See Track B.
- **UX:** strong, jargon-light creation tools (`/create`, `/scan`, `/forge`) but the homepage,
  `/features`, dashboard, `/play`, `/club` are wedged with unexplained crypto jargon (x402, USDC,
  mint, on-chain, ERC-8004, bonding curve, MCP, A2A). No onboarding, no glossary; the
  "crypto is optional" message is buried in the pricing FAQ. See Track C.
- **Canonical homepage:** `pages/home-v4.html` ("Give your AI a body").

## Cross-cutting rules for every agent

1. **Read before you write.** Match existing patterns; don't add a 9th token system or a
   388th button class — that's the problem you're here to fix.
2. **Every state designed:** loading (skeletons), empty (guided), error (actionable), populated.
3. **Real data only.** No sample arrays in prod, no fake timers. Wire real endpoints.
4. **Verify in a real browser** (`npm run dev`, port 3000). Headless WebGL can't screenshot 3D —
   assert via DOM + network + `renderer.info`, per the project's screenshot gotcha.
5. **Non-crypto first.** If you add user-facing copy, a person who has never touched crypto must
   understand it. Crypto features are opt-in, never the headline.
6. **Coordinate the hot files.** `api/pump/[action].js`, `public/style.css`, `public/nav.*`,
   `pages/home-v4.html` are touched by many tracks — land changes in small, reviewed diffs.
