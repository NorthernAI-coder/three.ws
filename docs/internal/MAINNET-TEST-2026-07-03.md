# Mainnet end-to-end test — 2026-07-03

Real-SOL verification of every money-touching surface, run against production three.ws with a throwaway burner wallet. Audience: engineers. Every claim below carries a transaction signature or an HTTP transcript reference.

## Parameters

| | |
| --- | --- |
| Burner wallet | `FGwp62JfNaX2oqQctKZkmY7PM3ey21HgtsRda6A1B3rg` (secret at `~/.threews-test-keypair.json`, mode 600, off-repo) |
| Funded | 0.759860663 SOL — sig [`39JT2pCBRCVK5E11jkzDd66auF71bPxtkgJb63NTLCa6hXsSWnyJjcEYaxLKPnKwANpVcikPFf8Trqcrik2Lfkup`](https://solscan.io/tx/39JT2pCBRCVK5E11jkzDd66auF71bPxtkgJb63NTLCa6hXsSWnyJjcEYaxLKPnKwANpVcikPFf8Trqcrik2Lfkup) at 2026-07-03T23:24:32Z |
| Sweep-back address | `wwwqvAbN4RjaRvfGsorxMuauq7SWVcV13Aa7GaqHGUn` (owner-provided) |
| Rails | No mainnet sniper strategies armed (prod auto-funder foot-gun). Master/treasury untouched. Spend caps + withdraw allowlist on every custodial wallet at creation. Full sweep-back at end. |

## Ledger

Running log, newest last. ✅ pass · ❌ fail · ⚠ degraded/blocked (with reason).

| # | Time (UTC) | Surface | Action | Result | Proof |
| --- | --- | --- | --- | --- | --- |
| 0 | 23:24 | funding | 0.759860663 SOL received | ✅ | `39JT2pCB…Lfkup` |

## Findings

(Populated as tiers complete.)
