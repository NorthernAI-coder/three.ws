# 12 — Reputation Arena

> **Mission (one line):** A live leaderboard where agents are ranked by their real on-chain ERC-8004 reputation — tiers, badges, head-to-head — and each agent's screen shows the actual a2a-hire receipts that earned the score.

## The watchable moment
On `/agents-live` the wall reorders itself into an arena: agents sorted by their real on-chain reputation, each card stamped with a tier badge (Prime / Strong / Lean) and a live average-score chip (`4.6 ★ · 312 votes · 18.4 SOL staked`). When a new on-chain `FeedbackSubmitted` lands, a card pulses and climbs a rank with a smooth FLIP animation. Click into `/agent-screen?agentId=…` and the avatar panel sits beside a reputation history — a real timeline of feedback events and recent a2a-hire receipts that built the number, each one a verifiable on-chain transaction with a Solscan/explorer link. The emotion: competition you can trust, because every point is on-chain.

## Who benefits
- **Viewer:** a trustworthy way to find the best agents — reputation that can't be faked because it's read straight off ERC-8004 registries.
- **Agent owner:** a public reason to do good work; reputation that compounds into more hires and a higher arena rank.
- **Platform:** closes the loop between hiring (`api/agents/a2a-hire.js`) and reputation — every completed hire is a receipt that, when scored, moves the agent up the wall. Wiring it makes the marketplace self-reinforcing.

## Where it lives
- **Surface:** both — `/agents-live` arena ranking + badges, and `/agent-screen?agentId=…` reputation history + receipts panel.
- **Entry points (verify these exist before editing):**
  - `pages/agents-live.html` / `src/agents-live.js` (card grid → arena sort + badges)
  - `pages/agent-screen.html` / `src/agent-screen.js` (add reputation history panel beside avatar/log)
  - `mcp-server/src/tools/agent-reputation.js` — tool `agent_reputation` (accepts agentId / `0x…` wallet / CAIP-10; returns identity + reputation `{averageX100, average, count, totalStakeWei}` + latest events)
  - `mcp-server/src/lib/erc8004.js` — registries (IdentityRegistry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, ReputationRegistry `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`), ABIs, CHAINS map
  - `packages/reputation/src/index.js` — zero-dep SDK client for on-chain reads
  - `api/agents/a2a-hire.js` — completed-hire receipts (status, skill_name, amount, signatures, explorer links)

## Data flow (source → transform → render)
1. **Source:** real on-chain reads. A new endpoint `api/agents/reputation.js` reads ERC-8004 `ReputationRegistry`/`IdentityRegistry` via `packages/reputation` (ethers `JsonRpcProvider`, default Base) for a batch of agent wallets — no indexer, no cached fallback scores. Receipts come from the a2a-hire ledger surfaced by `api/agents/a2a-hire.js` (completed invocations with on-chain signatures).
2. **Transform:** map `averageX100`/`count`/`totalStakeWei` → display average + tier. Define tiers from real distribution (e.g. Prime ≥ 4.5 with ≥ N votes, Strong ≥ 4.0, Lean ≥ 3.0, else Unrated). Sort the arena by `(tier, average, count)`. For the agent page, merge feedback events + a2a-hire receipts into one reverse-chronological timeline.
3. **Transport:** arena ranking fetched on load + refreshed on a sane cadence (reputation moves slowly — poll/30–60s, not per-frame). On `/agent-screen`, a rank change or new feedback event can also be surfaced as an `api/agent-screen-push` `type:"analysis"` log line ("New 5★ feedback — climbed to rank 3").
4. **Render:** `/agents-live` cards show tier badge + score chip and FLIP-animate on rank change; `/agent-screen` renders the reputation timeline (sparkline of average over events) + receipt cards with explorer links.

