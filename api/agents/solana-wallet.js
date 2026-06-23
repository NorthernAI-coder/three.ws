// /api/agents/:id/solana — wallet, activity, and airdrop handlers.
// Dispatched from api/agents/[id].js with the `action` sub-path.

import { getSessionUser, authenticateBearer, extractBearer } from '../_lib/auth.js';
import { sql } from '../_lib/db.js';
import { confirmOrThrow } from '../_lib/solana/confirm.js';
import { cors, json, method, error, readJson, rateLimited, serverError } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { requireCsrf } from '../_lib/csrf.js';
import { generateSolanaAgentWallet, recoverSolanaAgentKeypair, encryptSecret } from '../_lib/agent-wallet.js';
import { solanaConnection, solanaPublicConnection } from '../_lib/agent-pumpfun.js';
import { reverseLookupAddress } from '../../src/solana/sns.js';
import {
	Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram,
	TransactionMessage, VersionedTransaction,
} from '@solana/web3.js';
import {
	getAssociatedTokenAddressSync, createTransferCheckedInstruction,
	createAssociatedTokenAccountIdempotentInstruction, createCloseAccountInstruction, getMint,
	TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { grindMintKeypair, estimateAttempts, BASE58_ALPHABET, addressMatchesPattern } from '../_lib/pump-vanity.js';
import { randomUUID } from 'node:crypto';
import { recordEvent } from '../_lib/usage.js';
import { cacheGet, cacheSet } from '../_lib/cache.js';
import { logAudit } from '../_lib/audit.js';
import { explorerTxUrl } from '../_lib/avatar-wallet.js';
import {
	validateSolanaAddress, enforceSpendLimit, SpendLimitError, lamportsToUsd,
	getSpendLimits, setSpendLimits, listCustodyEvents, updateCustodyEvent, recordCustodyEvent,
	getDailySpendUsd, getTradeLimits, setTradeLimits, getDailySpendLamports,
} from '../_lib/agent-trade-guards.js';
import { getBalances, walletUsdTotal } from '../_lib/balances.js';
import {
	THREE_MINT, computeLook, computeMarks, normalizePrefs,
} from '../_lib/networth-model.js';

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

// Encrypt a custodial Solana secret for storage. Delegates to the shared secret
// box so imported / regenerated wallets are written with the SAME v2 scheme
// (dedicated WALLET_ENCRYPTION_KEY + random per-record salt) as freshly-generated
// ones. Previously this path wrote a weaker v1 ciphertext (JWT_SECRET + constant
// salt); recoverSolanaAgentKeypair still reads those legacy records.
const _encryptSecret = (plaintext) => encryptSecret(plaintext);

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
		await confirmOrThrow(conn, signature, 'confirmed');
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

	// Provisioning, importing, and wiping a custodial keypair all change which
	// keys control the agent's funds — gate the mutating methods behind CSRF so
	// a cross-site forged request can never replace or delete the wallet.
	if (req.method !== 'GET' && !(await requireCsrf(req, res, auth.userId))) return;

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

	// CSRF: sweeping a custodial wallet is the single highest-stakes action on the
	// platform — it must be at least as protected as message-signing. Bearer/API-key
	// callers are exempt inside requireCsrf (the token is itself proof of intent). A
	// `simulate` request moves no funds and never touches the key (it returns a live
	// preview, like the trade endpoint's preview), so it is CSRF-exempt — otherwise a
	// read-back/quote would burn the owner's single-use token before they confirm.
	if (!simulate && !(await requireCsrf(req, res, auth.userId))) return;

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
		// Spend ceilings, the freeze switch, and the withdraw allowlist are the
		// wallet's safety gates — a forged change could disarm them, so require CSRF.
		if (!(await requireCsrf(req, res, auth.userId))) return;
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
		const wantsSpend = ['daily_usd', 'per_tx_usd', 'withdraw_allowlist', 'frozen'].some((k) => k in body);
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

// ── vanity grind + custodial swap ──────────────────────────────────────────────
// GET  /api/agents/:id/solana/vanity  — owner-only current vanity status.
// POST /api/agents/:id/solana/vanity  — owner-only: grind a vanity keypair
//   server-side (the secret never leaves the server) and make it the agent's
//   custodial Solana wallet. If the existing wallet holds funds, every asset is
//   swept to the new address FIRST, signed by the old key; the stored key is only
//   swapped after the sweep confirms, so funds can never be stranded. This is an
//   internal custody migration between two wallets the same owner controls — not a
//   third-party withdrawal — so it is exempt from the withdraw allowlist but fully
//   audited as a `vanity_swap` custody event.

// Server-side grind is bounded so a serverless invocation can't hang. Patterns
// harder than this are ground in the browser (a WASM worker pool across the
// user's CPU cores, up to 8 chars) and assigned with the resulting secret_key.
const VANITY_MAX_CHARS = 3;          // combined prefix+suffix length for server grind
const VANITY_MAX_ITERATIONS = 4_000_000;
// Wall-clock grind budget. Kept under the function's 45s maxDuration (vercel.json)
// with ~15s of headroom for the post-grind wallet sweep and response.
const VANITY_GRIND_BUDGET_MS = 30_000;

// Move every asset (all SPL tokens + remaining SOL) from a custodial keypair to a
// destination address, reclaiming token-account rent. Two-phase so the final SOL
// figure is exact: (A) transfer + close each token account, (B) sweep all SOL.
// Returns { signatures, sol, tokens }. Throws if any leg fails to confirm — the
// caller must NOT discard the source key unless this resolves.
async function sweepWalletToAddress({ conn, fromKeypair, toPubkey, network }) {
	const fromPk = fromKeypair.publicKey;
	const signatures = [];
	const movedTokens = [];

	// Phase A — collect every non-empty token account across both token programs.
	const tokenLegs = [];
	for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
		let resp;
		try {
			resp = await conn.getParsedTokenAccountsByOwner(fromPk, { programId });
		} catch {
			continue;
		}
		for (const { account } of resp.value) {
			const info = account.data?.parsed?.info;
			const amt = info?.tokenAmount;
			if (!info || !amt) continue;
			const raw = BigInt(amt.amount || '0');
			if (raw <= 0n) continue;
			const mintPk = new PublicKey(info.mint);
			const sourceAta = getAssociatedTokenAddressSync(mintPk, fromPk, false, programId, ASSOCIATED_TOKEN_PROGRAM_ID);
			const destAta = getAssociatedTokenAddressSync(mintPk, toPubkey, false, programId, ASSOCIATED_TOKEN_PROGRAM_ID);
			tokenLegs.push({ mintPk, programId, sourceAta, destAta, raw, decimals: amt.decimals });
			movedTokens.push({ mint: info.mint, ui_amount: amt.uiAmount, amount_raw: amt.amount });
		}
	}

	// Send token transfers + closes in chunks so each transaction stays under the
	// size limit. Closing the source ATA returns its rent lamports to `fromPk`,
	// which are then swept out in phase B.
	const CHUNK = 4;
	for (let i = 0; i < tokenLegs.length; i += CHUNK) {
		const chunk = tokenLegs.slice(i, i + CHUNK);
		const ixs = [];
		for (const leg of chunk) {
			ixs.push(createAssociatedTokenAccountIdempotentInstruction(
				fromPk, leg.destAta, toPubkey, leg.mintPk, leg.programId, ASSOCIATED_TOKEN_PROGRAM_ID,
			));
			ixs.push(createTransferCheckedInstruction(
				leg.sourceAta, leg.mintPk, leg.destAta, fromPk, leg.raw, leg.decimals, [], leg.programId,
			));
			ixs.push(createCloseAccountInstruction(leg.sourceAta, fromPk, fromPk, [], leg.programId));
		}
		const sig = await sendV0({ conn, payer: fromKeypair, ixs });
		signatures.push(sig);
	}

	// Phase B — sweep all remaining SOL, leaving only the network fee. The old
	// account is intentionally abandoned (drained to ~0), so no rent is reserved.
	let lamports = 0n;
	try {
		lamports = BigInt(await conn.getBalance(fromPk, 'confirmed'));
	} catch {
		lamports = 0n;
	}
	const spendable = lamports - SOL_FEE_RESERVE_LAMPORTS;
	let solMoved = 0;
	if (spendable > 0n) {
		const sig = await sendV0({
			conn,
			payer: fromKeypair,
			ixs: [SystemProgram.transfer({ fromPubkey: fromPk, toPubkey, lamports: spendable })],
		});
		signatures.push(sig);
		solMoved = Number(spendable) / 1e9;
	}

	return { signatures, sol: solMoved, tokens: movedTokens };
}

