// Consolidated x402 payment endpoints (invoke + manifest).

import { z } from 'zod';
import { sql } from '../../_lib/db.js';
import { getSessionUser, authenticateBearer, extractBearer } from '../../_lib/auth.js';
import { cors, json, method, readJson, wrap, error, rateLimited } from '../../_lib/http.js';
import { limits, clientIp } from '../../_lib/rate-limit.js';
import { parse, isUuid } from '../../_lib/validate.js';
import { emit402, verifyPaid, consumeIntent, manifestOnly } from '../../_lib/x402.js';
import { calculateFee } from '../../_lib/fee.js';
import { insertNotification } from '../../_lib/notify.js';

const HANDLERS = { echo: async (args) => ({ ok: true, echoed: args }) };

// C1 — x402 bridge: prices come from the canonical agent_skill_prices table
// first (the marketplace's source of truth), with the legacy meta.skill_prices
// jsonb as a fallback for agents priced before the marketplace migration.
// Returns null when the skill has no canonical price — callers must respond
// with 409 no_payments rather than synthesize a price.
async function priceFor(agent, skill) {
	const [row] = await sql`
		SELECT amount, currency_mint, chain
		FROM agent_skill_prices
		WHERE agent_id = ${agent.id} AND skill = ${skill} AND is_active = true
	`;
	if (row) return { amount: String(row.amount), currency: row.currency_mint, chain: row.chain };

	const prices = agent.meta?.skill_prices || {};
	const fromMap = prices[skill];
	if (fromMap?.amount && fromMap?.currency) return fromMap;
	const defaultPrice = agent.meta?.payments?.default_price;
	if (defaultPrice?.amount && defaultPrice?.currency) return defaultPrice;
	return null;
}

async function resolveAuth(req) {
	const session = await getSessionUser(req);
	if (session) return { userId: session.id };
	const bearer = await authenticateBearer(extractBearer(req));
	if (bearer) return { userId: bearer.userId, scope: bearer.scope };
	return null;
}

// ── invoke ────────────────────────────────────────────────────────────────────

const invokeSchema = z.object({
	agent_id: z.string().min(1).max(80),
	skill: z.string().min(1).max(64),
	args: z.record(z.any()).default({}),
});

