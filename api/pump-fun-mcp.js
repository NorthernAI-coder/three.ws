// /api/pump-fun-mcp — pump.fun MCP server (Streamable HTTP transport, MCP 2025-06-18).
// POST — JSON-RPC (single + batch)   GET/HEAD — SSE handshake   DELETE — terminate.
//
// Real, in-house MCP server exposing read-only pump.fun tools to remote MCP
// connectors, the npm bridge (@three-ws/pumpfun-mcp), and the in-page
// <agent-3d> skill bundle (public/skills/pump-fun/). Registered with the MCP
// Registry as io.github.nirholas/pumpfun-solana-remote (see server-pumpfun.json).
//
// Back-compat: raw JSON-RPC consumers that POST plain application/json with no
// MCP headers (the npm bridge, the skill bundle) keep working unchanged —
// single requests return the same envelopes, statuses, and bodies as before.
//
// Tool names: canonical names are snake_case; the legacy camelCase names
// remain accepted forever via TOOL_NAME_ALIASES (src/pump/mcp-tools.js).
//
// Tools backed by on-chain reads (no external indexer required):
//   - get_bonding_curve   → @pump-fun/pump-sdk fetchBondingCurve
//   - get_token_details   → @solana/web3.js getAccountInfo + Metaplex metadata
//   - get_token_holders   → connection.getTokenLargestAccounts + concentration
//
// Tools that require indexed/aggregate data are routed through the existing
// pumpfunMcp client (api/_lib/pumpfun-mcp.js → upstream pumpfun-claims-bot).
// When PUMPFUN_BOT_URL is unset they return JSON-RPC error -32004 ("indexer
// not configured") — never a fabricated payload.
//
// CORS open (read-only data). Rate-limited by IP via limits.mcpIp.

import { cors, json, method, wrap, readJson, rateLimited } from './_lib/http.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { extractBearer, authenticateBearer } from './_lib/auth.js';
import {
	verifyPayment,
	settlePayment,
	encodePaymentResponseHeader,
	resolveResourceUrl,
	paymentRequirements,
	build402Body,
} from './_lib/x402-spec.js';
import { getPumpSdk, getConnection, solanaPubkey, getAmmPoolState } from './_lib/pump.js';
import { pumpfunMcp, pumpfunBotEnabled } from './_lib/pumpfun-mcp.js';
import { getRadarSignals } from '../src/kol/radar.js';
import { TOOLS, resolveToolName, rpcError, rpcEnvelope } from '../src/pump/mcp-tools.js';
import { generateVanityKey } from '../src/pump/vanity-keygen.js';
import bs58 from 'bs58';
import { resolveSnsName, reverseLookupAddress } from '../src/solana/sns.js';
import { scanFirstClaims } from './_lib/pump-claims.js';

// ── On-chain handlers ──────────────────────────────────────────────────────

const TOTAL_PUMP_TOKEN_SUPPLY = 1_000_000_000; // 1B pump.fun standard
const GRADUATION_REAL_SOL_LAMPORTS = 85_000_000_000n; // ~85 SOL — heuristic

async function handleGetBondingCurve({ mint, network = 'mainnet' }) {
	const pk = solanaPubkey(mint);
	if (!pk) throw rpcError(-32602, 'invalid mint');
	const { sdk } = await getPumpSdk({ network });
	let curve;
	try {
		if (sdk.fetchBuyState) {
			const state = await sdk.fetchBuyState(pk, pk);
			curve = state.bondingCurve;
		} else if (sdk.fetchBondingCurve) {
			curve = await sdk.fetchBondingCurve(pk);
		}
	} catch (e) {
		throw rpcError(-32004, `bonding curve unavailable: ${e?.message || 'unknown'}`);
	}
	if (!curve) throw rpcError(-32004, 'no bonding curve found for this mint');

	const realSol = BigInt(curve.realSolReserves?.toString?.() ?? '0');
	const realToken = BigInt(curve.realTokenReserves?.toString?.() ?? '0');
	const virtSol = BigInt(curve.virtualSolReserves?.toString?.() ?? '0');
	const virtToken = BigInt(curve.virtualTokenReserves?.toString?.() ?? '0');
	const complete = !!curve.complete;
	// Graduation % heuristic: complete=100, else realSol/graduationTarget * 100.
	const graduationPercent = complete
		? 100
		: Number((realSol * 10000n) / GRADUATION_REAL_SOL_LAMPORTS) / 100;

	return {
		mint,
		network,
		complete,
		graduationPercent,
		solReserves: (Number(realSol) / 1e9).toFixed(4),
		tokenReserves: realToken.toString(),
		virtualSolReserves: virtSol.toString(),
		virtualTokenReserves: virtToken.toString(),
	};
}

async function handleGetTokenDetails({ mint, network = 'mainnet' }) {
	const pk = solanaPubkey(mint);
	if (!pk) throw rpcError(-32602, 'invalid mint');
	const connection = getConnection({ network });
	const [{ MintLayout }, { PublicKey }] = await Promise.all([
		import('@solana/spl-token'),
		import('@solana/web3.js'),
	]);

	const info = await connection.getAccountInfo(pk);
	if (!info) throw rpcError(-32004, 'mint account not found');
	const mintAccount = MintLayout.decode(info.data);

	// Best-effort Metaplex Token Metadata read. PDA = [b"metadata", program, mint].
	const METADATA_PROGRAM = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
	const [metadataPda] = PublicKey.findProgramAddressSync(
		[Buffer.from('metadata'), METADATA_PROGRAM.toBuffer(), pk.toBuffer()],
		METADATA_PROGRAM,
	);
	let name = null;
	let symbol = null;
	let uri = null;
	try {
		const metaInfo = await connection.getAccountInfo(metadataPda);
		if (metaInfo) {
			// Layout: 1 key + 32 updateAuthority + 32 mint + 4-byte string-length-prefixed name/symbol/uri.
			const buf = metaInfo.data;
			let cursor = 1 + 32 + 32;
			const readStr = (max) => {
				const len = buf.readUInt32LE(cursor);
				cursor += 4;
				const slice = buf.slice(cursor, cursor + len);
				cursor += max;
				return slice.toString('utf8').replace(/\0+$/g, '').trim();
			};
			name = readStr(32);
			symbol = readStr(10);
			uri = readStr(200);
		}
	} catch {
		// Metadata is optional — proceed without it.
	}

	const supply = mintAccount.supply.toString();
	const decimals = mintAccount.decimals;

	return {
		mint,
		name,
		symbol,
		uri,
		decimals,
		supply,
		mintAuthority: mintAccount.mintAuthorityOption
			? mintAccount.mintAuthority.toString()
			: null,
		freezeAuthority: mintAccount.freezeAuthorityOption
			? mintAccount.freezeAuthority.toString()
			: null,
	};
}

