// api/_lib/x402/autonomous-registry.js
//
// Registry of x402 endpoints the autonomous spend loop calls on a schedule.
// Every entry is a self-call to a three.ws x402 endpoint or an external service
// discovered via the bazaar. The loop in api/cron/x402-autonomous-loop.js
// picks entries whose cooldown has elapsed, pays, and records to x402_autonomous_log.
//
// Fields per entry:
//   id             — unique string key (used as Redis cooldown key)
//   name           — human label for logs and analytics
//   path           — URL path (self-calls) OR full URL (external)
//   method         — 'GET' | 'POST' (default 'POST')
//   body           — request body (for POST), can be a function(ctx) => object
//   cooldown_s     — minimum seconds between calls (enforced via Redis)
//   priority       — 1-100; higher = more likely selected when multiple are ready
//   pipeline       — tag: 'oracle' | 'health' | 'volume' | 'sniper' | 'qa' | 'forge' | 'discovery' | 'external'
//   enabled        — boolean; set false to pause without removing
//   extractSignal  — optional fn(responseBody) => object stored in x402_autonomous_log.signal_data
//                    For oracle pipeline entries, return { mint?, signal, confidence, headline }
//   resolveTarget  — optional async fn(ctx) => { path, targetUrl } that computes the
//                    request path dynamically per call (ctx: { redis, origin, runId }).
//                    For pipelines that rotate over a set of resources.
//   storeValue     — optional async fn(ctx) that persists extracted value to a
//                    dedicated table (ctx: { sql, redis, responseBody, signalData,
//                    runId, targetUrl, endpointUrl, origin, durationMs, success }).
//                    The loop wraps it in try/catch so a DB failure can never
//                    crash the tick.
//   run            — optional async fn(ctx) that owns its full call sequence,
//                    payments (via the shared payX402 client), per-call recording
//                    and value extraction. The loop hands it { origin, buyer,
//                    conn, blockhash, mintInfo, redis, sql, log, runId,
//                    remainingCap } and records the returned aggregate as one
//                    summary row. Used for multi-call pipelines (e.g. the bazaar
//                    discovery warmup sweeping 15 categories per run).

import { run as bazaarDiscoveryWarmup } from './pipelines/bazaar-warmup.js';
import {
	run as bazaarCatalogRefresh,
	BAZAAR_CATALOG_REFRESH,
} from './pipelines/bazaar-catalog-refresh.js';
import { run as x402PricingTracker } from './pipelines/x402-pricing-tracker.js';
import { run as avatarSearchWarmup } from './pipelines/avatar-search-warmup.js';
import { run as reputationRefresh } from './pipelines/reputation-refresh.js';
import { run as tokenIntelPreSnipeGate } from './pipelines/token-intel-gate.js';
import { run as sniperIntelEnrich } from './pipelines/sniper-intel-enrich.js';
import { run as volumeBootstrapLoop } from './pipelines/volume-bootstrap-loop.js';
import { run as liveFeedSeeder } from './pipelines/live-feed-seeder.js';
import { run as feeCalculationValidator } from './pipelines/fee-calculation-validator.js';
import { run as crossChainCostComparison } from './pipelines/cross-chain-cost.js';
import { run as charitySplitAudit } from './pipelines/charity-split-audit.js';
import { classifyThreeSignal, insertThreeSignal } from './three-signal-store.js';
import { run as cosmeticPricingAudit } from './pipelines/cosmetic-pricing-audit.js';
import { run as builderCodeAttribution } from './pipelines/builder-code-attribution.js';
import { run as paymentProofIdempotencyAudit } from './pipelines/payment-proof-idempotency-audit.js';
import { run as apiKeyBypassAudit } from './pipelines/api-key-bypass-audit.js';
import { run as modelMetadataEnrichment } from './pipelines/model-metadata-enrichment.js';
import { run as forgeContentGeneration } from './pipelines/forge-content.js';
import { run as runAnimationRetargetQa, hasCanaryClips as hasAnimationQaCanaries } from './pipelines/animation-retarget-qa.js';
import { runCircuitBreaker } from './pipelines/circuit-breaker.js';
import { run as runGlbSizeOptimizer } from './glb-size-optimizer.js';
import { run as walletBalanceMonitor } from './wallet-balance-monitor.js';
import { run as revenueReconciliation } from './revenue-reconciliation.js';
import { mcpLatencySweep } from './mcp-latency-sweep.js';
import { runStreamingMcpHealth } from './pipelines/streaming-mcp-health.js';
import {
	runGraniteHealth,
	GRANITE_HEALTH_ENDPOINT,
	GRANITE_HEALTH_PRICE_ATOMIC,
} from './granite-health.js';
import { vrmCompatEntry } from './pipelines/vrm-compat-checker.js';
import {
	runSceneCaptureProcessor,
	SCENE_CAPTURE_ENDPOINT,
	SCENE_CAPTURE_PRICE_ATOMIC,
} from './scene-capture-processor.js';
import { run as runRigComplexityScorer } from './pipelines/rig-complexity.js';
import { run as runReservationLeakDetector } from './pipelines/spend-reservation-leak-detector.js';
import { run as runSubscriptionHealth } from './pipelines/subscription-health.js';
import {
	run as runServiceUptimeMonitor,
	SERVICE_UPTIME_ENDPOINT,
} from './pipelines/service-uptime-monitor.js';
import {
	runThumbnailRegen,
	THUMBNAIL_REGEN_ENDPOINT,
	THUMBNAIL_REGEN_PRICE_ATOMIC,
	STALE_DAYS as THUMBNAIL_STALE_DAYS,
} from './thumbnail-regen.js';

// ── MCP Tool Latency Monitor (USE-006) ───────────────────────────────────────
// The canary the loop pays every 5 min to exercise the MCP paid path end-to-end
// (auth → price → pay → settle → dispatch). validate_model is the cheapest
// read-only priced MCP tool ($0.005); the Khronos Box.glb is a tiny, stable,
// public Khronos sample so the call is deterministic and always settles. The
// paid round-trip latency feeds x402_perf_log alongside the per-tool sweep that
// storeValue runs (see mcp-latency-sweep.js). Override the canary model via env
// without editing source.
const MCP_PERF_CANARY_MODEL =
	(process.env.X402_MCP_PERF_CANARY_MODEL || '').trim() ||
	'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/Box/glTF-Binary/Box.glb';

// ── GLB Canonicalization Pipeline (USE-011) ──────────────────────────────────
// Real rig-reference avatars served from three.ws/avatars/*.glb. Each covers a
// distinct skeleton convention that src/glb-canonicalize.js maps onto the
// canonical bone set (Mixamo, Daz/Genesis, glTF reference, photoreal scan,
// rigged non-humanoid). The autonomous loop rotates through them so every known
// rig type is continuously re-validated against /api/x402/model-check. The day a
// glTF-Transform bump — or a brand-new rig added to the rotation — regresses
// skin/animation detection (the signal that would otherwise silently drop an
// avatar to a bind-pose T-pose), the verdict flips and lands in
// glb_canonicalization_results keyed by model URL for the avatar pipeline to read.
const RIG_REFERENCE_AVATARS = [
	'michelle.glb',       // Mixamo humanoid (mixamorig:* bones)
	'xbot.glb',           // Mixamo X-Bot
	'cz.glb',             // Daz/Genesis-style rig
	'cesium-man.glb',     // glTF reference skinned rig
	'realistic-male.glb', // photoreal scanned humanoid
	'dancing-twerk.glb',  // Mixamo clip-baked rig
	'brainstem.glb',      // glTF reference skinned (non-humanoid joints)
	'fox.glb',            // rigged non-humanoid (animal) — exercises the fallback gate
];

export { RIG_REFERENCE_AVATARS };

// Derive the canonicalization verdict from a /api/x402/model-check response.
// Shared by extractSignal (→ x402_autonomous_log.signal_data) and storeValue
// (→ glb_canonicalization_results) so both always agree on the classification.
export function classifyCanonicalization(r) {
	const model = (r && r.model) || {};
	const c = model.counts || {};
	const ext = [
		...(Array.isArray(model.extensionsUsed) ? model.extensionsUsed : []),
		...(Array.isArray(model.extensionsRequired) ? model.extensionsRequired : []),
	];
	const isVrm = ext.some((x) => typeof x === 'string' && /^VRM/i.test(x));
	const skins = Number(c.skins || 0);
	const animations = Number(c.animations || 0);
	const isSkinned = skins > 0;
	// supportsCanonicalClips() gate (AnimationManager): only skeleton-driven rigs
	// can retarget the pre-baked idle/walk library. A skin-less model uses the
	// default-rig fallback rather than collapsing to a T-pose.
	const rigType = isVrm
		? 'vrm'
		: isSkinned
			? 'skinned'
			: animations > 0
				? 'node-animated'
				: 'static';
	return {
		model_url: (r && r.url) || null,
		container: model.container || null,
		generator: model.generator || null,
		rig_type: rigType,
		is_skinned: isSkinned,
		vrm: isVrm,
		skins,
		animations,
		nodes: Number(c.nodes || 0),
		canonical_ready: isSkinned,
		extensions: ext,
		suggestion_count: Array.isArray(r && r.suggestions) ? r.suggestions.length : 0,
		fetched_bytes: Number((r && r.fetchedBytes) || 0),
	};
}

// One-time DDL guard per warm instance (mirrors the loop's ensureSchema idiom).
let _canonSchemaReady = false;
async function ensureCanonicalSchema(sql) {
	if (_canonSchemaReady) return;
	await sql`
		CREATE TABLE IF NOT EXISTS glb_canonicalization_results (
			model_url       text PRIMARY KEY,
			container       text,
			generator       text,
			rig_type        text,
			is_skinned      boolean,
			vrm             boolean,
			skins           int,
			animations      int,
			nodes           int,
			canonical_ready boolean,
			extensions      jsonb,
			suggestions     jsonb,
			run_id          uuid,
			checked_at      timestamptz DEFAULT now()
		)
	`;
	_canonSchemaReady = true;
}