async function handleInvoke(req, res) {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;

	const auth = await resolveAuth(req);
	if (!auth) return error(res, 401, 'unauthorized', 'sign in or provide a bearer token');

	const rl = await limits.authIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const body = parse(invokeSchema, await readJson(req));
	if (!isUuid(body.agent_id)) return error(res, 404, 'not_found', 'agent not found');
	const [agent] =
		await sql`select id, user_id, name, meta, skills from agent_identities where id = ${body.agent_id} and deleted_at is null limit 1`;
	if (!agent) return error(res, 404, 'not_found', 'agent not found');

	// Determine if the skill is callable: registered server handler OR a skill
	// declared on the agent's skills[] (delegated to skill-runtime). Hard-fail
	// only when the agent has no record of this skill at all.
	const handlerExists = !!HANDLERS[body.skill];
	const skillDeclared = Array.isArray(agent.skills) && agent.skills.includes(body.skill);
	if (!handlerExists && !skillDeclared) {
		return error(
			res,
			404,
			'unknown_skill',
			`skill "${body.skill}" is not registered on this agent`,
		);
	}

	const price = await priceFor(agent, body.skill);
	if (!price) {
		return error(res, 409, 'no_payments', `skill "${body.skill}" is not priced on this agent`);
	}
	const paid = await verifyPaid(req, {
		agentId: agent.id,
		skill: body.skill,
		expectedAmount: price.amount,
		expectedCurrency: price.currency,
	});
	if (!paid)
		return emit402(res, {
			agent,
			skill: body.skill,
			amount: price.amount,
			currency: price.currency,
		});

	// $THREE holder gate — agents can require callers to hold a minimum $THREE
	// balance. Checked after payment to use the verified payerAddress; the intent
	// is NOT consumed on gate failure so the caller can acquire $THREE and retry.
	const gate = agent.meta?.three_gate;
	if (gate?.enabled && paid.payerAddress) {
		const minBalance = parseInt(gate.min_balance ?? 1, 10) || 1;
		try {
			const { checkThreeBalance } = await import('../../_lib/three-gate.js');
			const gateResult = await checkThreeBalance(paid.payerAddress, minBalance);
			if (!gateResult.eligible) {
				return error(res, 402, 'insufficient_three_balance',
					'This agent requires a minimum $THREE balance. Acquire $THREE to use this skill.',
					{
						required: minBalance,
						held: gateResult.balance,
						buy_url: 'https://pump.fun/FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump',
					},
				);
			}
		} catch {
			// Gate check failure → fail open so callers aren't blocked by infra.
		}
	}

	// Execute the skill BEFORE consuming the payment intent: if the handler
	// throws, wrap() returns the error with the intent untouched, so the buyer's
	// payment still covers a retry instead of being burned on a failed call.
	let result;
	if (handlerExists) {
		result = await HANDLERS[body.skill](body.args, { agent, caller: auth });
	} else {
		// Delegate to the in-process skill-runtime. The skill name on the agent
		// is treated as a "<skill>.<tool>" qualifier; if the caller passed bare
		// args (no tool), default to the skill name as the tool too — runtime
		// will surface a descriptive error if there's no matching export.
		const { makeRuntime } = await import('../../_lib/skill-runtime.js');
		const runtime = makeRuntime({
			agentId: agent.id,
			signerAddress: paid.payerAddress || null,
		});
		const tool = typeof body.args?._tool === 'string' ? body.args._tool : body.skill;
		result = await runtime.invoke(`${body.skill}.${tool}`, body.args);
	}

	await consumeIntent(paid.intentId);
	const gross = parseInt(paid.amount, 10);
	const { fee, net } = calculateFee(gross);
	await sql`
		insert into agent_revenue_events
			(agent_id, intent_id, skill, gross_amount, fee_amount, net_amount, currency_mint, chain, payer_address)
		values
			(${agent.id}, ${paid.intentId}, ${body.skill}, ${gross}, ${fee}, ${net}, ${paid.currency}, ${price.chain ?? 'solana'}, ${paid.payerAddress})
	`;
	insertNotification(agent.user_id, 'payment_received', {
		agent_id: agent.id,
		agent_name: agent.name,
		skill: body.skill,
		net_amount: net,
		currency_mint: paid.currency,
	});
	return json(res, 200, {
		ok: true,
		intent_id: paid.intentId,
		amount: paid.amount,
		currency: paid.currency,
		result,
	});
}

// ── manifest ──────────────────────────────────────────────────────────────────

async function handleManifest(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const url = new URL(req.url, 'http://x');
	const agent_id = url.searchParams.get('agent_id');
	const skill = url.searchParams.get('skill');
	if (!agent_id || !skill)
		return error(res, 400, 'validation_error', 'agent_id and skill required');
	if (!isUuid(agent_id)) return error(res, 404, 'not_found', 'agent not found');

	const [agent] =
		await sql`select id, name, meta from agent_identities where id = ${agent_id} and deleted_at is null limit 1`;
	if (!agent) return error(res, 404, 'not_found', 'agent not found');

	// Manifest is callable as long as the skill is priced — either in the
	// canonical agent_skill_prices table or the legacy meta.skill_prices map.
	const [hasMarketplacePrice] = await sql`
		SELECT 1 FROM agent_skill_prices WHERE agent_id = ${agent.id} AND skill = ${skill} AND is_active = true
	`;
	const hasMetaPrice = !!(
		agent.meta?.skill_prices?.[skill] || agent.meta?.payments?.default_price
	);
	if (!hasMarketplacePrice && !hasMetaPrice) {
		return error(res, 409, 'no_payments', 'this skill is not priced');
	}

	const price = await priceFor(agent, skill);
	if (!price) {
		// Defensive — the no-payments precheck above should have caught this.
		return error(res, 409, 'no_payments', 'this skill is not priced');
	}
	return manifestOnly(res, { agent, skill, amount: price.amount, currency: price.currency });
}

// ── dispatcher ────────────────────────────────────────────────────────────────

const DISPATCH = { invoke: handleInvoke, manifest: handleManifest };

export default wrap(async (req, res) => {
	const action = req.query?.action ?? new URL(req.url, 'http://x').pathname.split('/').pop();
	const fn = DISPATCH[action];
	if (!fn) return error(res, 404, 'not_found', `unknown x402 action: ${action}`);
	return fn(req, res);
});
