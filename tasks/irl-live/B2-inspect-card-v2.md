# B2 — Inspect card v2 (rich tap card with reputation + services)

## Goal

Tapping a nearby agent opens a **rich card** that replaces today's thin
interaction sheet: avatar name, a short bio/info line, reputation (a derived
score + attestation count + tier badge), and the **services it provides** (the
agent's skills with their x402 prices) plus primary CTAs. The client makes **one
call** to a new aggregation endpoint that joins the agent record + Solana
reputation + skills/prices into a single payload.

## Why it matters

The current sheet shows a name, a caption, and two buttons — it tells the viewer
nothing about *why* they'd trust or pay this agent. A card that surfaces
reputation and a real service menu turns a tap into a decision. One aggregation
call (instead of three round-trips from a phone on cellular) is the difference
between an instant card and a janky one.

## Current state (real lines)

`src/irl.js`:
- `openPinSheet(pin)` ~1135 fills `#irl-sheet-name`, `#irl-sheet-dist`,
  `#irl-sheet-caption`, toggles `#irl-sheet-pay` on `pin.x402_endpoint`, stashes
  `pin.agent_id`/`pin.avatar_name` on `sheet.dataset`, adds `.is-open`.
- The pin object carries `agent_id, avatar_name, caption, x402_endpoint,
  distance_m, avatar_url`. Markup `#irl-sheet*` lives in `pages/irl.html`.

Data sources to join (all real, already deployed):
- Agent record: `GET /api/agents/:id` → `agent.name`, `agent.description`,
  `agent.meta.sol_mint_address` / `agent.meta.solana_address`,
  `agent.skill_prices` (`{ skill: { amount, currency_mint, chain } }`),
  avatar thumbnail keys. (`handleGetOne` in `api/agents.js` ~314.)
- Reputation: `GET /api/agents/solana-reputation?asset=<sol_mint_address>` →
  `feedback.{total,score_avg,unique_attesters}`, `validation.*`,
  `tasks.{offered,accepted}`, `stake.unique_stakers` (raw aggregates, **no tier
  field** — derive tier client/server here). (`_handlers.js` ~900.)
- Skills catalog: `GET /api/skills` → `{ skills:[{ id,name,slug,description,
  price_per_call_usd,category }] }` for service descriptions/prices.

## What to build

### 1. New aggregation endpoint `GET /api/irl/agent-card?agent_id=<uuid>`

A single Vercel function (`api/irl/agent-card.js`, `cors`/`json`/`wrap` like
`api/irl/pins.js`) that fans out server-side and returns one merged payload.
Resolve the agent's `sol_mint_address` from the agent record, then fetch
reputation with it; **derive a tier + a 0–100 score** from the raw aggregates so
the client renders a badge without re-implementing the formula:

```jsonc
{
  "agent": {
    "id": "uuid",
    "name": "Atlas",
    "bio": "Trip-planning agent for…",      // agent.description, trimmed
    "thumbnail_url": "/cdn/<thumbnail_key>", // null-safe
    "profile_url": "/agents/uuid"
  },
  "reputation": {
    "asset": "<sol_mint_address>|null",
    "score": 78,                              // 0–100 derived
    "tier": "trusted",                        // new|emerging|trusted|elite
    "attestation_count": 23,                  // feedback.total + validation passes
    "unique_attesters": 9,
    "tasks_accepted": 14,
    "available": true                         // false when no on-chain asset
  },
  "services": [                               // skill_prices ∪ skills catalog
    { "skill": "route-plan", "name": "Route planning",
      "description": "…", "price_usd": 0.05,
      "currency": "USDC", "chain": "base",
      "x402_endpoint": "https://…/x402/route-plan" }
  ],
  "x402_endpoint": "<pin-level fallback endpoint|null>"
}
```

Tier derivation (server, explicit and documented in-file):
`score = clamp(round(60*scoreAvgNorm + 20*log-scaled(attesterCount) +
20*validationPassRate))`; `tier`: `score>=85 elite`, `>=60 trusted`,
`>=30 emerging`, else `new`. When `sol_mint_address` is absent, return
`reputation.available=false` and omit the score (card shows "No on-chain
reputation yet").

Services merge: start from `agent.skill_prices`, enrich each with
name/description from the skills catalog (match on slug), express price in USDC
(amount is already USDC-denominated atomics → format to `price_usd`), and carry
through the per-skill x402 endpoint. Cap the list (e.g. 6) and order by price.

Error boundaries: agent 404 → `404 {error}`. Reputation fetch failure must
**not** fail the card — degrade to `reputation.available=false` with a flag, so
the menu still renders. Cache `Cache-Control: public, max-age=30`.

### 2. Card UI in `src/irl.js` (replace the thin sheet body)

Render into the existing `#irl-sheet` (keep id/open mechanics) or a new
`#irl-card`, using `src/shared/state-kit.js` for every state:

- **Loading skeleton** — on tap, show the card frame immediately with
  `skeletonHTML()` rows for name/rep/services while `/api/irl/agent-card`
  resolves. Never a blank sheet.
- **Populated** — header (thumbnail + name + tier badge with score), bio line,
  a reputation strip (`★ score · N attestations · tier`), then a **services
  list**: each row = name, one-line description, price pill (`$0.05 USDC`), and a
  per-service "Use" CTA. Footer CTAs: **View profile** and **Pay / use service**
  (wired in B3).
- **Empty services** — `emptyStateHTML({ title:'No paid services yet', body:'This
  agent is here to meet, not to sell.' })`; still show profile CTA.
- **No-reputation** — show a muted "New here — no on-chain reputation yet" chip
  instead of a fake score.
- **Error** — `errorStateHTML({ title:"Couldn't load this agent", … })` +
  `attachRetry()` re-calling the endpoint.

Fetch with `AbortController`; tapping a different agent aborts the in-flight
card so stale data never lands. Designed transitions on open/close (opacity +
translateY), focus the card on open, Escape/backdrop closes, ARIA `role="dialog"`.

## Data / API changes

- **New:** `api/irl/agent-card.js` + a `vercel.json` functions entry + route
  `"/api/irl/agent-card"` (per the `[action].js` shadowing trap — give it its
  own explicit route or it 404s in prod).
- No schema changes; reads existing tables via existing endpoints.

## Acceptance checklist

- [ ] `GET /api/irl/agent-card?agent_id=<real uuid>` returns the merged shape
      with real reputation + real services in one response.
- [ ] Card opens with a skeleton, then populates; switching agents aborts the
      prior fetch.
- [ ] Tier badge + score derive from real aggregates; agents with no on-chain
      asset show the muted "no reputation yet" chip, never a fabricated number.
- [ ] Services list shows real skill names/descriptions and real USDC prices.
- [ ] Empty / no-rep / error states all designed via state-kit; error retries.
- [ ] Reputation-endpoint failure degrades gracefully (services still render).
- [ ] `role="dialog"`, focus management, Escape/backdrop close, no console errors.

## Out of scope

- Wiring the CTAs to real navigation/payment — that is **B3**.
- Editing which services an agent offers (owner-side) — that is **C2**.
- Realtime reputation updates while the card is open — **D3**.

## Verify

`npm run dev`; locally exercise `api/irl/agent-card.js` with a mock `req/res`
(dev proxies `/api` to prod, so test the new handler directly) against a real
agent uuid that has a `sol_mint_address` and at least one `skill_price`. Open
`/irl`, tap an agent, confirm skeleton→populated, switch agents to confirm
abort, and force the reputation fetch to fail to confirm graceful degrade.
