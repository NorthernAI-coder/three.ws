# Site UI — audit & prioritize the rollout

You are working in `/workspaces/three.ws`. We're bringing game-feel and a consistent
interaction bar to every front-end surface. Before the cluster work, produce a **real,
evidence-based audit** of the surfaces so the rollout is prioritized by impact, not
guessed. This prompt produces a document, not code.

## Scope

The front-end surfaces are the paired `src/<name>.js` + `src/<name>.css` modules. Get the
real list (don't trust this sample — regenerate it):

```
for f in src/*.css; do b=$(basename "$f" .css); [ -f "src/$b.js" ] && echo "$b"; done | sort
```

Cross-reference each to its public route via `data/pages.json` and its row in
`STRUCTURE.md`. ~31 surfaces; known clusters: markets/standings (leaderboard, trader,
signals, radar, pulse, watchlist, clash, vaults, labor-market), launch flow (launches,
launch-detail, launch-copilot, user-launcher, admin-launcher, deployments, genesis),
agents/identity (agent-detail, agent-picker, character(s), character-creator,
avatar-gallery-picker, first-meet, theater, three-gate), AI/reasoning (agi, alpha-copilot,
reasoning-ledger).

## For each surface, assess (by actually reading the .js/.css, not guessing)

1. **Live data?** Does it have an SSE/polling feed or real-time values that would benefit from count-up/flash/live-dot? (cite the code)
2. **Standings/competition shape?** Lists that rank, compete, or score → candidates for ladder treatment, FLIP reorder, sparklines.
3. **State coverage gaps.** Are loading/empty/error/overflow states all designed? Note missing ones (CLAUDE.md requires all five).
4. **Motion/consistency gaps.** Hardcoded colors/durations instead of tokens? Hard re-renders that snap? Missing hover/active/focus states? Inconsistent vocabulary vs `/swarms`?
5. **Game-feel opportunity** — the single highest-impact change for that surface, in one sentence.
6. **Importance signal** — route prominence (nav presence, `data/pages.json`), apparent traffic/centrality. Be honest where you can't measure; mark it.

## Output

Write `prompts/site-ui/AUDIT.md`:
- A table: surface · route · cluster · live-data? · standings? · missing states · top opportunity · priority (P0/P1/P2).
- A short prioritized rollout order with rationale — which cluster/surfaces to do first for maximum visible payoff, which are low-effort high-impact quick wins, which are large.
- A "consistency debt" section: shared problems (e.g. N surfaces hardcode colors, M lack empty states) that the foundation library or a sweep should fix once.

This is a read-and-write-one-doc task — **do not modify any surface code.** Use the
`Explore`/general-purpose agents to parallelize the reading if helpful, but the synthesis
and the table are yours.

## Definition of done

- `AUDIT.md` exists, covers every paired surface (count them — none skipped), and every claim cites the file it came from.
- The priority order is justified, not arbitrary.
- No source files modified. Nothing to commit unless the user asks.