// Build, sign, send and confirm a single v0 transaction. Throws on any failure or
// an unconfirmed/erroring result so callers treat the leg as not-yet-final.
async function sendV0({ conn, payer, ixs }) {
	const bh = await conn.getLatestBlockhash('confirmed');
	const msg = new TransactionMessage({
		payerKey: payer.publicKey,
		recentBlockhash: bh.blockhash,
		instructions: ixs,
	}).compileToV0Message();
	const vtx = new VersionedTransaction(msg);
	vtx.sign([payer]);
	const sig = await conn.sendRawTransaction(vtx.serialize(), { skipPreflight: false, maxRetries: 3 });
	const r = await conn.confirmTransaction(
		{ signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight },
		'confirmed',
	);
	if (r?.value?.err) throw new Error(`transaction ${sig} failed: ${JSON.stringify(r.value.err)}`);
	return sig;
}

function validateVanityPattern(raw, label) {
	if (raw == null || raw === '') return null;
	const s = String(raw);
	if (s.length > 6) return { error: `${label} is too long (max 6 base58 chars)` };
	for (const c of s) {
		if (!BASE58_ALPHABET.includes(c)) return { error: `${label} has a non-base58 char '${c}' (0/O/I/l are not allowed)` };
	}
	return { value: s };
}

