// agent-sniper — pump.fun trade client + transaction broadcast.
//
// Thin wrapper over the platform's PumpTradeClient (api/_lib/pump.js, which
// resolves the right RPC and the @three-ws/agent-payments build) plus a single
// place that assembles, signs with the AGENT's keypair, and broadcasts a v0 tx.
// Mirrors the sign+send flow used by handleRunBuyback in api/cron/[name].js.

import { getPumpTradeClient } from '../../api/_lib/pump.js';

let _ctx = null;

/** Lazily build (and reuse) the trade client + connection for a network. */
export async function getTradeCtx(network) {
	if (_ctx && _ctx.network === network) return _ctx;
	const { client, connection, BN, web3 } = await getPumpTradeClient({ network });
	_ctx = { network, client, connection, BN, web3 };
	return _ctx;
}

/**
 * Assemble a v0 transaction from instructions, sign with `payer`, broadcast,
 * and wait for confirmation. Returns the signature.
 *
 * @param {object} ctx        result of getTradeCtx
 * @param {import('@solana/web3.js').Keypair} payer
 * @param {import('@solana/web3.js').TransactionInstruction[]} instructions
 * @param {number} confirmTimeoutMs
 */
export async function signAndSend(ctx, payer, instructions, confirmTimeoutMs) {
	const { connection, web3 } = ctx;
	const { TransactionMessage, VersionedTransaction } = web3;

	const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
	const msg = new TransactionMessage({
		payerKey: payer.publicKey,
		recentBlockhash: blockhash,
		instructions,
	}).compileToV0Message();
	const tx = new VersionedTransaction(msg);
	tx.sign([payer]);

	const sig = await connection.sendRawTransaction(tx.serialize(), {
		skipPreflight: false,
		maxRetries: 3,
	});

	// Bound the confirmation wait so a stuck tx can't pin the loop forever.
	const confirmPromise = connection.confirmTransaction(
		{ signature: sig, blockhash, lastValidBlockHeight },
		'confirmed',
	);
	const timeout = new Promise((_, rej) =>
		setTimeout(() => rej(Object.assign(new Error('confirm timeout'), { code: 'CONFIRM_TIMEOUT', sig })), confirmTimeoutMs),
	);
	const result = await Promise.race([confirmPromise, timeout]);
	if (result?.value?.err) {
		throw Object.assign(new Error(`tx failed on-chain: ${JSON.stringify(result.value.err)}`), { code: 'TX_ERR', sig });
	}
	return sig;
}