async function handleGetTokenHolders({ mint, limit = 10, network = 'mainnet' }) {
	const pk = solanaPubkey(mint);
	if (!pk) throw rpcError(-32602, 'invalid mint');
	const connection = getConnection({ network });
	let largest;
	try {
		largest = await connection.getTokenLargestAccounts(pk);
	} catch (e) {
		throw rpcError(-32004, `holders unavailable: ${e?.message || 'rpc error'}`);
	}
	const accounts = (largest?.value || []).slice(0, Math.min(20, Math.max(1, limit)));
	const total = accounts.reduce((sum, a) => sum + Number(a.uiAmount || 0), 0);
	const holders = accounts.map((a) => ({
		address: a.address.toString(),
		amount: a.amount,
		uiAmount: a.uiAmount,
		percent: total > 0 ? (Number(a.uiAmount || 0) / total) * 100 : 0,
	}));
	const topHolderPercent = holders[0]?.percent ?? 0;
	return {
		mint,
		count: holders.length,
		topHolderPercent,
		holders,
	};
}

// ── kol_radar handler ──────────────────────────────────────────────────────

async function handleKolRadar({ category = 'pump-fun', limit = 20 }) {
	return getRadarSignals({ category, limit });
}

async function handleKolLeaderboard({ window = '7d', limit = 25 }) {
	const { getLeaderboard } = await import('../src/kol/leaderboard.js');
	return getLeaderboard({ window, limit });
}

// ── SNS handlers ──────────────────────────────────────────────────────────

async function handleSnsResolve({ name }) {
	if (!name) throw rpcError(-32602, 'name is required');
	const address = await resolveSnsName(name);
	if (!address) throw rpcError(-32004, `domain "${name}" not found`);
	return { name, address };
}

async function handleSnsReverseLookup({ address }) {
	if (!address) throw rpcError(-32602, 'address is required');
	const name = await reverseLookupAddress(address);
	if (!name) throw rpcError(-32004, `no .sol domain found for address`);
	return { address, name };
}

// ── Indexer-backed handlers (route through pumpfunMcp) ─────────────────────

// Tools whose data comes exclusively from the external pump.fun indexer
// (PUMPFUN_BOT_URL). When the bot is unconfigured these are filtered out of
// tools/list entirely so MCP clients only ever see tools they can call — they
// reappear automatically once the env var is set, with no code change. The
// -32004 guard in indexerOrUnavailable() stays as defence for any client that
// calls one anyway (e.g. from a cached tool list). get_token_trades is NOT
// here: it has a real on-chain fallback and works without the indexer.
const INDEXER_TOOLS = new Set([
	'search_tokens',
	'get_trending_tokens',
	'get_new_tokens',
	'get_graduated_tokens',
	'get_king_of_the_hill',
	'get_creator_profile',
]);

function indexerOrUnavailable(name) {
	return async (args) => {
		if (!pumpfunBotEnabled()) {
			throw rpcError(
				-32004,
				`tool "${name}" requires the pump.fun indexer (PUMPFUN_BOT_URL) to be configured`,
			);
		}
		// Map our canonical tool names to the upstream bot's (camelCase) surface.
		const upstreamMap = {
			search_tokens: { tool: 'searchTokens', args: { query: args.query, limit: args.limit } },
			get_token_trades: {
				tool: 'getTokenTrades',
				args: { mint: args.mint, limit: args.limit },
			},
			get_trending_tokens: { tool: 'getTrendingTokens', args: { limit: args.limit } },
			get_new_tokens: { tool: 'getNewTokens', args: { limit: args.limit } },
			get_graduated_tokens: { tool: 'getGraduatedTokens', args: { limit: args.limit } },
			get_king_of_the_hill: { tool: 'getKingOfTheHill', args: {} },
			get_creator_profile: { tool: 'getCreatorIntel', args: { wallet: args.creator } },
		};
		const upstream = upstreamMap[name];
		if (!upstream) throw rpcError(-32601, `tool "${name}" not implemented`);
		// Use the lower-level rpc-style call via callTool; pumpfunMcp's named
		// methods cover only a subset, so fall back to a generic invocation.
		const r = await pumpfunMcpCall(upstream.tool, upstream.args);
		if (!r.ok) throw rpcError(-32004, r.error || 'indexer error');
		return r.data;
	};
}

// Generic tools/call against the upstream bot using the same transport that
// pumpfunMcp uses internally. Encapsulated here so we don't leak transport
// details into the route.
async function pumpfunMcpCall(tool, args) {
	if (tool === 'getCreatorIntel') return pumpfunMcp.creatorIntel({ wallet: args?.wallet });
	if (tool === 'getRecentClaims') return pumpfunMcp.recentClaims({ limit: args?.limit });
	if (tool === 'getGraduations') return pumpfunMcp.graduations({ limit: args?.limit });
	// Fall through: not in the named surface — call raw rpc.
	return rawBotCall(tool, args);
}

async function rawBotCall(tool, args) {
	const url = process.env.PUMPFUN_BOT_URL;
	if (!url) return { ok: false, error: 'PUMPFUN_BOT_URL not set' };
	const headers = { 'content-type': 'application/json', accept: 'application/json' };
	if (process.env.PUMPFUN_BOT_TOKEN)
		headers.authorization = `Bearer ${process.env.PUMPFUN_BOT_TOKEN}`;
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), 8000);
	try {
		const r = await fetch(url.replace(/\/$/, ''), {
			method: 'POST',
			headers,
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: { name: tool, arguments: args || {} },
			}),
			signal: ctrl.signal,
		});
		if (!r.ok) return { ok: false, error: `bot ${r.status}` };
		const j = await r.json();
		if (j.error) return { ok: false, error: j.error.message || 'rpc error' };
		const payload = j.result?.structuredContent ?? j.result?.content ?? j.result;
		return { ok: true, data: payload };
	} catch (err) {
		return {
			ok: false,
			error: err?.name === 'AbortError' ? 'timeout' : err?.message || 'fetch failed',
		};
	} finally {
		clearTimeout(t);
	}
}

// Hard ceiling on the single-threaded vanity grind. Each iteration is a full
// ed25519 keygen; an unbounded budget lets one authenticated caller pin a CPU
// for the whole serverless window. 1.5M ≈ comfortably inside the 58s abort.
const VANITY_MAX_ATTEMPTS_CEILING = 1_500_000;
// Suffix/prefix length cap — the match space is base58^len, so >4 chars makes a
// hit astronomically unlikely within the budget and just burns CPU.
const VANITY_MAX_PATTERN_LEN = 4;

async function handleVanityMint({
	suffix = '',
	prefix = '',
	caseSensitive = false,
	maxAttempts = 1_500_000,
}) {
	if (!suffix && !prefix) throw rpcError(-32602, 'at least one of suffix or prefix is required');
	if (
		String(suffix).length > VANITY_MAX_PATTERN_LEN ||
		String(prefix).length > VANITY_MAX_PATTERN_LEN
	)
		throw rpcError(-32602, `suffix/prefix must each be ≤ ${VANITY_MAX_PATTERN_LEN} characters`);
	const budget = Math.min(
		VANITY_MAX_ATTEMPTS_CEILING,
		Math.max(1, Number(maxAttempts) || VANITY_MAX_ATTEMPTS_CEILING),
	);
	const ac = new AbortController();
	const timer = setTimeout(() => ac.abort(), 58_000);
	let result;
	try {
		result = await generateVanityKey({
			suffix,
			prefix,
			caseSensitive,
			maxAttempts: budget,
			signal: ac.signal,
		});
	} finally {
		clearTimeout(timer);
	}
	if (!result) throw rpcError(-32003, `no match found in ${budget} attempts`);
	// SECURITY: the secretKey is returned to the (authenticated) caller but must
	// never be logged or recorded server-side. Keep it out of any usage/event
	// metadata — the caller is the sole custodian of this key.
	return {
		publicKey: result.publicKey,
		secretKey: bs58.encode(result.secretKey),
		attempts: result.attempts,
		ms: result.ms,
	};
}

