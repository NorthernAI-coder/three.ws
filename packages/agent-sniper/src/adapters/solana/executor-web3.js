// agent-sniper — default Executor: MEV-aware web3.js broadcast.
//
// The one place a signed transaction hits the network. Builds a v0 tx with a
// dynamic priority fee, optionally simulates, sends, and confirms with bounded
// adaptive retry (fresh blockhash + escalating fee per attempt). When tipMode is
// 'economy'|'turbo' it appends a Jito tip transfer and routes the tx through the
// Jito block engine for bundle inclusion, falling back to the normal RPC path
// (reported honestly via fallbackReason) if Jito is unreachable.
//
// Returns full landing telemetry so callers can persist route / tip / fee /
// landed_ms. No external Jito SDK — the block engine speaks plain JSON-RPC.

import {
	ComputeBudgetProgram, SystemProgram, PublicKey,
	TransactionMessage, VersionedTransaction,
} from '@solana/web3.js';

// Jito mainnet tip accounts (public, rotate by random pick). Block engine routes
// a tx to a validator running Jito when it pays one of these.
const JITO_TIP_ACCOUNTS = [
	'96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
	'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
	'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
	'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
	'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
	'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
	'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
	'3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
];
const JITO_BLOCK_ENGINE = 'https://mainnet.block-engine.jito.wtf/api/v1/transactions';

const TIP_LAMPORTS = { economy: 100_000n, turbo: 1_000_000n }; // 0.0001 / 0.001 SOL
const PRIORITY_FEE_MICROLAMPORTS = { base: 50_000, turbo: 500_000 };

function pickTipAccount(seed) {
	return JITO_TIP_ACCOUNTS[Math.abs(seed) % JITO_TIP_ACCOUNTS.length];
}

async function buildSigned({ connection, payer, instructions, microLamports, tipIx }) {
	const cuPrice = ComputeBudgetProgram.setComputeUnitPrice({ microLamports });
	const cuLimit = ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 });
	const ixs = [cuPrice, cuLimit, ...instructions];
	if (tipIx) ixs.push(tipIx);
	const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
	const msg = new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message();
	const tx = new VersionedTransaction(msg);
	tx.sign([payer]);
	return { tx, blockhash, lastValidBlockHeight };
}

async function sendViaJito(rawBase64) {
	const res = await fetch(JITO_BLOCK_ENGINE, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendTransaction', params: [rawBase64, { encoding: 'base64' }] }),
	});
	if (!res.ok) throw new Error(`jito ${res.status}`);
	const body = await res.json();
	if (body.error) throw new Error(`jito ${body.error.message || 'rejected'}`);
	return body.result; // signature
}

/**
 * @param {object} [opts]
 * @param {number} [opts.maxAttempts]   default 3
 * @param {boolean} [opts.simulate]     pre-simulate before first send (default true)
 * @returns {import('../../types.js').Executor}
 */
