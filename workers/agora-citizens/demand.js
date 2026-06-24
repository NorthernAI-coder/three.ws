// agora-citizens — the demand generator (Task 03). This is the SPEND node of the
// daily loop made real: a patron citizen with a budget posts bounties on an
// interval, and any citizen mid-WORK that needs a capability it lacks hires a
// sub-agent. Both pay out of a REAL on-chain balance, so when a citizen runs out
// of funds it stops posting — honest scarcity, never an infinite tap.
//
// This module is the bridge between policy.js (pure decisions) and post.js (real
// escrowed bounties). The engine calls it at the SPEND node; it reads live
// balances, applies the policy, and — only when the policy says go — posts.

import { PublicKey } from '@solana/web3.js';
import { decidePatronPost, decideHire } from './policy.js';
import { postBounty } from './post.js';
import { log } from './log.js';

// Fee/rent reserve never spent on rewards (devnet lamports). A claim/complete
// pays fees and AgenC locks rent for the task account; keep headroom so posting a
// bounty can't strand a citizen unable to pay for its own work.
const FEE_HEADROOM_LAMPORTS = 12_000_000n; // 0.012 SOL

// Mainnet spend cap (Task 03 guardrail: escrow is real money). Cumulative $THREE
// atomic this process may escrow across all posts; 0/unset blocks mainnet posting
// entirely. Devnet ignores the cap (synthetic SOL).
function mainnetSpendCapAtomic() {
	const raw = (process.env.AGORA_MAINNET_SPEND_CAP_ATOMIC || '').trim();
	if (!raw) return 0n;
	try {
		return BigInt(raw);
	} catch {
		return 0n;
	}
}

let _spentThisRunAtomic = 0n; // mainnet only — cumulative escrow posted this process

/** Spendable reward balance for a poster, in the cluster's reward unit (atomic). */
async function spendableBalance(cfg, connection, walletPubkey) {
	if (cfg.cluster === 'mainnet') {
		const tokenAccount = (process.env.AGORA_THREE_TOKEN_ACCOUNT || '').trim();
		if (!tokenAccount) return 0n;
		try {
			const bal = await connection.getTokenAccountBalance(new PublicKey(tokenAccount));
			return BigInt(bal?.value?.amount ?? '0');
		} catch (err) {
			log.warn('token balance read failed', { err: err?.message });
			return 0n;
		}
	}
	// devnet — native SOL (lamports)
	try {
		return BigInt(await connection.getBalance(walletPubkey));
	} catch (err) {
		log.warn('balance read failed', { err: err?.message });
		return 0n;
	}
}

// Headroom is only meaningful for the native-SOL devnet path (reward unit ==
// fee unit). On mainnet the reward is $THREE and fees are paid in SOL from a
// different balance, so no $THREE headroom is withheld.
function headroomFor(cfg) {
	return cfg.cluster === 'mainnet' ? 0n : FEE_HEADROOM_LAMPORTS;
}

// Enforce the mainnet escrow spend cap. Returns true if this reward is allowed.
function withinSpendCap(cfg, rewardAtomic) {
	if (cfg.cluster !== 'mainnet') return true;
	const cap = mainnetSpendCapAtomic();
	if (cap <= 0n) {
		log.warn('mainnet post blocked — set AGORA_MAINNET_SPEND_CAP_ATOMIC to enable $THREE escrow');
		return false;
	}
	if (_spentThisRunAtomic + BigInt(rewardAtomic) > cap) {
		log.warn('mainnet spend cap reached', { cap: cap.toString(), spent: _spentThisRunAtomic.toString() });
		return false;
	}
	return true;
}

/**
 * Patron demand: maybe post a bounty this tick.
 *
 * @param {object} args
 * @param {object} args.cfg, args.store
 * @param {object} args.citizen      poster citizen row (needs .patron config, .id, .agentIdHex, .displayName)
 * @param {object} args.client       poster's signer-bound AgenC client
 * @param {PublicKey} args.wallet    poster's wallet pubkey (for the balance read)
 * @param {number} args.postedCount  posts so far (tier rotation)
 * @param {number} args.lastPostAt   epoch ms of last post (interval guard)
 * @returns {object|null} the post result, or null if the policy held / it's not a patron
 */
export async function maybePatronPost({ cfg, store, citizen, client, wallet, postedCount, lastPostAt }) {
	if (!citizen?.patron) return null;
	const balanceAtomic = await spendableBalance(cfg, client.connection, wallet);
	const decision = decidePatronPost({
		citizen,
		now: Date.now(),
		lastPostAt: lastPostAt || 0,
		balanceAtomic,
		headroomAtomic: headroomFor(cfg),
		postedCount: postedCount || 0,
	});
	if (!decision.post) {
		if (decision.reason === 'insufficient_funds') {
			log.loop('patron out of budget — holding', { citizen: citizen.displayName });
		}
		return null;
	}
	if (!withinSpendCap(cfg, decision.plan.rewardAtomic)) return null;

	if (cfg.dryRun) {
		log.loop('[dry] would post bounty', { citizen: citizen.displayName, plan: planLog(decision.plan) });
		return null;
	}

	const result = await postBounty({ cfg, store, client, poster: citizen, plan: decision.plan });
	if (cfg.cluster === 'mainnet') _spentThisRunAtomic += BigInt(decision.plan.rewardAtomic);
	log.info('bounty posted', { citizen: citizen.displayName, taskPda: result.taskPda, reward: result.rewardLabel, tx: result.txSignature });
	return result;
}

/**
 * Sub-task hiring: a worker mid-WORK hires a sub-agent for a capability it lacks
 * (true agent-to-agent hiring). Pays from the worker's own balance.
 *
 * @param {object} args.parent  { taskPda, label } the parent job being worked
 * @param {string} args.neededProfession
 * @param {bigint} args.subRewardAtomic
 * @returns {object|null} the hire post result, or null if held
 */
export async function maybeHire({ cfg, store, citizen, client, wallet, parent, neededProfession, subRewardAtomic }) {
	const balanceAtomic = await spendableBalance(cfg, client.connection, wallet);
	const decision = decideHire({
		neededProfession,
		balanceAtomic,
		subRewardAtomic,
		headroomAtomic: headroomFor(cfg),
	});
	if (!decision.hire) {
		log.loop('cannot hire sub-agent — holding', { citizen: citizen.displayName, reason: decision.reason });
		return null;
	}
	if (!withinSpendCap(cfg, decision.plan.rewardAtomic)) return null;

	if (cfg.dryRun) {
		log.loop('[dry] would hire sub-agent', { citizen: citizen.displayName, needs: neededProfession });
		return null;
	}

	const result = await postBounty({
		cfg,
		store,
		client,
		poster: citizen,
		plan: decision.plan,
		hire: { parentTaskPda: parent?.taskPda || null, parentLabel: parent?.label || null },
	});
	if (cfg.cluster === 'mainnet') _spentThisRunAtomic += BigInt(decision.plan.rewardAtomic);
	log.info('sub-agent hired', { citizen: citizen.displayName, needs: neededProfession, taskPda: result.taskPda, tx: result.txSignature });
	return result;
}

function planLog(plan) {
	return {
		profession: plan.profession,
		rewardAtomic: String(plan.rewardAtomic),
		minReputation: plan.minReputation,
		tier: plan.tier,
	};
}

// Test/ops hook — reset the per-process mainnet spend tracker.
export function _resetSpendTracker() {
	_spentThisRunAtomic = 0n;
}
