# Task: Register three.ws itself as an on-chain Solana agent

## What this does
three.ws tells users to register their agents on-chain. This task registers the platform's own identity — eating its own dog food. The script is complete and dry-run verified. The only blocker is the authority wallet has 0 SOL.

## Context
- **Script:** `scripts/register-three-ws-agent-solana.mjs` — fully written, idempotent, dry-run verified
- **Authority wallet:** `3WSwnvVMtBtEtLrUjdWQm3EcPygvUhNcv6sDou64Rgcz` (key at `.keys/authority-3WS.json`)
- **Current balance:** 0 SOL on mainnet — this is the ONLY blocker
- **Cost:** ~0.02 SOL for collection deploy + asset mint + rent; send at least 0.05 SOL to have margin
- **Collection key:** `.keys/collection-3ws.json` (not yet deployed)
- **What the script does:** verifies model sha256, deploys the "three.ws Agents" Metaplex Core collection, mints the platform agent asset, enrolls in Metaplex Agent Registry, writes ledger to `data/three-ws-agent-onchain.json` and CAIP-10 registrations into `public/.well-known/3d-agent-card.json` and `public/.well-known/agent-registration.json`
- **registrationUri used:** `https://three.ws/.well-known/agent-registration.json` (HTTPS — will render on metaplex.com)

## Prerequisites
Send ~0.05 SOL to `3WSwnvVMtBtEtLrUjdWQm3EcPygvUhNcv6sDou64Rgcz` on Solana mainnet before running this task. Verify the balance landed:

```bash
curl -s -X POST https://api.mainnet-beta.solana.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getBalance","params":["3WSwnvVMtBtEtLrUjdWQm3EcPygvUhNcv6sDou64Rgcz"]}' \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print('SOL:', r['result']['value']/1e9)"
```

Do not proceed until balance > 0.02 SOL.

## Steps

### 1. Dry-run first (no SOL spent)
```bash
SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=$(grep HELIUS_API_KEY .env | cut -d= -f2)" \
  node scripts/register-three-ws-agent-solana.mjs --network mainnet --dry-run
```
Confirm it prints the card, model sha256 match, and no errors.

### 2. Run for real on mainnet
```bash
CONFIRM_MAINNET=yes \
SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=$(grep HELIUS_API_KEY .env | cut -d= -f2)" \
  node scripts/register-three-ws-agent-solana.mjs --network mainnet
```

### 3. Verify output
The script writes:
- `data/three-ws-agent-onchain.json` — ledger with asset address, collection address, identity PDA
- Updates `public/.well-known/3d-agent-card.json` with `onchain` block and `registrations[]` CAIP-10 entry
- Updates `public/.well-known/agent-registration.json` similarly

Check the ledger:
```bash
cat data/three-ws-agent-onchain.json
```

### 4. Verify on-chain
```bash
# Replace <ASSET_ADDR> with the asset address from the ledger
curl -s -X POST https://api.mainnet-beta.solana.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":["<ASSET_ADDR>",{"encoding":"base64"}]}' \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print('exists:', r['result']['value'] is not None)"
```

### 5. Verify Metaplex agents page
Open `https://www.metaplex.com/agents/<ASSET_ADDR>` — this should show the three.ws agent card since it uses an HTTPS registrationUri.

### 6. Commit the writeback
```bash
git add public/.well-known/3d-agent-card.json public/.well-known/agent-registration.json data/three-ws-agent-onchain.json
git commit -m "Register three.ws platform identity on Solana mainnet"
git push threews main && git push threeD main
```

## If the script fails
- `insufficient funds` → balance didn't land yet or was too small, send more SOL
- `InvalidCoreAsset` on registry step → wait 10s and re-run (idempotent, skips the mint)
- Any other error → the script logs clearly; read the error and fix before re-running
