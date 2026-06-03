// POST /api/watsonx/govern — a single governed conversational turn, end to end
// on IBM watsonx.ai.
//
//   1. Pre-screen the user message with IBM Granite Guardian (input guardrail).
//   2. Generate the assistant reply on IBM Granite (watsonx.ai chat).
//   3. Post-screen the assistant reply with Granite Guardian (output guardrail).
//
// The response carries the reply plus both guardrail verdicts so the client can
// render a live trust panel and seal the turn into a verifiable audit receipt.
// This is the IBM-governed brain behind the /trust demo. No mock path: when
// watsonx credentials are absent we return { configured:false } so the UI can
// show an honest "connect watsonx" state; any inference error surfaces the real
// upstream cause.
//
// Body: { message: string, history?: [{role,content}], risks?: string[] }

import { z } from 'zod';
import { watsonxConfig, watsonxChatComplete } from '../_lib/watsonx.js';
import {
	assessRisks,
	DEFAULT_RISKS,
	GUARDIAN_RISK_KEYS,
	guardianModelId,
} from '../_lib/guardian.js';
import { wrap, cors, method, readJson, json, error } from '../_lib/http.js';

const Body = z.object({
	message: z.string().trim().min(1).max(4000),
	history: z
		.array(
			z.object({
				role: z.enum(['user', 'assistant']),
				content: z.string().min(1).max(4000),
			}),
		)
		.max(20)
		.optional(),
	risks: z.array(z.enum(GUARDIAN_RISK_KEYS)).min(1).max(8).optional(),
});

// The demo agent's persona. Kept tight: Granite is the brain, the page is the
// body, and the whole turn is governed by Guardian + sealed on-chain.
const SYSTEM_PROMPT =
	'You are Ada, the live demo agent for the three.ws × IBM partnership. You are an ' +
	'embodied 3D agent: your face and voice render in the browser via three.ws, and your ' +
	'brain runs on IBM Granite through watsonx.ai. Every message you send is screened by IBM ' +
	'Granite Guardian and sealed into a verifiable, on-chain-anchorable audit trail. Be warm, ' +
	'concise, and genuinely helpful. When asked about the partnership, explain that three.ws ' +
	'gives enterprise AI a governed, embodied presence. Keep replies to a few sentences unless ' +
	'asked for more.';

// Best-effort in-memory rate limit. Serverless instances are short-lived and not
// shared, so this throttles bursts on a warm instance rather than enforcing a
// global quota — enough to blunt accidental hammering of the demo without a
// datastore. Keyed by client IP.
const RATE = { windowMs: 60_000, max: 30 };
const hits = new Map(); // ip -> { count, resetAt }

function rateLimited(req) {
	const ip =
		(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
		req.socket?.remoteAddress ||
		'unknown';
	const now = Date.now();
	const rec = hits.get(ip);
	if (!rec || rec.resetAt < now) {
		hits.set(ip, { count: 1, resetAt: now + RATE.windowMs });
		return false;
	}
	rec.count += 1;
	return rec.count > RATE.max;
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS' })) return;
	if (!method(req, res, ['POST'])) return;

	const cfg = watsonxConfig();
	if (!cfg.configured) {
		// 200 with configured:false — the demo UI renders a first-class "connect
		// watsonx" state from this rather than treating it as an error.
		return json(res, 200, {
			ok: true,
			configured: false,
			reason: 'IBM watsonx.ai credentials are not configured on this deployment.',
			requires: ['WATSONX_API_KEY', 'WATSONX_PROJECT_ID (or WATSONX_SPACE_ID)'],
			models: { brain: cfg.chatModel, guardian: guardianModelId() },
		});
	}

	if (rateLimited(req)) {
		return error(res, 429, 'rate_limited', 'Too many requests — slow down and try again shortly.');
	}

	const parsed = Body.safeParse(await readJson(req));
	if (!parsed.success) {
		return json(res, 400, {
			error: 'validation_error',
			error_description: 'invalid request body',
			issues: parsed.error.issues,
		});
	}
	const { message, history = [], risks: requestedRisks } = parsed.data;
	const risks = requestedRisks?.length ? requestedRisks : DEFAULT_RISKS;

	// 1. Input guardrail — screen the user message before the brain ever sees it.
	const input = await assessRisks(cfg, { user: message, risks });

	// 2. Brain — generate the reply on IBM Granite via watsonx.ai.
	const completion = await watsonxChatComplete(cfg, {
		messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history, { role: 'user', content: message }],
		maxTokens: 600,
		temperature: 0.6,
	});
	const reply = (completion.text || '').trim();

	// 3. Output guardrail — screen the assistant reply against the same risks.
	const output = reply
		? await assessRisks(cfg, { user: message, assistant: reply, risks })
		: { subject: 'assistant', results: [], flagged: [], anyFlagged: false };

	return json(res, 200, {
		ok: true,
		configured: true,
		models: { brain: completion.model, guardian: guardianModelId() },
		reply,
		input,
		output,
		usage: completion.usage || null,
		risks,
	});
});
