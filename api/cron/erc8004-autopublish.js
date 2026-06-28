// @ts-check
// GET/POST /api/cron/erc8004-autopublish — autonomous ERC-8004 deployment.
//
// The crawl cron READS the registry; this cron WRITES to it. Every public
// three.ws agent that has a 3D body but isn't on-chain yet is registered on the
// Base IdentityRegistry from its OWN custodial wallet, with the platform relayer
// sponsoring a few cents of gas. No browser, no wallet popup — this is what makes
// "Deployed · 24h" tick and the on-chain 3D-avatar share climb.
//
// Gated, by design, so it never spends real mainnet gas until ops opts in:
//   • ERC8004_AUTODEPLOY_ENABLED=true   — the go-live switch.
//   • AGENT_RELAYER_KEY                 — the gas sponsor (already used elsewhere).
// With either absent it 200s as a no-op with a reason. A relayer-balance floor
// and a small per-tick batch bound total spend; a single agent's failure is
// recorded and the run continues.
//
// Standalone (not [name].js) so the import graph — ethers, custodial keys — stays
// off the shared crawler bundle.

import { Wallet, formatEther } from 'ethers';

import { json, method, wrapCron } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import { evmFallbackProvider } from '../_lib/evm/rpc.js';
import {
	BASE_CHAIN_ID,
	publishAgentOnchain,
	selectDeployableAgents,
} from '../_lib/erc8004-publish.js';

// Bounds spend per tick. Each register() is a few cents of Base gas; at a 10-min
// cadence this drains hundreds of agents/day without any run going long or
// burning the relayer faster than it can be topped up.
const BATCH = Number.parseInt(process.env.ERC8004_AUTODEPLOY_BATCH || '5', 10);

// Refuse to start a run if the relayer can't comfortably cover the batch — better
// to skip cleanly than strand a half-funded agent mid-deploy.
const RELAYER_FLOOR_ETH = process.env.ERC8004_RELAYER_FLOOR_ETH || '0.0008';

// Stop before Vercel's 300s kill; each agent does a pin + 1-2 mined txs.
const BUDGET_MS = 110_000;

function requireCron(req, res) {
	const secret = process.env.CRON_SECRET || env.CRON_SECRET;
	if (!secret) {
		json(res, 503, { ok: false, reason: 'CRON_SECRET unset' });
		return false;
	}
	const auth = req.headers['authorization'] || '';
	const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
	const header = req.headers['x-cron-secret'] || '';
	if (constantTimeEquals(bearer, secret) || constantTimeEquals(header, secret)) return true;
	json(res, 401, { ok: false, error: 'invalid cron secret' });
	return false;
}

export default wrapCron(async (req, res) => {
	if (!method(req, res, ['GET', 'POST'])) return;
	if (!requireCron(req, res)) return;

	if (process.env.ERC8004_AUTODEPLOY_ENABLED !== 'true') {
		return json(res, 200, { ok: true, deployed: 0, reason: 'autodeploy disabled' });
	}
	const relayerKey = process.env.AGENT_RELAYER_KEY;
	if (!relayerKey) {
		return json(res, 200, { ok: true, deployed: 0, reason: 'AGENT_RELAYER_KEY unset' });
	}

	const started = Date.now();
	try {
		const candidates = await selectDeployableAgents(BATCH);
		if (!candidates.length) {
			return json(res, 200, { ok: true, deployed: 0, reason: 'no eligible agents' });
		}

		const provider = await evmFallbackProvider(BASE_CHAIN_ID);
		const relayer = new Wallet(relayerKey, provider);

		const relayerBalance = await provider.getBalance(relayer.address);
		if (relayerBalance < BigInt(Math.round(parseFloat(RELAYER_FLOOR_ETH) * 1e18))) {
			console.warn(
				`[erc8004-autopublish] relayer ${relayer.address} low: ${formatEther(relayerBalance)} ETH < floor ${RELAYER_FLOOR_ETH}`,
			);
			return json(res, 200, {
				ok: true,
				deployed: 0,
				reason: 'relayer below gas floor',
				relayer: relayer.address,
				relayer_balance_eth: formatEther(relayerBalance),
			});
		}

		const deployed = [];
		const failed = [];
		for (const agent of candidates) {
			if (Date.now() - started > BUDGET_MS) break;
			try {
				const r = await publishAgentOnchain(agent, { relayer, provider });
				deployed.push({ id: agent.id, name: agent.name, agentId: r.agentId, tx: r.txHash });
				console.log(
					`[erc8004-autopublish] deployed ${agent.name} → agent #${r.agentId} (${r.txHash})`,
				);
			} catch (err) {
				failed.push({
					id: agent.id,
					code: err?.code || 'error',
					error: err?.message || String(err),
				});
				console.error(`[erc8004-autopublish] ${agent.id} failed:`, err?.message || err);
			}
		}

		return json(res, 200, {
			ok: true,
			deployed: deployed.length,
			failed: failed.length,
			batch: candidates.length,
			relayer: relayer.address,
			deployments: deployed,
			failures: failed,
			elapsed_ms: Date.now() - started,
		});
	} catch (err) {
		// Never throw: a failed run leaves all prior on-chain state intact.
		console.error('[erc8004-autopublish] run failed:', err?.message || err);
		return json(res, 200, { ok: false, error: err?.message || String(err) });
	}
});
