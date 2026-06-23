begin;

-- Rename peak_nav_atomics → peak_share_price_e6 on agent_vaults.
-- The original migration (20260628130000_agent_vaults.sql) was edited in place
-- to track peak share price (NAV per share, scaled 1e6) instead of raw NAV; this
-- forward migration brings the live schema in sync.
alter table agent_vaults
  rename column peak_nav_atomics to peak_share_price_e6;

commit;
