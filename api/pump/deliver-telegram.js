// POST /api/pump/deliver-telegram
//
// Pushes a single pump.fun signal to a Telegram chat via the platform bot.
// This drives the verified platform bot identity, so it is gated behind an
// authenticated session OR a valid bearer token and rate-limited per-IP —
// without that, anyone on the internet could turn the bot into a spam/phishing
// relay (a direct server-to-server POST is not subject to browser CORS).

import { cors, error, json, method, readJson, wrap } from '../_lib/http.js';
import { getSessionUser, authenticateBearer, extractBearer } from '../_lib/auth.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { z } from 'zod';
import { parse } from '../_lib/validate.js';

const deliverSchema = z.object({
	chatId: z.union([z.string().min(1).max(64), z.number().int()]),
	signal: z.object({
		kind: z.enum(['mint', 'whale', 'claim', 'graduation']),
		mint: z.string().max(64).optional().default(''),
		summary: z.string().max(2000).optional().default(''),
		ts: z.number().optional(),
	}),
});

// Escape text for Telegram's legacy `Markdown` parse_mode so attacker-supplied
// summary/mint text can't inject markup or break out of the formatting (and so
// it can't smuggle clickable links under the bot's identity). Legacy Markdown
// treats _ * ` [ as control characters.
function escapeMarkdown(text) {
	return String(text).replace(/[_*`[]/g, '\\$&');
}

function formatSignal(signal) {
	const time = signal.ts ? new Date(signal.ts).toUTCString() : '';
	const kind = escapeMarkdown((signal.kind || 'signal').toUpperCase());
	const mint = escapeMarkdown(signal.mint || '');
	const summary = escapeMarkdown(signal.summary || '');
	return `*${kind}* — \`${mint}\`\n${summary}\n${escapeMarkdown(time)}`;
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;

	// Authenticate: a signed-in session or a valid bearer token. This bot speaks
	// under the platform's verified identity — never let an anonymous caller
	// drive it.
	let authed = false;
	try {
		const session = await getSessionUser(req);
		if (session) authed = true;
	} catch { /* fall through to bearer */ }
	if (!authed) {
		const token = extractBearer(req);
		if (token) {
			const bearer = await authenticateBearer(token).catch(() => null);
			if (bearer) authed = true;
		}
	}
	if (!authed) return error(res, 401, 'unauthorized', 'sign in or provide a valid bearer token');

	const rl = await limits.authIp(clientIp(req));
	if (!rl.success) return error(res, 429, 'rate_limited', 'too many delivery requests');

	const token = process.env.TELEGRAM_BOT_TOKEN;
	if (!token) return error(res, 500, 'misconfigured', 'TELEGRAM_BOT_TOKEN is not set');

	const body = await readJson(req).catch(() => null);
	if (!body) return error(res, 400, 'validation_error', 'JSON body required');
	const { chatId, signal } = parse(deliverSchema, body);

	const text = formatSignal(signal);
	const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ chat_id: chatId, parse_mode: 'Markdown', text }),
	});

	const data = await r.json().catch(() => ({}));
	if (!r.ok) return error(res, 502, 'telegram_error', data.description || `HTTP ${r.status}`);

	return json(res, 200, { ok: true, messageId: data.result?.message_id });
});
