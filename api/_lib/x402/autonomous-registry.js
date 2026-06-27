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
//   pipeline       — tag: 'oracle' | 'health' | 'volume' | 'sniper' | 'external'
//   enabled        — boolean; set false to pause without removing
//   extractSignal  — optional fn(responseBody) => object stored in x402_autonomous_log.signal_data
//                    For oracle pipeline entries, return { mint?, signal, confidence, headline }

const SELF_ENDPOINTS = [
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
