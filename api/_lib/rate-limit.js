// Distributed rate limiting via Upstash Redis. Falls back to in-memory for local dev.

import { Ratelimit } from '@upstash/ratelimit';
import { env } from './env.js';
import { getRedis } from './redis.js';

const redis = getRedis();

// Prod signal: real deployments set NODE_ENV=production (Vercel does). Tests and
// local dev never do, so the in-memory fallback stays fully permissive there.
const IS_PRODUCTION = env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production';
const REDIS_CONFIGURED = Boolean(redis);

// Loud, one-time startup warning when Redis is unconfigured in production. Without
// Redis every limiter falls back to a PER-INSTANCE in-memory map, which is
// effectively unbounded across serverless fan-out — fine for dev, dangerous for
// the money/cost limiters in prod (see failClosedLimiter below).
if (IS_PRODUCTION && !REDIS_CONFIGURED) {
	console.error(
		'[rate-limit] FATAL CONFIG: UPSTASH_REDIS_REST_URL/TOKEN are unset in production. ' +
			'Cost/money-moving limiters will FAIL CLOSED (deny) until Redis is configured; ' +
			'cheap per-IP limiters fall back to a non-distributed in-memory map.',
	);
}

const limiters = new Map();
const memoryBuckets = new Map();

// A limiter that always denies. Used in production for cost/money-moving buckets
// when Redis is absent: better to 503 a paid action than to silently allow
// unbounded spend across serverless instances.
function failClosedLimiter({ limit, window }) {
	const ms = parseWindowMs(window);
	return {
		async limit() {
			return {
				success: false,
				limit,
				remaining: 0,
				reset: Date.now() + ms,
				reason: 'rate_limiter_unavailable',
			};
		},
	};
}

/**
 * @param {string} name
 * @param {{ limit: number, window: string, critical?: boolean, local?: boolean }} opts
 *   `critical: true` marks a cost/money-moving bucket. When Redis is absent in
 *   production these fail closed (deny) instead of using the unbounded in-memory
 *   fallback. Non-critical buckets keep the permissive in-memory fallback so a
 *   missing-Redis misconfig degrades read endpoints gracefully rather than
 *   taking the whole site down.
 *   `local: true` deliberately enforces per-instance, in-memory only — never a
 *   Redis command. For high-frequency, cheap-read buckets (status polling) whose
 *   only job is to bound poll floods, per-instance caps bound throughput just as
 *   well (limit × warm instances, and Vercel bounds instances), and the saved
 *   commands are what keep the Upstash quota alive (June 2026 outage). Never
 *   combine with `critical`.
 */
function getLimiter(name, opts) {
	const key = `${name}:${opts.limit}:${opts.window}`;
	if (limiters.has(key)) return limiters.get(key);
	if (opts.local) {
		const lim = memoryLimiter(opts);
		limiters.set(key, lim);
		return lim;
	}
	if (!redis) {
		const lim = opts.critical && IS_PRODUCTION ? failClosedLimiter(opts) : memoryLimiter(opts);
		limiters.set(key, lim);
		return lim;
	}
	const rl = new Ratelimit({
		redis,
		limiter: Ratelimit.slidingWindow(opts.limit, opts.window),
		prefix: `rl:${name}`,
		analytics: false,
	});
	const resilient = resilientLimiter(rl, name, opts);
	limiters.set(key, resilient);
	return resilient;
}

// One warn per limiter name per cooldown — a Redis outage hits every request,
// so unthrottled logging would itself become a denial-of-service on the logs.
const _degradeWarnedAt = new Map();
const DEGRADE_WARN_COOLDOWN_MS = 60_000;
function warnDegradedOnce(name, err) {
	const last = _degradeWarnedAt.get(name) || 0;
	const t = Date.now();
	if (t - last < DEGRADE_WARN_COOLDOWN_MS) return;
	_degradeWarnedAt.set(name, t);
	console.warn(
		`[rate-limit] redis degraded for "${name}", limiter served from fallback decision:`,
		err?.message || err,
	);
}

