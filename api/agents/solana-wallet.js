// /api/agents/:id/solana — wallet, activity, and airdrop handlers.
// Dispatched from api/agents/[id].js with the `action` sub-path.

import { getSessionUser, authenticateBearer, extractBearer } from '../_lib/auth.js';
import { sql } from '../_lib/db.js';
import { cors, json, method, error, readJson, rateLimited, serverError } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { generateSolanaAgentWallet, recoverSolanaAgentKeypair } from '../_lib/agent-wallet.js';
import { solanaConnection, solanaPublicConnection } from '../_lib/agent-pumpfun.js';
import { reverseLookupAddress } from '../../src/solana/sns.js';
import {
	Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram,
	TransactionMessage, VersionedTransaction,
} from '@solana/web3.js';
import {
	getAssociatedTokenAddressSync, createTransferCheckedInstruction,
	createAssociatedTokenAccountIdempotentInstruction, getMint,
	TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { webcrypto, randomUUID } from 'node:crypto';
import { env } from '../_lib/env.js';
import { recordEvent } from '../_lib/usage.js';
import { cacheGet, cacheSet } from '../_lib/cache.js';
import { logAudit } from '../_lib/audit.js';
import { explorerTxUrl } from '../_lib/avatar-wallet.js';
import {
	validateSolanaAddress, enforceSpendLimit, SpendLimitError, lamportsToUsd,
	getSpendLimits, setSpendLimits, listCustodyEvents, updateCustodyEvent,
	getDailySpendUsd, getTradeLimits, setTradeLimits, getDailySpendLamports,
} from '../_lib/agent-trade-guards.js';

// USDC mints per cluster — the only SPL token we can price 1:1 for the spend
// ceiling without an external quote. $THREE is the only coin; USDC is the
// payment-rail asset, not a coin we promote.
const USDC_MINT_BY_CLUSTER = {
	mainnet: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
	devnet: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
};

// SOL "max" headroom: keep the account rent-exempt and leave fee budget so a
// sweep can never brick the wallet or fail on fees.
const SOL_FEE_RESERVE_LAMPORTS = 15_000n; // ~3× a single-signature base fee
const RENT_EXEMPT_FALLBACK_LAMPORTS = 890_880n; // getMinimumBalanceForRentExemption(0)
const TOKEN_ACCOUNT_RENT_FALLBACK_LAMPORTS = 2_039_280n; // 165-byte SPL token account

const subtle = globalThis.crypto?.subtle || webcrypto.subtle;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const AIRDROP_LAMPORTS = LAMPORTS_PER_SOL;

// ── Solana RPC cache ──────────────────────────────────────────────────────────
// Keys: "sol:bal:<address>:<network>" and "sol:sigs:<address>:<network>:<limit>"
// Prevents Helius free-plan 429s on repeated wallet card polls.
//
// Backed by the shared cache adapter (Upstash Redis when configured, in-memory
// otherwise). Redis matters here: Vercel runs many serverless replicas, and a
// per-replica Map only dedupes RPC calls within one warm instance — under real
// traffic every replica still hammers the RPC. A shared 60 s window collapses
// that to at most one balance fetch per address per minute across the fleet.
const SOL_CACHE_TTL_S = 60;

// Map an RPC failure to a stable code the wallet card can render. We surface
// rate-limiting distinctly so the UI shows "Balance unavailable" instead of a
// misleading "0 SOL" when the RPC is throttled rather than the wallet empty.
function classifyBalanceError(err) {
	const msg = err?.message || '';
	const rateLimited = err?.status === 429 || /\b429\b|rate.?limit|too many|max usage/i.test(msg);
	return rateLimited ? 'rpc_rate_limited' : 'rpc_error';
}

// Calls `fn(conn)` with exponential backoff (500 ms → 1000 ms) before the
// public-RPC fallback fires. Returns { ok, value } or { ok: false, error }.
async function _solRpcWithBackoffFallback(primaryConn, fallbackConn, fn, label) {
	// Attempt 1 — primary
	try {
		return { ok: true, value: await fn(primaryConn) };
	} catch (err1) {
		const is429 =
			err1?.message?.includes('429') ||
			err1?.message?.includes('Too Many Requests') ||
			err1?.status === 429;
		console.warn(`[agents/solana] ${label} primary failed${is429 ? ' (429)' : ''}: ${err1?.message || err1}`);

		// 500 ms wait before first retry
		await new Promise((r) => setTimeout(r, 500));

		// Attempt 2 — retry primary (backoff)
		try {
			return { ok: true, value: await fn(primaryConn) };
		} catch (err2) {
			console.warn(`[agents/solana] ${label} primary retry failed: ${err2?.message || err2}`);

			// 1000 ms wait before falling back to public RPC
			await new Promise((r) => setTimeout(r, 1_000));
		}
	}

	// Attempt 3 — public fallback
	if (fallbackConn) {
		try {
			return { ok: true, value: await fn(fallbackConn) };
		} catch (err3) {
			console.error(`[agents/solana] ${label} fallback failed: ${err3?.message || err3}`);
			return { ok: false, error: err3 };
		}
	}
	return { ok: false, error: new Error(`${label}: all RPC attempts failed`) };
}

// Bonfida reverse-lookup is rate-limited and pulls a few KB per call. Memoize
// 10 minutes per-address so wallet card refreshes (every 30s) don't refetch.
const SNS_CACHE_TTL_MS = 10 * 60_000;
const _snsCache = new Map();
async function _reverseSnsCached(address) {
	const hit = _snsCache.get(address);
	if (hit && Date.now() - hit.at < SNS_CACHE_TTL_MS) return hit.value;
	let value = null;
	try { value = await reverseLookupAddress(address); } catch { value = null; }
	_snsCache.set(address, { at: Date.now(), value });
	return value;
}

async function _deriveKey() {
	const raw = new TextEncoder().encode(env.JWT_SECRET);
	const base = await subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
	return subtle.deriveKey(
		{ name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('agent-wallet-v1'), info: new Uint8Array(0) },
		base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
	);
}
async function _encryptSecret(plaintext) {
	const key = await _deriveKey();
	const iv = new Uint8Array(12);
	(globalThis.crypto || webcrypto).getRandomValues(iv);
	const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
	const buf = new Uint8Array(iv.length + ct.byteLength);
	buf.set(iv, 0); buf.set(new Uint8Array(ct), iv.length);
	return Buffer.from(buf).toString('base64');
}

async function resolveAuth(req) {
	const session = await getSessionUser(req);
	if (session) return { userId: session.id };
	const bearer = await authenticateBearer(extractBearer(req));
	if (bearer) return { userId: bearer.userId };
	return null;
}

// ── activity ──────────────────────────────────────────────────────────────────

async function handleActivity(req, res, id) {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET'])) return;

	const auth = await resolveAuth(req);
	if (!auth) return error(res, 401, 'unauthorized', 'sign in required');

	const rl = await limits.walletRead(auth.userId);
	if (!rl.success) return rateLimited(res, rl);

	const [row] = await sql`SELECT id, user_id, meta FROM agent_identities WHERE id = ${id} AND deleted_at IS NULL`;
	if (!row) return error(res, 404, 'not_found', 'agent not found');
	if (row.user_id !== auth.userId) return error(res, 403, 'forbidden', 'not your agent');

	const address = row.meta?.solana_address;
	if (!address) return error(res, 404, 'not_found', 'agent has no solana wallet');

	const url = new URL(req.url, 'http://x');
	const network = url.searchParams.get('network') === 'devnet' ? 'devnet' : 'mainnet';
	const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 50);
	const pk = new PublicKey(address);

	const primaryConn = solanaConnection(network);
	const fallbackConn = solanaPublicConnection(network);
	const sigsCacheKey = `sol:sigs:${address}:${network}:${limit}`;

	let sigs = await cacheGet(sigsCacheKey);
	if (sigs === null) {
		const sigInfos = await _solRpcWithBackoffFallback(
			primaryConn,
			fallbackConn,
			(c) => c.getSignaturesForAddress(pk, { limit }),
			'getSignaturesForAddress',
		);
		if (!sigInfos.ok) {
			console.error('[agents/solana/activity] signature fetch failed on all RPCs', sigInfos.error);
			return error(res, 502, 'rpc_error', 'failed to fetch on-chain activity');
		}
		sigs = sigInfos.value;
		await cacheSet(sigsCacheKey, sigs, SOL_CACHE_TTL_S);
	}

	// getParsedTransactions is the expensive call and the one most often rate-limited.
	// Degrade gracefully: if it fails everywhere, we still return the signature list
	// without the lamport delta / summary enrichment instead of 502-ing the whole call.
	let parsed = null;
	if (sigs.length) {
		const parsedRes = await _solRpcWithBackoffFallback(
			primaryConn,
			fallbackConn,
			(c) => c.getParsedTransactions(sigs.map((s) => s.signature), {
				maxSupportedTransactionVersion: 0,
				commitment: 'confirmed',
			}),
			'getParsedTransactions',
		);
		if (parsedRes.ok) {
			parsed = parsedRes.value;
		} else {
			console.warn('[agents/solana/activity] parsed-tx enrichment unavailable', parsedRes.error?.message);
		}
	}

	const signatures = sigs.map((s, i) => {
		const tx = parsed?.[i] ?? null;
		let lamportDelta = null;
		let summary = null;
		if (tx?.meta && tx?.transaction) {
			const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey?.toString());
			const idx = keys.indexOf(address);
			if (idx >= 0 && tx.meta.preBalances && tx.meta.postBalances) {
				lamportDelta = tx.meta.postBalances[idx] - tx.meta.preBalances[idx];
			}
			const ix = tx.transaction.message.instructions?.[0];
			if (ix?.parsed?.type) summary = ix.parsed.type;
			else if (ix?.programId) summary = `program ${ix.programId.toString().slice(0, 6)}…`;
		}
		return {
			signature: s.signature,
			slot: s.slot,
			block_time: s.blockTime ?? null,
			success: !s.err && !tx?.meta?.err,
			error: s.err || tx?.meta?.err || null,
			lamport_delta: lamportDelta,
			sol_delta: lamportDelta == null ? null : lamportDelta / 1e9,
			summary,
		};
	});

	return json(res, 200, {
		data: { address, network, signatures, parsed_available: parsed !== null },
	});
}

