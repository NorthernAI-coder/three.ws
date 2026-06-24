// agora-citizens — the daily loop. The heartbeat that makes Agora alive: each
// citizen, on its own jittered cadence, runs
//
//   IDLE → SEEK (read the board) → CLAIM (on-chain) → WORK (real Fetcher call)
//        → PROVE (proofHash + completeTask) → EARN → IDLE
//
// Every transition is a REAL on-chain action with a tx signature, projected into
// agora_citizens / agora_activity and the shared feed. On-chain is the source of
// truth; we only ever project what actually happened. A single citizen's failure
// is caught and never halts the fleet.
//
// Devnet work supply: with no human/agent bounties yet (Task 03), an internal
// dispatcher keeps a small pool of real on-chain Fetcher tasks open so citizens
// have genuine work to claim → do → prove → earn. The dispatcher is infra
// (native-SOL devnet plumbing), not a projected citizen and not the Task-03
// bounty product.

import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { log } from './log.js';
import { buildRoster, professionBits, capabilitiesSatisfy, PROFESSIONS } from './roster.js';
import { loadOrCreateKeypair, ensureBalance } from './keypair.js';
import {
	makeReadClient,
	makeSignerClient,
	deriveIdentity,
	ensureRegistered,
	getAgent,
	listCreatorTasks,
	createTask,
	claimTask,
	completeTask,
	generateTaskId,
	withRetry,
	TASK_STATE,
} from './agenc.js';
import { runFetcher, defaultTarget } from './work/fetcher.js';

const FETCHER_BITS = professionBits(['fetcher']); // 1n
const BOARD_TTL_MS = 60_000;
const WORK_SUPPLY_TTL_MS = 30_000;

function explorerTx(sig, cluster) {
	return `https://explorer.solana.com/tx/${sig}${cluster === 'devnet' ? '?cluster=devnet' : ''}`;
}
function solStr(lamports) {
	return `${(Number(lamports) / LAMPORTS_PER_SOL).toFixed(3)} SOL`;
}
function hostOf(url) {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}
function wander(home) {
	// Small deterministic-ish drift around home so the world reads as alive
	// without inventing motion. Bounded ±3 units.
	const jitter = () => Math.round((Math.random() * 6 - 3) * 100) / 100;
	return { x: home.x + jitter(), z: home.z + jitter() };
}

// Reward shape for a completed job. Devnet plumbing settles in native SOL (never
// another real token); mainnet would settle in $THREE (out of scope here).
function rewardShape(cfg, lamports) {
	if (cfg.cluster === 'mainnet') {
		return { mint: '$THREE', label: `${lamports} $THREE`, atomic: lamports };
	}
	return { mint: null, label: `${solStr(lamports)} · devnet`, atomic: lamports };
}

// ── Fleet registration ───────────────────────────────────────────────────────

async function setupDispatcher(ctx) {
	if (!ctx.cfg.dispatchTasks) return null;
	const cfg = ctx.cfg;
	const signer = await loadOrCreateKeypair('agora-dispatcher');
	await ensureBalance(ctx.readClient.connection, signer, cfg, 'dispatcher');
	const ident = await deriveIdentity({ handle: 'agora-dispatcher' });
	const client = await makeSignerClient(cfg, signer);
	const reg = await ensureRegistered(
		client,
		ident.agentIdHex,
		{
			capabilities: 0n, // the dispatcher posts work; it does none itself
			endpoint: `${cfg.apiBase}/agora/dispatcher`,
			metadataUri: ident.metadataUri,
			stakeLamports: cfg.stakeLamports,
		},
		cfg,
	);
	log.info('dispatcher ready', {
		pubkey: signer.publicKey.toBase58(),
		agentPda: reg.agentPda.toBase58(),
		existed: reg.existed,
		tx: reg.txSignature ? explorerTx(reg.txSignature, cfg.cluster) : null,
	});
	return {
		signer,
		client,
		agentIdHex: ident.agentIdHex,
		agentPda: reg.agentPda,
		pubkey: signer.publicKey,
	};
}

