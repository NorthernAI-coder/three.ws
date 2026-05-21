# USE-32: Real-Time Fact Checker

## Goal
Paid endpoint: caller highlights a claim, we find supporting sources, pay each per-page retrieval, return a verdict with cited sources.

## Why (from PROJECT-IDEAS.md)
> Journalists highlight a claim; agent finds supporting sources and pays per page. Payment moment: Per-page retrieval.

## Reference
- PROJECT-IDEAS.md
- Bazaar (USE-13/14) for source discovery

## Dependencies
- USE-00..09
- USE-15 (idempotency)
- USE-22 (caps — we pay PER PAGE, costs can compound)
- USE-30 (oracle resolution pattern)

## Files to create
- `agents/fact-checker/`
- `agents/fact-checker/src/index.js`
- `agents/fact-checker/src/search-sources.js` — Exa, Tavily, Brave (paid via x402)
- `agents/fact-checker/src/scrape.js` — Browserbase or Firecrawl (paid per page)
- `agents/fact-checker/src/llm-verdict.js` — local LLM call to weigh evidence
- `api/x402/fact-check.js` — paid endpoint $0.25 base + variable based on sources

## Files to modify
- Root `package.json` — add workspace
- `.env.example` — `EXA_API_KEY`, `TAVILY_API_KEY`, `BROWSERBASE_API_KEY`, `FIRECRAWL_API_KEY` (any subset works — agent uses what's available)

## Implementation

### Endpoint contract
```
POST /api/x402/fact-check
Body: { claim: "The Eiffel Tower is 330 meters tall.", strictness: "high"|"medium"|"low" }
402 → pay $0.10 base
200 → {
  verdict: "supported"|"contradicted"|"mixed"|"insufficient",
  confidence: 0..1,
  sources: [
    { url, excerpt, stance: "supports"|"contradicts", weight, retrievedAt }
  ],
  costBreakdown: { searchCalls: 3, pageScrapes: 5, llmTokens: 2400, totalUsdc: "..." },
  attestation: "0x..."
}
```

### Pricing model
Use the `upto` scheme: max $1.00 per check, actual cost = base + variable. Caller sees actual charge in `PAYMENT-RESPONSE.amount`.

### Algorithm
1. LLM generates 3-5 search queries
2. Run searches across configured paid search APIs
3. Top 5 results per search ranked by source authority
4. Scrape top N (configurable, capped) pages via Browserbase or Firecrawl
5. LLM extracts excerpts + stance per page
6. Weighted aggregation → verdict + confidence

### Source weighting
Authority score per domain: `.gov` and `.edu` > major news (.com BBC, AP, Reuters) > minor news > blogs > forums. Maintained as a curated JSON list checked in.

### Idempotency
Same claim text + strictness → same answer (caching with 7-day TTL). Required idempotency per USE-15.

### Attestation
Sign verdict + source URLs + retrievedAt timestamps. Receipt stored.

## Wiring checklist
- [ ] At least one of (Exa, Tavily, Brave) configured
- [ ] At least one of (Browserbase, Firecrawl) configured
- [ ] `upto` scheme on the endpoint with proper cost accounting
- [ ] Source authority list checked in and updated
- [ ] Cache TTL 7 days
- [ ] Spending cap per-claim enforced

## Acceptance
- [ ] Fact-check a known-true claim ("Eiffel Tower height") → `supported` with high confidence
- [ ] Fact-check a known-false claim → `contradicted` with high confidence
- [ ] Fact-check a controversial claim → `mixed` or `insufficient`
- [ ] Per-call cost breakdown shows actual paid expenditure (search + scrape + LLM)
- [ ] Two checks of identical claim → same verdict and signature; second call uses cache (no re-spend)
- [ ] Attestation verifies
