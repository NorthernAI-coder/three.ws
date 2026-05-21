# USE-31: Rapid KYC/AML Checker

## Goal
Paid endpoint that screens a wallet address against sanctions lists and basic risk heuristics. $0.25 per check, real Chainalysis / TRM data, structured response.

## Why (from PROJECT-IDEAS.md)
> Pay $0.25 to screen a wallet address against sanctions lists or heuristics. Suggested APIs: Chainalysis, TRM, or your own heuristics.

## Reference
- PROJECT-IDEAS.md
- Existing `api/x402/onchain-identity-verify.js` (already in repo — likely the precursor)

## Dependencies
- USE-00..09
- USE-15 (idempotency — same address same answer)
- USE-22 (caps)
- USE-26 (self-hosted facilitator already uses similar Chainalysis integration; reuse)

## Files to create
- `api/x402/kyc-screen.js` — paid endpoint
- `agents/kyc/src/sources.js` — Chainalysis Address Screening, TRM Address Risk Score, local heuristics (large-tx, mixer-touched, sanctions intersection)
- `agents/kyc/src/aggregator.js` — combines sources into a single risk score
- `agents/kyc/src/cache.js` — Redis-backed cache (high TTL since results stable)

## Files to modify
- `api/x402/onchain-identity-verify.js` — refactor to delegate to the new module; keep endpoint compat
- `.env.example` — `CHAINALYSIS_API_KEY`, `TRM_API_KEY`

## Implementation

### Endpoint contract
```
POST /api/x402/kyc-screen
Body: { address: "0x...", chain: "eip155:1"|"solana:..." }
402 → pay $0.25
200 → {
  address,
  chain,
  risk: { score: 0..100, level: "low"|"medium"|"high"|"sanctioned", reasons: [...] },
  sources: { chainalysis: {...}, trm: {...}, heuristics: {...} },
  signedAt: "...",
  attestation: "0x..."
}
```

### Idempotency / caching
- Cache results per address for 24 hours.
- Sanctions list changes daily; we accept up-to-24h staleness.
- Re-screening within 24h returns cached + same charge (idempotency makes it free on retry).

### Sources
1. Chainalysis Address Screening (sanctioned-yes/no + categories)
2. TRM Labs Address Risk Score (0-10 score + indicators)
3. Local heuristics:
   - Touched known mixer (Tornado, etc.)
   - Funded by sanctioned address (1 hop)
   - High activity in flagged time window
   - Solana: program account vs personal wallet

### Risk aggregation
Weighted sum with hard overrides:
- If Chainalysis sanctioned → risk = 100 ("sanctioned")
- Else if TRM > 7 → high
- Else weighted blend

### Multi-chain support
EVM and Solana addresses supported. Different sources per chain.

### Attestation
Signed by our offer-receipt key. Receipts go to USE-17 storage so callers can prove they screened an address at a given time.

## Wiring checklist
- [ ] Chainalysis + TRM API keys provisioned
- [ ] Both EVM and Solana addresses supported
- [ ] Cache 24h; idempotency for retries within cache
- [ ] Risk aggregation tested with known sanctioned / known-clean addresses
- [ ] Attestation signed and verifiable

## Acceptance
- [ ] Screen a known sanctioned address (e.g., Tornado deposit) → returns `sanctioned`
- [ ] Screen a known-clean exchange hot wallet → returns `low`
- [ ] Same address screened twice within 24h → second call paid but returns cached + same attestation
- [ ] Attestation verifies against our DID document
- [ ] Per-call cost (Chainalysis + TRM) tracked in audit log so we know margin