async function handleVanity(req, res, id) {
	if (cors(req, res, { methods: 'GET,POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET', 'POST'])) return;

	const owned = await loadOwnedWallet(req, res, id);
	if (owned.error) return;
	const { auth, meta, address: currentAddress, encryptedSecret } = owned;

	if (req.method === 'GET') {
		const rl = await limits.walletRead(auth.userId);
		if (!rl.success) return rateLimited(res, rl);
		return json(res, 200, {
			data: {
				address: currentAddress,
				vanity_prefix: meta.solana_vanity_prefix || null,
				vanity_suffix: meta.solana_vanity_suffix || null,
				source: meta.solana_wallet_source || (encryptedSecret ? 'generated' : null),
				is_vanity: !!(meta.solana_vanity_prefix || meta.solana_vanity_suffix),
				max_chars: VANITY_MAX_CHARS,
			},
		});
	}

	// POST — sensitive: it grinds a new keypair and sweeps every holding to it,
	// so it moves funds. Require CSRF, then gate behind the withdrawal per-user
	// cap + per-IP burst.
	if (!(await requireCsrf(req, res, auth.userId))) return;
	const rlUser = await limits.withdrawalPerUser(auth.userId);
	if (!rlUser.success) return rateLimited(res, rlUser);
	const rlIp = await limits.authIp(clientIp(req));
	if (!rlIp.success) return rateLimited(res, rlIp);

	let body;
	try {
		body = await readJson(req);
	} catch (e) {
		return error(res, e?.status === 415 ? 415 : 400, 'bad_request', e?.message || 'invalid request body');
	}

	const network = body.network === 'devnet' ? 'devnet' : 'mainnet';
	const ignoreCase = body.ignoreCase === true || body.ignore_case === true;

	const pfx = validateVanityPattern(body.prefix, 'prefix');
	const sfx = validateVanityPattern(body.suffix, 'suffix');
	if (pfx?.error) return error(res, 400, 'validation_error', pfx.error);
	if (sfx?.error) return error(res, 400, 'validation_error', sfx.error);
	const prefix = pfx?.value || null;
	const suffix = sfx?.value || null;
	if (!prefix && !suffix) return error(res, 400, 'validation_error', 'provide a prefix and/or suffix');

	const combinedLen = (prefix?.length || 0) + (suffix?.length || 0);

	// Two ways to supply the new keypair, both ending in the identical sweep-then-
	// swap below so funds are equally safe either way:
	//   (A) `secret_key` — a 64-byte Ed25519 key the owner ground in their browser
	//       at full speed (worker pool, longer patterns, case-insensitive). We
	//       re-derive the address and prove it matches the requested pattern before
	//       adopting it — the client's "this is vanity" claim is never trusted.
	//   (B) no key — a bounded server-side grind for short patterns only.
	let ground = null;
	let newKp;

	if (body.secret_key != null) {
		const sk = body.secret_key;
		if (!Array.isArray(sk) || sk.length !== 64 || !sk.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
			return error(res, 400, 'validation_error', 'secret_key must be a 64-byte number array');
		}
		try {
			newKp = Keypair.fromSecretKey(Uint8Array.from(sk));
		} catch {
			return error(res, 400, 'validation_error', 'secret_key did not parse as a valid Solana keypair');
		}
		// Verify the supplied address genuinely satisfies the pattern — the
		// client's "this is vanity" claim is never trusted.
		const claimed = newKp.publicKey.toBase58();
		if (!addressMatchesPattern(claimed, { prefix, suffix, ignoreCase })) {
			return error(res, 400, 'validation_error', 'the supplied address does not match the requested prefix/suffix');
		}
	} else {
		if (combinedLen > VANITY_MAX_CHARS) {
			return error(res, 400, 'pattern_too_hard',
				`server-side grinding supports up to ${VANITY_MAX_CHARS} combined characters. ` +
				`Grind longer patterns in your browser (this tab grinds with your CPU cores) — they assign automatically.`);
		}
		// Grind the vanity keypair. The secret stays in process memory only.
		try {
			const est = estimateAttempts({ prefix, suffix, ignoreCase });
			const maxIterations = Math.min(VANITY_MAX_ITERATIONS, Math.max(200_000, Math.ceil(est * 25)));
			// Bail before the function's maxDuration (45s, see vercel.json) so the grind
			// returns a clean `vanity_timeout` 504 instead of a hard runtime kill, and
			// still leaves headroom to sweep the wallet to the new address afterward.
			ground = await grindMintKeypair({ prefix, suffix, ignoreCase, maxIterations, maxMs: VANITY_GRIND_BUDGET_MS });
		} catch (e) {
			if (e?.code === 'vanity_timeout') {
				return error(res, 504, 'vanity_timeout', 'could not find a matching address in time — try a shorter pattern or grind it in the browser');
			}
			if (e?.code === 'invalid_vanity') return error(res, 400, 'validation_error', e.message);
			console.error('[agents/solana/vanity] grind failed', e?.message);
			return error(res, 502, 'grind_failed', 'vanity grind failed — try again');
		}
		newKp = ground.keypair;
	}

	const newAddress = newKp.publicKey.toBase58();

	// If the agent already holds a funded custodial wallet, migrate the balance to
	// the new address before swapping the stored key. This is the money-safe gate:
	// a failed sweep throws and we keep the old wallet intact.
	let swept = null;
	if (currentAddress && encryptedSecret && currentAddress !== newAddress) {
		const conn = solanaConnection(network);
		let needsSweep = false;
		try {
			const lamports = BigInt(await conn.getBalance(new PublicKey(currentAddress), 'confirmed'));
			needsSweep = lamports > SOL_FEE_RESERVE_LAMPORTS;
			if (!needsSweep) {
				// Any non-empty token account also requires a sweep.
				for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
					const resp = await conn.getParsedTokenAccountsByOwner(new PublicKey(currentAddress), { programId }).catch(() => ({ value: [] }));
					if (resp.value.some((t) => Number(t.account.data?.parsed?.info?.tokenAmount?.uiAmount) > 0)) {
						needsSweep = true;
						break;
					}
				}
			}
		} catch (e) {
			return error(res, 502, 'rpc_error', 'could not read the current wallet balance — try again before migrating funds');
		}

		if (needsSweep) {
			let oldKp;
			try {
				oldKp = await recoverSolanaAgentKeypair(encryptedSecret, {
					agentId: id, userId: auth.userId, reason: 'vanity_swap',
					meta: { from: currentAddress, to: newAddress, network },
				});
			} catch (e) {
				console.error('[agents/solana/vanity] key recovery failed', e?.message);
				return error(res, 500, 'key_recover_failed', 'could not access the current wallet key — no funds were moved and the wallet is unchanged');
			}
			try {
				swept = await sweepWalletToAddress({ conn, fromKeypair: oldKp, toPubkey: newKp.publicKey, network });
			} catch (e) {
				console.error('[agents/solana/vanity] sweep failed', e?.message);
				return error(res, 502, 'sweep_failed',
					'funds could not be fully migrated to the new address — your existing wallet is unchanged and still holds the funds. Try again.');
			}
			await recordCustodyEvent({
				agentId: id, userId: auth.userId, eventType: 'spend', category: 'vanity_swap',
				network, asset: 'ALL', status: 'confirmed',
				signature: swept.signatures[swept.signatures.length - 1] || null,
				destination: newAddress,
				meta: { from: currentAddress, to: newAddress, sol: swept.sol, tokens: swept.tokens, signatures: swept.signatures },
			}).catch(() => {});
		}
	}

	// Persist the new keypair as the agent's custodial wallet.
	const walletSource = ground ? 'vanity_grind' : 'imported_vanity';
	const encrypted_secret = await _encryptSecret(Buffer.from(newKp.secretKey).toString('base64'));
	const history = Array.isArray(meta.solana_wallet_history) ? meta.solana_wallet_history : [];
	const nextMeta = {
		...meta,
		solana_address: newAddress,
		encrypted_solana_secret: encrypted_secret,
		solana_wallet_source: walletSource,
		solana_vanity_prefix: prefix || null,
		solana_vanity_suffix: suffix || null,
	};
	if (!prefix) delete nextMeta.solana_vanity_prefix;
	if (!suffix) delete nextMeta.solana_vanity_suffix;
	if (currentAddress && currentAddress !== newAddress) {
		nextMeta.solana_wallet_history = [
			...history,
			{ address: currentAddress, replaced_at: new Date().toISOString(), reason: 'vanity_upgrade', swept: !!swept },
		].slice(-10);
	}
	await sql`UPDATE agent_identities SET meta = ${JSON.stringify(nextMeta)}::jsonb WHERE id = ${id}`;

	if (currentAddress) await cacheSet(`sol:bal:${currentAddress}:${network}`, null, 1).catch(() => {});
	await cacheSet(`sol:bal:${newAddress}:${network}`, null, 1).catch(() => {});

	const iterations = ground ? ground.iterations : (Number.isFinite(Number(body.iterations)) ? Number(body.iterations) : null);
	const durationMs = ground ? ground.durationMs : (Number.isFinite(Number(body.duration_ms)) ? Number(body.duration_ms) : null);
	recordEvent({
		userId: auth.userId, agentId: id, kind: 'solana_vanity_grind', tool: ground ? 'server' : 'browser', status: 'ok',
		meta: { address: newAddress, prefix, suffix, ignoreCase, iterations, swept: swept ? { sol: swept.sol, tokens: swept.tokens.length } : null },
	});
	logAudit({ userId: auth.userId, action: 'custody.vanity_grind', resourceId: id, meta: { address: newAddress, prefix, suffix, replaced: currentAddress || null, swept: !!swept }, req });

	return json(res, 201, {
		data: {
			address: newAddress,
			vanity_prefix: prefix,
			vanity_suffix: suffix,
			network,
			iterations,
			duration_ms: durationMs,
			replaced: currentAddress && currentAddress !== newAddress ? currentAddress : null,
			swept,
			source: walletSource,
		},
	});
}

