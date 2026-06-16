// GET /api/cron/oracle-digest — daily Oracle conviction digest via Telegram.
//
// Runs once daily (08:00 UTC) and sends each armed Oracle subscriber a personal
// summary of:
//   • Their agent's armed status and mode
//   • Today's action count, wins, losses, open positions
//   • Realized PnL for the past 24 hours
//   • Up to 3 top-conviction coins currently above their threshold
//
// Only fires for watches with telegram_chat_id set. Fire-and-forget per
// subscriber — one failure never blocks others. Respects CRON_SECRET auth.

import { error, json, method, wrap } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import { sql } from '../_lib/db.js';

const TIER_EMOJI = { prime: '🟣', strong: '🔵', lean: '🟡', watch: '⚪', avoid: '🔴' };
const ALERT_TIMEOUT_MS = 5000;

function requireCron(req, res) {
	const secret = process.env.CRON_SECRET || env.CRON_SECRET;
	if (!secret) { error(res, 503, 'not_configured', 'CRON_SECRET unset'); return false; }
	const auth = req.headers['authorization'] || '';
	const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
	if (!constantTimeEquals(presented, secret)) {
		error(res, 401, 'unauthorized', 'invalid cron secret');
		return false;
	}
	return true;
}

function esc(s) {
	return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function subscribedWatches(network) {
	return sql`
		select w.agent_id, w.armed, w.mode, w.min_score, w.telegram_chat_id,
		       a.name as agent_name
		from oracle_agent_watch w
		join agent_identities a on a.id = w.agent_id and a.deleted_at is null
		where w.telegram_chat_id is not null and w.network = ${network}
	`.catch(() => []);
}

/** All follower subscriptions grouped by chat_id. */
async function followerSubscriptions(network) {
	const rows = await sql`
		select f.chat_id, f.min_score, f.agent_id, a.name as agent_name
		from oracle_followers f
		join agent_identities a on a.id = f.agent_id and a.deleted_at is null
		where f.network = ${network}
		order by f.chat_id, f.agent_id
	`.catch(() => []);

	// Group by chat_id
	const map = new Map();
	for (const r of rows) {
		if (!map.has(r.chat_id)) map.set(r.chat_id, { chat_id: r.chat_id, min_score: r.min_score, agents: [] });
		map.get(r.chat_id).agents.push({ agent_id: r.agent_id, agent_name: r.agent_name });
	}
	return [...map.values()];
}

async function followedAgentStats(agentIds, network) {
	if (!agentIds.length) return [];
	const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
	return sql`
		select a.agent_id, ai.name as agent_name,
		       count(a.id) as total,
		       count(a.id) filter (where a.outcome = 'win')  as wins,
		       count(a.id) filter (where a.outcome = 'loss') as losses,
		       sum(a.realized_pnl_sol)                       as pnl
		from oracle_watch_actions a
		join agent_identities ai on ai.id = a.agent_id
		where a.agent_id = any(${agentIds}::uuid[])
		  and a.network = ${network}
		  and a.acted_at > ${since}::timestamptz
		group by a.agent_id, ai.name
	`.catch(() => []);
}

function buildFollowerMessage(follower, agentStats, coins) {
	const agentList = follower.agents.map((a) => esc(a.agent_name || 'Agent')).join(', ');
	const lines = [
		`🔮 <b>Oracle daily digest — agents you follow</b>`,
		`Following: ${esc(agentList)}`,
		``,
	];

	if (agentStats.length) {
		lines.push(`<b>Last 24h activity</b>`);
		for (const s of agentStats) {
			const pnlStr = s.pnl != null && Number(s.pnl) !== 0
				? `  ·  PnL <b>${Number(s.pnl) >= 0 ? '+' : ''}${Number(s.pnl).toFixed(4)} SOL</b>`
				: '';
			lines.push(`• <b>${esc(s.agent_name || 'Agent')}</b>: ${s.total} action${s.total !== 1 ? 's' : ''}, ${s.wins}W / ${s.losses}L${pnlStr}`);
		}
		lines.push(``);
	} else {
		lines.push(`<i>No actions in the last 24h from your followed agents.</i>`, ``);
	}

	if (coins.length) {
		lines.push(`<b>Top conviction above your threshold (${follower.min_score})</b>`);
		for (const c of coins) {
			const e = TIER_EMOJI[c.tier] || '⚪';
			lines.push(`${e} <b>$${esc(c.symbol || c.mint.slice(0, 6))}</b> · <code>${c.score}</code> · <a href="https://three.ws/oracle?mint=${encodeURIComponent(c.mint)}">view</a>`);
		}
		lines.push(``);
	} else {
		lines.push(`<i>No coins above your threshold (${follower.min_score}) right now.</i>`, ``);
	}

	lines.push(`<a href="https://three.ws/oracle">Open Oracle →</a>`);
	return lines.join('\n');
}

async function todayStats(agentId, network) {
	const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
	const rows = await sql`
		select outcome, realized_pnl_sol, size_sol
		from oracle_watch_actions
		where agent_id = ${agentId} and network = ${network}
		  and acted_at > ${since}::timestamptz
	`.catch(() => []);
	let wins = 0, losses = 0, open = 0, pnl = 0;
	for (const r of rows) {
		if (r.outcome === 'win') wins++;
		else if (r.outcome === 'loss') losses++;
		else open++;
		if (r.realized_pnl_sol != null) pnl += Number(r.realized_pnl_sol);
	}
	return { total: rows.length, wins, losses, open, pnl: +pnl.toFixed(4) };
}

async function topCoins(minScore, network, limit = 3) {
	return sql`
		select mint, symbol, score, tier
		from oracle_conviction
		where network = ${network} and score >= ${minScore}
		order by score desc
		limit ${limit}
	`.catch(() => []);
}

async function sendDigest(chatId, text) {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	if (!token) return false;
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), ALERT_TIMEOUT_MS);
	try {
		const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
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
		const result = await r.json().catch(() => null);
		return result?.ok === true;
	} catch {
		return false;
	} finally {
		clearTimeout(timer);
	}
}

