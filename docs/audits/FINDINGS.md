# Master findings — three.ws page audit

Consolidated, severity-ranked list across all seven group docs
([01](01-main.md)–[07](07-learn-blog-legal.md)). Auditors ran read-only; fixes
landed afterward. **Status** reflects the live worktree, which had a concurrent
multi-agent fix sweep running during this audit — items marked *fixed
(concurrent)* were corrected by another agent on `main` while this audit was in
flight and were verified gone before this doc was written.

Audited: ~115 interactive routes + docs/blog/legal/machine surfaces.
**Coin rule: clean platform-wide** — the only Solana mint hardcoded anywhere is
`$THREE` (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Zero foreign-token
references in code, copy, samples, or docs. No true P0s.

## Severity tally

| Sev | Count | Notes |
|---|---|---|
| P0 | 0 | none found |
| P1 | ~70 | incl. one stored-XSS, three hard-rule violations (fixed), feed-failure UX cluster |
| P2 | ~50 | a11y on data tables, missing focus states, copy, mobile |
| P3 | ~40 | cross-link opportunities, adjacent features |

---

## Tier 1 — hard-rule violations & security (all resolved)

| # | Issue | File | Status |
|---|---|---|---|
| 1 | **Stored XSS** — character name/description/symbol/author/image_url injected into `innerHTML` unescaped | `src/characters.js:30-82` | **Fixed (this audit)** — added `escHtml`/`safeUrl`, escaped every user field, `encodeURIComponent` on id href |
| 2 | **Fallback sample array on `/`** — `FALLBACK_AGENTS` fabricated named agents ("Ansem — Trader persona", etc.) rendered when `/api/explore` is thin/down | `pages/home.html:5562` | **Fixed (this audit)** — removed array; showcase degrades to its real CTA cards (Browse all / Make your own) |
| 3 | **Broken skeleton rendered as literal text** — `${Array.from(...)}` sat in static HTML, so users saw the raw template string; fetch had no try/catch → infinite spin on network throw | `pages/marketplace-analytics.html:137,143`, `src/marketplace-analytics.js:110` | **Fixed (this audit)** — static skeleton rows; fetch + top-level `.catch` now route to the error state |
| 4 | **Fake progress stages** — `setInterval` cycled "Generating queries…/Searching…/Computing verdict…" unconnected to real work | `src/fact-checker-app.js:257-285` | **Fixed (concurrent)** — replaced with one honest indeterminate status; verified |
| 5 | **Fabricated bazaar listings** — on x402-bazaar failure, `discoverServices()` invented competitor services rendered as a live bazaar | `api/demo-economy.js:81-107` | **Fixed (concurrent)** — degrades to `bazaarAvailable:false` + the one real briefing service; verified |

## Tier 2 — dead links (resolved)

| # | Issue | File | Status |
|---|---|---|---|
| 6 | `/ibm/galaxy` (no such route) on the IBM feature CTA + footer | `pages/features.html:1058,1266` | **Fixed (this audit)** → `/galaxy` (routed in vercel.json:861) |
| 7 | `/ibm/galaxy` badge/degradation links | `pages/constellation.html`, `pages/agent-economy.html` | **Fixed (concurrent)** → `/galaxy` |
| 8 | `/ibm/trust-layer`, `/docs/ibm` dead links | `pages/agent-exchange.html`, `pages/avatar-wallet-chat.html`, `pages/agent-economy.html` | **Fixed (concurrent)** |
| 9 | Nav pointed at `/pages/*.html` (404 in prod — prod serves clean routes) | `pages/shopper.html:411-416` | **Fixed (concurrent)** → clean routes |

## Tier 3 — open follow-ups (not yet fixed)

These are real, lower-severity, and several touch files under active concurrent
edit — left open and tracked rather than risk clobbering in-flight work.

- **[P1] Feed-failure UX cluster** — several live feeds keep stale data or spin
  forever instead of surfacing a recoverable error/retry: `/oracle` graph,
  `/smart-money`, `/pump-dashboard` channel feed, `/pumpfun` SSE,
  `/pump-visualizer` SSE. `/pump-live` reconnects correctly — copy its pattern.
  (Several of these files were under concurrent edit during the audit.)
- **[P1] `/play/agent-wallet` dead in prod** — `BRIDGE_URL` is empty for any
  non-localhost host, so the headline "your avatar pays" flow is unreachable for
  real visitors. Needs a deployed bridge URL or an honest "dev-only" state.
- **[P1] `/avatar-artifact` unusable on mobile** — zero media queries,
  full-screen canvas, mouse-only. Add touch controls + a mobile layout.
- **[P1] `/create-agent` permanent dead page on module parse failure** — the
  `#page-loading` veil never clears if the module throws at parse. Add a
  load-failure fallback that clears the veil and shows a retry.
- **[P1] `/create/selfie` silent `catch {}`** — avatar fetch + name/visibility
  saves swallow errors (stuck viewer / lost edits). Surface recoverable errors.
- **[P2] Blog footer regression** — ~22 of 28 posts load `footer.css` but never
  render the footer element. Good candidate for a single scripted pass over
  `blog/*.html`.
- **[P2] Data-table a11y** — `/oracle`, `/activity`, `/leaderboard`,
  `/trending`, `/smart-money` use `<div>` grids / label-less rows missing
  `scope`/`aria-label`/semantic roles. Best in class: `/radar`, `/trades`,
  `/strategy-lab`.
- **[P2] `/lookup` off-brand** — hardcoded light theme, no nav/footer, dead-ends
  to external explorers with no on-platform agent-profile link.
- **[P2] `/collection`** — one remaining unescaped field (`collection.js`).
- **[P3] Island pages** — `/demo`, `/live`, `/avatar-wallet-chat`, vanity
  grinders lack cross-links to `/agents` / `/launches` / agent profiles.
- **[P3] Marketing copy accuracy** — `features/deploy.html` brands the schema
  "ERC-8004" while it's Solana/Metaplex Core; `studio.html` FAQ points at an
  unrouted `/agent-embed`; `ar.html` `/docs/ar` soft-404s in the docs SPA.

## Rejected false positives (recorded so they aren't re-raised)

- USDC / SOL / BTC as x402 settlement rails are **not** coin-rule violations —
  they're payment plumbing, not promoted coins.
- `/login`, `/register` auth is fully wired (`src/privy-login.js` exists and is
  served); the "missing module" P0 was wrong.
- Home links `/forge`, `/radar`, `/pose`, `/marketplace` all resolve.
- `/embed.html`, `/community`, `/legal/privacy`, `/legal/tos` all resolve.
- `/studio`, `/widgets` demo fixtures are real (`/api/widgets/...`), not mocks.
- Root `llms.txt` (0 bytes) is **not** served — `/llms.txt` serves the generated
  67 KB `public/llms.txt`. The empty root file is stale-but-harmless (P3 delete).
