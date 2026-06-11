// GET /api/agent-trade/skill — Oracle agent's paid market-analysis skill.
//
// Without ?sig=  → HTTP 402 with x402 price manifest:
//   { x402:true, price:{sol,lamports}, currency:'SOL', recipient, network, memo }
//
// With ?sig=<base58-txSig>&topic=<topic>&buyer=<buyerAddr>
//   → Verifies payment on-chain, runs IBM Granite (or Claude fallback),
//     returns { content, model, provider, topic, payment:{sig,lamports,blockTime} }
//
// Independently callable by any agent — not coupled to the demo orchestrator.

import { loadAvatarKeypair, getConnection, LAMPORTS_PER_SOL } from '../_lib/avatar-wallet.js';
import { watsonxConfig, watsonxChatComplete } from '../_lib/watsonx.js';
import { cors, method, json, error, wrap, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { cacheGet, cacheSet, cacheDel } from '../_lib/cache.js';

const DEFAULT_PRICE_SOL = 0.001;
const MAX_PAYMENT_AGE_SEC = 300; // 5 minutes
// Consumed-signature ledger: one verified tx signature buys exactly one call.
// TTL is 3× the freshness window, so a signature is remembered for the entire
// period during which verifyPayment would still accept it (and then some).
const SIG_CONSUMED_TTL_SEC = 900; // 15 minutes
const sigConsumedKey = (sig) => `x402-skill-sig:${sig}`;

function skillConfig() {
	const sellerSecret = process.env.AGENT_SELLER_SECRET || '';
	const network =
		(process.env.AGENT_TRADE_NETWORK || 'mainnet').toLowerCase() === 'devnet'
			? 'devnet'
			: 'mainnet';
	const rpcUrl =
		network === 'devnet'
			? process.env.SOLANA_RPC_URL_DEVNET || 'https://api.devnet.solana.com'
			: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
	const priceSol = Math.max(
		0.000001,
		parseFloat(process.env.AGENT_TRADE_PRICE_SOL || String(DEFAULT_PRICE_SOL)),
	);
	const priceLamports = Math.round(priceSol * LAMPORTS_PER_SOL);

	let sellerAddress = null;
	let configured = false;
	if (sellerSecret) {
		try {
			sellerAddress = loadAvatarKeypair(sellerSecret).publicKey.toBase58();
			configured = true;
		} catch {
			/* misconfigured secret */
		}
	}
	return { configured, sellerAddress, network, rpcUrl, priceSol, priceLamports };
}

// Verify that sig is a confirmed Solana transfer of at least priceLamports to sellerAddress.
// Retries 3× with 1s back-off — public RPC can lag after a fresh confirmation.
async function verifyPayment(connection, sig, { sellerAddress, priceLamports, buyerAddress }) {
	let lastErr;
	for (let attempt = 0; attempt < 3; attempt++) {
		if (attempt > 0) await new Promise((r) => setTimeout(r, 1000));
		let tx;
		try {
			tx = await connection.getTransaction(sig, {
				commitment: 'confirmed',
				maxSupportedTransactionVersion: 0,
			});
		} catch (e) {
			lastErr = e;
			continue;
		}
		if (!tx?.meta) continue;

		const age = Date.now() / 1000 - (tx.blockTime || 0);
		if (age > MAX_PAYMENT_AGE_SEC) {
			throw Object.assign(new Error('payment expired (>5 min old)'), {
				code: 'payment_expired',
			});
		}

		const keys = (
			tx.transaction.message.staticAccountKeys ||
			tx.transaction.message.accountKeys ||
			[]
		).map((k) => k.toString());

		const sellerIdx = keys.indexOf(sellerAddress);
		if (sellerIdx === -1) {
			throw Object.assign(new Error('seller address not in transaction'), {
				code: 'bad_payment',
			});
		}
		if (buyerAddress) {
			const buyerIdx = keys.indexOf(buyerAddress);
			if (buyerIdx === -1) {
				throw Object.assign(new Error('buyer address not in transaction'), {
					code: 'bad_payment',
				});
			}
		}

		const sellerGain =
			(tx.meta.postBalances[sellerIdx] || 0) - (tx.meta.preBalances[sellerIdx] || 0);
		// Allow 1% tolerance for minor rounding
		if (sellerGain < priceLamports * 0.99) {
			throw Object.assign(
				new Error(`payment too small: got ${sellerGain} lamports, need ${priceLamports}`),
				{ code: 'bad_payment' },
			);
		}

		return { verified: true, lamports: sellerGain, blockTime: tx.blockTime };
	}
	throw Object.assign(
		new Error(
			lastErr ? `RPC error: ${lastErr.message}` : 'transaction not found after 3 attempts',
		),
		{ code: 'tx_not_found' },
	);
}

async function generateAnalysis(topic) {
	const wx = watsonxConfig();
	if (wx.configured) {
		const messages = [
			{
				role: 'user',
				content: `Provide a concise 2–3 sentence crypto market insight on: ${topic}. Be specific, data-driven, and actionable.`,
			},
		];
		const { text } = await watsonxChatComplete(wx, {
			messages,
			maxTokens: 200,
			temperature: 0.7,
		});
		return {
			content: text?.trim() || '',
			model: wx.chatModel || 'ibm/granite-3-8b-instruct',
			provider: 'IBM Granite',
		};
	}

	const key = process.env.ANTHROPIC_API_KEY;
	if (!key) {
		throw new Error('No AI backend configured — set WATSONX_API_KEY or ANTHROPIC_API_KEY');
	}
	const resp = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'x-api-key': key,
			'anthropic-version': '2023-06-01',
			'content-type': 'application/json',
		},
		body: JSON.stringify({
			model: 'claude-haiku-4-5-20251001',
			max_tokens: 200,
			system: 'You are a concise crypto market analyst. Respond in 2–3 sharp sentences.',
			messages: [{ role: 'user', content: `Market insight on: ${topic}` }],
		}),
	});
	if (!resp.ok) {
		throw new Error(`Anthropic API returned ${resp.status}`);
	}
	const j = await resp.json();
	return {
		content: j.content?.[0]?.text?.trim() || '',
		model: 'claude-haiku-4-5-20251001',
		provider: 'Claude Haiku',
	};
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const cfg = skillConfig();
	if (!cfg.configured) {
		return error(
			res,
			503,
			'not_configured',
			'AGENT_SELLER_SECRET is not configured on this deployment.',
		);
	}

	const url = new URL(req.url, 'http://x');
	const sig = (url.searchParams.get('sig') || '').trim();
	const topic = (url.searchParams.get('topic') || 'crypto market trends').trim().slice(0, 200);
	const buyerAddress = (url.searchParams.get('buyer') || '').trim();

	// No payment proof → return 402 manifest
	if (!sig) {
		res.setHeader('Content-Type', 'application/json');
		res.statusCode = 402;
		res.end(
			JSON.stringify({
				x402: true,
				version: 'x402/0.1',
				skill: 'oracle-market-analysis',
				price: { sol: cfg.priceSol, lamports: cfg.priceLamports },
				currency: 'SOL',
				recipient: cfg.sellerAddress,
				network: cfg.network,
				memo: 'oracle-skill-v1',
			}),
		);
		return;
	}

	// Replay check first — a consumed signature never buys a second call, and
	// rejecting before verification saves the RPC round-trips.
	const consumedKey = sigConsumedKey(sig);
	if (await cacheGet(consumedKey)) {
		return error(res, 402, 'payment_replayed', 'this payment signature has already been used');
	}

	// Has sig → verify on-chain then analyze
	const connection = getConnection(cfg.rpcUrl);
	let payment;
	try {
		payment = await verifyPayment(connection, sig, {
			sellerAddress: cfg.sellerAddress,
			priceLamports: cfg.priceLamports,
			buyerAddress,
		});
	} catch (e) {
		return error(res, 402, e.code || 'bad_payment', e.message);
	}

	// Mark the signature consumed BEFORE running the paid work so a concurrent
	// duplicate request can't double-spend it.
	await cacheSet(
		consumedKey,
		{ usedAt: Date.now(), buyer: buyerAddress || null, lamports: payment.lamports },
		SIG_CONSUMED_TTL_SEC,
	);

	let analysis;
	try {
		analysis = await generateAnalysis(topic);
	} catch (e) {
		// The buyer paid but got nothing — release the signature so a retry
		// within the freshness window isn't treated as a replay.
		await cacheDel(consumedKey).catch(() => {});
		return error(res, 502, 'analysis_failed', e.message);
	}

	return json(res, 200, {
		ok: true,
		topic,
		content: analysis.content,
		model: analysis.model,
		provider: analysis.provider,
		payment: {
			sig,
			lamports: payment.lamports,
			blockTime: payment.blockTime,
		},
	});
});
