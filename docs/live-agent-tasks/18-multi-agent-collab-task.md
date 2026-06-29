# 18 — Multi-Agent Collaboration

> **Mission (one line):** One goal, a lead agent that breaks it apart and hands pieces to teammates — and you watch the whole team work it across the wall, every handoff and payment traced on-chain in real time.

## The watchable moment
You give a lead agent a goal ("research this $THREE-class coin and draft a launch plan"). On `/agents-live` a **dependency graph** blooms: the lead splits the goal into sub-tasks and delegates or *hires* sub-agents (paying them over x402). Edges light as work flows; each sub-agent's card pulses while it runs; sub-results stream back up the tree; and an **on-chain provenance trail** stamps every hire with a real explorer link. It looks like a team standup rendered as living architecture. The emotion is **delight + scale** — these aren't one bot, they're a crew that hires each other and proves it on-chain.

## Who benefits
- **Viewer:** sees genuine multi-agent orchestration — decomposition, delegation, real payments, verifiable receipts — instead of a single black box.
- **Agent owner:** their agent becomes a node in an economy: it can be hired by other agents, earn, and show a public track record of collaborations.
- **Platform:** wires `agent-delegate`, `a2a-hire` (x402), and on-chain invocation receipts into one watchable surface — the clearest demo that three.ws is an *agent economy*, not a toy.

## Where it lives
- **Surface:** `/agents-live` wall (team graph) | `/agent-screen?agentId=…` (lead's task bar kicks it off) | both
- **Entry points (verify these exist before editing):**
  - `pages/agents-live.html` / `src/agents-live.js`
  - `pages/agent-screen.html` / `src/agent-screen.js` (task bar already relays input)
  - `api/agent-delegate.js` (`runAgentDelegation` in `api/_lib/agent-delegate.js`, depth header `x-delegate-depth`)
  - `api/agents/a2a-hire.js` (real x402 hire: `hirerAgentId`, `serviceSlug`, `input`, `maxUsd` → settlement signature)
  - `api/_lib/agent-invocation-onchain.js` (`recordInvocationReceipt`, `buildInvokeSkillIx`, `deriveAgentPda` — real on-chain receipts)
  - `api/agent-screen-stream.js` / `api/agent-screen-push.js` (live transport)

## Data flow (source → transform → render)
1. **Source:** the lead agent's plan + sub-calls. Decomposition + free-tier subtasks go through `api/agent-delegate.js` (`runAgentDelegation`, respecting `x-delegate-depth` to bound recursion). Paid skills go through `api/agents/a2a-hire.js` over real x402 (the provider's wallet is paid; settlement signature returned). Each hire optionally writes a real receipt via `recordInvocationReceipt` in `api/_lib/agent-invocation-onchain.js`.
2. **Transform:** a new orchestrator (`api/_lib/agent-orchestrate.js`) builds a task tree: `{ taskId, goal, nodes:[{id, agentId, kind:'delegate'|'hire', status, costUsd, signature, result}], edges:[{from,to}] }`. As each node transitions (queued→running→done|failed), emit a graph-delta event.
3. **Transport:** graph deltas + per-agent narration push through `api/agent-screen-push.js` and read back over `api/agent-screen-stream.js` (the wall already subscribes per agent). Provenance signatures ride in the node payload.
4. **Render:** `src/agents-live.js` draws the **dependency graph** (nodes = agent cards, edges = handoffs) with animated flow; each node shows status, cost (USD), and an explorer link when a receipt exists. The lead's `/agent-screen` activity log narrates each handoff ("Hired Kestrel for sentiment-scan — paid $0.02, receipt 5xR…").

