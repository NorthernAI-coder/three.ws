# USE-30: Prediction-Market Oracle

## Goal
Paid endpoint that resolves a prediction market question by fetching consensus from paid web/news sources, applying a verifiable algorithm, and returning a signed answer with confidence. Charges only on settlement (resolution fee).

## Why (from PROJECT-IDEAS.md)
> Agent resolves any prediction market by fetching consensus facts online. Payment moment: Resolution fee on settlement.

## Reference
- PROJECT-IDEAS.md
- Bazaar (USE-13/14) for discovering source data feeds

## Dependencies
- USE-00..09
- USE-15 (idempotency — same question must yield same answer)
- USE-17 (offer-receipt — resolution must be verifiable)
- USE-22, USE-24

## Files to create
- `agents/oracle/`
- `agents/oracle/package.json`
- `agents/oracle/src/resolver.js` — main resolution logic
- `agents/oracle/src/sources.js` — paid sources: web search (Exa, Tavily, Brave), news APIs, fact-checker chain
- `agents/oracle/src/confidence.js` — Bayesian aggregation across sources
- `agents/oracle/src/attestation.js` — sign the resolution with our offer-receipt key
- `api/agents/oracle-resolve.js` — paid `$0.50` endpoint to resolve a question

## Files to modify
- Root `package.json` — add workspace
- `.env.example` — `ORACLE_MIN_SOURCES` (default 3), `ORACLE_CONFIDENCE_THRESHOLD` (default 0.8)

## Implementation

### Endpoint contract
```
POST /api/agents/oracle-resolve
Body: { question: "Will BTC close above $100k on Jan 1 2027?", deadline: "2027-01-02T00:00:00Z" }
402 → pay $0.50
200 → { answer: "yes"|"no"|"undetermined", confidence: 0.0..1.0, sources: [{ url, excerpt, weight }], signedAttestation: "0x..." }
```

### Resolution algorithm
1. Generate search queries from the question (LLM call, paid via OpenAI/Anthropic worker proxy)
2. Query N paid search APIs in parallel via Bazaar-discovered services
3. For each result, extract claim + supporting/refuting evidence
4. Bayesian aggregation with source-weight priors (CNN/Reuters > random blog)
5. If confidence < threshold OR fewer than min sources, return `undetermined`
6. Sign attestation with offer-receipt key

### Idempotency required
Same `{question, deadline}` MUST yield same answer. Use payment-identifier extension with `required: true`. Cache results for 30 days.

### Source pool
- Exa Search (paid)
- Tavily AI Search (paid)
- Brave Search API (paid)
- Wikipedia (free, with weighting)
- Our own paid fact-checker (USE-32) for cross-validation

### Attestation
Sign `{question, deadline, answer, confidence, sources, resolvedAt}` with EIP-712 using our offer-receipt key. Any party can verify the resolution against our DID document.

### Question normalization
Strip whitespace, lowercase, hash. Cache by normalized hash so semantically-equivalent variants don't double-charge but textually-different questions don't collide.

## Wiring checklist
- [ ] Bazaar-discovered search APIs configured
- [ ] Payment-identifier required on this endpoint
- [ ] Cache TTL = 30 days
- [ ] Attestation key separate from payment-receiving wallet
- [ ] LLM token usage capped per call (spending cap)
- [ ] No determinism leaks (timestamp NOT in hash basis)

## Acceptance
- [ ] Two resolutions of the same question produce identical answer + signature
- [ ] Resolution of unanswerable question returns `undetermined` with low confidence
- [ ] At least 3 different paid sources verifiably consulted (audit log)
- [ ] Attestation verifies against our DID document
- [ ] Costs $0.50 to call; observed per-call source costs sum to < $0.50 (we keep margin)