// ── net-worth (the agent wears its wallet) ──────────────────────────────────────

// Count agents forked from this one (real lineage rows). Lineage is stored at
// fork time in agent_identities.meta.forked_from.agent_id (api/avatars/fork.js).
async function forkCountFor(id) {
	try {
		const [r] = await sql`
			SELECT count(*)::int AS n FROM agent_identities
			WHERE deleted_at IS NULL AND meta->'forked_from'->>'agent_id' = ${id}
		`;
		return r?.n || 0;
	} catch {
		return 0;
	}
}

// Lifetime tips received by this agent — confirmed on-chain tip rows only, so the
// count can never be fabricated. Powers the "Tipped Nx / $X" reputation mark.
async function lifetimeTipsFor(id) {
	try {
		const [r] = await sql`
			SELECT count(*)::int AS n, COALESCE(sum(usd), 0)::float8 AS usd
			FROM agent_custody_events
			WHERE agent_id = ${id} AND event_type = 'tip' AND status IN ('ok', 'confirmed')
		`;
		return { count: r?.n || 0, usd: Number(r?.usd) || 0 };
	} catch {
		return { count: 0, usd: 0 };
	}
}

// Realized trading P&L from CLOSED sniper positions (a real on-chain settlement).
// Net SOL and the count of profitable closes; defensive when the table is absent.
async function realizedPnlFor(id) {
	try {
		const [r] = await sql`
			SELECT
				COALESCE(sum(realized_pnl_lamports), 0)::float8 AS lamports,
				count(*) FILTER (WHERE realized_pnl_lamports > 0)::int AS wins
			FROM agent_sniper_positions
			WHERE agent_id = ${id} AND status = 'closed' AND realized_pnl_lamports IS NOT NULL
		`;
		return { sol: (Number(r?.lamports) || 0) / 1e9, wins: r?.wins || 0 };
	} catch {
		// Table may not exist on this deployment — P&L mark simply doesn't appear.
		return { sol: 0, wins: 0 };
	}
}

