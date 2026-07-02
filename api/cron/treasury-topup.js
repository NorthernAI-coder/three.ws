// @ts-check
// GET /api/cron/treasury-topup — economy funding-root auto-refill.
//
// The companion to relayer-balance-check (which only ALERTS). This cron reads
// every configured engine signer's mainnet SOL balance and, for any that has
// dropped below its `minSol` floor, tops it up from the ONE economy master
// wallet (api/_lib/economy-master.js) — the "masters fund engines, engines do
// the work" model applied platform-wide.
//
// Safe by construction:
//   • Inert until ECONOMY_MASTER_SECRET_BASE58 is set — with no master it does
//     nothing (relayer-balance-check keeps alerting), so shipping it is a no-op
//     until the operator funds wwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW.
//   • Only ever pays pubkeys derived from SOLANA_SIGNERS (the registry is the
//     allowlist). The master never trades, launches, or settles.
//   • Reserve floor + per-engine cap + per-run cap (see economy-master.js) bound
//     every sweep; the reserve floor is an on-chain read, so it holds with no DB.
//
// Runs every 30 min — fast enough that no engine dries out between sweeps, cheap
// enough (one getBalance per signer + at most a handful of transfers) to stay
// well inside the RPC/Upstash budgets.
//
// Env (reuses existing infra):
//   CRON_SECRET   — Vercel cron bearer auth (shared with other crons)
//   SOLANA_RPC_URL — mainnet RPC (defaults to api.mainnet-beta)
//   ECONOMY_MASTER_SECRET_BASE58 — the funding-root key (unset ⇒ inert)
//   ECONOMY_MASTER_RESERVE_SOL / _PER_TOPUP_MAX_SOL / _RUN_CAP_SOL — guard caps

import { error, json, method, wrapCron } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import { sendOpsAlert } from '../_lib/alerts.js';
import { SOLANA_SIGNERS, resolveSignerPubkey } from '../_lib/solana-signers.js';
import { sweepTopUps } from '../_lib/economy-master.js';

const LAMPORTS_PER_SOL = 1_000_000_000;
// How high to lift an engine when it falls below its floor, unless the spec
// pins its own refillTo. minSol×3 gives comfortable headroom without overfunding
// a hot wallet we deliberately keep thin.
const DEFAULT_REFILL_MULTIPLE = 3;

function requireCron(req, res) {
	const secret = process.env.CRON_SECRET || env.CRON_SECRET;
	if (!secret) {
		error(res, 503, 'not_configured', 'CRON_SECRET unset');
		return false;
	}
	const auth = req.headers['authorization'] || '';
	const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
	if (!constantTimeEquals(presented, secret)) {
		error(res, 401, 'unauthorized', 'invalid cron secret');
		return false;
	}
	return true;
}

export default wrapCron(async (req, res) => {
	if (!method(req, res, ['GET', 'POST'])) return;
	if (!requireCron(req, res)) return;

	const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
	const { PublicKey } = await import('@solana/web3.js');
	const { solanaConnection } = await import('../_lib/solana/connection.js');
	const connection = solanaConnection({ url: rpcUrl, network: 'mainnet', commitment: 'confirmed' });

	// Read every engine signer's balance; collect the ones under floor as refill
	// targets. The master itself (isMaster) and unconfigured/devnet signers are
	// never targets.
	const targets = [];
	const errors = [];
	for (const spec of SOLANA_SIGNERS) {
		if (spec.isMaster || spec.network === 'devnet') continue;
		const resolved = await resolveSignerPubkey(spec);
		if (!resolved.configured) continue;
		if (resolved.decodeError || !resolved.pubkey) {
			errors.push({ name: spec.name, reason: 'secret_decode_failed' });
			continue;
		}
		let lamports;
		try {
			lamports = await connection.getBalance(new PublicKey(resolved.pubkey), 'confirmed');
		} catch (e) {
			errors.push({ name: spec.name, pubkey: resolved.pubkey, reason: `rpc_error: ${e.message}` });
			continue;
		}
		const sol = lamports / LAMPORTS_PER_SOL;
		if (sol >= spec.minSol) continue;
		targets.push({
			name: spec.name,
			pubkey: resolved.pubkey,
			currentSol: Number(sol.toFixed(6)),
			refillToSol: spec.refillTo ?? spec.minSol * DEFAULT_REFILL_MULTIPLE,
		});
	}

	const result = await sweepTopUps({ connection, targets, network: 'mainnet' });

	// Alert when the master is configured but too drained to cover a real
	// deficit — that is the one condition a human must act on (fund the root).
	if (result.configured && targets.length > 0 && result.spentSol === 0 && result.funded.length === 0) {
		await sendOpsAlert(
			`⛽ Economy master could not refill ${targets.length} engine(s)`,
			`master ${result.master} has ${result.masterSol} SOL (reserve ${result.reserveSol}). ` +
				`Underfunded: ${targets.map((t) => t.name).join(', ')}. Fund the master on mainnet.`,
			{ signature: `economy-master-empty:${result.master}` },
		);
	}
	for (const f of result.funded) {
		await sendOpsAlert(
			`⛽ Economy master topped up ${f.name}`,
			`+${f.sol} SOL → ${f.pubkey}\ntx: ${f.signature}`,
			{ signature: `economy-topup:${f.pubkey}:${f.signature}` },
		);
	}

	return json(res, 200, {
		ok: true,
		rpc: rpcUrl,
		configured: result.configured,
		targets: targets.length,
		funded: result.funded,
		failed: result.failed,
		skipped: result.skipped,
		spent_sol: result.spentSol,
		master_sol: result.masterSol ?? null,
		read_errors: errors,
	});
});
