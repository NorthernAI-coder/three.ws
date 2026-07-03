# Task 03 — Ring Wallets: Provision, Register, Monitor, Floor-Guard

## Mission

Get the three ring wallets (payer, treasury, sponsor) into a verified,
registered, monitored state so the loop can run unattended without draining or
stalling. After this task every ring wallet is: resolvable from env, registered
in `x402_ring_wallets`, watched by the balance monitor with alert floors, and
covered by the platform's signer conventions — and no wallet outside this set
can ever be a settlement recipient.

## Context you must know

- Roles + env (docs/x402-ring-economy.md:66-77):
  payer = `X402_SEED_SOLANA_SECRET_BASE58` (fallback
  `X402_AGENT_SOLANA_SECRET_BASE58`; loader `loadSeedKeypair()`
  `api/_lib/x402/pay.js:34-49`); treasury = `X402_PAY_TO_SOLANA` +
  `X402_TREASURY_SECRET_BASE58`; sponsor = `X402_FEE_PAYER_SOLANA` +
  `X402_FEE_PAYER_SECRET_BASE58` (loader `loadFeePayerKeypair()`
  `self-facilitator.js:76-97`, asserts pubkey match).
- Setup script `scripts/x402-ring-setup.mjs` generates keys →
  `.x402-ring-secrets.json` (gitignored, chmod 600); `--register` upserts
  `x402_ring_wallets` (migration
  `api/_lib/migrations/2026-07-01-x402-ring-economy.sql`).
- Ring wallets are NOT in `api/_lib/solana-signers.js` (that registry holds
  coin-treasury, club-treasury, platform-treasury, gasless fee-payer at
  lines 77-110) and NOT watched by
  `api/_lib/x402/wallet-balance-monitor.js`.
- Allowlist: `payToAllowlist()` (`self-facilitator.js:103-112`) =
  `{X402_PAY_TO_SOLANA} ∪ X402_SELF_FACILITATOR_PAYTO_ALLOWLIST`.
- SOL floor: `SPONSOR_SOL_FLOOR_LAMPORTS` default 0.02 SOL
  (`self-facilitator.js:68-70`).
- Task 01's `tasks/x402-ring/STATUS.md` tells you which wallets already exist
  and hold funds. **Read it first. Reuse existing funded wallets — do not
  generate replacements for wallets that already hold platform money.**

## Tasks

1. **Inventory then provision.** From STATUS.md + env, determine which of the
   three roles have valid keys. For any missing role, run
   `node scripts/x402-ring-setup.mjs` (extend it with a `--roles payer,sponsor`
   flag if partial generation is needed — currently it's all-or-nothing) and
   `--register`. Never overwrite an existing role secret.
2. **Registry parity.** Ensure `x402_ring_wallets` has exactly one active row
   per role matching the env pubkeys. Add a small idempotent
   `scripts/x402-ring-verify.mjs` that: resolves each role from env, compares
   against `x402_ring_wallets`, checks the treasury pubkey equals
   `X402_PAY_TO_SOLANA`, checks the payer/sponsor secrets decode to their
   declared pubkeys, prints a table, exits non-zero on any mismatch. (Presence
   checks only — never print secrets.)
3. **Balance monitoring.** Wire all three wallets into
   `api/_lib/x402/wallet-balance-monitor.js` with role-appropriate floors:
   sponsor/payer SOL floor ≥ `X402_SPONSOR_SOL_FLOOR_LAMPORTS`, payer USDC
   floor (new env `X402_RING_PAYER_USDC_FLOOR_ATOMIC`, default $5), treasury
   unbounded (it fills and gets swept). Breach → existing `sendOpsAlert` path.
4. **Signer-registry decision.** Add the ring sponsor (and payer if self-pay)
   to `api/_lib/solana-signers.js` with a `minSol` so the economy master's
   `treasury-topup` cron (`api/cron/treasury-topup.js`) can auto-top-up their
   fee SOL — this closes the "sponsor runs dry and the ring silently halts"
   failure. Follow the existing entry shape exactly (lines 77-110). The
   treasury does NOT go in (it must never be topped up; it only receives and
   gets swept).
5. **Funding runbook (no funds moved by you).** Write
   `tasks/x402-ring/FUNDING.md`: exact amounts (payer: USDC float sized to
   `X402_AUTONOMOUS_DAILY_CAP_ATOMIC`, e.g. $50; payer or sponsor: 0.1 SOL ≈
   ~20k self-pay settlements), which wallet address to send to (read from env
   at runtime, printed by the verify script), and the check commands to confirm
   arrival. Funding itself is task 11's activation step, executed by the owner.
6. **Docs + changelog.** Update `docs/x402-ring-economy.md` wallet section with
   the monitor + auto-topup behavior; changelog entry (tags: `infra`,
   `security`).

## Files you own

`scripts/x402-ring-setup.mjs`, `scripts/x402-ring-verify.mjs` (new),
`api/_lib/x402/wallet-balance-monitor.js`, `api/_lib/solana-signers.js`
(additive entries only), `tasks/x402-ring/FUNDING.md`,
`docs/x402-ring-economy.md`, `data/changelog.json`.

## Constraints

- NEVER move funds. NEVER print or commit a secret. `.x402-ring-secrets.json`
  stays gitignored — verify with `git check-ignore`.
- Never regenerate a key for a role whose wallet holds a balance.
- Adding signers to `solana-signers.js` must not change any existing entry.
- The economy master (`WwwuGbq…T3WwW`) tops up ring wallets **only via the
  existing guarded `treasury-topup` path** — no new transfer code.

## Acceptance criteria

- [ ] `node scripts/x402-ring-verify.mjs` exits 0 and prints a 3-row table with
      role, pubkey, registry-match ✓, secret-decodes ✓, balances.
- [ ] All three wallets appear in the balance monitor with correct floors
      (show the config/output).
- [ ] Sponsor (and payer if applicable) present in `SOLANA_SIGNERS` with
      `minSol`; `treasury-topup` plan includes them when below floor (show a
      dry-run plan).
- [ ] `FUNDING.md` written with exact amounts and verification commands.
- [ ] No secrets in `git diff`; `npm test` green; changelog entry added.
