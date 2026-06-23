// Strategy Object config — the validated, versioned rule set behind a Strategy.
//
// A strategy is NOT free text: it is a structured plan with a real schema. This
// module is the single source of truth for that schema. It normalizes arbitrary
// owner input into a clean, bounded config; validates it (so a malformed rule
// set can never be saved); and evaluates a real pump.fun launch against the
// entry conditions (pure + synchronous, so it is trivially testable and the same
// logic runs in the runtime and in a backtest).
//
// Critically, the strategy's own caps (per-trade size, slippage, concurrency)
// are ADDITIONAL constraints layered on top of the agent's server-side spend
// policy — never a way around it. The runtime sizes a buy from `sizing.amount_sol`
// but the trade still passes through the full guard + custody path, so a strategy
// can never exceed the spend leash. Ever.

const ENTRY_TRIGGERS = ['new_launch'];
const NETWORKS = ['mainnet', 'devnet'];

export const STRATEGY_CONFIG_DEFAULTS = Object.freeze({
	network: 'mainnet',
	entry: {
		trigger: 'new_launch',
		max_age_minutes: 60,
		min_market_cap_usd: null,
		max_market_cap_usd: null,
		min_liquidity_sol: null,
		require_socials: false,
		max_creator_launches: null,
		min_creator_graduated: null,
		require_sol_quote: true,
	},
	sizing: {
		amount_sol: 0.1,
		max_slippage_bps: 500,
	},
	exits: {
		take_profit_pct: 100, // +100% = 2x
		stop_loss_pct: 40, // -40%
		trailing_stop_pct: null,
		max_hold_minutes: null,
	},
	risk: {
		max_concurrent_positions: 3,
		cooldown_minutes: 0,
	},
});

// Hard ceilings the schema enforces regardless of input — defensive bounds so a
// stored config can never carry a nonsense number into the runtime.
const BOUNDS = Object.freeze({
	amount_sol: { min: 0.0001, max: 100 },
	max_slippage_bps: { min: 0, max: 10000 },
	max_age_minutes: { min: 1, max: 10080 }, // up to 7 days
	take_profit_pct: { min: 1, max: 100000 },
	stop_loss_pct: { min: 1, max: 99 },
	trailing_stop_pct: { min: 1, max: 99 },
	max_hold_minutes: { min: 1, max: 525600 }, // up to 1 year
	max_concurrent_positions: { min: 1, max: 50 },
	cooldown_minutes: { min: 0, max: 10080 },
	market_cap_usd: { min: 0, max: 1e12 },
	liquidity_sol: { min: 0, max: 1e9 },
	creator_count: { min: 0, max: 100000 },
});

function numOrNull(v, { min = -Infinity, max = Infinity } = {}) {
	if (v === null || v === undefined || v === '') return null;
	const n = Number(v);
	if (!Number.isFinite(n)) return null;
	return Math.min(max, Math.max(min, n));
}

function intOrNull(v, bounds) {
	const n = numOrNull(v, bounds);
	return n === null ? null : Math.round(n);
}

function clampNum(v, def, { min = 0, max = Infinity, round = false } = {}) {
	const n = Number(v);
	if (!Number.isFinite(n)) return def;
	const c = Math.min(max, Math.max(min, n));
	return round ? Math.round(c) : c;
}

/** Turn a strategy name into a URL-safe, stable slug. */
export function slugifyStrategy(name) {
	const base = String(name || '')
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48);
	return base || 'strategy';
}

/**
 * Coerce arbitrary input into a clean, bounded, complete strategy config.
 * Always returns a fully-populated object (missing keys fall back to defaults).
 */
