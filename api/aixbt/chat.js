// POST /api/aixbt/chat — converse with aixbt's `indigo` research agent.
//
// Part of the three.ws ⇄ aixbt bridge. Lets a three.ws agent ask aixbt a
// free-form market question and relay the answer (Pro/Holder aixbt plans).
//
// Body: { messages: [{ role, content }], ... } OR { message: "..." }
// Response: { reply, source } | { error, error_description }

import { wrap, cors, method, json, error, readJson } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { chatIndigo } from '../_lib/aixbt.js';
import { respondAixbtError } from './_shared.js';

const MAX_MESSAGES = 20;
const MAX_LEN = 4000;

function normalizeMessages(body) {
	if (Array.isArray(body?.messages)) {
		return body.messages
			.filter((m) => m && typeof m.content === 'string' && m.content.trim())
			.slice(-MAX_MESSAGES)
			.map((m) => ({
				role: m.role === 'assistant' || m.role === 'system' ? m.role : 'user',
				content: m.content.slice(0, MAX_LEN),
			}));
	}
	if (typeof body?.message === 'string' && body.message.trim()) {
		return [{ role: 'user', content: body.message.slice(0, MAX_LEN) }];
	}
	return [];
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['POST'])) return;

	const rl = await limits.aixbtIp(clientIp(req));
	if (!rl.success) return error(res, 429, 'rate_limited', 'too many requests');

	const body = await readJson(req).catch(() => null);
	const messages = normalizeMessages(body);
	if (!messages.length) {
		return error(res, 400, 'validation_error', 'provide a non-empty `message` or `messages` array');
	}

	try {
		const result = await chatIndigo(messages);
		return json(res, 200, result);
	} catch (err) {
		return respondAixbtError(res, err);
	}
});
