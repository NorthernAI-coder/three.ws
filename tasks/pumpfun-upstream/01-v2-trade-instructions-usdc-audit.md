# Task: Audit our pump.fun buy/sell against the v2 trade interface + decide USDC-quote support

You are a senior engineer working in the **three.ws** repo (`/workspaces/three.ws`).
Read `CLAUDE.md` first and obey it — especially: **only `$THREE` may ever be
referenced**, no mocks/fake data, real SDKs/APIs only, keep the repo clean, and
never push without explicit approval (and then to **both** remotes).

## Background

pump.fun is migrating its bonding-curve program to a **unified v2 trade
interface** so the same account layout works for both SOL-paired and **USDC-paired
("stable paired") meme coins**:

- New instructions: `buy_v2`, `sell_v2`, `buy_exact_quote_in_v2`.
- All accounts mandatory, same order for every coin type (no optional-account
  branching). `quote_mint` is explicit — wrapped SOL
  (`So11111111111111111111111111111111111111112`) for SOL coins, USDC mint for
  USDC coins.
- New mandatory accounts on every buy/sell: `sharing_config`,
  `global_volume_accumulator`, `user_volume_accumulator`,
  `associated_user_volume_accumulator`, `fee_config`, `fee_program`, plus a
  `buybackFeeRecipient` (+ its associated quote ATA).
- `create_v2` coins use **Token-2022** base mints
  (`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`); quote and base may use
  different token programs.
- SDK helpers (we depend on `@pump-fun/pump-sdk@^1.36.0`,
  `@pump-fun/pump-swap-sdk@^1.17.0`): `PUMP_SDK.getBuyV2InstructionRaw(...)`,
  `buy_v2_instructions(...)`, and the `sell_v2` equivalents.

The full account lists, arg validation, fee-recipient rules, and SDK call
examples are vendored locally — **read these first**:

- `docs/pumpfun-program/UPSTREAM-buy-sell-v2-announcement.md`
- `docs/pumpfun-program/docs/instructions/BUY.md`
- `docs/pumpfun-program/docs/instructions/SELL.md`
- `docs/pumpfun-program/docs/instructions/COIN_CREATION.md`
- `docs/pumpfun-program/docs/FEE_RECIPIENTS.md`
- `docs/pumpfun-program/idl/pump.json`, `idl/pump_amm.json`, `idl/pump_fees.json`

A prior recon found our code already references `buy_v2`/`sell_v2`,
`user_volume_accumulator`, and `sharing_config`, so this is expected to be mostly
an **audit**, not a rewrite.

## Our code to audit

Start here (grep for `buy_v2|sell_v2|user_volume_accumulator|sharing_config|buyback|fee_config|quote_mint`):

- `api/_lib/pump.js`
- `api/_lib/pump-swap-ix.js`
- `api/pump/[action].js` (the consolidated buy/sell/launch dispatcher)
- `api/_lib/pump-launch.js`, `api/_lib/pump-pricing.js`
- `api/_lib/solana/sdk-bridge.js`
- anything else the grep surfaces

## Goal

1. **Audit** every place we build a bonding-curve buy/sell (and the AMM swap path)
   against the vendored v2 docs + IDLs. For each instruction we build, verify:
    - all mandatory v2 accounts are present, correct, and in the right order;
    - `quote_mint` / token-program handling is correct (wSOL vs USDC; SPL vs
      Token-2022 base mints for `create_v2` coins);
    - `buybackFeeRecipient` + mayhem-vs-normal fee-recipient selection is correct;
    - slippage args (`max_sol_cost` / min-out) and decimals are right.
    - Prefer the SDK's v2 builders over hand-rolled account lists where we can.
2. Produce a written **audit report** at
   `docs/pumpfun-program/AUDIT-2026-mm-dd.md`: per buy/sell/swap path, a
   PASS / GAP verdict with file:line evidence and the exact discrepancy.
3. **Fix** any real gaps found, wired end-to-end (no stubs). If a gap is risky or
   needs product input, document it in the report and leave it clearly flagged
   rather than half-implementing.
4. **Decision: USDC-quoted coins.** Determine what it would take for three.ws to
   support buying/selling USDC-paired coins (quoting, balances UI, the swap path).
   If small and safe, implement it; otherwise write the implementation plan into
   the report. Note: per the coin rule, do not surface any specific non-`$THREE`
   coin — USDC is infrastructure/quote-asset plumbing, which is allowed, but keep
   example mints generic/runtime-supplied.

## Verification (Definition of done)

- Audit report committed; every claim backed by file:line or a doc reference.
- Any code changes: `npx prettier --check` clean, `npm run build` green, relevant
  `vitest` tests pass (add tests for new instruction-building logic — you can
  unit-test account ordering / arg encoding without hitting the chain, mirroring
  `tests/bounties-judge.test.js`). If you can exercise a real devnet buy/sell
  (env: `SOLANA_RPC_URL_DEVNET`), do it and record the tx signature; if not,
  say so explicitly.
- `git diff` self-reviewed. Do not push unless the user asks; then push to both
  `threeD` and `threews`.
