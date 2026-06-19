/**
 * Dynamic pricing rules for a specific agent skill.
 *
 * Routes:
 *   GET    /api/agents/:id/pricing-rules?skill=:skill   list rules for skill
 *   POST   /api/agents/:id/pricing-rules                create rule
 *   PATCH  /api/agents/:id/pricing-rules/:ruleId        update rule
 *   DELETE /api/agents/:id/pricing-rules/:ruleId        deactivate rule
 */

import { z } from 'zod';
import { sql } from '../../_lib/db.js';
import { getSessionUser } from '../../_lib/auth.js';
import { cors, json, method, wrap, error, readJson, rateLimited } from '../../_lib/http.js';
import { limits, clientIp } from '../../_lib/rate-limit.js';
import { requireCsrf } from '../../_lib/csrf.js';
import { isUuid } from '../../_lib/validate.js';

const RULE_TYPES = ['first_n_purchases', 'after_n_purchases', 'time_window'];

const createSchema = z.object({
	skill_name:    z.string().trim().min(1).max(100),
	rule_type:     z.enum(RULE_TYPES),
	threshold:     z.number().int().min(1).optional(),
	price_amount:  z.number().int().min(1),
	currency_mint: z.string().trim().min(1).max(100),
	chain:         z.string().trim().min(1).max(20).default('solana'),
	start_at:      z.string().datetime().optional(),
	end_at:        z.string().datetime().optional(),
	priority:      z.number().int().min(0).max(100).default(0),
}).refine(d => {
	if (d.rule_type !== 'time_window') return true;
	return d.start_at || d.end_at;
}, { message: 'time_window rules require start_at or end_at' }).refine(d => {
	if (d.rule_type === 'time_window') return true;
	return Number.isInteger(d.threshold);
}, { message: 'threshold required for first_n_purchases and after_n_purchases rules' });

const patchSchema = z.object({
	threshold:    z.number().int().min(1).optional(),
	price_amount: z.number().int().min(1).optional(),
	start_at:     z.string().datetime().optional().nullable(),
	end_at:       z.string().datetime().optional().nullable(),
	priority:     z.number().int().min(0).max(100).optional(),
	is_active:    z.boolean().optional(),
});

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,POST,PATCH,DELETE,OPTIONS', credentials: true })) return;

	const url = new URL(req.url, 'http://x');
	const parts = url.pathname.split('/').filter(Boolean);
	const agentId = url.searchParams.get('id')      || parts[2] || null;
	const ruleId  = url.searchParams.get('rule_id') || parts[4] || null;

	if (!agentId || !isUuid(agentId))
		return error(res, 400, 'validation_error', 'valid agent id required');

	if (req.method === 'GET')    return handleList(req, res, agentId);
	if (req.method === 'POST' && !ruleId) return handleCreate(req, res, agentId);
	if (req.method === 'PATCH' && ruleId) return handlePatch(req, res, agentId, ruleId);
	if (req.method === 'DELETE' && ruleId) return handleDelete(req, res, agentId, ruleId);

	return error(res, 405, 'method_not_allowed', 'method not allowed');
});

async function ownerCheck(req, res, agentId) {
	const user = await getSessionUser(req);
	if (!user) { error(res, 401, 'unauthorized', 'sign in required'); return null; }
	const [agent] = await sql`
		SELECT id FROM agent_identities WHERE id = ${agentId} AND user_id = ${user.id} AND deleted_at IS NULL
	`;
	if (!agent) { error(res, 403, 'forbidden', 'not your agent'); return null; }
	return user;
}

async function handleList(req, res, agentId) {
	if (!method(req, res, ['GET'])) return;
	const skill = req.query?.skill || null;

	const rules = await sql`
		SELECT id, skill_name, rule_type, threshold, price_amount, currency_mint, chain,
		       start_at, end_at, priority, is_active, created_at
		FROM skill_pricing_rules
		WHERE agent_id = ${agentId}
		  ${skill ? sql`AND skill_name = ${skill}` : sql``}
		ORDER BY skill_name, priority ASC, created_at ASC
	`;

	return json(res, 200, { data: { rules } });
}

async function handleCreate(req, res, agentId) {
	if (!method(req, res, ['POST'])) return;
	const user = await ownerCheck(req, res, agentId);
	if (!user) return;
	if (!(await requireCsrf(req, res, user.id))) return;

	const rl = await limits.authIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const body = await readJson(req).catch(() => null);
	if (!body) return error(res, 400, 'validation_error', 'request body required');

	const parsed = createSchema.safeParse(body);
	if (!parsed.success)
		return error(res, 400, 'validation_error', parsed.error.issues[0]?.message || 'invalid input');

	const { skill_name, rule_type, threshold, price_amount, currency_mint, chain, start_at, end_at, priority } = parsed.data;

	const [rule] = await sql`
		INSERT INTO skill_pricing_rules
			(agent_id, skill_name, rule_type, threshold, price_amount, currency_mint, chain, start_at, end_at, priority)
		VALUES
			(${agentId}, ${skill_name}, ${rule_type}, ${threshold ?? null}, ${price_amount},
			 ${currency_mint}, ${chain}, ${start_at ?? null}, ${end_at ?? null}, ${priority})
		RETURNING id, skill_name, rule_type, threshold, price_amount, currency_mint, chain, start_at, end_at, priority, is_active, created_at
	`;

	return json(res, 201, { data: { rule } });
}

async function handlePatch(req, res, agentId, ruleId) {
	if (!method(req, res, ['PATCH'])) return;
	if (!isUuid(ruleId)) return error(res, 400, 'validation_error', 'invalid rule id');

	const user = await ownerCheck(req, res, agentId);
	if (!user) return;
	if (!(await requireCsrf(req, res, user.id))) return;

	const body = await readJson(req).catch(() => null);
	const parsed = patchSchema.safeParse(body || {});
	if (!parsed.success)
		return error(res, 400, 'validation_error', parsed.error.issues[0]?.message || 'invalid input');

	const { threshold, price_amount, start_at, end_at, priority, is_active } = parsed.data;

	const [existing] = await sql`
		SELECT id FROM skill_pricing_rules WHERE id = ${ruleId} AND agent_id = ${agentId}
	`;
	if (!existing) return error(res, 404, 'not_found', 'rule not found');

	await sql`
		UPDATE skill_pricing_rules SET
			threshold    = COALESCE(${threshold ?? null}, threshold),
			price_amount = COALESCE(${price_amount ?? null}, price_amount),
			start_at     = COALESCE(${start_at !== undefined ? start_at : undefined}, start_at),
			end_at       = COALESCE(${end_at !== undefined ? end_at : undefined}, end_at),
			priority     = COALESCE(${priority ?? null}, priority),
			is_active    = COALESCE(${is_active ?? null}, is_active),
			updated_at   = now()
		WHERE id = ${ruleId} AND agent_id = ${agentId}
	`;

	return json(res, 200, { data: { ok: true } });
}

async function handleDelete(req, res, agentId, ruleId) {
	if (!method(req, res, ['DELETE'])) return;
	if (!isUuid(ruleId)) return error(res, 400, 'validation_error', 'invalid rule id');

	const user = await ownerCheck(req, res, agentId);
	if (!user) return;
	if (!(await requireCsrf(req, res, user.id))) return;

	await sql`
		UPDATE skill_pricing_rules SET is_active = false, updated_at = now()
		WHERE id = ${ruleId} AND agent_id = ${agentId}
	`;

	return json(res, 200, { data: { ok: true } });
}
