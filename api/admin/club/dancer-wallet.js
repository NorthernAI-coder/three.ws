// POST /api/admin/club/dancer-wallet  — upsert a dancer's wallet + metadata.
//
// Admin-gated mutation of club_dancer_wallets. The cron sweep
// (/api/cron/club-payouts) reads these addresses to settle accumulated tips.
// Wallets are mainnet — Base 8453 + Solana mainnet — and are *never* committed
// to source. They flow in via:
//   1. This endpoint (preferred, audited)
//   2. CLUB_DANCER_EVM_<slot> / CLUB_DANCER_SOL_<slot> env vars (bootstrap-only;
//      the sweep cron promotes them into the table on first sight)
//
// Payload (all fields optional except `dancer`):
//   { dancer: '1'..'4', display_name?, bio?, evm_address?, solana_address? }
//
// Passing an empty string clears that field. NULL/undefined leaves it as-is.

import { z } from 'zod';
import { sql } from '../../_lib/db.js';
import { cors, json, method, readJson, wrap, error } from '../../_lib/http.js';
import { requireAdmin } from '../../_lib/admin.js';
import { requireCsrf } from '../../_lib/csrf.js';
import { parse } from '../../_lib/validate.js';

const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/; // base58, Solana pubkey range

const bodySchema = z
	.object({
		dancer:         z.string().min(1).max(64),
		display_name:   z.string().min(1).max(120).optional(),
		bio:            z.string().max(1000).optional(),
		evm_address:    z.string().regex(EVM_RE).or(z.literal('')).optional(),
		solana_address: z.string().regex(SOL_RE).or(z.literal('')).optional(),
	})
	.refine(
		(d) =>
			d.display_name !== undefined ||
			d.bio !== undefined ||
			d.evm_address !== undefined ||
			d.solana_address !== undefined,
		{ message: 'nothing to update' },
	);

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;

	const admin = await requireAdmin(req, res);
	if (!admin) return;
	if (!(await requireCsrf(req, res, admin.id))) return;

	const body = parse(bodySchema, await readJson(req));

	// Empty string → NULL (clear). Anything else → write as-is. Address
	// shape is already validated by zod.
	const normalize = (v) => (v === '' ? null : v);

	const existing = await sql`
		select dancer from club_dancer_wallets where dancer = ${body.dancer}
	`;
	if (existing.length === 0) {
		if (!body.display_name) {
			return error(res, 400, 'validation_error', 'display_name required when creating a new dancer row');
		}
		const [row] = await sql`
			insert into club_dancer_wallets
				(dancer, display_name, bio, evm_address, solana_address)
			values
				(${body.dancer},
				 ${body.display_name},
				 ${normalize(body.bio)},
				 ${normalize(body.evm_address)},
				 ${normalize(body.solana_address)})
			returning dancer, display_name, bio, evm_address, solana_address, created_at, updated_at
		`;
		return json(res, 201, { dancer: row });
	}

	// Partial update via COALESCE — only touch the columns the caller named.
	const [row] = await sql`
		update club_dancer_wallets set
			display_name   = coalesce(${body.display_name ?? null}, display_name),
			bio            = case when ${body.bio !== undefined} then ${normalize(body.bio)} else bio end,
			evm_address    = case when ${body.evm_address !== undefined} then ${normalize(body.evm_address)} else evm_address end,
			solana_address = case when ${body.solana_address !== undefined} then ${normalize(body.solana_address)} else solana_address end,
			updated_at     = now()
		where dancer = ${body.dancer}
		returning dancer, display_name, bio, evm_address, solana_address, created_at, updated_at
	`;
	return json(res, 200, { dancer: row });
});
