// @ts-check
// Autonomous agent activity engine.
//
// The platform operates a pool of real agents — each a published marketplace
// listing with its own custodial Solana (and optionally EVM) wallet. On every
// tick this engine makes those agents do real, on-chain things with one another:
// send SOL tips, pay each other for services (recorded as x402 spends), trade
// coins through the platform's own pump.fun trade engine, launch coins through
// the platform launcher, register on-chain identities, and leave marketplace
// reviews. Every event flows through the SAME real code paths a human-owned agent
// uses, so it all lands in the live money feed as genuine wallet activity — no
// synthetic rows, no fake numbers.
//
// Funds originate from a single treasury wallet the operator funds. The engine
// tops agent wallets up from the treasury just-in-time and keeps per-tick amounts
// small. Everything is gated behind CIRCULATION_ENABLED + a treasury secret; with
// neither set the engine is fully inert.

import { sql } from './db.js';
import { env } from './env.js';
import { randomUUID } from 'node:crypto';
import {
	ensureAgentWallet,
	recoverSolanaAgentKeypair,
	getOrCreateAgentEvmWallet,
	recoverAgentKey,
} from './agent-wallet.js';
import { recordCustodyEvent } from './agent-trade-guards.js';
import { solanaConnection } from './agent-pumpfun.js';
import { createSession } from './auth.js';
import { solUsdPrice } from './avatar-wallet.js';
import { CHAIN_BY_ID } from './erc8004-chains.js';
import { publicUrl as r2PublicUrl } from './r2.js';
import { pinToIPFS } from './ipfs-pin.js';
import {
	PERSONAS,
	COIN_THEMES,
	PAYMENT_SERVICES,
	REVIEW_LINES,
	OWNER_FIRST_NAMES,
	pick,
	pickTwo,
} from './circulation-personas.js';

const SOL = 1_000_000_000;

// Conservative, real economics. Every number here is small on purpose — the goal
// is a steady, believable heartbeat, not volume for its own sake.
const FEE_BUFFER = Math.floor(0.0009 * SOL); // tx fees + ATA rent headroom
const AGENT_FLOOR = Math.floor(0.02 * SOL); // top a working wallet up to this
const LAUNCH_FLOOR = Math.floor(0.034 * SOL); // pump create + tiny dev buy + fees
const TIP_MIN = Math.floor(0.001 * SOL);
const TIP_MAX = Math.floor(0.006 * SOL);
const PAY_MIN = Math.floor(0.0012 * SOL);
const PAY_MAX = Math.floor(0.01 * SOL);

const THREE_MINT = () => env.THREE_TOKEN_MINT || 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';

function clampInt(v, dflt, lo, hi) {
	const n = Number.parseInt(String(v ?? ''), 10);
	if (!Number.isFinite(n)) return dflt;
	return Math.min(hi, Math.max(lo, n));
}

export function config() {
	const enabledRaw = String(process.env.CIRCULATION_ENABLED ?? '').toLowerCase();
	return {
		enabled: enabledRaw === '1' || enabledRaw === 'true' || enabledRaw === 'yes',
		network: process.env.CIRCULATION_NETWORK === 'devnet' ? 'devnet' : 'mainnet',
		treasurySecret: (process.env.CIRCULATION_TREASURY_SECRET || '').trim(),
		evmTreasurySecret: (process.env.CIRCULATION_EVM_TREASURY_SECRET || '').trim(),
		evmChainId: clampInt(process.env.CIRCULATION_EVM_CHAIN_ID, 8453, 1, 1_000_000_000),
		poolTarget: clampInt(process.env.CIRCULATION_POOL_TARGET, 14, 2, 80),
		actionsPerTick: clampInt(process.env.CIRCULATION_ACTIONS_PER_TICK, 2, 1, 6),
		origin: env.APP_ORIGIN || 'https://three.ws',
	};
}

// A skip is an expected, recoverable non-event (treasury low, pool too small) —
// never an error. It is logged and the tick moves on.
class Skip extends Error {}

function randBetween(lo, hi) {
	return lo + Math.floor(Math.random() * Math.max(1, hi - lo));
}

