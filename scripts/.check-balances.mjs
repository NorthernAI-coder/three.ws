import fs from 'node:fs';
import w3 from '@solana/web3.js';
import bs58m from 'bs58';
const bs58 = bs58m.default || bs58m;
const raw = fs.readFileSync('/workspaces/three.ws/.env.local', 'utf8');
for (const l of raw.split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); }
const keys = [];
if (process.env.X402_AGENT_SOLANA_SECRET_BASE58) {
  try { keys.push(['X402_AGENT_SOLANA_SECRET', w3.Keypair.fromSecretKey(bs58.decode(process.env.X402_AGENT_SOLANA_SECRET_BASE58.trim()))]); } catch (e) { console.log('agent key fail', e.message); }
}
try { const arr = JSON.parse(fs.readFileSync(process.env.HOME + '/.config/x402-test-wallets/solana.json', 'utf8')); keys.push(['test-wallet', w3.Keypair.fromSecretKey(Uint8Array.from(arr))]); } catch (e) { console.log('test wallet fail', e.message); }
try { const b = fs.readFileSync(process.env.HOME + '/.config/x402-test-wallets/prod-demo-solana.b58', 'utf8').trim(); keys.push(['prod-demo', w3.Keypair.fromSecretKey(bs58.decode(b))]); } catch (e) { console.log('prod-demo fail', e.message); }
const conn = new w3.Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
const USDC = new w3.PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
for (const [name, kp] of keys) {
  const sol = await conn.getBalance(kp.publicKey).catch(() => 'rpc-err');
  let usdc = null;
  try { const r = await conn.getParsedTokenAccountsByOwner(kp.publicKey, { mint: USDC }); usdc = r.value[0]?.account.data.parsed.info.tokenAmount.uiAmount ?? 0; } catch {}
  console.log(name, kp.publicKey.toBase58(), 'SOL:', typeof sol === 'number' ? sol / 1e9 : sol, 'USDC:', usdc);
}
