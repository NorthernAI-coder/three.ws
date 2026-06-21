# three.ws → Production-Ready · Prompt Library

A sequenced set of **self-contained prompts**. Run each one in a **fresh chat**. Each
file is written so an agent with zero prior context can read it, orient itself in the
repo, and ship the work end-to-end at the bar set by `CLAUDE.md`.

This library is the plan to take three.ws from "technically strong on core paths" to
**production-grade and category-leading** — the work that compounds into a credible
$1B platform: reliability, security, a complete revenue engine, finished product
surfaces, a growth/conversion funnel, developer experience, and the test/ops
discipline that lets all of it scale.

---

## How to use this

1. Open a new chat in this repo.
2. Paste the contents of one `Pxx-*.md` file (or say "run `prompts/production-readiness/Pxx-*.md`").
3. The agent executes that one workstream to done, including tests and a changelog
   entry where user-visible.
4. Commit/push when you're satisfied (the agent will not push unless you ask).

Run roughly in priority order (P0 → P1 → P2). Within a priority, the `Depends on:`
field tells you what must land first. Many P1/P2 prompts are independent and can run
in parallel across separate chats.

---

## The shape of every prompt

Each file follows the same template so they're predictable to run:

- **Header** — workstream, priority, effort, dependencies.
- **Before you start** — fresh-chat orientation (read `CLAUDE.md` + `STRUCTURE.md`; the $THREE-only rule).
- **Context** — what the system is and the exact files involved.
- **Problem / opportunity** — the evidence-based gap.
- **Mission** — what to ship.
- **Scope** — in/out.
- **Implementation guide** — concrete, file-by-file.
- **Definition of done** — checklist aligned to `CLAUDE.md`.
- **Verification** — how to prove it works.
- **Guardrails** — the non-negotiables (no mocks, $THREE only, both remotes, etc.).

---

## Workstreams

### A · Backend reliability & observability  (`api/`, `workers/`)
| # | Prompt | Priority |
|---|--------|----------|
| P01 | Cron idempotency & money-moving safety | P0 |
| P02 | x402 settlement reliability & stuck-payment recovery | P0 |
| P03 | Forge backend availability probes & config validation | P0 |
| P04 | Solana RPC circuit breaker & resilient fallback | P1 |
| P05 | Rate-limit resilience under Redis outage + per-client x402 verify cap | P1 |
| P06 | Idempotency-Key support on create/mutation endpoints | P1 |
| P07 | Observability: metrics, tracing, real-time dashboards | P1 |
| P08 | Database query observability & connection-pool monitoring | P1 |
| P09 | Session security hardening | P1 |
| P10 | Secrets rotation strategy & vault integration | P1 |

### B · Security & compliance
| # | Prompt | Priority |
|---|--------|----------|
| P11 | Dependency scanning in CI + fix `legacy-peer-deps` risk | P0 |
| P12 | SAST + secret scanning in CI | P0 |
| P13 | CSRF protection on state-changing endpoints | P0 |
| P14 | CSP tightening (nonces, drop `unsafe-inline`/`unsafe-eval`) | P1 |
| P15 | Threat model + external security-audit prep | P1 |
| P16 | Privacy center, data export/delete, retention policy | P1 |
| P17 | Legal: Terms, Privacy, Acceptable Use, Payment Terms | P1 |

### C · Monetization completion (revenue engine)
| # | Prompt | Priority |
|---|--------|----------|
| P18 | Subscriptions / time-pass settlement | P0 |
| P19 | Agent revenue payouts + per-agent earnings ledger | P0 |
| P20 | Enforce remaining $THREE tier perks | P1 |
| P21 | Revenue analytics dashboards (per-endpoint / creator / agent) | P1 |
| P22 | EVM x402 lane scale validation (Base Permit2, Arbitrum) | P0 |
| P23 | Pricing page, plans & clear rate cards | P1 |
| P24 | Referral revenue engine, end-to-end | P1 |

