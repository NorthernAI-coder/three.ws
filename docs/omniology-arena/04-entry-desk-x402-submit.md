# Prompt 04 — Entry desk + x402 submission

Build the in-world entry desk: a player walks up, presses E (or taps), composes
an entry, and submits it to Omniology with a real USDC-on-Solana x402 payment —
streamed live (challenge → settle → receipt) and reflected on the screens. This
reuses the proven agent-commerce flow; **no scripted/fake stages**.

## Read first (required)
- `docs/omniology-arena/README.md`, `docs/omniology-arena/CONTRACTS.md` (esp. §1.2 submit, §2.1 `submitEntryRequest`, §2.3 desk contract), `CLAUDE.md`
- `src/game/agent-commerce.js` — the reference end-to-end flow. Study: the
  `fetch('/api/x402-pay', { headers:{accept:'text/event-stream'}, body:{…} })`
  call (~428–435), the SSE consume loop (~443–467) handling
  `challenge → built → settled → result` / `error`, the reusable `_sse(res)`
  async-generator parser (~569–589), and how it renders the receipt with the
  Solscan tx link.
- `api/x402-pay.js` — the **external flow** (`runExternalFlow` / `handleExternalPay`, ~553–697 and ~921–1029). Confirm the exact request body it accepts to pay an arbitrary external URL (`url`, `method`, `body`, `agentId`, `service_label`, `stream`) and the exact SSE event names + data shapes it emits. Build against what the code actually does — quote the lines you relied on in your final report.
- `src/game/play-systems.js` — the interaction/action-button framework (how an interactable/zone is defined and how E/tap triggers it). Reuse this for the desk's proximity prompt.
- `src/game/arena/arena.js` (`this.anchors.desk`), `src/game/arena/omniology-adapter.js` (`submitEntryRequest`), and the screen `pushEntry()` from prompt 03.

## Build
1. **Desk object + interactable** `src/game/arena/entry-desk.js` per CONTRACTS
   §2.3 — `createEntryDesk(scene, { position, rotationY, getAgentId,
   getContestId, buildEntry, onSubmitted })`. Place a tasteful desk/kiosk mesh at
   `anchors.desk`. Register a proximity interactable (reuse play-systems): when
   the player is in range, show an "Enter contest — press E" prompt with proper
   hover/active/focus affordances.
2. **Compose UI** (`buildEntry`): an in-world/overlay form to assemble the entry
   per Omniology's required fields (from CONTRACTS §1.2 / answers to QUESTIONS).
   Validate locally against Omniology's rules **before** payment (one entry per
   round, content limits, etc.) so we never charge for a doomed entry. Designed
   empty/invalid states.
3. **Submit flow**: on confirm, build the request via
   `submitEntryRequest(contestId, entry, agent)` and `POST /api/x402-pay` with
   `Accept: text/event-stream` and `{ url, method, body, agentId, service_label:
   'Omniology' }`. Consume the SSE stream with the `_sse` parser. Drive a live
   stepper UI from the **real** events:
   - `challenge` → show the fee (USDC) and "awaiting signature"
   - `built` → "signed"
   - `settled` → "settled on Solana" + Solscan link from `data.explorer`
   - `result` → success: show the confirmation (entry id / round / position from
     Omniology's response body) and call `onSubmitted(...)`
   - `error` → designed, recoverable error (and make clear no funds moved if it
     failed before `settled`; if `settle_uncertain`, show the exact warning the
     API returns — do not silently retry).
4. **Cross-wire to screens**: `onSubmitted` calls the screen `pushEntry({ agent,
   entryId })` so the player sees their entry hit the live ticker immediately,
   then the next poll reconciles it. Also play a small in-world celebration
   (sound + light pulse) on success — tasteful, gated by reduced-motion.
5. **Free-entry path**: if Omniology confirms entries are free (QUESTIONS #7),
   POST directly to the submit URL (no x402) and skip the payment stepper. Keep
   both paths implemented and selected by the adapter, not by a hardcoded flag.

## Security (MANDATORY — see `docs/omniology-arena/SECURITY.md`)
The desk pays a third-party endpoint with a player's real funds. You MUST
implement and prove these before this prompt is "done":
- **C1 — Pin the recipient.** Reject any 402 `payTo` that is not Omniology's
  verified, fixed Solana address (add `x402_recipient_allowlist` to spend-limits
  and enforce in `runExternalFlow`). Do NOT trust the address the endpoint
  returns. This blocks launch if unmet.
- **C2 — Cap the amount.** Enforce a hard per-call max (known entry fee + small
  tolerance); reject larger challenges. Show the player the exact amount +
  recipient and require explicit approval before paying. No silent payment.
- **C3 — Bound the response.** Cap the external response body (≤1 MB) and verify
  content-type before parsing.
- **C4 — Sanitize partner content.** Any Omniology string reaching the DOM uses
  `textContent`/escaping, never `innerHTML`. Length-clamp and strip control chars.
- The flow is auth + CSRF gated already; do not weaken that. Never pay from a
  shared platform wallet — the paying agent must be the player's own.

## Acceptance criteria
- C1–C4 above are implemented and demonstrated (e.g. a test that a mismatched
  `payTo` or an over-cap amount is rejected before signing).
- Walking to the desk and pressing E opens the compose UI; submitting runs a
  **real** x402 payment and returns Omniology's real confirmation. Verified in a
  real browser end-to-end against Omniology's real/sandbox submit endpoint, with
  a real Solscan tx link (when an entry fee applies).
- Every SSE stage is backed by a real event from `/api/x402-pay` — confirm by
  reading the stream in the Network tab; no `setTimeout`-driven fake progress.
- Local validation rejects bad entries before any payment.
- The submitted entry appears on the live ticker immediately and persists after
  the next poll.
- Error/declined/uncertain states are all designed and accurate. Interactive
  elements have hover/active/focus states. Keyboard accessible.
- No console errors/warnings. `npm test` passes. Review your `git diff`.

## Hand-off
The Arena is now functionally complete. Prompt 06 does the polish/QA/launch pass.