export function normalizeStrategyConfig(raw) {
	const r = raw && typeof raw === 'object' ? raw : {};
	const e = r.entry && typeof r.entry === 'object' ? r.entry : {};
	const s = r.sizing && typeof r.sizing === 'object' ? r.sizing : {};
	const x = r.exits && typeof r.exits === 'object' ? r.exits : {};
	const k = r.risk && typeof r.risk === 'object' ? r.risk : {};
	const d = STRATEGY_CONFIG_DEFAULTS;

	const trigger = ENTRY_TRIGGERS.includes(e.trigger) ? e.trigger : d.entry.trigger;
	const network = NETWORKS.includes(r.network) ? r.network : d.network;

	return {
		network,
		entry: {
			trigger,
			max_age_minutes: clampNum(e.max_age_minutes, d.entry.max_age_minutes, { ...BOUNDS.max_age_minutes, round: true }),
			min_market_cap_usd: numOrNull(e.min_market_cap_usd, BOUNDS.market_cap_usd),
			max_market_cap_usd: numOrNull(e.max_market_cap_usd, BOUNDS.market_cap_usd),
			min_liquidity_sol: numOrNull(e.min_liquidity_sol, BOUNDS.liquidity_sol),
			require_socials: e.require_socials === true,
			max_creator_launches: intOrNull(e.max_creator_launches, BOUNDS.creator_count),
			min_creator_graduated: intOrNull(e.min_creator_graduated, BOUNDS.creator_count),
			require_sol_quote: e.require_sol_quote !== false,
		},
		sizing: {
			amount_sol: clampNum(s.amount_sol, d.sizing.amount_sol, BOUNDS.amount_sol),
			max_slippage_bps: clampNum(s.max_slippage_bps, d.sizing.max_slippage_bps, { ...BOUNDS.max_slippage_bps, round: true }),
		},
		exits: {
			take_profit_pct: numOrNull(x.take_profit_pct, BOUNDS.take_profit_pct),
			// stop_loss is mandatory and always present — default applied if absent/invalid.
			stop_loss_pct: clampNum(x.stop_loss_pct, d.exits.stop_loss_pct, BOUNDS.stop_loss_pct),
			trailing_stop_pct: numOrNull(x.trailing_stop_pct, BOUNDS.trailing_stop_pct),
			max_hold_minutes: intOrNull(x.max_hold_minutes, BOUNDS.max_hold_minutes),
		},
		risk: {
			max_concurrent_positions: clampNum(k.max_concurrent_positions, d.risk.max_concurrent_positions, { ...BOUNDS.max_concurrent_positions, round: true }),
			cooldown_minutes: clampNum(k.cooldown_minutes, d.risk.cooldown_minutes, { ...BOUNDS.cooldown_minutes, round: true }),
		},
	};
}

/**
 * Validate a strategy config. Returns { valid, errors:[{field,message}], config }.
 * `config` is the normalized form (safe to persist). Errors are human-readable
 * and field-tagged so the UI can show them inline.
 */
export function validateStrategyConfig(raw) {
	const errors = [];
	const config = normalizeStrategyConfig(raw);

	if (!(config.sizing.amount_sol > 0)) {
		errors.push({ field: 'sizing.amount_sol', message: 'Per-trade size must be greater than 0 SOL.' });
	}
	if (!(config.exits.stop_loss_pct > 0)) {
		errors.push({ field: 'exits.stop_loss_pct', message: 'A stop-loss is required — every strategy must define its downside.' });
	}
	if (
		config.entry.min_market_cap_usd != null &&
		config.entry.max_market_cap_usd != null &&
		config.entry.min_market_cap_usd > config.entry.max_market_cap_usd
	) {
		errors.push({ field: 'entry.max_market_cap_usd', message: 'Max market cap must be greater than min market cap.' });
	}
	if (config.exits.take_profit_pct == null && config.exits.trailing_stop_pct == null && config.exits.max_hold_minutes == null) {
		errors.push({ field: 'exits', message: 'Define at least one upside exit: take-profit, trailing stop, or max hold.' });
	}

	return { valid: errors.length === 0, errors, config };
}

/**
 * Evaluate one real launch against a strategy's entry conditions. Pure +
 * synchronous. Returns { pass, reasons } — reasons always explains the verdict
 * (kept on rejections too, for the runtime's evaluation log).
 *
 * @param {object} config  normalized strategy config
 * @param {object} launch  normalized launch: { mint, created_at(ms), market_cap_usd,
 *                         liquidity_sol, creator_launches, creator_graduated,
 *                         twitter, telegram, website, is_usdc_pair }
 * @param {number} nowMs   current epoch ms
 */
