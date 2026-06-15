// agent-sniper — environment + runtime configuration.
//
// Reads and validates the process environment once at boot. Throws on missing
// REQUIRED vars so a misconfigured worker fails loudly instead of trading with
// half a config. Optional vars get sane, conservative defaults.

function req(name) {
	const v = process.env[name];
	if (!v || !String(v).trim()) {
		throw new Error(`[agent-sniper] missing required env var: ${name}`);
	}
	return v;
}

function num(name, def) {
	const raw = process.env[name];
	if (raw == null || raw === '') return def;
	const n = Number(raw);
	return Number.isFinite(n) ? n : def;
}

function bool(name, def = false) {
	const raw = process.env[name];
	if (raw == null || raw === '') return def;
	return /^(1|true|yes|on)$/i.test(String(raw).trim());
}

export function loadConfig() {
	// DATABASE_URL + JWT_SECRET are consumed transitively by db.js / agent-wallet.js.
	// We assert them here so the failure points at config, not a cryptic decrypt
	// error three layers deep on the first trade.
	req('DATABASE_URL');
	req('JWT_SECRET');

	const network = (process.env.SNIPER_NETWORK || 'mainnet').trim();
	if (network !== 'mainnet' && network !== 'devnet') {
		throw new Error(`[agent-sniper] SNIPER_NETWORK must be mainnet|devnet, got "${network}"`);
	}

	const mode = (process.env.SNIPER_MODE || 'simulate').trim();
	if (mode !== 'live' && mode !== 'simulate') {
		throw new Error(`[agent-sniper] SNIPER_MODE must be live|simulate, got "${mode}"`);
	}

	// Live trading on a public RPC will 429 under the new-mint firehose. Refuse to
	// start live without a real endpoint rather than silently dropping trades.
	if (mode === 'live' && !process.env.SOLANA_RPC_URL && !process.env.HELIUS_API_KEY) {
		throw new Error(
			'[agent-sniper] live mode requires SOLANA_RPC_URL or HELIUS_API_KEY (public RPC will rate-limit)',
		);
	}

	return {
		network,
		mode,
		// Global emergency stop — set SNIPER_GLOBAL_KILL=1 to halt all new buys
		// while still letting the position loop manage/exit open positions.
		globalKill: bool('SNIPER_GLOBAL_KILL', false),
		// Position re-quote / exit-evaluation cadence.
		pollMs: Math.max(1_000, num('SNIPER_POLL_MS', 5_000)),
		// How often the strategy cache is refreshed from the DB.
		strategyRefreshMs: Math.max(5_000, num('SNIPER_STRATEGY_REFRESH_MS', 15_000)),
		// Platform-wide buy throttle — a backstop independent of per-agent caps.
		maxGlobalBuysPerMin: Math.max(0, num('SNIPER_MAX_GLOBAL_BUYS_PER_MIN', 10)),
		// Watchdog: if the feed delivers nothing for this long, re-subscribe.
		feedWatchdogMs: Math.max(30_000, num('SNIPER_FEED_WATCHDOG_MS', 180_000)),
		// Confirmation timeout for a broadcast trade.
		confirmTimeoutMs: Math.max(15_000, num('SNIPER_CONFIRM_TIMEOUT_MS', 60_000)),
		// ── first-claim trigger ─────────────────────────────────────────────────
		// How often to poll the on-chain fee-claim stream for first-ever claims.
		claimPollMs: Math.max(10_000, num('SNIPER_CLAIM_POLL_MS', 30_000)),
		// Window scanned each poll — must comfortably exceed the poll interval so a
		// claim can't slip between scans.
		claimLookbackSeconds: Math.max(60, num('SNIPER_CLAIM_LOOKBACK_S', 600)),
		// Default freshness gate: ignore a first claim older than this when first
		// observed (a per-strategy first_claim_max_age_seconds overrides it). Keeps
		// a worker restart / backfill from sniping a stale claim.
		claimMaxAgeSeconds: Math.max(30, num('SNIPER_CLAIM_MAX_AGE_S', 300)),
	};
}