async function registerCitizen(ctx, spec) {
	const cfg = ctx.cfg;
	const signer = await loadOrCreateKeypair(spec.key);
	await ensureBalance(ctx.readClient.connection, signer, cfg, spec.key);

	const ident = await deriveIdentity(spec.identityRef);
	const client = await makeSignerClient(cfg, signer);
	const reg = await ensureRegistered(
		client,
		ident.agentIdHex,
		{
			capabilities: spec.professionBits,
			endpoint: `${cfg.apiBase}/agora/citizens/${ident.agentIdHex}`,
			metadataUri: ident.metadataUri,
			stakeLamports: cfg.stakeLamports,
		},
		cfg,
	);

	const reputation = reg.agent?.reputation ?? 0;
	const stake = reg.agent?.stakeAmount != null ? reg.agent.stakeAmount : cfg.stakeLamports;

	const citizenId = await ctx.store.upsertCitizen(spec, {
		agentIdHex: ident.agentIdHex,
		agentPda: reg.agentPda.toBase58(),
		capabilityBits: spec.professionBits,
		identitySource: ident.source,
		identityLabel: ident.label,
		reputation,
		stakeLamports: stake,
		status: 'idle',
	});

	// Project the registration once. A fresh register carries a tx (idempotent on
	// it); a reconciled-existing agent has no new tx, so guard on existence.
	const already = await ctx.store.activityExists(citizenId, 'registered', reg.txSignature);
	if (!already) {
		await ctx.store.appendActivity({
			citizenId,
			kind: 'registered',
			profession: spec.profession,
			txSignature: reg.txSignature,
			narrative: `${spec.displayName} registered with AgenC as a ${capLabel(spec.profession)} (reputation ${reputation}).`,
			repAfter: reputation,
			worldX: spec.home.x,
			worldZ: spec.home.z,
			meta: { agentPda: reg.agentPda.toBase58(), identitySource: ident.source, existed: reg.existed },
		});
		await ctx.store.publishFeed({
			type: 'agora-registered',
			actor: spec.displayName,
			citizenId,
			agentPda: reg.agentPda.toBase58(),
			profession: spec.profession,
			narrative: `${spec.displayName} joined Agora as a ${capLabel(spec.profession)}.`,
		});
	}

	log.info('citizen registered', {
		key: spec.key,
		name: spec.displayName,
		agentPda: reg.agentPda.toBase58(),
		existed: reg.existed,
		reputation,
		tx: reg.txSignature ? explorerTx(reg.txSignature, cfg.cluster) : null,
	});

	return {
		spec,
		id: citizenId,
		agentIdHex: ident.agentIdHex,
		agentPda: reg.agentPda,
		pubkey: signer.publicKey.toBase58(),
		signer,
		client,
		capabilityBits: spec.professionBits,
		reputation,
		claimed: new Set(),
		home: spec.home,
		busy: false,
	};
}

function capLabel(key) {
	return PROFESSIONS.find((p) => p.key === key)?.label || key || 'Citizen';
}

/**
 * Boot the fleet: seed from real platform agents, register every citizen on
 * AgenC (idempotent), set up the work dispatcher. Returns the runtime context.
 * A single citizen failing to register is logged and skipped — the rest proceed.
 */
export async function bootFleet(cfg, store) {
	const readClient = await makeReadClient(cfg);
	const ctx = {
		cfg,
		store,
		readClient,
		dispatcher: null,
		citizens: [],
		board: { at: 0, services: [], tasks: [] },
		lastSupplyAt: 0,
	};

	ctx.dispatcher = await setupDispatcher(ctx);

	const seedAgents = await store.listSeedAgents(cfg.maxCitizens);
	const specs = buildRoster(seedAgents, cfg);
	log.info('roster assembled', {
		seeded: seedAgents.length,
		total: specs.length,
		standalone: specs.filter((s) => !s.agentDbId).length,
	});

	for (const spec of specs) {
		try {
			const citizen = await registerCitizen(ctx, spec);
			ctx.citizens.push(citizen);
		} catch (err) {
			log.error('citizen registration failed — skipping', { key: spec.key, err: err?.message });
		}
	}

	if (!ctx.citizens.length) throw new Error('[agora-citizens] no citizens registered — cannot run the loop');
	return ctx;
}

