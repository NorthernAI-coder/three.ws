# 35 · API Rate Limiting & Abuse Protection

## Mission
Protect every public endpoint from abuse, scraping, spam, and cost-explosion (LLM/3D generation are
expensive) — without harming legitimate users.

## Context
- Vercel functions in `api/`, workers in `workers/`. Expensive endpoints: forge generation, avatar
  generation, TTS, LLM proxies, x402 settlement, pump launches.
- Some abuse-prone endpoints may already have ad-hoc limits — unify them.

## Tasks
1. **Inventory + classify** every `api/*` endpoint by cost + abuse risk (free/cheap/expensive/mutating).
2. **Rate limiting:** apply consistent, configurable limits (per-IP + per-account + per-wallet where
   relevant) via one shared utility — not ad-hoc per file. Sensible 429s with `Retry-After`.
3. **Quotas:** enforce free-generation quotas + $THREE-holder multipliers server-side (don't trust the
   client); coordinate with gating (prompt 30).
4. **Abuse defenses:** bot/spam protection on public write endpoints (uploads, reviews, launches);
   captcha/proof-of-work or signed-request where appropriate; size/type limits on uploads.
5. **Cost guards:** hard ceilings on expensive operations; circuit-breakers when upstream providers
   error or costs spike; graceful "try again / use free lane" UX.
6. **Observability hooks:** emit rate-limit + quota events (coordinate with prompt 36) to spot abuse.

## Acceptance
- One shared rate-limit/quota utility applied across all public endpoints; correct 429 + Retry-After.
- Quotas + holder multipliers enforced server-side; uploads/writes bounded + protected.
- Cost ceilings + circuit-breakers in place; abuse events observable; legitimate flows unaffected.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles (`__defProp`/`createRequire`) — recover with `git restore -- api/ public/`. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.
