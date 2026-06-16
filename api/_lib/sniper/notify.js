// Sniper trade notifications — Telegram.
//
// Fires when the agent-sniper worker opens or closes a position. Uses
// TELEGRAM_SNIPER_CHAT_ID if set (a dedicated sniper alerts channel), falling
// back to TELEGRAM_ALERTS_CHAT_ID (the general ops channel). Either way it's
// fire-and-forget with a 3s abort — never delays the trade path.
//
// Env:
//   TELEGRAM_BOT_TOKEN          — shared bot (same as oracle/alerts)
//   TELEGRAM_SNIPER_CHAT_ID     — dedicated sniper notifications channel (preferred)
//   TELEGRAM_ALERTS_CHAT_ID     — ops fallback if the dedicated channel is absent

const TIMEOUT_MS = 3000;

function chatId() {
	return process.env.TELEGRAM_SNIPER_CHAT_ID || process.env.TELEGRAM_ALERTS_CHAT_ID || null;
}

function send(text) {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	const id = chatId();
	if (!token || !id) return;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			chat_id: id,
			text: text.slice(0, 4000),
			disable_web_page_preview: true,
		}),
		signal: controller.signal,
		keepalive: true,
	})
		.catch(() => {})
		.finally(() => clearTimeout(timer));
}

const n2 = (v) => (v != null ? Number(v).toFixed(4) : '—');
const pct = (v) => (v != null ? `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(1)}%` : '—');
const icon = (r) => ({ take_profit: '✅', trailing_stop: '✅', stop_loss: '🛑', timeout: '⏱', kill_switch: '☠️', graduated: '🎓' }[r] || '📤');

/**
 * Notify when the sniper opens a position (buy confirmed).
 */
export function notifyBuy({ agentName, symbol, mint, solSpent, mode, sig }) {
	const modeTag = mode === 'live' ? '' : ' [sim]';
	const pumpLink = mint ? `https://pump.fun/coin/${mint}` : null;
	const solLink = sig && sig !== 'SIMULATED' ? `https://solscan.io/tx/${sig}` : null;
	const lines = [
		`🎯 Sniper BUY${modeTag}`,
		`Agent: ${agentName || 'unknown'}`,
		`Coin:  ${symbol || '?'}`,
		`Size:  ${n2(solSpent)} SOL`,
	];
	if (pumpLink) lines.push(`pump.fun: ${pumpLink}`);
	if (solLink) lines.push(`tx: ${solLink}`);
	send(lines.join('\n'));
}

/**
 * Notify when the sniper closes a position (sell confirmed or failed).
 */
export function notifySell({ agentName, symbol, mint, pnlSol, pnlPct, exitReason, mode, sig }) {
	const modeTag = mode === 'live' ? '' : ' [sim]';
	const solLink = sig && sig !== 'SIMULATED' ? `https://solscan.io/tx/${sig}` : null;
	const pumpLink = mint ? `https://pump.fun/coin/${mint}` : null;
	const lines = [
		`${icon(exitReason)} Sniper SELL${modeTag}  (${exitReason || 'exit'})`,
		`Agent: ${agentName || 'unknown'}`,
		`Coin:  ${symbol || '?'}`,
		`PnL:   ${n2(pnlSol)} SOL  ${pct(pnlPct)}`,
	];
	if (pumpLink) lines.push(`pump.fun: ${pumpLink}`);
	if (solLink) lines.push(`tx: ${solLink}`);
	send(lines.join('\n'));
}