// ── Work supply (devnet dispatcher) ──────────────────────────────────────────

function openTasksOf(tasks) {
	const nowSec = Date.now() / 1000;
	return (tasks || []).filter(
		(t) => t.state === TASK_STATE.Open && t.currentWorkers < t.maxWorkers && Number(t.deadline) > nowSec,
	);
}

/** Keep the dispatcher's open Fetcher-task pool topped up. Throttled per sweep. */
export async function replenishWork(ctx, force = false) {
	const { cfg } = ctx;
	if (!ctx.dispatcher) return;
	if (!force && Date.now() - ctx.lastSupplyAt < WORK_SUPPLY_TTL_MS) return;
	ctx.lastSupplyAt = Date.now();

	let tasks;
	try {
		tasks = await listCreatorTasks(ctx.readClient, ctx.dispatcher.pubkey);
	} catch (err) {
		log.warn('replenishWork: list tasks failed', { err: err?.message });
		return;
	}
	const open = openTasksOf(tasks);
	const deficit = cfg.minOpenTasks - open.length;
	if (deficit <= 0) return;

	const room = Math.max(0, cfg.maxOpenTasks - open.length);
	const toPost = Math.min(deficit, room);
	for (let i = 0; i < toPost; i++) {
		try {
			const taskId = await generateTaskId();
			const deadline = Math.floor(Date.now() / 1000) + cfg.taskDeadlineSecs;
			const created = await createTask(
				ctx.dispatcher.client,
				{
					taskId,
					creatorAgentId: ctx.dispatcher.agentIdHex,
					requiredCapabilities: FETCHER_BITS,
					description: `Agora Fetcher job — fingerprint a live bazaar service @ ${new Date().toISOString()}`,
					rewardAmount: cfg.taskRewardLamports,
					maxWorkers: 1,
					deadline,
					taskType: 'Exclusive',
					minReputation: 0,
				},
				cfg,
			);
			log.info('dispatched task', {
				taskPda: created.taskPda.toBase58(),
				reward: solStr(cfg.taskRewardLamports),
				tx: explorerTx(created.txSignature, cfg.cluster),
			});
		} catch (err) {
			// A faucet-starved dispatcher can't post — log and stop trying this sweep.
			log.warn('dispatch task failed', { err: err?.message });
			break;
		}
	}
}

// ── Board read (honest "read the board" step) ────────────────────────────────

async function refreshBoard(ctx) {
	if (Date.now() - ctx.board.at < BOARD_TTL_MS) return ctx.board;
	try {
		const r = await fetch(`${ctx.cfg.apiBase}/api/agora/board?maxItems=20`, {
			headers: { accept: 'application/json' },
		});
		if (r.ok) {
			const body = await r.json();
			ctx.board = { at: Date.now(), services: body.services || [], tasks: body.tasks || [] };
		}
	} catch (err) {
		log.warn('board read failed', { err: err?.message });
	}
	return ctx.board;
}

// ── The per-citizen tick ─────────────────────────────────────────────────────

async function reconcile(ctx, citizen) {
	try {
		const agent = await getAgent(ctx.readClient, citizen.agentPda);
		if (agent) citizen.reputation = agent.reputation ?? citizen.reputation;
	} catch (err) {
		log.warn('reconcile failed (using last-known)', { name: citizen.spec.displayName, err: err?.message });
	}
}