// ── airdrop ───────────────────────────────────────────────────────────────────

async function handleAirdrop(req, res, id) {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;

	const auth = await resolveAuth(req);
	if (!auth) return error(res, 401, 'unauthorized', 'sign in required');

	const rl = await limits.authIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const [row] = await sql`SELECT id, user_id, meta FROM agent_identities WHERE id = ${id} AND deleted_at IS NULL`;
	if (!row) return error(res, 404, 'not_found', 'agent not found');
	if (row.user_id !== auth.userId) return error(res, 403, 'forbidden', 'not your agent');

	const address = row.meta?.solana_address;
	if (!address) return error(res, 404, 'not_found', 'agent has no solana wallet');

	let signature;
	try {
		const conn = solanaConnection('devnet');
		signature = await conn.requestAirdrop(new PublicKey(address), AIRDROP_LAMPORTS);
		await conn.confirmTransaction(signature, 'confirmed');
	} catch (err) {
		console.error('[agents/solana/airdrop] failed', err);
		return error(res, 502, 'faucet_unavailable',
			err?.message?.includes('429') || err?.message?.includes('limit')
				? 'Devnet faucet is rate-limited — try again in a minute.'
				: `Devnet airdrop failed: ${err?.message || 'unknown'}`);
	}

	recordEvent({ userId: auth.userId, agentId: id, kind: 'solana_airdrop', tool: 'devnet', status: 'ok', meta: { address, signature, lamports: AIRDROP_LAMPORTS } });
	return json(res, 200, { data: { signature, address, network: 'devnet', lamports: AIRDROP_LAMPORTS, sol: AIRDROP_LAMPORTS / 1e9 } });
}