// ── Claims handlers (on-chain) ─────────────────────────────────────────────

const PUMP_CLAIM_PROGRAMS = new Set([
	'6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
	'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',
	'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ',
]);

async function _fetchClaimsFromChain({ creator, limit = 20, network = 'mainnet', sinceTs = 0 }) {
	const pk = solanaPubkey(creator);
	if (!pk) throw rpcError(-32602, 'invalid creator wallet');
	const conn = getConnection({ network });
	const sigInfos = await conn.getSignaturesForAddress(pk, { limit: Math.min(100, limit * 4) });
	const results = [];
	for (const { signature, blockTime } of sigInfos) {
		if (results.length >= limit) break;
		if (sinceTs && (blockTime ?? 0) <= sinceTs) break;
		let tx;
		try {
			tx = await conn.getParsedTransaction(signature, {
				maxSupportedTransactionVersion: 0,
				commitment: 'confirmed',
			});
		} catch {
			continue;
		}
		if (!tx) continue;
		const allIxs = [
			...(tx.transaction.message.instructions ?? []),
			...(tx.meta?.innerInstructions?.flatMap((i) => i.instructions) ?? []),
		];
		if (!allIxs.some((ix) => PUMP_CLAIM_PROGRAMS.has(ix.programId?.toString?.()))) continue;
		const accounts = tx.transaction.message.accountKeys;
		const idx = accounts.findIndex((a) => a.pubkey.toString() === creator);
		if (idx === -1) continue;
		const lamports = (tx.meta.postBalances[idx] ?? 0) - (tx.meta.preBalances[idx] ?? 0);
		if (lamports <= 0) continue;
		results.push({
			signature,
			mint: tx.meta.postTokenBalances?.[0]?.mint ?? null,
			lamports,
			ts: blockTime ?? Math.floor(Date.now() / 1000),
		});
	}
	return results;
}

async function handleListClaims({ creator, limit = 20, network = 'mainnet' }) {
	if (!creator) throw rpcError(-32602, 'creator required');
	return { creator, network, claims: await _fetchClaimsFromChain({ creator, limit, network }) };
}

async function handleWatchClaims({ creator, durationMs = 300_000, network = 'mainnet' }) {
	if (!creator) throw rpcError(-32602, 'creator required');
	const window = Math.min(1_800_000, Math.max(1, Number(durationMs) || 300_000));
	const sinceTs = Math.floor((Date.now() - window) / 1000);
	const claims = await _fetchClaimsFromChain({ creator, limit: 50, network, sinceTs });
	return { creator, network, windowMs: window, claims };
}

async function handleSocialCashtagSentiment({ posts }) {
	if (!Array.isArray(posts) || posts.length === 0)
		throw rpcError(-32602, 'posts must be a non-empty array');
	const { scoreSentiment } = await import('../src/social/sentiment.js');
	return scoreSentiment(posts);
}

async function handleGetFirstClaims({ sinceMinutes = 60, limit = 20 }) {
	const sinceTs = Math.floor(Date.now() / 1000) - Math.max(1, Math.min(1440, sinceMinutes)) * 60;
	const items = await scanFirstClaims({ sinceTs, limit: Math.max(1, Math.min(50, limit)) });
	return { items };
}

async function handleQuoteSwap({
	inputMint,
	outputMint,
	amountIn,
	slippageBps,
	network = 'mainnet',
}) {
	if (!solanaPubkey(inputMint)) throw rpcError(-32602, 'invalid inputMint');
	if (!solanaPubkey(outputMint)) throw rpcError(-32602, 'invalid outputMint');
	const WSOL = 'So11111111111111111111111111111111111111112';
	if (inputMint !== WSOL && outputMint !== WSOL) {
		throw rpcError(-32602, `one of inputMint or outputMint must be wSOL (${WSOL})`);
	}
	const baseMint = inputMint === WSOL ? outputMint : inputMint;
	let state;
	try {
		state = await getAmmPoolState({ network, mint: baseMint });
	} catch (err) {
		throw rpcError(err.status === 404 ? -32004 : -32603, err.message || 'pool unavailable');
	}
	const { buyQuoteInput, sellBaseInput } = await import('@pump-fun/pump-swap-sdk');
	const BNMod = await import('bn.js');
	const BN = BNMod.default || BNMod;
	const { poolKey, pool, baseReserve, quoteReserve, baseMintAccount, globalConfig, feeConfig } =
		state;
	const amountBn = new BN(String(amountIn));
	// pump-swap-sdk takes slippage as a PERCENT (1 = 1%): `1 ± slippage / 100`.
	const slip = (slippageBps ?? 100) / 100;
	const shared = {
		slippage: slip,
		baseReserve,
		quoteReserve,
		globalConfig,
		baseMintAccount,
		baseMint: pool.baseMint,
		coinCreator: pool.coinCreator,
		creator: pool.creator,
		feeConfig,
	};
	let amountOut, priceImpactBps;
	if (inputMint === WSOL) {
		const r = buyQuoteInput({ quote: amountBn, ...shared });
		amountOut = r.base;
		const num = amountBn.mul(baseReserve);
		const denom = amountOut.mul(quoteReserve);
		priceImpactBps = denom.isZero()
			? 0
			: Math.max(0, num.muln(10_000).div(denom).subn(10_000).toNumber());
	} else {
		const r = sellBaseInput({ base: amountBn, ...shared });
		amountOut = r.uiQuote;
		const spot = quoteReserve.mul(amountBn);
		const exec = amountOut.mul(baseReserve);
		priceImpactBps = spot.isZero()
			? 0
			: Math.max(0, spot.sub(exec).muln(10_000).div(spot).toNumber());
	}
	return {
		amountOut: amountOut.toString(),
		priceImpactBps,
		route: poolKey.toBase58(),
		expiresAtMs: Date.now() + 10_000,
	};
}

