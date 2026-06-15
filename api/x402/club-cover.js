// GET /api/x402/club-cover
//
// Paid endpoint cataloged by the CDP x402 Bazaar — the cover charge at the
// door of the three.ws Pole Club. For $0.01 USDC the caller pays their way in.
// Once the payment settles, the bouncer runs an on-chain check: the payer's
// wallet is looked up against the club ban list (club_bans) and their prior
// club activity (club_tips) is read to assign a door tier (newcomer / regular
// / vip). A banned wallet is turned away (admitted=false); everyone else gets
// an entry pass the /club door consumes to drop the velvet rope.
//
// The wallet identity is proven on-chain by the x402 settlement itself — you
// can only get an `admitted` response by signing a real USDC payment from the
// wallet being vetted. No tip, no entry.

import { paidEndpoint } from '../_lib/x402-paid-endpoint.js';
import { buildBazaarSchema } from '../_lib/x402-spec.js';
import { installAccessControl } from '../_lib/x402/access-control.js';
import { withService } from '../_lib/x402/bazaar-helpers.js';
import { priceFor } from '../_lib/x402-prices.js';
import { issueCoverPass, PASS_TTL_SEC } from '../_lib/club/cover-pass.js';

const ROUTE = '/api/x402/club-cover';

// PASS_TTL_SEC + the bouncer (ban/tier/pass) live in ../_lib/club/cover-pass.js
// so the USDC door here and the $THREE door (api/club/cover-three.js) issue an
// identical pass.

const DESCRIPTION =
	'three.ws Pole Club — pay the cover charge to get past the door. Pay ' +
	'$0.01 USDC and the bouncer checks the paying wallet on-chain against the ' +
	'club ban list and its prior club activity, then issues an entry pass with ' +
	'a door tier (newcomer / regular / vip). Banned wallets are turned away. ' +
	'The /club page consumes the pass to drop the velvet rope. Pay-per-call in ' +
	'USDC on Base or Solana mainnet.';

const INPUT_EXAMPLE = {};

const INPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	properties: {},
};

const OUTPUT_EXAMPLE = {
	ok: true,
	admitted: true,
	banned: false,
	tier: 'regular',
	visits: 4,
	passId: 'a3f3d6c2-1f1b-4f10-9b6c-1b1f5e0c9c34',
	issuedAt: '2026-06-15T18:42:09.000Z',
	expiresAt: '2026-06-16T00:42:09.000Z',
	payer: 'wwwPqsM4N7T9J69tB82nLyzxqsH159j4orftLTQfUGV',
	network: 'solana',
	amountAtomics: '10000',
	asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

const OUTPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	required: ['ok', 'admitted', 'banned', 'tier', 'passId', 'issuedAt', 'expiresAt'],
	properties: {
		ok: { type: 'boolean', const: true },
		admitted: { type: 'boolean', description: 'true when the wallet may enter; false when banned.' },
		banned: { type: 'boolean' },
		reason: { type: ['string', 'null'], description: 'Bouncer note when turned away.' },
		tier: {
			type: 'string',
			enum: ['newcomer', 'regular', 'vip', 'banned'],
			description: 'Door tier from prior on-chain club activity.',
		},
		visits: { type: 'integer', minimum: 0, description: 'Settled club tips previously paid by this wallet.' },
		passId: { type: 'string', format: 'uuid' },
		issuedAt: { type: 'string', format: 'date-time' },
		expiresAt: { type: 'string', format: 'date-time' },
		payer: { type: ['string', 'null'] },
		network: { type: ['string', 'null'] },
		amountAtomics: { type: ['string', 'null'] },
		asset: { type: ['string', 'null'] },
	},
};

const BAZAAR = {
	discoverable: true,
	info: {
		input: { type: 'http', method: 'GET', queryParams: INPUT_EXAMPLE },
		output: { type: 'json', example: OUTPUT_EXAMPLE },
	},
	schema: buildBazaarSchema({
		method: 'GET',
		queryParamsSchema: INPUT_SCHEMA,
		outputSchema: OUTPUT_SCHEMA,
	}),
};

