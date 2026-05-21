# USE-38: Bounty Poster

## Goal
Agent that, when it encounters a task it can't or shouldn't complete itself, automatically posts a bounty for it. Pays the listing fee via x402.

## Why (from PROJECT-IDEAS.md)
> Agent outsources tasks it can't finish, posts bounties automatically. Payment moment: Listing fee per bounty.

## Reference
- PROJECT-IDEAS.md

## Dependencies
- USE-00..09, USE-22, USE-24
- USE-34 (bounty-hunter — same Bountycaster integration, reverse direction)

## Files to create
- `agents/bounty-poster/`
- `agents/bounty-poster/src/index.js`
- `agents/bounty-poster/src/categorizer.js` — decide if a task is bounty-postable
- `agents/bounty-poster/src/poster.js` — Bountycaster + Craigslist post creator
- `api/agents/bounty-poster.js` — paid endpoint accepting a task

## Files to modify
- Root `package.json` — add workspace
- `.env.example` — `BOUNTYCASTER_API_KEY`, `BOUNTY_POSTER_DEFAULT_REWARD_USD`, `BOUNTY_POSTER_DEFAULT_DURATION_HOURS`

## Implementation

### Endpoint contract
```
POST /api/agents/bounty-poster
Body: {
  title: "Need a 3D model of a wolf",
  description: "...",
  rewardUsd: 50,
  durationHours: 48,
  acceptanceCriteria: "..."
}
402 → pay listing fee (varies by platform)
200 → { platform, bountyUrl, expiresAt, escrowTx? }
```

### Multi-platform posting
- Bountycaster: post via API
- GitHub Issues with `bounty` label: open issue in a designated repo
- Optionally: cross-post to Twitter/Farcaster

### Escrow
Hold the reward in an on-chain escrow contract (out of scope for v1 if not available — provide a payment-on-completion flow instead).

### Acceptance verification
Out of scope for v1. The bounty poster pays the listing fee; another flow (e.g., human review via tutor-style approval) accepts submissions.

### Idempotency
Same title + description posted twice → return the existing bounty URL (don't double-post).

## Wiring checklist
- [ ] Bountycaster API integrated
- [ ] GitHub posting if `GITHUB_TOKEN` set
- [ ] Idempotency dedup on title+description hash
- [ ] Real listing fee paid via x402
- [ ] Bounty visible on the platform after API call

## Acceptance
- [ ] Post a real test bounty to Bountycaster, see it live
- [ ] Re-posting same task returns existing bounty
- [ ] Audit log shows listing fee paid
- [ ] Returned URL is reachable