// ── one-time schema guard ─────────────────────────────────────────────────────
// Self-contained so the engine works whether or not the migration has been
// applied yet. CREATE TABLE IF NOT EXISTS is idempotent and cheap.
let _ensured = false;
async function ensureSchema() {
	if (_ensured) return;
	await sql`
		create table if not exists circulation_actions (
			id                   bigserial primary key,
			kind                 text not null,
			network              text,
			actor_agent_id       uuid,
			counterparty_agent_id uuid,
			signature            text,
			amount_lamports      bigint,
			status               text not null default 'ok',
			detail               jsonb not null default '{}'::jsonb,
			created_at           timestamptz not null default now()
		)
	`;
	await sql`create index if not exists circulation_actions_created on circulation_actions(created_at desc)`;
	await sql`create index if not exists circulation_actions_kind on circulation_actions(kind, created_at desc)`;
	_ensured = true;
}

async function logAction(row) {
	try {
		await sql`
			insert into circulation_actions
				(kind, network, actor_agent_id, counterparty_agent_id, signature, amount_lamports, status, detail)
			values (
				${row.kind}, ${row.network ?? null}, ${row.actorAgentId ?? null}, ${row.counterpartyAgentId ?? null},
				${row.signature ?? null}, ${row.amountLamports != null ? String(row.amountLamports) : null},
				${row.status ?? 'ok'}, ${JSON.stringify(row.detail ?? {})}::jsonb
			)
		`;
	} catch (e) {
		console.warn('[circulation] logAction failed', e?.message);
	}
}

// `interval` is a plain Postgres interval string (e.g. '1 day', '45 minutes')
// bound as a parameter — no embedded quotes.
async function recentCount(kind, interval) {
	const [r] = await sql`
		select count(*)::int as count from circulation_actions
		where kind = ${kind} and status = 'ok' and created_at > now() - ${interval}::interval
	`;
	return r?.count ?? 0;
}

// ── treasury + low-level Solana transfer ──────────────────────────────────────

function decodeSecretKey(secret, bs58) {
	let bytes = null;
	try {
		const d = bs58.decode(secret);
		if (d.length === 64) bytes = d;
	} catch { /* not base58 */ }
	if (!bytes) {
		try {
			const b = Buffer.from(secret, 'base64');
			if (b.length === 64) bytes = b;
		} catch { /* not base64 */ }
	}
	if (!bytes) {
		try {
			const arr = JSON.parse(secret);
			if (Array.isArray(arr) && arr.length === 64) bytes = Uint8Array.from(arr);
		} catch { /* not json */ }
	}
	return bytes ? Uint8Array.from(bytes) : null;
}

async function treasuryKeypair(cfg) {
	if (!cfg.treasurySecret) throw new Skip('CIRCULATION_TREASURY_SECRET unset');
	const { Keypair } = await import('@solana/web3.js');
	const bs58 = (await import('bs58')).default;
	const bytes = decodeSecretKey(cfg.treasurySecret, bs58);
	if (!bytes) throw new Error('CIRCULATION_TREASURY_SECRET must be a 64-byte base58, base64, or JSON-array secret key');
	return Keypair.fromSecretKey(bytes);
}

async function transferSol(conn, fromKp, toAddress, lamports) {
	const {
		PublicKey,
		SystemProgram,
		TransactionMessage,
		VersionedTransaction,
		ComputeBudgetProgram,
	} = await import('@solana/web3.js');
	const toPk = new PublicKey(toAddress);
	const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
	const message = new TransactionMessage({
		payerKey: fromKp.publicKey,
		recentBlockhash: blockhash,
		instructions: [
			ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 60_000 }),
			ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000 }),
			SystemProgram.transfer({ fromPubkey: fromKp.publicKey, toPubkey: toPk, lamports }),
		],
	}).compileToV0Message();
	const tx = new VersionedTransaction(message);
	tx.sign([fromKp]);
	const signature = await conn.sendTransaction(tx, { maxRetries: 5 });
	const conf = await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
	if (conf.value?.err) throw new Error('transfer failed on-chain: ' + JSON.stringify(conf.value.err));
	return signature;
}

async function solBalance(conn, address) {
	const { PublicKey } = await import('@solana/web3.js');
	return BigInt(await conn.getBalance(new PublicKey(address), 'confirmed'));
}