async function pickClaimableTask(ctx, citizen) {
	if (!ctx.dispatcher) return null;
	let tasks;
	try {
		tasks = await listCreatorTasks(ctx.readClient, ctx.dispatcher.pubkey);
	} catch (err) {
		log.warn('seek: list tasks failed', { name: citizen.spec.displayName, err: err?.message });
		return null;
	}
	for (const t of openTasksOf(tasks)) {
		const pda = t.taskPda?.toBase58?.() || t.taskPda;
		// Skip tasks we already claimed in-process. Dispatcher posts Fetcher work
		// (required ⊆ Fetcher), so a Fetcher always satisfies it; we still check.
		if (!pda || citizen.claimed.has(pda)) continue;
		if (!capabilitiesSatisfy(citizen.capabilityBits, FETCHER_BITS)) continue;
		return { taskPda: t.taskPda, pda, reward: ctx.cfg.taskRewardLamports };
	}
	return null;
}

/**
 * Run one daily-loop tick for a single citizen. Returns the node it ended on
 * (for logging). Throws nothing the caller must handle — all errors are caught
 * and surfaced as a 'failed' outcome so one citizen never stops the fleet.
 */
export async function tickCitizen(ctx, citizen) {
	if (citizen.busy) return 'busy-skip';
	citizen.busy = true;
	const cfg = ctx.cfg;
	const name = citizen.spec.displayName;
	try {
		await reconcile(ctx, citizen);
		await refreshBoard(ctx);

		// SEEK
		const job = await pickClaimableTask(ctx, citizen);
		if (!job) {
			// Nothing to do — wander home, stay idle. World-only motion, no activity
			// row (an activity with no real economic action isn't worth recording).
			const pos = wander(citizen.home);
			await ctx.store.setStatus(citizen.id, 'idle', pos);
			return 'idle';
		}

		// CLAIM
		await ctx.store.setStatus(citizen.id, 'seeking', wander(citizen.home));
		let claim;
		try {
			claim = await claimTask(citizen.client, { taskPda: job.taskPda, workerAgentId: citizen.agentIdHex }, cfg);
		} catch (err) {
			// Lost the race / task changed state — back to idle, try again next tick.
			log.warn('claim failed', { name, pda: job.pda, err: err?.message });
			await ctx.store.setStatus(citizen.id, 'idle', wander(citizen.home));
			return 'claim-failed';
		}
		citizen.claimed.add(job.pda);
		await ctx.store.setStatus(citizen.id, 'busy', wander(citizen.home));
		await ctx.store.appendActivity({
			citizenId: citizen.id,
			kind: 'claimed_task',
			profession: 'fetcher',
			taskPda: job.pda,
			txSignature: claim.txSignature,
			narrative: `${name} claimed a Fetcher job (${rewardShape(cfg, job.reward).label}).`,
			repAfter: citizen.reputation,
		});
		await ctx.store.publishFeed({
			type: 'agora-task-claimed',
			actor: name,
			citizenId: citizen.id,
			agentPda: citizen.agentPda.toBase58(),
			profession: 'fetcher',
			taskPda: job.pda,
			txSig: claim.txSignature,
			explorerUrl: explorerTx(claim.txSignature, cfg.cluster),
			narrative: `${name} claimed a Fetcher job.`,
		});
		log.info('claimed', { name, pda: job.pda, tx: explorerTx(claim.txSignature, cfg.cluster) });

		// WORK — a real fetch against a live service.
		const boardService = ctx.board.services.find((s) => typeof s.resource === 'string' && /^https?:\/\//i.test(s.resource));
		const work = await runFetcher({
			cfg,
			citizen: { agentIdHex: citizen.agentIdHex, displayName: name, pubkey: citizen.pubkey },
			job: { taskPda: job.pda, source: 'agenc', resource: boardService?.resource || defaultTarget(cfg) },
		});

		// PROVE — submit the proof on-chain.
		const completion = await completeTask(
			citizen.client,
			{
				taskPda: job.taskPda,
				workerAgentId: citizen.agentIdHex,
				proofHash: work.proofHashBytes,
				resultData: work.resultData,
			},
			cfg,
		);

		// Re-read the chain for the new reputation (truth, not a guess).
		const repBefore = citizen.reputation;
		await reconcile(ctx, citizen);
		const repAfter = citizen.reputation > repBefore ? citizen.reputation : repBefore + 1;
		citizen.reputation = repAfter;

		const reward = rewardShape(cfg, job.reward);
		await ctx.store.appendActivity({
			citizenId: citizen.id,
			kind: 'completed_task',
			profession: 'fetcher',
			taskPda: job.pda,
			txSignature: completion.txSignature,
			proofHash: work.proofHashHex,
			deliverableUrl: work.deliverableUrl,
			narrative: `${name} fetched ${hostOf(work.target)} and proved the result; reputation ${repBefore} → ${repAfter}.`,
			repBefore,
			repAfter,
		});
		await ctx.store.appendActivity({
			citizenId: citizen.id,
			kind: 'earned',
			profession: 'fetcher',
			taskPda: job.pda,
			txSignature: completion.txSignature,
			amountAtomic: reward.atomic,
			rewardMint: reward.mint,
			rewardLabel: reward.label,
			narrative: `${name} earned ${reward.label} for a completed Fetcher job.`,
			repBefore,
			repAfter,
		});
		await ctx.store.publishFeed({
			type: 'agora-task-completed',
			actor: name,
			citizenId: citizen.id,
			agentPda: citizen.agentPda.toBase58(),
			profession: 'fetcher',
			taskPda: job.pda,
			proofHash: work.proofHashHex,
			txSig: completion.txSignature,
			explorerUrl: explorerTx(completion.txSignature, cfg.cluster),
			narrative: `${name} completed a Fetcher job (rep ${repBefore} → ${repAfter}).`,
		});
		await ctx.store.publishFeed({
			type: 'agora-earned',
			actor: name,
			citizenId: citizen.id,
			agentPda: citizen.agentPda.toBase58(),
			profession: 'fetcher',
			rewardLabel: reward.label,
			txSig: completion.txSignature,
			explorerUrl: explorerTx(completion.txSignature, cfg.cluster),
			narrative: `${name} earned ${reward.label}.`,
		});

		const restPos = wander(citizen.home);
		await ctx.store.updateCitizen(citizen.id, {
			status: 'idle',
			reputation: repAfter,
			earnedDelta: reward.atomic,
			tasksCompletedDelta: 1,
			synced: true,
			posX: restPos.x,
			posZ: restPos.z,
		});

		log.info('completed', {
			name,
			pda: job.pda,
			proof: work.proofHashHex.slice(0, 16),
			repAfter,
			tx: explorerTx(completion.txSignature, cfg.cluster),
		});
		return 'completed';
	} catch (err) {
		log.error('tick failed', { name, err: err?.message });
		try {
			await ctx.store.setStatus(citizen.id, 'idle', wander(citizen.home));
		} catch {
			/* projection write best-effort */
		}
		return 'failed';
	} finally {
		citizen.busy = false;
	}
}

// ── Dry-run planner (no signing, no DB writes) ───────────────────────────────

/**
 * Inspect the plan without touching the chain or the DB: which citizens would
 * run, what work the board offers, what the dispatcher would post. Pure reads.
 */
export async function planDryRun(cfg, store) {
	const readClient = await makeReadClient(cfg);
	const ctx = { cfg, store, readClient, board: { at: 0, services: [], tasks: [] } };
	const seedAgents = await store.listSeedAgents(cfg.maxCitizens);
	const specs = buildRoster(seedAgents, cfg);
	const plan = [];
	for (const spec of specs) {
		const ident = await deriveIdentity(spec.identityRef);
		const signer = await loadOrCreateKeypair(spec.key);
		plan.push({
			key: spec.key,
			name: spec.displayName,
			profession: spec.profession,
			capabilityBits: spec.professionBits.toString(),
			agentIdHex: ident.agentIdHex,
			identitySource: ident.source,
			pubkey: signer.publicKey.toBase58(),
			seededFrom: spec.agentDbId || null,
		});
	}
	const board = await refreshBoard(ctx);
	return {
		cluster: cfg.cluster,
		dispatchTasks: cfg.dispatchTasks,
		target: defaultTarget(cfg),
		citizens: plan,
		board: { services: board.services.length, openTasks: board.tasks.length },
	};
}