### D · Product surface completion
| # | Prompt | Priority |
|---|--------|----------|
| P25 | Marketplace reviews & ratings | P1 |
| P26 | Inline chat integration (agent detail + marketplace) | P1 |
| P27 | Scene Studio persistence + scene gallery | P1 |
| P28 | Avatar gallery 3D previews | P1 |
| P29 | Avatar rig fallback UX | P1 |
| P30 | Dashboard analytics charts (real visualizations) | P1 |
| P31 | Bounties, end-to-end (detail, submit, escrow) | P1 |
| P32 | Dashboard x402 payment history | P1 |
| P33 | Custom 404 + designed error pages | P1 |
| P34 | Real-time leaderboards | P2 |
| P35 | Agent skills preview modals | P2 |
| P36 | Create-Agent wizard onboarding polish | P1 |

### E · Growth, conversion & retention
| # | Prompt | Priority |
|---|--------|----------|
| P37 | Role-based landing architecture | P1 |
| P38 | Progressive / guest onboarding (try before signup) | P1 |
| P39 | Public metrics dashboard (platform stats) | P1 |
| P40 | Gamified leaderboards | P2 |
| P41 | Viral share loops (create→share in one step) | P1 |
| P42 | Social proof: testimonials & success metrics | P2 |
| P43 | Competitive positioning / comparison page | P2 |
| P44 | Empty-state & microinteraction polish pass | P1 |
| P45 | Product-tour / video landing | P2 |
| P46 | Notifications & retention hooks | P2 |

### F · SEO, content & developer experience
| # | Prompt | Priority |
|---|--------|----------|
| P47 | Developer portal / docs homepage | P1 |
| P48 | Interactive OpenAPI explorer | P2 |
| P49 | Blog index + content strategy | P2 |
| P50 | SDK docs, per-package CHANGELOGs & examples | P1 |
| P51 | SEO + structured-data audit & internal linking | P2 |
| P52 | `llms.txt` + agent discoverability | P2 |

### G · Testing, CI & quality
| # | Prompt | Priority |
|---|--------|----------|
| P53 | API endpoint test-coverage expansion | P1 |
| P54 | E2E coverage for revenue paths | P1 |
| P55 | Load & stress testing harness | P2 |
| P56 | Lighthouse in CI + perf budgets + RUM | P1 |
| P57 | Typecheck as a hard gate | P2 |
| P58 | Coverage instrumentation & thresholds | P2 |

### H · On-chain & contracts
| # | Prompt | Priority |
|---|--------|----------|
| P59 | Deploy AgentPayments (EVM) multi-chain + wire SDK | P0 |
| P60 | Contract third-party audit prep | P1 |
| P61 | Upgrade-authority migration to multisig/cold keys | P1 |

### I · Ops, deploy & incident response
| # | Prompt | Priority |
|---|--------|----------|
| P62 | Runbooks + incident response + on-call | P0 |
| P63 | Canary/blue-green deploy + automated rollback | P1 |
| P64 | DB migration versioning & safe rollback | P0 |
| P65 | Uptime alerting & escalation | P1 |

---

## Suggested first wave (the P0s)

Land these before anything else — they de-risk money movement, security, and the
ability to recover from incidents:

`P01` `P02` `P03` `P11` `P12` `P13` `P18` `P19` `P22` `P59` `P62` `P64`

---

## Non-negotiables baked into every prompt

These come from `CLAUDE.md` and are restated in each file because each runs fresh:

- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never name, link, or recommend any other.
- **No mocks, fake data, stubs, TODOs, or commented-out code.** Real APIs, real integrations, finished work.
- **Every state designed** (loading/empty/error/populated), accessible, responsive.
- **Changelog discipline** — user-visible changes get a `data/changelog.json` entry; `npm run build:pages` validates it.
- **Two remotes** — push to both `threeD` and `threews`, only when asked. Never pull/fetch from `threeD`.
- **Concurrent agents share this worktree** — stage explicit paths, re-check `git status` before committing.
