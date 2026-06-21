# 09 — Security review: payments, wallets, contracts

**Phase 2. [parallel-safe]** with 07–08, 10–11. Authorized internal security
review of our own platform.

## Where you are

`/workspaces/three.ws` — three.ws, 3D AI-agent platform with real money flows:
Solana + x402 USDC payments, pump.fun launches, agent wallets, on-chain identity
(`contracts/`, ERC-8004), skill-license NFTs, SNS pay-by-name. Read
[CLAUDE.md](../../CLAUDE.md). The only coin is **$THREE**. There is a
`/security-review` skill and `docs/audits/` — use them.

## Objective

A focused security review of every surface where value moves or trust is
asserted, with each finding either fixed or filed with a concrete remediation.
This is defensive review of our own code — not exploitation of third parties.

## Why it matters

A token platform is a target. One reentrancy bug in a contract, one missing
signature check in a payment verifier, one replayable x402 receipt, one agent
wallet that can be drained — any of these ends the company. Billion-dollar trust
is earned by being provably hard to rob.

## Instructions

1. **Run the built-in review** on the current tree and capture output:
   - Invoke the `/security-review` skill (or `npm run` equivalent if wired).
   - `npm audit --omit=dev` for dependency CVEs; triage criticals.
2. **Payments / x402** (`api/x402*`, `public/x402*.js`, `x402-buildout/`):
   - Verify payment receipts can't be replayed (nonce/expiry checked).
   - Verify the amount/asset/recipient in the signed payload match what the
     server charges — no client-trusted price.
   - Verify settlement is idempotent and that a failed settlement can't grant
     access. Confirm the facilitator/verifier responses are validated, not
     trusted blindly.
3. **Wallets & custody** (`public/wallet/`, agent-wallet prompts, session keys):
   - Confirm private keys / seed material never touch the client or logs.
   - Review any server-side signing: least privilege, bounded amounts, no
     arbitrary-instruction signing from unvalidated input.
   - SIWE/session: nonce, domain binding, expiry, and that a session can't be
     replayed or fixated.
4. **On-chain programs** (`contracts/`, Anchor + Foundry):
   - Review access control (who can mint/close/transfer), integer overflow,
     PDA/seed derivation, signer checks, and reentrancy where applicable.
   - Run the contract test suites; add tests for any unchecked authority.
5. **Web app**: XSS in any place user content is rendered (agent names, chat,
   profiles) — confirm output is escaped/sanitized; CSP headers present;
   no `dangerouslySetInnerHTML`/`innerHTML` with untrusted input; SSRF in any
   server-side fetch that takes a user URL; open-redirect in auth callbacks.
6. **Secrets**: cross-check with [07](07-secrets-and-env-hardening.md) — no key
   in client, no token in logs.
7. **Write `docs/audits/security-review-YYYY-MM-DD.md`**: each finding with
   severity (crit/high/med/low), location, impact, and status (fixed | filed).
   Fix all crit/high in this task; file med/low with owners.

## Definition of done

- [ ] `/security-review` + `npm audit` run; results captured in the report.
- [ ] x402 replay, amount-tampering, and idempotency checks verified or fixed.
- [ ] No private key/seed reachable from client or logs (confirmed).
- [ ] Contract access-control / signer / overflow review done; contract tests
      pass; new tests added for any gap found.
- [ ] XSS / CSP / SSRF / open-redirect checks done on user-content surfaces.
- [ ] `docs/audits/security-review-<today>.md` committed with severity-rated
      findings; all critical & high fixed.
- [ ] Changelog: `security` entry for any user-relevant hardening (never disclose
      an unpatched vuln in the public changelog).
