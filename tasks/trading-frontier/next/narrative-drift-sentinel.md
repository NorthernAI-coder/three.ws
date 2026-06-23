# Task — Narrative Drift Sentinel (detect creator/story pivots + sentiment decay)

> **Operating bar.** Senior engineer + product thinker building three.ws to beat the best in the
> world. Genuinely innovative, not a clone. No mocks, no fake/sample data, no placeholders, no
> TODO/stubs, no `setTimeout` fake-loading. Wire 100% end-to-end with REAL APIs and real on-chain
> data. The only coin is **$THREE** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); runtime mints
> in generic trade plumbing are the only exception and are never promoted.

## ⛓ Chain protocol — do this as STEP 0, before building

This task is a node in a self-extending chain (see `tasks/trading-frontier/README.md`). Before you
build the feature below:
1. Read all of `tasks/` (every epic) + `tasks/trading-frontier/BACKLOG.md`. Know what exists/planned.
2. Invent **10 genuinely new, non-duplicate feature ideas**, each innovative, grounded in the real
   three.ws codebase (cite real files/APIs/tables), advancing sniping/trading/launching/buying/selling.
3. Write each as a full prompt in `tasks/trading-frontier/next/<slug>.md`, matching this file's
   structure exactly — including this Chain protocol section, so the chain continues.
4. Append one line per new prompt to `BACKLOG.md` after confirming it isn't a duplicate.
5. Only then build YOUR feature to the **production-ready bar** in the epic README, and `git rm`
   this file in the completion commit.

## The invention

A memecoin lives or dies on its narrative, and the deadliest tell is when the *story changes* — the
creator quietly rebrands, deletes the original thesis, or the community sentiment that pumped it
curdles into exit-liquidity chatter. Build a **narrative drift sentinel**: continuously diff a coin's
current narrative + sentiment against its launch narrative using the oracle narrative engine and the
platform's social sources, and red-flag launches whose story pivoted or whose sentiment decayed past
a threshold — before the price catches up to the vibe. It is fundamental analysis for assets whose
only fundamental is the story.

## Context (real, verified)

- Narrative engine + history: the `oracle_narrative` table (per-coin narrative the oracle already
  derives) — the baseline to diff against.
- Social + data sources: `api/_lib/oracle/sources.js` (the existing source connectors the oracle
  pulls from) for current community signal.
- Archetype/classification: `api/_lib/oracle/archetype.js` (how the oracle types a launch) to detect
  an archetype/thesis flip.
- Live sentiment: the MCP `sentiment_pulse` tool (token sentiment pulse) for the decay signal.

## Goal

A sentinel that, per watched/held coin, computes a narrative-drift score and a sentiment-decay score
against the launch baseline, and fires a graded red-flag (with the specific change) when the story
no longer matches what the user bought.

## What to build

1. **Narrative baseline + diff** — snapshot the launch narrative from `oracle_narrative` and
   periodically re-derive the current narrative, computing a semantic drift score and surfacing the
   specific pivot (thesis change, archetype flip via `api/_lib/oracle/archetype.js`).
2. **Sentiment-decay track** — pull current community signal via `api/_lib/oracle/sources.js` +
   `sentiment_pulse`, maintain a rolling sentiment curve, and detect decay/flip past a threshold.
3. **Graded red-flags** — combine drift + decay into a watch/caution/exit signal with a plain-language
   explanation of exactly what changed (e.g. "creator deleted launch thesis; sentiment flipped").
4. **Stream + action** — push flags through the existing alert/stream surface; offer a one-tap
   protected exit on held positions.
5. **UI** — a "Narrative health" panel per coin: launch-vs-now narrative diff, sentiment sparkline,
   flag severity, and the explanation. All states designed; responsive; accessible.
6. **Honest signals** — distinguish healthy narrative *evolution* from a pivot/abandonment; never
   flag on noise, and always show why a flag fired.

## Constraints

- Any exit/entry triggered honors spend guards (`api/_lib/agent-trade-guards.js`), custody audit
  (`agent_custody_events`), and the firewall (`api/_lib/trade-firewall.js`) on buys.
- $THREE is the only promoted coin; analyzed runtime mints are trade data only.
- No mocks, stubs, or fake sentiment — real oracle narrative, real sources, real sentiment only.

## Success criteria

- Reachable in the UI for watched/held coins; a real narrative pivot or sentiment decay produces a
  graded, explained red-flag with a working protected exit.
- Real `oracle_narrative` / `oracle/sources` / `sentiment_pulse` data; guard-honored, custody-audited.
- All states designed; responsive at 320/768/1440; accessible (ARIA, keyboard, focus, contrast,
  reduced-motion).
- `npm run build`, `npm run typecheck`, `npm test` clean; `data/changelog.json` entry (tags:
  feature); completionist passes; chain extended with 10 new registered prompts.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/narrative-drift-sentinel.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
