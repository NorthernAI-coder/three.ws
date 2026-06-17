# B3 — Real interactions: view profile + x402 pay (+ ask)

> **Supersedes `tasks/irl/02-view-agent-profile.md` and
> `tasks/irl/03-x402-payment.md`.** Those described the thin sheet; this wires
> the B2 card's CTAs for real. Treat the old files as reference only.

## Goal

Make every CTA on the inspect card do something real:
- **View profile** → opens the agent's actual profile at `/agents/<agent_id>`.
- **Pay / use service** → a real x402 payment via `wrapFetch` with the
  connected wallet, handling `402 → sign → retry`, with designed success and
  error states (per-service prices are **USDC over x402** — fine; the only coin
  the platform promotes is **$THREE**).
- **Ask** (optional) → a lightweight chat hook to `/api/chat` for the agent.
- Every completed interaction **POSTs an interaction event** (forward-reference
  C4's `/api/irl/interactions`).

## Why it matters

A card full of dead buttons is a brochure. The whole point of IRL agents is that
a stranger can walk up, see what an agent offers, and *pay it on the spot*. This
task is where the loop closes: discovery → trust (B2) → transaction (B3).

## Current state (real lines)

`src/irl.js`:
- View handler `#irl-sheet-view` ~1157 already does
  `window.open('/agents/'+agentId,'_blank','noopener')` with a `/walk?agent=`
  name fallback — keep this behaviour, move it onto the card's button.
- Pay handler `#irl-sheet-pay` ~1169 is **already a real x402 flow**: gates on
  `window.ethereum` → `eth_requestAccounts` → dynamic-imports
  `../packages/x402-fetch/dist/index.esm.js` `withX402(window.ethereum,
  { maxPaymentUsd })` → `pay(endpoint,{method:'POST'})` → `Paid ✓` / error via
  `setStatus`. This is the canonical pattern to reuse per-service.
- `src/marketplace.js` ~2340 / ~3407 shows the documented public form
  `wrapFetchWithPayment(fetch, wallet)` from `@three-ws/x402-fetch` — same
  protocol; match whichever the card already imports via
  `src/shared/x402-loader.js`.

The card (B2) provides per-service `x402_endpoint` + `price_usd`, plus a
pin-level fallback `x402_endpoint`.

## What to build

### 1. View profile

On the card's **View profile** button:
```js
agentId
  ? window.open(`/agents/${agentId}`, '_blank', 'noopener')
  : window.open(`/walk?agent=${encodeURIComponent(name)}`, '_blank', 'noopener');
```
Fire-and-forget `postInteraction({ agent_id, kind: 'view_profile' })`.

### 2. Pay / use service (per service row + footer CTA)

Reuse the existing pay flow, parameterised per service:
```js
async function payService({ endpoint, priceUsd, agentId, skill, btn }) {
  if (!endpoint) return setStatus('This service has no endpoint yet', { error: true });
  if (!window.ethereum) return setStatus('Connect a wallet (MetaMask) to pay via x402', { error: true });

  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Connecting…';
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }).catch(() => null);
  if (!accounts?.length) { resetBtn(btn, orig); return setStatus('Connect your wallet to pay', { error: true }); }

  btn.textContent = 'Paying…';
  try {
    const { withX402 } = await import('../packages/x402-fetch/dist/index.esm.js');
    const pay = withX402(window.ethereum, { maxPaymentUsd: Math.max(priceUsd, 0.01) });
    const r = await pay(endpoint, { method: 'POST' });   // 402 → sign → retry inside
    if (!r.ok) throw new Error(await r.text().catch(() => r.status));
    btn.textContent = 'Used ✓'; btn.disabled = true;
    setStatus('Service paid — response delivered');
    postInteraction({ agent_id: agentId, kind: 'pay', skill, amount_usd: priceUsd });
  } catch (err) {
    const m = err?.message ?? String(err);
    setStatus(/reject|denied|4001|cancel/i.test(m) ? 'Payment cancelled' : `Payment failed — ${m}`, { error: true });
    resetBtn(btn, orig);
  }
}
```
- Cap `maxPaymentUsd` at the service price (small guard) so a misconfigured
  endpoint can't over-charge.
- Per-row buttons stay independent (only the clicked one shows in-flight state).
- On success, show the returned service result inline in the card when the body
  is small (JSON/text), not just a toast — that is the value the user paid for.

### 3. Ask (optional chat hook)

If the card shows an **Ask** affordance, POST the user's prompt to `/api/chat`
with the agent id, stream/append the reply into a small thread inside the card,
designed loading + error states via `state-kit`. Log
`postInteraction({ agent_id, kind: 'message' })` on send. Keep it optional —
ship View + Pay first; Ask can be a follow-up if `/api/chat` wiring grows the
task.

### 4. Interaction event helper (forward-ref C4)

```js
function postInteraction(body) {
  // best-effort; never block the UX on telemetry
  fetch('/api/irl/interactions', {
    method: 'POST', credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, device_token: _deviceToken, at: Date.now() }),
  }).catch(() => {});
}
```
Until C4 lands, this 404s harmlessly (swallowed). When C4 ships the
`/api/irl/interactions` endpoint + `irl_interactions` table, owner inboxes light
up with no client change. Document this contract here so C4 matches the shape:
`{ agent_id, kind: 'view_profile'|'pay'|'message', skill?, amount_usd?,
device_token, at }`.

## Data / API changes

- No new endpoint **owned by this task** (View + Pay use existing routes).
- Emits to `POST /api/irl/interactions` (defined by **C4**) — contract above.
- No schema changes here.

## Acceptance checklist

- [ ] View profile opens `/agents/<agent_id>` (name fallback when id missing).
- [ ] Pay performs a real x402 `402 → sign → retry` via `withX402`/`wrapFetch`
      with the connected wallet — no mock, no raw `fetch` stub.
- [ ] `maxPaymentUsd` is bounded by the displayed price.
- [ ] Per-service buttons have independent loading/disabled/`✓`/error states.
- [ ] Wallet-not-connected, user-rejected, and endpoint-error paths each show a
      distinct, recoverable message; buttons re-enable on failure.
- [ ] Paid service result is surfaced in the card when returned.
- [ ] Each completed action best-effort POSTs an interaction event; a 404/failure
      never disrupts the user.
- [ ] No console errors; no leftover `// coming soon` / stub copy.

## Out of scope

- Building `/api/irl/interactions` + the owner inbox — that is **C4**.
- The card layout/skeleton itself — that is **B2** (this only wires its CTAs).
- Solana-wallet payment rails (this flow is EVM x402 via `window.ethereum`,
  matching the existing IRL pay handler and `marketplace.js`).

## Verify

`npm run dev`, open `/irl`, tap an agent with a priced service. With a funded
test wallet, run a real x402 pay end-to-end (expect the `402` then the signed
retry succeeding) and confirm `Used ✓` + inline result. Decline the wallet
prompt to confirm the cancel path re-enables the button. Confirm View profile
opens the real `/agents/:id` page. Watch the network tab for the best-effort
`POST /api/irl/interactions` (404 pre-C4 is expected and silent).