## Build spec
Concrete, ordered steps.
1. **Reputation read endpoint** — create `api/agents/reputation.js`: `GET ?agentIds=…` (batch) returns `{ [agentId]: { average, count, totalStakeWei, tier, walletResolved, events } }` by calling `packages/reputation` against the canonical registries. Cache per-agent in Redis with a short TTL (e.g. 60s) to stay within RPC limits — cache is a rate-limit cushion, not a fake value (always a real prior read).
2. **Tiering (pure logic)** — add a small `tierFor({ average, count })` pure function with thresholds; unit-test it (boundaries, zero-vote → Unrated). Export for reuse on the agent page.
3. **Arena sort + badges** — in `src/agents-live.js`, after roster fetch, request reputation for the visible page, attach badge + score chip to each card, and sort by tier/score. Use a FLIP transition so reorders animate instead of jumping.
4. **Reputation panel on the agent screen** — in `pages/agent-screen.html` add a `#asc-reputation` panel (consistent with existing floating panels) and in `src/agent-screen.js` populate it: average + tier header, an events sparkline, and a receipts list from `api/agents/a2a-hire.js` (skill, amount USDC, status, explorer link).
5. **Live nudge (optional but wired)** — when a new feedback event is detected for the agent being watched, push a `type:"analysis"` log line via `api/agent-screen-push` so the change shows in the activity log too.
6. **Resolution edge cases** — agents without an ERC-8004 identity / wallet render an honest "Unrated — no on-chain reputation yet" state, never a fabricated score.

## Files to create / modify
- `api/agents/reputation.js` — batch on-chain reputation read (Redis-cushioned) (new)
- `src/agents-live.js` — arena sort, tier badges, score chips, FLIP reorder (modify)
- `pages/agent-screen.html` — `#asc-reputation` panel markup + styles (modify)
- `src/agent-screen.js` — populate reputation timeline + a2a-hire receipts (modify)
- `src/shared/reputation-tier.js` (or co-located) — `tierFor()` pure function + test (new)

## Real integrations (no mocks, ever)
- Real ERC-8004 on-chain reads via `packages/reputation` against `0x8004…` registries (default Base, CHAINS map for others).
- Real a2a-hire receipts from `api/agents/a2a-hire.js` with real on-chain signatures + explorer links.
- Real `api/agent-screen-push` for the live nudge.
- Credentials: an EVM RPC URL (Base) in `.env` / `vercel env`; Upstash Redis for the read cushion. If missing, ask once then proceed.

## Every state designed
- **Loading:** card score chips and the agent-page timeline show a skeleton shimmer while the on-chain read resolves — not a spinner.
- **Empty:** agent has no ERC-8004 identity → "Unrated — complete a hire to earn on-chain reputation" with a link to the marketplace; arena with no rated agents → an explainer of how reputation works.
- **Error:** RPC failure → "Reputation temporarily unavailable" with a retry, and the last good cached read shown with a "stale" marker (real prior value, clearly labeled) — never a fabricated number.
- **Populated:** ranked arena with badges + score chips; agent page with timeline sparkline + receipt cards — the hero state.
- **Overflow:** 0 votes (Unrated), 1 vote (shown but tier-gated), 1000+ events (paginate the timeline), very long agent name (clamp), negative `averageX100` (signed int — render honestly), mid-load RPC drop (stale-cache fallback).

## Definition of done
- [ ] Reachable: arena ranking on `/agents-live`, reputation panel on `/agent-screen` via real navigation.
- [ ] Real on-chain reads + real a2a-hire receipts visible in the network tab.
- [ ] Hover / active / focus states on badges, score chips, receipt cards, explorer links.
- [ ] All five states implemented (including stale-cache marker).
- [ ] No console errors or warnings from this code.
- [ ] Existing tests pass (`npm test`); add a test for `tierFor()` boundaries.
- [ ] Verified live in a browser against `npm run dev` (port 3000).
- [ ] `git diff` self-reviewed; every line justified.

## Changelog
Append a holder-readable entry to `data/changelog.json` (tag `feature`): "Agents now compete in a live reputation arena — ranked by their real on-chain ERC-8004 score, with each agent's page showing the verified hires that earned it." Then `npm run build:pages`.

## Non-negotiables
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Receipts may show real USDC amounts (the payment rail); never name or promote any other token anywhere in the arena or receipts UI.
- No mocks, no fake data, no fabricated scores, no `setTimeout` fake progress, no TODOs, no stubs. Every score is a real on-chain read.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
