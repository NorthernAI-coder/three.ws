// GET /api/demo-economy
// ---------------------
// SSE endpoint that runs the live agent economy demo:
//   Agent A (payer) discovers a service on the x402 bazaar,
//   pays Agent B (provider) in SOL on Solana mainnet,
//   and receives a live crypto market briefing in return.
//
// Streams structured SSE events so the frontend can animate each step
// in real time. Real blockchain transaction when AVATAR_WALLET_SECRET +
// a recipient are configured; simulation mode otherwise (no real money,
// full UI still plays).

import { cors, method, wrap, setRateLimitHeaders } from './_lib/http.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { Bazaar } from './_lib/x402/bazaar-client.js';

// ── Wallet imports (lazy — only when live mode is active) ────────────────────
async function walletDeps() {
	const mod = await import('./_lib/avatar-wallet.js');
	return mod;
}

// ── Live crypto market briefing via GeckoTerminal (no API key needed) ────────
async function fetchMarketBriefing() {
	try {
		const r = await fetch(
			'https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?page=1',
			{ headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) },
		);
		if (!r.ok) throw new Error(`GeckoTerminal ${r.status}`);
		const data = await r.json();
		const pools = (data.data || []).slice(0, 5).map((p) => {
			const attr = p.attributes || {};
			const priceUsd = parseFloat(attr.base_token_price_usd || 0);
			const change24 = parseFloat(attr.price_change_percentage?.h24 || 0);
			const vol24 = parseFloat(attr.volume_usd?.h24 || 0);
			return {
				name: attr.name || p.id,
				price: priceUsd < 0.0001 ? priceUsd.toExponential(2) : priceUsd.toFixed(6),
				change24h: (change24 >= 0 ? '+' : '') + change24.toFixed(1) + '%',
				vol24h: vol24 > 1e6 ? '$' + (vol24 / 1e6).toFixed(1) + 'M' : '$' + (vol24 / 1e3).toFixed(0) + 'K',
				up: change24 >= 0,
			};
		});
		const topGainer = pools.filter((p) => p.up).sort((a, b) => parseFloat(b.change24h) - parseFloat(a.change24h))[0];
		return {
			headline: topGainer
				? `${topGainer.name} leads Solana with ${topGainer.change24h} in 24h`
				: 'Live Solana market data',
			pools,
			fetchedAt: new Date().toISOString(),
		};
	} catch {
		return {
			headline: 'Solana market briefing',
			pools: [
				{ name: 'SOL/USDC', price: '148.20', change24h: '+3.4%', vol24h: '$82M', up: true },
				{ name: 'THREE/SOL', price: '0.00042', change24h: '+5.1%', vol24h: '$9M', up: true },
			],
			fetchedAt: new Date().toISOString(),
		};
	}
}

// ── Bazaar service discovery ─────────────────────────────────────────────────
async function discoverServices() {
	try {
		const bazaar = new Bazaar();
		const { resources } = await bazaar.search({ query: 'crypto market data', maxItems: 20 });
		const top = resources.slice(0, 4).map((r) => ({
			name: r.description?.slice(0, 60) || r.resource?.split('/').pop() || 'Service',
			resource: r.resource,
			price: r.formattedPrice || r.price || '—',
			network: r.network || 'base',
		}));
		if (top.length) return top;
	} catch { /* fall through to demo data */ }
	// Demo services (shown when bazaar is unreachable)
	return [
		{ name: 'Solana market briefing (live)', resource: 'https://three.ws/api/demo-economy', price: '0.001 SOL', network: 'solana' },
		{ name: 'Token price oracle', resource: 'https://three.ws/api/agents/x402/price', price: '0.50 USDC', network: 'base' },
		{ name: 'On-chain sentiment feed', resource: 'https://three.ws/api/sentiment', price: '0.25 USDC', network: 'base' },
		{ name: 'Pump.fun trending coins', resource: 'https://three.ws/api/pump/trending', price: '0.10 USDC', network: 'solana' },
	];
}

