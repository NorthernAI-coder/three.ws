// POST /api/guardian/assess — IBM Granite Guardian governance for AI agents.
//
// The watsonx "Trust Layer": classify a message (or a proposed autonomous action)
// against IBM's Granite Guardian risk model and return a structured verdict plus
// a tamper-evident, hash-chained audit record. This is what lets a three.ws
// avatar — which thinks on Granite and holds its own Solana wallet — be GOVERNED
// by Granite before it acts. Same IBM Cloud key, same watsonx.ai REST surface as
// the Granite brain (see api/_lib/granite-guardian.js).
//
// Body:
//   { text }                                  → assess one user message
//   { messages: [{role,content}] }            → assess a conversation
//   { risks: ["jailbreak","harm", …] }        → which risks to score (optional)
//   { action: { type:"sendSol", usd, to } }   → govern an autonomous value transfer
//   { prev: "<64-hex audit hash>" }           → link this record onto a chain
//
// Response: { model, decision, flagged, reasons, topRisk, risks[], record, … }
//   decision ∈ allow | review | block. `record.hash` chains to `record.prev`.
//
// No mock path. When watsonx is unconfigured the endpoint returns 503
// `guardian_unconfigured` so the caller renders an honest state instead of a
// fabricated verdict. Every score is a real Granite Guardian classifier pass.

import { cors, method, readJson, error, json, wrap, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { recordEvent } from '../_lib/usage.js';
import {
	guardianConfig,
	assess,
	decide,
	governSend,
	buildAuditRecord,
	RISKS,
	RISK_NAMES,
} from '../_lib/granite-guardian.js';

const MAX_TEXT_LEN = 4000;
const MAX_TURNS = 20;
// Default risk panel for the standalone assess flow — the user-facing harms a
// governance dashboard wants on screen. All are scorable from a single message.
const SHOWCASE_RISKS = ['harm', 'jailbreak', 'violence', 'social_bias', 'profanity', 'sexual_content', 'unethical_behavior'];

function bad(res, msg) {
	return error(res, 400, 'bad_request', msg);
}

// Normalize the assessed input into a {messages, summary} pair. `summary` is the
// human-readable content the audit record commits to (hashed, never stored raw).
function parseInput(body) {
	if (typeof body.text === 'string') {
		const t = body.text.trim();
		if (!t) throw new Error('text must not be empty');
		if (t.length > MAX_TEXT_LEN) throw new Error(`text exceeds ${MAX_TEXT_LEN} chars`);
		return { input: t, summary: t };
	}
	if (Array.isArray(body.messages)) {
		if (!body.messages.length || body.messages.length > MAX_TURNS) {
			throw new Error(`messages must hold 1–${MAX_TURNS} turns`);
		}
		const input = [];
		for (const m of body.messages) {
			if (!m || typeof m.content !== 'string') throw new Error('each message needs a string content');
			const content = m.content.trim();
			if (!content) throw new Error('message content must not be empty');
			if (content.length > MAX_TEXT_LEN) throw new Error(`a message exceeds ${MAX_TEXT_LEN} chars`);
			const role = m.role === 'assistant' ? 'assistant' : m.role === 'context' ? 'context' : 'user';
			input.push({ role, content });
		}
		const summary = input.map((m) => `${m.role}: ${m.content}`).join('\n');
		return { input, summary };
	}
	throw new Error('provide `text` (string) or `messages` (array)');
}

function parseRisks(raw) {
	if (raw == null) return null;
	if (!Array.isArray(raw)) throw new Error('risks must be an array of risk names');
	const wanted = raw.filter((r) => RISK_NAMES.includes(r));
	if (!wanted.length) throw new Error(`risks must include at least one of: ${RISK_NAMES.join(', ')}`);
	return wanted;
}

function parseAction(raw) {
	if (raw == null) return null;
	if (typeof raw !== 'object') throw new Error('action must be an object');
	if (raw.type !== 'sendSol') throw new Error('only action.type "sendSol" is supported');
	const usd = Number(raw.usd);
	if (!Number.isFinite(usd) || usd <= 0) throw new Error('action.usd must be a positive number');
	return { type: 'sendSol', usd, to: typeof raw.to === 'string' ? raw.to.slice(0, 64) : null };
}

function round(n) {
	return Math.round(n * 1e4) / 1e4;
}

export default wrap(async function handler(req, res) {
	if (cors(req, res, { methods: 'POST,OPTIONS' })) return;
	if (!method(req, res, ['POST'])) return;

	// Per-IP burst control + a global hourly ceiling that caps watsonx spend
	// regardless of how many distinct clients call in.
	const ip = clientIp(req);
	const perIp = await limits.guardianIp(ip);
	if (!perIp.success) {
		return rateLimited(res, perIp, 'too many governance requests — slow down');
	}
	const globalLimit = await limits.guardianGlobal();
	if (!globalLimit.success) {
		return rateLimited(res, globalLimit, 'governance capacity reached — try again shortly');
	}

	let body;
	try {
		body = await readJson(req, 100_000);
	} catch (e) {
		return bad(res, e.message || 'invalid JSON body');
	}

	let parsed;
	let risks;
	let action;
	try {
		parsed = parseInput(body);
		risks = parseRisks(body.risks);
		action = parseAction(body.action);
	} catch (e) {
		return bad(res, e.message);
	}

	const cfg = guardianConfig();
	if (!cfg.configured) {
		return error(
			res,
			503,
			'guardian_unconfigured',
			'IBM watsonx is not configured. Set WATSONX_API_KEY and WATSONX_PROJECT_ID to enable Granite Guardian governance.',
		);
	}

	const started = Date.now();
	let verdicts;
	let decision;
	let cap = null;
	let capExceeded = false;
	try {
		if (action) {
			const g = await governSend(cfg, { input: parsed.input, usd: action.usd });
			verdicts = g.verdicts;
			cap = g.cap;
			capExceeded = g.capExceeded;
			decision = { decision: g.decision, flagged: g.flagged, reasons: g.reasons, topRisk: g.topRisk };
		} else {
			verdicts = await assess(cfg, { input: parsed.input, risks: risks || SHOWCASE_RISKS });
			decision = decide(verdicts);
		}
	} catch (e) {
		// A real upstream failure (IAM, region, model) — surface it, don't invent.
		return error(res, 502, 'guardian_failed', `Granite Guardian assessment failed: ${e.message}`);
	}

	const record = buildAuditRecord({
		prev: body.prev,
		model: cfg.model,
		content: parsed.summary,
		action,
		decision,
		verdicts,
	});
	const latencyMs = Date.now() - started;

	recordEvent({
		clientId: ip,
		kind: 'guardian',
		tool: cfg.model,
		latencyMs,
		meta: {
			provider: 'watsonx',
			decision: decision.decision,
			risks_scored: verdicts.length,
			flagged: decision.flagged,
			action: action ? action.type : null,
		},
	});

	return json(res, 200, {
		model: cfg.model,
		decision: decision.decision,
		flagged: decision.flagged,
		reasons: decision.reasons,
		topRisk: decision.topRisk,
		...(action ? { cap, capExceeded, action: { type: action.type, usd: action.usd } } : {}),
		risks: verdicts.map((v) => ({
			risk: v.risk,
			label: RISKS[v.risk]?.label || v.risk,
			flagged: v.flagged,
			probability: round(v.probability),
			confidence: v.confidence,
			estimated: v.estimated,
		})),
		record,
		latencyMs,
	});
});
