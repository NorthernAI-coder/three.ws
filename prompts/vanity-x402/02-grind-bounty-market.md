# Task 02 — The x402 grind-bounty market (trustless distributed vanity)

> Read [00-README-orchestration.md](./00-README-orchestration.md) first.

## The wedge (why this is gamechanging)

The server grinder caps at ~3 chars in 45s. A 5–8 character vanity (or a full word
like `THREEws…`) is hours-to-years on one machine — so today it's "run your browser
overnight and hope." Nobody sells **hard** vanity addresses at scale, trustlessly.

Invent a **two-sided marketplace**: requesters post a hard pattern and **escrow an
x402 bounty**; a fleet of independent **worker agents** (anyone — including
three.ws's own workers, or a user's spare cores) grind in parallel and race to find
it. The winner submits a proof and claims the bounty. The breakthrough:

- the found key is **sealed to the requester's X25519 key**, so the worker who finds
  it **never sees the secret** — they earn the bounty but cannot steal the wallet;
- settlement is **trustless and automatic** via x402 — winner is paid on a valid,
  first proof; no work, no pay; duplicate/late proofs are rejected.

This turns "impossible vanity" into a liquid, encrypted, pay-for-results market. It
also monetizes idle compute and is genuinely novel.

## What to build

A bounty market with three real components: an order/escrow API, a worker protocol,
and a UI. Build on the real grinders and x402 rails — no simulation.

### Data + escrow
- A `vanity_bounties` table (Postgres via [@neondatabase/serverless](../../api/_lib))
  / Upstash for hot state: pattern, ignoreCase, requester X25519 pubkey, bounty
  amount + asset (USDC on Base/Solana via x402, or escrowed $THREE), status
  (`open|claimed|settled|expired|cancelled`), difficulty estimate, created/expiry,
  winning proof.
- Escrow the bounty up front (x402 payment held until claim, or an on-chain escrow
  the API controls). Expiry refunds the requester. Real funds, real settlement.

### Worker protocol (`/api/vanity/bounties/*`)
- `GET /open` — list claimable bounties + difficulty + reward, with a lease/lock so
  workers don't all redo the same one (claim a work-lease with a short TTL).
- Worker grinds locally (reuse [grinder.js](../../src/solana/vanity/grinder.js) in
  browser / a Node worker harness using [grinder-node.js](../../src/solana/vanity/grinder-node.js)
  or the WASM directly) until it finds a match.
- `POST /claim` — submit `{ bountyId, address, sealedSecret (sealed to requester's
  key), proof }`. Server verifies: address matches the pattern; the sealed envelope
  is well-formed and addressed to the requester; first valid claim wins (atomic
  compare-and-set); then settles the bounty to the worker via x402 and marks the
  bounty `settled`. The requester later opens the sealed secret with their private
  key. The worker is paid **without** ever holding the plaintext.
- Anti-cheat: reject claims whose address doesn't match; reject a sealed envelope not
  addressed to the requester; rate-limit; idempotent claims; handle the race where
  two workers find different valid keys (first committed wins, the other is told).

### UI
- `/vanity/bounties` — browse/post/track. Post a bounty: pattern builder (reuse the
  difficulty meter + estimator), choose reward + expiry, generate/enter your X25519
  recipient key (use `generateRecipientKeypair()` and make the user save the private
  key — warn clearly). Live status, ETA, number of workers, claim event.
- "Grind for bounties" mode: opt in to run the browser worker pool against open
  bounties and earn. Live odometer, earnings, pause/resume. Honest about CPU use.
- On settle: the requester sees "found!" and can open + download/seal-import the
  wallet; the worker sees their payout.

## Hard requirements

- Real x402 escrow + settlement (`verifyPayment`/`settlePayment`,
  [x402-spec.js](../../api/_lib/x402-spec.js)); real on-chain payouts. No fake balances.
- The worker path must be **secret-blind by construction** — the only thing a worker
  can submit is a sealed envelope addressed to the requester. Never accept or relay a
  plaintext secret. Verify the seal recipient server-side before paying.
- Atomic single-winner settlement (DB transaction / Redis Lua / compare-and-set).
  Exactly-once payout. Expiry refunds are real and reliable.
- Designed states everywhere; 0/1/many bounties; expired; mid-grind disconnect;
  duplicate claim; insufficient escrow; network failure mid-settle.
- `$THREE` is the only coin you may name/feature; USDC appears only as the x402
  settlement asset (runtime plumbing), never marketed as a coin.

## Definition of done

- [ ] Post → escrow → workers grind → first valid sealed claim wins → automatic x402
      payout → requester opens the sealed wallet. Proven end-to-end with real funds
      on a testable network/path.
- [ ] Secret-blind workers enforced + tested (a claim with a non-recipient seal, or a
      non-matching address, is rejected and unpaid).
- [ ] Exactly-once settlement + expiry refund, with a concurrency test for the
      two-workers race.
- [ ] `/vanity/bounties` post + browse + earn UI; every state designed; reachable
      from navigation; lazy-loaded worker pool; stops offscreen.
- [ ] Tests for matching, seal-recipient check, atomic claim, refund. Changelog +
      `npm run build:pages` clean. No mocks; `git diff` reviewed.

## Closeout

DoD + self-review, then **improve**: add a difficulty→price oracle so bounties are
auto-priced fairly; a leaderboard of top grinders; webhook/Telegram notify on found;
optionally let the bounty pay out in milestones for very hard patterns (ties to Task
07). Summarize, then **delete this file**
(`prompts/vanity-x402/02-grind-bounty-market.md`).