// ── public wallet read ─────────────────────────────────────────────────────────
// GET /api/agents/:id/solana — no auth required. Returns wallet address + balance
// so external services (explorers, dashboards, other agents) can look up an
// agent's on-chain identity without a session. Write operations (POST, DELETE)
// still require owner auth — see handleWallet below.

async function handlePublicWalletRead(req, res, id) {
	const url = new URL(req.url, 'http://x');
	const network = (url.searchParams.get('network') || 'mainnet').toString();
	const net = network === 'devnet' ? 'devnet' : 'mainnet';

	const [row] = await sql`SELECT id, meta FROM agent_identities WHERE id = ${id} AND deleted_at IS NULL`;
	if (!row) return error(res, 404, 'not_found', 'agent not found');

	const address = row.meta?.solana_address ?? null;
	if (!address) {
		return json(res, 200, {
			data: {
				agentId: id,
				wallet: null,
				balance: null,
				chain: 'solana',
			},
		});
	}

	let lamports = null;
	let balanceError = null;
	const balCacheKey = `sol:bal:${address}:${net}`;
	const cached = await cacheGet(balCacheKey);
	if (cached !== null) {
		lamports = cached;
	} else {
		const balResult = await _solRpcWithBackoffFallback(
			solanaConnection(net),
			solanaPublicConnection(net),
			(c) => c.getBalance(new PublicKey(address)),
			'getBalance',
		);
		if (balResult.ok) {
			lamports = balResult.value;
			await cacheSet(balCacheKey, lamports, SOL_CACHE_TTL_S);
		} else {
			balanceError = classifyBalanceError(balResult.error);
		}
	}

	console.info(`[agents/solana] public read agentId=${id} address=${address} net=${net} lamports=${lamports}${balanceError ? ` balance_error=${balanceError}` : ''}`);
	return json(res, 200, {
		data: {
			agentId: id,
			wallet: address,
			balance: lamports == null ? null : lamports / 1e9,
			chain: 'solana',
			network: net,
			lamports,
			...(balanceError ? { balance_error: balanceError } : {}),
		},
	});
}

// ── wallet ────────────────────────────────────────────────────────────────────

async function handleWallet(req, res, id) {
	if (cors(req, res, { methods: 'GET,POST,DELETE,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET', 'POST', 'DELETE'])) return;

	const auth = await resolveAuth(req);

	// Unauthenticated GET: serve public wallet info without requiring sign-in.
	// Write operations (POST, DELETE) still require owner auth below.
	if (req.method === 'GET' && !auth) return handlePublicWalletRead(req, res, id);

	if (!auth) return error(res, 401, 'unauthorized', 'sign in required');

	const rl = req.method === 'GET'
		? await limits.walletRead(auth.userId)
		: await limits.authIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const [row] = await sql`SELECT id, user_id, meta FROM agent_identities WHERE id = ${id} AND deleted_at IS NULL`;
	if (!row) return error(res, 404, 'not_found', 'agent not found');
	if (row.user_id !== auth.userId) return error(res, 403, 'forbidden', 'not your agent');

	let meta = { ...(row.meta || {}) };

	if (req.method === 'DELETE') {
		delete meta.solana_address;
		delete meta.encrypted_solana_secret;
		delete meta.solana_vanity_prefix;
		delete meta.solana_vanity_suffix;
		delete meta.solana_wallet_source;
		await sql`UPDATE agent_identities SET meta = ${JSON.stringify(meta)}::jsonb WHERE id = ${id}`;
		return json(res, 200, { data: { ok: true } });
	}

	if (req.method === 'POST') {
		const body = await readJson(req).catch(() => ({}));
		const importing = body && (body.secret_key || body.vanity_prefix || body.vanity_suffix);

		if (importing) {
			const sk = body.secret_key;
			if (!Array.isArray(sk) || sk.length !== 64 || !sk.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
				return error(res, 400, 'validation_error', 'secret_key must be a 64-byte number array');
			}
			let kp;
			try { kp = Keypair.fromSecretKey(Uint8Array.from(sk)); }
			catch { return error(res, 400, 'validation_error', 'secret_key did not parse as a valid Solana keypair'); }
			const address = kp.publicKey.toBase58();
			if (body.vanity_prefix) {
				if (!BASE58_RE.test(body.vanity_prefix) || body.vanity_prefix.length > 6) return error(res, 400, 'validation_error', 'vanity_prefix is not valid base58 (max 6 chars)');
				if (!address.startsWith(body.vanity_prefix)) return error(res, 400, 'validation_error', 'vanity_prefix does not match the keypair address');
			}
			if (body.vanity_suffix) {
				if (!BASE58_RE.test(body.vanity_suffix) || body.vanity_suffix.length > 6) return error(res, 400, 'validation_error', 'vanity_suffix is not valid base58 (max 6 chars)');
				if (!address.endsWith(body.vanity_suffix)) return error(res, 400, 'validation_error', 'vanity_suffix does not match the keypair address');
			}
			if (meta.solana_address) return error(res, 409, 'conflict', 'agent already has a Solana wallet — DELETE /api/agents/:id/solana first to replace');
			const encrypted_secret = await _encryptSecret(Buffer.from(kp.secretKey).toString('base64'));
			meta = {
				...meta,
				solana_address: address,
				encrypted_solana_secret: encrypted_secret,
				solana_wallet_source: 'imported_vanity',
				...(body.vanity_prefix ? { solana_vanity_prefix: body.vanity_prefix } : {}),
				...(body.vanity_suffix ? { solana_vanity_suffix: body.vanity_suffix } : {}),
			};
			await sql`UPDATE agent_identities SET meta = ${JSON.stringify(meta)}::jsonb WHERE id = ${id}`;
		} else if (!meta.solana_address) {
			const sol = await generateSolanaAgentWallet();
			meta = { ...meta, solana_address: sol.address, encrypted_solana_secret: sol.encrypted_secret, solana_wallet_source: 'generated' };
			await sql`UPDATE agent_identities SET meta = ${JSON.stringify(meta)}::jsonb WHERE id = ${id}`;
		}
	}

	if (!meta.solana_address) return error(res, 404, 'not_found', 'agent has no solana wallet — POST to provision');

	const network = (req.query?.network || new URL(req.url, 'http://x').searchParams.get('network') || 'mainnet').toString();
	const net = network === 'devnet' ? 'devnet' : 'mainnet';
	const balCacheKey = `sol:bal:${meta.solana_address}:${net}`;
	let lamports = await cacheGet(balCacheKey);
	let balanceError = null;
	if (lamports === null) {
		const balResult = await _solRpcWithBackoffFallback(
			solanaConnection(net),
			solanaPublicConnection(net),
			(c) => c.getBalance(new PublicKey(meta.solana_address)),
			'getBalance',
		);
		if (balResult.ok) {
			lamports = balResult.value;
			await cacheSet(balCacheKey, lamports, SOL_CACHE_TTL_S);
		} else {
			balanceError = classifyBalanceError(balResult.error);
		}
	}

	// SNS is mainnet-only. Skip the lookup on devnet — it always returns null
	// and just burns a network round-trip. Prefer the user's manually-attached
	// SNS id (meta.sns_domain) over the on-chain favorite so the wallet card
	// matches whatever they picked on the SNS dashboard.
	const attachedSns = meta.sns_domain ? `${meta.sns_domain}.sol` : null;
	const favoriteSns = net === 'mainnet' && !attachedSns
		? await _reverseSnsCached(meta.solana_address)
		: null;

	return json(res, req.method === 'POST' ? 201 : 200, {
		data: {
			address: meta.solana_address,
			network,
			lamports,
			sol: lamports == null ? null : lamports / 1e9,
			...(balanceError ? { balance_error: balanceError } : {}),
			vanity_prefix: meta.solana_vanity_prefix || null,
			vanity_suffix: meta.solana_vanity_suffix || null,
			source: meta.solana_wallet_source || (meta.encrypted_solana_secret ? 'generated' : null),
			sns_domain: attachedSns || favoriteSns,
			sns_source: attachedSns ? 'attached' : (favoriteSns ? 'favorite' : null),
		},
	});
}

