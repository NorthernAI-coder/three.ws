# Task 05 — Reputation, Credit & Access

> Read [00-README-orchestration.md](./00-README-orchestration.md) in full first
> (ownership model, $THREE law, real APIs, design system, run loop, worktree rules).

## Mission (one line)

Turn an agent wallet's **real on-chain life** — tips, volume, $THREE held, holding
consistency, age, payouts — into a **reputation score** that unlocks worlds,
cosmetics, and trust across the platform.

## Why this is gamechanging

Wallets are anonymous and trustless to a fault — you can't tell a real long-term
participant from a fresh throwaway. An *agent* with a persistent custodial identity
can earn a reputation that means something, computed transparently from real on-chain
behavior. That reputation becomes a **key**: it gates access to worlds, unlocks
cosmetics (Task 01 auras, Task 04 card finishes), signals trust in commerce (Task 02),
and gives owners a long-term reason to behave well and hold $THREE. It's a credit
system for embodied agents — nobody has this because nobody else has the agent.

## What you are building

1. **A transparent reputation engine** (server-side, real data) — compute a per-agent
   score from real signals, each documented and auditable:
   - tips received/given (real custody events), x402 service volume, trade volume,
     realized PnL consistency, **$THREE held + holding duration**, wallet age, launch
     participation, payout/distribution history. Weight them; show the breakdown.
   - Persist computed scores + components (a table or `meta`), recompute on a real
     cadence (cron/worker) from real reads — never a random or hardcoded number.
   - Extend/复用 `api/agents/:id/reputation` (grep the existing reputation surface and
     build on it, don't fork a parallel one).
2. **Tiers + badges** — a small, legible set of tiers derived from the score, surfaced
   as a badge wherever agents appear (reuse the shared identity layer; one badge
   component). The badge is honest: it links to the transparent breakdown.
3. **Access & unlocks** — a real gating helper (`src/shared/wallet-access.js`) that
   any surface calls to check "does this viewer's agent meet tier/holdings/$THREE
   requirement X?" Wire concrete unlocks: gated world areas/abilities
   (`play/arena.js`, `irl.js`), cosmetic tiers (Task 01/04), and trust hints (Task 02).
   Gating is checked **server-side** for anything that grants real capability or
   access to protected data — never client-only.

## Real data & APIs

- `GET /api/agents/:id/solana/custody`, `/holdings`, `/trade-history`, `/activity`,
  wallet age from the agent record, $THREE balance via holdings vs. the CA in
  `00-README`, launch/payout history from `pump_agent_mints` / `coin_*` tables.
- `GET /api/agents/:id/reputation` (extend). Recompute via a real worker.
- Access checks: a server route that returns the viewer's effective unlocks; client
  helper reads it and reflects state, but the server enforces.

## UX spec

- **States**: computing/new (a real "reputation is building" state with what to do to
  earn it — not a fake score), tiered, error (degrade to identity-only, never a broken
  badge). Empty: a new agent sees an honest path to its first tier.
- **Viewer roles**: anyone can see an agent's public reputation tier + breakdown
  (it's a public trust signal); only the owner sees private components if any are
  owner-sensitive; access checks reflect the *viewer's* own agent for unlocks.
- **Transparency UI**: tapping a badge shows exactly how the score was earned (real
  components, real values) — trust requires legibility. No mystery meters.
- **Microinteractions/a11y/responsive/perf** per README; badge is text + icon, not
  image-only; tier-up is a tasteful moment.

## Edge cases

Brand-new agent (no history) · gamed signals (cap/normalize so wash-tipping yourself
can't inflate — design against it, document the mitigation) · score recompute lag ·
agent that sold all $THREE (duration resets honestly) · private/unlisted agents
(respect visibility) · access check when logged-out (gracefully prompt) · ensuring a
client can't fake a tier to enter a gated area (server-enforced).

## Definition of done

Meets the README DoD, plus: scores come from a real, documented, recomputed pipeline
over real on-chain/DB data (zero hardcoded/random values); the badge appears
consistently via the shared identity layer; at least one real unlock (a gated world
area or a cosmetic tier) is wired and **server-enforced**; the breakdown is
transparent; anti-gaming mitigations are implemented and noted.

## Then: improve, then delete this file

Push it: reputation-weighted leaderboard seasons, a "what unlocks next" tracker, or
$THREE-holder-exclusive cosmetics. Update `data/changelog.json`. **Then delete this
prompt file.**
</content>
