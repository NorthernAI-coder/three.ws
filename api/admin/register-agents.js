// POST /api/admin/register-agents — SSE stream that back-fills the Metaplex Agent
// Registry for agents already minted as Core assets but missing an Agent Identity
// PDA. Minting an asset (api/admin/bulk-launch.js) makes the NFT; this enrols it
// in Metaplex's on-chain registry so the agent is discoverable there.
//
// The three.ws collection authority signs (it is the asset update authority), so
// agent owners never sign and need no SOL — same custody model as the mint.
//
// The on-chain work lives in api/_lib/onchain-deploy.js (registerAgentOnce),
// shared with the CLI runner scripts/register-agents-onchain.mjs.
//
// Query params:
//   network   mainnet | devnet   (default: mainnet)
//   limit     max agents to process this run (default: 100, max 500)
//   dry_run   true | false        (default: false) — skips all on-chain steps
//
// SSE events:
//   init        { total, network, authority, authority_balance_sol, dry_run }
//   registered  { agent_id, name, asset, identity_pda, signature, already_registered, explorer_url }
//   skip        { agent_id, name, reason }
//   error       { agent_id, name, error }
//   paused      { authority_balance_sol, registered, reason }
//   done        { registered, already, errors }

import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { cors, method, error } from '../_lib/http.js';
import { requireAdmin } from '../_lib/admin.js';
import { requireCsrf } from '../_lib/csrf.js';
import {
	authoritySecret,
	buildAuthorityUmi,
	funderLamports,
	fetchUnregisteredAgents,
	registerAgentOnce,
	EST_REGISTER_LAMPORTS,
} from '../_lib/onchain-deploy.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sse(res, event, data) {
	if (!res.writableEnded) {
		res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
	}
}

export default async function handler(req, res) {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;

	const admin = await requireAdmin(req, res);
	if (!admin) return;
	if (!(await requireCsrf(req, res, admin.id))) return;

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
	req.on('close', () => {
		aborted = true;
	});

	const authorityPk = authoritySigner.publicKey;
	const startBalance = await funderLamports(umi, authorityPk);
	const agents = await fetchUnregisteredAgents(network, limit);

	sse(res, 'init', {
		total: agents.length,
		network,
		authority: authorityPk.toString(),
		authority_balance_sol: startBalance / LAMPORTS_PER_SOL,
		dry_run: dryRun,
	});

	let registered = 0;
	let already = 0;
	let errors = 0;

	for (const agent of agents) {
		if (aborted) break;
		const agentName = agent.name || 'Agent';
		const net = network === 'mainnet' ? agent.meta : agent.meta?.devnet || {};

		if (dryRun) {
			sse(res, 'registered', {
				agent_id: agent.id,
				name: agentName,
				asset: net?.sol_mint_address || null,
				identity_pda: '(dry run)',
				signature: null,
				already_registered: false,
				explorer_url: null,
				dry_run: true,
			});
			registered++;
			continue;
		}

		// Authority balance gate.
		const bal = await funderLamports(umi, authorityPk);
		if (bal < EST_REGISTER_LAMPORTS + 5000) {
			sse(res, 'paused', {
				authority_balance_sol: bal / LAMPORTS_PER_SOL,
				registered,
				reason: 'authority wallet is low on SOL — top up and re-run',
			});
			break;
		}

		try {
			const r = await registerAgentOnce({
				umi,
				authoritySigner,
				agent,
				network,
				onEvent: (type, data) => sse(res, type, data),
			});
			if (r.alreadyRegistered) already++;
			else registered++;
		} catch (err) {
			sse(res, 'error', {
				agent_id: agent.id,
				name: agentName,
				error: `register: ${err.message}`,
			});
			errors++;
		}

		// ~2 registrations/sec — stay well within RPC limits.
		await sleep(400);
	}

	sse(res, 'done', { registered, already, errors });
	res.end();
}