// Top `agent` up to `floor` from the treasury when it is short. Returns the funding
// signature if a transfer happened, else null. Throws Skip when the treasury itself
// cannot cover the top-up — the tick records the skip and waits for a refill.
async function ensureFunded(conn, treasuryKp, agent, floor) {
	const have = await solBalance(conn, agent.address);
	if (have >= BigInt(floor)) return null;
	const need = BigInt(floor) - have + BigInt(FEE_BUFFER);
	const treasuryHave = await solBalance(conn, treasuryKp.publicKey.toBase58());
	if (treasuryHave < need + BigInt(FEE_BUFFER)) {
		throw new Skip(`treasury balance ${(Number(treasuryHave) / SOL).toFixed(4)} SOL too low to fund ${(Number(need) / SOL).toFixed(4)} SOL`);
	}
	const sig = await transferSol(conn, treasuryKp, agent.address, Number(need));
	await logAction({
		kind: 'fund',
		network: config().network,
		actorAgentId: agent.id,
		signature: sig,
		amountLamports: Number(need),
		detail: { to: agent.address, floor },
	});
	return sig;
}

// ── pool management ───────────────────────────────────────────────────────────

async function loadPool() {
	const rows = await sql`
		select id, user_id, name, avatar_id, meta
		from agent_identities
		where (meta->>'circulation') = 'true' and deleted_at is null
		order by created_at asc
	`;
	return rows
		.map((r) => ({
			id: r.id,
			userId: r.user_id,
			name: r.name,
			avatarId: r.avatar_id,
			meta: r.meta || {},
			address: r.meta?.solana_address || null,
		}))
		.filter((a) => a.address);
}

function slugify(s) {
	return String(s)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40);
}

// Claim a unique username from a base word (mirrors the forge-seed username claim).
async function claimUsername(base) {
	const existing = await sql`
		select username from users where username = ${base} or username like ${base + '%'} limit 100
	`;
	const taken = new Set(existing.map((r) => r.username));
	if (!taken.has(base)) return base;
	for (let n = 2; n <= 99; n++) {
		if (!taken.has(`${base}${n}`)) return `${base}${n}`;
	}
	return `${base}_${randomUUID().slice(0, 4)}`;
}

// Clone a random public avatar into `userId`'s ownership so the new agent has a
// real 3D body + thumbnail (reusing the platform's own generated gallery) and so
// the coin launcher can use it as the token image. Returns the new avatar id or
// null when no public avatar exists yet.
async function cloneAvatarFor(userId, name) {
	const [src] = await sql`
		select id, storage_key, thumbnail_key, size_bytes, content_type, source, tags, model_category
		from avatars
		where visibility = 'public' and deleted_at is null and storage_key is not null
		order by random()
		limit 1
	`;
	if (!src) return null;
	const slug = `${slugify(name)}-${randomUUID().slice(0, 6)}`;
	const [row] = await sql`
		insert into avatars
			(owner_id, slug, name, description, storage_key, size_bytes, content_type,
			 source, source_meta, thumbnail_key, visibility, tags, model_category, created_at, updated_at)
		values (
			${userId}, ${slug}, ${name}, ${'Operated by a three.ws agent'},
			${src.storage_key}, ${src.size_bytes ?? 0}, ${src.content_type || 'model/gltf-binary'},
			${src.source || 'import'}, ${JSON.stringify({ circulation: true, cloned_from: src.id })}::jsonb,
			${src.thumbnail_key ?? null}, 'public', ${src.tags ?? []}, ${src.model_category ?? null}, now(), now()
		)
		returning id
	`;
	return row?.id ?? null;
}

