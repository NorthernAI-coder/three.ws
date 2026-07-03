#!/usr/bin/env node
// scripts/x402-facilitator-smoke-test.mjs
//
// End-to-end smoke test for the self-hosted x402 facilitator. Drives ONE real,
// tiny (cents-scale) USDC settlement through /api/x402/ring-settle against a
// target deployment — normally a Vercel PREVIEW URL with
// X402_SELF_FACILITATOR_ENABLED=true scoped to Preview only, so Production
// stays untouched until this passes.
//
// This is the exact code path the production autonomous ring loop uses
// (api/_lib/x402/pay.js:payX402 → 402 challenge → self-facilitator verify+settle),
// just pointed at --url instead of https://three.ws, with the spend hard-capped
// so a bug can burn at most a few cents.
//
// Requires (same secrets the ring pipelines use — pull from Vercel env,
// NEVER commit them):
//   X402_SEED_SOLANA_SECRET_BASE58   ring payer keypair (signs the transfer)
//   X402_ASSET_MINT_SOLANA           USDC mint (mainnet: EPjF...TDt1v)
//   SOLANA_RPC_URL                   any working mainnet RPC
//
// Usage:
//   X402_SEED_SOLANA_SECRET_BASE58=... X402_ASSET_MINT_SOLANA=... SOLANA_RPC_URL=... \
//     node scripts/x402-facilitator-smoke-test.mjs --url=https://<preview>.vercel.app --cap=0.05
//
// Exit code: 0 = settled on-chain and verified, 1 = anything else (never
// silently "probably fine" — a skipped/free/failed result is a failed test).

import { payX402, bootstrapSolanaContext, USDC_MINT } from '../api/_lib/x402/pay.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
	const p = args.find((a) => a.startsWith(`--${name}=`));
	return p ? p.slice(name.length + 3) : def;
};

const baseUrl = opt('url', null);
const capUsd = Number(opt('cap', '0.05'));

if (!baseUrl) {
	console.error('Usage: node scripts/x402-facilitator-smoke-test.mjs --url=https://<preview>.vercel.app [--cap=0.05]');
	process.exit(1);
}
if (!USDC_MINT) {
	console.error('X402_ASSET_MINT_SOLANA is not set in this shell — export the same value used on the preview deploy.');
	process.exit(1);
}
if (!Number.isFinite(capUsd) || capUsd <= 0 || capUsd > 1) {
	console.error('--cap must be a small positive USD number (<=1). Refusing to run a smoke test with a large cap.');
	process.exit(1);
}

const capAtomic = Math.round(capUsd * 1_000_000); // USDC = 6dp

async function main() {
	console.log(`\n=== x402 self-facilitator smoke test ===`);
	console.log(`target:      ${baseUrl}/api/x402/ring-settle`);
	console.log(`spend cap:   $${capUsd.toFixed(2)} (${capAtomic} atomic USDC)\n`);

	// 1) Confirm the target's facilitator discovery route is live and, ideally,
	//    resolving to the self-hosted facilitator (not the external default).
	const statusUrl = `${baseUrl}/api/x402-status`;
	try {
		const statusRes = await fetch(statusUrl);
		const status = await statusRes.json().catch(() => null);
		console.log(`x402-status (${statusRes.status}):`, JSON.stringify(status?.facilitators ?? status, null, 2).slice(0, 800));
	} catch (err) {
		console.warn(`Could not reach ${statusUrl}: ${err.message} (continuing — not fatal)`);
	}

	const ringUrl = `${baseUrl}/api/x402-ring`;
	try {
		const ringRes = await fetch(ringUrl);
		const ring = await ringRes.json().catch(() => null);
		console.log(`\nconfig_warnings before test:`, JSON.stringify(ring?.config_warnings ?? [], null, 2));
	} catch (err) {
		console.warn(`Could not reach ${ringUrl}: ${err.message} (continuing — not fatal)`);
	}

	// 2) Build the real signed payment context against mainnet.
	console.log('\nBootstrapping Solana context (loading payer keypair, fetching blockhash + mint info)...');
	const ctx = await bootstrapSolanaContext();
	console.log(`payer pubkey: ${ctx.buyer.publicKey.toBase58()}`);

	// 3) Drive one real settlement through the target's ring-settle endpoint.
	console.log(`\nPaying ${baseUrl}/api/x402/ring-settle (capped at $${capUsd.toFixed(2)})...`);
	const result = await payX402({
		url: `${baseUrl}/api/x402/ring-settle`,
		body: { note: 'facilitator-smoke-test', seq: 1 },
		buyer: ctx.buyer,
		conn: ctx.conn,
		blockhash: ctx.blockhash,
		mintInfo: ctx.mintInfo,
		remainingCap: capAtomic,
	});

	console.log('\n=== result ===');
	console.log(JSON.stringify(result, null, 2));

	if (!result.success || !result.paid || !result.txSig) {
		console.error('\nFAIL — no on-chain settlement occurred. See errorMsg/status/responseBody above.');
		process.exit(1);
	}

	console.log(`\nPASS — settled on-chain: https://solscan.io/tx/${result.txSig}`);
	console.log('Confirm on the target\'s /api/x402-ring that settlements.count/gross_usdc moved, then re-check config_warnings is empty before promoting these env vars to Production.');
}

main().catch((err) => {
	console.error('\nFAIL — smoke test threw:', err);
	process.exit(1);
});