// ── SSE helpers ───────────────────────────────────────────────────────────────
function sseWrite(res, event, data) {
	res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) {
		const retryAfter = Math.max(1, setRateLimitHeaders(res, rl));
		res.setHeader('retry-after', String(retryAfter));
		res.statusCode = 429;
		res.end('rate limited');
		return;
	}

	// SSE setup
	res.statusCode = 200;
	res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
	res.setHeader('Cache-Control', 'no-cache, no-store');
	res.setHeader('Connection', 'keep-alive');
	res.setHeader('X-Accel-Buffering', 'no');
	res.flushHeaders?.();

	const pace = 900; // ms between narration beats

	try {
		// ── Step 1: Agents ready ─────────────────────────────────────────────
		sseWrite(res, 'step', {
			id: 'agents_ready',
			label: 'Agents online',
			detail: 'NOVA and ORACLE are live in the world',
			icon: '🌐',
		});
		await sleep(pace);

		// ── Step 2: Browse x402 bazaar ───────────────────────────────────────
		sseWrite(res, 'step', {
			id: 'browsing_bazaar',
			label: 'Browsing x402 bazaar',
			detail: 'NOVA is discovering available services on the Coinbase x402 network',
			icon: '🔍',
		});

		const services = await discoverServices();
		await sleep(pace * 0.7);

		sseWrite(res, 'bazaar', { services });
		await sleep(pace);

		// ── Step 3: Service selected ─────────────────────────────────────────
		const chosen = services[0];
		sseWrite(res, 'step', {
			id: 'service_found',
			label: 'Service found',
			detail: `NOVA found "${chosen.name}" offered by ORACLE`,
			icon: '✅',
		});
		await sleep(pace);

		// ── Step 4: Payment ──────────────────────────────────────────────────
		sseWrite(res, 'step', {
			id: 'payment_init',
			label: 'Initiating payment',
			detail: 'NOVA is sending 0.001 SOL to ORACLE on Solana mainnet',
			icon: '💸',
		});
		await sleep(pace * 0.5);

		// Attempt real transfer
		let payment = null;
		let sim = false;
		try {
			const {
				avatarWalletConfig,
				loadAvatarKeypair,
				getConnection,
				getSolBalance,
				sendSol,
				explorerTxUrl,
				LAMPORTS_PER_SOL,
				isValidPubkey,
			} = await walletDeps();

			const cfg = avatarWalletConfig();
			const recipient = (process.env.DEMO_AGENT_B_ADDRESS || cfg.defaultRecipient || '').trim();

			if (!cfg.configured || !recipient || !isValidPubkey(recipient)) {
				sim = true;
			} else {
				const connection = getConnection(cfg.rpcUrl);
				const keypair = loadAvatarKeypair(process.env.AVATAR_WALLET_SECRET);
				const sender = keypair.publicKey.toBase58();
				const DEMO_LAMPORTS = 1000; // 0.000001 SOL — ~$0.0002, trivially cheap
				const { lamports: balBefore } = await getSolBalance(connection, keypair.publicKey);

				sseWrite(res, 'wallet', {
					agentA: { name: 'NOVA', address: sender, balance_sol: (balBefore / LAMPORTS_PER_SOL).toFixed(6) },
					agentB: { name: 'ORACLE', address: recipient },
				});

				const sig = await sendSol({ connection, fromKeypair: keypair, to: recipient, lamports: DEMO_LAMPORTS, memo: 'three.ws agent economy demo' });
				const { lamports: balAfter } = await getSolBalance(connection, keypair.publicKey);

				payment = {
					signature: sig,
					explorer_url: explorerTxUrl(sig, cfg.network),
					amount_sol: (DEMO_LAMPORTS / LAMPORTS_PER_SOL).toFixed(6),
					amount_usd: '~$0.0002',
					sender,
					recipient,
					balance_before: (balBefore / LAMPORTS_PER_SOL).toFixed(6),
					balance_after: (balAfter / LAMPORTS_PER_SOL).toFixed(6),
				};
			}
		} catch (err) {
			sim = true;
			console.warn('[demo-economy] wallet not configured or send failed:', err.message);
		}

		if (sim) {
			// Simulation: show a plausible fake tx for demo purposes
			const fakeSig = Array.from({ length: 88 }, () => '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Math.floor(Math.random() * 58)]).join('');
			payment = {
				signature: fakeSig,
				explorer_url: `https://solscan.io/tx/${fakeSig}`,
				amount_sol: '0.001000',
				amount_usd: '~$0.15',
				sender: 'NOVA••••••••••••••demo',
				recipient: 'ORACLE••••••••••••demo',
				simulated: true,
			};
			sseWrite(res, 'wallet', {
				agentA: { name: 'NOVA', address: 'Fund with AVATAR_WALLET_SECRET', balance_sol: '0.50' },
				agentB: { name: 'ORACLE', address: 'Fund with DEMO_AGENT_B_ADDRESS', balance_sol: '0.00' },
			});
		}

		sseWrite(res, 'step', {
			id: 'payment_sent',
			label: sim ? 'Payment (simulated)' : 'Transaction submitted',
			detail: sim ? 'Simulated: set AVATAR_WALLET_SECRET + DEMO_AGENT_B_ADDRESS for live transfers' : `Tx broadcast to Solana mainnet`,
			icon: '📡',
		});
		sseWrite(res, 'payment', payment);
		await sleep(pace);

		sseWrite(res, 'step', {
			id: 'payment_confirmed',
			label: sim ? 'Demo confirmed' : 'On-chain confirmed',
			detail: sim ? 'Demo payment complete' : `${payment.amount_sol} SOL transferred · view on Solscan`,
			icon: '⛓️',
		});
		await sleep(pace * 0.6);

		// ── Step 5: Fetch and deliver the market briefing ────────────────────
		sseWrite(res, 'step', {
			id: 'fetching_content',
			label: 'ORACLE delivering briefing',
			detail: 'Live Solana market data inbound',
			icon: '📡',
		});

		const briefing = await fetchMarketBriefing();
		await sleep(pace * 0.5);

		sseWrite(res, 'content', briefing);

		sseWrite(res, 'step', {
			id: 'done',
			label: 'Briefing received',
			detail: `"${briefing.headline}"`,
			icon: '📺',
		});

		sseWrite(res, 'done', {
			sim,
			services_found: services.length,
			payment: payment.signature,
		});
	} catch (err) {
		sseWrite(res, 'error', { message: err.message });
	} finally {
		res.end();
	}
});

export const maxDuration = 30;