// Create exactly one new pool agent for the next unused persona. Idempotent per
// persona (a persona already represented is skipped). Returns a short descriptor
// or null when the persona set is exhausted.
async function createPoolAgent() {
	const used = await sql`
		select meta->>'persona' as persona from agent_identities
		where (meta->>'circulation') = 'true' and deleted_at is null
	`;
	const usedSet = new Set(used.map((r) => r.persona).filter(Boolean));
	const persona = PERSONAS.find((p) => !usedSet.has(p.handle));
	if (!persona) return null; // full set represented

	const ownerWord = `${pick(OWNER_FIRST_NAMES)}${persona.handle}`.replace(/[^a-z0-9]/g, '');
	const username = await claimUsername(slugify(ownerWord) || persona.handle);
	const email = `${username}@agents.three.ws`;
	const displayName = username.replace(/\d+$/, '').replace(/\b\w/g, (c) => c.toUpperCase());

	const [user] = await sql`
		insert into users (email, display_name, username, plan, email_verified, created_at, updated_at)
		values (${email}, ${displayName}, ${username}, 'free', false, now(), now())
		on conflict do nothing
		returning id
	`;
	if (!user?.id) return { skipped: 'user_conflict', persona: persona.handle };

	const avatarId = await cloneAvatarFor(user.id, persona.name).catch(() => null);

	const meta = { circulation: true, persona: persona.handle };
	const [agent] = await sql`
		insert into agent_identities
			(user_id, name, description, system_prompt, greeting, category, tags, capabilities,
			 avatar_id, is_published, published_at, meta, created_at, updated_at)
		values (
			${user.id}, ${persona.name}, ${persona.description}, ${persona.system_prompt}, ${persona.greeting},
			${persona.category}, ${persona.tags}, ${JSON.stringify({ bullets: [], skills: [], library: [] })}::jsonb,
			${avatarId}, true, now(), ${JSON.stringify(meta)}::jsonb, now(), now()
		)
		returning id
	`;
	if (!agent?.id) {
		await sql`delete from users where id = ${user.id}`.catch(() => {});
		return { skipped: 'agent_insert_failed', persona: persona.handle };
	}

	// First published version, mirroring the marketplace publish path.
	await sql`
		insert into agent_versions (agent_id, version, system_prompt, greeting, category, tags, capabilities, changelog, created_by)
		values (${agent.id}, 1, ${persona.system_prompt}, ${persona.greeting}, ${persona.category}, ${persona.tags},
		        ${JSON.stringify({ bullets: [], skills: [], library: [] })}::jsonb, 'Initial release', ${user.id})
		on conflict do nothing
	`.catch(() => {});

	// Provision the custodial Solana wallet immediately so the agent can transact.
	await ensureAgentWallet(agent.id, user.id, { reason: 'circulation_provision' }).catch((e) => {
		console.warn('[circulation] wallet provision failed', e?.message);
	});

	await logAction({ kind: 'provision', actorAgentId: agent.id, detail: { persona: persona.handle, username, avatar: !!avatarId } });
	return { created: agent.id, persona: persona.handle, username };
}

// ── helpers shared by actions ─────────────────────────────────────────────────

async function loadAgentMeta(agentId) {
	const [row] = await sql`select id, user_id, meta from agent_identities where id = ${agentId} and deleted_at is null limit 1`;
	return row || null;
}

async function senderKeypair(agent, reason) {
	const full = await loadAgentMeta(agent.id);
	const secret = full?.meta?.encrypted_solana_secret;
	if (!secret) throw new Error('agent has no custodial secret');
	return recoverSolanaAgentKeypair(secret, {
		agentId: agent.id,
		userId: agent.userId,
		reason,
		meta: { source: 'circulation' },
	});
}

// ── actions ───────────────────────────────────────────────────────────────────

// Agent A sends a real SOL tip to agent B. Recorded on B exactly like a verified
// peer tip, so it lands in the feed as an inbound tip with A as the counterparty.
async function actionTip(ctx) {
	const { conn, treasuryKp, pool, network, solUsd } = ctx;
	const [sender, receiver] = pickTwo(pool);
	if (!sender || !receiver || sender.id === receiver.id) throw new Skip('need two distinct agents');

	const amount = randBetween(TIP_MIN, TIP_MAX);
	await ensureFunded(conn, treasuryKp, sender, Math.max(AGENT_FLOOR, amount + FEE_BUFFER));

	const kp = await senderKeypair(sender, 'circulation_tip');
	const signature = await transferSol(conn, kp, receiver.address, amount);

	const usd = solUsd ? (amount / SOL) * solUsd : null;
	await recordCustodyEvent({
		agentId: receiver.id,
		userId: null,
		eventType: 'tip',
		category: 'tip',
		network,
		asset: 'SOL',
		amountLamports: amount,
		usd,
		destination: receiver.address,
		signature,
		status: 'confirmed',
		idempotencyKey: `tip:${signature}`,
		meta: { source: 'p2p_tip', from: sender.address, block_time: new Date().toISOString(), decimals: 9 },
	});

	await logAction({ kind: 'tip', network, actorAgentId: receiver.id, counterpartyAgentId: sender.id, signature, amountLamports: amount, detail: { from: sender.name, to: receiver.name } });
	return { kind: 'tip', from: sender.name, to: receiver.name, sol: amount / SOL, signature };
}

