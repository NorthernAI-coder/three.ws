-- x402 Merchant Console — Giving (Charity + Roundup).
--
-- Two opt-in config blocks layered onto the existing merchant settings row. A
-- merchant turns them on; the drop-in checkout modal then offers the buyer an
-- on-chain donation that settles in the SAME signed transaction as the payment.
-- Nothing here moves money on its own — it's the buyer who signs, every time.
--
--   charity  { enabled, name, wallet_solana, wallet_evm, percent_bps }
--     A fixed share (basis points) of each payment, routed to a cause wallet.
--
--   roundup  { enabled, to_nearest_atomics, destination, wallet_solana }
--     Round the payment up to the nearest unit; the remainder goes to the
--     charity wallet (destination='charity') or a savings wallet
--     (destination='wallet').

ALTER TABLE x402_merchant_settings
    ADD COLUMN IF NOT EXISTS charity jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE x402_merchant_settings
    ADD COLUMN IF NOT EXISTS roundup jsonb NOT NULL DEFAULT '{}'::jsonb;
