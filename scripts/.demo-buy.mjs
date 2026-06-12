// One-shot demo: real x402 USDC purchase of a premium cosmetic against PROD.
import fs from 'node:fs';
import w3 from '@solana/web3.js';
import bs58m from 'bs58';
const bs58 = bs58m.default || bs58m;
const arr = JSON.parse(fs.readFileSync(process.env.HOME + '/.config/x402-test-wallets/solana.json', 'utf8'));
const kp = w3.Keypair.fromSecretKey(Uint8Array.from(arr));
process.env.A2A_PAYER_SOLANA_SECRET = bs58.encode(kp.secretKey);
process.env.X402_BRIDGE_MAX_USDC_MICROS = '600000'; // rare cosmetic is $0.50
process.env.X402_BRIDGE_PORT = '4402';
console.log('payer:', kp.publicKey.toBase58());

// Boot the bridge in-process, then drive its /pay SSE endpoint.
await import('./agent-wallet-x402-bridge.mjs');
await new Promise((r) => setTimeout(r, 1200));

const ACCOUNT = 'g_threews_live_demo';
const ITEM = 'skin-crimson';
const endpoint = `https://three.ws/api/x402/cosmetic-purchase?id=${ITEM}&account=${ACCOUNT}`;
const res = await fetch('http://localhost:4402/pay', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ endpoint, method: 'GET' }),
});
const text = await res.text();
console.log(text);
process.exit(0);