// Round-robin cursor over the reference avatars (per warm instance; Redis-backed
// when available so rotation is stable across instances).
let _canonCursor = 0;
async function nextCanonicalTarget(ctx) {
	const list = RIG_REFERENCE_AVATARS;
	let idx;
	if (ctx?.redis) {
		try {
			const n = await ctx.redis.incr('x402:auto:glb-canon:cursor');
			idx = (Number(n) - 1) % list.length;
		} catch {
			idx = _canonCursor++ % list.length;
		}
	} else {
		idx = _canonCursor++ % list.length;
	}
	const origin = ctx?.origin || 'https://three.ws';
	const targetUrl = `${origin}/avatars/${list[idx]}`;
	return { path: `/api/x402/model-check?url=${encodeURIComponent(targetUrl)}`, targetUrl };
}

const SELF_ENDPOINTS = [
	// ── 3D Pipeline: VRM 1.0 Compatibility Checker (USE-019) ──────────────────
	// Pays a real $0.01 x402 call to /api/mcp (inspect_model) per avatar, derives a
	// VRM 0.x → 1.0 migration report, and upserts it into avatar_vrm_compat. Full
	// implementation in ./pipelines/vrm-compat-checker.js.
	vrmCompatEntry,

	// ── 3D Pipeline: GLB Size Optimizer (USE-018) ─────────────────────────────
	// Picks the heaviest public avatar GLB over the 5 MB web-delivery budget that
	// has not been analyzed in the last 14 days, then pays one real x402 call to
	// /api/mcp (optimize_model) to inspect it and surface Draco/Meshopt geometry
	// compression, 4K→2K texture downscaling, and PNG→KTX2 transcoding. run()
	// projects the post-optimization size from the model's measured stats and
	// persists original + projected-optimized bytes and load-time improvement to
	// glb_optimizations (+ a detailed x402_autonomous_log row with value_extracted).
	// 6h pacing sweeps the heavy backlog one model per run, biggest/stalest first,
	// well under the daily cap. Downstream consumer: GET /api/x402/glb-optimization
	// -report aggregates the catalog-wide average size + load-time improvement and
	// the remaining heavy-GLB backlog.
	{
		id: 'glb-size-optimizer',
		name: 'GLB Size Optimizer (>5MB catalog sweep)',
		// path is informational — runGlbSizeOptimizer() selects the target GLB and
		// pays the optimize_model call against /api/mcp itself. Real price is read
		// from the live 402 challenge (optimize_model is $0.05/call).
		path: '/api/mcp',
		method: 'POST',
		cooldown_s: 21_600, // 6h — gradual catalog sweep, one heavy model per run
		priority: 37,
		pipeline: 'self',
		enabled: true,
		run: runGlbSizeOptimizer,
		extractSignal: null,
	},

	// ── Circuit Breaker (cheapest end-to-end proof the payment stack is alive) ─
	{
		id: 'circuit-breaker-cross-network',
		name: 'Cross-Network Payment Circuit Breaker',
		// path is informational — runCircuitBreaker() probes + settles itself.
		// It pays the cheapest 402-gated endpoint ($0.001 dance-tip) on Solana and
		// route-verifies Base + BSC from the same live challenge.
		path: '/api/x402/dance-tip',
		method: 'POST',
		cooldown_s: 3600, // hourly — see agents/x402-buildout/self/009
		priority: 88,
		pipeline: 'circuit-breaker',
		enabled: true,
		run: runCircuitBreaker,
		extractSignal: null,
	},

	// ── Payment Proof Idempotency Audit (anti-fraud) ──────────────────────────
	// Daily anti-replay canary. Pays ONE real $0.001 USDC call to the idempotent
	// /api/x402/model-check, then resubmits the IDENTICAL signed X-PAYMENT proof
	// and confirms the idempotency store returns a replay/conflict (never a second
	// on-chain settlement). run() owns the two-call sequence + payment; the verdict
	// lands in x402_idempotency_audit and a confirmed double-settle raises an ops
	// alert. Daily cadence → one paid audit/day ≈ $0.001/day. Downstream consumer:
	// api/ops/health.js folds a double-settlement into the platform health verdict.
	{
		id: 'payment-proof-idempotency-audit',
		name: 'Payment Proof Idempotency Audit',
		// path is informational — the pipeline probes + pays + replays itself.
		path: '/api/x402/model-check',
		method: 'GET',
		cooldown_s: 86400, // daily — critical anti-fraud check
		priority: 86,
		pipeline: 'security',
		enabled: true,
		run: paymentProofIdempotencyAudit,
		extractSignal: null,
	},

	// ── API Key Bypass Security Test (free-access canary) ─────────────────────
	// Daily security canary for the X-API-Key bypass lane (access-control.js →
	// installAccessControl). run() probes a bypass matrix against both the hand-
	// rolled (/api/x402/model-check) and paidEndpoint-factory (/api/x402/dance-tip)
	// access-control paths: a VALID key must grant free access (200 + x-payment-
	// bypass), an INVALID key must be denied (403/402), and NO key must hit the 402
	// paywall — any free 200 on the deny/no-key paths is a LEAK. It mints an
	// ephemeral, self-expiring subscription key (revoked in a finally) to exercise
	// the partner lane, then makes ONE real $0.001 payment against the no-key
	// model-check 402 to prove the paywall→verify→settle path is intact end-to-end.
	// Verdict lands in x402_api_key_bypass_audit; a confirmed leak raises a CRITICAL
	// ops alert. Daily cadence → one paid probe/day ≈ $0.001/day. Downstream
	// consumer: api/ops/health.js folds a bypass leak / broken bypass into the
	// platform health verdict.
	{
		id: 'api-key-bypass-audit',
		name: 'API Key Bypass Security Test',
		// path is informational — the pipeline probes the bypass matrix + pays itself.
		path: '/api/x402/model-check',
		method: 'GET',
		price_atomic: 1000, // the bypass is free; the lone paywall-proof payment is $0.001
		cooldown_s: 86400, // daily — catches a refactor-introduced bypass within 24h
		priority: 84,
		pipeline: 'security',
		enabled: true,
		run: apiKeyBypassAudit,
		extractSignal: null,
	},

	// ── Agent Wallet Balance Monitor (self) ───────────────────────────────────
	// Polls the seed/agent wallet balance (the wallet that funds every other
	// autonomous call) via the free GET /api/x402-pay?balance=1 every 10 minutes.
	// run() records a time-series sample to agent_wallet_balance_log, derives the
	// USDC burn rate vs the previous sample, and raises a low-balance alert (USDC
	// < $5, env-tunable) to Redis + the logs so operators can top up before the
	// loop is starved. Free read → moves no funds (amountAtomic always 0).
	// Downstream consumer: api/ops/health.js folds a low/unconfigured wallet into
	// the internal health verdict so the status dashboard flags it early.
	{
		id: 'agent-wallet-balance-monitor',
		name: 'Agent Wallet Balance Monitor',
		// path is informational — walletBalanceMonitor() owns the free GET call.
		path: '/api/x402-pay?balance=1',
		method: 'GET',
		cooldown_s: 600, // every 10 minutes
		priority: 92, // high: a starved wallet breaks every other pipeline
		pipeline: 'health',
		enabled: true,
		run: walletBalanceMonitor,
		extractSignal: null,
	},

	// ── 3D Pipeline: Avatar Thumbnail Regeneration (USE-015) ──────────────────
	// Pays asset-download for the stalest marketplace listing (thumbnail null /
	// older than STALE_DAYS / model bytes newer than last render), then queues a
	// re-render in avatar_thumbnail_regen_jobs. The drainer cron
	// (api/cron/avatar-thumbnail-render.js) renders the GLB to a fresh PNG and
	// writes it back onto paid_assets.thumbnail_r2_key + the linked avatars row so
	// listings always show current appearance. run() selects + pays + enqueues
	// and returns 'no_stale_assets' (skip, no spend) when nothing is overdue.
	{
		id: 'avatar-thumbnail-regen',
		name: `Avatar Thumbnail Regeneration (>${THUMBNAIL_STALE_DAYS}d stale)`,
		// path is informational — runThumbnailRegen() resolves the per-asset slug
		// and pays asset-download itself. price is per-listing; ref price below.
		path: THUMBNAIL_REGEN_ENDPOINT,
		method: 'GET',
		price_atomic: THUMBNAIL_REGEN_PRICE_ATOMIC,
		// 6h pacing: drains the stale backlog one listing per run (~4/day, well
		// under the daily cap) while the 30-day staleness gate decides actual work.
		cooldown_s: 21_600,
		priority: 38,
		pipeline: 'self',
		enabled: true,
		run: runThumbnailRegen,
		extractSignal: null,
	},

	// ── Oracle / Intelligence (highest priority — feeds sniper decisions) ─────
	{
		id: 'crypto-intel-sol',
		name: 'Crypto Intel: Solana',
		path: '/api/x402/crypto-intel',
		method: 'POST',
		body: { topic: 'solana' },
		cooldown_s: 900,
		priority: 95,
		pipeline: 'oracle',
		enabled: true,
		extractSignal: (r) => ({ topic: r?.topic, signal: r?.signal, headline: r?.headline, confidence: r?.confidence, price_usd: r?.price_usd }),
	},
	{
		id: 'crypto-intel-btc',
		name: 'Crypto Intel: Bitcoin',
		path: '/api/x402/crypto-intel',
		method: 'POST',
		body: { topic: 'bitcoin' },
		cooldown_s: 900,
		priority: 90,
		pipeline: 'oracle',
		enabled: true,
		extractSignal: (r) => ({ topic: r?.topic, signal: r?.signal, headline: r?.headline, confidence: r?.confidence, price_usd: r?.price_usd }),
	},
	{
		id: 'crypto-intel-eth',
		name: 'Crypto Intel: Ethereum',
		path: '/api/x402/crypto-intel',
		method: 'POST',
		body: { topic: 'ethereum' },
		cooldown_s: 900,
		priority: 85,
		pipeline: 'oracle',
		enabled: true,
		extractSignal: (r) => ({ topic: r?.topic, signal: r?.signal, headline: r?.headline, confidence: r?.confidence, price_usd: r?.price_usd }),
	},
	{
		id: 'crypto-intel-pump',
		name: 'Crypto Intel: Pump.fun Meme',
		path: '/api/x402/crypto-intel',
		method: 'POST',
		body: { topic: 'pump' },
		cooldown_s: 600,
		priority: 95,
		pipeline: 'oracle',
		enabled: true,
		extractSignal: (r) => ({ topic: r?.topic, signal: r?.signal, headline: r?.headline, confidence: r?.confidence }),
	},
	{
		// ── $THREE Signal Feed (USE: $THREE market oracle) ─────────────
		// Pays $0.01 USDC every 15 min to /api/x402/three-intel for the live $THREE
		// market snapshot (price, 24 h change, mcap, liquidity, volume, signal). As an
		// `oracle` entry the latest snapshot also dedups into oracle_intel_signals
		// (topic 'three') for the sniper gate; storeValue appends every snapshot to the
		// three_market_signals time series. Downstream consumers of that series:
		//   • the public $THREE price widget — GET /api/three-signal (latest + sparkline)
		//   • $THREE-denominated x402 pricing — usdToThreeTokens() reads the latest price
		id: 'three-intel',
		name: '$THREE Signal Feed',
		path: '/api/x402/three-intel',
		method: 'GET', // three-intel is a GET endpoint (query input, no request body)
		body: null,
		cooldown_s: 900, // 15 min
		priority: 99,
		pipeline: 'oracle',
		enabled: true,
		// classifyThreeSignal carries the full market shape into signal_data so the
		// oracle dedup + the autonomous-log row both hold the complete snapshot.
		extractSignal: (r) => ({ topic: 'three', ...classifyThreeSignal(r) }),
		storeValue: async ({ sql, responseBody, signalData, runId }) => {
			if (!sql) return;
			const v = classifyThreeSignal(responseBody || signalData);
			if (v.price_usd == null) return; // never persist an empty/failed snapshot
			await insertThreeSignal(sql, v, { runId, source: 'x402-autonomous' });
		},
	},
	{
		id: 'fact-check-sol',
		name: 'Fact-Check: SOL market claim',
		path: '/api/x402/fact-check',
		method: 'POST',
		body: { claim: 'Solana is the fastest blockchain by TPS' },
		cooldown_s: 3600,
		priority: 60,
		pipeline: 'oracle',
		enabled: true,
		extractSignal: (r) => ({ verdict: r?.verdict, confidence: r?.confidence, sources: r?.sources }),
	},

	// ── Bazaar Price Trend Monitor (USE-060) ──────────────────────────────────
	// Pays $0.001 USDC to /api/x402/bazaar-feed for a 24h read of price movement
	// across the x402 service marketplace, derived from the platform's own
	// x402_service_price_history time series (populated by the x402-pricing-tracker
	// pipeline). The endpoint classifies each tracked service as trending up /
	// down / stable over the window and derives the net price pressure as a
	// bullish / bearish / neutral signal. As an `oracle` entry the latest verdict
	// dedups into oracle_intel_signals (topic 'bazaar_price_trends') so the sniper
	// gate can fold marketplace cost sentiment into conviction. extractSignal lifts
	// the directional signal + the mover counts into x402_autonomous_log.signal_data.
	// Cooldown 900s (15 min) → matches the price feed's volatility without re-reading
	// the same window every tick; spend ≈ $0.10/day, well under the loop's daily cap.
	{
		id: 'bazaar-price-trends',
		name: 'Bazaar Price Trend Monitor',
		path: '/api/x402/bazaar-feed',
		method: 'POST',
		body: { filter: 'price_trends', period: '24h' },
		cooldown_s: 900, // 15 min — price-pressure signal volatility
		priority: 82,
		pipeline: 'oracle',
		enabled: true,
		extractSignal: (r) => ({
			topic: 'bazaar_price_trends',
			signal: r?.signal || null,
			headline: r?.headline || null,
			confidence: r?.confidence ?? null,
			net_pressure: r?.net_pressure ?? null,
			avg_change_pct: r?.avg_change_pct ?? null,
			trending_up: Array.isArray(r?.trending_up)
				? r.trending_up.map((s) => ({ service_key: s.service_key, pct_change: s.pct_change }))
				: [],
			trending_down: Array.isArray(r?.trending_down)
				? r.trending_down.map((s) => ({ service_key: s.service_key, pct_change: s.pct_change }))
				: [],
			stable_count: r?.stable_count ?? 0,
			total_tracked: r?.total_tracked ?? 0,
			period: r?.period || '24h',
		}),
	},

	// ── Volume / Activity Feed (keep the live feed alive) ─────────────────────
	{
		id: 'dance-tip-vol-1',
		name: 'Dance Tip Volume: Dancer 1',
		path: '/api/x402/dance-tip',
		method: 'POST',
		body: { dancer: '1', dance: 'hiphop' },
		cooldown_s: 120,
		priority: 70,
		pipeline: 'volume',
		enabled: true,
		extractSignal: null,
	},
	{
		id: 'dance-tip-vol-2',
		name: 'Dance Tip Volume: Dancer 2',
		path: '/api/x402/dance-tip',
		method: 'POST',
		body: { dancer: '2', dance: 'rumba' },
		cooldown_s: 120,
		priority: 70,
		pipeline: 'volume',
		enabled: true,
		extractSignal: null,
	},
	{
		id: 'dance-tip-vol-3',
		name: 'Dance Tip Volume: Thriller',
		path: '/api/x402/dance-tip',
		method: 'POST',
		body: { dancer: '3', dance: 'thriller' },
		cooldown_s: 120,
		priority: 65,
		pipeline: 'volume',
		enabled: true,
		extractSignal: null,
	},
	{
		id: 'cosmetic-purchase-test',
		name: 'Cosmetic Purchase Health Check',
		path: '/api/x402/cosmetic-purchase',
		method: 'POST',
		body: { item: 'canary_test', quantity: 1, _health_check: true },
		cooldown_s: 1800,
		priority: 40,
		pipeline: 'health',
		enabled: true,
		extractSignal: (r) => ({ purchase_id: r?.purchase_id, item: r?.item }),
	},

	// ── Health Checks (verify each x402 endpoint is live) ─────────────────────
	{
		id: 'health-crypto-intel',
		name: 'Health: crypto-intel',
		path: '/api/x402/crypto-intel',
		method: 'POST',
		body: { topic: 'xrp' },
		cooldown_s: 300,
		priority: 50,
		pipeline: 'health',
		enabled: true,
		extractSignal: (r) => ({ alive: !!r?.signal, topic: r?.topic }),
	},
	{
		id: 'health-token-intel',
		name: 'Health: token-intel',
		path: '/api/x402/token-intel',
		method: 'POST',
		// Canary: well-known USDC mint — stable, always has data.
		body: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', network: 'mainnet' },
		cooldown_s: 600,
		priority: 55,
		pipeline: 'health',
		enabled: true,
		extractSignal: (r) => ({ alive: !!r?.symbol, symbol: r?.symbol, holders: r?.holders }),
	},
	{
		id: 'health-skill-marketplace',
		name: 'Health: skill-marketplace',
		path: '/api/x402/skill-marketplace',
		method: 'GET',
		body: null,
		cooldown_s: 600,
		priority: 45,
		pipeline: 'health',
		enabled: true,
		extractSignal: (r) => ({ alive: Array.isArray(r?.skills), count: r?.skills?.length }),
	},
	{
		id: 'health-pay-by-name',
		name: 'Health: pay-by-name',
		path: '/api/x402/pay-by-name',
		method: 'POST',
		body: { name: 'three.ws' },
		cooldown_s: 600,
		priority: 45,
		pipeline: 'health',
		enabled: true,
		extractSignal: (r) => ({ alive: !!r?.address, address: r?.address }),
	},
	{
		id: 'health-agent-reputation',
		name: 'Health: agent-reputation',
		path: '/api/x402/agent-reputation',
		method: 'GET',
		body: null,
		cooldown_s: 600,
		priority: 50,
		pipeline: 'health',
		enabled: true,
		extractSignal: (r) => ({ alive: r !== null }),
	},
	{
		id: 'health-symbol-avail',
		name: 'Health: symbol-availability',
		path: '/api/x402/symbol-availability',
		method: 'POST',
		body: { symbol: 'HEALTH' },
		cooldown_s: 900,
		priority: 40,
		pipeline: 'health',
		enabled: true,
		extractSignal: (r) => ({ available: r?.available }),
	},
	{
		id: 'health-fact-check',
		name: 'Health: fact-check',
		path: '/api/x402/fact-check',
		method: 'POST',
		body: { claim: 'The sky is blue' },
		cooldown_s: 1800,
		priority: 40,
		pipeline: 'health',
		enabled: true,
		extractSignal: (r) => ({ alive: !!r?.verdict, verdict: r?.verdict }),
	},
	// MCP Model Validation Sweep — picks the longest-unvalidated public GLB from
	// the avatars table, runs glTF-Transform inspection, and upserts a quality
	// score row to model_quality_scores. Each tick advances the sweep by one avatar.
	// Cooldown 300 s → 12 models/hour; a library of 100 models is fully covered
	// within ~8 hours and re-validated on a 24-hour rolling basis.
	// Downstream consumer: model_quality_scores → explore quality badges and
	// curation pipelines that surface models needing attention.
	{
		id: 'mcp-model-validation-sweep',
		name: 'MCP Model Validation Sweep',
		path: '/api/x402/model-validation-sweep',
		method: 'POST',
		body: {},
		cooldown_s: 300,
		priority: 45,
		pipeline: 'health',
		enabled: true,
		extractSignal: (r) => ({
			avatar_id: r?.avatar_id || null,
			score: r?.score ?? null,
			has_errors: r?.has_errors ?? null,
			missing_bones: r?.missing_bones ?? null,
			skipped: r?.skipped ?? false,
		}),
	},

	// ── MCP Health: Solana agent registration canary ──────────────────────────
	// Verifies the server-custodial Solana registration subsystem end-to-end by
	// resolving a known canary agent's on-chain Metaplex Agent Registry record
	// (Identity PDA + Core asset) and confirming both accounts still exist
	// on-chain. The endpoint owns the verification + persists the canonical
	// health row to mcp_health_canary; this loop pays the $0.001 canary fee,
	// records the call to x402_autonomous_log, and respects the 6h cooldown
	// (4 probes/day). extractSignal lifts the health verdict into signal_data so
	// a status dashboard can read it straight off the autonomous log too.
	{
		id: 'mcp-solana-register-health',
		name: 'MCP Health: Solana agent registration',
		path: '/api/x402/solana-register-health',
		method: 'GET',
		body: null,
		cooldown_s: 21600, // 6h — registration is a slow-changing subsystem
		priority: 55,
		pipeline: 'health',
		enabled: true,
		extractSignal: (r) => ({
			alive: r?.healthy === true,
			tool: r?.tool || 'solana_register',
			network: r?.network || null,
			canary_agent_id: r?.canary_agent_id || null,
			asset: r?.asset || null,
			identity_pda: r?.identity_pda || null,
			registry_enrolled: r?.checks?.registry_enrolled === true,
			asset_onchain: r?.checks?.asset_onchain === true,
			identity_pda_onchain: r?.checks?.identity_pda_onchain === true,
			consecutive_failures: r?.consecutive_failures ?? null,
			rpc_latency_ms: r?.rpc_latency_ms ?? null,
		}),
	},

	// SSE Streaming MCP Health (USE-010): pays $0.01 USDC for a single priced
	// tools/call (validate_model on a tiny public canary GLB) against POST /api/mcp
	// in SSE mode (Accept: text/event-stream), then reads the paid response as a
	// STREAM to verify the streaming transport is intact before close — measuring
	// time-to-first-byte, inter-chunk gaps, chunk count and total bytes, and
	// flagging stalled streams, dropped connections, or broken chunked encoding.
	// run() owns the probe/pay/stream-read; the loop records one x402_autonomous_log
	// row (verdict in signal_data) and run() also persists the streaming-integrity
	// metrics to mcp_stream_health (the value sink the status surface + ops alerts
	// consume; complements the latency percentiles the MCP Latency Monitor writes
	// to x402_perf_log). Cooldown 300s → one paid probe every ~5 min ≈ $2.88/day at
	// $0.01, well under the loop's daily cap. The MCP server has no $0.001 tool, so
	// the minimum priced lightweight tool (validate_model, $0.01) governs the spend.
	{
		id: 'mcp-sse-stream-health',
		name: 'SSE Streaming MCP Health',
		// path is informational — runStreamingMcpHealth() probes + settles itself.
		path: '/api/mcp',
		method: 'POST',
		body: null,
		cooldown_s: 300,
		priority: 52,
		pipeline: 'health',
		enabled: true,
		run: runStreamingMcpHealth,
	},

	// ── MCP Observability: Tool Latency Monitor (USE-006) ─────────────────────
	// Every 5 min the loop makes ONE real x402 payment to /api/mcp — a
	// validate_model canary against a tiny, stable, public Khronos sample GLB.
	// That paid round-trip exercises the full paid MCP path (auth → price → pay →
	// settle → dispatch) and is recorded to x402_autonomous_log like every other
	// call. storeValue then runs the latency sweep (mcp-latency-sweep.js): it
	// lists every advertised tool and probes each with an unpaid, side-effect-free
	// tools/call, timing the caller-observed first response, then writes rolling
	// p50/p95/p99 per tool to x402_perf_log and alerts when any tool's p95 > 2s.
	// Downstream consumer: GET /api/x402/mcp-perf (the ops SLA dashboard) reads
	// x402_perf_log for live health + breach state.
	{
		id: 'mcp-latency-monitor',
		name: 'MCP Tool Latency Monitor',
		path: '/api/mcp',
		method: 'POST',
		body: {
			jsonrpc: '2.0',
			id: 'mcp-perf-canary',
			method: 'tools/call',
			params: {
				name: 'validate_model',
				arguments: { url: MCP_PERF_CANARY_MODEL, max_issues: 1 },
			},
		},
		cooldown_s: 300, // 5 min — matches the monitor's described schedule
		priority: 52,
		pipeline: 'observability',
		enabled: true,
		// Lift the canary's validation verdict into x402_autonomous_log.signal_data
		// so the autonomous log alone proves the paid MCP path returned real work.
		extractSignal: (r) => {
			const sc = r?.result?.structuredContent || null;
			return {
				canary_tool: 'validate_model',
				rpc_ok: !!(r?.result && !r?.error && !r?.result?.isError),
				file_size: sc?.fileSize ?? null,
				num_errors: sc?.numErrors ?? null,
				validator_version: sc?.validatorVersion ?? null,
			};
		},
		// Value extraction: full per-tool latency sweep → x402_perf_log.
		storeValue: ({ responseBody, runId, origin, durationMs, success }) =>
			mcpLatencySweep({
				responseBody,
				runId,
				origin,
				durationMs,
				success: success && !!(responseBody?.result && !responseBody?.error),
			}),
	},

	// ── Sniper Pipeline Support ────────────────────────────────────────────────
	{
		id: 'sniper-pump-audit-latest',
		name: 'Pump Agent Audit: latest 5',
		path: '/api/x402/pump-agent-audit',
		method: 'POST',
		body: { limit: 5 },
		cooldown_s: 600,
		priority: 75,
		pipeline: 'sniper',
		enabled: true,
		extractSignal: (r) => ({ count: r?.audits?.length, top_score: r?.audits?.[0]?.score }),
	},
	// Token Intel Pre-Snipe Gate (USE-023) — pays the $0.01 USDC Token Oracle
	// (/api/x402/token-intel) for the freshest pump.fun mints the sniper is about
	// to consider, turning the due-diligence risk.score into a 0..100 rugpull
	// sub-score. run() owns the batch sequence + per-mint recording; the loop
	// records one summary row. Verdicts upsert to token_intel_risk keyed by
	// (mint, network). Cooldown 1200s (20 min) → ~3 batches/hour, ~$0.09/hr at the
	// default batch of 3 — bounded again by the loop's daily cap.
	// Downstream consumer: workers/agent-sniper/oracle-gate.js auto-rejects any
	// mint with a fresh `rejected = true` verdict before committing SOL.
	{
		id: 'token-intel-presnipe-gate',
		name: 'Token Intel Pre-Snipe Gate',
		path: '/api/x402/token-intel',
		method: 'GET',
		body: null,
		cooldown_s: 1200,
		priority: 78,
		pipeline: 'sniper',
		enabled: true,
		run: (ctx) => tokenIntelPreSnipeGate(ctx),
	},
	// Sniper Intel Enrichment (USE-024) — the trading engine pays the platform's
	// own $0.01 USDC Crypto Intel feed (/api/x402/crypto-intel) for live market
	// sentiment on the coins the sniper is actively watching (open positions +
	// freshest high-conviction Oracle candidates), turning the headline signal
	// into a clamped per-coin gate modifier. run() owns the batch sequence +
	// per-coin recording; the loop records one summary row. Verdicts upsert to
	// sniper_coin_sentiment keyed by (mint, network). Crypto Intel 503s (un-charged)
	// for any coin CoinGecko can't resolve, so a memecoin never gets a wrong-coin
	// signal. Cooldown 900s (15 min) → ~4 batches/hour, ≤$0.08/batch at the default
	// batch of 8 — bounded again by the loop's daily cap.
	// Downstream consumer: workers/agent-sniper/oracle-gate.js folds the fresh
	// per-coin delta into the effective min_oracle_score before committing SOL.
	{
		id: 'sniper-intel-enrich',
		name: 'Sniper Intel Enrichment',
		path: '/api/x402/crypto-intel',
		method: 'POST',
		body: null,
		cooldown_s: 900,
		priority: 77,
		pipeline: 'sniper',
		enabled: true,
		run: (ctx) => sniperIntelEnrich(ctx),
	},

	// ── Identity / DID ─────────────────────────────────────────────────────────
	{
		id: 'health-did-resolve',
		name: 'Health: DID resolution',
		path: '/api/x402/did',
		method: 'GET',
		body: null,
		cooldown_s: 3600,
		priority: 30,
		pipeline: 'health',
		enabled: true,
		extractSignal: (r) => ({ alive: !!r }),
	},

	// ── Animation Retargeting QA (USE-012) ──────────────────────────────────────
	// Pays $0.005 USDC to download a representative set of canary animation clips
	// (one per rig convention — Mixamo, VRM, Avaturn, Daz) through the real
	// paid-delivery path (402 paywall → R2 presign → animated GLB), then fetches
	// each presigned GLB and inspects the actual bytes with inspectGlb(): the file
	// must be a valid, non-zero binary glTF whose animation track survived. An
	// empty/truncated/non-GLB artifact, or one whose animation channels vanished —
	// the regression a glb-canonicalize.js / animation-retarget.js break produces —
	// flips the verdict to passed:false. run() owns the per-clip pay/fetch/inspect
	// and per-clip recording; the loop records one summary row (verdict in
	// signal_data), and run() upserts each verdict into animation_qa_results keyed
	// by clip_id (the sink the animation marketplace + retarget-regression alerting
	// read). Gated on X402_ANIMATION_QA_CLIP_IDS / X402_ANIMATION_QA_CLIP_ID —
	// disabled (no spend) until canary clips are designated. Cooldown 6h → at
	// $0.005 per clip, a 4-rig sweep ≈ $0.08/day.
	{
		id: 'anim-retarget-qa',
		name: 'Animation Retargeting QA',
		// path is informational — runAnimationRetargetQa() probes + settles each clip.
		path: '/api/x402/animation-download',
		method: 'GET',
		body: null,
		cooldown_s: 21600,
		priority: 45,
		pipeline: 'qa',
		enabled: hasAnimationQaCanaries(),
		run: (ctx) => runAnimationRetargetQa(ctx),
	},
	// GLB Canonicalization: pays $0.001 USDC to run a rig-reference avatar
	// through /api/x402/model-check, validating that its skeleton still inspects
	// as a skinned/animated rig (the precondition for canonical-clip retargeting).
	// resolveTarget rotates the avatar set so every rig convention is re-checked
	// over time; storeValue upserts the verdict into glb_canonicalization_results
	// (consumed by the avatar upload + animation retarget pipeline to gate T-pose
	// fallback). Cooldown 300s → one avatar every 5 min, full ~8-rig cycle ≈ 40 min.
	{
		id: 'glb-canonicalize',
		name: 'GLB Canonicalization Check',
		// Stable fallback path; resolveTarget overrides it per call (rotation).
		path: `/api/x402/model-check?url=${encodeURIComponent('https://three.ws/avatars/xbot.glb')}`,
		method: 'GET',
		body: null,
		cooldown_s: 300,
		priority: 55,
		pipeline: 'canonicalize',
		enabled: true,
		resolveTarget: (ctx) => nextCanonicalTarget(ctx),
		extractSignal: (r) => classifyCanonicalization(r),
		storeValue: async ({ sql, responseBody, signalData, runId, targetUrl }) => {
			if (!sql) return;
			const v = signalData || classifyCanonicalization(responseBody);
			const url = v.model_url || targetUrl;
			if (!url) return;
			await ensureCanonicalSchema(sql);
			await sql`
				INSERT INTO glb_canonicalization_results
					(model_url, container, generator, rig_type, is_skinned, vrm,
					 skins, animations, nodes, canonical_ready, extensions, suggestions,
					 run_id, checked_at)
				VALUES
					(${url}, ${v.container}, ${v.generator}, ${v.rig_type},
					 ${v.is_skinned}, ${v.vrm}, ${v.skins}, ${v.animations}, ${v.nodes},
					 ${v.canonical_ready},
					 ${JSON.stringify(v.extensions || [])},
					 ${JSON.stringify((responseBody && responseBody.suggestions) || [])},
					 ${runId}, now())
				ON CONFLICT (model_url) DO UPDATE SET
					container       = EXCLUDED.container,
					generator       = EXCLUDED.generator,
					rig_type        = EXCLUDED.rig_type,
					is_skinned      = EXCLUDED.is_skinned,
					vrm             = EXCLUDED.vrm,
					skins           = EXCLUDED.skins,
					animations      = EXCLUDED.animations,
					nodes           = EXCLUDED.nodes,
					canonical_ready = EXCLUDED.canonical_ready,
					extensions      = EXCLUDED.extensions,
					suggestions     = EXCLUDED.suggestions,
					run_id          = EXCLUDED.run_id,
					checked_at      = now()
			`;
		},
	},

	// ── 3D Forge Content Generation (USE-014) ──────────────────────────────────
	// Pays the paid Forge ($0.05 draft) hourly to generate one procedural prop
	// (crate / barrel / furniture / terrain tile), rotating the category each hour
	// so the public asset library stays balanced. run() owns the pay→embed→persist
	// sequence: it inserts the prop into forge_autonomous_props (the asset-library +
	// diversity table the forge gallery/dashboard reads) and scores novelty + a
	// k-means cluster id over the recent catalog (the embedding-clustering diversity
	// measure). Cooldown 3600s → ≤24 props/day ≈ $1.20/day, well under the loop cap.
	{
		id: 'forge-content-gen',
		name: '3D Forge: procedural prop generation',
		path: '/api/x402/forge',
		method: 'POST',
		body: null,
		cooldown_s: 3600,
		priority: 55,
		pipeline: 'forge',
		enabled: true,
		run: (ctx) => forgeContentGeneration(ctx),
	},

	// ── Bazaar Discovery Warmup (USE-008) ──────────────────────────────────────
	// Sweeps 15 discovery categories through the x402 Bazaar MCP server
	// (/api/mcp-bazaar → search_services) at $0.001/call, validating that the
	// returned services are live + priced and snapshotting the catalog per
	// category into x402_bazaar_catalog for drift detection. run() owns the full
	// 15-call sequence and per-call recording; the loop records one summary row.
	// Cooldown 86400s (daily warmup) → 15 calls/day ≈ $0.015/day. The snapshots
	// are the source list for external x402 service onboarding (EXTERNAL_ENDPOINTS)
	// and the per-category drift flags feed the external pipeline.
	{
		id: 'bazaar-discovery-warmup',
		name: 'Bazaar Discovery Warmup',
		path: '/api/mcp-bazaar',
		method: 'POST',
		body: null,
		cooldown_s: 86400,
		priority: 35,
		pipeline: 'discovery',
		enabled: true,
		run: (ctx) => bazaarDiscoveryWarmup(ctx),
	},

	// -- Bazaar Service Catalog Daily Refresh -----------------------------------
	// A full-catalog census, distinct from the category-search warmup above. Once
	// a day it browses EVERY service on the bazaar (browse_services for http + mcp
	// via /api/mcp-bazaar at $0.001/call), then pays get_service ($0.001/call) for
	// each newly-appeared service to capture its full payment requirements -- the
	// bazaar_search_services + bazaar_service_details pair. run() owns the census,
	// the day-over-day diff, and per-call recording; it sets recorded:true so the
	// loop adds no summary row. The diff is the value: new services (opportunity
	// alerts) and removed services (pipeline-dependency alerts) land in the daily
	// snapshot + the durable bazaar_service_index, and removed resources are
	// cross-checked against active EXTERNAL_ENDPOINTS to raise a dependency alert.
	// Cooldown 86400s (daily) -> ~2 census + <=8 enrichment calls/day ~= $0.01/day.
	// Value sinks: bazaar_catalog_snapshots (daily snapshot + diff) and
	// bazaar_service_index (per-service registry). Downstream consumer: external
	// onboarding reads bazaar_service_index WHERE status='active' (the opportunity
	// feed) and ops reads the Redis dependency-alert before a dead external entry
	// starts erroring.
	{
		id: 'bazaar-catalog-refresh',
		name: 'Bazaar Service Catalog Daily Refresh',
		path: BAZAAR_CATALOG_REFRESH.endpoint,
		endpoint: BAZAAR_CATALOG_REFRESH.endpoint,
		method: 'POST',
		body: null,
		price_atomic: BAZAAR_CATALOG_REFRESH.priceAtomic,
		cooldown_s: BAZAAR_CATALOG_REFRESH.cooldownSeconds,
		cooldown_seconds: BAZAAR_CATALOG_REFRESH.cooldownSeconds,
		priority: 34,
		pipeline: 'discovery',
		enabled: true,
		run: (ctx) => bazaarCatalogRefresh(ctx),
		extractSignal: null,
	},

	// ── x402 Service Pricing Tracker (USE: cost-model price history) ───────────
	// Tracks the PRICE HISTORY of the external x402 services we depend on so our
	// cost models stay honest (distinct from the catalog census above, which
	// tracks service presence). Each run pays $0.001/call to /api/mcp-bazaar
	// (bazaar_service_details) for the stalest tracked services and reads each
	// one's current live cheapest price. run() compares to the last recorded price,
	// appends to x402_service_price_history, and upserts x402_service_price_current
	// with the % change + alert flags — raising a cost-model alert when a price
	// jumped > 20% and flagging a drop opportunity when it fell ≥ 15%. The tracked
	// set is built from the live priced resources the Bazaar Discovery Warmup
	// snapshots into x402_bazaar_catalog (no hardcoded list). run() self-records one
	// x402_autonomous_log row per call (value_extracted = price + change), so it
	// sets recorded:true and the loop adds no summary row. Cooldown 21600s (6h) with
	// a 5-service batch → ≤ $0.005/run, rotating the catalog ≈ daily, well under the
	// loop's daily cap. Downstream consumer: GET /api/x402/service-pricing-report
	// surfaces the tracked catalog, active increase alerts, and drop opportunities.
	{
		id: 'x402-pricing-tracker',
		name: 'x402 Service Pricing Tracker',
		// path/endpoint are informational — run() builds the bazaar_service_details
		// JSON-RPC body and pays the live $0.001 challenge itself, per service.
		path: '/api/mcp-bazaar',
		endpoint: '/api/mcp-bazaar',
		method: 'POST',
		body: null,
		price_atomic: 1000, // $0.001 USDC — bazaar_service_details per-call price
		cooldown_s: 21600,
		cooldown_seconds: 21600,
		priority: 33,
		pipeline: 'discovery',
		enabled: true,
		run: (ctx) => x402PricingTracker(ctx),
		extractSignal: null,
	},

	// ── Avatar Search Index Warmup (USE-003) ───────────────────────────────────
	// Fires ~20 common gallery queries (human, robot, anime, warrior, …) through
	// the MCP server (/api/mcp → search_public_avatars) at $0.001/call, proving the
	// full search path returns ranked results WITH resolved thumbnails on a cold
	// start. run() owns the 20-call sequence and per-call recording; the loop
	// records one summary row. Cooldown 21600s (every 6h) → ~20 calls/run ≈
	// $0.08/day. Each query's ranked, thumbnail-resolved slice is upserted into
	// avatar_search_warm_cache; GET /api/avatars/popular-searches reads it to power
	// the gallery's popular-search chips and instant cached results.
	{
		id: 'avatar-search-index-warmup',
		name: 'Avatar Search Index Warmup',
		path: '/api/mcp',
		method: 'POST',
		body: null,
		cooldown_s: 21600,
		priority: 38,
		pipeline: 'discovery',
		enabled: true,
		run: (ctx) => avatarSearchWarmup(ctx),
	},

	// ── Agent Reputation Score Refresh (USE-005) ───────────────────────────────
	// Refreshes the on-chain attestation reputation of the stalest registered
	// Solana agents by paying the /api/mcp tool solana_agent_reputation
	// ($0.001/call) for each. run() owns the full per-agent sweep and per-call
	// recording; the loop records one summary row. Cooldown 21600s (6h) →
	// ≤25 agents/run ≈ $0.025/run, bounded again by the loop's daily cap; stalest
	// agents sort first so coverage rotates. Value sink: agent_solana_reputation
	// (per-agent score + flag) — read by the agent-profile trust badge, the
	// reputation leaderboard, and the moderation flagged feed (see
	// getStoredSolanaReputation / listSolanaReputationLeaderboard /
	// listFlaggedSolanaAgents in pipelines/reputation-refresh.js).
	{
		id: 'reputation-score-refresh',
		name: 'Agent Reputation Score Refresh',
		// path is informational — run() fans the call across registered agents.
		path: '/api/mcp',
		method: 'POST',
		body: null,
		cooldown_s: 21600,
		priority: 45,
		pipeline: 'self',
		enabled: true,
		run: (ctx) => reputationRefresh(ctx),
	},

	// ── Volume Bootstrap Loop (USE-026) ────────────────────────────────────────
	// The core growth/volume engine. Round-robins through the full catalog of
	// paid, cheap self x402 endpoints (VOLUME_ENDPOINTS in
	// pipelines/volume-bootstrap-loop.js), paying each a real on-chain USDC
	// payment so the platform accrues genuine agent-to-agent transaction volume —
	// the metric agentic.market ranks facilitators on — while continuously proving
	// every paid endpoint is live. run() owns the full sweep, per-call recording
	// and per-endpoint ledger upsert; the loop records one summary row. Budgeted
	// by both the loop's daily cap and a self-imposed per-run cap. Cooldown 300s →
	// a window every 5 min, full ~11-endpoint cycle ≈ 15 min. Value sink:
	// x402_volume_metrics (per-endpoint call/success/spend ledger) — read by the
	// growth + status surfaces for proof-of-volume and per-endpoint liveness.
	{
		id: 'volume-bootstrap-loop',
		name: 'Volume Bootstrap Loop',
		// path is informational — run() round-robins the VOLUME_ENDPOINTS catalog.
		path: '/api/x402/*',
		method: 'POST',
		body: null,
		cooldown_s: 300,
		priority: 25,
		pipeline: 'volume',
		enabled: true,
		run: (ctx) => volumeBootstrapLoop(ctx),
	},

	// ── Live Payment Feed Seeder (USE-025) ─────────────────────────────────────
	// Keeps the homepage "live payment feed" (the /pay page, the in-world
	// jumbotron and the exchange NPCs — all polling GET /api/x402-pay?feed=1)
	// populated with recent activity. The Redis ring that feed renders
	// (x402:pay:feed) is written ONLY by real /api/x402-pay demo payments, so
	// with no organic traffic it goes stale and a visitor sees a dead system.
	// run() makes ONE real on-chain $0.001 USDC demo payment per tick through the
	// platform-wallet demo flow (signed by X402_AGENT_SOLANA_SECRET_BASE58
	// server-side), rotating across MCP tools (avatar search / model inspect /
	// validate / optimize / capability discovery) so the feed shows variety, not
	// one repeated call. The demo call pushes the receipt onto the Redis ring
	// (the hot path) and run() mirrors it durably into x402_demo_feed. Cooldown
	// 300s → one fresh feed entry every 5-min tick ≈ $0.29/day, bounded again by
	// the loop's daily cap. Value sink: x402_demo_feed (durable activity history +
	// Redis-eviction backstop). Downstream consumer: the homepage/jumbotron/NPC
	// live feed via /api/x402-pay?feed=1.
	{
		id: 'live-feed-seeder',
		name: 'Live Payment Feed Seeder',
		// path is informational — run() rotates the demo-call set against /api/x402-pay.
		path: '/api/x402-pay',
		method: 'POST',
		body: null,
		cooldown_s: 300,
		priority: 72,
		pipeline: 'feed',
		enabled: true,
		run: (ctx) => liveFeedSeeder(ctx),
	},

	// ── Model Metadata Enrichment (USE-016) ────────────────────────────────────
	// Finds public avatars with no tags and pays inspect_model ($0.01/call via
	// /api/mcp) to parse each GLB, then derives searchable feature tags + a model
	// category from the structural report and writes them back to avatars.tags /
	// avatars.model_category. run() owns the per-avatar call sequence + recording
	// (value_extracted holds the derived tags); the loop records one summary row.
	// Cooldown 3600s (hourly) → up to 10 models/run ≈ $0.10/run, bounded again by
	// the loop's daily cap. Downstream consumer: listPublicAvatars({ tag, category })
	// search facets in api/_lib/avatars.js + the recommendation engine, both of
	// which read avatars.tags — an untagged avatar is invisible to them until enriched.
	{
		id: 'enrich-model-metadata',
		name: 'Model Metadata Enrichment',
		path: '/api/mcp',
		method: 'POST',
		body: null,
		cooldown_s: 3600,
		priority: 28,
		pipeline: '3d',
		enabled: true,
		run: (ctx) => modelMetadataEnrichment(ctx),
	},

	// ── Club Cover Charge (social economy test) ────────────────────────────────
	{
		id: 'club-cover-health',
		name: 'Club Cover Charge Health',
		path: '/api/x402/club-cover',
		method: 'POST',
		body: { club: 'canary_test' },
		cooldown_s: 1800,
		priority: 35,
		pipeline: 'health',
		enabled: true,
		extractSignal: null,
	},

	// ── Avatar Optimization Pipeline (nightly MCP Health) ─────────────────────
	// Pays $0.001 USDC to run optimize_model analysis on the top 50 most-viewed
	// public avatars. Results upserted to avatar_optimization_results per avatar_id.
	// Downstream consumer: avatar owner notifications + model quality dashboard.
	// Cooldown: 86400 s (nightly — keeps daily spend to $0.001).
	{
		id: 'avatar-optimize-batch',
		name: 'Avatar Optimization Pipeline',
		path: '/api/x402/avatar-optimize-batch',
		method: 'POST',
		body: { limit: 50 },
		cooldown_s: 86400,
		priority: 30,
		pipeline: 'health',
		enabled: true,
		extractSignal: (r) => ({
			analyzed: r?.analyzed,
			critical_count: r?.critical_count,
			warn_count: r?.warn_count,
			total_size_bytes: r?.total_size_bytes,
		}),
	},
	// ── Scene Capture Video Queue Processor (USE-013, 3D Pipeline) ────
	// Drains scene_capture_queue: pays $0.01 USDC for one processing credit, then
	// submits the queued user video to the LingBot-Map GPU worker; subsequent
	// ticks poll for completion (free) and store the finished .ply point-cloud URL
	// + telemetry back on the queue row. run()-style entry — owns the full
	// scan → pay → submit → poll → store sequence (scene-capture-processor.js).
	// Downstream consumer: src/scene-capture.js renders result_url as a THREE.Points
	// cloud on /capture. Cooldown 120 s so user uploads auto-process within minutes.
	{
		id: 'scene-capture-processor',
		name: 'Scene Capture Video Queue Processor',
		path: SCENE_CAPTURE_ENDPOINT,
		endpoint: SCENE_CAPTURE_ENDPOINT,
		method: 'GET',
		price_atomic: SCENE_CAPTURE_PRICE_ATOMIC,
		cooldown_s: 120,
		cooldown_seconds: 120,
		priority: 60,
		pipeline: 'self',
		enabled: true,
		run: (ctx) => runSceneCaptureProcessor(ctx),
		extractSignal: null,
	},
	// ── Avatar Marketplace Dynamic Pricing (USE-020) ──────────────────────────
	// Pricing-integrity probe across every premium cosmetic. run() sweeps each
	// item's live 402 quote (free), flags drift / underpricing vs the catalog's
	// server-owned price, and makes ONE real x402 purchase of the cheapest item to
	// validate quote → pay → settle end-to-end. Per-item findings land in
	// cosmetic_pricing_audit; a summary row (value_extracted = drift summary) goes
	// to x402_autonomous_log. Cooldown 86400 s (daily — cosmetic pricing is a
	// slow-changing config). Downstream consumer: ops gates avatar-shop releases on
	// the underpriced flag so a pricing bug never ships at a loss.
	{
		id: 'cosmetic-pricing-audit',
		name: 'Avatar Marketplace Dynamic Pricing',
		path: '/api/x402/cosmetic-purchase',
		method: 'GET',
		body: null,
		cooldown_s: 86400,
		priority: 32,
		pipeline: 'commerce',
		enabled: true,
		run: (ctx) => cosmeticPricingAudit(ctx),
	},
	// ── Payment Revenue Reconciliation (USE-027, Finance) ─────────────────────
	// Daily financial-integrity sweep. Probes the free /api/x402-status endpoint to
	// confirm payment wiring is live, then cross-checks every settlement our books
	// claim (outbound x402_autonomous_log paid rows + inbound agent_payment_intents)
	// against the actual on-chain transaction via getSignatureStatuses. Flags any
	// row where the DB says settled but no tx exists on-chain, the tx reverted, or
	// no signature was kept. run()-style entry — owns the full probe → load → verify
	// → upsert sequence (revenue-reconciliation.js); read-only, so it runs even when
	// the spend wallet is absent. Per-record verdicts land in payment_reconciliation;
	// a summary (value_extracted = discrepancy counts) goes to x402_autonomous_log.
	// Cooldown 86400 s (daily). Downstream consumer: the financial-integrity surface
	// reads payment_reconciliation WHERE NOT reconciled to alert ops on unsettled or
	// failed payments before they corrupt revenue accounting.
	{
		id: 'revenue-reconciliation',
		name: 'Payment Revenue Reconciliation',
		path: '/api/x402-status',
		endpoint: '/api/x402-status',
		method: 'GET',
		body: null,
		price_atomic: 0, // /api/x402-status is free; reconciliation owes no payment
		cooldown_s: 86400,
		cooldown_seconds: 86400,
		priority: 28,
		pipeline: 'reconciliation',
		enabled: true,
		run: (ctx) => revenueReconciliation(ctx),
	},
	// Builder Code Attribution Tracker (Finance) — watchdog over ERC-8021
	// builder-code attribution, the mechanism Coinbase builder rewards / x402scan
	// use to credit on-chain x402 volume to the app that exposed the paid endpoint
	// (X402_BUILDER_CODE_APP = three_d_agent). run() sweeps a representative set of
	// priced /api/x402/* endpoints, verifying each declares the builder-code
	// extension (a = three_d_agent) on its live 402 challenge — any priced endpoint
	// that drops the declaration earns ZERO rewards on every dollar it settles, the
	// attribution gap this tracker alerts on. It then makes ONE real $0.001 USDC
	// payment to the cheapest declaring endpoint (dance-tip) with the builder-code
	// echo ATTACHED to the X-PAYMENT envelope (a/w/s), reads the X-PAYMENT-RESPONSE
	// settlement, and confirms an attributed payment settles end-to-end (the
	// resource server rejects a non-echoing payment with builder_code_tampered, so a
	// settled tx is proof). Per-endpoint verdicts upsert to builder_code_attribution
	// (keyed by endpoint); a summary (value_extracted = gap list + settle proof)
	// goes to x402_autonomous_log. Cooldown 21600 s (6h, ~$0.004/day) — attribution
	// config only changes on deploy/env, the live settle catches drift within hours.
	// Downstream consumer: api/ops/health.js -> loadBuilderAttribution() folds an
	// attribution gap (or a failed attributed settlement) into the platform health
	// verdict so on-call sees lost-rewards risk before a billing cycle closes.
	{
		id: 'builder-code-attribution',
		name: 'Builder Code Attribution Tracker',
		// path is informational — run() owns the multi-endpoint sweep + settle.
		path: '/api/x402/*',
		endpoint: '/api/x402/*',
		method: 'POST',
		body: null,
		price_atomic: 1000, // the single settlement proof pays $0.001 (dance-tip)
		cooldown_s: 21600,
		cooldown_seconds: 21600,
		priority: 31,
		pipeline: 'finance',
		enabled: true,
		run: (ctx) => builderCodeAttribution(ctx),
		extractSignal: null,
	},
	// ── Fee Calculation Validator (USE-028, Finance) ──────────────────────────
	// Fee-integrity probe over the platform's atomic↔decimal conversion — the
	// arithmetic that turns every USDC price into an x402 challenge amount and back
	// into a displayed dollar figure. run() exercises the REAL production
	// converters (usdcToAtomics / atomicsToUsdc) at the boundary atomics where
	// rounding bugs hide (1, 999, 1000, 1001, 999999), asserting exact render +
	// round-trip at each, then makes ONE real on-chain payment to the $0.001
	// dance-tip (1000 atomics — a boundary) to prove the deployed quote and the
	// settled amount agree with the local fee math end-to-end. Per-boundary
	// findings land in fee_calculation_audit; a summary (value_extracted = mismatch
	// counts) goes to x402_autonomous_log. Cooldown 21600 s (6h → ≤4 paid probes/day
	// ≈ $0.004/day) — fee math only changes on deploy, the live settle catches
	// deploy/env skew. Downstream consumer: ops gates releases on a mismatch=true
	// row (alongside cosmetic_pricing_audit) so an off-by-one in fee conversion
	// never ships and mis-bills buyers.
	{
		id: 'fee-calculation-validator',
		name: 'Fee Calculation Validator',
		path: '/api/x402/dance-tip',
		endpoint: '/api/x402/dance-tip',
		method: 'POST',
		body: null,
		price_atomic: 1000, // the live boundary settles $0.001; math sweep is free
		cooldown_s: 21600,
		cooldown_seconds: 21600,
		priority: 30,
		pipeline: 'finance',
		enabled: true,
		run: (ctx) => feeCalculationValidator(ctx),
	},
	// ── Charity Split Audit (Finance) ─────────────────────────────────────────
	// Giving-integrity audit — "ensures donation promises are kept." Weekly, it
	// (1) sweeps every charity-enabled merchant in x402_merchant_settings (free,
	// read-only) and flags any whose donation promise is unroutable (missing /
	// malformed cause address, zero share, cause == payout — a tip the checkout
	// silently drops), then (2) makes ONE real on-chain payment WITH a charity
	// split through the PRODUCTION checkout code (/api/x402-checkout prepare →
	// sign → encode → settle the $0.001 dance-tip, facilitator-sponsored fee) and
	// reads the settled tx back from chain to assert the cause wallet's
	// transferChecked leg landed with the EXACT computed atomics
	// (floor(amount × bps / 10000)). run() owns the sweep/pay/verify and writes
	// per-merchant + canary rows to charity_split_audit (value sink) and its own
	// x402_autonomous_log summary; the loop adds the billed row. The canary cause
	// wallet defaults to the seed wallet (safe self-route, zero net outflow);
	// X402_CHARITY_AUDIT_ADDRESS_SOLANA points it at a platform cause wallet.
	// Cooldown 604800 s (weekly) → ~$0.001/week. Downstream consumer: ops reads
	// charity_split_audit WHERE NOT config_valid OR charity_routed = false to alert
	// before a buyer is told their payment gave to a cause that never received it.
	{
		id: 'charity-split-audit',
		// path/endpoint are informational — run() probes + pays + verifies itself.
		path: '/api/x402-merchant',
		endpoint: '/api/x402-merchant',
		method: 'POST',
		price_atomic: 1000, // the canary settles the $0.001 dance-tip base; split rides along
		cooldown_s: 604800, // weekly — donation promises are a slow-changing config
		cooldown_seconds: 604800,
		priority: 31,
		pipeline: 'finance',
		enabled: true,
		run: (ctx) => charitySplitAudit(ctx),
		extractSignal: null,
	},
	// ── Cross-Chain Payment Cost Comparison (USE-029, Finance) ────────────────
	// Measures the real all-in cost of an identical $0.001 USDC payment on Solana
	// vs Base and tracks the gas premium between the rails over time. run() probes
	// the cheapest idempotent $0.001 endpoint (/api/x402/model-check) for the live
	// multi-network challenge (both networks quote the same amount, so the
	// comparison is apples to apples), settles the REAL Solana leg and reads its
	// actual on-chain meta.fee, prices the equivalent Base settlement from the live
	// Base gas price × the documented USDC ERC-3009 transferWithAuthorization gas
	// units, and converts both to USD with live SOL/ETH prices. Base outbound
	// settlement isn't attempted (no autonomous EVM payer is provisioned — same
	// boundary the circuit breaker hits); its gas figure is real live network data.
	// Per-run snapshots (amount + per-network gas/total USD + gas_premium_ratio +
	// cheapest_network) land in cross_chain_cost_comparison; the loop records the
	// paid Solana settlement to x402_autonomous_log (value_extracted = the cost
	// summary). Cooldown 3600 s (hourly — gas prices drift, one paid probe/hr ≈
	// $0.024/day) keeps a fresh premium trend well inside the daily cap.
	// Downstream consumer: GET /api/x402/network-cost surfaces the latest snapshot,
	// a rolling gas-premium average, and the recommended cheapest settlement
	// network — used to steer users to the cheaper rail and inform default pricing.
	{
		id: 'cross-chain-cost-comparison',
		name: 'Cross-Chain Payment Cost Comparison (Base + Solana)',
		// path/endpoint are informational — run() probes /api/x402/model-check and
		// settles the Solana leg itself. Real price is the live $0.001 challenge.
		path: '/api/x402-pay',
		endpoint: '/api/x402-pay',
		method: 'GET',
		price_atomic: 1000, // $0.001 USDC — the identical amount both rails quote
		cooldown_s: 3600,
		cooldown_seconds: 3600,
		priority: 34,
		pipeline: 'finance',
		enabled: true,
		run: (ctx) => crossChainCostComparison(ctx),
		extractSignal: null,
	},

	// ── IBM Granite Inference Health Check (USE-007) ──────────────────────────
	// Pays ONE real x402 batch call to /api/ibm-mcp that invokes all five paid
	// IBM Granite tools (chat, code, embed, analyze, forecast) with tiny canary
	// arguments. The IBM MCP server prices the whole request, so one on-chain
	// payment (~0.14 USDC) exercises the full watsonx.ai inference surface. run()
	// summarises the batch — verifying each tool answered with its expected schema
	// and tallying token throughput — and stores the verdict to
	// granite_inference_health (downstream consumer: GET /api/x402/granite-health,
	// the watsonx backend SLA + token-throughput dashboard feed). The paid
	// round-trip is recorded to x402_autonomous_log like every loop call.
	// Cooldown 21600 s (every 6 h → 4 paid sweeps/day ≈ $0.56/day) keeps an
	// expensive inference probe well inside the autonomous daily cap while still
	// catching a watsonx outage or a tool-schema regression within hours.
	{
		id: 'granite-inference-health',
		name: 'IBM Granite Inference Health Check',
		path: GRANITE_HEALTH_ENDPOINT,
		endpoint: GRANITE_HEALTH_ENDPOINT,
		method: 'POST',
		price_atomic: GRANITE_HEALTH_PRICE_ATOMIC,
		cooldown_s: 21600,
		cooldown_seconds: 21600,
		priority: 42,
		pipeline: 'health',
		enabled: true,
		run: (ctx) => runGraniteHealth(ctx),
		extractSignal: null,
	},

	// ── Rig Complexity Scorer (USE-017) ───────────────────────────────────────
	// Pays to call inspect_model on POST /api/mcp for a small batch of avatars
	// that have never been scored or whose GLB changed since the last score. From
	// each inspection it derives a 0-100 complexity score (bone count, vertices,
	// triangles, texture bytes, file size) and a tier (light/standard/heavy/
	// extreme), and upserts the result into avatar_complexity (keyed by avatar_id).
	// run() owns the per-avatar probe/pay/store and records one x402_autonomous_log
	// row per call with the parsed score in value_extracted (so it sets
	// outcome.recorded — the loop adds no duplicate summary row). Downstream
	// consumer: the Avatar Pricing Engine (USE-020) tiers marketplace listing
	// prices on avatar_complexity.tier, and the marketplace gallery raises a
	// "performance-heavy" badge when perf_warning is set. The MCP server prices
	// inspect_model at $0.01/call (no $0.001 tool exists), so each scored avatar
	// costs ~$0.01; cooldown 3600 s (hourly) with a 4-avatar batch drains any
	// backlog at ≤ $0.04/run and idles to ~zero spend once every avatar is scored.
	{
		id: 'rig-complexity-scorer',
		name: 'Rig Complexity Scorer',
		// path/endpoint are informational — run() builds the JSON-RPC body itself.
		path: '/api/mcp',
		endpoint: '/api/mcp',
		method: 'POST',
		body: null,
		price_atomic: 10_000, // $0.01 USDC — inspect_model's advertised per-call price
		cooldown_s: 3600,
		cooldown_seconds: 3600,
		priority: 48,
		pipeline: '3d',
		enabled: true,
		run: (ctx) => runRigComplexityScorer(ctx),
		extractSignal: null,
	},

	// ── Subscription Status Health Check (Commerce) ───────────────────────────
	// Daily integrity sweep over every paying x402 subscriber. run() enumerates all
	// subscriptions via the real admin endpoint GET /api/x402/admin/subscriptions
	// (authenticated as an internal service with INTERNAL_API_KEY — the GET-only
	// read bypass added to that route), falling back to the canonical
	// listSubscriptions() lib read if the HTTP path is unavailable. It classifies
	// each key (active | expiring_soon | expired | revoked), emails the subscriber
	// 7 days before expiry (once per expiry window), and upserts every verdict into
	// x402_subscription_health. Free + read-only: the admin endpoint owes no payment,
	// so this never moves funds (amountAtomic 0) and runs even without a spend
	// wallet. run() writes its own canonical x402_autonomous_log row (recorded:true)
	// with the per-run summary in value_extracted. Cooldown 86400 s (daily) → the
	// 7-day warning window is re-evaluated across ~7 runs so no expiry is missed.
	// Downstream consumer: the admin subscription-management surface badges
	// expiring/expired keys off x402_subscription_health, and ops alerting watches
	// status IN ('expired','expiring_soon') to catch a lapse before a partner's
	// integration breaks.
	{
		id: 'subscription-status-health-check',
		name: 'Subscription Status Health Check',
		// path/endpoint informational — run() owns the internal-service HTTP call.
		path: '/api/x402/admin/subscriptions',
		endpoint: '/api/x402/admin/subscriptions',
		method: 'GET',
		body: null,
		price_atomic: 0, // free internal endpoint — no payment owed
		cooldown_s: 86_400,
		cooldown_seconds: 86_400,
		priority: 34,
		pipeline: 'self',
		enabled: true,
		run: (ctx) => runSubscriptionHealth(ctx),
		extractSignal: null,
	},

	// ── External x402 Service Uptime Monitor (USE-038, Reliability) ────────────
	// Liveness gate in front of every external x402 service we depend on. The
	// registered external services live in x402_bazaar_catalog (snapshotted by the
	// Bazaar Discovery Warmup) plus any directly-registered EXTERNAL_ENDPOINTS;
	// production pipelines pay those endpoints, so a dead one wastes a tick (and
	// risks a half-settled payment). run() collects every distinct external URL and
	// probes each with a cheap, UNPAID HEAD request (falling back to OPTIONS then
	// GET when a server rejects HEAD): a 402 means the x402 endpoint is live, 2xx/3xx
	// is reachable, and 5xx or a network timeout means DOWN. Because the probe never
	// attaches an X-PAYMENT header, reading a 402 challenge is free — this pipeline
	// moves no funds (price_atomic 0, amountAtomic always 0). Each verdict upserts
	// into x402_service_uptime (consecutive_failures / last_seen_live tracked) and
	// run() records one x402_autonomous_log row per probe (value_extracted = the
	// verdict). Cooldown 900 s (15 min) catches an outage within minutes while a
	// Redis cursor rotates the per-run probe budget across a large catalog.
	// Downstream consumer: any pipeline paying an external endpoint calls
	// isServiceLive(sql, url) to skip a confirmed-dead service; listServiceUptime()
	// backs an ops reliability surface.
	{
		id: 'external-service-uptime-monitor',
		name: 'External x402 Service Uptime Monitor',
		// path/endpoint are informational — run() fans HEAD probes across the
		// external service registry itself; it owns no single URL.
		path: SERVICE_UPTIME_ENDPOINT,
		endpoint: SERVICE_UPTIME_ENDPOINT,
		method: 'HEAD',
		body: null,
		price_atomic: 0, // free probe — never pays
		cooldown_s: 900, // 15 min — catch outages fast; probes are free
		cooldown_seconds: 900,
		priority: 58, // reliability gate protects every paying external pipeline
		pipeline: 'reliability',
		enabled: true,
		run: (ctx) => runServiceUptimeMonitor(ctx),
		extractSignal: null,
	},

	// ── Spend Reservation Leak Detector (Finance) ─────────────────────────────
	// Liveness guard on the agent spend caps themselves. Every autonomous spend
	// reserves cap headroom first, then finalizes or releases it after settlement.
	// A crash between reserve and finalize/release orphans the reservation — it
	// holds headroom forever against money that never moved, silently exhausting
	// the agent's rolling-24h cap until every real spend fails `daily_exceeded`.
	// run() sweeps both reservation books for entries older than 1h that were never
	// finalized: USD reservations (agent_custody_events, status 'pending') released
	// via releaseSpendReservation() → marked 'failed', and SOL reservations
	// (agent_actions, payload.status 'reserved') recorded-then-released via
	// releaseSpend() (which deletes, so the evidence is captured first). Free DB
	// maintenance — no x402 challenge, no payment, amountAtomic always 0 — so it runs
	// even without the spend wallet (exactly when the cap most needs freeing). run()
	// writes its own canonical x402_autonomous_log row (recorded:true) with the sweep
	// summary in value_extracted. Cooldown 900 s (15 min) keeps the caps clean and
	// drains any backlog across runs. Value sink: spend_reservation_leaks (one row
	// per swept leak) + Redis x402:reservation-leak:{latest,alert}. Downstream
	// consumer: api/ops/health.js loadReservationLeaks() folds a spike in freshly
	// swept leaks into the platform health verdict (a sustained leak rate means a
	// reserve→finalize path is crashing and quietly starving agent spend caps).
	{
		id: 'spend-reservation-leak-detector',
		name: 'Spend Reservation Leak Detector',
		// path/endpoint are informational — run() owns the DB sweep + cleanup itself.
		path: '/api/_lib/agent-trade-guards',
		endpoint: '/api/_lib/agent-trade-guards',
		method: 'POST',
		body: null,
		price_atomic: 0, // free DB maintenance — no payment owed
		cooldown_s: 900, // 15 min — keep spend caps clean; the sweep is free
		cooldown_seconds: 900,
		priority: 62, // protects every autonomous spend path from a starved cap
		pipeline: 'finance',
		enabled: true,
		run: (ctx) => runReservationLeakDetector(ctx),
		extractSignal: null,
	},
];

