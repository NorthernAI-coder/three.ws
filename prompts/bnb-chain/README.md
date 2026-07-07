# BNB Chain Campaign — Prompt Index

Owner-approved 2026-07-07. Three product tracks exploiting capabilities verified live on
BNB Chain that Ethereum L1 / Base / Solana can't match (see `00-CONTEXT.md` for the
verified-facts list, addresses, decision defaults, and the commit-gate pre-approval).

Every prompt is an independent work order sized for one agent to complete 100% — code,
wiring, tests, docs, changelog, proof. Track-internal ordering below; a prompt whose
prereq artifact is missing executes the named prereq prompt first (00-CONTEXT "Prompt
independence").

## Track A — Payments & gasless rails (MegaFuel + MPP)

| # | Prompt | Prereqs | Ships |
|---|---|---|---|
| 01 | `01-bnb-chains-lib.md` | none | `api/_lib/bnb/chains.js` — chain constants, RPC failover, block-time probe |
| 02 | `02-megafuel-client.md` | 01 | `api/_lib/bnb/megafuel.js` — sponsored gasless EOA sends + self-pay fallback |
| 03 | `03-gasless-agent-registration.md` | 02 | Gas-free ERC-8004 agent registration on BSC testnet |
| 04 | `04-mpp-server-adapter.md` | 01 | Accept MPP (BNB's 402 protocol) on a pilot paid endpoint |
| 05 | `05-mpp-buyer-client.md` | 01 | Buyer client: our agents PAY MPP-protected endpoints |
| 06 | `06-payments-bridge-docs.md` | 04, 05 | `docs/bnb-payments.md` + `specs/x402-mpp-bridge.md` |

## Track B — Greenfield pay-to-unlock 3D vault

| # | Prompt | Prereqs | Ships |
|---|---|---|---|
| 07 | `07-greenfield-read-client.md` | 01 | `api/_lib/bnb/greenfield.js` — SP/chain reads |
| 08 | `08-vault-crypto-format.md` | none | Encrypted-GLB envelope + `specs/vault-manifest.md` |
| 09 | `09-vault-upload-pipeline.md` | 07, 08 | Bucket + encrypted upload to Greenfield testnet |
| 10 | `10-vault-contract.md` | 01 | `GreenfieldVault.sol` — pay → PermissionHub grant, testnet deploy |
| 11 | `11-vault-unlock-api.md` | 09, 10 | `/api/vault/*` — list, status, unlock |
| 12 | `12-vault-ui.md` | 11 | `/vault` page — browse, buy, unlock, view in 3D |
| 13 | `13-vault-e2e-proof.md` | 12 | Full testnet E2E run + captured proof + docs final |

## Track C — Real-time on-chain 3D world (0.45s blocks + gasless moves)

| # | Prompt | Prereqs | Ships |
|---|---|---|---|
| 14 | `14-world-moves-contract.md` | 01 | `WorldMoves.sol` — move commits/events, testnet deploy |
| 15 | `15-gasless-move-sender.md` | 02, 14 | Browser/server sender: sponsored move txs |
| 16 | `16-onchain-presence-mode.md` | 15 | Opt-in on-chain mode in explore/platformer |
| 17 | `17-latency-proof-page.md` | none | `/bnb-latency` — live block-race proof page |
| 18 | `18-world-e2e-demo.md` | 16 | E2E demo on testnet + docs + changelog |

## Cross-track

| # | Prompt | Prereqs | Ships |
|---|---|---|---|
| 19 | `19-bnb-hub-page.md` | none | `/bnb` hub page + STRUCTURE.md + pages.json |
| 20 | `20-babt-verification-spike.md` | none | Settle the BABT open question; ship checker if real |

Progress log: `PROGRESS.md` (append-only, dated entries with proof).