export function matchesEntry(config, launch, nowMs) {
	const e = config.entry;
	const reasons = [];

	if (!launch || !launch.mint) return { pass: false, reasons: ['no_mint'] };

	// Age gate — only act on genuinely recent launches.
	if (e.max_age_minutes != null && launch.created_at) {
		const ageMin = (nowMs - Number(launch.created_at)) / 60000;
		if (!Number.isFinite(ageMin) || ageMin < 0) {
			// Clock skew / bad timestamp — treat as fresh, don't reject.
		} else if (ageMin > e.max_age_minutes) {
			return { pass: false, reasons: [`too_old:${Math.round(ageMin)}m`] };
		} else {
			reasons.push(`age:${Math.round(ageMin)}m`);
		}
	}

	// SOL-quote requirement — the agent wallet trades in SOL on this path.
	if (e.require_sol_quote && launch.is_usdc_pair === true) {
		return { pass: false, reasons: ['quote_not_sol'] };
	}

	const mc = numOrNull(launch.market_cap_usd);
	if (e.min_market_cap_usd != null) {
		if (mc == null || mc < e.min_market_cap_usd) return { pass: false, reasons: [`mc_below_min:${mc ?? 'n/a'}`] };
	}
	if (e.max_market_cap_usd != null && mc != null && mc > e.max_market_cap_usd) {
		return { pass: false, reasons: [`mc_above_max:${Math.round(mc)}`] };
	}
	if (mc != null) reasons.push(`mc:${Math.round(mc)}`);

	const liq = numOrNull(launch.liquidity_sol);
	if (e.min_liquidity_sol != null) {
		if (liq == null || liq < e.min_liquidity_sol) return { pass: false, reasons: [`liq_below_min:${liq ?? 'n/a'}`] };
		reasons.push(`liq:${liq.toFixed(2)}sol`);
	}

	const launches = numOrNull(launch.creator_launches);
	if (e.max_creator_launches != null && launches != null && launches > e.max_creator_launches) {
		return { pass: false, reasons: [`creator_launches:${launches}`] };
	}
	const graduated = numOrNull(launch.creator_graduated);
	if (e.min_creator_graduated != null) {
		if (graduated == null || graduated < e.min_creator_graduated) return { pass: false, reasons: [`creator_graduated_below:${graduated ?? 'n/a'}`] };
		reasons.push(`creator_graduated:${graduated}`);
	}

	const hasSocials = !!(launch.twitter || launch.telegram || launch.website);
	if (e.require_socials && !hasSocials) {
		return { pass: false, reasons: ['no_socials'] };
	}
	if (hasSocials) reasons.push('has_socials');

	return { pass: true, reasons };
}

/**
 * Decide whether an open position should exit, given a live re-quote. Pure.
 * Returns { exit, reason } — reason ∈ take_profit|stop_loss|trailing_stop|timeout.
 *
 * @param {object} config normalized config
 * @param {object} pos    { entry_lamports, peak_value_lamports, opened_at(ms) }
 * @param {bigint|number|string} currentValueLamports  live quoteForSell value
 * @param {number} nowMs
 */
export function shouldExit(config, pos, currentValueLamports, nowMs) {
	const x = config.exits;
	const entry = Number(pos.entry_lamports || 0);
	const cur = Number(currentValueLamports || 0);

	// Time-based exit is independent of price — check it even with no entry basis.
	if (x.max_hold_minutes != null && pos.opened_at) {
		const heldMin = (nowMs - Number(pos.opened_at)) / 60000;
		if (heldMin >= x.max_hold_minutes) return { exit: true, reason: 'timeout' };
	}

	if (!(entry > 0) || !(cur >= 0)) return { exit: false, reason: null };
	const pnlPct = ((cur - entry) / entry) * 100;

	if (x.take_profit_pct != null && pnlPct >= x.take_profit_pct) {
		return { exit: true, reason: 'take_profit' };
	}
	if (x.stop_loss_pct != null && pnlPct <= -x.stop_loss_pct) {
		return { exit: true, reason: 'stop_loss' };
	}
	if (x.trailing_stop_pct != null) {
		const peak = Math.max(Number(pos.peak_value_lamports || 0), cur, entry);
		if (peak > 0) {
			const dropFromPeakPct = ((peak - cur) / peak) * 100;
			if (dropFromPeakPct >= x.trailing_stop_pct) return { exit: true, reason: 'trailing_stop' };
		}
	}
	return { exit: false, reason: null };
}

export { ENTRY_TRIGGERS, NETWORKS };
