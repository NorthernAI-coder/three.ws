# 18 — Elevate the Vanity Grinder Listing (make it a flagship)

Read `prompts/x402-overhaul/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
Independent work order — completes fully on its own.

## Why
`api/x402/vanity.js` (+ `vanity-premium.js`, `vanity-verifiable.js`) is genuinely useful and
hard to copy — a real Rust/WASM ed25519 grinder that returns a custom Solana address, keyless,
pay-per-call. It should be one of our headline products. Make the listing reflect that.

## Build (listing quality — do not break the grinder)
- Audit the three vanity routes; make sure the primary agent-facing one has a crisp `BAZAAR`
  description that leads with the use-case (branded token mint address, branded agent/treasury
  wallet), the format options (keypair vs BIP-39 mnemonic), the char caps + price ladder, the
  security model (nothing stored; served once over TLS; optional `sealTo` ECIES), and the
  keyless/no-account pledge.
- Ensure input/output schemas in discovery are complete and accurate — an agent should grind
  an address from the schema alone.
- Confirm price ladder in `_lib/x402-prices.js` matches the live handler; fix metadata drift.
- Update `api/wk.js` discovery mirror(s) for the vanity routes; run
  `node scripts/verify-x402-discovery.mjs` until clean.
- If `vanity-premium.js` / `vanity-verifiable.js` overlap confusingly, clarify each one's
  distinct purpose in its description (don't merge/remove here — that's a bigger call; note it
  for prompt 21/22 if consolidation is warranted).

## States / correctness
Live 402 ↔ discovery parity (verify script). Don't alter grinding/signing behavior. Verify the
endpoint still returns a real, valid vanity keypair by calling it (short prefix) — capture proof.

## Tests
Discovery/live parity; schema completeness; one real grind (1-char prefix) returns a valid
address matching the prefix.

## Definition of done
Inherit 00-CONTEXT DoD + gates (skip new-endpoint parts). Plus:
- [ ] Sharpened descriptions + accurate schemas; verify script passes (paste output).
- [ ] One real grind captured in PROGRESS.md (address matches requested prefix).
- [ ] Vanity doc in `docs/` created/updated (use-cases, formats, security model, price ladder).
- [ ] `data/changelog.json` (tags: `improvement`) — "Vanity address grinder listing overhauled".