// Agent A pays agent B for a service. Real SOL transfer, recorded on the PAYER as
// an x402-category spend so it surfaces in the feed as an agent-to-agent payment.
async function actionPayment(ctx) {
	const { conn, treasuryKp, pool, network, solUsd } = ctx;
	const [payer, payee] = pickTwo(pool);
	if (!payer || !payee || payer.id === payee.id) throw new Skip('need two distinct agents');

	const amount = randBetween(PAY_MIN, PAY_MAX);
	await ensureFunded(conn, treasuryKp, payer, Math.max(AGENT_FLOOR, amount + FEE_BUFFER));

	const kp = await senderKeypair(payer, 'circulation_payment');
	const signature = await transferSol(conn, kp, payee.address, amount);

	const service = pick(PAYMENT_SERVICES);
	const usd = solUsd ? (amount / SOL) * solUsd : null;
	await recordCustodyEvent({
		agentId: payer.id,
		userId: payer.userId,
		eventType: 'spend',
		category: 'x402',
		network,
		asset: 'SOL',
		amountLamports: amount,
		usd,
		destination: payee.address,
		signature,
		status: 'confirmed',
		reason: 'a2a_payment',
		idempotencyKey: `pay:${signature}`,
		meta: { source: 'a2a_payment', service, to_agent: payee.name, to: payee.address, block_time: new Date().toISOString() },
	});

	await logAction({ kind: 'payment', network, actorAgentId: payer.id, counterpartyAgentId: payee.id, signature, amountLamports: amount, detail: { service, from: payer.name, to: payee.name } });
	return { kind: 'payment', from: payer.name, to: payee.name, service, sol: amount / SOL, signature };
}

async function pickTradableMint(network) {
	if (network === 'mainnet' && Math.random() < 0.6) return THREE_MINT();
	const rows = await sql`
		select pam.mint from pump_agent_mints pam
		join agent_identities ai on ai.id = pam.agent_id
		where pam.network = ${network} and (ai.meta->>'circulation') = 'true'
		order by pam.created_at desc
		limit 20
	`;
	if (rows.length) return pick(rows).mint;
	return network === 'mainnet' ? THREE_MINT() : null;
}

// Agent buys a small amount of a coin through the real, fully-guarded trade engine.
async function actionTrade(ctx) {
	const { conn, treasuryKp, pool, network } = ctx;
	const agent = pick(pool);
	await ensureFunded(conn, treasuryKp, agent, AGENT_FLOOR);

	const mint = await pickTradableMint(network);
	if (!mint) throw new Skip('no tradable mint available');

	const { PublicKey } = await import('@solana/web3.js');
	const { executeAgentTrade } = await import('../agents/agent-trade.js');
	const full = await loadAgentMeta(agent.id);
	if (!full) throw new Skip('agent vanished');

	const amount = Number((0.002 + Math.random() * 0.008).toFixed(5)); // 0.002–0.010 SOL
	const result = await executeAgentTrade({
		id: agent.id,
		userId: agent.userId,
		meta: full.meta,
		input: {
			side: 'buy',
			mint,
			mintPk: new PublicKey(mint),
			amount,
			isMax: false,
			slippageBps: 500,
			slippagePct: 5,
			network,
			simulate: false,
			idempotencyKey: randomUUID(),
		},
		source: 'discretionary',
	});

	if (!result.ok) throw new Skip(`trade rejected: ${result.code || 'error'}`);
	await logAction({ kind: 'trade', network, actorAgentId: agent.id, signature: result.data?.signature, amountLamports: Math.round(amount * SOL), detail: { mint, agent: agent.name } });
	return { kind: 'trade', agent: agent.name, mint, sol: amount, signature: result.data?.signature };
}

