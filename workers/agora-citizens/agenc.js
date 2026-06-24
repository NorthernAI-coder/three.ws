// agora-citizens — the on-chain layer. A thin, retry-wrapped adapter over
// @three-ws/solana-agent (which wraps @tetsuo-ai/sdk → the AgenC coordination
// protocol on Solana). The SDK ships as TS and is imported LAZILY (dynamic
// import, cached) so module load never crashes when its dist/ isn't built yet —
// exactly how api/agora/[action].js reaches the write SDK. Every mutating call is
// wrapped in bounded retry/backoff so a transient RPC failure for one citizen
// never halts the fleet.

import { PublicKey } from '@solana/web3.js';
import { log } from './log.js';

// AgenC TaskState enum (from @tetsuo-ai/sdk). Open tasks are claimable.
export const TASK_STATE = {
	Open: 0,
	InProgress: 1,
	PendingValidation: 2,
	Completed: 3,
	Cancelled: 4,
	Disputed: 5,
};

let _sdk = null;
async function sdk() {
	if (_sdk) return _sdk;
	_sdk = await import('@three-ws/solana-agent');
	return _sdk;
}

// The upstream protocol SDK — for PDA derivation helpers the three.ws adapter
// uses internally but doesn't re-export (e.g. deriveTaskPda). Same lazy pattern.
let _tetsuo = null;
async function tetsuo() {
	if (_tetsuo) return _tetsuo;
	_tetsuo = await import('@tetsuo-ai/sdk');
	return _tetsuo;
}

/**
 * Derive a task's on-chain PDA from its creator + 32-byte taskId. getTasksByCreator
 * returns TaskStatus rows WITHOUT the PDA, but claim/complete need it — so we
 * re-derive it deterministically (no RPC).
 */
export async function deriveTaskPda(client, creator, taskId) {
	const t = await tetsuo();
	const creatorPk = creator instanceof PublicKey ? creator : new PublicKey(creator);
	return t.deriveTaskPda(creatorPk, taskId, client.programId);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run an on-chain call with bounded exponential backoff. Returns the result, or
 * rethrows the last error after cfg.maxRetries attempts so the caller can decide
 * (per-citizen) whether to skip this tick.
 */
export async function withRetry(fn, cfg, label) {
	let lastErr = null;
	for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastErr = err;
			if (attempt === cfg.maxRetries) break;
			const waitMs = cfg.retryBaseMs * Math.pow(2, attempt) + Math.floor(cfg.retryBaseMs * 0.5);
			log.warn('onchain retry', { label, attempt: attempt + 1, err: err?.message, retryMs: waitMs });
			await sleep(waitMs);
		}
	}
	throw lastErr;
}

/**
 * Derive a citizen's canonical AgenC identity from its identity proofs
 * (composite > erc8004 > mpl-core > handle) via the identity bridge — no new
 * namespace invented. Returns the 32-byte id (bytes + hex), the provenance, and
 * the metadataUri to register with.
 */
export async function deriveIdentity(ref) {
	const s = await sdk();
	const result = s.getCanonicalThreewsAgenCId(ref);
	const agentIdHex = s.agenCAgentIdToHex(result.agenCAgentId);
	const metadataUri = s.buildThreewsMetadataUri(ref);
	return {
		agentIdBytes: result.agenCAgentId,
		agentIdHex,
		source: result.source,
		label: result.label,
		metadataUri,
	};
}

export async function makeReadClient(cfg) {
	const s = await sdk();
	return s.createAgenCClient({ cluster: cfg.cluster, rpcUrl: cfg.rpcUrl });
}

export async function makeSignerClient(cfg, signer) {
	const s = await sdk();
	return s.createAgenCClient({ cluster: cfg.cluster, rpcUrl: cfg.rpcUrl, signer });
}

export async function derivePda(client, agentIdHex) {
	const s = await sdk();
	return s.deriveAgenCAgentPda(client, agentIdHex);
}

export async function getAgent(client, pda) {
	const s = await sdk();
	return s.getAgenCAgent(client, pda);
}

/**
 * Ensure a wallet is registered as an AgenC agent (idempotent). If the PDA
 * already exists on-chain we reconcile from it rather than re-registering.
 * Returns { agentPda, txSignature|null, existed, agent }.
 */
export async function ensureRegistered(client, agentIdHex, params, cfg) {
	const s = await sdk();
	const pda = s.deriveAgenCAgentPda(client, agentIdHex);
	const existing = await withRetry(() => s.getAgenCAgent(client, pda), cfg, 'getAgent');
	if (existing) {
		return { agentPda: pda, txSignature: null, existed: true, agent: existing };
	}
	const result = await withRetry(
		() =>
			s.registerAgenCAgent(client, {
				agentId: agentIdHex,
				capabilities: params.capabilities,
				endpoint: params.endpoint,
				metadataUri: params.metadataUri ?? null,
				stakeAmount: params.stakeLamports,
			}),
		cfg,
		'registerAgent',
	);
	const agent = await withRetry(() => s.getAgenCAgent(client, result.agentPda), cfg, 'getAgent:postRegister');
	return { agentPda: result.agentPda, txSignature: result.txSignature, existed: false, agent };
}

/** List every task created by a wallet (used to reconcile the dispatcher pool). */
export async function listCreatorTasks(client, creator) {
	const s = await sdk();
	const pk = creator instanceof PublicKey ? creator : new PublicKey(creator);
	return withRetry(() => s.listAgenCTasksByCreator(client, pk), { maxRetries: 2, retryBaseMs: 1000 }, 'listTasksByCreator');
}

export async function getTask(client, taskPda) {
	const s = await sdk();
	return s.getAgenCTask(client, taskPda instanceof PublicKey ? taskPda : new PublicKey(taskPda));
}

/** Post a real on-chain task (used by the internal devnet work dispatcher). */
export async function createTask(client, args, cfg) {
	const s = await sdk();
	return withRetry(() => s.createAgenCTask(client, args), cfg, 'createTask');
}

export async function claimTask(client, args, cfg) {
	const s = await sdk();
	return withRetry(() => s.claimAgenCTask(client, args), cfg, 'claimTask');
}

export async function completeTask(client, args, cfg) {
	const s = await sdk();
	return withRetry(() => s.completeAgenCTask(client, args), cfg, 'completeTask');
}

export async function formatTaskState(state) {
	const s = await sdk();
	try {
		return s.formatTaskState(state);
	} catch {
		return String(state);
	}
}

/** Generate a fresh 32-byte task id (dispatcher posts unique tasks). */
export async function generateTaskId() {
	const s = await sdk();
	return s.generateAgenCTaskId();
}