function buildMessage(watch, stats, coins) {
	const armedLabel = watch.armed
		? (watch.mode === 'live' ? '🟢 Armed · live' : '🟡 Armed · simulate')
		: '⚪ Disarmed';
	const agentName = esc(watch.agent_name || 'Your agent');

	const lines = [
		`🔮 <b>Oracle daily digest — ${agentName}</b>`,
		armedLabel,
		``,
	];

	if (stats.total > 0) {
		const pnlSign = stats.pnl >= 0 ? '+' : '';
		lines.push(
			`<b>Last 24h</b>  ${stats.total} action${stats.total !== 1 ? 's' : ''}`,
			`Wins <b>${stats.wins}</b>  ·  Losses <b>${stats.losses}</b>  ·  Open <b>${stats.open}</b>`,
		);
		if (stats.pnl !== 0) lines.push(`PnL  <b>${pnlSign}${stats.pnl} SOL</b>`);
		lines.push(``);
	} else {
		lines.push(`<i>No actions in the last 24h.</i>`, ``);
	}

	if (coins.length) {
		lines.push(`<b>Top signals above threshold (${watch.min_score})</b>`);
		for (const c of coins) {
			const e = TIER_EMOJI[c.tier] || '⚪';
			lines.push(`${e} <b>$${esc(c.symbol || c.mint.slice(0, 6))}</b> · <code>${c.score}</code> · <a href="https://three.ws/oracle?mint=${encodeURIComponent(c.mint)}">view</a>`);
		}
		lines.push(``);
	} else {
		lines.push(`<i>No coins above threshold (${watch.min_score}) right now.</i>`, ``);
	}

	lines.push(`<a href="https://three.ws/oracle">Open Oracle →</a>`);
	return lines.join('\n');
}

export default wrap(async (req, res) => {
	if (!method(req, res, ['GET', 'POST'])) return;
	if (!requireCron(req, res)) return;

	const network = process.env.ORACLE_NETWORK || 'mainnet';
	const token = process.env.TELEGRAM_BOT_TOKEN;
	if (!token) return json(res, 200, { ok: true, sent: 0, reason: 'TELEGRAM_BOT_TOKEN not set' });

	const watches = await subscribedWatches(network);
	if (!watches.length) return json(res, 200, { ok: true, sent: 0 });

	let sent = 0;
	let failed = 0;

	// Digest for armed agent owners
	for (const watch of watches) {
		const [stats, coins] = await Promise.all([
			todayStats(watch.agent_id, network),
			topCoins(Number(watch.min_score) || 54, network),
		]);
		const text = buildMessage(watch, stats, coins);
		const ok = await sendDigest(watch.telegram_chat_id, text);
		if (ok) sent++; else failed++;
	}

	// Digest for followers (users who followed agents but don't own one)
	// Skip chat_ids already receiving the owner digest above to avoid duplicate messages.
	const ownerChats = new Set(watches.map((w) => w.telegram_chat_id));
	const followers = (await followerSubscriptions(network)).filter((f) => !ownerChats.has(f.chat_id));

	for (const follower of followers) {
		const agentIds = follower.agents.map((a) => a.agent_id);
		const [agentStats, coins] = await Promise.all([
			followedAgentStats(agentIds, network),
			topCoins(Number(follower.min_score) || 54, network),
		]);
		const text = buildFollowerMessage(follower, agentStats, coins);
		const ok = await sendDigest(follower.chat_id, text);
		if (ok) sent++; else failed++;
	}

	return json(res, 200, { ok: true, network, subscribers: watches.length + followers.length, sent, failed });
});
