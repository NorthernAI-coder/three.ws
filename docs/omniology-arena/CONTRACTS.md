# Shared Contracts — Omniology Arena

Single source of truth for the interfaces the build prompts share. This version
is written against **Omniology's real published API** (from omniology.ai/docs),
not a proposed shape. If their API changes, change it here and prompts inherit it.

> **Verify live before building.** Re-fetch `https://www.omniology.ai/docs` and,
> if reachable, their OpenAPI/MCP descriptor at the engine base. Confirm field
> names against a real response. Treat the shapes below as accurate-as-of-writing
> but verify, since a wrong field name silently breaks the screens/desk.

Engine base URL: **`https://omniology-engine.fly.dev`** · MCP endpoint: **`{base}/mcp`**

---

## 0. The big design facts (read first)

- **Submission is NOT x402.** It is a **3-step handshake**: ask the engine to
  build an entry transaction → **we sign it with the agent's key and broadcast it
  to Solana ourselves** → confirm. So `/api/x402-pay` is the wrong tool for the
  desk. Prompt 04 builds a dedicated server endpoint instead (see §2.4), reusing
  the *safe primitives* from `api/x402-pay.js` (auth, CSRF, agent-keypair load,
  SSRF-guarded fetch, spend caps) but implementing the handshake.
- **We sign a transaction Omniology constructs.** This is the central risk. The
  engine returns a base64 `pending_tx`; before signing we MUST decode and verify
  it pays **exactly** `expected_fee_micro_usdc` USDC to the contest's
  `deposit_address` and contains **no other instructions** (SECURITY.md C7).
- **Fees are sub-cent** (e.g. 0.01–0.02 USDC) and Omniology is the Solana
  fee-payer. A hard per-entry USDC cap (e.g. ≤ $0.10) makes worst-case loss
  trivial even if their feed is compromised.
- **Agents must register once** (ed25519 challenge) before they can enter.
- **Eligibility is partly enforced by them**: OFAC screening + geo-block of AZ,
  IA, MD, VT, WA (`GEO_BLOCKED`), VPN circumvention is a ToS violation. Confirm
  whether *we* must also enforce geo for our users (open question).

---

## 1. External contract — Omniology engine

> USDC amounts: `entry_fee_usdc` is human USDC; `expected_fee_micro_usdc` is
> atomic (6 decimals). The canonical Solana mainnet USDC mint must be read from
> the repo's x402 spec (`api/_lib/x402-spec.js` / `api/_lib/env.js`) — do not
> paste a mint from memory — and cross-checked against the transfer in `pending_tx`.

### 1.1 List active contests — feed for the screens (prompt 03)

```
GET {base}/v1/contests/active?track=ALL        // ALL | ART | STORY | JOKE
Accept: application/json

200 → [ {
  "contest_id": "uuid",
  "track": "ART|STORY|JOKE",
  "theme": "string",
  "entry_fee_usdc": 0.02,
  "current_pot_usdc": 1.84,
  "current_entries": 92,
  "time_remaining_seconds": 41,
  "submission_closes_at": "ISO8601",
  "judging_completes_at": "ISO8601",
  "status": "open|collecting_submissions|judging|payout|closed|dispute",
  "payload_format": "plain_text|markdown|base64_image",
  "max_payload_chars": 280,
  "deposit_address": "base58 pubkey",      // per-contest pool address
  "rubric": { "originality":"…","theme_alignment":"…","execution":"…","surprise":"…" }
} … ]
```

### 1.2 Contest rules (optional, prompt 04 compose UI)

```
GET {base}/v1/contests/{contest_id}   → same shape as one item above (+ rules detail)
```

### 1.3 Enter a contest — 3-step handshake (prompt 04, server-side)

```
// STEP 1 — request the unsigned entry transaction
POST {base}/v1/contests/{contest_id}/enter
{ "agent_id": "uuid", "payload": "string", "include_feedback": false }
200 → {
  "status": "pending_agent_signature",
  "pending_tx": "base64 serialized Solana tx",   // WE inspect + sign this
  "entry_ticket_pda": "base58 pubkey",
  "expected_fee_micro_usdc": 20000
}

// STEP 2 — (our server) decode + VERIFY pending_tx (SECURITY.md C7), sign with the
//          agent keypair, broadcast to Solana, get the transaction_signature.

// STEP 3 — confirm
POST {base}/v1/contests/{contest_id}/enter
{ "agent_id": "uuid", "payload": "string", "transaction_signature": "sig" }
200 → { "status":"confirmed", "entry_id":"uuid", "accepted": true, "position": 93, "judging_at":"ISO8601" }
```

### 1.4 Entry status / result (prompt 04 follow-up, optional now)

```
GET {base}/v1/entries/{entry_id}
200 → { "entry_id","contest_status":"judging|payout|closed","rank","total_entries",
        "score","won","payout_amount_usdc","payout_tx":"sig|null","judge_feedback":"string|null" }
```

### 1.5 Agent registration — prerequisite for entering

```
POST (engine, see docs) — register_agent
{ "wallet_address":"base58", "message_body":"omniology-register-v1:<WALLET>:<UNIX_TS>",
  "signed_message":"base58 ed25519 sig", "display_name"?, "specialty"?:["ART|STORY|JOKE"],
  "operator_email"?, "model"? }
// signed_message is base58 (NOT base64); timestamp within ±300s of server time.
```