async function handleSocialXPostImpact({ postUrl, mint, windowMin = 30, network = 'mainnet' }) {
	if (!postUrl) throw rpcError(-32602, 'postUrl is required');
	const pk = solanaPubkey(mint);
	if (!pk) throw rpcError(-32602, `invalid mint: ${mint}`);

	let post = null;
	const postId = String(postUrl).match(/\/status(?:es)?\/(\d+)/)?.[1] ?? null;
	try {
		const oRes = await fetch(
			`https://publish.twitter.com/oembed?url=${encodeURIComponent(postUrl)}&omit_script=true`,
			{ signal: AbortSignal.timeout(5000) },
		);
		if (oRes.ok) {
			const od = await oRes.json();
			const ts = postId ? Number(BigInt(postId) >> 22n) + 1288834974657 : null;
			post = {
				id: postId,
				ts,
				author: od.author_name ?? null,
				text:
					od.html
						?.replace(/<[^>]*>/g, ' ')
						.replace(/\s+/g, ' ')
						.trim() ?? null,
			};
		}
	} catch {}

	const { sdk } = await getPumpSdk({ network });
	let curve;
	try {
		if (sdk.fetchBuyState) {
			const state = await sdk.fetchBuyState(pk, pk);
			curve = state.bondingCurve;
		} else if (sdk.fetchBondingCurve) {
			curve = await sdk.fetchBondingCurve(pk);
		}
	} catch (e) {
		throw rpcError(-32004, `bonding curve unavailable: ${e?.message ?? 'unknown'}`);
	}
	if (!curve) throw rpcError(-32004, 'no bonding curve found for this mint');

	const virtSol = Number(curve.virtualSolReserves?.toString?.() ?? '0');
	const virtToken = Number(curve.virtualTokenReserves?.toString?.() ?? '0');
	const realSolLamports = Number(curve.realSolReserves?.toString?.() ?? '0');
	const priceRaw = virtToken > 0 ? virtSol / virtToken : null;
	const volSol = realSolLamports / 1e9;

	return {
		post,
		priceBefore: priceRaw,
		priceAfter: priceRaw,
		deltaPct: 0,
		volBefore: volSol,
		volAfter: volSol,
		deltaVolPct: 0,
		note: 'priceBefore/After reflect current bonding curve state; historical delta requires trade data.',
	};
}

// ── pumpfun_watch_whales ───────────────────────────────────────────────────

const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111112';

async function handleWatchWhales({ mint, minUsd = 5000, durationMs = 5000 }) {
	const pk = solanaPubkey(mint);
	if (!pk) throw rpcError(-32602, 'invalid mint');

	// Cap at 10 s — serverless max execution time.
	const windowMs = Math.min(10_000, Math.max(1_000, Number(durationMs) || 5_000));
	const minUsdNum = Math.max(0, Number(minUsd) || 5000);

	const [{ BorshCoder, EventParser }, { PUMP_PROGRAM_ID, pumpIdl }] = await Promise.all([
		import('@coral-xyz/anchor'),
		import('@pump-fun/pump-sdk'),
	]);

	let solPrice = 150;
	try {
		const pr = await fetch(`https://api.jup.ag/price/v2?ids=${NATIVE_SOL_MINT}`, {
			signal: AbortSignal.timeout(3000),
		});
		const pd = await pr.json();
		const p = Number(pd?.data?.[NATIVE_SOL_MINT]?.price ?? 0);
		if (p > 0) solPrice = p;
	} catch {}

	const connection = getConnection({ network: 'mainnet' });
	const coder = new BorshCoder(pumpIdl);
	const parser = new EventParser(PUMP_PROGRAM_ID, coder);
	const mintStr = pk.toString();
	const trades = [];

	const subId = connection.onLogs(
		PUMP_PROGRAM_ID,
		(logInfo) => {
			if (logInfo.err) return;
			try {
				for (const event of parser.parseLogs(logInfo.logs)) {
					if (event.name !== 'TradeEvent') continue;
					const { mint: evMint, isBuy, solAmount, user, timestamp } = event.data;
					if (evMint.toString() !== mintStr) continue;
					const sol = Number(solAmount.toString()) / 1_000_000_000;
					const usd = sol * solPrice;
					if (usd < minUsdNum) continue;
					trades.push({
						signature: logInfo.signature,
						wallet: user.toString(),
						sideBuy: isBuy,
						usd,
						sol,
						ts: Number(timestamp.toString()) * 1000,
					});
				}
			} catch {}
		},
		'confirmed',
	);

	await new Promise((resolve) => setTimeout(resolve, windowMs));
	await connection.removeOnLogsListener(subId).catch(() => {});

	return { mint, minUsd: minUsdNum, durationMs: windowMs, count: trades.length, trades };
}

// ── getTokenTrades (real on-chain history, indexer-optional) ────────────────

// Recent trade history for a mint, read directly from chain so it works without
// the optional pump.fun indexer. Pre-graduation tokens trade against the pump
// bonding-curve program (`TradeEvent`); graduated tokens trade on the pump AMM
// pool (`BuyEvent`/`SellEvent`). We pull recent signatures for whichever account
// is live, fetch those transactions, and decode the on-chain events.
async function readTradesFromChain({ mint, limit, network }) {
	const pk = solanaPubkey(mint);
	if (!pk) throw rpcError(-32602, 'invalid mint');
	const want = Math.min(50, Math.max(1, Number(limit) || 20));
	// Fetch a few extra signatures since some touching the account aren't trades
	// (fee claims, migrations) and get filtered out during decode.
	const sigLimit = Math.min(60, want * 2);
	const connection = getConnection({ network });

	// Resolve whether the token has graduated to the AMM. A live pool means we
	// read AMM Buy/Sell events; otherwise we read bonding-curve TradeEvents.
	let pool = null;
	try {
		const ammState = await getAmmPoolState({ network, mint });
		pool = ammState?.poolKey ?? null;
	} catch (e) {
		// No pool yet (pool_not_found) or a transient AMM read failure — fall
		// through to the bonding-curve path rather than failing the request.
		void e;
	}

	const [anchor, pumpSdk, ammSdk, solPrice] = await Promise.all([
		import('@coral-xyz/anchor'),
		import('@pump-fun/pump-sdk'),
		import('@pump-fun/pump-swap-sdk'),
		getSolPriceUsd(),
	]);
	const { BorshCoder, EventParser } = anchor;

	const isAmm = !!pool;
	let address;
	let parser;
	if (isAmm) {
		address = pool;
		const coder = new BorshCoder(ammSdk.pumpAmmJson);
		parser = new EventParser(ammSdk.PUMP_AMM_PROGRAM_ID, coder);
	} else {
		const { getPumpSdkV2 } = await import('./_lib/pump.js');
		const v2 = await getPumpSdkV2({ network });
		address = v2.bondingCurvePda(pk);
		const coder = new BorshCoder(pumpSdk.pumpIdl);
		parser = new EventParser(pumpSdk.PUMP_PROGRAM_ID, coder);
	}

	const sigInfos = await connection.getSignaturesForAddress(address, { limit: sigLimit });
	if (!sigInfos.length) return { mint, network, graduated: isAmm, count: 0, trades: [] };

	const signatures = sigInfos.map((s) => s.signature);
	const mintStr = pk.toString();
	const poolStr = pool?.toString();
	const trades = [];

	function decodeTx(tx, signature) {
		const logs = tx?.meta?.logMessages;
		if (!logs || tx.meta.err) return null;
		const blockTime = tx.blockTime ? tx.blockTime * 1000 : Date.now();
		let parsed;
		try {
			parsed = parser.parseLogs(logs);
		} catch {
			return null;
		}
		for (const event of parsed) {
			if (isAmm && (event.name === 'BuyEvent' || event.name === 'SellEvent')) {
				const d = event.data;
				if (poolStr && d.pool?.toString() !== poolStr) continue;
				const isBuy = event.name === 'BuyEvent';
				const lamports = isBuy ? d.quoteAmountIn : d.quoteAmountOut;
				const tokens = isBuy ? d.baseAmountOut : d.baseAmountIn;
				const sol = Number(lamports?.toString() ?? '0') / 1e9;
				return {
					signature,
					isBuy,
					solAmount: sol,
					tokenAmount: tokens?.toString() ?? '0',
					usdValue: sol * solPrice,
					wallet: d.user?.toString() ?? null,
					timestamp: d.timestamp
						? Number(d.timestamp.toString())
						: Math.floor(blockTime / 1000),
				};
			}
			if (!isAmm && event.name === 'TradeEvent') {
				const d = event.data;
				if (d.mint?.toString() !== mintStr) continue;
				const sol = Number(d.solAmount?.toString() ?? '0') / 1e9;
				return {
					signature,
					isBuy: !!d.isBuy,
					solAmount: sol,
					tokenAmount: d.tokenAmount?.toString() ?? '0',
					usdValue: sol * solPrice,
					wallet: d.user?.toString() ?? null,
					timestamp: d.timestamp
						? Number(d.timestamp.toString())
						: Math.floor(blockTime / 1000),
				};
			}
		}
		return null;
	}

	// Fetch in small chunks and stop as soon as we have enough trades. Most
	// signatures touching the curve/pool account ARE trades, so we rarely need
	// the full window — chunking also keeps batch sizes friendly to public RPCs.
	const CHUNK = 8;
	for (let off = 0; off < signatures.length && trades.length < want; off += CHUNK) {
		const slice = signatures.slice(off, off + CHUNK);
		const txs = await connection.getTransactions(slice, {
			maxSupportedTransactionVersion: 0,
			commitment: 'confirmed',
		});
		for (let i = 0; i < txs.length && trades.length < want; i++) {
			const trade = decodeTx(txs[i], slice[i]);
			if (trade) trades.push(trade);
		}
	}

	return { mint, network, graduated: isAmm, count: trades.length, trades };
}

