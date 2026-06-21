# 28 · Wallet Connect & Funding Flows

## Mission
Connecting a wallet, checking balances, funding (onramp/deposit), sending, and trading must be smooth
and trustworthy across Solana (default) and Base/EVM (secondary), for both humans and agents.

## Context
- Solana is the platform-wide default network; Base/EVM secondary (team memory).
- Flows surface the skills: `authenticate-wallet`, `fund`, `send-usdc`, `trade`; MetaMask agent CLI
  skills exist; agent wallet bridge (`scripts/agent-wallet-x402-bridge.mjs`, `npm run smoke:agent-wallet`).
- Connect entry points: top-nav, forge perk row, marketplace checkout, dashboard account.

## Tasks
1. **Connect:** every connect entry point works, shows connected state + address + balance, and
   persists across pages; disconnect works. Failures (no extension, rejected, wrong network) handled.
2. **Network correctness:** Solana default; Base/EVM where applicable; clear network labeling; no
   silent wrong-network sends.
3. **Funding:** onramp / deposit / buy-USDC flows complete with clear status; insufficient-balance
   states guide the user to fund before send/trade.
4. **Send/trade:** USDC/SOL/ETH/POL sends + swaps work with confirmation, fee disclosure, and receipts;
   address/ENS/SNS resolution correct (`ens_sns_resolve`, `*.threews.sol`).
5. **Agent wallets:** the agent wallet bridge + smoke (`npm run smoke:agent-wallet`) pass; agents can
   pay via x402 using their wallet.
6. **Security:** never expose private keys client-side; sign flows safe; confirm amounts before signing.

## Acceptance
- Connect/disconnect + balance + funding + send + trade all work on Solana (and Base where supported).
- Insufficient-balance + wrong-network + rejected-signature states designed; receipts shown.
- `npm run smoke:agent-wallet` passes; clean console; changelog for visible changes.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. Solana is the default network. No mocks of wallet/tx logic. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); settlement in USDC. Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.