// ── External registry ─────────────────────────────────────────────────────────
// External x402 services. Endpoints discovered via bazaar or direct registration.
// Add entries here as external services are onboarded. The autonomous loop
// calls these exactly like self-endpoints — same payment flow, same recording.
//
// X402_EXTERNAL_ENABLED=false disables the entire external section without
// touching individual enabled flags.

const EXTERNAL_ENDPOINTS = [
	// Populated by agents building out the external/ use cases.
	// Each entry added here becomes an active call in the autonomous loop.
	// Example structure (commented out until service endpoint is discovered):
	//
	// {
	//   id: 'helius-rpc-ping',
	//   name: 'Helius Premium RPC Health',
	//   url: 'https://api.helius.xyz/v0/x402/ping',
	//   method: 'GET',
	//   body: null,
	//   cooldown_s: 300,
	//   priority: 80,
	//   pipeline: 'external',
	//   enabled: false, // enable once endpoint URL confirmed
	//   extractSignal: (r) => ({ latency_ms: r?.latency_ms }),
	// },
];

// Maximum entries the loop processes per tick (prevents runaway spend).
export const MAX_PER_TICK = Number(process.env.X402_AUTONOMOUS_MAX_PER_TICK || 8);

// Daily USDC spend cap for the autonomous loop (atomics, 6 decimals).
// Default: $5.00 = 5_000_000 atomics. Override via env.
export const DAILY_CAP_ATOMIC = Number(process.env.X402_AUTONOMOUS_DAILY_CAP_ATOMIC || 5_000_000);

export function getSelfRegistry() { return SELF_ENDPOINTS; }
export function getExternalRegistry() { return EXTERNAL_ENDPOINTS; }

export function getFullRegistry() {
	const externalEnabled = process.env.X402_EXTERNAL_ENABLED !== 'false';
	const self = SELF_ENDPOINTS.filter((e) => e.enabled);
	const external = externalEnabled ? EXTERNAL_ENDPOINTS.filter((e) => e.enabled) : [];
	return [...self, ...external];
}