// Internal authenticated POST as a given owner (mints a short-lived session and
// passes it as the host session cookie). Used for the launcher endpoints, which
// authenticate via the session cookie.
async function postAs(origin, ownerUserId, path, body, timeoutMs = 55_000) {
	const token = await createSession({ userId: ownerUserId, userAgent: 'circulation', ip: null });
	let res;
	try {
		res = await fetch(`${origin}${path}`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: `__Host-sid=${token}`,
				'user-agent': 'threews-circulation/1.0',
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(timeoutMs),
		});
	} catch (err) {
		if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return { status: 0, body: null, timedOut: true };
		throw err;
	}
	let parsed = null;
	try { parsed = await res.json(); } catch { /* non-JSON */ }
	return { status: res.status, body: parsed };
}

// Agent launches a coin through the platform's own pump.fun launcher (build
// metadata → server-signed launch-agent). Records into pump_agent_mints, so it
// surfaces in the feed and the launch directory as a real on-chain launch.
async function actionLaunch(ctx) {
	const { conn, treasuryKp, pool, network, origin } = ctx;
	// Prefer an agent that has not launched recently.
	const recent = await sql`
		select actor_agent_id from circulation_actions
		where kind = 'launch' and created_at > now() - interval '2 days'
	`;
	const launchedSet = new Set(recent.map((r) => r.actor_agent_id));
	const candidates = pool.filter((a) => a.avatarId && !launchedSet.has(a.id));
	const agent = candidates.length ? pick(candidates) : pool.find((a) => a.avatarId);
	if (!agent) throw new Skip('no launch-ready agent (needs an avatar image)');

	await ensureFunded(conn, treasuryKp, agent, LAUNCH_FLOOR);

	const theme = pick(COIN_THEMES);
	const meta = await postAs(origin, agent.userId, '/api/pump?action=build-metadata', {
		name: theme.name,
		symbol: theme.symbol,
		description: theme.description,
		agent_id: agent.id,
		avatar_id: agent.avatarId,
	});
	if (meta.timedOut) throw new Skip('metadata build timed out');
	if (meta.status !== 200 || !meta.body?.metadata_url) {
		throw new Skip(`metadata build ${meta.status}: ${meta.body?.error || 'no url'}`);
	}

	const launch = await postAs(origin, agent.userId, '/api/pump?action=launch-agent', {
		agent_id: agent.id,
		name: theme.name,
		symbol: theme.symbol,
		uri: meta.body.metadata_url,
		network,
		quote_currency: 'sol',
		sol_buy_in: 0.001,
		buyback_bps: 0,
		coin_type: 'agent',
	});
	if (launch.timedOut) throw new Skip('launch timed out');
	if (launch.status !== 200 || !(launch.body?.mint || launch.body?.data?.mint)) {
		throw new Skip(`launch ${launch.status}: ${launch.body?.error || launch.body?.message || 'no mint'}`);
	}
	const mint = launch.body?.mint || launch.body?.data?.mint;

	await logAction({ kind: 'launch', network, actorAgentId: agent.id, signature: mint, detail: { name: theme.name, symbol: theme.symbol, mint, agent: agent.name } });
	return { kind: 'launch', agent: agent.name, name: theme.name, symbol: theme.symbol, mint };
}

// Owner of one agent leaves a real marketplace review on another agent's listing.
async function actionReview(ctx) {
	const { pool } = ctx;
	const [reviewer, target] = pickTwo(pool);
	if (!reviewer || !target || reviewer.id === target.id || reviewer.userId === target.userId) {
		throw new Skip('need two agents with distinct owners');
	}
	const rating = Math.random() < 0.75 ? 5 : 4;
	const body = pick(REVIEW_LINES);
	await sql`
		insert into agent_reviews (agent_id, user_id, rating, body)
		values (${target.id}, ${reviewer.userId}, ${rating}, ${body})
		on conflict (agent_id, user_id)
		do update set rating = excluded.rating, body = excluded.body, updated_at = now()
	`;
	await logAction({ kind: 'review', actorAgentId: reviewer.id, counterpartyAgentId: target.id, detail: { rating, target: target.name } });
	return { kind: 'review', by: reviewer.name, on: target.name, rating };
}