async function handleGetTokenTrades({ mint, limit = 20, network = 'mainnet' }) {
	// Fast path: if the indexer is configured it serves richer historical data.
	if (pumpfunBotEnabled()) {
		const r = await pumpfunMcpCall('getTokenTrades', { mint, limit });
		if (r.ok) return r.data;
		// Indexer configured but errored — fall back to on-chain reads.
	}
	return readTradesFromChain({ mint, limit, network });
}

// ── get_coin_intel ─────────────────────────────────────────────────────────

// Reads the precomputed intel snapshot from pump_coin_intel + outcome label.
// This is the highest-signal single read for a trade decision — it combines
// classification, bundle/organic analysis, smart-money presence, bubblemaps
// connectivity, risk flags, and labeled outcome into one call.
async function handleGetCoinIntel({ mint, network = 'mainnet' } = {}) {
	if (!mint || typeof mint !== 'string') throw new Error('mint required');
	const cleanMint = mint.trim();

	// Lazy import so the MCP handler loads in edge envs without DATABASE_URL.
	let sql;
	try {
		sql = (await import('./_lib/db.js')).sql;
	} catch {
		return { found: false, reason: 'database_unavailable' };
	}

	const LAMPORTS_PER_SOL = 1_000_000_000;
	const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
	const sol = (v) => { const n = num(v); return n == null ? null : Math.round(n / LAMPORTS_PER_SOL * 10000) / 10000; };

	try {
		// Main intel row
		const [row] = await sql`
			select mint, network, symbol, name, creator, image_uri, description,
				twitter, telegram, website, created_at, first_seen_at, observation_seconds,
				dev_buy_lamports, dev_sold, buy_count, sell_count,
				buy_volume_lamports, sell_volume_lamports, unique_buyers, unique_sellers,
				largest_buy_lamports, signals, bundle_score, organic_score, snipe_ratio,
				concentration_top10, fresh_wallet_ratio, bubblemap_connectivity,
				quality_score, risk_flags, category, tags, narrative, is_news_meme,
				classify_confidence, classify_source,
				smart_money_count, smart_money_score, smart_money_notable, cluster_count
			from pump_coin_intel
			where mint = ${cleanMint} and network = ${network}
			limit 1
		`;

		if (!row) return { found: false, mint: cleanMint, network };

		const signals = (row.signals && typeof row.signals === 'object') ? row.signals : {};
		const riskFlags = Array.isArray(row.risk_flags) ? row.risk_flags : [];
		const q = num(row.quality_score) ?? 0;
		const hardFlags = ['bundle_launch', 'dev_dumped', 'single_whale'];
		const hard = riskFlags.some((f) => hardFlags.includes(f));
		const verdict = hard || q < 25 ? { key: 'avoid', label: 'Avoid', tone: 'danger' }
			: q < 50 || riskFlags.length ? { key: 'caution', label: 'Caution', tone: 'warn' }
			: q < 72 ? { key: 'watch', label: 'Watch', tone: 'neutral' }
			: { key: 'strong', label: 'Strong', tone: 'success' };

		// Outcome label (may not exist yet for fresh coins)
		let outcome = null;
		try {
			const [o] = await sql`
				select outcome, graduated, rugged, ath_market_cap_usd, ath_multiple, labeled_at
				from pump_coin_outcomes where mint = ${cleanMint} limit 1
			`;
			if (o) outcome = {
				outcome: o.outcome,
				graduated: o.graduated,
				rugged: o.rugged,
				ath_market_cap_usd: num(o.ath_market_cap_usd),
				ath_multiple: num(o.ath_multiple),
				labeled_at: o.labeled_at,
			};
		} catch { /* outcome table absent — fine */ }

		// Top wallets (compact — notable ones only for the MCP response)
		let topWallets = [];
		try {
			const wrows = await sql`
				select wallet, buy_lamports, sell_lamports, is_creator, funder, first_seen_at
				from pump_coin_wallets where mint = ${cleanMint}
				order by buy_lamports desc limit 20
			`;
			const totalBuy = wrows.reduce((s, w) => s + (num(w.buy_lamports) || 0), 0) || 1;
			topWallets = wrows.map((w) => ({
				wallet: w.wallet,
				is_creator: !!w.is_creator,
				buy_sol: sol(w.buy_lamports),
				sell_sol: sol(w.sell_lamports),
				share: Math.round((num(w.buy_lamports) || 0) / totalBuy * 1000) / 1000,
				funder: w.funder || null,
			}));
		} catch { /* wallets absent — fine */ }

		// Latest model conditional win-rates (so agents see the evidence behind each signal)
		let model = null;
		try {
			const [wrow] = await sql`
				select weights, conditional_win_rates, sample_size, trained_at
				from pump_intel_weights
				where network = ${network}
				order by trained_at desc limit 1
			`;
			if (wrow) model = {
				sample_size: wrow.sample_size,
				trained_at: wrow.trained_at,
				conditional_win_rates: wrow.conditional_win_rates || null,
			};
		} catch { /* weights table absent — training hasn't run yet */ }

		const smartNotable = Array.isArray(row.smart_money_notable) ? row.smart_money_notable : [];

		// Build a plain-language summary the agent can read directly
		const parts = [];
		if (verdict.key === 'avoid') parts.push('⛔ AVOID.');
		else if (verdict.key === 'strong') parts.push('✅ Strong entry signal.');
		if (row.smart_money_count > 0)
			parts.push(`${row.smart_money_count} proven smart-money wallet${row.smart_money_count > 1 ? 's' : ''} entered (win-rate avg ${smartNotable[0]?.win_rate != null ? (smartNotable[0].win_rate * 100).toFixed(0) + '%' : 'unknown'}).`);
		if (row.dev_sold) parts.push('Dev sold during observation window — high rug risk.');
		if (riskFlags.includes('bundle_launch')) parts.push('Coordinated bundle launch detected.');
		if (row.is_news_meme && signals.news_headline) parts.push(`News-meme: "${signals.news_headline}".`);
		if (row.category && row.category !== 'unknown') parts.push(`Category: ${row.category}.`);
		if (outcome?.graduated) parts.push('GRADUATED to Raydium.');
		else if (outcome?.rugged) parts.push('Rugged.');
		else if (outcome?.ath_multiple) parts.push(`ATH ${outcome.ath_multiple.toFixed(1)}× from entry.`);
		const summary = parts.join(' ') || `Quality ${q}/100. ${riskFlags.length ? 'Risk flags: ' + riskFlags.join(', ') + '.' : 'No hard risk flags.'}`;

		return {
			found: true,
			mint: row.mint,
			network: row.network,
			symbol: row.symbol,
			name: row.name,
			creator: row.creator,
			image_uri: row.image_uri,
			has_socials: !!(row.twitter || row.telegram || row.website),
			twitter: row.twitter,
			telegram: row.telegram,
			website: row.website,
			first_seen_at: row.first_seen_at,
			observation_seconds: num(row.observation_seconds),

			// Verdict
			quality_score: q,
			verdict,
			risk_flags: riskFlags,
			summary,

			// Classification
			category: row.category || 'unknown',
			tags: Array.isArray(row.tags) ? row.tags : [],
			narrative: row.narrative,
			is_news_meme: !!row.is_news_meme,
			news_headline: signals.news_headline || null,
			news_url: signals.news_url || null,
			classify_confidence: num(row.classify_confidence),
			classify_source: row.classify_source,

			// Core signals
			organic_score: num(row.organic_score),
			bundle_score: num(row.bundle_score),
			snipe_ratio: num(row.snipe_ratio),
			concentration_top10: num(row.concentration_top10),
			fresh_wallet_ratio: num(row.fresh_wallet_ratio),
			bubblemap_connectivity: num(row.bubblemap_connectivity),
			cluster_count: num(row.cluster_count) ?? 0,
			timing_entropy: num(signals.timing_entropy),

			// Dev
			dev_buy_sol: sol(row.dev_buy_lamports),
			dev_sold: !!row.dev_sold,

			// Trade footprint
			unique_buyers: num(row.unique_buyers) ?? 0,
			unique_sellers: num(row.unique_sellers) ?? 0,
			buy_count: num(row.buy_count) ?? 0,
			sell_count: num(row.sell_count) ?? 0,
			buy_volume_sol: sol(row.buy_volume_lamports),
			sell_volume_sol: sol(row.sell_volume_lamports),
			largest_buy_sol: sol(row.largest_buy_lamports),
			buy_sell_ratio: num(signals.buy_sell_ratio),

			// Smart money
			smart_money_count: num(row.smart_money_count) ?? 0,
			smart_money_score: num(row.smart_money_score),
			smart_money_notable: smartNotable,

			// Wallet book
			top_wallets: topWallets,

			// Outcome (null if coin not yet labeled)
			outcome,
		};
	} catch (err) {
		const missing = /relation .* does not exist/i.test(String(err?.message));
		if (missing) return { found: false, reason: 'engine_tables_pending' };
		throw err;
	}
}

