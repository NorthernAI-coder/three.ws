# Trading Frontier — A Self-Extending Chain of Great Ideas (Epic)

This epic is different from a normal backlog: it is a **compounding chain**. It seeds 10
innovative features (01–10). Every agent that picks up a task does TWO things — it **extends the
chain** by authoring 10 brand-new, non-duplicate prompts for the next generation, and it **ships
its own feature 100% production-ready**. The chain grows breadth while each node delivers depth.

The goal is a continuously expanding frontier of genuinely game-changing capabilities for crypto
sniping, trading, launching, buying, and selling on three.ws — each one real, wired, and
shippable. No idea is allowed to be a clone. No feature is allowed to ship half-built.

## Two companion epics already exist — read them so you never duplicate

- `tasks/next-gen-trading/` — firewall, MEV execution, smart-money graph, pre-launch radar, NL
  strategy compiler, signal marketplace, swarms, launch copilot, mission control, arena.
- `tasks/agent-wallet-trading/` — agent-wallet foundation (some tasks shipped + deleted).

Before inventing anything, read both, this epic, and `BACKLOG.md`. If an idea overlaps something
already built or planned, it is NOT new — invent something else.

## The chain protocol (every task file repeats this; honor it exactly)

When an agent begins ANY task in this epic, **step 0** (before building the feature) is:

1. **Read the whole backlog.** All of `tasks/` (every epic dir) + `tasks/trading-frontier/BACKLOG.md`.
   Build a mental set of what already exists in code and what is already planned.
2. **Invent 10 genuinely NEW feature ideas** — none may duplicate or trivially restate anything in
   code or any existing task file. Each must be (a) innovative — something users can't get on
   competing platforms; (b) grounded in the REAL three.ws codebase (cite real files/APIs/tables);
   (c) advancing sniping / trading / launching / buying / selling or the agent platform.
3. **Write each as its own prompt** in `tasks/trading-frontier/next/<short-kebab-slug>.md`, using
   the EXACT structure of this epic's task files: the operating bar, the chain protocol (so the
   chain continues), the production-ready bar, real context with file refs, goal, what to build,
   constraints, success criteria, and the self-delete footer. Quality bar: each prompt must be as
   thorough and grounded as 01–10 here. A vague or generic prompt is a failed chain link — don't
   write one.
4. **Register them** — append one line per new prompt to `BACKLOG.md` (slug — one-line hook —
   `proposed by <task NN>`), AFTER confirming no existing line covers the same idea. Dedup is
   mandatory; the chain dies if it loops on the same ideas.
5. Only after the 10 new prompts are authored and registered do you build YOUR feature to the
   production-ready bar below, then `git rm` your own task file in the completion commit.

Governance so the chain stays great, not just big:
- **Novelty gate:** if you cannot honestly say an idea is new and valuable, drop it and find a
  better one. Ten strong prompts beat ten filler prompts. Never pad.
- **Grounding gate:** every new prompt must reference real files/tables/APIs that exist today.
- **No infinite trivia:** chained ideas must be substantial features, not micro-tweaks.
- `BACKLOG.md` is the single source of truth for what's claimed; check it first, append last.

## The production-ready bar (a task is NOT done until ALL are true)

This is the `CLAUDE.md` "Definition of done", restated as the gate for shipping a chain node:

- [ ] Built, wired into the UI, reachable by the user via real navigation — no hidden routes.
- [ ] 100% real APIs + real data/on-chain. Zero mocks, zero fake/sample arrays, zero placeholders,
      zero TODO/stubs, zero `throw new Error("not implemented")`, zero `setTimeout` fake-loading.
- [ ] All trade paths honor existing spend guards (`api/_lib/agent-trade-guards.js`), custody audit
      (`agent_custody_events`), and the firewall (`tasks/next-gen-trading/01`) when buying.
- [ ] Every state designed: loading (skeletons), empty (tells the user what to do), error
      (actionable + recovery), populated, overflow. Hover/active/focus on every interactive element.
- [ ] Responsive at 320/768/1440; accessible (semantic HTML, ARIA, keyboard nav, focus rings,
      contrast, reduced-motion); console-clean (no errors/warnings from your code).
- [ ] Network tab shows real API calls succeeding with real data; exercised in a real browser.
- [ ] The only coin referenced anywhere is **$THREE** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).
      Runtime-supplied mints in generic trade plumbing are the only exception, never promoted.
- [ ] `npm run build`, `npm run typecheck`, `npm test` all clean.
- [ ] `data/changelog.json` entry for every user-visible change; new pages added to `data/pages.json`.
- [ ] The **completionist** subagent passes on your changed files.
- [ ] `git diff` self-reviewed; then a self-improvement pass — find what makes it 10× better, ship
      that too — before claiming done.

Concurrent agents share one worktree: stage explicit paths only (never `git add -A`/`git add .`),
re-check `git status` and `git diff --staged` immediately before committing.

## Seed ideas (generation 0)

| #  | Feature                                                              |
|----|----------------------------------------------------------------------|
| 01 | Conversational Trading Copilot (voice + chat, in-world execution)     |
| 02 | Programmable Orders Engine (limit / stop / DCA / TWAP / conditional)  |
| 03 | Portfolio Intelligence & Risk Command (unified cross-wallet)         |
| 04 | Graduation Predictor (calibrated ML model on intel + outcomes)       |
| 05 | Multi-Chain Agent Treasury & Bridge                                  |
| 06 | Creator Reputation & Anti-Scam Registry                              |
| 07 | Universal Wallet Mirror (copy any external on-chain wallet)          |
| 08 | Real-Time Alert & Automation Engine (push / Telegram / in-app)       |
| 09 | AMM Migration & New-Pool Sniper                                      |

When every numbered seed file AND every chained `next/` file has shipped and been deleted, and
`BACKLOG.md` is empty, delete this README.