// Wrap a real (Redis-backed) Ratelimit so a Redis error — most importantly the
// account-wide "max requests limit exceeded" over-quota UpstashError — degrades
// instead of throwing an unhandled 500 out of every route. Non-critical buckets
// (the read/public/auth-IP limiters every page hits) FAIL OPEN: a limiter
// outage must never take down the API. Critical buckets (cost/money-moving)
// FAIL CLOSED: better to 503 a paid action than allow unbounded spend when the
// distributed limiter is blind.
function resilientLimiter(rl, name, opts) {
	const ms = parseWindowMs(opts.window);
	const failClosed = Boolean(opts.critical) && IS_PRODUCTION;
	return {
		async limit(id) {
			try {
				return await rl.limit(id);
			} catch (err) {
				warnDegradedOnce(name, err);
				if (failClosed) {
					return {
						success: false,
						limit: opts.limit,
						remaining: 0,
						reset: Date.now() + ms,
						reason: 'rate_limiter_unavailable',
					};
				}
				return {
					success: true,
					limit: opts.limit,
					remaining: opts.limit,
					reset: Date.now() + ms,
					reason: 'rate_limiter_degraded',
				};
			}
		},
	};
}

// Eviction for the in-memory fallback. The map otherwise grows one entry per
// distinct key forever (a scanner rotating IPs would balloon a long-lived dev
// process). Only sweeps when the map is over the cap, so the amortized cost on
// the hot path is O(1); the sweep itself drops every bucket whose newest
// timestamp predates the largest window any memory limiter uses (conservative
// — never evicts an entry a live limiter could still count).
const MEMORY_BUCKETS_MAX = 10_000;
let maxMemoryWindowMs = 60_000;
function sweepMemoryBuckets(now) {
	if (memoryBuckets.size <= MEMORY_BUCKETS_MAX) return;
	const cutoff = now - maxMemoryWindowMs;
	for (const [id, timestamps] of memoryBuckets) {
		if (!timestamps.length || timestamps[timestamps.length - 1] <= cutoff) {
			memoryBuckets.delete(id);
		}
	}
}

function memoryLimiter({ limit, window }) {
	const ms = parseWindowMs(window);
	if (ms > maxMemoryWindowMs) maxMemoryWindowMs = ms;
	return {
		async limit(id) {
			const now = Date.now();
			sweepMemoryBuckets(now);
			const bucket = memoryBuckets.get(id) || [];
			const cutoff = now - ms;
			const kept = bucket.filter((t) => t > cutoff);
			if (kept.length >= limit) {
				memoryBuckets.set(id, kept);
				return { success: false, limit, remaining: 0, reset: kept[0] + ms };
			}
			kept.push(now);
			memoryBuckets.set(id, kept);
			return { success: true, limit, remaining: limit - kept.length, reset: now + ms };
		},
	};
}

function parseWindowMs(w) {
	const m = /^(\d+)\s*(ms|s|m|h|d)$/.exec(w);
	if (!m) return 60_000;
	const n = parseInt(m[1], 10);
	const unit = m[2];
	return n * { ms: 1, s: 1e3, m: 60e3, h: 3600e3, d: 86400e3 }[unit];
}