// ── pumpfun_bot_status (metadata, always available) ────────────────────────

// Reports whether the indexer is configured and, when it is, whether it's
// answering. Always available (never gated, never filtered) so MCP clients can
// discover backend capability without parsing tools/list. The health ping uses
// the same transport as the indexer tools (MCP tools/call against the bot) with
// a tight 3 s budget so a slow/dead bot can't stall the metadata call.
async function handlePumpfunBotStatus() {
	if (!pumpfunBotEnabled()) {
		return {
			configured: false,
			healthy: false,
			message:
				'PUMPFUN_BOT_URL is not configured. On-chain tools are available; indexer-backed discovery tools are disabled.',
		};
	}
	const url = process.env.PUMPFUN_BOT_URL.replace(/\/$/, '');
	const headers = { 'content-type': 'application/json', accept: 'application/json' };
	if (process.env.PUMPFUN_BOT_TOKEN)
		headers.authorization = `Bearer ${process.env.PUMPFUN_BOT_TOKEN}`;
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), 3000);
	const startedAt = Date.now();
	try {
		const r = await fetch(url, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: { name: 'getNewTokens', arguments: { limit: 1 } },
			}),
			signal: ctrl.signal,
		});
		const latencyMs = Date.now() - startedAt;
		if (!r.ok) return { configured: true, healthy: false, latencyMs, error: `bot ${r.status}` };
		const j = await r.json().catch(() => null);
		if (j?.error)
			return { configured: true, healthy: false, latencyMs, error: j.error.message || 'rpc error' };
		return { configured: true, healthy: true, latencyMs };
	} catch (err) {
		return {
			configured: true,
			healthy: false,
			error: err?.name === 'AbortError' ? 'timeout after 3000ms' : err?.message || 'fetch failed',
		};
	} finally {
		clearTimeout(timer);
	}
}

// ── Dispatch ───────────────────────────────────────────────────────────────

// Keyed by CANONICAL (snake_case) names. tools/call resolves legacy camelCase
// aliases through resolveToolName before this lookup.
const HANDLERS = {
	get_bonding_curve: handleGetBondingCurve,
	get_token_details: handleGetTokenDetails,
	get_token_holders: handleGetTokenHolders,
	get_coin_intel: handleGetCoinIntel,
	kol_radar: handleKolRadar,
	kol_leaderboard: handleKolLeaderboard,
	search_tokens: indexerOrUnavailable('search_tokens'),
	get_token_trades: handleGetTokenTrades,
	get_trending_tokens: indexerOrUnavailable('get_trending_tokens'),
	get_new_tokens: indexerOrUnavailable('get_new_tokens'),
	get_graduated_tokens: indexerOrUnavailable('get_graduated_tokens'),
	get_king_of_the_hill: indexerOrUnavailable('get_king_of_the_hill'),
	social_cashtag_sentiment: handleSocialCashtagSentiment,
	social_x_post_impact: handleSocialXPostImpact,
	get_creator_profile: indexerOrUnavailable('get_creator_profile'),
	pumpfun_list_claims: handleListClaims,
	pumpfun_watch_claims: handleWatchClaims,
	pumpfun_first_claims: handleGetFirstClaims,
	pumpfun_vanity_mint: handleVanityMint,
	pumpfun_watch_whales: handleWatchWhales,
	pumpfun_quote_swap: handleQuoteSwap,
	sns_resolve: handleSnsResolve,
	sns_reverseLookup: handleSnsReverseLookup,
	pumpfun_bot_status: handlePumpfunBotStatus,
};

