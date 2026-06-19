# Invention 07 — Integration, novelty & QA pass (run LAST)

> **Read [00-README-inventions.md](./00-README-inventions.md) first.** Run after
> inventions 01–06 land (or as a continuous sweep). This task ships fixes — it is
> not a read-only review.

## Mission

Make the six inventions feel like **one coherent, impossible-to-copy product** — and
prove each is genuinely novel, fully real, and funds-safe. The bar: a senior
engineer finds nothing half-wired, a professional trader finds nothing fake, and a
competitor cannot replicate any of it without our entire stack.

## 1. The novelty test (per invention)

For each of 01–06, write one sentence naming the competitor feature it beats and the
specific stack capability that makes it uncopyable (avatar + wallet + identity +
persona + voice + multiplayer + agent-payments + Meshy). If any invention is
actually just a generic feature competitors already have, escalate it — fix or flag.

## 2. The fusion check (the inventions must reference each other)

Verify the inventions are wired into one another, not six islands:

- Reputation (`02`) feeds the chip, the theater stage positions (`01`), and gates
  vaults (`03`).
- The co-pilot's rationale (`04`) shows in the theater (`01`) and to vault backers
  (`03`).
- The economy (`05`) flows animate in the theater (`01`); earnings show on the agent.
- Genesis (`06`) hands off into fund → co-pilot → theater and uses fork-to-own.

Fix every missing connection. The product should feel like everything is linked.

## 3. Real-data audit (zero tolerance)

Grep the whole program's diff for: sample arrays, hardcoded balances/addresses/
prices/scores, `setTimeout` fake progress (including fake Meshy/LLM/tx progress),
TODOs, stubs, commented-out code, and any non-$THREE coin reference. Replace every
one with the real implementation. Every number, event, fill, score, payment, and
generation must trace to a real API/chain/DB call visible in the Network tab.

## 4. Funds-safety & authorization audit

For every path that moves money (snipe, vault deposit/redeem, agent-to-agent
payment, withdraw): confirm owner-gating in UI **and** server-side, spend-policy
enforcement, CSRF on writes, idempotency where settlement occurs, drawdown/circuit
breakers where applicable, and a custody-trail entry. Confirm an over-limit attempt
is actually blocked, and a forked agent's funds/reputation/earnings/vaults are never
co-mingled with its parent's. Re-derive truth from chain before claiming outcomes.

## 5. AI-safety audit (for `04` and any LLM path)

Confirm the model only ever cites real data you fetched, structured output is
validated against real inputs before display/action, suggested actions are
re-checked against live state + limits at execution, keys are never browser-exposed,
and the model can never move funds beyond policy. No hallucinated numbers reach the
user.

## 6. Edge-case sweep

Empty states everywhere (quiet market, no track record, no vault backers, no economy
activity, Meshy failure); 0/1/1000 scale; very long names; network/stream drops
(reconnect, never show stale as live); session expiry mid-action; chain reorg /
unconfirmed tx; mobile. Each designed and honest. Fix every raw error or fake value.

## 7. Performance & consistency

Theater at 60fps with many avatars (LOD/culling); no N+1 storms; polling/streams stop
offscreen and on `visibilitychange`; heavy modules (3D, charts, voice, Meshy) lazy-
loaded. One shared component per concern under `src/shared/`; one set of formatters/
role-resolvers; one design-token-driven visual language. Test at 320/768/1440.

## 8. Browser verification

`npm run dev`. Walk the full fused journey as owner and as visitor: genesis → wallet
→ co-pilot rationale → snipe within limits → reputation updates → theater
performance → open a vault / back an agent → agent earns in the economy. Zero
console errors/warnings from program code. Capture real API calls succeeding.

## 9. Tests & changelog

`npm test` passes. Add/extend tests for the new engines (reputation P&L matcher +
anti-gaming, vault share accounting + circuit breaker, payment settlement +
idempotency, LLM output validation). Ensure each invention has a real changelog
entry; `npm run build:pages` validates.

## Definition of done

Every invention proven novel, real, funds-safe, AI-safe, fused with the others,
edge-cased, performant, browser-verified; tests green; changelog complete. Produce a
short written summary: per invention — what it is, the competitor it beats, the proof
it's real (the real flow you ran), and what you fixed.

When done: commit (explicit paths only; push to **both** remotes if asked), then
**delete this file** (`prompts/inventions/07-integration-qa.md`). When 01–07 are all
deleted, delete `00-README-inventions.md` too — the program is shipped.
