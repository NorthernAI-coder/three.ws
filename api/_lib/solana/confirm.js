// Confirm a Solana transaction and THROW if it landed-but-reverted.
//
// `Connection.confirmTransaction` resolves normally for a transaction that was
// included in a block but failed execution — the on-chain error lives in
// `result.value.err`, not in a thrown exception. Discarding that result is the
// single most dangerous money-path bug class: a reverted launch/buy/transfer
// gets persisted as `confirmed`, the spend cap is charged, and the user is told
// it succeeded. Every server-signed send path must route its confirmation
// through this helper so a revert becomes a thrown error the caller handles.
//
// Drop-in: replace
//   await conn.confirmTransaction(strategy, 'confirmed')
// with
//   await confirmOrThrow(conn, strategy, 'confirmed')
// `strategy` is whatever confirmTransaction accepts — a bare signature string or
// the `{ signature, blockhash, lastValidBlockHeight }` object form.

/**
 * @param {import('@solana/web3.js').Connection} conn
 * @param {string | { signature: string, blockhash?: string, lastValidBlockHeight?: number }} strategy
 * @param {import('@solana/web3.js').Commitment} [commitment]
 * @returns {Promise<import('@solana/web3.js').RpcResponseAndContext<import('@solana/web3.js').SignatureResult>>}
 */
export async function confirmOrThrow(conn, strategy, commitment = 'confirmed') {
	const result = await conn.confirmTransaction(strategy, commitment);
	if (result?.value?.err) {
		const signature = typeof strategy === 'string' ? strategy : strategy?.signature;
		throw Object.assign(
			new Error(
				`transaction ${signature ?? '<unknown>'} reverted on-chain: ${JSON.stringify(result.value.err)}`,
			),
			{ code: 'tx_reverted', signature, onChainErr: result.value.err },
		);
	}
	return result;
}