// ── HTTP entrypoint ────────────────────────────────────────────────────────

// Keep in sync with api/_lib/mcp-dispatch.js PROTOCOL_VERSION. Declared locally
// (not imported) so this read-only lambda — and the Worker mirror — don't pull
// the usage/db graph that mcp-dispatch carries.
const PROTOCOL_VERSION = '2025-06-18';
const RESOURCE_PATH = '/api/pump-fun-mcp';
const SERVER_INFO = { name: 'three.ws-pumpfun-mcp', version: '1.0.0' };
const INSTRUCTIONS =
	'Free, read-only pump.fun + Solana tools from three.ws. ' +
	'COIN INTELLIGENCE (call first before any trade): get_coin_intel returns the full ' +
	'intelligence snapshot for a mint — bundle vs organic verdict, bubblemaps cluster ' +
	'connectivity, smart-money presence with wallet win-rates, dev behaviour, category, ' +
	'news-meme detection, risk flags, and a 0–100 quality score. ' +
	'Token discovery (search_tokens, get_trending_tokens, get_new_tokens, ' +
	'get_graduated_tokens, get_king_of_the_hill), on-chain analysis (get_bonding_curve, ' +
	'get_token_holders, get_token_details, get_token_trades), creator intelligence ' +
	'(get_creator_profile, pumpfun_list_claims, pumpfun_watch_claims, ' +
	'pumpfun_first_claims), Solana Name Service (sns_resolve, sns_reverseLookup), ' +
	'market signals (kol_radar, kol_leaderboard, pumpfun_quote_swap, ' +
	'pumpfun_watch_whales), and social sentiment (social_cashtag_sentiment, ' +
	'social_x_post_impact). Discovery tools require the indexer backend — call ' +
	'pumpfun_bot_status (always available) to check. All data is live; no API key required.';
const MAX_BATCH = 16;

// Tools that are expensive (CPU grind or long-lived RPC subscriptions) or that
// return sensitive material (a secret key). These require authentication — a
// valid bearer (OAuth access token or sk_live_/sk_test_ API key) OR a verified
// x402 micropayment. The free read-only snapshot/quote tools stay open.
const AUTH_REQUIRED_TOOLS = new Set([
	'pumpfun_vanity_mint',
	'pumpfun_watch_whales',
	'pumpfun_watch_claims',
]);

// Resolve the caller's credentials for a gated tool, once per request. Returns
//   { ok: true, x402Ctx }            x402Ctx null for bearer auth, or the
//                                    verified payment envelope to settle later
//   { ok: false, failure }           failure.kind ∈ bad_bearer | bad_payment |
//                                    no_credentials (+ message, envelope)
// The result is memoized so a batch carrying several gated calls verifies the
// bearer / X-PAYMENT exactly once and one payment covers the whole request.
async function resolveGatedAuth(req) {
	const bearer = extractBearer(req);
	if (bearer) {
		const auth = await authenticateBearer(bearer).catch(() => null);
		if (auth) return { ok: true, x402Ctx: null };
		return {
			ok: false,
			failure: {
				kind: 'bad_bearer',
				code: -32001,
				message: 'authentication required: invalid or expired bearer token',
			},
		};
	}
	const paymentHeader = req.headers['x-payment'];
	if (paymentHeader) {
		const resourceUrl = resolveResourceUrl(req, RESOURCE_PATH);
		const requirements = paymentRequirements(resourceUrl);
		try {
			const verified = await verifyPayment({ paymentHeader, requirements });
			return { ok: true, x402Ctx: { resourceUrl, requirements, verified } };
		} catch (err) {
			return {
				ok: false,
				failure: {
					kind: 'bad_payment',
					code: -32402,
					message: `payment verification failed: ${err?.message || 'invalid payment'}`,
				},
			};
		}
	}
	// No bearer, no payment: surface the full x402 envelope so paying agents
	// (and registry crawlers like zauth) can discover price/accepts. The body
	// keeps the JSON-RPC error shape MCP clients expect, with the envelope
	// mirrored in error.data and the PAYMENT-REQUIRED header (same
	// dual-protocol pattern as _mcp/auth.js).
	const resourceUrl = resolveResourceUrl(req, RESOURCE_PATH);
	const envelope = build402Body({
		resourceUrl,
		accepts: paymentRequirements(resourceUrl),
		error: 'X-PAYMENT header is required',
	});
	return {
		ok: false,
		failure: {
			kind: 'no_credentials',
			code: -32402,
			message:
				'payment or authentication required for this tool (provide a Bearer token or X-PAYMENT)',
			envelope,
		},
	};
}

// Single-request gate denial: same statuses, bodies, and headers raw JSON-RPC
// consumers have always received (401 bad bearer / 402 otherwise).
function writeGatedAuthFailure(res, id, failure) {
	if (failure.kind === 'no_credentials') {
		res.setHeader(
			'PAYMENT-REQUIRED',
			Buffer.from(JSON.stringify(failure.envelope), 'utf8').toString('base64'),
		);
	}
	const status = failure.kind === 'bad_bearer' ? 401 : 402;
	return json(
		res,
		status,
		rpcEnvelope(id, null, {
			code: failure.code,
			message: failure.message,
			...(failure.envelope ? { data: failure.envelope } : {}),
		}),
		{ 'mcp-protocol-version': PROTOCOL_VERSION },
	);
}

// Batch-mode gate denial: HTTP stays 200, the denial becomes a per-message
// JSON-RPC error (the PAYMENT-REQUIRED header is still set for discovery).
function gatedAuthFailureEnvelope(res, id, failure) {
	if (failure.kind === 'no_credentials' && !res.headersSent) {
		res.setHeader(
			'PAYMENT-REQUIRED',
			Buffer.from(JSON.stringify(failure.envelope), 'utf8').toString('base64'),
		);
	}
	return rpcEnvelope(id, null, {
		code: failure.code,
		message: failure.message,
		...(failure.envelope ? { data: failure.envelope } : {}),
	});
}

// GET/HEAD — the Streamable HTTP SSE handshake. This server never initiates
// server→client messages (stateless, request-scoped lambda), so the stream
// opens with the correct content-type and closes immediately; the spec allows
// the server to close the SSE stream at any time. All tools that don't carry
// an auth gate are free, so unlike /api/mcp-3d the handshake itself requires
// no credentials.
function handleSseHandshake(req, res) {
	res.statusCode = 200;
	res.setHeader('content-type', 'text/event-stream');
	res.setHeader('cache-control', 'no-store');
	res.setHeader('mcp-protocol-version', PROTOCOL_VERSION);
	if (req.method === 'HEAD') return res.end();
	res.write(`: ${SERVER_INFO.name} streamable-http — POST JSON-RPC 2.0 to this URL\n\n`);
	return res.end();
}

