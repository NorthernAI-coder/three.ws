import { getSessionUser, authenticateBearer, extractBearer } from '../../_lib/auth.js';
import { cors, json, method, readJson, wrap, error, respondError } from '../../_lib/http.js';
import { requireCsrf } from '../../_lib/csrf.js';
import { MonetizationService } from '../../_lib/services/MonetizationService.js';
import { z } from 'zod';

const priceSchema = z
	.object({
		skill: z.string().trim().min(1).max(100),
		amount: z.number().int().min(1),
		currency_mint: z.string().trim().min(1).max(100),
		chain: z.string().trim().min(1).max(20),
		trial_uses: z.number().int().min(0).max(10).default(0),
		time_pass_hours: z.number().int().min(1).max(720).nullable().optional(),
		time_pass_amount: z.number().int().min(1).nullable().optional(),
		// Pay-what-you-want: 'fixed' (default) bills `amount`; 'pwyw' lets the buyer
		// name an amount at or above `minimum_amount` (atomic units, 0 = no floor).
		pricing_type: z.enum(['fixed', 'pwyw']).default('fixed'),
		minimum_amount: z.number().int().min(0).nullable().optional(),
	})
	.refine((p) => p.pricing_type !== 'pwyw' || (p.minimum_amount ?? 0) <= p.amount, {
		message: 'minimum cannot exceed the suggested amount',
		path: ['minimum_amount'],
	});

const pricingUpdateSchema = z.object({
	prices: z.array(priceSchema),
});

export default wrap(async (req, res) => {
	const url = new URL(req.url, 'http://x');
	const parts = url.pathname.split('/').filter(Boolean);
	const id = parts[2];

	if (cors(req, res, { methods: 'GET,PUT,OPTIONS', credentials: true })) return;

	const auth = await resolveAuth(req);
	if (!auth) return error(res, 401, 'unauthorized', 'sign in required');

	// CSRF on state-changing session-cookie requests; bearer tokens are exempt.
	if (req.method === 'PUT' && !(await requireCsrf(req, res, auth.userId))) return;

	const service = new MonetizationService(auth);

	// Ownership gates both reads and writes on this owner-only surface.
	try {
		await service.assertOwnership(id);
	} catch (e) {
		console.error('[agents/skills-pricing] ownership check failed', e?.message);
		return respondError(res, e.status || 500, e.code || 'error', e);
	}

	if (req.method === 'GET') return handleGet(req, res, service, id);
	if (req.method === 'PUT') return handlePut(req, res, service, id);

	return method(req, res, ['GET', 'PUT']);
});

async function handleGet(req, res, service, agentId) {
	const prices = await service.getSkillPricesForAgent(agentId);
	return json(res, 200, { prices });
}

async function handlePut(req, res, service, agentId) {
	const body = await readJson(req);
	const parsed = pricingUpdateSchema.safeParse(body);
	if (!parsed.success) {
		const msg = parsed.error.issues[0]?.message || 'validation error';
		return error(res, 400, 'validation_error', msg);
	}

	// Ownership already asserted above — the service performs the atomic
	// deactivate-then-upsert and invalidates the price cache.
	await service.setSkillPrices(agentId, parsed.data.prices, { skipOwnershipCheck: true });

	return json(res, 200, { ok: true });
}

async function resolveAuth(req) {
	const session = await getSessionUser(req);
	if (session) return { userId: session.id };
	const bearer = await authenticateBearer(extractBearer(req));
	if (bearer) return { userId: bearer.userId };
	return null;
}
