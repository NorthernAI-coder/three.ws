# Task: Register missing Agent Identity PDA for Genesis Rank #1

## What this does
330 of 331 genesis agents have Metaplex Agent Identity PDAs registered on-chain. Genesis Rank #1 is the only one missing its PDA. This task registers it.

## Context
- **agentId:** `6652c67a-8fdf-4b5e-9d3a-51a0d2481bc5`
- **Asset (Core NFT):** `8RjngnmKqm3n8TzAyzXDNEk6VSXVLS393RsmZtkvzo4`
- **Collection:** `3HTu8NUoZRCgy38q9m499EjNpmJeVJpXwg9bZhYJ4Wbj`
- **Missing field:** `identityPda` is absent from `scripts/genesis-results.json` for this agent
- **Authority wallet:** `3WSwnvVMtBtEtLrUjdWQm3EcPygvUhNcv6sDou64Rgcz` (key at `.keys/authority-3WS.json`)
- **Registry program:** `1DREGFgysWYxLnRnKQnwrxnJQeSMk2HmGaC6whw2B2p`
- The registration URI should match all other genesis agents: a `data:application/json;base64,...` inline JSON with name/description/image/model

## Prerequisites
- Authority wallet must have SOL (registering a PDA costs ~0.002 SOL in rent)
- Check balance first:
```bash
curl -s -X POST https://api.mainnet-beta.solana.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getBalance","params":["3WSwnvVMtBtEtLrUjdWQm3EcPygvUhNcv6sDou64Rgcz"]}' \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print('SOL:', r['result']['value']/1e9)"
```
If 0, fund the wallet first (task 01 covers this).

## Steps

### 1. Check whether the PDA actually exists on-chain (might be a ledger gap)
```bash
node -e "
const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const { publicKey, keypairIdentity, createSignerFromKeypair } = require('@metaplex-foundation/umi');
const { mplCore } = require('@metaplex-foundation/mpl-core');
const { mplAgentIdentity, safeFetchAgentIdentityV1FromSeeds, findAgentIdentityV1Pda } = require('@metaplex-foundation/mpl-agent-registry');
const { readFileSync } = require('fs');

(async () => {
  const rpc = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const umi = createUmi(rpc).use(mplCore()).use(mplAgentIdentity());
  const ASSET = '8RjngnmKqm3n8TzAyzXDNEk6VSXVLS393RsmZtkvzo4';
  const pda = findAgentIdentityV1Pda(umi, { asset: publicKey(ASSET) })[0];
  console.log('Expected PDA:', pda.toString());
  const identity = await safeFetchAgentIdentityV1FromSeeds(umi, { asset: publicKey(ASSET) });
  console.log('Exists on-chain:', identity !== null);
  if (identity) console.log('agentRegistrationUri:', identity.agentRegistrationUri?.slice(0, 80));
})();
"
```

If it exists on-chain, skip to step 4 (just update the ledger). If not, proceed to step 2.

### 2. Write a registration script for this one agent
Create `scripts/register-genesis-rank1-pda.mjs`:

```js
#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { publicKey as umiPk, keypairIdentity, createSignerFromKeypair } from '@metaplex-foundation/umi';
import { mplCore } from '@metaplex-foundation/mpl-core';
import {
  mplAgentIdentity,
  registerIdentityV1,
  findAgentIdentityV1Pda,
  safeFetchAgentIdentityV1FromSeeds,
} from '@metaplex-foundation/mpl-agent-registry';

const ASSET      = '8RjngnmKqm3n8TzAyzXDNEk6VSXVLS393RsmZtkvzo4';
const COLLECTION = '3HTu8NUoZRCgy38q9m499EjNpmJeVJpXwg9bZhYJ4Wbj';
const AGENT_ID   = '6652c67a-8fdf-4b5e-9d3a-51a0d2481bc5';
const RANK       = 1;

// Build the same registration URI format as all other genesis agents
const reg = {
  type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
  name: `Genesis #${RANK}`,
  description: `three.ws Genesis #${RANK}`,
  active: true,
  x402Support: true,
  registrations: [{ agentId: AGENT_ID, agentRegistry: 'https://three.ws' }],
  supportedTrust: ['reputation'],
};
const registrationUri = 'data:application/json;base64,' + Buffer.from(JSON.stringify(reg)).toString('base64');

const rpc = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const umi = createUmi(rpc).use(mplCore()).use(mplAgentIdentity());

// Load authority key
const rawKey = JSON.parse(readFileSync('.keys/authority-3WS.json', 'utf8'));
const solKp = Keypair.fromSecretKey(Uint8Array.from(rawKey));
const umiKp = umi.eddsa.createKeypairFromSecretKey(solKp.secretKey);
const signer = createSignerFromKeypair(umi, umiKp);
umi.use(keypairIdentity(signer));

const assetPk = umiPk(ASSET);
const collectionPk = umiPk(COLLECTION);

// Idempotency check
const existing = await safeFetchAgentIdentityV1FromSeeds(umi, { asset: assetPk });
if (existing) {
  const pda = findAgentIdentityV1Pda(umi, { asset: assetPk })[0].toString();
  console.log('Already registered. PDA:', pda);
  updateLedger(pda);
  process.exit(0);
}

console.log('Registering Agent Identity PDA for genesis rank 1...');
await registerIdentityV1(umi, {
  asset: assetPk,
  collection: collectionPk,
  payer: signer,
  authority: signer,
  agentRegistrationUri: registrationUri,
}).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });

const pda = findAgentIdentityV1Pda(umi, { asset: assetPk })[0].toString();
console.log('✓ Registered. PDA:', pda);
updateLedger(pda);

function updateLedger(pda) {
  const results = JSON.parse(readFileSync('scripts/genesis-results.json', 'utf8'));
  results[AGENT_ID].identityPda = pda;
  results[AGENT_ID].registered = true;
  writeFileSync('scripts/genesis-results.json', JSON.stringify(results, null, 2));
  console.log('✓ Updated scripts/genesis-results.json');
}
```

### 3. Run it
```bash
SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=$(grep HELIUS_API_KEY .env | cut -d= -f2)" \
  node scripts/register-genesis-rank1-pda.mjs
```

### 4. Verify
```bash
# Should print the PDA address
node -e "
const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const { publicKey } = require('@metaplex-foundation/umi');
const { mplCore } = require('@metaplex-foundation/mpl-core');
const { mplAgentIdentity, safeFetchAgentIdentityV1FromSeeds } = require('@metaplex-foundation/mpl-agent-registry');
(async () => {
  const umi = createUmi('https://api.mainnet-beta.solana.com').use(mplCore()).use(mplAgentIdentity());
  const id = await safeFetchAgentIdentityV1FromSeeds(umi, { asset: publicKey('8RjngnmKqm3n8TzAyzXDNEk6VSXVLS393RsmZtkvzo4') });
  console.log('registered:', id !== null);
})();
"
```

### 5. Commit
```bash
git add scripts/genesis-results.json scripts/register-genesis-rank1-pda.mjs
git commit -m "Register missing Agent Identity PDA for genesis rank 1"
git push threews main && git push threeD main
```

### 6. Clean up script (it's a one-off)
```bash
rm scripts/register-genesis-rank1-pda.mjs
git add -A && git commit -m "Remove one-off PDA registration script"
git push threews main && git push threeD main
```