### 1.6 MCP surface (already exists — `{base}/mcp`)

Tools: `register_agent`, `list_active_contests`, `get_contest_rules`,
`submit_entry`, `check_payout`, `get_my_history`, `get_leaderboard`,
`get_theme_history`, `get_judge_rubric_explainer`. **`get_leaderboard` is the
leaderboard source** — the REST `/active` feed does not include a leaderboard.
Confirm whether there is a REST equivalent or whether screens consume the MCP tool.

### 1.7 Errors / limits

`429 RATE_LIMITED` (+ `Retry-After`), `RATE_LIMITED_DUPLICATE_ENTRY`,
`OFAC_SANCTIONED`, `GEO_BLOCKED`. New-contest creation pauses 08:00 & 20:00 UTC
(1h); active contests still finish.

---

## 2. Internal contract — our modules

### 2.1 `src/game/arena/omniology-adapter.js` (produced in 03, used by 03 & 04)
The only client module that knows Omniology shapes. Reads through OUR proxy
(§2.5), never the engine directly (privacy + central enforcement, SECURITY.md C5).

```js
export function omniologyBase()        // proxy base, from <meta name="omniology-base"> / VITE_OMNIOLOGY_BASE
export async function fetchLiveFeed()  // GET /active via proxy → NormalizedFeed (throws on net error)
export async function fetchLeaderboard(contestId) // → [{ rank, agent, score, thumbUrl }]
// NormalizedFeed: {
//   ok, serverNowMs,
//   contests: [{ id, track, theme, entryFeeUsdc, potUsdc, entries, closesMs,
//                status, payloadFormat, maxPayloadChars, depositAddress, rubric }],
//   current   // the one to feature (soonest-closing 'open'/'collecting' contest) | null
// }
```

### 2.2 `src/game/arena/contest-screen.js` (produced in 03)
```js
export function createContestScreen(scene, { position, width, rotationY, role })
// role: 'now'|'leaderboard'|'winners'
// handle = { group, update(dt), applyFeed(NormalizedFeed), applyLeaderboard(rows),
//            pushEntry({agent}), setStatus('loading'|'live'|'empty'|'error'|'unconfigured'), dispose() }
```
The countdown uses `closesMs - serverNowMs` drift-corrected; a `track`/round
change triggers a "new contest" sweep.

### 2.3 `src/game/arena/entry-desk.js` (produced in 04)
```js
export function createEntryDesk(scene, {
  position, rotationY,
  getAgentId,        // () → player's registered Omniology agent id (see 2.6)
  getContest,        // () → featured contest { id, theme, entryFeeUsdc, payloadFormat, maxPayloadChars }
  composeEntry,      // async (contest) → payload string  (in-world compose UI, validates maxPayloadChars/format)
  onConfirmed,       // ({ entryId, position, payment }) → void   (wire to screen.pushEntry)
}) // → { group, update(dt), interact(), dispose() }
```

### 2.4 Server endpoint `api/arena/omniology-enter.js` (produced in 04)
The desk calls THIS, not `/api/x402-pay`. It performs the §1.3 handshake
server-side (agent keys are custodial/server-side). Model its safety scaffolding
on `api/x402-pay.js`:
- `requireAuth` + `requireCsrf`; `agentId` must belong to the user (`loadAgentKeypairForUser`).
- All engine calls through the SSRF-guarded `guardedFetch` (host-pinned to the engine).
- `reserveSpendUsd` spend-cap reservation; plus a **hard per-entry cap** (≤ $0.10).
- **C7 inspect-before-sign** on `pending_tx` (SECURITY.md) before signing/broadcast.
- Streams SSE stages to the desk: `building → verifying → signed → broadcast → confirmed` (+ `error`).
  (Mirror the `_sse` parser in `src/game/agent-commerce.js` on the client.)

### 2.5 Server proxy `api/arena/omniology-feed.js` (produced in 03)
Read-through, short-TTL cache (~5s, the 88s cadence is cheap) over
`GET {engine}/v1/contests/active` and the leaderboard. Enforces response size
limit + content-type (SECURITY.md C3) and strips/clamps partner strings (C4).
The client only ever talks to this, never the engine.

### 2.6 Registration
Entering requires a registered Omniology agent (§1.5). Decide and document: do we
register the player's three.ws agent on first desk use (server-side, signing the
ed25519 challenge with the agent key), or require pre-registration? Prompt 04
owns this; default to **lazy server-side registration on first entry**.

---

## 3. Config keys

| Key | Where | Purpose |
|---|---|---|
| `<meta name="game-server">` | `pages/arena/omniology.html` | Colyseus URL (copy from `pages/play.html`) |
| `OMNIOLOGY_ENGINE_BASE` | server env | `https://omniology-engine.fly.dev` (used by the proxy + enter endpoints) |
| `<meta name="omniology-base">` / `VITE_OMNIOLOGY_BASE` | page / build env | OUR proxy base (e.g. `/api/arena`) — never the engine directly |
| `X402_*`, agent-wallet, RPC, facilitator | server env (already set) | reused for agent keypair load + Solana broadcast |

No new client secrets. Agent signing is server-side only.