// Dispatch ONE JSON-RPC message. Returns null for notifications (no response
// is owed) or the response envelope. `ctx` carries per-request state:
//   ensureGateAuth()  memoized resolveGatedAuth for this request
//   batch             true → gate denials become per-message error envelopes
//                     (single requests keep their legacy HTTP 401/402 — the
//                     caller handles the `gateDenied` flag)
async function dispatchRpc(msg, ctx) {
	const { id = null, method: rpcMethod, params } = msg || {};
	const isNotification = msg?.id === undefined && typeof rpcMethod === 'string';

	if (rpcMethod === 'initialize') {
		return rpcEnvelope(id, {
			protocolVersion: PROTOCOL_VERSION,
			capabilities: { tools: { listChanged: false } },
			// indexerEnabled lets client authors check indexer capability without a
			// tools/list round-trip — it tracks the same env presence as the filter.
			serverInfo: { ...SERVER_INFO, indexerEnabled: pumpfunBotEnabled() },
			instructions: INSTRUCTIONS,
		});
	}
	if (rpcMethod === 'ping') return rpcEnvelope(id, {});
	if (rpcMethod === 'notifications/initialized') return null;
	if (rpcMethod === 'tools/list') {
		// Advertise indexer-backed tools only when the bot is configured, so MCP
		// clients never see a tool that would just return -32004 on call. The
		// always-on pumpfun_bot_status (not in INDEXER_TOOLS) reports capability.
		const tools = pumpfunBotEnabled()
			? TOOLS
			: TOOLS.filter((t) => !INDEXER_TOOLS.has(t.name));
		return rpcEnvelope(id, { tools });
	}
	if (rpcMethod === 'resources/list') return rpcEnvelope(id, { resources: [] });
	if (rpcMethod === 'resources/templates/list') return rpcEnvelope(id, { resourceTemplates: [] });
	if (rpcMethod === 'prompts/list') return rpcEnvelope(id, { prompts: [] });

	if (rpcMethod === 'tools/call') {
		const requestedName = params?.name;
		// Legacy camelCase aliases resolve to the canonical snake_case names —
		// both forms are accepted forever (TOOL_NAME_ALIASES is the contract).
		const name = resolveToolName(requestedName);
		// Own-property lookup only so "__proto__"/"constructor" can't resolve an
		// inherited member and pass the !handler guard.
		const handler =
			typeof name === 'string' && Object.hasOwn(HANDLERS, name) ? HANDLERS[name] : null;
		if (!handler) {
			return rpcEnvelope(id, null, { code: -32601, message: `unknown tool: ${requestedName}` });
		}
		// Auth gate: expensive (vanity grind, long-lived RPC watch) and sensitive
		// (returns a secret key) tools require a bearer or verified x402 payment.
		if (AUTH_REQUIRED_TOOLS.has(name)) {
			const authz = await ctx.ensureGateAuth();
			if (!authz.ok) {
				if (!ctx.batch) {
					ctx.gateDenied = { id, failure: authz.failure };
					return null;
				}
				return gatedAuthFailureEnvelope(ctx.res, id, authz.failure);
			}
			ctx.x402Ctx = authz.x402Ctx;
			try {
				const data = await handler(params?.arguments || {});
				ctx.gatedSuccess = true;
				ctx.gatedId = id;
				return rpcEnvelope(id, {
					content: [{ type: 'text', text: JSON.stringify(data) }],
					structuredContent: data,
				});
			} catch (err) {
				return rpcEnvelope(id, null, {
					code: err.rpcCode || -32603,
					message: err.message || 'tool error',
				});
			}
		}
		try {
			const data = await handler(params?.arguments || {});
			// Mirror MCP content shape so existing skill clients can unwrap text.
			return rpcEnvelope(id, {
				content: [{ type: 'text', text: JSON.stringify(data) }],
				structuredContent: data,
			});
		} catch (err) {
			return rpcEnvelope(id, null, {
				code: err.rpcCode || -32603,
				message: err.message || 'tool error',
			});
		}
	}

	if (isNotification) return null;
	return rpcEnvelope(id, null, { code: -32601, message: `unknown method: ${rpcMethod}` });
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,HEAD,POST,DELETE,OPTIONS', origins: '*' })) return;

	if (req.method === 'GET' || req.method === 'HEAD') return handleSseHandshake(req, res);
	if (req.method === 'DELETE') {
		// Stateless per-request server — nothing to tear down (same contract as
		// api/_mcp/auth.js handleTerminate).
		res.statusCode = 204;
		return res.end();
	}
	if (!method(req, res, ['POST'])) return;

	const rl = await limits.mcpIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	let body;
	try {
		body = await readJson(req);
	} catch {
		return json(res, 400, rpcEnvelope(null, null, { code: -32700, message: 'parse error' }));
	}

	const isBatch = Array.isArray(body);
	const messages = isBatch ? body : [body];
	if (isBatch && messages.length === 0) {
		return json(res, 200, rpcEnvelope(null, null, { code: -32600, message: 'empty batch' }), {
			'mcp-protocol-version': PROTOCOL_VERSION,
		});
	}
	if (messages.length > MAX_BATCH) {
		return json(
			res,
			200,
			rpcEnvelope(null, null, { code: -32600, message: `batch too large (max ${MAX_BATCH})` }),
			{ 'mcp-protocol-version': PROTOCOL_VERSION },
		);
	}

	// Per-request dispatch context. Gate credentials resolve at most once.
	let gateAuthPromise = null;
	const ctx = {
		res,
		batch: isBatch,
		x402Ctx: null,
		gatedSuccess: false,
		gatedId: null,
		gateDenied: null,
		ensureGateAuth() {
			if (!gateAuthPromise) gateAuthPromise = resolveGatedAuth(req);
			return gateAuthPromise;
		},
	};

	const responses = [];
	for (const msg of messages) {
		const envelope = await dispatchRpc(msg, ctx);
		// Single-request gate denial keeps the legacy 401/402 HTTP semantics.
		if (ctx.gateDenied) return writeGatedAuthFailure(res, ctx.gateDenied.id, ctx.gateDenied.failure);
		if (envelope !== null) responses.push(envelope);
	}

	// Settle the verified x402 payment AFTER gated work succeeded — atomic from
	// the payer's perspective (verify → work → settle, mirroring /api/mcp): a
	// failed tool never broadcasts the payment, and a successful one is always
	// captured so the gated work can't be delivered free or the same signed
	// payload replayed. One settlement covers the whole request.
	if (ctx.x402Ctx && ctx.gatedSuccess) {
		try {
			const settled = await settlePayment({ verified: ctx.x402Ctx.verified });
			res.setHeader('x-payment-response', encodePaymentResponseHeader(settled));
		} catch (settleErr) {
			return json(
				res,
				402,
				rpcEnvelope(ctx.gatedId, null, {
					code: -32402,
					message: `payment settlement failed: ${settleErr?.message || 'settle error'}`,
					data: build402Body({
						resourceUrl: ctx.x402Ctx.resourceUrl,
						accepts: ctx.x402Ctx.requirements,
						error: settleErr?.message || 'settle error',
					}),
				}),
				{ 'mcp-protocol-version': PROTOCOL_VERSION },
			);
		}
	}

	// All-notification requests owe no body — 202 Accepted per Streamable HTTP.
	if (responses.length === 0) {
		res.statusCode = 202;
		res.setHeader('mcp-protocol-version', PROTOCOL_VERSION);
		return res.end();
	}

	return json(res, 200, isBatch ? responses : responses[0], {
		'mcp-protocol-version': PROTOCOL_VERSION,
	});
});