// Normalize a wallet for ban/activity lookups. Lowercased so a Base 0x address
// matches regardless of EIP-55 checksum casing; base58 Solana addresses are
// case-sensitive but never collide across the lowercase fold in practice.
function normalizeWallet(w) {
	return String(w || '').trim().toLowerCase();
}

/**
 * Look the payer's wallet up against the ban list. Fails OPEN: a missing
 * table or a transient DB error must not lock the whole club out, so any
 * error resolves to "not banned". Returns the matching row or null.
 */
async function findBan(wallet) {
	if (!wallet) return null;
	try {
		const rows = await sql`select wallet, reason from club_bans where wallet = ${wallet} limit 1`;
		return rows?.[0] ?? null;
	} catch (err) {
		console.warn('[club-cover] ban lookup failed (fail-open)', err?.message || err);
		return null;
	}
}

/**
 * Count this wallet's prior settled club tips to assign a door tier. Pure
 * read of the existing club_tips ledger — the same on-chain-settled payments
 * that drive the live feed. Fails soft to 0 visits / newcomer.
 */
async function visitsFor(wallet) {
	if (!wallet) return 0;
	try {
		const rows = await sql`select count(*)::int as n from club_tips where lower(payer) = ${wallet}`;
		return rows?.[0]?.n ?? 0;
	} catch (err) {
		console.warn('[club-cover] visit count failed (soft 0)', err?.message || err);
		return 0;
	}
}

function tierFor(visits) {
	if (visits >= 10) return 'vip';
	if (visits >= 1) return 'regular';
	return 'newcomer';
}

export const BAZAAR_SCHEMA = BAZAAR;

export default paidEndpoint({
	route: ROUTE,
	method: 'GET',
	priceAtomics: priceFor('club-cover', '10000'), // $0.01 USDC
	networks: ['base', 'solana'],
	description: DESCRIPTION,
	bazaar: BAZAAR,
	service: withService({
		serviceName: 'three.ws Club Door',
		tags: ['3d', 'club', 'cover', 'entry', 'reputation', 'entertainment'],
	}),
	requiredScope: 'x402:bypass',
	accessControl: installAccessControl({ requiredScope: 'x402:bypass' }),
	siwx: {
		statement: 'Sign in to re-enter the club you already paid cover for tonight.',
		// Once a wallet has paid cover, it can re-enter for free for the pass
		// lifetime — the bouncer still re-runs the ban check on every call, so a
		// wallet banned after paying is turned away on its next re-entry.
		ttlSeconds: PASS_TTL_SEC,
		expirationSeconds: 300,
	},
	async handler({ requirement, payer, bypass }) {
		const wallet = normalizeWallet(payer ?? bypass?.callerId ?? '');
		const now = new Date();

		const ban = await findBan(wallet);
		if (ban) {
			// Turned away at the door. The cover already settled on-chain — you
			// don't get a refund for being on the list — but no pass is issued.
			return {
				ok: true,
				admitted: false,
				banned: true,
				reason: ban.reason || 'Not on the list tonight.',
				tier: 'banned',
				visits: 0,
				passId: crypto.randomUUID(),
				issuedAt: now.toISOString(),
				expiresAt: now.toISOString(),
				payer: payer ?? (bypass ? bypass.callerId : null),
				network: requirement?.network ?? null,
				amountAtomics: requirement?.amount ?? null,
				asset: requirement?.asset ?? null,
			};
		}

		const visits = await visitsFor(wallet);
		const expires = new Date(now.getTime() + PASS_TTL_SEC * 1000);

		return {
			ok: true,
			admitted: true,
			banned: false,
			reason: null,
			tier: tierFor(visits),
			visits,
			passId: crypto.randomUUID(),
			issuedAt: now.toISOString(),
			expiresAt: expires.toISOString(),
			payer: payer ?? (bypass ? bypass.callerId : null),
			network: requirement?.network ?? null,
			amountAtomics: requirement?.amount ?? null,
			asset: requirement?.asset ?? null,
			...(bypass ? { bypass: bypass.reason } : {}),
		};
	},
});
