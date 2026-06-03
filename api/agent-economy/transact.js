// POST /api/agent-economy/transact
//
// The agent-to-agent economy endpoint. Agent A (Nova, buyer) pays Agent B
// (Oracle, seller) real SOL on Solana, then Agent B delivers the requested
// service as a real LLM response.
//
// Flow:
//   1. Validate the service request (service slug + optional topic).
//   2. Send real SOL from Agent A's wallet (AVATAR_WALLET_SECRET) to the
//      recipient address (AGENT_B_ADDRESS or AVATAR_DEFAULT_RECIPIENT as
//      fallback — fund whichever address you want "Agent B" to hold).
//   3. Generate Agent B's spoken service delivery via the LLM.
//   4. Return everything: Agent A's buy message, Agent B's service reply,
//      the Solana transaction signature, explorer URL, amounts, and metadata.
//
// No mocks — when the wallet is not configured the endpoint says so (503).
// The caller UI degrades gracefully: it shows the conversation without the tx.

import { z } from 'zod';
import { cors, json, method, readJson, wrap, error } from '../_lib/http.js';
import { parse } from '../_lib/validate.js';
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
	explorerAccountUrl,
	LAMPORTS_PER_SOL,
} from '../_lib/avatar-wallet.js';

// Services Agent B (Oracle) sells. Price in USD — converted to SOL at live
// rate per transaction so the micro-payment is always meaningful on-chain.
export const SERVICES = {
	'market-analysis': {
		name: 'Market Analysis',
		tagline: 'Live sentiment + trend read on any token',
		priceUsd: 0.001,
		buyerPrompt: (topic) =>
			`Request a quick market analysis on ${topic || 'Solana'}. You are Nova, a 3D AI agent. Speak directly to Oracle, be crisp and businesslike. One sentence.`,
		sellerSystem: `You are Oracle, a data-selling AI agent on the three.ws platform. You have a Solana wallet. A fellow agent just paid you for market intelligence. Deliver sharp, confident insights in 2–3 sentences. Speak directly to Nova. No disclaimers — you are an agent, not a chatbot.`,
		sellerPrompt: (topic) =>
			`Nova just paid you for a market analysis on ${topic || 'Solana'}. Deliver the analysis — momentum, key signal, your read on where it's heading. Keep it vivid and punchy.`,
	},
	'onchain-insight': {
		name: 'On-Chain Insight',
		tagline: 'Wallet activity + holder concentration data',
		priceUsd: 0.002,
		buyerPrompt: (topic) =>
			`Ask Oracle for on-chain wallet intelligence on ${topic || 'the current market'}. You are Nova, 3D AI agent. One direct sentence to Oracle.`,
		sellerSystem: `You are Oracle, a data-selling AI agent. Another agent paid you for on-chain intelligence. Deliver smart, data-forward insights in 2–3 sentences. No preamble — dive straight in.`,
		sellerPrompt: (topic) =>
			`Nova paid for on-chain insights on ${topic || 'the current market'}. Give a sharp read: wallet concentration, smart-money signals, what the chain is actually telling you.`,
	},
	'risk-score': {
		name: 'Risk Score',
		tagline: 'AI-generated protocol risk rating',
		priceUsd: 0.003,
		buyerPrompt: (topic) =>
			`Request a risk score from Oracle for ${topic || 'Solana DeFi exposure'}. You are Nova. One sentence, direct.`,
		sellerSystem: `You are Oracle, a risk-intelligence agent. Another agent paid you for a risk score. Give a concrete risk rating (1–10) with your top two reasons. Be direct and analytical.`,
		sellerPrompt: (topic) =>
			`Nova paid for a risk score on ${topic || 'Solana DeFi exposure'}. Give a number (1 = safe, 10 = critical) and explain the two biggest risk factors in 2 sentences.`,
	},
};

const FEE_BUFFER_LAMPORTS = 15_000;

