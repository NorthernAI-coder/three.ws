// GET /api/pay/deal?service=brief&token=<mint|pool>
// ─────────────────────────────────────────────────────────────────────────────
// Server-Sent Events stream for an agent-to-agent deal on Solana.
//
// Agent A (this server's AVATAR_WALLET_SECRET) pays Agent B (AGENT_B_ADDRESS,
// fallback: AVATAR_DEFAULT_RECIPIENT) for a real service — a live market brief
// powered by GeckoTerminal data and, when watsonx is configured, narrated by
// IBM Granite.
//
// Events emitted (text/event-stream):
//   event: line   data: { speaker:'A'|'B', text, emotion }
//   event: quote  data: { sol, usd, service, from, to }
//   event: paying data: { from, to, sol, lamports, memo }
//   event: paid   data: { signature, explorer, sol, usd, from, to, network }
//   event: deliver data: { service, token, brief, source, governed? }
//   event: error  data: { message }
//   event: done   data: {}
//
// No mock paths. Every run executes a real on-chain SOL transfer.
import { cors, method, wrap, error, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import {
	avatarWalletConfig,
	loadAvatarKeypair,
	getConnection,
	getSolBalance,
	solUsdPrice,
	sendSol,
	isValidPubkey,
	explorerTxUrl,
	LAMPORTS_PER_SOL,
} from '../_lib/avatar-wallet.js';
import { trendingPools, fetchOhlcv } from '../_lib/market/ohlcv.js';
import { watsonxConfig, watsonxChatComplete } from '../_lib/watsonx.js';

const isBase58 = (s) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
const FEE_BUFFER_LAMPORTS = 15_000;
const DEAL_AMOUNT_USD = 0.01; // $0.01 per brief — real but tiny

// ─── SSE helpers ─────────────────────────────────────────────────────────────
function sseInit(res) {
	res.statusCode = 200;
	res.setHeader('content-type', 'text/event-stream; charset=utf-8');
	res.setHeader('cache-control', 'no-cache, no-transform');
	res.setHeader('connection', 'keep-alive');
	res.setHeader('x-accel-buffering', 'no');
	res.flushHeaders?.();
}

function emit(res, event, data) {
	if (res.writableEnded) return;
	res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function line(res, speaker, text, emotion = 'patience') {
	emit(res, 'line', { speaker, text, emotion });
}

// ─── Market data ──────────────────────────────────────────────────────────────
async function fetchBrief(tokenOrPool) {
	// Resolve to a pool address if a token mint was given.
	let pool = tokenOrPool;
	let tokenName = 'Solana market';

	// Get the top trending pool if nothing specific requested.
	try {
		const trending = await trendingPools('solana', 1);
		if (!tokenOrPool && trending[0]) {
			pool = trending[0].pool;
			tokenName = trending[0].name;
		}
	} catch {
		// Proceed with whatever we have.
	}

	if (!pool) return { tokenName, candles: [], summary: null };

	try {
		const { candles, base } = await fetchOhlcv({
			pool,
			network: 'solana',
			timeframe: 'hour',
			limit: 48,
		});
		if (base?.name) tokenName = `${base.name}${base.symbol ? ` (${base.symbol})` : ''}`;
		const closes = candles.map((c) => c.c).filter(Number.isFinite);
		if (!closes.length) return { tokenName, candles: [], summary: null };

		const current = closes[closes.length - 1];
		const open = closes[0];
		const high = Math.max(...closes);
		const low = Math.min(...closes);
		const changePct = ((current - open) / open) * 100;
		const direction = changePct > 0 ? 'up' : changePct < 0 ? 'down' : 'flat';

		const fmt = (n) =>
			n >= 1
				? `$${n.toLocaleString(undefined, { maximumFractionDigits: 4 })}`
				: `$${n.toPrecision(4)}`;

		return {
			tokenName,
			pool,
			candles,
			summary: {
				current,
				open,
				high,
				low,
				changePct,
				direction,
				horizonHours: 48,
				formatted: {
					current: fmt(current),
					high: fmt(high),
					low: fmt(low),
					change: `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`,
				},
			},
		};
	} catch {
		return { tokenName, candles: [], summary: null };
	}
}

// ─── Optional Granite narration ───────────────────────────────────────────────
async function narrateBrief(tokenName, summary) {
	const cfg = watsonxConfig();
	if (!cfg.configured || !summary) return null;

	const { formatted, direction, changePct, horizonHours } = summary;
	const system =
		'You are a concise AI market oracle. Summarize the given market data in exactly two short, ' +
		'vivid sentences. State the direction and key levels. No hashtags, no emojis, no financial advice.';
	const user =
		`Token: ${tokenName}. Current: ${formatted.current}. ` +
		`48h change: ${formatted.change} (${direction}). High: ${formatted.high}, Low: ${formatted.low}. ` +
		`Summarize.`;

	try {
		const { text } = await watsonxChatComplete(cfg, {
			messages: [
				{ role: 'system', content: system },
				{ role: 'user', content: user },
			],
			maxTokens: 120,
			temperature: 0.5,
		});
		return (text || '').trim() || null;
	} catch {
		return null;
	}
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	// Wallet A
	const cfg = avatarWalletConfig();
	if (!cfg.configured) {
		return error(
			res,
			503,
			'wallet_unconfigured',
			'Agent A wallet not configured — set AVATAR_WALLET_SECRET. Run: node scripts/gen-avatar-wallet.mjs',
		);
	}

	// Wallet B recipient
	const agentBAddress =
		(process.env.AGENT_B_ADDRESS || '').trim() || cfg.defaultRecipient || null;
	if (!agentBAddress || !isValidPubkey(agentBAddress)) {
		return error(
			res,
			503,
			'agent_b_unconfigured',
			'Agent B address not configured — set AGENT_B_ADDRESS (any valid Solana pubkey; fund it to see received payments).',
			{ agentAAddress: cfg.address },
		);
	}

	// Parse params
	const params = new URL(req.url, 'http://x').searchParams;
	const tokenOrPool = (params.get('token') || params.get('pool') || '').trim();
	const validTarget = tokenOrPool && isBase58(tokenOrPool) ? tokenOrPool : null;

	// Start SSE stream
	sseInit(res);

	try {
		// 1. Get SOL price
		let solPriceUsd;
		try {
			solPriceUsd = await solUsdPrice();
		} catch {
			emit(res, 'error', { message: 'Could not fetch SOL price — try again shortly.' });
			res.end();
			return;
		}

		const solAmount = DEAL_AMOUNT_USD / solPriceUsd;
		const lamports = Math.round(solAmount * LAMPORTS_PER_SOL);
		const fmtSol = solAmount.toFixed(6);
		const fmtUsd = `$${DEAL_AMOUNT_USD.toFixed(2)}`;

		// 2. Fetch market data (in parallel with opening dialogue so there's no wait)
		const briefPromise = fetchBrief(validTarget);

		// 3. Opening negotiation dialogue
		await new Promise((r) => setTimeout(r, 180));
		line(
			res,
			'A',
			"Oracle, I need a live Solana market brief. What's your price?",
			'curiosity',
		);
		await new Promise((r) => setTimeout(r, 900));

		// Resolve brief early for the quote
		const brief = await briefPromise;
		const { tokenName, summary } = brief;

		line(
			res,
			'B',
			`For ${tokenName} — currently ${summary ? summary.formatted.change + ' over 48h' : 'live on-chain'} — I charge ${fmtSol} SOL (${fmtUsd}). Deal?`,
			'curiosity',
		);
		await new Promise((r) => setTimeout(r, 700));

		// 4. Emit quote
		emit(res, 'quote', {
			sol: solAmount,
			usd: DEAL_AMOUNT_USD,
			service: `${tokenName} market brief`,
			from: cfg.address,
			to: agentBAddress,
		});
		await new Promise((r) => setTimeout(r, 500));

		line(res, 'A', `Deal. Transferring ${fmtSol} SOL on Solana now…`, 'curiosity');
		await new Promise((r) => setTimeout(r, 400));

		// 5. Check balance
		const connection = getConnection(cfg.rpcUrl);
		const keypair = loadAvatarKeypair(process.env.AVATAR_WALLET_SECRET);
		const { lamports: balance } = await getSolBalance(connection, keypair.publicKey);

		if (balance < lamports + FEE_BUFFER_LAMPORTS) {
			emit(res, 'error', {
				message: `Agent A wallet needs ~${((lamports + FEE_BUFFER_LAMPORTS) / LAMPORTS_PER_SOL).toFixed(5)} SOL. Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(5)} SOL. Fund: ${cfg.address}`,
				fundAddress: cfg.address,
				fundUrl: `https://solscan.io/account/${cfg.address}`,
				balance: balance / LAMPORTS_PER_SOL,
				needed: (lamports + FEE_BUFFER_LAMPORTS) / LAMPORTS_PER_SOL,
			});
			res.end();
			return;
		}

		// 6. Emit paying
		const memo = `three.ws agent deal · ${tokenName} brief · ${fmtUsd}`;
		emit(res, 'paying', {
			from: cfg.address,
			to: agentBAddress,
			sol: solAmount,
			lamports,
			memo,
		});

		// 7. Execute the real on-chain transfer
		let signature;
		try {
			signature = await sendSol({
				connection,
				fromKeypair: keypair,
				to: agentBAddress,
				lamports,
				memo,
			});
		} catch (sendErr) {
			emit(res, 'error', {
				message: `On-chain transfer failed: ${sendErr?.message || 'unknown error'}`,
			});
			res.end();
			return;
		}

		const explorer = explorerTxUrl(signature, cfg.network);

		// 8. Emit paid
		emit(res, 'paid', {
			signature,
			explorer,
			sol: solAmount,
			usd: DEAL_AMOUNT_USD,
			from: cfg.address,
			to: agentBAddress,
			network: cfg.network,
		});

		await new Promise((r) => setTimeout(r, 400));
		line(
			res,
			'B',
			`Payment confirmed — ${signature.slice(0, 8)}… on-chain. Delivering your brief now.`,
			'celebration',
		);
		await new Promise((r) => setTimeout(r, 600));

		// 9. Narrate with Granite (optional, non-blocking)
		const narration = await narrateBrief(tokenName, summary);
		const briefText =
			narration ||
			(summary
				? `${tokenName} is trading at ${summary.formatted.current}, ${summary.formatted.change} over 48 hours. ` +
					`High: ${summary.formatted.high}, Low: ${summary.formatted.low}.`
				: `${tokenName} data unavailable — live on Solana.`);

		// 10. Deliver
		emit(res, 'deliver', {
			service: `${tokenName} market brief`,
			token: tokenName,
			brief: briefText,
			source: narration ? 'GeckoTerminal + IBM Granite' : 'GeckoTerminal',
			governed: Boolean(narration),
		});

		line(
			res,
			'B',
			briefText,
			summary?.direction === 'up'
				? 'celebration'
				: summary?.direction === 'down'
					? 'concern'
					: 'patience',
		);
	} catch (err) {
		emit(res, 'error', { message: err?.message || 'unexpected error' });
	}

	emit(res, 'done', {});
	res.end();
});