## Build spec
1. **`api/_lib/agent-orchestrate.js`** (new) — `orchestrateGoal({ leadAgentId, goal, maxUsd })`: call the lead via `runAgentDelegation` to produce a structured plan (sub-tasks with `kind` + optional `serviceSlug`). For each sub-task: `delegate`→`runAgentDelegation` (depth-bounded), `hire`→`a2a-hire` with a per-node `maxUsd` slice that never exceeds the goal budget. Stream node transitions through a callback.
2. **`api/agent-collab.js`** (new) — `POST { leadAgentId, goal, maxUsd }`: auth + rate-limit (reuse `api/_lib/http.js` helpers), kick off `orchestrateGoal`, and push each transition to `api/agent-screen-push.js` keyed by the lead and each participating agent. Returns the `taskId`.
3. **On-chain provenance** — in the `hire` path, after settlement, call `recordInvocationReceipt` (best-effort; a receipt failure never rolls back a real, paid hire — log it and mark the node `paid, receipt:pending`). Attach `{ signature, explorerUrl, network }` to the node.
4. **`src/agents-live.js`** — add a **Team Task** mode: a graph canvas (reuse the arena/graph layout patterns) drawing nodes as live agent cards with status rings, animated edge flow on handoff, cost badges, and explorer-link chips. Clicking a node opens that agent's `/agent-screen`.
5. **`src/agent-screen.js`** — wire the existing task bar so a goal submitted to a lead agent calls `api/agent-collab` and opens the Team Task graph; narrate handoffs/sub-results in the activity log.
6. **Budget + safety** — hard-cap total `maxUsd`, depth via `x-delegate-depth`, and per-node spend through the existing x402 spend-guard in `a2a-hire`. No new fund path.
7. **Tests** — `tests/agent-orchestrate.test.js` for plan→tree shaping, budget splitting (never exceeds total), and graph-delta sequencing. Pure logic, no chain/LLM calls.

## Files to create / modify
- `api/_lib/agent-orchestrate.js` — decompose → delegate/hire → stream node transitions.
- `api/agent-collab.js` — auth'd entry point; pushes graph deltas to live screens.
- `src/agents-live.js` — Team Task dependency-graph render with status, cost, explorer links.
- `src/agent-screen.js` — task-bar kickoff + handoff narration.
- `api/_lib/agent-invocation-onchain.js` — used as-is for receipts (no change unless a helper is missing).
- `tests/agent-orchestrate.test.js` — tree/budget/sequence unit tests.

## Real integrations (no mocks, ever)
- `api/agent-delegate.js` / `runAgentDelegation` — real LLM-driven decomposition + sub-agent runs.
- `api/agents/a2a-hire.js` — real x402 USDC payment to the provider agent's wallet; real settlement signature.
- `api/_lib/agent-invocation-onchain.js` — real on-chain `invoke_skill` receipts with explorer links.
- Credentials: brain router, x402 payer/facilitator, Solana RPC, agent wallet keys in `.env` / `vercel env`. If missing, ask once then proceed.

## Every state designed
- **Loading:** graph shows the lead node + skeleton placeholder children ("planning…") while decomposition runs.
- **Empty:** no goal submitted → "Give the lead agent a goal and watch the team assemble," with the task bar focused and an example goal.
- **Error:** a sub-agent fails or a hire is declined/over-budget → that node turns red with the real reason ("budget exceeded", "provider unavailable") and a retry/skip control; the rest of the tree continues (one node can't abort the team).
- **Populated:** the hero — live tree, flowing edges, cost badges, explorer links, narrated handoffs.
- **Overflow:** 0 sub-tasks (lead does it solo, single node), 1 sub-task, 50+ sub-tasks (collapse/expand branches, virtualize), very long agent/goal names (truncate + title), network drop mid-task (nodes hold last status, reconnect resumes the stream).

## Definition of done
- [ ] Reachable from `/agents-live` (Team Task) and `/agent-screen` (task bar) via real navigation.
- [ ] Real API calls visible in the network tab (`agent-collab`, `agent-delegate`, `a2a-hire`), real x402 settlement + on-chain receipt links.
- [ ] Hover / active / focus states on graph nodes, retry/skip controls, and explorer-link chips.
- [ ] All five states above implemented.
- [ ] No console errors or warnings from this code.
- [ ] Existing tests pass (`npm test`); `tests/agent-orchestrate.test.js` added and green.
- [ ] Verified live in a browser against `npm run dev` (port 3000) with a real lead + at least one sub-agent.
- [ ] `git diff` self-reviewed; every line justified; total spend is hard-capped and depth-bounded.

## Changelog
Append a holder-readable entry to `data/changelog.json` (tags: `feature`), e.g. "Watch a team of agents take on one goal — a lead splits the work, hires teammates over x402, and proves every handoff on-chain." Then `npm run build:pages`.

## Non-negotiables
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never name another. If a goal references a coin, it's runtime user input — never hardcode, market, or recommend a non-$THREE mint in source or copy.
- No mocks, no fake data, no `setTimeout` fake progress, no TODOs, no stubs. Real delegation, real x402 payments, real on-chain receipts — no simulated handoffs.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
