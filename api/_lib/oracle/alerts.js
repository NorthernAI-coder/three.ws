// Oracle — conviction alerts via Telegram.
//
// When the oracle-score cron produces a prime (≥86) or strong (≥72) conviction
// coin for the first time, this module fires a Telegram message to the signals
// channel. The channel is separate from the ops alerts (TELEGRAM_ALERTS_CHAT_ID)
// and the changelog channel (TELEGRAM_CHANGELOG_CHAT_ID) — holders subscribe to
// it for actionable pump.fun conviction signals.
//
// Env:
//   TELEGRAM_BOT_TOKEN            — same bot used across the platform
//   TELEGRAM_ORACLE_CHAT_ID       — signals channel (@handle or -100… numeric)
//
// Dedup: an in-memory Set of alerted mints per process restart, plus a DB flag
// (oracle_conviction.alerted_at) that persists across restarts so we never fire
// twice for the same coin even if the worker cold-starts.
//
// Fire-and-forget with a 4s abort — never delays the scoring loop.

import { sql } from '../db.js';

const ALERT_TIMEOUT_MS = 4000;
// Minimum tier to alert on. 'prime' only = exclusive. 'strong' = more volume.
const MIN_ALERT_TIER = process.env.ORACLE_ALERT_MIN_TIER || 'strong';
const TIER_ORDER = { prime: 3, strong: 2, lean: 1, watch: 0, avoid: -1 };
const MIN_TIER_RANK = TIER_ORDER[MIN_ALERT_TIER] ?? 2;

// In-memory dedup for this process lifetime — prevents double-fire within the
// same worker even if alerted_at DB write is slow.
const _alerted = new Set();

const TIER_EMOJI = { prime: '🟣', strong: '🔵', lean: '🟡', watch: '⚪', avoid: '🔴' };

function tierEmoji(tier) { return TIER_EMOJI[tier] || '⚪'; }

function format(coin) {
	const emoji = tierEmoji(coin.tier);
	const pct = (n) => (n != null ? `${Math.round(Number(n))}` : '?');
	const pillars = coin.pillars
		? `Who ${pct(coin.pillars.pedigree)} · How ${pct(coin.pillars.structure)} · What ${pct(coin.pillars.narrative)} · Move ${pct(coin.pillars.momentum)}`
		: '';
	const category = coin.category ? ` · ${coin.category}` : '';
	const smart = coin.smart_wallet_count ? ` · ${coin.smart_wallet_count} smart in` : '';
	return [
		`${emoji} <b>${escHtml(coin.symbol || '—')}</b> <code>${coin.score}</code> conviction <i>${escHtml(coin.tier)}</i>`,
		escHtml(coin.name || ''),
		pillars ? `<i>${pillars}</i>` : '',
		`<code>${escHtml(coin.mint)}</code>`,
		`${category}${smart}`,
		`<a href="https://pump.fun/coin/${encodeURIComponent(coin.mint)}">pump.fun</a>  ·  <a href="https://three.ws/launch-detail?mint=${encodeURIComponent(coin.mint)}">Oracle</a>`,
	].filter(Boolean).join('\n');
}

function escHtml(s) {
	return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function send(text) {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	const chatId = process.env.TELEGRAM_ORACLE_CHAT_ID;
	if (!token || !chatId) return;

	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), ALERT_TIMEOUT_MS);
	try {
		await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				chat_id: chatId,
				text: text.slice(0, 4000),
				parse_mode: 'HTML',
				disable_web_page_preview: true,
			}),
			signal: ctrl.signal,
		});
	} catch { /* fire-and-forget */ } finally {
		clearTimeout(timer);
	}
}

/**
 * Mark a coin as alerted in oracle_conviction so the flag survives restarts.
 * Best-effort — never throws into the alert path.
 */
async function markAlerted(mint, network) {
	try {
		await sql`
			update oracle_conviction set alerted_at = now()
			where mint = ${mint} and network = ${network} and alerted_at is null
		`;
	} catch { /* non-fatal */ }
}

/**
 * Fire alerts for newly-scored coins that cross the tier threshold for the
 * first time. Called by the oracle-score cron after each score pass.
 *
 * @param {Array<{mint:string, symbol:string, name:string, score:number, tier:string, pillars?:object, category?:string, smart_wallet_count?:number}>} coins
 * @param {string} network
 * @returns {Promise<number>} number of alerts sent
 */
export async function alertNewHighConviction(coins, network = 'mainnet') {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	const chatId = process.env.TELEGRAM_ORACLE_CHAT_ID;
	if (!token || !chatId) return 0; // silently no-op when not configured

	// Filter to coins that cross the min tier threshold and haven't been alerted.
	const candidates = coins.filter((c) => {
		const rank = TIER_ORDER[c.tier] ?? -1;
		if (rank < MIN_TIER_RANK) return false;
		if (_alerted.has(c.mint)) return false;
		return true;
	});
	if (!candidates.length) return 0;

	// Check the DB to skip any already-alerted mints (across restarts).
	const mints = candidates.map((c) => c.mint);
	let alreadyAlerted = new Set();
	try {
		const rows = await sql`
			select mint from oracle_conviction
			where mint = any(${mints}::text[]) and network = ${network} and alerted_at is not null
		`;
		alreadyAlerted = new Set(rows.map((r) => r.mint));
	} catch { /* treat as empty on DB error */ }

	let sent = 0;
	for (const coin of candidates) {
		if (alreadyAlerted.has(coin.mint)) { _alerted.add(coin.mint); continue; }
		_alerted.add(coin.mint);
		await send(format(coin));
		await markAlerted(coin.mint, network);
		sent++;
	}
	return sent;
}
