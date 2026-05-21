# USE-12: A2A Transport — Agent-to-Agent x402

## Goal
Implement the x402 A2A (Agent-to-Agent) protocol extension so this repo's agents can pay each other for services. Use task-based state management with `x402.payment.*` metadata fields, following [google-agentic-commerce/a2a-x402](https://github.com/google-agentic-commerce/a2a-x402).

## Why
- This repo has multiple agents (solana-agent-sdk, agent-payments-sdk). Agents calling agents is a real use case.
- A2A is the canonical agent-to-agent payments transport, distinct from HTTP and MCP.

## Reference
- A2A transport spec: [/tmp/x402-docs/specs/transports-v2/a2a.md](/tmp/x402-docs/specs/transports-v2/a2a.md)
- A2A protocol: [a2a-protocol.org](https://a2a-protocol.org/latest/specification)
- A2A x402 extension: [a2a-x402 spec](https://github.com/google-agentic-commerce/a2a-x402/blob/main/spec/v0.1/spec.md)

## Dependencies
- USE-00, USE-01

## Files to create
- `api/_lib/x402/a2a-server.js` — A2A-flavored payment handshake (task state `input-required` with `x402.payment.required` metadata)
- `api/_lib/x402/a2a-client.js` — agent client that handles `x402.payment.*` lifecycle
- `api/agents/a2a-paid.js` — Vercel function exposing an A2A endpoint accepting payments
- `agent-payments-sdk/src/a2a-helpers.js` — helper used by other agents in this workspace

## Files to modify
- `vercel.json` — route for `/api/agents/a2a-paid`
- AgentCard JSON returned by `/api/agents/solana/[action]?action=card` — add the x402 extension declaration:
  ```json
  "capabilities": {
    "extensions": [{ "uri": "https://github.com/google-a2a/a2a-x402/v0.1", "required": true }]
  }
  ```

## Implementation

### Server side (A2A receiver)
- On `message/send` without payment metadata: respond with a task in state `input-required` carrying `x402.payment.status: "payment-required"` and `x402.payment.required: <PaymentRequirements>`.
- On message with `x402.payment.payload`: verify via facilitator, transition task to `working`, run handler, settle, transition to `completed` with `x402.payment.receipts: [<SettlementResponse>]`.
- Activate extension via `X-A2A-Extensions: https://github.com/google-a2a/a2a-x402/v0.1` response header.

### Client side (A2A caller)
- On receiving task `input-required` with `x402.payment.status: "payment-required"`: build `PaymentPayload`, send via `message/send` with `x402.payment.status: "payment-submitted"`.
- Activate extension via `X-A2A-Extensions` request header.
- Correlate via `taskId`.

### Status lifecycle
Track full status progression per spec:
- `payment-required` → `payment-submitted` → `payment-verified` → `payment-completed` (or `payment-failed`)
- Update task state appropriately at each step.

### Catalog and identity
Surface our A2A endpoints in our AgentCard. The existing `/.well-known/agent-card.json` routes are the right place.

## Wiring checklist
- [ ] AgentCard declares the x402 extension URI and `required: true`
- [ ] Server response includes `X-A2A-Extensions` header
- [ ] Client request includes `X-A2A-Extensions` header
- [ ] Task lifecycle state transitions match spec
- [ ] Errors map to spec table (Payment Rejected, Invalid Payment, Settlement Failed, etc.)

## Acceptance
- [ ] Agent A's `/api/agents/a2a-paid` returns `input-required` task with `x402.payment.required` on first call
- [ ] Agent B (in same repo) pays, receives `completed` task with valid `x402.payment.receipts`
- [ ] On-chain settlement tx visible in receipt
- [ ] A2A endpoint listed in our AgentCard with the extension declaration
- [ ] Test cross-vendor compatibility: an external A2A client implementing x402 v0.1 successfully completes a payment
