#!/usr/bin/env node
// scripts/test-cross-chain-cost.mjs
//
// Manual exercise of the Cross-Chain Payment Cost Comparison pipeline
// (api/_lib/x402/pipelines/cross-chain-cost.js).
//
// Runs the real run(ctx) against the configured origin. With a funded
// X402_SEED/AGENT_SOLANA_SECRET_BASE58 it settles a real $0.001 USDC payment on
// Solana, reads its on-chain fee, prices the equivalent Base settlement from the
// live Base gas price + live SOL/ETH prices, persists a snapshot to
// cross_chain_cost_comparison and prints the outcome the loop would log. Without
// a wallet it exercises the graceful wallet-unconfigured path.
//
// Usage: node scripts/test-cross-chain-cost.mjs
// Env:   APP_ORIGIN (default https://three.ws), plus the loop's payment env.

import { run } from '../api/_lib/x402/pipelines/cross-chain-cost.js';
import { logger } from '../api/_lib/usage.js';

const log = logger('test-cross-chain-cost');
const origin = process.env.APP_ORIGIN || 'https://three.ws';

// Capture DB writes without needing a live Postgres for a dry exercise: a tagged-
// template stub that logs the snapshot it would persist. Set USE_REAL_DB=1 to
// route through the real sql client instead and verify the row actually lands.
let sql;
if (process.env.USE_REAL_DB === '1') {
	({ sql } = await import('../api/_lib/db.js'));
} else {
	const captured = [];
	sql = (strings, ...values) => {
		const text = strings.join('?');
		if (/INSERT INTO cross_chain_cost_comparison/i.test(text)) {
			captured.push(values);
			console.log('\n[db] would INSERT cross_chain_cost_comparison snapshot:');
			console.log('     amount_atomic        =', values[1]);
			console.log('     solana_advertised    =', values[2]);
			console.log('     base_advertised      =', values[3]);
			console.log('     solana_settled       =', values[4]);
			console.log('     solana_fee_lamports  =', values[6], '(', values[7], ')');
			console.log('     solana_gas_usd       =', values[8]);
			console.log('     base_gas_price_wei   =', values[9]);
			console.log('     base_gas_usd         =', values[11]);
			console.log('     sol_price_usd        =', values[12]);
			console.log('     eth_price_usd        =', values[13]);
			console.log('     solana_total_usd     =', values[15]);
			console.log('     base_total_usd       =', values[16]);
			console.log('     gas_premium_ratio    =', values[17]);
			console.log('     cheapest_network     =', values[18]);
		}
		return Promise.resolve([]);
	};
}

// Solana payment context — only built when a payer keypair is configured.
let buyer = null, conn = null, blockhash = null, mintInfo = null;
try {
	const { bootstrapSolanaContext } = await import('../api/_lib/x402/pay.js');
	({ buyer, conn, blockhash, mintInfo } = await bootstrapSolanaContext());
	console.log('payer:', buyer.publicKey.toBase58());
} catch (err) {
	console.log('no payer configured (testing wallet-unconfigured path):', err?.message);
}

const ctx = {
	origin, buyer, conn, blockhash, mintInfo,
	remainingCap: 1_000_000, sql, log,
	runId: '00000000-0000-0000-0000-0000000000ce',
};

console.log('\n→ running cross-chain-cost.run() against', origin, '…');
const outcome = await run(ctx);

console.log('\n=== outcome (what the loop records to x402_autonomous_log) ===');
console.log(JSON.stringify({
	success: outcome.success,
	amountAtomic: outcome.amountAtomic,
	txSig: outcome.txSig,
	network: outcome.network,
	errorMsg: outcome.errorMsg,
	note: outcome.note,
	signalData: outcome.signalData,
}, null, 2));

process.exit(0);