// Register an agent's on-chain (ERC-8004) identity. Funds the agent's EVM wallet
// for gas from the EVM treasury, pins an agent card, signs register(string), and
// confirms it through the platform's verify endpoint. Gated behind an EVM
// treasury secret — skipped cleanly when unset.
async function actionDeploy(ctx) {
	const { pool, origin, cfg } = ctx;
	if (!cfg.evmTreasurySecret) throw new Skip('EVM treasury not configured');

	const { Wallet, Contract, parseEther, formatEther } = await import('ethers');
	const { evmFallbackProvider } = await import('./evm/rpc.js');
	const chainId = cfg.evmChainId;
	const chain = CHAIN_BY_ID[chainId];
	if (!chain) throw new Skip(`unsupported EVM chain ${chainId}`);
	const registryAddr = chain.registry;

	// Pick an agent not yet registered on-chain.
	const candidates = pool.filter((a) => !a.meta?.onchain);
	const agent = candidates.length ? pick(candidates) : null;
	if (!agent) throw new Skip('all agents already deployed on-chain');

	const provider = await evmFallbackProvider(chainId);
	const treasury = new Wallet(cfg.evmTreasurySecret, provider);

	const { address: evmAddress } = await getOrCreateAgentEvmWallet(agent.id, { chainId });

	// Fund gas if the agent wallet is light.
	const bal = await provider.getBalance(evmAddress);
	const gasFloor = parseEther('0.00025');
	if (bal < gasFloor) {
		const tbal = await provider.getBalance(treasury.address);
		const topUp = gasFloor - bal;
		if (tbal < topUp + parseEther('0.0001')) throw new Skip(`EVM treasury low (${formatEther(tbal)} ETH)`);
		const fundTx = await treasury.sendTransaction({ to: evmAddress, value: topUp });
		await fundTx.wait();
	}

	// Build + pin the agent card the registry URI will resolve to.
	const card = await buildAgentCard(agent, origin);
	const pinned = await pinToIPFS(Buffer.from(JSON.stringify(card, null, 2)), 'agent.json').catch(() => null);
	const uri = pinned?.uri;
	if (!uri) throw new Skip('could not pin agent card');

	// Recover the agent's EVM key and register on-chain.
	const full = await loadAgentMeta(agent.id);
	const encKey = full?.meta?.encrypted_wallet_key;
	if (!encKey) throw new Skip('agent has no EVM key');
	const pkHex = await recoverAgentKey(encKey, { agentId: agent.id, userId: agent.userId, reason: 'circulation_deploy' });
	const signer = new Wallet(pkHex, provider);
	const registry = new Contract(
		registryAddr,
		['function register(string) returns (uint256)', 'event Registered(uint256 indexed agentId, string metadataURI, address indexed owner)'],
		signer,
	);
	const tx = await registry['register(string)'](uri);
	const receipt = await tx.wait();

	// Parse the Registered event for the assigned agent id.
	let onChainId = null;
	for (const lg of receipt.logs || []) {
		try {
			const parsed = registry.interface.parseLog(lg);
			if (parsed?.name === 'Registered') { onChainId = parsed.args[0].toString(); break; }
		} catch { /* not our event */ }
	}
	if (!onChainId) throw new Error('Registered event not found in receipt');

	// Confirm + bind through the platform endpoint (writes the on-chain index + badge).
	const confirm = await postAs(origin, agent.userId, '/api/erc8004/register-confirm', {
		chainId,
		txHash: receipt.hash,
		agentId: onChainId,
		metadataUri: uri,
		ownerAddress: evmAddress,
		agentDbId: agent.id,
	}, 30_000);
	if (confirm.status !== 200) throw new Error(`register-confirm ${confirm.status}: ${confirm.body?.error || 'failed'}`);

	await logAction({ kind: 'deploy', actorAgentId: agent.id, signature: receipt.hash, detail: { chainId, onChainId, agent: agent.name } });
	return { kind: 'deploy', agent: agent.name, chainId, onChainId, txHash: receipt.hash };
}

