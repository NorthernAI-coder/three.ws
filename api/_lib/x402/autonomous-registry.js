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
import { run as volumeBootstrapLoop } from './pipelines/volume-bootstrap-loop.js';
import { run as cosmeticPricingAudit } from './pipelines/cosmetic-pricing-audit.js';
import { run as modelMetadataEnrichment } from './pipelines/model-metadata-enrichment.js';
import { run as forgeContentGeneration } from './pipelines/forge-content.js';
import { run as runAnimationRetargetQa, hasCanaryClips as hasAnimationQaCanaries } from './pipelines/animation-retarget-qa.js';
import { runCircuitBreaker } from './circuit-breaker.js';
import { mcpLatencySweep } from './mcp-latency-sweep.js';
import { runStreamingMcpHealth } from './pipelines/streaming-mcp-health.js';
import { publicUrl } from '../r2.js';
import {
	runSceneCaptureProcessor,
	SCENE_CAPTURE_ENDPOINT,
	SCENE_CAPTURE_PRICE_ATOMIC,
} from './scene-capture-processor.js';
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
		id: 'three-intel',
		name: '$THREE Signal Feed',
		path: '/api/x402/three-intel',
		method: 'POST',
		body: {},
		cooldown_s: 900,
		priority: 99,
		pipeline: 'oracle',
		enabled: true,
		extractSignal: (r) => ({ signal: r?.signal, headline: r?.headline, confidence: r?.confidence, price_usd: r?.price_usd }),
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

	// ── 3D Pipeline QA ─────────────────────────────────────────────────────────
	// Animation Retargeting QA: pays $0.005 USDC to download a canary animation
	// clip through the full paid-delivery path (402 paywall → R2 presign → GLB).
	// That delivery path ships clips produced by the retarget/canonicalize
	// pipeline (src/glb-canonicalize.js, src/animation-retarget.js), so a
	// regression that yields a missing, zero-byte, or non-GLB artifact surfaces
	// here as pass:false. The verdict is stored to x402_autonomous_log.signal_data
	// (queryable QA history); world-health / uptime dashboards consume it.
	// Gated on X402_ANIMATION_QA_CLIP_ID — disabled (no spend) until a canary
	// clip is designated. Cooldown 6h → ≤4 paid probes/day ≈ $0.02/day.
	{
		id: 'anim-retarget-qa',
		name: 'Animation Retargeting QA',
		path: `/api/x402/animation-download?id=${ANIM_QA_CLIP_ID}`,
		method: 'GET',
		body: null,
		cooldown_s: 21600,
		priority: 45,
		pipeline: 'qa',
		enabled: Boolean(ANIM_QA_CLIP_ID),
		extractSignal: (r) => {
			const sizeBytes = Number(r?.sizeBytes ?? 0);
			const mime = String(r?.mimeType || '');
			const hasDownload = !!r?.downloadUrl;
			const isGlb = /gltf-binary|\bglb\b/i.test(mime);
			return {
				clip: r?.slug || r?.id || null,
				name: r?.name || null,
				size_bytes: sizeBytes,
				mime,
				has_download: hasDownload,
				// All three must hold for the delivery path to be regression-free.
				pass: r?.ok === true && hasDownload && sizeBytes > 0 && isGlb,
			};
		},
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
