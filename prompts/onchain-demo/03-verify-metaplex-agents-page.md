# Task: Verify Metaplex agents page renders three.ws agents correctly

## What this does
Checks whether `metaplex.com/agents/<asset>` renders our genesis agents and the three.ws platform agent. If the `data:` URI registration format used by genesis agents doesn't render on Metaplex's page, this task creates an HTTPS card endpoint alias that Metaplex can fetch instead, and documents the gap.

## Context
- Genesis agents (331 total) used `data:application/json;base64,...` inline URIs for `agentRegistrationUri` — chosen because the Solana 1232-byte tx limit required compactness. These URIs cannot be updated on-chain (mpl-agent-registry has no `updateIdentityV1` instruction).
- The three.ws platform's own agent (registered in task 01) uses `https://three.ws/.well-known/agent-registration.json` — this WILL render on Metaplex.
- `/api/agents/solana-card?asset=<pubkey>` already serves rich HTTPS card JSON for any registered agent.
- The Metaplex agents page URL structure: `https://www.metaplex.com/agents/<asset_pubkey>`

## Sample asset addresses to test
```
# three.ws platform agent (registered in task 01 — get address from data/three-ws-agent-onchain.json)
# Genesis rank 1:  8RjngnmKqm3n8TzAyzXDNEk6VSXVLS393RsmZtkvzo4
# Genesis rank 2:  HHmAfvW6KycvYDW4KfjRtDtk1carPjHWTpcTHrLuSS4X
# Genesis rank 5:  9pG27qeHvCftjHPJLTeKvb9h8ifpnyFGPM6DGCgb6mUc
```

## Steps

### 1. Check what the on-chain identity PDA stores
```bash
node -e "
const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const { publicKey } = require('@metaplex-foundation/umi');
const { mplCore } = require('@metaplex-foundation/mpl-core');
const { mplAgentIdentity, safeFetchAgentIdentityV1FromSeeds } = require('@metaplex-foundation/mpl-agent-registry');
(async () => {
  const umi = createUmi('https://api.mainnet-beta.solana.com').use(mplCore()).use(mplAgentIdentity());
  const assets = [
    '8RjngnmKqm3n8TzAyzXDNEk6VSXVLS393RsmZtkvzo4',
    'HHmAfvW6KycvYDW4KfjRtDtk1carPjHWTpcTHrLuSS4X',
  ];
  for (const a of assets) {
    const id = await safeFetchAgentIdentityV1FromSeeds(umi, { asset: publicKey(a) });
    if (!id) { console.log(a, '→ NO PDA'); continue; }
    const uri = id.agentRegistrationUri || '';
    const isData = uri.startsWith('data:');
    console.log(a.slice(0,8) + '... → uri type:', isData ? 'data: (inline)' : 'https:', uri.slice(0, 60));
  }
})();
"
```

### 2. Open Metaplex agents page in browser
Open these URLs and note what renders:
- `https://www.metaplex.com/agents/HHmAfvW6KycvYDW4KfjRtDtk1carPjHWTpcTHrLuSS4X` (genesis rank 2, has PDA)
- `https://www.metaplex.com/agents/<THREE_WS_ASSET>` (from data/three-ws-agent-onchain.json, uses HTTPS URI)

Record what you see:
- [ ] Asset name visible
- [ ] Description visible
- [ ] Registration card data visible (from agentRegistrationUri)
- [ ] Blank / "not found" / other

### 3. Check our own agent passport for the same assets
Open `https://three.ws/agent-passport.html?asset=8RjngnmKqm3n8TzAyzXDNEk6VSXVLS393RsmZtkvzo4&network=mainnet` and confirm the passport renders with on-chain data.

Also test the CAIP endpoint:
```bash
curl -s "https://three.ws/api/v1/agents/solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/$(node -e "console.log(require('./scripts/genesis-results.json')['e02c765c-7e33-401c-8117-1fa81f9443d4'].asset)")" | python3 -m json.tool | head -30
```

### 4. If Metaplex page is blank for genesis agents (data: URI not parsed)

**Option A — Document the limitation (no code change needed)**

The `data:` URI is readable directly from the on-chain account by any client that reads the PDA; Metaplex's page may not decode it server-side. Our agent passport at `three.ws/agent-passport.html` reads the PDA correctly and is the canonical display surface for genesis agents. Use this URL for demo instead of metaplex.com.

**Option B — Add a Metaplex redirect surface (if time allows)**

If Metaplex supports a `?uri=` or redirected resolution: create a public endpoint that serves the decoded card as HTTPS JSON:

`GET /api/agents/solana-registration-card?asset=<pubkey>`

This endpoint:
1. Reads the identity PDA from on-chain via `safeFetchAgentIdentityV1FromSeeds`
2. If `agentRegistrationUri` starts with `data:`, decodes the base64 payload and returns it as `application/json`
3. If it's already HTTPS, 302-redirects to it

Add a vercel.json route:
```json
{ "src": "/api/agents/solana-registration-card", "dest": "/api/agents/solana/[action]?action=registration-card" }
```

This makes `https://three.ws/api/agents/solana-registration-card?asset=<pubkey>` resolvable by any HTTP client, even if metaplex.com can't decode data: URIs.

### 5. What to show in the demo

**Best demo path:**
1. `https://three.ws/agent-passport.html?asset=<ASSET>&network=mainnet` — our canonical surface, fully wired, shows on-chain identity + attestations + reputation
2. `https://www.metaplex.com/agents/<THREE_WS_ASSET>` — three.ws platform agent, uses HTTPS URI, should render on Metaplex
3. Solana Explorer: `https://explorer.solana.com/address/<ASSET>` — raw on-chain proof the asset exists

**Do NOT try to demo genesis agents on metaplex.com unless you confirm in step 2 that it renders.**

### 6. Commit any new endpoint created
```bash
git add api/agents/solana/_handlers.js vercel.json
git commit -m "Add solana-registration-card endpoint to decode on-chain data: URIs over HTTPS"
git push threews main && git push threeD main
```

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/onchain-demo/03-verify-metaplex-agents-page.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
