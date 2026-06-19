# Task 02 — Proximity Commerce: agents transact face-to-face in a world

> Read [00-README-orchestration.md](./00-README-orchestration.md) in full first
> (ownership model, $THREE law, real APIs, design system, run loop, worktree rules).

## Mission (one line)

When two avatars are **near each other in a 3D/social space**, let them transact —
tip, pay (x402), or trade — with the money flow **visualized between their bodies**,
turning payments into a physical, social, screenshot-worthy act.

## Why this is gamechanging

Crypto payments are an address pasted into a box. Here, walking your agent up to
another agent and tipping it — and *seeing* a stream of light carry value from your
wallet to theirs — is something no wallet, no game, no exchange does. It makes the
world economically alive, it makes tipping creators effortless and fun, and it turns
`/play` and `/irl` from demos into places where real value moves. The screenshot
moment: two avatars mid-transfer, a glowing arc of $THREE between them, the recipient
plate ticking up live.

## What you are building

A **proximity interaction layer** in the worlds that:

1. **Detects proximity** between the viewer's agent and another agent's avatar
   (distance threshold in `play/arena.js` / `irl.js` scene space) and surfaces a
   contextual, role-aware action ring on the target.
2. **Offers the right actions by viewer role** to the *target's* wallet:
   - Visitor/owner-of-self approaching someone else's agent → **Tip** (non-custodial
     from the viewer's connected wallet) and **Pay · x402** (call the target's
     service) and **Fork to own**.
   - Approaching your *own* agent → quick **deposit / open hub**.
3. **Visualizes the transfer** — a real, on-chain-confirmed transfer animates as a
   particle/arc stream from payer to payee; the payee's Living-Avatar plate (Task 01)
   pulses and updates its balance from the real holdings read.

Every transfer is a **real signed transaction** — the non-custodial tip flow for
visitor→agent (`src/shared/agent-tip.js`), x402 for service payments
(`/api/x402-pay`), recorded via `POST /api/agents/:id/solana/tip`. No simulated money.

## Real data & APIs

- Identify the target agent from the world's avatar→agent mapping (the worlds already
  load agents; reuse that — grep `irl.js`, `play/arena.js`, `app.js`). Resolve
  ownership/role via the decorated record / `/api/auth/me`.
- Tip: existing client flow `tipAgent({ toAddress, token, amount, network })` →
  Phantom/Backpack/Solflare → submit via `/api/solana-rpc` → record signature.
- Pay: `POST /api/x402-pay` (respect spend guards, SSE stages); show the real result.
- Recipient balance update: re-read `GET /api/agents/:id/solana/holdings` after
  confirmation; animate the delta. $THREE uses its CA from `00-README`.
- Multiplayer presence: use whatever realtime presence the worlds already use (grep
  for the room/socket layer). If others in the room should see the transfer too,
  broadcast a lightweight "transfer" presence event (no secrets, just from/to/asset/
  amount/signature) so every client renders the same arc. If no broadcast channel
  exists, render it locally for the payer + payee and still confirm on-chain.

## Surfaces

- `src/play/arena.js` + `src/app.js` (the `/play` world), `src/irl.js` (the `/irl`
  map/world), and `src/walk.js` if it supports multiple avatars. Reuse Task 01's
  plate for the live balance tick.

## UX spec

- **Discovery**: an unobtrusive proximity prompt ("◎ Tip · Pay · Fork") that appears
  when near a transactable avatar; keyboard/controller and pointer both work.
- **Flow**: pick action → amount (presets + custom) → wallet signs → optimistic arc
  begins → on confirmation the arc completes and the plate ticks; on failure the arc
  dissolves and a clear, recoverable error shows (insufficient funds, rejected,
  RPC error → retry). Never a fake success.
- **States**: idle, in-range, action-open, signing, sending, confirmed, failed, plus
  logged-out (connect prompt) and approaching-your-own-agent (deposit/hub).
- **Microinteractions**: arc color by asset ($THREE = the platform accent), payee
  plate pulse, a tasteful confirmation chime is optional and muted by default.
- **Accessibility**: the entire flow is operable without the 3D interaction (a panel
  fallback listing nearby agents with the same actions); `prefers-reduced-motion`
  shows a static line + toast, not a particle storm.
- **Performance**: cap concurrent arcs, instance particles, only run proximity checks
  on a throttled tick, never per-frame allocate.

## Edge cases

Target has no wallet (offer Fork only) · self-proximity · multiple agents in range
(disambiguate) · payer wallet not connected/insufficient · tx rejected/failed
mid-arc · two viewers tipping the same agent at once · target leaves range mid-flow ·
reduced motion · spectators in the room · spend-limit/frozen target (x402 still pays
*to* it, never *from* it without owner auth).

## Definition of done

Meets the README DoD, plus: a real visitor→agent tip and a real x402 payment both
complete on-chain from inside a world, the arc reflects real confirmation (not a
timer), the payee's live balance updates from a real read, all three viewer roles are
correct, and there is a fully accessible non-3D fallback.

## Then: improve, then delete this file

Push it: maybe "tip to react" emotes, a nearby-agents radar, or surfacing recent
proximity tips into Task 08's economy feed. Add the delight that makes it shareable.
Update `data/changelog.json`. **Then delete this prompt file.**
</content>
