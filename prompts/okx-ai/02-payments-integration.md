# Work Order 02 — Integrate the OKX Agent Payments Protocol into our A2MCP endpoint

Read `prompts/okx-ai/00-CONTEXT.md`, then `specs/okx-agent-payments.md` (produced by Work
Order 01 — if it doesn't exist or has UNRESOLVED rows in the seller contract, STOP and tell
the owner to run/finish 01 first). Read `/workspaces/three.ws/CLAUDE.md`. All three bind you.

## Mission

Make our A2MCP endpoint a **first-class OKX Agent Payments Protocol seller**: an OKX agent
following the standard buyer flow (`onchainos payment pay`) can discover the price, pay on
X Layer in the marketplace fee token, and get the tool result — with real verification and
real settlement on our side. This unblocks the #2632 relisting.

This is an ADDITION, not a replacement: our existing rails (Solana/Base/BSC via
Coinbase/PayAI facilitators) keep working for existing customers. One challenge, multiple
`accepts` entries; the OKX/X Layer entry added per the spec.

## Scope of change (read all of these files before editing any)

- `api/_lib/x402-spec.js` — `paymentRequirements()` gains the X Layer/OKX entry (or an
  OKX-specific builder if the dialect diverges too far to share one). `settlePayment` /
  verify flow gains the OKX facilitator route, selected by the network of the presented payment.
- `api/_mcp/payments.js` — `send402` / challenge emission updated per spec (header vs body,
  HTTP-level vs MCP-level — implement exactly what 01 determined the validator needs; if it
  needs both, emit both).
- `api/mcp-3d.js` — wire through; per-tool pricing via `studioX402Amount` stays authoritative.
- If 01's SDK decision was "adopt OKX's SDK": add it (pinned `^x.y.0`), wrap it behind our
  existing seams (`paymentRequirements`, `settlePayment`) so callers don't change. If "extend
  our own": implement the facilitator client in `api/_lib/` following the existing
  facilitator-client patterns in x402-spec.js.
- Config: new env vars (facilitator URL, X Layer payTo, token address, any API key) go
  through the existing `env` pattern in `api/_lib/`. Document each in the deployment steps.
  Never hardcode secrets. `payTo` on X Layer = owner wallet `0x75d0…cf69` unless the owner
  says otherwise.

## Requirements (each one is checked in 04 and 07 — cutting one WILL surface)

1. **Challenge**: unpaid call to the endpoint returns the OKX-valid 402 exactly per spec —
   X Layer `eip155:196`, fee token, correct decimals-scaled amounts from our real per-tool
   pricing, our payTo, all required `extra` fields.
2. **Verification before work**: a presented payment is verified with the OKX facilitator
   BEFORE tool execution, mirroring how `x402Ctx.verified` gates execution today. Invalid /
   underpaid / expired → correct error + fresh challenge, and the tool does NOT run.
3. **Settlement after success**: settle only after the tool succeeds (same
   pay-only-on-success semantics mcp-3d.js has today). Settlement failure after work
   delivered → log + surface per existing `sendX402Error` pattern; emit `PAYMENT-RESPONSE`
   per spec.
4. **Multi-rail coexistence**: paying via an existing rail (e.g. Base USDC through CDP) still
   works — prove it with the existing tests.
5. **Free lane intact**: `getting_started`, discovery batches (initialize / tools/list /
   ping) stay free, per the current allFree/discovery logic.
6. **Amounts are consistent**: advertised amount == verified amount == settled amount, all
   derived from `priceBatch`. One source of truth, as today.

## Testing (real, not theatrical)

- **Unit**: challenge-shape tests asserting every spec-required field, byte-exact header
  names, correct base-unit scaling for the fee token's actual decimals. Extend the existing
  test suite (`tests/`) following its patterns; `npm test` green.
- **Local integration**: run the endpoint locally (`vercel dev` or the project's dev route
  harness — check package.json scripts), `curl -i` it unpaid, decode the challenge, and
  validate it against the spec's concrete example field-by-field. Paste the capture in your
  report.
- **Buyer's-eye check**: feed the captured challenge to `onchainos payment pay --payload`
  with a logged-in session. It must ACCEPT the challenge and produce an authorization header
  (whether you then replay is 04's job — but the CLI rejecting our challenge = our bug; fix
  it now). Requires session preflight per 00-CONTEXT.
- Deploy to preview (`npx vercel` — NOT `vercel build`; see 00-CONTEXT trap #6), re-run the
  unpaid-challenge check against the deployed URL.

## Definition of done

- [ ] All 6 requirements implemented; no TODOs, no stubs, no commented-out code
- [ ] `npm test` green including new tests; test output pasted in your report
- [ ] Local + preview-deploy challenge captures pasted and field-validated against spec
- [ ] `onchainos payment pay` accepts our challenge (output pasted)
- [ ] Env vars documented; owner told exactly what to set in `vercel env` if anything new
- [ ] Docs: update `specs/okx-agent-payments.md` with an "Implementation" section mapping
      spec → code (file:line); update `docs/api-reference.md` if the public endpoint
      contract changed
- [ ] `data/changelog.json` entry (tags: `feature`,`infra`; holder-readable: e.g. "3D Studio
      tools can now be paid on X Layer via the OKX Agent Payments Protocol")
- [ ] `prompts/okx-ai/PROGRESS.md` appended: what changed, captures, what 04 must verify
- [ ] `git diff` self-reviewed line-by-line; committed (explicit paths) + pushed to both
      remotes (threeD failure = report, not block)

## Anti-laziness gates

- Getting the 402 to *look* right is half the job. Verify + settle against the real OKX
  facilitator is the other half — no `if (network === XLAYER) return {verified:true}`.
  If the facilitator can't be exercised without a funded buyer, implement fully, prove the
  request is well-formed (capture the facilitator's actual error response to an unfunded/
  unsigned attempt), and hand the funded run to 04 explicitly in PROGRESS.md.
- Don't fork a parallel payment stack. Extend the seams the codebase already has. If the
  OKX dialect genuinely can't share `paymentRequirements()`, write down why in the spec's
  Implementation section before diverging.
- Every constant (chainId, token address, facilitator URL) traced to the spec, which traces
  to a citation. No constants from memory.