// One real read of every reputation signal the look + regalia use.
async function reputationFor(id) {
	const [forkCount, tips, pnl] = await Promise.all([
		forkCountFor(id),
		lifetimeTipsFor(id),
		realizedPnlFor(id),
	]);
	return { forkCount, tips, pnl };
}

// GET  /api/agents/:id/solana/networth — public read: the agent's net-worth "look"
//   (presence tier, aura, confidence, regalia marks) derived entirely from real
//   chain reads + real DB counts, plus the owner's reactivity preferences.
// PUT  /api/agents/:id/solana/networth — owner-only: persist the reactivity prefs
//   (CSRF-gated). Visitors render the agent exactly as the owner configured it.
async function handleNetWorth(req, res, id) {
	if (cors(req, res, { methods: 'GET,PUT,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET', 'PUT'])) return;

	const [row] = await sql`SELECT id, user_id, meta FROM agent_identities WHERE id = ${id} AND deleted_at IS NULL`;
	if (!row) return error(res, 404, 'not_found', 'agent not found');

	const auth = await resolveAuth(req);
	const isOwner = !!(auth && row.user_id === auth.userId);
	const address = row.meta?.solana_address || null;
	const hubUrl = `/agent/${id}/wallet`;

	if (req.method === 'PUT') {
		// Only the owner shapes how their agent presents itself; a forged change
		// could force a flex the owner opted out of, so require CSRF.
		if (!isOwner) return error(res, auth ? 403 : 401, auth ? 'forbidden' : 'unauthorized', auth ? 'not your agent' : 'sign in required');
		if (!(await requireCsrf(req, res, auth.userId))) return;
		let body;
		try {
			body = await readJson(req);
		} catch (e) {
			return error(res, e?.status === 415 ? 415 : 400, 'bad_request', e?.message || 'invalid request body');
		}
		const prev = normalizePrefs(row.meta?.networth_look);
		const next = normalizePrefs({
			reactivity: 'reactivity' in body ? body.reactivity : prev.reactivity,
			signals: { ...prev.signals, ...(body.signals && typeof body.signals === 'object' ? body.signals : {}) },
		});
		next.updated_at = new Date().toISOString();
		const meta = { ...(row.meta || {}), networth_look: next };
		await sql`UPDATE agent_identities SET meta = ${JSON.stringify(meta)}::jsonb WHERE id = ${id}`;
		logAudit({ userId: auth.userId, action: 'networth.prefs_update', resourceId: id, meta: { prev, next }, req });
		return json(res, 200, { data: { prefs: next, is_owner: true } });
	}

	const rl = await limits.walletRead(isOwner ? auth.userId : clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const prefs = normalizePrefs(row.meta?.networth_look);
	const { forkCount, tips, pnl } = await reputationFor(id);
	const repState = {
		forkCount,
		tipCount: tips.count, tipUsd: tips.usd,
		realizedPnlSol: pnl.sol, realizedWins: pnl.wins,
	};
	const reputation = {
		fork_count: forkCount,
		tips: { count: tips.count, usd: tips.usd },
		realized_pnl_sol: pnl.sol, realized_wins: pnl.wins,
	};

	// No wallet yet (provisioning): calm baseline look, honest about state. The
	// agent still reads as itself — never poor-shamed, never faked. Reputation it
	// has already earned (forks, tips) still shows.
	if (!address) {
		const look = computeLook({ usd: 0, ...repState });
		return json(res, 200, {
			data: {
				agent_id: id, address: null, network: 'mainnet', provisioning: true,
				portfolio: { usd: 0, sol: 0, three: null, usdc: 0, token_count: 0, top: [] },
				reputation,
				tier: look.tier, look, marks: computeMarks({ usd: 0, ...repState }, { hubUrl }),
				prefs, is_owner: isOwner, hub_url: hubUrl,
			},
		});
	}

	let balances = null;
	try {
		balances = await getBalances({ chain: 'solana', address });
	} catch (e) {
		// Hold-last-state contract: when the chain read is briefly unavailable we
		// return a typed error so the client keeps the agent's last real look
		// rather than snapping it to a fake baseline.
		console.warn(`[agents/networth] balance read failed agentId=${id} ${e?.message}`);
		return error(res, 502, 'rpc_error', 'could not read the wallet right now — holding last state');
	}

	const usd = walletUsdTotal(balances);
	const sol = balances?.native?.amount || 0;
	const tokens = balances?.tokens || [];
	const threeTok = tokens.find((t) => t.mint === THREE_MINT) || null;
	const usdcTok = tokens.find((t) => t.symbol === 'USDC');
	const top = tokens.slice(0, 5).map((t) => ({ symbol: t.symbol, mint: t.mint, usd: t.usd || 0, amount: t.amount || 0 }));

	const state = {
		usd,
		threeUsd: threeTok?.usd || 0,
		threeAmount: threeTok?.amount || 0,
		...repState,
	};
	const look = computeLook(state);
	const marks = computeMarks(state, { hubUrl });

	return json(res, 200, {
		data: {
			agent_id: id,
			address,
			network: 'mainnet',
			portfolio: {
				usd,
				sol,
				sol_usd: balances?.native?.usd || 0,
				three: threeTok ? { amount: threeTok.amount, usd: threeTok.usd || 0, price: threeTok.price || 0 } : null,
				usdc: usdcTok?.usd || 0,
				token_count: tokens.length,
				top,
			},
			reputation,
			tier: look.tier,
			look,
			marks,
			prefs,
			is_owner: isOwner,
			hub_url: hubUrl,
			updated_at: new Date().toISOString(),
		},
	});
}

// ── tip recording (on-chain verified) ──────────────────────────────────────────
// POST /api/agents/:id/solana/tip — record a P2P tip that a visitor already sent
// on-chain from their OWN wallet (api/../src/shared/agent-tip.js builds + signs it
// client-side; three.ws never custodies it). The client hands us the confirmed
// signature; we INDEPENDENTLY verify on-chain that the transaction really credited
// the agent's public wallet before writing a row — so a caller can never fabricate
// a tip. The recorded tip is a PUBLIC custody event (event_type='tip') that powers
// the Money Pulse feed and the per-agent wallet story. Idempotent per signature.

// Parsed-tx account-key → base58 string (handles PublicKey or string pubkeys).
function _acctKeyStr(k) {
	const p = k?.pubkey ?? k;
	return typeof p === 'string' ? p : p?.toString?.() ?? '';
}
// Net lamports credited to `owner` from a parsed tx's pre/post native balances.
function _lamportsCreditedTo(tx, owner) {
	const keys = tx.transaction?.message?.accountKeys || [];
	const idx = keys.findIndex((k) => _acctKeyStr(k) === owner);
	if (idx < 0) return 0n;
	return BigInt(tx.meta?.postBalances?.[idx] ?? 0) - BigInt(tx.meta?.preBalances?.[idx] ?? 0);
}
// Net SPL atomics of `mint` credited to `owner`, from pre/post token balances.
function _tokenCreditedTo(tx, mint, owner) {
	const pre = tx.meta?.preTokenBalances || [];
	const post = tx.meta?.postTokenBalances || [];
	let delta = 0n;
	for (const p of post) {
		if (p.mint !== mint || p.owner !== owner) continue;
		const before = pre.find((x) => x.accountIndex === p.accountIndex);
		delta += BigInt(p.uiTokenAmount?.amount ?? '0') - BigInt(before?.uiTokenAmount?.amount ?? '0');
	}
	return delta;
}
// First signer of the tx that isn't the recipient — the tipper.
function _firstSigner(tx, exclude) {
	const keys = tx.transaction?.message?.accountKeys || [];
	for (const k of keys) {
		if (k?.signer && _acctKeyStr(k) !== exclude) return _acctKeyStr(k);
	}
	return null;
}

async function handleTip(req, res, id) {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true, origins: '*' })) return;
	if (!method(req, res, ['POST'])) return;

	// Tipping is open to anyone (signed-in or not); throttle per-IP to keep the
	// on-chain verification (one getParsedTransaction) from being abused.
	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const [row] = await sql`SELECT id, meta FROM agent_identities WHERE id = ${id} AND deleted_at IS NULL`;
	if (!row) return error(res, 404, 'not_found', 'agent not found');
	const address = row.meta?.solana_address || null;
	if (!address) return error(res, 404, 'not_found', 'agent has no solana wallet');

	let body;
	try {
		body = await readJson(req);
	} catch (e) {
		return error(res, e?.status === 415 ? 415 : 400, 'bad_request', e?.message || 'invalid request body');
	}

	const signature = typeof body.signature === 'string' ? body.signature.trim() : '';
	if (!signature || signature.length < 32 || signature.length > 128 || !BASE58_RE.test(signature)) {
		return error(res, 400, 'validation_error', 'a valid base58 tx signature is required');
	}
	const network = body.network === 'devnet' ? 'devnet' : 'mainnet';
	const assetRaw = typeof body.asset === 'string' && body.asset.trim() ? body.asset.trim().toUpperCase() : 'SOL';

	// Fast idempotency: the same signature is recorded once per agent.
	const idempotencyKey = `tip:${signature}`;
	{
		const [existing] = await sql`
			SELECT id, asset, amount_lamports, amount_raw, usd FROM agent_custody_events
			WHERE agent_id = ${id} AND idempotency_key = ${idempotencyKey}
		`;
		if (existing) {
			return json(res, 200, {
				data: {
					recorded: false, replayed: true, signature,
					explorer: explorerTxUrl(signature, network), network,
				},
			});
		}
	}

	// Verify on-chain. The client already waited for confirmation, so 'confirmed'
	// is sufficient for a record of an already-public transfer.
	const conn = solanaConnection(network);
	let tx;
	try {
		tx = await conn.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
	} catch {
		tx = null;
	}
	if (!tx) {
		// Maybe still finalizing — tell the client to retry rather than failing hard.
		return error(res, 202, 'tx_pending', 'transaction not visible yet — it may still be confirming, retry shortly');
	}
	if (tx.meta?.err) return error(res, 422, 'tx_failed', 'that transaction failed on-chain — nothing was tipped');

	// Resolve the credited amount + price.
	let amountLamports = null, amountRaw = null, usd = null, assetOut = 'SOL', decimals = 9;
	const usdcMint = USDC_MINT_BY_CLUSTER[network];
	if (assetRaw === 'SOL') {
		const lamports = _lamportsCreditedTo(tx, address);
		if (lamports <= 0n) return error(res, 422, 'no_funds_received', 'no SOL was received at this agent wallet in that transaction');
		amountLamports = lamports;
		assetOut = 'SOL';
		try { usd = await lamportsToUsd(lamports); } catch { usd = null; }
	} else {
		// SPL tip. Resolve the mint (USDC by name, or an explicit mint address).
		const mint = assetRaw === 'USDC' ? usdcMint : (validateSolanaAddress(body.asset).valid ? validateSolanaAddress(body.asset).base58 : null);
		if (!mint) return error(res, 400, 'invalid_asset', 'asset must be "SOL", "USDC", or a valid SPL mint');
		const atomics = _tokenCreditedTo(tx, mint, address);
		if (atomics <= 0n) return error(res, 422, 'no_funds_received', 'none of that token was received at this agent wallet in that transaction');
		amountRaw = atomics;
		assetOut = mint;
		if (mint === usdcMint) { decimals = 6; usd = Number(atomics) / 1e6; }
	}

	const from = _firstSigner(tx, address);
	const blockTime = tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null;

	// Record the public tip event. ON CONFLICT guards the rare race where two
	// requests verify the same signature concurrently.
	const inserted = await sql`
		INSERT INTO agent_custody_events
			(agent_id, user_id, event_type, category, network, asset,
			 amount_lamports, amount_raw, usd, destination, signature, status, idempotency_key, meta)
		VALUES (
			${id}, NULL, 'tip', 'tip', ${network}, ${assetOut},
			${amountLamports != null ? String(amountLamports) : null},
			${amountRaw != null ? String(amountRaw) : null},
			${usd ?? null}, ${address}, ${signature}, 'confirmed', ${idempotencyKey},
			${JSON.stringify({ source: 'p2p_tip', from: from || null, block_time: blockTime, decimals })}::jsonb
		)
		ON CONFLICT (agent_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
		RETURNING id
	`;
	if (!inserted.length) {
		return json(res, 200, { data: { recorded: false, replayed: true, signature, explorer: explorerTxUrl(signature, network), network } });
	}

	// Reflect the inbound funds in the cached balance immediately.
	await cacheSet(`sol:bal:${address}:${network}`, null, 1).catch(() => {});

	const human = amountLamports != null ? Number(amountLamports) / 1e9 : Number(amountRaw) / 10 ** decimals;
	return json(res, 201, {
		data: {
			recorded: true, replayed: false, id: String(inserted[0].id),
			signature, explorer: explorerTxUrl(signature, network), network,
			asset: assetOut, amount: human, usd: usd ?? null, from: from || null,
		},
	});
}

