// GET /api/admin/bulk-launch — SSE stream that deploys agents on-chain as
// Metaplex Core assets inside the three.ws Agent Collection (NOT pump.fun).
//
// Each agent becomes a real Solana Metaplex Core NFT — its on-chain identity:
//   • minted into the "three.ws Agents" Collection (authority-managed by three.ws),
//   • owned by the agent's own custodial Solana wallet (so the agent holds its
//     identity and can transfer/sell it later),
//   • carrying an on-chain Attributes plugin (platform, links, $THREE) plus an
//     enforced 5% Royalties plugin, pointing at a pinned manifest.
//
// One funded wallet does everything: it is the collection authority, the mint
// fee payer, and — on first run — the deployer of the Collection account. The
// agent wallets need no SOL (the owner of a Core asset does not sign the mint).
//
// The on-chain work lives in api/_lib/onchain-deploy.js, shared with the CLI
// runner scripts/deploy-agents-onchain.mjs so both mint identical assets.
//
// Query params:
//   network   mainnet | devnet   (default: mainnet)
//   limit     max agents to process this run (default: 100, max 500)
//   dry_run   true | false        (default: false) — skips all on-chain steps
//
// SSE events:
//   init        { total, network, funder, funder_balance_sol, dry_run }
//   collection  { address, source: env|db|deployed, authority, signature? }
//   wallet      { agent_id, name, owner }
//   deployed    { agent_id, name, asset, owner, metadata_uri, signature, explorer_url, avatar_thumb }
//   skip        { agent_id, name, reason }
//   error       { agent_id, name, error }
//   paused      { funder_balance_sol, deployed, reason }
//   done        { deployed, errors, skipped }

import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { cors, method, error } from '../_lib/http.js';
import { requireAdmin } from '../_lib/admin.js';
import {
	authoritySecret,
	buildAuthorityUmi,
	funderLamports,
	fetchUndeployedAgents,
	resolveAgentCollection,
	loadCollectionAsset,
	deployAgentOnce,
	explorerUrl,
	EST_MINT_LAMPORTS,
} from '../_lib/onchain-deploy.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sse(res, event, data) {
	if (!res.writableEnded) {
		res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
	}
}

export default async function handler(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET'])) return;

	const admin = await requireAdmin(req, res);
	if (!admin) return;

	const q = req.query ?? {};
	const network = q.network === 'devnet' ? 'devnet' : 'mainnet';
	const limit = Math.min(500, Math.max(1, Number(q.limit) || 100));
	const dryRun = q.dry_run === 'true';

	if (!authoritySecret()) {
		return error(
			res,
			500,
			'config_error',
			'Set SOLANA_AGENT_COLLECTION_AUTHORITY_KEY (or LAUNCH_FUNDER_SECRET) to the funded authority wallet secret.',
		);
	}
	let umi, authoritySigner;
	try {
		({ umi, authoritySigner } = buildAuthorityUmi(network));
	} catch (e) {
		return error(res, 500, 'config_error', e.message);
	}

	// SSE headers
	res.statusCode = 200;
	res.setHeader('content-type', 'text/event-stream; charset=utf-8');
	res.setHeader('cache-control', 'no-cache, no-transform');
	res.setHeader('connection', 'keep-alive');
	res.setHeader('x-accel-buffering', 'no');

	let aborted = false;
	req.on('close', () => { aborted = true; });

	const authorityPk = authoritySigner.publicKey;
	const startBalance = await funderLamports(umi, authorityPk);
	const agents = await fetchUndeployedAgents(network, limit);

	sse(res, 'init', {
		total: agents.length,
		network,
		funder: authorityPk.toString(),
		funder_balance_sol: startBalance / LAMPORTS_PER_SOL,
		dry_run: dryRun,
	});

	// Resolve (or deploy) the collection up front.
	let collectionAddr;
	try {
		collectionAddr = await resolveAgentCollection({
			umi,
			authoritySigner,
			network,
			onEvent: dryRun ? undefined : (type, data) => sse(res, type, data),
		});
	} catch (err) {
		sse(res, 'error', { agent_id: null, name: 'collection', error: `collection: ${err.message}` });
		sse(res, 'done', { deployed: 0, errors: 1, skipped: 0 });
		return res.end();
	}
	const collectionAsset = dryRun ? null : await loadCollectionAsset(umi, collectionAddr);

	let deployed = 0;
	let errors = 0;
	const skipped = 0;

	for (const agent of agents) {
		if (aborted) break;
		const agentName = agent.name || 'Agent';

		if (dryRun) {
			sse(res, 'deployed', {
				agent_id: agent.id,
				name: agentName,
				asset: '(dry run)',
				owner: agent.meta?.solana_address || '(generated at mint)',
				metadata_uri: null,
				signature: null,
				explorer_url: null,
				avatar_thumb: agent.thumbnail_key ? '' : null,
				dry_run: true,
			});
			deployed++;
			continue;
		}

		// Funder balance gate.
		const bal = await funderLamports(umi, authorityPk);
		if (bal < EST_MINT_LAMPORTS + 5000) {
			sse(res, 'paused', {
				funder_balance_sol: bal / LAMPORTS_PER_SOL,
				deployed,
				reason: 'funder wallet is low on SOL — top up and re-run',
			});
			break;
		}

		try {
			const r = await deployAgentOnce({
				umi,
				authoritySigner,
				collectionAddr,
				collectionAsset,
				agent,
				network,
				onEvent: (type, data) => sse(res, type, data),
			});
			deployed++;
			sse(res, 'deployed', {
				agent_id: agent.id,
				name: agentName,
				asset: r.asset,
				owner: r.ownerAddress,
				metadata_uri: r.metadataUri,
				signature: r.signature,
				explorer_url: explorerUrl(r.asset, network),
				avatar_thumb: r.image || null,
			});
		} catch (err) {
			sse(res, 'error', { agent_id: agent.id, name: agentName, error: `deploy: ${err.message}` });
			errors++;
		}

		// ~2 mints/sec — stay well within RPC limits.
		await sleep(400);
	}

	sse(res, 'done', { deployed, errors, skipped });
	res.end();
}