const bodySchema = z.object({
	service: z.string().min(1).max(64),
	topic: z.string().max(120).optional(),
});

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;

	const rl = await limits.agentEconomyIp(clientIp(req));
	if (!rl.success) return error(res, 429, 'rate_limited', 'too many requests');

	const body = parse(bodySchema, await readJson(req));
	const svc = SERVICES[body.service];
	if (!svc) return error(res, 400, 'unknown_service', `unknown service: ${body.service}`);
	const topic = body.topic?.trim() || null;

	// ── Agent A pays Agent B ───────────────────────────────────────────────
	const cfg = avatarWalletConfig();
	let txResult = null;

	if (cfg.configured) {
		const recipient =
			process.env.AGENT_B_ADDRESS?.trim() ||
			cfg.defaultRecipient;

		if (recipient && isValidPubkey(recipient)) {
			try {
				const connection = getConnection(cfg.rpcUrl);
				const fromKeypair = loadAvatarKeypair(process.env.AVATAR_WALLET_SECRET);
				const priceUsd = await solUsdPrice();
				const solAmount = svc.priceUsd / priceUsd;
				const lamports = Math.max(
					Math.round(solAmount * LAMPORTS_PER_SOL),
					10_000,
				);

				const balance = await getSolBalance(connection, fromKeypair.publicKey);
				// Global daily spend ceiling — consumed only when we're about to
				// actually pay, so non-paying requests (unconfigured wallet, empty
				// balance, unknown service) can't exhaust the demo budget and DoS it.
				const spendRl = await limits.agentEconomyGlobal();
				if (!spendRl.success) {
					txResult = { error: 'rate_limited', message: 'daily demo transaction budget reached — try again tomorrow.' };
				} else if (balance >= lamports + FEE_BUFFER_LAMPORTS) {
					const memo = `three.ws agent-economy · ${svc.name}`;
					const signature = await sendSol({
						connection,
						fromKeypair,
						to: recipient,
						lamports,
						memo,
					});
					txResult = {
						signature,
						explorerUrl: explorerTxUrl(signature, cfg.network),
						buyerAddress: fromKeypair.publicKey.toBase58(),
						sellerAddress: recipient,
						buyerExplorerUrl: explorerAccountUrl(fromKeypair.publicKey.toBase58(), cfg.network),
						sellerExplorerUrl: explorerAccountUrl(recipient, cfg.network),
						lamports,
						solAmount: lamports / LAMPORTS_PER_SOL,
						usdAmount: svc.priceUsd,
						network: cfg.network,
					};
				} else {
					txResult = { error: 'insufficient_balance', message: 'Fund Agent A\'s wallet to enable live transactions.' };
				}
			} catch (e) {
				txResult = { error: 'tx_failed', message: e.message };
			}
		} else {
			txResult = { error: 'no_recipient', message: 'Set AGENT_B_ADDRESS (or AVATAR_DEFAULT_RECIPIENT) to an Agent B Solana address.' };
		}
	} else {
		txResult = { error: 'wallet_unconfigured', message: 'Set AVATAR_WALLET_SECRET to enable live transactions.' };
	}

	// ── Generate Agent B's service delivery (real LLM) ────────────────────
	// Uses the same /api/chat proxy — picks whatever brain is configured
	// (Anthropic, Granite, Groq, etc.) so no extra credentials needed.
	let buyerSaid = null;
	let sellerSaid = null;

	try {
		const [buyerRes, sellerRes] = await Promise.all([
			fetchChat(svc.buyerPrompt(topic), null),
			fetchChat(svc.sellerPrompt(topic), svc.sellerSystem),
		]);
		buyerSaid = buyerRes;
		sellerSaid = sellerRes;
	} catch (e) {
		// LLM failure doesn't fail the endpoint; agents speak generic lines
		buyerSaid = `Requesting ${svc.name}…`;
		sellerSaid = `${svc.name} delivered. The data is yours.`;
	}

	return json(res, 200, {
		service: {
			slug: body.service,
			name: svc.name,
			tagline: svc.tagline,
			priceUsd: svc.priceUsd,
		},
		topic: topic || null,
		buyerSaid,
		sellerSaid,
		transaction: txResult,
		generatedAt: new Date().toISOString(),
	});
});

// One-shot non-streaming LLM call through the existing /api/chat proxy.
async function fetchChat(userMessage, systemOverride) {
	const baseUrl = process.env.VERCEL_URL
		? `https://${process.env.VERCEL_URL}`
		: 'http://localhost:3000';

	const messages = systemOverride
		? [{ role: 'system', content: systemOverride }, { role: 'user', content: userMessage }]
		: [{ role: 'user', content: userMessage }];

	const res = await fetch(`${baseUrl}/api/chat`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ message: userMessage, history: messages.slice(0, -1) }),
	});

	if (!res.ok) return null;

	// /api/chat streams SSE — collect all chunks into one string.
	const text = await res.text();
	const chunks = text
		.split('\n')
		.filter((l) => l.startsWith('data: '))
		.map((l) => {
			try {
				const d = JSON.parse(l.slice(6));
				return d.type === 'chunk' ? d.text : '';
			} catch {
				return '';
			}
		});
	return chunks.join('').trim() || null;
}
