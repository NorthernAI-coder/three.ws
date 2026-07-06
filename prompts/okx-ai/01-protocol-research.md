# Work Order 01 — Pin down the OKX Agent Payments Protocol SELLER-side spec

Read `prompts/okx-ai/00-CONTEXT.md` first. Then read `/workspaces/three.ws/CLAUDE.md`. Both bind you.

## Mission

Our listing was rejected because our A2MCP endpoint doesn't speak the OKX Agent Payments
Protocol. Before we write a line of integration code, we need the **exact seller-side
contract**, from primary sources — not inference. Your deliverable is a spec document that
Work Order 02 can implement against without opening a browser.

**Do not guess. Every claim in the spec must cite where it came from** (URL, repo file, CLI
output, or a captured wire payload). If two sources disagree, capture both and flag it.

## What must be answered (the spec is incomplete until every row is filled)

| # | Question |
|---|---|
| 1 | Exact 402 challenge shape OKX's listing validator accepts from an A2MCP seller: header (`PAYMENT-REQUIRED`? `WWW-Authenticate: Payment`?), body, required fields per `accepts[]` entry. |
| 2 | Which scheme(s) a seller must offer: `exact`? `upto`? `aggr_deferred`? Is one mandatory for listing approval? |
| 3 | The fee token at `0x779ded0c9e1022225f8e0630b35a9b54be713736` on X Layer: symbol, decimals, is it EIP-3009 capable or Permit2-only? (Read the contract on the X Layer explorer — https://www.oklink.com/xlayer — and cite the contract page.) |
| 4 | OKX facilitator: verify/settle endpoint URLs, request/response shapes, auth requirements (API key? none?), and the `extra.facilitatorAddress` value for `upto` if applicable. |
| 5 | The official OKX Payment SDK the rejection email refers to: package name (npm? GitHub?), version, what it does for the seller (challenge building? verification? settlement?), license. Evaluate per CLAUDE.md "Open source first" — we prefer adopting their SDK over hand-rolling, if it's usable in Vercel functions. |
| 6 | How the payment interacts with MCP transport: does OKX expect HTTP-level 402 on the MCP endpoint URL, or MCP-level PaymentRequired structuredContent, or both? (Our endpoint currently does MCP-level via `_meta` — see api/mcp-3d.js.) |
| 7 | How listing review validates the endpoint: does the validator call the endpoint? What does it send, what must it see? Any registered-endpoint URL format constraints? |
| 8 | Settlement finality: how does the seller confirm it was actually paid before doing the work (verify response? on-chain check? `PAYMENT-RESPONSE` header contract)? |

## How to get answers (do ALL of these, in this order)

### A. Reverse-engineer a LIVE approved seller (highest-value evidence)

An approved A2MCP seller's wire behavior is, by definition, what passes review.

1. Session preflight (00-CONTEXT). Then find approved A2MCP sellers with real endpoints:
   ```bash
   onchainos agent search --query "health check API service data" --status active
   onchainos agent service-list --agent-id 2087   # XBubbleAI — has a $0.000001 Health Check A2MCP service
   onchainos agent service-list --agent-id 2023   # Onchain Data Explorer — 174 sales, 19 A2MCP services
   ```
2. `curl -i` each endpoint with no payment. Capture the full 402 response — status, every
   header, body. Decode `PAYMENT-REQUIRED` (base64 → JSON). Save every capture verbatim into
   the spec's appendix.
3. **Pay one for real.** XBubbleAI's Health Check costs $0.000001 — effectively free evidence.
   Run the buyer flow end to end: `onchainos payment pay --payload '<raw 402>'`, replay with
   the returned header, capture the success response including any `PAYMENT-RESPONSE` header.
   This gives us a complete, real request/response pair for both legs. If wallet lacks the
   dust + gas, compute what's needed and ask the owner to fund (00-CONTEXT rule 3).
4. Diff at least TWO approved sellers' 402 challenges. Fields present in both = required.
   Fields differing = optional. Record the matrix.

### B. Primary documentation

1. `gh repo view okx/onchainos-skills`; clone/read it — the seller-side docs or examples may
   live next to the CLI. Also `onchainos payment --help` and every subcommand's `--help`.
2. OKX Developer Portal: https://web3.okx.com/onchain-os/dev-portal — find the Agent Payments
   Protocol / Payment SDK docs. WebFetch the relevant pages; quote exact field tables.
3. Search GitHub org `okx` for payment SDK repos (`gh search repos --owner okx payment`,
   also npm: `npm search okx payment`, check `@okx-dex/…`, `@okxweb3/…` scopes).
4. x402 baseline: https://x402.org — note where OKX's dialect EXTENDS or DIVERGES from
   vanilla x402 v2 (that delta is exactly what our existing code doesn't emit).

### C. Interrogate our own client-side skills

`.claude/skills/okx-agent-payments-protocol/` + `references/*.md` describe what OKX buyers
can sign. Anything a buyer CAN'T sign, a seller must not require. Extract constraints
(e.g. `upto` requires `extra.facilitatorAddress`; `exact`+EIP-3009 requires `extra.name`).

## Deliverable

Write **`specs/okx-agent-payments.md`** (specs/ is our load-bearing-contract directory — match
neighboring specs' structure):

1. **Seller contract** — exact challenge our endpoint must emit (concrete JSON example with
   OUR values: X Layer 196, fee token, our payTo `0x75d0…cf69`), verify/settle call contract,
   paid-replay handling, `PAYMENT-RESPONSE` emission.
2. **Answer table** — all 8 questions above, each with its citation.
3. **SDK decision** — adopt OKX's SDK vs. extend our `api/_lib/x402-spec.js`, with rationale
   per CLAUDE.md Open-source-first rules (weekly downloads / maintenance / license / Vercel
   compatibility all checked, not assumed).
4. **Gap analysis** — field-by-field diff: what `paymentRequirements()` in
   `api/_lib/x402-spec.js` emits today vs. what OKX requires. This is 02's work list.
5. **Appendix** — raw captures: every 402 challenge captured, the paid Health Check
   request/response pair, CLI outputs. Verbatim, labeled, dated.

## Definition of done

- [ ] All 8 questions answered with citations; unknowns explicitly marked UNRESOLVED with
      what was tried (an honest UNRESOLVED beats a confident guess — 02 will treat any
      UNRESOLVED row as a blocker to raise, not a detail to improvise)
- [ ] At least one real 402 challenge from an approved seller captured verbatim
- [ ] At least one real micro-payment executed and both legs captured (or funding requested
      and the exact blocker documented)
- [ ] `specs/okx-agent-payments.md` written; every code sample real, every link live
- [ ] `data/changelog.json`: no entry (internal research — per CLAUDE.md, internal work gets none)
- [ ] `prompts/okx-ai/PROGRESS.md` appended: findings summary, unresolved items, green-light
      status for Work Order 02
- [ ] Committed (explicit paths: `specs/okx-agent-payments.md`, `prompts/okx-ai/PROGRESS.md`)
      and pushed to both remotes (threeD failure = report, not block)

## Anti-laziness gates

- "The docs probably say X" is not a citation. Fetch it or mark UNRESOLVED.
- Do not write the spec from the client-side skill files alone — they describe the buyer.
  The live-seller captures (section A) are mandatory, not optional color.
- If the dev portal requires an account/login you can't complete, say exactly what's needed
  from the owner and continue with every other source in parallel.