// ── owner gate ──────────────────────────────────────────────────────────────
// Shared loader for the owner-only custody handlers: auth → load agent → verify
// ownership → return the custodial wallet's address + encrypted secret + meta.
// Returns { error } (already-shaped) on any failure so callers can early-return.
async function loadOwnedWallet(req, res, id) {
	const auth = await resolveAuth(req);
	if (!auth) { error(res, 401, 'unauthorized', 'sign in required'); return { error: true }; }

	const [row] = await sql`SELECT id, user_id, meta FROM agent_identities WHERE id = ${id} AND deleted_at IS NULL`;
	if (!row) { error(res, 404, 'not_found', 'agent not found'); return { error: true }; }
	if (row.user_id !== auth.userId) { error(res, 403, 'forbidden', 'not your agent'); return { error: true }; }

	const meta = { ...(row.meta || {}) };
	return { auth, meta, address: meta.solana_address || null, encryptedSecret: meta.encrypted_solana_secret || null };
}

// ── withdraw / sweep ──────────────────────────────────────────────────────────
// POST /api/agents/:id/solana/withdraw   (also aliased at /api/agents/:id/wallet/withdraw)
// Owner-authenticated. Sweeps SOL or a held SPL token from the agent's custodial
// wallet to an owner-chosen address, signed server-side. Idempotent, governed by
// the shared spend policy, rent + fee reserved on a SOL "max".
async function handleWithdraw(req, res, id) {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;

	const owned = await loadOwnedWallet(req, res, id);
	if (owned.error) return;
	const { auth, meta, address: fromAddress, encryptedSecret } = owned;

	// Owner-only daily withdraw cap + per-IP burst guard.
	const rlUser = await limits.withdrawalPerUser(auth.userId);
	if (!rlUser.success) return rateLimited(res, rlUser);
	const rlIp = await limits.authIp(clientIp(req));
	if (!rlIp.success) return rateLimited(res, rlIp);

	if (!fromAddress || !encryptedSecret) {
		return error(res, 404, 'not_found', 'agent has no solana wallet to withdraw from');
	}

	let body;
	try {
		body = await readJson(req);
	} catch (e) {
		return error(res, e?.status === 415 ? 415 : 400, 'bad_request', e?.message || 'invalid request body');
	}

	const network = body.network === 'devnet' ? 'devnet' : 'mainnet';
	const asset = typeof body.asset === 'string' && body.asset.trim() ? body.asset.trim() : 'SOL';
	const simulate = body.simulate === true;
	const idempotencyKey =
		typeof body.idempotency_key === 'string' && body.idempotency_key.trim()
			? body.idempotency_key.trim().slice(0, 128)
			: randomUUID();

	// 1. Validate destination — base58, on-curve, not the wallet itself.
	const dest = validateSolanaAddress(body.destination);
	if (!dest.valid) {
		return error(res, 400, 'invalid_destination', `destination is not a valid Solana address (${dest.reason})`);
	}
	if (!dest.onCurve) {
		return error(res, 400, 'invalid_destination', 'destination is a program address (off-curve) — funds sent there may be unrecoverable');
	}
	if (dest.base58 === fromAddress) {
		return error(res, 400, 'invalid_destination', 'destination is the agent wallet itself');
	}

	const isMax = body.amount === 'max' || body.amount === 'MAX';
	const amountNum = isMax ? null : Number(body.amount);
	if (!isMax && (!Number.isFinite(amountNum) || amountNum <= 0)) {
		return error(res, 400, 'invalid_amount', 'amount must be a positive number or "max"');
	}

	// 2. Fast-path idempotency check — a retry of a finished/in-flight withdraw.
	{
		const [existing] = await sql`
			SELECT id, status, signature FROM agent_custody_events
			WHERE agent_id = ${id} AND idempotency_key = ${idempotencyKey}
		`;
		if (existing) {
			if (existing.status === 'confirmed') {
				return json(res, 200, { data: { replayed: true, signature: existing.signature, explorer: explorerTxUrl(existing.signature, network), network } });
			}
			if (existing.status === 'pending') {
				return error(res, 409, 'withdrawal_in_progress', 'a withdrawal with this id is already in flight — check the audit log before retrying', { signature: existing.signature || null });
			}
			return error(res, 409, 'withdrawal_failed', 'this withdrawal id already failed — retry with a fresh idempotency key', { signature: existing.signature || null });
		}
	}

	const conn = solanaConnection(network);
	const fromPk = new PublicKey(fromAddress);

	let lamports = null;       // SOL amount being sent (lamports) — null for SPL
	let amountRaw = null;      // SPL token base units — null for SOL
	let decimals = 9;
	let humanAmount = null;
	let usdValue = null;
	let priceNote = null;
	let tokenProgramId = null;
	let mintPk = null;
	let sourceAta = null;
	let destAta = null;
	let destAtaExists = true;

	let balanceLamports;
	try {
		balanceLamports = BigInt(await conn.getBalance(fromPk, 'confirmed'));
	} catch (e) {
		return error(res, 502, 'rpc_error', 'could not read the wallet balance — try again');
	}

	if (asset === 'SOL') {
		let rentReserve;
		try {
			rentReserve = BigInt(await conn.getMinimumBalanceForRentExemption(0));
		} catch {
			rentReserve = RENT_EXEMPT_FALLBACK_LAMPORTS;
		}
		if (isMax) {
			const spendable = balanceLamports - rentReserve - SOL_FEE_RESERVE_LAMPORTS;
			if (spendable <= 0n) {
				return error(res, 400, 'insufficient_balance', 'not enough SOL to withdraw after reserving rent and network fees');
			}
			lamports = spendable;
		} else {
			lamports = BigInt(Math.round(amountNum * 1e9));
			if (lamports <= 0n) return error(res, 400, 'invalid_amount', 'amount rounds to zero lamports');
			if (balanceLamports - lamports < rentReserve + SOL_FEE_RESERVE_LAMPORTS) {
				return error(res, 400, 'insufficient_balance', 'amount leaves too little SOL to cover rent and network fees — lower it or use "max"');
			}
		}
		humanAmount = Number(lamports) / 1e9;
		try {
			usdValue = await lamportsToUsd(lamports);
		} catch {
			usdValue = null;
			priceNote = 'sol_price_unavailable';
		}
	} else {
		// SPL token — resolve the mint, its token program, decimals, and balances.
		const mintCheck = validateSolanaAddress(asset);
		if (!mintCheck.valid) return error(res, 400, 'invalid_asset', 'asset must be "SOL" or a valid SPL mint address');
		mintPk = mintCheck.pubkey;

		let mintAcc;
		try {
			mintAcc = await conn.getAccountInfo(mintPk);
		} catch {
			mintAcc = null;
		}
		if (!mintAcc) return error(res, 400, 'invalid_asset', 'token mint not found on this network');
		tokenProgramId = mintAcc.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

		let mintInfo;
		try {
			mintInfo = await getMint(conn, mintPk, 'confirmed', tokenProgramId);
		} catch {
			return error(res, 400, 'invalid_asset', 'could not read the token mint');
		}
		decimals = mintInfo.decimals;

		sourceAta = getAssociatedTokenAddressSync(mintPk, fromPk, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
		let tokenBalRaw;
		try {
			const bal = await conn.getTokenAccountBalance(sourceAta);
			tokenBalRaw = BigInt(bal.value.amount);
		} catch {
			return error(res, 400, 'insufficient_balance', 'the agent holds none of this token');
		}
		if (tokenBalRaw <= 0n) return error(res, 400, 'insufficient_balance', 'the agent holds none of this token');

		amountRaw = isMax ? tokenBalRaw : BigInt(Math.round(amountNum * 10 ** decimals));
		if (amountRaw <= 0n) return error(res, 400, 'invalid_amount', 'amount rounds to zero token units');
		if (amountRaw > tokenBalRaw) return error(res, 400, 'insufficient_balance', 'amount exceeds the agent token balance');
		humanAmount = Number(amountRaw) / 10 ** decimals;

		// The agent pays the network fee and (if needed) rent to open the
		// recipient's token account. Make sure it holds enough SOL.
		destAta = getAssociatedTokenAddressSync(mintPk, dest.pubkey, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
		let destInfo;
		try {
			destInfo = await conn.getAccountInfo(destAta);
		} catch {
			destInfo = null;
		}
		destAtaExists = !!destInfo;
		let ataRent = 0n;
		if (!destAtaExists) {
			try {
				ataRent = BigInt(await conn.getMinimumBalanceForRentExemption(165));
			} catch {
				ataRent = TOKEN_ACCOUNT_RENT_FALLBACK_LAMPORTS;
			}
		}
		if (balanceLamports < SOL_FEE_RESERVE_LAMPORTS + ataRent) {
			return error(res, 400, 'insufficient_sol_for_fees', 'the agent needs a little SOL to pay the network fee' + (destAtaExists ? '' : ' and open the recipient token account'));
		}

		// Only USDC is priced 1:1 for the USD ceiling; other SPL tokens are
		// governed by the withdraw allowlist (see agent-trade-guards.js header).
		if (mintPk.toBase58() === USDC_MINT_BY_CLUSTER[network]) {
			usdValue = humanAmount;
		} else {
			usdValue = null;
			priceNote = 'spl_unpriced_allowlist_only';
		}
	}

	// 3. Enforce the shared spend policy (allowlist + per-tx + daily ceiling).
	try {
		await enforceSpendLimit({ agentId: id, meta, category: 'withdraw', usdValue, destination: dest.base58, network });
	} catch (e) {
		if (e instanceof SpendLimitError) {
			return error(res, e.status, e.code, e.message, { detail: e.detail });
		}
		console.error('[withdraw] spend-limit check failed', e?.message);
		return error(res, 502, 'limit_check_failed', 'could not verify the agent spend limits — try again');
	}

	// 4. Build the (unsigned) transaction.
	let blockhashCtx;
	try {
		blockhashCtx = await conn.getLatestBlockhash('confirmed');
	} catch {
		return error(res, 502, 'rpc_error', 'could not fetch a recent blockhash — try again');
	}
	const ixs = [];
	if (asset === 'SOL') {
		ixs.push(SystemProgram.transfer({ fromPubkey: fromPk, toPubkey: dest.pubkey, lamports: lamports }));
	} else {
		if (!destAtaExists) {
			ixs.push(createAssociatedTokenAccountIdempotentInstruction(
				fromPk, destAta, dest.pubkey, mintPk, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID,
			));
		}
		ixs.push(createTransferCheckedInstruction(
			sourceAta, mintPk, destAta, fromPk, amountRaw, decimals, [], tokenProgramId,
		));
	}
	const message = new TransactionMessage({
		payerKey: fromPk,
		recentBlockhash: blockhashCtx.blockhash,
		instructions: ixs,
	}).compileToV0Message();
	const vtx = new VersionedTransaction(message);

	// 5. Simulate-only path — never touches the key, never sends, never records.
	if (simulate) {
		let sim;
		try {
			sim = await conn.simulateTransaction(vtx, { sigVerify: false, replaceRecentBlockhash: true });
		} catch (e) {
			console.error('[agents/solana-wallet] simulation failed', e?.message);
			return serverError(res, 502, 'simulation_failed', e);
		}
		return json(res, 200, {
			data: {
				simulated: true, asset, network, destination: dest.base58,
				amount: humanAmount, lamports: lamports != null ? String(lamports) : null,
				amount_raw: amountRaw != null ? String(amountRaw) : null,
				usd: usdValue, note: priceNote,
				err: sim.value?.err ?? null, units_consumed: sim.value?.unitsConsumed ?? null,
				logs: sim.value?.logs ?? null,
			},
		});
	}

	// 6. Claim the idempotency slot — this row is also the spend-ledger entry.
	const claim = await sql`
		INSERT INTO agent_custody_events
			(agent_id, user_id, event_type, category, network, asset,
			 amount_lamports, amount_raw, usd, destination, status, idempotency_key, meta)
		VALUES (
			${id}, ${auth.userId}, 'spend', 'withdraw', ${network}, ${asset},
			${lamports != null ? String(lamports) : null},
			${amountRaw != null ? String(amountRaw) : null},
			${usdValue ?? null}, ${dest.base58}, 'pending', ${idempotencyKey},
			${JSON.stringify({ human_amount: humanAmount, note: priceNote })}::jsonb
		)
		ON CONFLICT (agent_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
		RETURNING id
	`;
	if (!claim.length) {
		// Lost the race to a concurrent identical request — defer to it.
		return error(res, 409, 'withdrawal_in_progress', 'a withdrawal with this id is already in flight — check the audit log before retrying');
	}
	const claimId = claim[0].id;

	// 7. Recover the key (audit-logged) and sign.
	let keypair;
	try {
		keypair = await recoverSolanaAgentKeypair(encryptedSecret, {
			agentId: id, userId: auth.userId, reason: 'withdraw',
			meta: { asset, destination: dest.base58, network, custody_event_id: claimId },
		});
	} catch (e) {
		await updateCustodyEvent(claimId, { status: 'failed', meta: { error: 'key_recover_failed' } }).catch(() => {});
		console.error('[withdraw] key recovery failed', e?.message);
		return error(res, 500, 'key_recover_failed', 'could not access the agent wallet key — no funds were moved');
	}
	vtx.sign([keypair]);

	// 8. Submit + confirm. On an ambiguous confirm (timeout) re-check the chain
	// before deciding — never mark failed if the tx may have landed.
	let signature;
	try {
		signature = await conn.sendRawTransaction(vtx.serialize(), { skipPreflight: false, maxRetries: 3 });
	} catch (e) {
		await updateCustodyEvent(claimId, { status: 'failed', meta: { error: 'send_failed', message: e?.message?.slice(0, 200) } }).catch(() => {});
		logAudit({ userId: auth.userId, action: 'custody.withdraw_failed', resourceId: id, meta: { asset, destination: dest.base58, reason: 'send_failed' }, req });
		return error(res, 502, 'send_failed', 'the withdrawal could not be submitted and no funds were transferred — try again');
	}

	let confirmed = true;
	try {
		const r = await conn.confirmTransaction(
			{ signature, blockhash: blockhashCtx.blockhash, lastValidBlockHeight: blockhashCtx.lastValidBlockHeight },
			'confirmed',
		);
		if (r?.value?.err) confirmed = false;
	} catch {
		// Confirmation timed out — re-check the signature status directly.
		try {
			const st = await conn.getSignatureStatus(signature, { searchTransactionHistory: true });
			const s = st?.value?.confirmationStatus;
			confirmed = !st?.value?.err && (s === 'confirmed' || s === 'finalized');
		} catch {
			confirmed = false;
		}
	}

	if (!confirmed) {
		// Submitted but not provably confirmed. Leave the row 'pending' (NOT
		// failed) so a same-key retry returns in_progress instead of double-
		// sending; hand the user the signature to verify on-chain.
		await updateCustodyEvent(claimId, { signature, meta: { confirm: 'unconfirmed' } }).catch(() => {});
		logAudit({ userId: auth.userId, action: 'custody.withdraw_unconfirmed', resourceId: id, meta: { asset, destination: dest.base58, signature }, req });
		return error(res, 202, 'withdrawal_unconfirmed', 'the withdrawal was submitted but not yet confirmed — check the explorer link before retrying', { signature, explorer: explorerTxUrl(signature, network) });
	}

	await updateCustodyEvent(claimId, { status: 'confirmed', signature }).catch(() => {});
	logAudit({ userId: auth.userId, action: 'custody.withdraw', resourceId: id, meta: { asset, destination: dest.base58, amount: humanAmount, usd: usdValue, signature, network }, req });

	// Invalidate the cached balance so the wallet card reflects the sweep at once.
	await cacheSet(`sol:bal:${fromAddress}:${network}`, null, 1).catch(() => {});

	// 9. Re-read balances for the response.
	let newSol = null;
	try {
		newSol = (await conn.getBalance(fromPk, 'confirmed')) / 1e9;
	} catch { /* best-effort */ }
	let newTokenBalance = null;
	if (asset !== 'SOL' && sourceAta) {
		try {
			const b = await conn.getTokenAccountBalance(sourceAta);
			newTokenBalance = b?.value?.uiAmount ?? null;
		} catch { /* ATA may now be empty/closed */ }
	}

	return json(res, 200, {
		data: {
			replayed: false,
			signature,
			explorer: explorerTxUrl(signature, network),
			asset, network, destination: dest.base58,
			amount: humanAmount,
			lamports: lamports != null ? String(lamports) : null,
			amount_raw: amountRaw != null ? String(amountRaw) : null,
			usd: usdValue,
			note: priceNote,
			new_balance_sol: newSol,
			new_token_balance: newTokenBalance,
		},
	});
}

// ── holdings ────────────────────────────────────────────────────────────────
// GET /api/agents/:id/solana/holdings — owner-only list of withdrawable assets
// (SOL + every SPL token the wallet holds with a non-zero balance). Powers the
// Withdraw tab's asset picker so it only ever offers real holdings.
async function handleHoldings(req, res, id) {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET'])) return;

	// Token balances are public on-chain data, so the holdings list is readable by
	// owner and visitor alike (the wallet hub's Trade tab shows a read-only holdings
	// view to visitors). Only the owner ever gets management actions, which live on
	// other endpoints. The owner path is unchanged; visitors get an IP-keyed read.
	const auth = await resolveAuth(req);
	const [row] = await sql`SELECT id, user_id, meta FROM agent_identities WHERE id = ${id} AND deleted_at IS NULL`;
	if (!row) return error(res, 404, 'not_found', 'agent not found');
	const isOwner = !!(auth && row.user_id === auth.userId);
	const address = row.meta?.solana_address || null;

	const rl = await limits.walletRead(isOwner ? auth.userId : clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	if (!address) return error(res, 404, 'not_found', 'agent has no solana wallet');

	const url = new URL(req.url, 'http://x');
	const network = url.searchParams.get('network') === 'devnet' ? 'devnet' : 'mainnet';
	const conn = solanaConnection(network);
	const owner = new PublicKey(address);

	let sol = null;
	try {
		sol = (await conn.getBalance(owner, 'confirmed')) / 1e9;
	} catch {
		return error(res, 502, 'rpc_error', 'could not read the wallet balance — try again');
	}

	const tokens = [];
	const usdcMint = USDC_MINT_BY_CLUSTER[network];
	for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
		let resp;
		try {
			resp = await conn.getParsedTokenAccountsByOwner(owner, { programId });
		} catch {
			continue; // one token program failing shouldn't blank the whole list
		}
		for (const { account } of resp.value) {
			const info = account.data?.parsed?.info;
			const amt = info?.tokenAmount;
			if (!info || !amt || !(Number(amt.uiAmount) > 0)) continue;
			tokens.push({
				mint: info.mint,
				ui_amount: amt.uiAmount,
				amount_raw: amt.amount,
				decimals: amt.decimals,
				token_program: programId.toBase58(),
				is_usdc: info.mint === usdcMint,
			});
		}
	}
	tokens.sort((a, b) => Number(b.ui_amount) - Number(a.ui_amount));

	return json(res, 200, { data: { address, network, sol, tokens, is_owner: isOwner } });
}

// ── custody audit trail ───────────────────────────────────────────────────────
// GET /api/agents/:id/solana/custody — owner-only feed of sensitive custody
// events (key recovery, withdraws, spends, limit changes) for this agent wallet.
async function handleCustody(req, res, id) {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET'])) return;

	const owned = await loadOwnedWallet(req, res, id);
	if (owned.error) return;
	const { auth } = owned;

	const rl = await limits.auditLogRead(auth.userId);
	if (!rl.success) return rateLimited(res, rl);

	const url = new URL(req.url, 'http://x');
	const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
	const beforeRaw = url.searchParams.get('before');
	const beforeId = beforeRaw && /^\d+$/.test(beforeRaw) ? beforeRaw : null;
	const network = url.searchParams.get('network') === 'devnet' ? 'devnet' : url.searchParams.get('network') === 'mainnet' ? 'mainnet' : null;
	// Optional category filter (e.g. 'x402') so a caller can read just the spends
	// of one kind — the Pay tab reads its own x402 payment activity this way.
	const categoryRaw = url.searchParams.get('category');
	const category = categoryRaw && /^[a-z0-9_]{1,32}$/i.test(categoryRaw) ? categoryRaw : null;

	const events = await listCustodyEvents(id, { limit, beforeId, network, category });
	const items = events.map((e) => ({
		id: String(e.id),
		event_type: e.event_type,
		category: e.category,
		network: e.network,
		asset: e.asset,
		amount_lamports: e.amount_lamports != null ? String(e.amount_lamports) : null,
		amount_raw: e.amount_raw != null ? String(e.amount_raw) : null,
		usd: e.usd != null ? Number(e.usd) : null,
		destination: e.destination,
		signature: e.signature,
		explorer: e.signature ? explorerTxUrl(e.signature, e.network) : null,
		reason: e.reason,
		status: e.status,
		created_at: e.created_at,
		// meta carries the x402 service/url + resource for the payment activity
		// row; this endpoint is ownership-gated so it's owner-only data already.
		meta: e.meta && typeof e.meta === 'object' ? e.meta : null,
	}));
	const nextCursor = items.length === limit ? items[items.length - 1].id : null;
	return json(res, 200, { data: { items, next_cursor: nextCursor } });
}

// ── spend limits ────────────────────────────────────────────────────────────
// GET/PUT /api/agents/:id/solana/limits — owner-only read + edit of the shared
// per-agent spend policy. Includes today's spend so the hub can show headroom.
async function handleLimits(req, res, id) {
	if (cors(req, res, { methods: 'GET,PUT,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET', 'PUT'])) return;

	const owned = await loadOwnedWallet(req, res, id);
	if (owned.error) return;
	const { auth, meta } = owned;

	const rl = await limits.walletRead(auth.userId);
	if (!rl.success) return rateLimited(res, rl);

	const url = new URL(req.url, 'http://x');
	const network = url.searchParams.get('network') === 'devnet' ? 'devnet' : 'mainnet';

	if (req.method === 'PUT') {
		let body;
		try {
			body = await readJson(req);
		} catch (e) {
			return error(res, e?.status === 415 ? 415 : 400, 'bad_request', e?.message || 'invalid request body');
		}
		// Validate allowlist entries up-front so the user gets a clear rejection
		// instead of silent dropping inside normalizeSpendLimits.
		if (Array.isArray(body.withdraw_allowlist)) {
			const bad = body.withdraw_allowlist.find((a) => !validateSolanaAddress(a).valid);
			if (bad !== undefined) return error(res, 400, 'invalid_address', `withdraw_allowlist contains an invalid Solana address: ${String(bad).slice(0, 60)}`);
		}
		// The USD spend policy and the lamports-denominated trade policy share this
		// owner surface. A PUT may patch either or both: a `trade_limits` object
		// updates the discretionary-trade caps (per-trade SOL, daily budget, breaker,
		// kill switch); the top-level USD/allowlist keys update the spend policy.
		const wantsSpend = ['daily_usd', 'per_tx_usd', 'withdraw_allowlist'].some((k) => k in body);
		let limitsOut = getSpendLimits(meta);
		let tradeLimitsOut = getTradeLimits(meta);
		try {
			if (wantsSpend) limitsOut = await setSpendLimits(id, auth.userId, body, { req });
			if (body.trade_limits && typeof body.trade_limits === 'object') {
				tradeLimitsOut = await setTradeLimits(id, auth.userId, body.trade_limits, { req });
			}
		} catch (e) {
			if (e?.status) return error(res, e.status, e.code || 'error', e.message);
			throw e;
		}
		const spentUsd = await getDailySpendUsd(id, network).catch(() => 0);
		const spentLamports = await getDailySpendLamports(id, network).catch(() => 0n);
		return json(res, 200, { data: { limits: limitsOut, trade_limits: tradeLimitsOut, spent_today_usd: spentUsd, spent_today_sol: Number(spentLamports) / 1e9 } });
	}

	const limitsOut = getSpendLimits(meta);
	const spentUsd = await getDailySpendUsd(id, network).catch(() => 0);
	const spentLamports = await getDailySpendLamports(id, network).catch(() => 0n);
	return json(res, 200, { data: { limits: limitsOut, trade_limits: getTradeLimits(meta), spent_today_usd: spentUsd, spent_today_sol: Number(spentLamports) / 1e9 } });
}

// ── dispatcher ────────────────────────────────────────────────────────────────

export default async function handler(req, res, id, action) {
	if (action === 'activity') return handleActivity(req, res, id);
	if (action === 'airdrop') return handleAirdrop(req, res, id);
	if (action === 'withdraw') return handleWithdraw(req, res, id);
	if (action === 'holdings') return handleHoldings(req, res, id);
	if (action === 'custody') return handleCustody(req, res, id);
	if (action === 'limits') return handleLimits(req, res, id);
	if (action === 'trade') {
		const mod = await import('./solana-trade.js');
		return mod.handleTrade(req, res, id);
	}
	if (action === 'trade-history') {
		const mod = await import('./solana-trade.js');
		return mod.handleTradeHistory(req, res, id);
	}
	return handleWallet(req, res, id);
}

export { handleWithdraw };
