# Shared Contracts — Omniology Arena

This file is the single source of truth for the interfaces that the build
prompts share. If a shape changes, change it here and the prompts inherit it.

There are two kinds of contracts:
- **External** — what Omniology's service must expose (consumed by prompts 03, 04, 05).
- **Internal** — module boundaries between our own prompts so they compose cleanly.

---

## 1. External contract — Omniology service

> Verify the canonical Solana mainnet **USDC mint** by reading it from the repo
> (`api/_lib/x402-spec.js` / `api/_lib/env.js`). Do **not** hardcode a mint from
> memory. All amounts are atomic (USDC = 6 decimals; 1 USDC = `1000000`).

### 1.1 Contest feed (read) — for the screens (prompt 03)

A single polled endpoint is enough. Free (no x402) is preferred for reads so the
screens stay cheap to refresh.

```
GET  {OMNIOLOGY_BASE}/v1/contests/live
Accept: application/json

200 →
{
  "now_unix": 1719259200,            // server time, for countdown drift correction
  "current": {
    "id": "string",
    "title": "string",
    "round": 1421,                   // monotonically increasing round number
    "opened_unix": 1719259112,
    "closes_unix": 1719259200,       // ~88s after opened
    "entries_count": 37,
    "prize_usdc": 12.5,
    "prize_asset": "USDC"
  },
  "next": { "opens_unix": 1719259200 } | null,
  "leaderboard": [                   // for the CURRENT or most-recent round
    { "rank": 1, "entry_id": "string", "agent": "display name", "score": 0.92, "thumb_url": "https://…" | null }
  ],
  "recent_entries": [                // newest first, for the live ticker
    { "entry_id": "string", "agent": "display name", "submitted_unix": 1719259190 }
  ],
  "recent_winners": [                // last few rounds, for "past winners" panel
    { "round": 1420, "agent": "display name", "prize_usdc": 11.0, "tx": "solana sig" | null }
  ]
}
```

Notes:
- `closes_unix - now_unix` drives the on-screen countdown (the ~88s clock).
- All `*_url` fields must be HTTPS and CORS-readable from `three.ws`, or proxied.
- If a field is unknown, send `null` — never omit. Screens render designed empty
  states for nulls; they must not invent data.

### 1.2 Submit entry (write, x402-priced) — for the desk (prompt 04)

```
POST {OMNIOLOGY_BASE}/v1/contests/{contestId}/entries
Content-Type: application/json
Body: { "entry": { …partner-defined… }, "agent": "display name" | null }
```

- **First call returns `402 Payment Required`** with a standard x402 challenge:
  - `scheme: "exact"`, `network: "solana-mainnet"`
  - `asset`: canonical Solana mainnet USDC mint (per repo)
  - `amount`: atomic USDC (the entry fee; may be `"0"` only if entry is free —
    but then there is nothing to pay and the desk uses a plain POST, see below)
  - `payTo`: Omniology's Solana receiver
  - `extra.feePayer`: a funded Solana account that co-signs (required for SVM exact)
  - `resource`: `{ url, description, serviceName: "Omniology" }`
- Client signs + retries with `X-PAYMENT`. On success return `200` with:
  - header `X-PAYMENT-RESPONSE` (base64 receipt: `{ transaction, payer, network }`)
  - body: `{ "entry_id": "string", "status": "accepted", "round": 1421, "position": 38 }`

If entry submission is **free** (no payment), say so in `QUESTIONS` — the desk
will POST directly and skip x402 entirely. Do not return a `402` with `amount: 0`.

### 1.3 MCP surface (optional but preferred) — prompt 05

The same two capabilities exposed as MCP tools so agents (not just our world)
can use them, and so the service auto-registers in the x402 Bazaar:
- `list_contests` / `get_contest` / `get_leaderboard` → read (1.1)
- `submit_entry` → x402-priced write (1.2)

---

## 2. Internal contract — our modules

These are the boundaries between prompts. Keep these signatures stable so each
prompt can be built and tested independently.

### 2.1 `src/game/arena/omniology-adapter.js` (produced in 03, used by 03 & 04)

The ONLY place that knows Omniology's wire shapes. Everything else consumes
normalized objects, so swapping the real base URL is a one-file change.

```js
// Config: reads base URL from <meta name="omniology-base"> or VITE_OMNIOLOGY_BASE.
export function omniologyBase()            // → string ('' if unconfigured)
export async function fetchLiveFeed()      // → NormalizedFeed   (throws on network error)
export function submitEntryRequest(contestId, entry, agent)
  // → { url, method:'POST', body }  — the exact payload for /api/x402-pay external flow

// NormalizedFeed:
// {
//   ok: boolean,
//   serverNowMs: number,
//   current: { id, title, round, opensMs, closesMs, entriesCount, prizeUsdc } | null,
//   leaderboard: [{ rank, entryId, agent, score, thumbUrl }],
//   recentEntries: [{ entryId, agent, submittedMs }],
//   recentWinners: [{ round, agent, prizeUsdc, tx }]
// }
```

### 2.2 `src/game/arena/contest-screen.js` (produced in 03)

Generalized live screen, modeled on `src/game/chart-screen.js`.

```js
export function createContestScreen(scene, { position, width, rotationY }) // → handle
// handle = {
//   group,                       // THREE.Group added to scene
//   update(dt),                  // call each frame; redraws ~10fps, advances countdown
//   applyFeed(normalizedFeed),   // push latest poll result
//   pushEntry({ agent, entryId }),// optimistic live ticker insert (called by the desk)
//   setStatus('loading'|'live'|'empty'|'error'),
//   dispose()
// }
```

### 2.3 `src/game/arena/entry-desk.js` (produced in 04)

```js
export function createEntryDesk(scene, {
  position, rotationY,
  getAgentId,          // () → current player's paying agent id
  getContestId,        // () → current contest id (from the adapter feed)
  buildEntry,          // async () → entry object (opens the in-world compose UI)
  onSubmitted,         // ({ entryId, agent, payment }) → void  (wire to screen.pushEntry)
}) // → handle { group, update(dt), interact(), dispose() }
```

The desk calls `POST /api/x402-pay` with
`{ url, method, body }` from `submitEntryRequest(...)` plus the paying
`agentId`, `Accept: text/event-stream`, and consumes the SSE sequence
`challenge → built → settled → result` (or `error`). See prompt 04 for the
verified event shapes and the reusable `_sse` parser from
`src/game/agent-commerce.js`.

### 2.4 Bootstrap registry (produced in 01)

The arena bootstrap exposes mount points so 02/03/04 attach without editing each
other:

```js
// src/game/arena/arena.js
class OmniologyArena {
  scene, renderer, camera
  anchors            // resolved from the venue GLB (02): { spawn, screens:[], desk, lights:[] }
  registerUpdatable(obj /* has update(dt) */)   // 03/04 register their handles here
}
```

---

## 3. Environment / config keys (no secrets in client)

| Key | Where | Purpose |
|---|---|---|
| `<meta name="game-server">` | `pages/arena/omniology.html` | Colyseus URL (copy from `pages/play.html`) |
| `<meta name="omniology-base">` or `VITE_OMNIOLOGY_BASE` | page / build env | Omniology feed + submit base URL |
| `X402_*` (agent wallet, facilitator, USDC) | server env (already set) | Used by `/api/x402-pay`; no client exposure |

The paying wallet and facilitator are server-side and already configured for the
existing agent-commerce flow — prompt 04 reuses them, it does not add new secrets.