async function buildAgentCard(agent, origin) {
	let image = null;
	let glb = null;
	if (agent.avatarId) {
		const [av] = await sql`select storage_key, thumbnail_key from avatars where id = ${agent.avatarId} and deleted_at is null limit 1`;
		if (av?.thumbnail_key) image = r2PublicUrl(av.thumbnail_key);
		if (av?.storage_key) glb = r2PublicUrl(av.storage_key);
	}
	return {
		name: agent.name,
		description: agent.meta?.description || `${agent.name}, an autonomous agent on three.ws`,
		image: image || `${origin}/og.png`,
		url: `${origin}/agent/${agent.id}`,
		active: true,
		x402Support: true,
		services: glb ? [{ name: 'avatar', endpoint: glb, type: 'model/gltf-binary' }] : [],
	};
}

// ── tick orchestration ────────────────────────────────────────────────────────

// Choose the action mix for this tick. Launch/deploy are heavyweight and run
// solo. Everything else can batch up to actionsPerTick.
async function planActions(cfg, poolSize) {
	const plan = [];
	const launchesToday = await recentCount('launch', '1 day');
	const deploysToday = await recentCount('deploy', '1 day');
	const launchesHour = await recentCount('launch', '45 minutes');

	// Heavyweight, low-frequency, solo actions get first refusal.
	const r = Math.random();
	if (poolSize >= 2 && launchesHour === 0 && launchesToday < 8 && r < 0.14) {
		return ['launch'];
	}
	if (cfg.evmTreasurySecret && poolSize >= 1 && deploysToday < 6 && r >= 0.14 && r < 0.2) {
		return ['deploy'];
	}

	// Otherwise batch light actions.
	const weighted = [
		['tip', 50],
		['payment', 20],
		['trade', 18],
		['review', 12],
	];
	const total = weighted.reduce((s, [, w]) => s + w, 0);
	for (let i = 0; i < cfg.actionsPerTick; i++) {
		let roll = Math.random() * total;
		for (const [kind, w] of weighted) {
			roll -= w;
			if (roll <= 0) { plan.push(kind); break; }
		}
	}
	return plan;
}

const ACTIONS = {
	tip: actionTip,
	payment: actionPayment,
	trade: actionTrade,
	launch: actionLaunch,
	review: actionReview,
	deploy: actionDeploy,
};

/**
 * Run one activity tick. Safe to call on a schedule; fully inert unless enabled
 * and funded. Never throws — every failure is contained and reported.
 */
export async function runCirculationTick() {
	const cfg = config();
	if (!cfg.enabled) return { ok: true, skipped: 'disabled' };

	await ensureSchema();

	// Grow the pool one agent per tick until it reaches target.
	let pool = await loadPool();
	let grew = null;
	if (pool.length < cfg.poolTarget) {
		try {
			grew = await createPoolAgent();
			if (grew?.created) pool = await loadPool();
		} catch (e) {
			console.warn('[circulation] pool growth failed', e?.message);
		}
	}

	if (pool.length < 2) {
		return { ok: true, pool: pool.length, grew, note: 'pool warming up' };
	}

	let treasuryKp;
	try {
		treasuryKp = await treasuryKeypair(cfg);
	} catch (e) {
		if (e instanceof Skip) return { ok: true, pool: pool.length, grew, skipped: e.message };
		throw e;
	}

	const conn = solanaConnection(cfg.network);
	let solUsd = null;
	try { solUsd = await solUsdPrice(); } catch { /* usd is decoration */ }

	const ctx = { conn, treasuryKp, pool, network: cfg.network, origin: cfg.origin, solUsd, cfg };
	const plan = await planActions(cfg, pool.length);

	const results = [];
	for (const kind of plan) {
		const fn = ACTIONS[kind];
		if (!fn) continue;
		try {
			results.push({ ok: true, ...(await fn(ctx)) });
		} catch (e) {
			if (e instanceof Skip) {
				results.push({ ok: false, kind, skipped: e.message });
				await logAction({ kind, network: cfg.network, status: 'skipped', detail: { reason: e.message } });
			} else {
				console.error('[circulation] action failed', kind, e?.message);
				results.push({ ok: false, kind, error: e?.message });
				await logAction({ kind, network: cfg.network, status: 'error', detail: { error: e?.message?.slice(0, 300) } });
			}
		}
	}

	return { ok: true, pool: pool.length, grew, network: cfg.network, actions: results };
}