// ── public-pulse visibility toggle ──────────────────────────────────────────────
// GET/PUT /api/agents/:id/solana/pulse-visibility — owner-only control over whether
// this agent's already-public events appear in the GLOBAL Money Pulse discovery
// feed (/pulse). Default is included (opt_out = false) for public agents; an owner
// can suppress their wallet from the aggregated feed without going fully private.
// The agent's own profile/HUD pulse always shows its public history regardless —
// this toggle governs only the platform-wide discovery stream. Enforced server-side
// in api/pulse.js via meta.pulse_opt_out.
async function handlePulseVisibility(req, res, id) {
	if (cors(req, res, { methods: 'GET,PUT,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET', 'PUT'])) return;

	const owned = await loadOwnedWallet(req, res, id);
	if (owned.error) return;
	const { auth, meta } = owned;

	const rl = await limits.walletRead(auth.userId);
	if (!rl.success) return rateLimited(res, rl);

	const [agentRow] = await sql`SELECT is_public FROM agent_identities WHERE id = ${id}`;
	const isPublic = agentRow?.is_public !== false;

	if (req.method === 'PUT') {
		// Flipping pulse visibility changes what the public can discover about this
		// wallet — gate it behind CSRF like the other wallet settings.
		if (!(await requireCsrf(req, res, auth.userId))) return;
		let body;
		try {
			body = await readJson(req);
		} catch (e) {
			return error(res, e?.status === 415 ? 415 : 400, 'bad_request', e?.message || 'invalid request body');
		}
		if (typeof body.opt_out !== 'boolean') return error(res, 400, 'validation_error', 'opt_out must be a boolean');
		const nextMeta = { ...meta, pulse_opt_out: body.opt_out };
		await sql`UPDATE agent_identities SET meta = ${JSON.stringify(nextMeta)}::jsonb WHERE id = ${id}`;
		logAudit({ userId: auth.userId, action: 'wallet.pulse_visibility', resourceId: id, meta: { opt_out: body.opt_out }, req });
		return json(res, 200, { data: { opt_out: body.opt_out, is_public: isPublic, in_public_pulse: isPublic && !body.opt_out } });
	}

	const optOut = meta.pulse_opt_out === true;
	return json(res, 200, { data: { opt_out: optOut, is_public: isPublic, in_public_pulse: isPublic && !optOut } });
}

// ── dispatcher ────────────────────────────────────────────────────────────────

export default async function handler(req, res, id, action) {
	if (action === 'activity') return handleActivity(req, res, id);
	if (action === 'airdrop') return handleAirdrop(req, res, id);
	if (action === 'withdraw') return handleWithdraw(req, res, id);
	if (action === 'vanity') return handleVanity(req, res, id);
	if (action === 'holdings') return handleHoldings(req, res, id);
	if (action === 'networth') return handleNetWorth(req, res, id);
	if (action === 'custody') return handleCustody(req, res, id);
	if (action === 'limits') return handleLimits(req, res, id);
	if (action === 'tip') return handleTip(req, res, id);
	if (action === 'pulse-visibility') return handlePulseVisibility(req, res, id);
	if (action === 'intent') {
		const mod = await import('./solana-intent.js');
		return mod.handleIntent(req, res, id);
	}
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