// Preset limiters. Tune once viral traffic shape is known.
export const limits = {
	// Auth-critical buckets gate credential guessing / account-creation spam.
	// Marked critical so a Redis outage in prod fails closed (deny) instead of
	// degrading to the per-instance memory map — across serverless fan-out that
	// fallback is effectively no limit at all on a brute-force attempt.
	authIp: (ip) => getLimiter('auth:ip', { limit: 30, window: '10 m', critical: true }).limit(ip),
	registerIp: (ip) =>
		getLimiter('register:ip', { limit: 5, window: '1 h', critical: true }).limit(ip),
	// pump.fun coin metadata upload (name/symbol/image → R2 JSON). Cheap and
	// idempotent, so it gets its own bucket instead of draining the strict
	// `authIp` budget shared by on-chain buy/sell/launch actions. Iterating in
	// the launch wizard would otherwise lock the user out of trading for 10 min.
	pumpMetaIp: (ip) => getLimiter('pump:meta:ip', { limit: 60, window: '10 m' }).limit(ip),
	// Same-origin image proxy (api/img). A token-cloud view loads dozens of
	// thumbnails at once, so the ceiling is generous — but bounded so the proxy
	// can't be turned into an open bandwidth relay. Responses are CDN-cached.
	imgProxyIp: (ip) => getLimiter('img:ip', { limit: 300, window: '5 m' }).limit(ip),
	// Live holder-cohort reads (api/coin/:mint/cohorts for un-snapshotted agent
	// tokens) fan out to a paid Helius getTokenAccounts walk. Responses are CDN-
	// cached, so this only gates cache-miss origin hits — generous for an
	// interactive panel, tight enough that one IP can't run up the Helius bill.
	cohortsIp: (ip) => getLimiter('cohorts:ip', { limit: 45, window: '5 m' }).limit(ip),
	oauthRegisterIp: (ip) =>
		getLimiter('oauth:register:ip', { limit: 10, window: '1 h' }).limit(ip),
	// zauth RepoScan pass-through (api/zauth-reposcan). Each POST forwards to
	// zauth's paid x402 endpoint and each GET polls a scan session; cap per IP
	// so one caller can't use the proxy as a relay to hammer their upstream.
	zauthScanIp: (ip) => getLimiter('zauthscan:ip', { limit: 30, window: '1 m' }).limit(ip),
	// aixbt intelligence bridge (api/aixbt/*). Each call may fall through to the
	// upstream aixbt REST API, which is rate-limited per key — cap per IP so one
	// caller can't drain the shared key's budget. Reads are cached, so this is
	// generous enough for an interactive feed. The global ceiling prevents many
	// distributed IPs from collectively exhausting the shared upstream key.
	aixbtIp: (ip) => getLimiter('aixbt:ip', { limit: 90, window: '1 m' }).limit(ip),
	aixbtGlobal: () => getLimiter('aixbt:global', { limit: 1800, window: '1 h' }).limit('global'),
	// Solana Developer Platform proxy (api/sdp/*). Each call fronts the SDP API
	// under our server-side key, and writes (wallet create / issuance / payment)
	// move real value, so cap per IP to keep that egress bounded and prevent the
	// shared key's quota from being drained by one caller. Generous enough for an
	// interactive dashboard; reads are not cached so this gates every origin hit.
	sdpIp: (ip) => getLimiter('sdp:ip', { limit: 60, window: '1 m' }).limit(ip),
	// Avatar custodial-wallet payouts (api/agent/send-sol). The per-send USD cap
	// and per-IP limit bound a single call, but neither bounds total daily outflow
	// if the demo token leaks or many IPs are used. This wallet-wide daily ceiling
	// (keyed on the wallet pubkey, not the caller) caps aggregate payouts to
	// N × per-send-cap per day. Critical → fails closed in prod without Redis so a
	// missing limiter can never silently uncap a money-moving endpoint.
	avatarPayoutDaily: (walletAddr) =>
		getLimiter('avatar:payout:daily', { limit: 50, window: '24 h', critical: true }).limit(
			walletAddr,
		),
	mcpUser: (userId) => getLimiter('mcp:user', { limit: 1200, window: '1 m' }).limit(userId),
	mcpIp: (ip) => getLimiter('mcp:ip', { limit: 600, window: '1 m' }).limit(ip),
	// Paid MCP tools — each call runs real compute (glTF validation / inspection
	// / optimization on a fetched model). Marked critical so they fail closed in
	// prod without Redis rather than allowing unbounded paid work per instance.
	mcpValidate: (key) =>
		getLimiter('mcp:validate', { limit: 10, window: '1 m', critical: true }).limit(key),
	mcpInspect: (key) =>
		getLimiter('mcp:inspect', { limit: 30, window: '1 m', critical: true }).limit(key),
	mcpOptimize: (key) =>
		getLimiter('mcp:optimize', { limit: 10, window: '1 m', critical: true }).limit(key),
	// 3D Studio MCP. Generation submits a real GPU job on Replicate (text→image
	// and/or image→3D reconstruction) that costs real money, so it gets a hard
	// hourly ceiling per principal. Status polling is cheap and frequent.
	mcp3dGenerate: (key) =>
		getLimiter('mcp3d:generate', { limit: 30, window: '1 h', critical: true }).limit(key),
	// Free generation lane (NVIDIA NIM TRELLIS draft). No Replicate/vendor spend,
	// so it gets a much higher per-principal ceiling than the paid bucket and is
	// NON-critical: a Redis outage must never deny a zero-cost generation (fail
	// open), unlike the paid lane which fails closed to protect spend. A real
	// human iterating on a prompt routinely exceeds 12/h; this lane lets them.
	mcp3dGenerateFree: (key) =>
		getLimiter('mcp3d:generate:free', { limit: 60, window: '1 h' }).limit(key),
	// Holder perk (Lever 2): $THREE tiers raise the free-generation ceiling by their
	// rate multiplier. Same per-key counter + prefix as the base free lane — the tier
	// only lifts the threshold, so a holder iterating heavily isn't throttled at 60/h.
	// `multiplier` comes from a verified tier pass (pure HMAC, no RPC on the hot path).
	mcp3dGenerateFreeTiered: (key, multiplier = 1) =>
		getLimiter('mcp3d:generate:free', {
			limit: Math.max(60, Math.round(60 * (Number(multiplier) || 1))),
			window: '1 h',
		}).limit(key),
	// Status polling is the highest-frequency call in the generation flow (every
	// active job polls every few seconds, plus the /forge health pill). It only
	// guards against pathological poll floods, so it is enforced per instance
	// (`local`) — spending a distributed Redis command per poll is what drained
	// the Upstash quota without buying any real protection here.
	mcp3dStatus: (key) =>
		getLimiter('mcp3d:status', { limit: 240, window: '1 m', local: true }).limit(key),
	// Forge prompt enhancer — one free-tier LLM rewrite per call. Cheap text
	// completion, but each one hits an upstream provider, so cap per principal to
	// keep that egress bounded. Non-critical: a Redis outage must never block a
	// rewrite (the enhancer degrades gracefully to the original prompt anyway).
	forgeEnhance: (key) => getLimiter('forge:enhance', { limit: 40, window: '1 h' }).limit(key),
	// x402 Bazaar MCP. Discovery calls fan out to external facilitators, so cap
	// per principal to keep that egress bounded without throttling normal use.
	mcpBazaar: (key) =>
		getLimiter('mcp:bazaar', { limit: 60, window: '1 m', critical: true }).limit(key),
	// threews-agent MCP. Read/discovery calls are cheap; pay_and_call moves real
	// money, so it gets a much tighter ceiling on top of the per-spend caps.
	mcpAgent: (key) =>
		getLimiter('mcp:agent', { limit: 60, window: '1 m', critical: true }).limit(key),
	mcpAgentPay: (key) =>
		getLimiter('mcp:agent:pay', { limit: 20, window: '1 m', critical: true }).limit(key),
	oauthToken: (clientId) =>
		getLimiter('oauth:token', { limit: 120, window: '1 m' }).limit(clientId),
	upload: (userId) => getLimiter('upload', { limit: 60, window: '1 h' }).limit(userId),
	avatarPatch: (userId) => getLimiter('avatar:patch', { limit: 20, window: '1 h' }).limit(userId),
	prefsWrite: (userId) => getLimiter('prefs:write', { limit: 30, window: '1 h' }).limit(userId),
	// Per-user budget for the embeddings endpoint (api/agents/:id/embed — free
	// NVIDIA NIM lane first, paid Voyage fallback). Keyed by userId (not IP) so
	// the shared platform keys/quotas can't be drained by one account rotating
	// IPs. recall() embeds one query at a time, so a generous per-minute
	// ceiling still leaves headroom for interactive memory search.
	embedUser: (userId) => getLimiter('embed:user', { limit: 120, window: '1 m' }).limit(userId),
	avatarRollback: (userId) =>
		getLimiter('avatar:rollback', { limit: 10, window: '1 h' }).limit(userId),
	// Chat inference spends real money on the host's LLM keys, so these are
	// critical: a Redis outage in prod fails closed (deny) rather than handing out
	// unbounded paid inference. chatUser/chatIp bound a single account/IP.
	chatUser: (userId) =>
		getLimiter('chat:user', { limit: 40, window: '1 m', critical: true }).limit(userId),
	chatIp: (ip) => getLimiter('chat:ip', { limit: 60, window: '1 m', critical: true }).limit(ip),
	// Global ceiling on inference billed to the HOST's provider keys (i.e. callers
	// who supplied no key of their own). Stops distributed abuse — many accounts
	// each under their per-user limit collectively draining the platform's quota.
	chatHostKeyGlobal: () =>
		getLimiter('chat:hostkey:global', { limit: 1200, window: '1 m', critical: true }).limit(
			'global',
		),
	// AI bounty judge (api/bounties/:id/judge). Each run spends real LLM tokens
	// scoring a whole field of submissions, so cap per poster and fail closed
	// without Redis in prod rather than allowing unbounded paid inference.
	bountyJudge: (userId) =>
		getLimiter('bounty:judge:user', { limit: 30, window: '1 h', critical: true }).limit(userId),
	// Agent action-log append (api/agent-actions POST). Append-only, never-deleted
	// table, so cap per user to prevent unbounded storage growth from a script.
	agentActionAppend: (userId) =>
		getLimiter('agent:action:append', { limit: 120, window: '1 m' }).limit(userId),
	// Bounty creation + submission. Both are authenticated writes to public,
	// everyone-reads tables, so cap per user to stop one account scripting spam
	// that pollutes the feed and bloats storage.
	bountyCreate: (userId) =>
		getLimiter('bounty:create', { limit: 15, window: '1 h' }).limit(userId),
	bountySubmit: (userId) =>
		getLimiter('bounty:submit', { limit: 40, window: '1 h' }).limit(userId),
	// Direct messages between friends — its own bucket so DM spam can't starve
	// world-chat posting and vice versa. Mirrors world chat's order of magnitude.
	dmSend: (userId) => getLimiter('dm:send', { limit: 30, window: '1 m' }).limit(userId),
	// Demo /api/x402-pay — agent wallet pays real USDC per call, so we keep the
	// per-IP burst small (6/min ≈ $0.006/min) and rely on the agent wallet
	// balance as the global ceiling.
	x402PayIp: (ip) => getLimiter('x402:pay:ip', { limit: 6, window: '1 m' }).limit(ip),
	x402PayGlobal: () =>
		getLimiter('x402:pay:global', { limit: 600, window: '1 h', critical: true }).limit(
			'global',
		),
	// x402 checkout analytics record (api/x402-checkout-record). Public + write,
	// so bound per-IP to stop an attacker scripting fabricated revenue rows.
	x402RecordIp: (ip) => getLimiter('x402:record:ip', { limit: 30, window: '1 m' }).limit(ip),
	checkName: (ip) => getLimiter('check-name:ip', { limit: 60, window: '1 m' }).limit(ip),
	ensResolve: (ip) => getLimiter('ens:resolve:ip', { limit: 60, window: '1 m' }).limit(ip),
	snsResolve: (ip) => getLimiter('sns:resolve:ip', { limit: 60, window: '1 m' }).limit(ip),
	// Generic public read endpoints (explore, showcase, public agent fetch). 60/min per IP.
	// local: high-frequency public reads with no side effects — the only job is
	// flood protection, and a per-instance cap (60 × warm instances, bounded by
	// Vercel) bounds one IP's throughput just as well without spending a Redis
	// command per page view. The largest single source of avoidable quota burn.
	publicIp: (ip) => getLimiter('public:ip', { limit: 60, window: '1 m', local: true }).limit(ip),
	// Client-side error report ingestion (api/client-errors). The browser
	// reporter batches and caps itself at 25 events/page, so legitimate traffic
	// is a handful of requests per pageview even on a broken page; 30/min per
	// IP absorbs that while keeping log-flooding abuse bounded.
	clientErrorsIp: (ip) => getLimiter('client-errors:ip', { limit: 30, window: '1 m' }).limit(ip),
	// Publishing a /play build to a coin's featured surface (R20). Each write stores
	// a screenshot in Redis, so cap the burst per IP to keep that bounded; reads use
	// the generic publicIp bucket.
	buildPublishIp: (ip) => getLimiter('build:publish:ip', { limit: 10, window: '10 m' }).limit(ip),
	// Browser Solana JSON-RPC proxy (api/solana-rpc). Forwards to the keyed
	// upstream (Helius), so cap per-IP burst to keep the studio launch panel
	// responsive while preventing anonymous quota drain, plus a global hourly
	// ceiling as a hard cost cap independent of any one client.
	solanaRpcIp: (ip) => getLimiter('solana-rpc:ip', { limit: 120, window: '1 m' }).limit(ip),
	solanaRpcGlobal: () =>
		getLimiter('solana-rpc:global', { limit: 12000, window: '1 h' }).limit('global'),
	// Agent-to-agent economy demo (api/agent-economy/transact). Each call can send
	// a tiny real SOL payment from the server wallet, so cap per-IP and add a
	// global daily ceiling as a hard spend cap independent of wallet balance.
	// The global bucket is only consumed when a payment actually fires.
	agentEconomyIp: (ip) => getLimiter('agent-economy:ip', { limit: 10, window: '1 h' }).limit(ip),
	agentEconomyGlobal: () =>
		getLimiter('agent-economy:global', { limit: 500, window: '1 d' }).limit('global'),
	// IBM watsonx.ai Granite embeddings (api/watsonx/embed). Each call bills real
	// watsonx inference against the server key, so keep the per-IP burst small and
	// add a global hourly ceiling as a hard cost cap independent of any one client.
	watsonxEmbedIp: (ip) => getLimiter('watsonx:embed:ip', { limit: 20, window: '1 m' }).limit(ip),
	watsonxEmbedGlobal: () =>
		getLimiter('watsonx:embed:global', { limit: 600, window: '1 h' }).limit('global'),
	// IBM Granite Guardian governance (api/guardian/assess). Each request fans out
	// to one Granite Guardian classifier pass per risk against the server watsonx
	// key, so cap the per-IP burst and keep a global hourly ceiling as a cost cap.
	guardianIp: (ip) => getLimiter('guardian:ip', { limit: 30, window: '1 m' }).limit(ip),
	guardianGlobal: () =>
		getLimiter('guardian:global', { limit: 1200, window: '1 h' }).limit('global'),
	// Granite identity-integrity check (api/agents/identity-check). Each call does
	// one Granite embedding + a fan-out of Guardian passes against the server key,
	// so keep the per-IP burst tight and add a global hourly ceiling as a cost cap.
	identityCheckIp: (ip) =>
		getLimiter('identity-check:ip', { limit: 20, window: '1 m' }).limit(ip),
	identityCheckGlobal: () =>
		getLimiter('identity-check:global', { limit: 600, window: '1 h' }).limit('global'),
	// Skills marketplace browse — isolated bucket so traffic on other public endpoints
	// can't starve the skills list. 60/min per IP.
	skillsBrowse: (ip) => getLimiter('skills:browse', { limit: 60, window: '1 m' }).limit(ip),
	// Marketplace agent preview chat — anonymous "try before fork" flow on the
	// agent detail page. Strict per-IP and per-agent caps so one client can't
	// drain LLM credits and one agent can't starve the global pool.
	previewIp: (ip) => getLimiter('preview:ip', { limit: 30, window: '1 h' }).limit(ip),
	previewAgent: (agentId) =>
		getLimiter('preview:agent', { limit: 200, window: '1 h' }).limit(agentId),
	widgetWrite: (userId) => getLimiter('widget:write', { limit: 60, window: '1 m' }).limit(userId),
	// local: embedded-widget read fetch — flood protection only, no side effects.
	// Widgets on third-party pages poll continuously, so a Redis command per read
	// at 600/min is pure burn; a per-instance cap bounds throughput just as well.
	widgetRead: (ip) =>
		getLimiter('widget:read', { limit: 600, window: '1 m', local: true }).limit(ip),
	// Per-widget visitor chat. Limit is dynamic — one bucket per (widgetId, perMinute).
	widgetChat: ({ ip, widgetId, perMinute }) =>
		getLimiter('widget:chat', {
			limit: Math.max(1, Math.min(60, perMinute || 8)),
			window: '1 m',
		}).limit(`${widgetId}:${ip}`),
	// We-pay LLM proxy: 60 req/min per IP (global floor), and per-agent dynamic bucket.
	embedLlmIp: (ip) => getLimiter('embed:llm:ip', { limit: 60, window: '1 m' }).limit(ip),
	embedLlmAgent: (agentId, perMin) =>
		getLimiter('embed:llm:agent', {
			limit: Math.max(1, Math.min(1000, perMin || 10)),
			window: '1 m',
		}).limit(agentId),
	// Autonomous agent skill purchases: 10 per hour per buyer agent to prevent runaway spending.
	// Critical (moves real money) — fail closed in prod without Redis.
	agentBuy: (agentId) =>
		getLimiter('agent:buy', { limit: 10, window: '1 h', critical: true }).limit(agentId),
	// Gas-spending endpoints: 10 redeems per 5 minutes per IP
	strict: (key) =>
		getLimiter('permissions:redeem:strict', { limit: 10, window: '5 m' }).limit(key),
	pinUser: (userId) => getLimiter('pin:user', { limit: 30, window: '1 h' }).limit(userId),
	// local: pin-status poll — read-only progress check, flood guard only. The
	// pin UI polls this on an interval, so a per-instance cap saves a Redis
	// command per poll without weakening the throughput bound.
	pinStatusIp: (ip) =>
		getLimiter('pin:status:ip', { limit: 60, window: '1 m', local: true }).limit(ip),
	agentByAddress: (ip) =>
		getLimiter('agents:by-address', { limit: 120, window: '1 m' }).limit(ip),
	pricingPerIp: (ip) => getLimiter('pricing:ip', { limit: 120, window: '1 m' }).limit(ip),
	walletLink: (userId) => getLimiter('wallet:link', { limit: 10, window: '10 m' }).limit(userId),
	// Agent wallet read endpoints (GET balance, activity). Per authenticated user.
	walletRead: (userId) => getLimiter('wallet:read', { limit: 60, window: '1 m' }).limit(userId),
	agentSuggest: (ip) => getLimiter('agents:suggest', { limit: 120, window: '1 m' }).limit(ip),
	// On-chain agent registration (register_agent MCP tool). Each call may mint a
	// Core asset + Agent Identity PDA — real SOL spend — so this is deliberately
	// tight, keyed per authenticated user.
	agentRegister: (userId) =>
		getLimiter('agent:register', { limit: 12, window: '1 h' }).limit(userId),
	read: (ip) => getLimiter('permissions:read', { limit: 300, window: '1 m' }).limit(ip),
	permissionsGrant: (userId) =>
		getLimiter('permissions:grant', { limit: 10, window: '1 h' }).limit(userId),
	permissionsRevoke: (userId) =>
		getLimiter('permissions:revoke', { limit: 20, window: '1 h' }).limit(userId),
	apiKeyManage: (userId) =>
		getLimiter('api-key:manage', { limit: 30, window: '1 h' }).limit(userId),
	// Auth-critical (see authIp/registerIp above): brute-forcing verification
	// codes / spamming reset+verify emails must fail closed when Redis is down.
	verifyEmailIp: (ip) =>
		getLimiter('verify-email:ip', { limit: 10, window: '15 m', critical: true }).limit(ip),
	forgotPasswordEmail: (email) =>
		getLimiter('forgot-password:email', { limit: 3, window: '15 m', critical: true }).limit(
			email,
		),
	resendVerifyUser: (userId) =>
		getLimiter('resend-verify:user', { limit: 2, window: '10 m', critical: true }).limit(
			userId,
		),
	newsletterIp: (ip) => getLimiter('newsletter:ip', { limit: 5, window: '1 h' }).limit(ip),
	// Voice cloning: expensive ElevenLabs API call — 3 per user per day.
	// Critical (real per-call cost) — fail closed in prod without Redis.
	voiceClone: (userId) =>
		getLimiter('voice:clone', { limit: 3, window: '1 d', critical: true }).limit(userId),
	// Persona extraction: Claude API call — 5 per user per day.
	personaExtract: (userId) =>
		getLimiter('persona:extract', { limit: 5, window: '1 d' }).limit(userId),
	agentDelegate: (key) => getLimiter('agent:delegate', { limit: 10, window: '1 m' }).limit(key),
	// GitHub memory seeding: expensive (GitHub API + Claude). 1 seed per agent per 24 hours.
	memorySeed: (agentId) => getLimiter('memory:seed', { limit: 1, window: '1 d' }).limit(agentId),
	// Edge TTS: free upstream but cached in R2 — limit unique synthesis requests per user/min.
	ttsEdge: (userId) => getLimiter('tts:edge', { limit: 20, window: '1 m' }).limit(userId),
	// OpenAI TTS (api/tts/speak) — paid per-character against the server key. Per
	// user, and critical so it fails closed in prod without Redis rather than
	// allowing unbounded paid synthesis. Anonymous callers (keyed by IP) get a
	// much tighter bucket since they share no accountable identity.
	ttsSpeakUser: (userId) =>
		getLimiter('tts:speak:user', { limit: 40, window: '1 h', critical: true }).limit(userId),
	ttsSpeakIp: (ip) =>
		getLimiter('tts:speak:ip', { limit: 10, window: '1 h', critical: true }).limit(ip),
	// /brain multi-LLM proxy. Paid flagship models (Claude/GPT-4o) run on the
	// server keys, so meter per principal: authenticated users get a generous
	// per-user bucket, anonymous callers a tighter per-IP one. Both critical so a
	// missing Redis in prod fails closed instead of opening the paid floodgate.
	brainChatUser: (userId) =>
		getLimiter('brain:chat:user', { limit: 60, window: '1 m', critical: true }).limit(userId),
	brainChatIp: (ip) =>
		getLimiter('brain:chat:ip', { limit: 20, window: '1 m', critical: true }).limit(ip),
	// X (Twitter) memory seeding: 1 seed per agent per 6 hours.
	xSeed: (agentId) => getLimiter('memory:seed:x', { limit: 1, window: '6 h' }).limit(agentId),
	// Withdrawal requests: 5 per user per day to prevent spam.
	withdrawalPerUser: (userId) =>
		getLimiter('withdrawal:user', { limit: 5, window: '1 d' }).limit(userId),
	// Per-user audit-log reads — the page polls on mount + "load older". 120/min
	// per user is generous for browse but discourages scraping the full year.
	// local: per-user browse/poll of one's own audit log — no side effects, no
	// shared resource. A per-instance 120/min still discourages bulk scraping
	// while spending zero Redis commands on a mount-poll + "load older" surface.
	auditLogRead: (userId) =>
		getLimiter('audit-log:read', { limit: 120, window: '1 m', local: true }).limit(userId),
	// Notifications inbox poll — the nav badge polls every 30s and re-polls on
	// each navigation + tab focus. Keyed by userId with its own generous bucket so
	// it never competes with the strict per-IP `authIp` budget (which a shared
	// office/NAT IP would otherwise exhaust, 429-ing the badge for everyone).
	// local: pure poll-flood guard on a read with no side effects and no shared
	// resource — a per-instance cap suffices, and at one Redis command per poll
	// (every 30s × focus/navigation re-polls × every signed-in user) this is one
	// of the heaviest avoidable burners. Never critical.
	notificationsRead: (userId) =>
		getLimiter('notifications:read', { limit: 120, window: '1 m', local: true }).limit(userId),
	// $THREE token payment layer (api/token/*).
	// quote: 30 per user per minute — prevents price-polling abuse; each quote
	//   hits a live price feed and signs a HMAC. Generous enough for interactive
	//   flows (spin UI, listing flow) and burst-resistant for agent consumers.
	tokenQuote: (userId) => getLimiter('token:quote', { limit: 30, window: '1 m' }).limit(userId),
	// settle: 10 per user per minute — each settle does an RPC round-trip + DB
	//   write. A real user sends 1 tx; the ceiling absorbs retries + latency.
	tokenSettle: (userId) => getLimiter('token:settle', { limit: 10, window: '1 m' }).limit(userId),
	// price: public endpoint, 120/min per IP — fast cache-served; upstream
	//   Jupiter is rate-limit-free, but the cache makes this essentially free.
	// local: cache-served price reads; upstream Jupiter is rate-limit-free, so
	// this bucket only bounds poll floods. A per-instance cap does that without
	// a Redis command per quote refresh on a high-traffic public endpoint.
	tokenPriceIp: (ip) =>
		getLimiter('token:price:ip', { limit: 120, window: '1 m', local: true }).limit(ip),
	// Livepeer LLM comparison endpoint — calls both Claude and Livepeer per POST.
	// Per-IP only (unauthenticated public demo). Critical so Redis outage in prod
	// fails closed rather than opening the LLM floodgate.
	livepeerIp: (ip) =>
		getLimiter('livepeer:ip', { limit: 20, window: '1 m', critical: true }).limit(ip),
	// Talking-avatar video generation — submits GPU jobs to Cloud Run. Each job
	// costs real compute. Per-user ceiling (authenticated endpoint). Critical.
	videoGenerateUser: (userId) =>
		getLimiter('video:generate:user', { limit: 5, window: '1 h', critical: true }).limit(userId),
	videoGenerateGlobal: () =>
		getLimiter('video:generate:global', { limit: 100, window: '1 h', critical: true }).limit(
			'global',
		),
	// Oracle personal Telegram test-alert (api/oracle/test-alert). Fires a real
	// Telegram message via the bot, so keep per-IP burst tight to prevent spamming
	// third-party chats. 5 per 10 minutes is generous enough for manual setup
	// retries while blocking scripted abuse.
	oracleTelegramTestIp: (ip) =>
		getLimiter('oracle:tg-test:ip', { limit: 5, window: '10 m' }).limit(ip),
};

// Trust only proxy headers that Vercel itself sets and signs. Naively reading
// X-Forwarded-For (or X-Real-IP, which clients can also supply directly) lets
// callers bypass per-IP rate limits by rotating the claimed address.
//
// Order of trust:
//   1. x-vercel-forwarded-for — set by the Vercel edge on every proxied
//      request; clients cannot inject it past the platform.
//   2. socket remote address — authoritative on direct connections (local
//      dev / tests, where no Vercel headers exist).
//   3. x-real-ip — last resort only, for non-Vercel reverse-proxy setups where
//      the socket address is the proxy's. Client-settable on direct hits, but
//      by this point there is no better signal.
export function clientIp(req) {
	const vercel = req.headers['x-vercel-forwarded-for'];
	if (vercel) return String(vercel).split(',')[0].trim();
	const sock = req.socket?.remoteAddress;
	if (sock) return sock;
	const real = req.headers['x-real-ip'];
	if (real) return String(real).split(',')[0].trim();
	return '0.0.0.0';
}
