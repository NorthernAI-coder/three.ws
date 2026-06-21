# three.ws — Production → $1B Program

A complete, ordered set of self-contained prompts. **Run each one in a fresh chat.**
Every prompt is written to stand alone: it names the real files involved, the current
state, exactly what to build, and a hard definition of done. No prompt assumes context
from another chat.

The goal is not "more features." It is to make every surface that already exists
**real, reliable, and revenue-generating** — the bar set in [CLAUDE.md](../../CLAUDE.md):
no mocks, no stubs, no dead paths, every state designed, every integration wired to a
real API, and work you would demo to a room of senior engineers.

---

## How to run

1. Open a new chat in this repo.
2. Paste the full contents of one prompt file (or say "run prompts/production-1b/A01-….md").
3. Let it finish to its definition of done — including tests, a real browser/API check,
   and a changelog entry — before moving on.
4. Commit + push to **both** remotes (`threeD` and `threews`) per CLAUDE.md.
5. Tick the box in the tracker below and start the next.

Each prompt header declares:
- **Phase** — which track it belongs to.
- **Depends on** — prompts that should land first (most are independent).
- **Parallel-safe** — whether two agents can run it alongside others without colliding.

Concurrent agents share this worktree. Stage explicit paths only — never `git add -A`.

---

## The thesis (why these, in this order)

A $1B platform on a token economy needs three things to be true at once, and the phases
map to them:

1. **The money is provably real.** The $THREE buyback, reflections, tiers, and x402
   payments must execute on-chain, be auditable, and be enforced everywhere — not
   aspirational. → **Phase A**
2. **Every surface that touches money is world-class.** The token page, onboarding,
   checkout/swap, marketplace, forge, studio, agent pages. → **Phase B**, then the
   discovery and 3D surfaces that feed them → **Phase C, D**.
3. **It never falls over and it compounds.** Observability, resilience, security, the
   developer ecosystem (network effects), and the growth/quality loops. → **Phase E, F, G**

Recommended execution order: **A → B → E → C → D → F → G**, but Phase E (infra) prompts
are safe to interleave early, and Phase G (quality) prompts are safe to run anytime.

---

## Phases & prompts

### Phase A — Make the money provably real (highest leverage)
- [ ] `A01` — $THREE buyback engine: scheduled, on-chain, audited, public proof
- [ ] `A02` — $THREE reflections/rewards: complete on-chain distribution + receipts
- [ ] `A03` — Hold-to-access tiers enforced across every paid endpoint
- [ ] `A04` — Holder snapshot freshness, reconciliation & alerting
- [ ] `A05` — On-chain token-config validation + public token-economy & trust dashboard
- [ ] `A06` — Treasury/buyback custody hardening (vault + approval gate + audit)
- [ ] `A07` — x402 pricing: single source of truth + discoverable service catalog
- [ ] `A08` — x402 per-wallet metering, rate-limit headers & usage endpoint
- [ ] `A09` — x402 facilitator failover + self-hosted fallback + admin health/metrics
- [ ] `A10` — Agent-to-agent payments: dispute/refund + on-chain reputation
- [ ] `A11` — Inline "Payment Required" (402) pay modal everywhere

### Phase B — World-class revenue surfaces
- [ ] `B01` — $THREE token page production pass
- [ ] `B02` — Onboarding / Get Started wizard production pass
- [ ] `B03` — Payment modal + Jupiter swap production pass
- [ ] `B04` — Marketplace + detail + creator profiles production pass
- [ ] `B05` — Forge (text/image → 3D) end-to-end production pass
- [ ] `B06` — Auth (sign-in/up, session, wallet) production pass
- [ ] `B07` — Dashboard hub + account + analytics + API keys production pass
- [ ] `B08` — Agent Studio (brain/memory/body/money/skills) production pass
- [ ] `B09` — Agent profile pages + embeddable widget production pass
- [ ] `B10` — Launch-a-coin + launches feed production pass

### Phase C — Discovery, social & intelligence
- [ ] `C01` — Oracle conviction engine + Arm automation production pass
- [ ] `C02` — Activity + Trending + Feed + Community production pass
- [ ] `C03` — Leaderboards + Smart Money + Radar production pass
- [ ] `C04` — Galleries (avatars, animations, agent discovery) production pass

### Phase D — 3D / AR / world experiences
- [ ] `D01` — Avatar pipeline reliability (forge → auto-rig → animate) hardening
- [ ] `D02` — Walk companion + playground + leaderboard + embed production pass
- [ ] `D03` — IRL (AR placement) + Play (coin worlds, multiplayer) production pass
- [ ] `D04` — Creator tools (Scene Studio, Compose, Pose, Voice, Scan) production pass

### Phase E — Platform infrastructure & reliability
- [ ] `E01` — Structured logging + request correlation + tracing
- [ ] `E02` — Error telemetry dashboard + tiered alerting & escalation
- [ ] `E03` — Health/readiness endpoint + dependency checks + status page
- [ ] `E04` — Circuit breakers + adaptive retry for all external dependencies
- [ ] `E05` — Redis quota: proactive monitoring + degraded-feature signaling
- [ ] `E06` — Migrations: remove CREATE TABLE from handlers, add versioning & rollback
- [ ] `E07` — Cron + worker health: execution history, SLA, dashboard
- [ ] `E08` — SSRF + input sanitization + secret-scanning hardening
- [ ] `E09` — Data layer: read-replica routing, partitioning, backup/restore drills
- [ ] `E10` — CI/CD: test gate, e2e on money paths, publish automation

### Phase F — Developer ecosystem (network effects)
- [ ] `F01` — Unified developer guide + runnable examples + quickstarts
- [ ] `F02` — SDK tests + versioning + release automation + changelogs
- [ ] `F03` — MCP servers: reconcile duplicates, e2e tests, registry & DX polish
- [ ] `F04` — x402 / Bazaar discoverability + indexing

### Phase G — Quality, trust & growth (escape velocity)
- [ ] `G01` — Accessibility (WCAG 2.2 AA) platform-wide
- [ ] `G02` — Performance budgets + Core Web Vitals + 3D runtime perf
- [ ] `G03` — Mobile / responsive audit platform-wide
- [ ] `G04` — SEO + structured data + OG + LLM discoverability
- [ ] `G05` — Security & payments/custody review pass
- [ ] `G06` — Conversion analytics + funnels + experimentation harness
- [ ] `G07` — Referral / affiliate + viral loops + creator incentives
- [ ] `G08` — Lifecycle comms: changelog + email/notifications + re-engagement

---

## The shared bar (every prompt inherits this)

Do not mark a prompt done until all are true (this is CLAUDE.md's Definition of Done):

- Code is wired into the UI / API and reachable by a real user — no dead paths.
- No mocks, no fake/sample data, no `TODO`, no `throw new Error("not implemented")`,
  no commented-out code, no fake `setTimeout` loading.
- Every state is designed: loading (skeletons), empty (actionable), error (recoverable),
  populated, overflow.
- Real network calls succeed against real APIs; errors handled at the boundary.
- Existing tests pass (`npx vitest run`) and you added tests for new logic.
- Accessible (semantic HTML, ARIA, keyboard, focus, contrast) and responsive (320/768/1440).
- `$THREE` is the only coin referenced anywhere (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).
- A holder-readable entry appended to `data/changelog.json` for any user-visible change;
  `npm run build:pages` passes.
- `git diff` self-reviewed; committed and pushed to **both** remotes.

If you cannot verify a step, say so explicitly. Do not claim done.