export function createWeb3Executor(opts = {}) {
	const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
	const simulate = opts.simulate !== false;
	const settleBudgetMsOpt = opts.settleBudgetMs ?? null;

	return {
		async submit({ connection, payer, instructions, confirmTimeoutMs, tipMode = 'off', onTip }) {
			const start = Date.now();
			const settleBudgetMs = settleBudgetMsOpt ?? Math.max(confirmTimeoutMs || 0, 90_000);
			let useJito = tipMode === 'economy' || tipMode === 'turbo';
			let tipLamports = 0n;
			let tipIx = null;
			if (useJito) {
				tipLamports = TIP_LAMPORTS[tipMode] || TIP_LAMPORTS.economy;
				// Invoke the spend-guard veto with the real tip amount BEFORE it leaves
				// the wallet. A throw drops us to the untipped standard route.
				if (typeof onTip === 'function') {
					try { await onTip(tipLamports, 'jito'); }
					catch { tipLamports = 0n; tipIx = null; useJito = false; return await sendStandard(); }
				}
				tipIx = SystemProgram.transfer({
					fromPubkey: payer.publicKey,
					toPubkey: new PublicKey(pickTipAccount(payer.publicKey.toBuffer()[0])),
					lamports: Number(tipLamports),
				});
			}

			let fallbackReason = null;

			// Every signature this submit() ever broadcast. A confirm error does NOT
			// mean the tx died — on a degraded RPC "blockheight exceeded"/timeouts
			// fire for transactions that actually land. Each retry builds a FRESH
			// blockhash (a different tx the chain will happily execute alongside the
			// old one), so before any resend — and before any final throw — the sent
			// set is swept: a landed attempt IS the result, never a reason to resend.
			const sent = []; // { signature, lastValidBlockHeight }

			async function landedAmongSent() {
				if (!sent.length) return null;
				const res = await connection.getSignatureStatuses(sent.map((s) => s.signature), { searchTransactionHistory: true }).catch(() => null);
				const arr = res?.value || [];
				for (let i = 0; i < arr.length; i++) {
					const st = arr[i];
					if (st && !st.err && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) {
						return sent[i].signature;
					}
				}
				return null;
			}

			// Resolve the most recent attempt to landed (→ signature) or provably dead
			// (→ null: its blockhash expired with no status on record). Until one of
			// those is true the tx is IN FLIGHT and resending is a double-spend.
			async function settleLastSent(deadlineMs) {
				const last = sent[sent.length - 1];
				if (!last) return { landed: null, dead: true };
				while (Date.now() < deadlineMs) {
					const landed = await landedAmongSent();
					if (landed) return { landed, dead: false };
					const height = await connection.getBlockHeight('confirmed').catch(() => null);
					if (height != null && height > last.lastValidBlockHeight) return { landed: null, dead: true };
					await sleep(1500);
				}
				return { landed: null, dead: false }; // unknown — caller must NOT resend
			}

			async function attemptSend(microLamports, viaJito) {
				const { tx, blockhash, lastValidBlockHeight } = await buildSigned({ connection, payer, instructions, microLamports, tipIx: viaJito ? tipIx : null });
				if (simulate) {
					const sim = await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
					if (sim.value.err) throw Object.assign(new Error(`simulation failed: ${JSON.stringify(sim.value.err)}`), { code: 'sim_failed', logs: sim.value.logs });
				}
				const raw = Buffer.from(tx.serialize());
				let signature;
				if (viaJito) {
					signature = await sendViaJito(raw.toString('base64'));
					sent.push({ signature, lastValidBlockHeight });
				} else {
					signature = await connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 });
					sent.push({ signature, lastValidBlockHeight });
				}
				await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
				return signature;
			}

			function ambiguous(lastErr) {
				const sigs = sent.map((s) => s.signature);
				return Object.assign(
					new Error(`landing ambiguous after ${sent.length} broadcast(s) — verify before retrying: ${sigs.join(', ')}${lastErr ? ` (last error: ${lastErr.message})` : ''}`),
					{ code: 'landing_ambiguous', sentSignatures: sigs },
				);
			}

			async function sendStandard() {
				let lastErr;
				for (let i = 0; i < maxAttempts; i++) {
					// A previous attempt may have landed despite its confirm error —
					// return it instead of buying again.
					const prior = await landedAmongSent();
					if (prior) return { signature: prior, route: 'standard', tipLamports: 0n, priorityFeeMicroLamports: PRIORITY_FEE_MICROLAMPORTS.base * i, attempts: i, landedMs: Date.now() - start, fallbackReason };
					const fee = PRIORITY_FEE_MICROLAMPORTS.base * (i + 1);
					try {
						const signature = await Promise.race([
							attemptSend(fee, false),
							timeout(confirmTimeoutMs),
						]);
						return { signature, route: 'standard', tipLamports: 0n, priorityFeeMicroLamports: fee, attempts: i + 1, landedMs: Date.now() - start, fallbackReason };
					} catch (err) {
						lastErr = err;
						if (err?.code === 'sim_failed') throw err; // nothing was broadcast
						// The attempt's tx may still be in flight. Only loop once it has
						// landed (return it) or provably died (safe to resend).
						const settled = await settleLastSent(Date.now() + settleBudgetMs);
						if (settled.landed) return { signature: settled.landed, route: 'standard', tipLamports: 0n, priorityFeeMicroLamports: fee, attempts: i + 1, landedMs: Date.now() - start, fallbackReason };
						if (!settled.dead) throw ambiguous(lastErr);
					}
				}
				const final = await landedAmongSent();
				if (final) return { signature: final, route: 'standard', tipLamports: 0n, priorityFeeMicroLamports: PRIORITY_FEE_MICROLAMPORTS.base * maxAttempts, attempts: maxAttempts, landedMs: Date.now() - start, fallbackReason };
				if (sent.length) throw ambiguous(lastErr);
				throw lastErr;
			}

			if (!useJito || !tipIx) return await sendStandard();

			// Jito path first; on any failure fall back to the standard RPC route.
			const fee = tipMode === 'turbo' ? PRIORITY_FEE_MICROLAMPORTS.turbo : PRIORITY_FEE_MICROLAMPORTS.base;
			try {
				const signature = await Promise.race([attemptSend(fee, true), timeout(confirmTimeoutMs)]);
				return { signature, route: 'jito', tipLamports, priorityFeeMicroLamports: fee, attempts: 1, landedMs: Date.now() - start, fallbackReason: null };
			} catch (err) {
				fallbackReason = `jito_failed:${err?.message || 'error'}`.slice(0, 120);
				tipIx = null; // don't pay a tip on the non-Jito fallback
				// The tipped tx may have been broadcast and still be in flight — settle
				// it (landed → done; in-flight → ambiguous) before any fresh broadcast.
				if (sent.length) {
					const settled = await settleLastSent(Date.now() + settleBudgetMs);
					if (settled.landed) return { signature: settled.landed, route: 'jito', tipLamports, priorityFeeMicroLamports: fee, attempts: 1, landedMs: Date.now() - start, fallbackReason: null };
					if (!settled.dead) throw ambiguous(err);
				}
				return await sendStandard();
			}
		},
	};
}

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms).unref?.());
}

function timeout(ms) {
	return new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('confirm timeout'), { code: 'confirm_timeout' })), ms).unref?.());
}

export default createWeb3Executor;
