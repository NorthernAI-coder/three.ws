# Prompt 04 — Entry desk + Omniology submission

Build the in-world entry desk: a player walks up, presses E (or taps), composes
an entry, and submits it to a live Omniology contest — paying the sub-cent USDC
entry fee on Solana — with live progress and an on-chain confirmation, reflected
on the screens.

**Important:** Omniology's submit flow is **NOT x402**. Do not use
`/api/x402-pay`. The engine builds an entry transaction; **our server signs it
with the player's agent key and broadcasts it** (CONTRACTS §1.3). The signing
happens server-side (agent keys are custodial). You will build a dedicated server
endpoint plus the in-world desk that calls it.

## Read first (required)
- `docs/omniology-arena/README.md`, `docs/omniology-arena/CONTRACTS.md` (esp. §0, §1.3, §1.5, §2.3–2.6), `docs/omniology-arena/SECURITY.md` (C7, C1, C3–C6 — mandatory), `CLAUDE.md`
- `api/x402-pay.js` — **reuse its safe primitives**, not its x402 logic: `requireAuth`, `requireCsrf`, `loadAgentKeypairForUser`, the SSRF-guarded `guardedFetch` (host-pinned, size/timeout bounded), `reserveSpendUsd` spend caps, and `buildSolanaPaymentPayload` as the reference for how a Solana tx is constructed/signed/broadcast with an agent keypair and the platform RPC connection. Quote the lines you reuse.
- `api/_lib/agent-trade-guards.js` (`reserveSpendUsd`, spend-limit shape) and `api/_lib/ssrf.js` (URL guard).
- `src/game/agent-commerce.js` — reuse ONLY the client SSE consumption pattern: the `_sse(res)` async-generator parser (~569–589) and the stepper UI/receipt rendering. The payment semantics differ; the streaming UX pattern is what you reuse.
- `src/game/play-systems.js` — the interaction/action-button framework for the desk's proximity prompt.
- `src/game/arena/arena.js` (`this.anchors.desk`), `src/game/arena/omniology-adapter.js` + the proxy `api/arena/omniology-feed.js` (prompt 03), and the screen `pushEntry()` handle.

## Build

### A. Server endpoint `api/arena/omniology-enter.js` (CONTRACTS §2.4)
The desk calls this; it runs the §1.3 handshake server-side.
1. **Auth/ownership/CSRF**: `requireAuth`, `requireCsrf`; `agentId` must belong to
   the user via `loadAgentKeypairForUser`. Anonymous callers rejected.
2. **Registration (CONTRACTS §2.6)**: ensure the player's agent is registered with
   Omniology (§1.5). Default: lazy server-side registration on first entry — sign
   the `omniology-register-v1:<wallet>:<ts>` challenge with the agent key (base58
   ed25519, ±300s) and call `register_agent`. Cache registration state.
3. **Step 1**: `guardedFetch` (host-pinned to `OMNIOLOGY_ENGINE_BASE`) the
   `POST /v1/contests/{id}/enter` with `{ agent_id, payload }`; receive
   `pending_tx`, `expected_fee_micro_usdc`, `entry_ticket_pda`.
4. **Caps**: `reserveSpendUsd` + a hard per-entry ceiling (≤ $0.10). Reject over-cap.
5. **C7 inspect-before-sign (MANDATORY)**: decode `pending_tx`; assert exactly one
   USDC `TransferChecked` of `expected_fee_micro_usdc` to the contest
   `deposit_address` **taken from the proxied `/active` feed** (cross-check, do not
   trust the enter response alone); no other instructions; `feePayer` is
   Omniology's, not the agent. Reject otherwise. (See SECURITY.md C7.)
6. **Sign + broadcast**: sign with the agent keypair, broadcast via the platform
   Solana connection, get `transaction_signature`. Handle confirmation/timeout and
   the settle-uncertain case (never double-submit).
7. **Step 3**: `POST …/enter` with `{ agent_id, payload, transaction_signature }`;
   receive `{ entry_id, position, … }`.
8. **SSE**: stream stages `building → verifying → signed → broadcast → confirmed`
   (+ `error`) to the client, each emitted after the real step. Include the
   Solscan link for the broadcast tx.
9. Map Omniology errors (`GEO_BLOCKED`, `OFAC_SANCTIONED`, `RATE_LIMITED`,
   `RATE_LIMITED_DUPLICATE_ENTRY`) to clear, honest client messages. Respect
   `Retry-After`.

### B. In-world desk `src/game/arena/entry-desk.js` (CONTRACTS §2.3)
1. Tasteful desk/kiosk mesh at `anchors.desk`; proximity interactable (reuse
   play-systems) with an "Enter contest — press E" prompt (hover/active/focus).
2. **Compose UI** (`composeEntry`): an overlay form matching the contest's
   `payload_format` (`plain_text` / `markdown` / `base64_image`) and
   `max_payload_chars`. Validate locally (length, format, duplicate-guard) BEFORE
   submitting. Show the theme + rubric and the exact entry fee. Designed
   empty/invalid states.
3. **Submit**: `POST /api/arena/omniology-enter` with `Accept: text/event-stream`
   and `{ agentId, contestId, payload }`; consume the SSE stream with the `_sse`
   parser; drive a live stepper from the real stages; on `confirmed` show the
   confirmation (entry id, position, Solscan link) and call `onConfirmed(...)`.
4. **Cross-wire to screens**: `onConfirmed` → screen `pushEntry({ agent })` for an
   instant ticker insert; the next poll reconciles. Tasteful success cue
   (sound + light), reduced-motion gated.
5. **Eligibility honesty**: if the player can't enter (geo/registration/closed
   round), say so clearly in-world rather than failing at payment.

## Acceptance criteria
- **C7 is implemented and unit-tested**: a tampered `pending_tx` (wrong recipient,
  extra instruction, inflated amount, agent-as-feePayer) is rejected before
  signing. This is a blocking requirement.
- Hard per-entry cap rejects over-ceiling fees; the exact fee + contest are shown
  before the player confirms (no silent signing).
- Walking to the desk and entering runs the real 3-step handshake against
  Omniology's engine (or sandbox), broadcasts a real Solana tx, and returns a real
  `entry_id`/position with a working Solscan link. Verified end-to-end in a browser.
- Every SSE stage is backed by a real step (no `setTimeout` fake progress) — verify
  in the Network tab.
- Submitted entry appears on the live ticker immediately and persists after the
  next poll. Geo/OFAC/rate-limit/closed-round errors are honest and recoverable.
- No client secrets; agent signing is server-side only. Partner strings reaching
  the DOM are escaped (SECURITY.md C4). No console errors/warnings. `npm test` passes.

## Hand-off
The Arena is functionally complete. Prompt 06 does polish/QA/launch.
