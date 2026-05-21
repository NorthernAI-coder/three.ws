// GET /api/x402/dance-tip?dancer=<id>&dance=<style>
//
// Paid endpoint cataloged by the CDP x402 Bazaar. For $0.001 USDC the caller
// books one dance performance on the three.ws Pole Club stage. The /club page
// uses this from the browser via window.X402.pay — when the payment settles,
// the named dancer steps onto the pole and performs the requested style for a
// fixed duration. Agents can also call it programmatically with @x402/fetch
// to drive scripted performances.

import { paidEndpoint } from '../_lib/x402-paid-endpoint.js';
import { buildBazaarSchema } from '../_lib/x402-spec.js';

const ROUTE = '/api/x402/dance-tip';

const DESCRIPTION =
	'three.ws Pole Club — tip a dancer to perform one routine on the 3D pole ' +
	'stage. Pay $0.001 USDC per performance. Pick a dancer slot (1-4) and a ' +
	'dance style (rumba, silly, thriller, capoeira, hiphop). The settled call ' +
	'returns a performance ticket the /club page consumes to spawn the dancer ' +
	'and play the routine for ~12 seconds.';

const STYLES = Object.freeze({
	hiphop:   { clip: 'dance',    label: 'Hip Hop', loop: true,  durationSec: 12 },
	rumba:    { clip: 'rumba',    label: 'Rumba',   loop: true,  durationSec: 14 },
	silly:    { clip: 'silly',    label: 'Silly',   loop: true,  durationSec: 10 },
	thriller: { clip: 'thriller', label: 'Thriller',loop: true,  durationSec: 14 },
	capoeira: { clip: 'capoeira', label: 'Capoeira',loop: true,  durationSec: 12 },
});

const VALID_DANCERS = new Set(['1', '2', '3', '4']);

const INPUT_EXAMPLE = { dancer: '1', dance: 'rumba' };

const INPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	required: ['dancer', 'dance'],
	properties: {
		dancer: {
			type: 'string',
			enum: ['1', '2', '3', '4'],
			description: 'Stage slot 1-4 — which dancer should take the pole.',
		},
		dance: {
			type: 'string',
			enum: Object.keys(STYLES),
			description: 'Performance style. Matches a clip in /animations/manifest.json.',
		},
	},
};

const OUTPUT_EXAMPLE = {
	ok: true,
	ticketId: 'a3f3d6c2-1f1b-4f10-9b6c-1b1f5e0c9c34',
	dancer: '1',
	dance: 'rumba',
	clip: 'rumba',
	label: 'Rumba',
	loop: true,
	durationSec: 14,
	startsAt: '2026-05-21T18:42:09.000Z',
	endsAt: '2026-05-21T18:42:23.000Z',
	payer: 'wwwPqsM4N7T9J69tB82nLyzxqsH159j4orftLTQfUGV',
	network: 'solana',
	amountAtomics: '1000',
	asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

const OUTPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	required: ['ok', 'ticketId', 'dancer', 'dance', 'clip', 'durationSec', 'startsAt', 'endsAt'],
	properties: {
		ok: { type: 'boolean', const: true },
		ticketId: { type: 'string', format: 'uuid' },
		dancer: { type: 'string', enum: ['1', '2', '3', '4'] },
		dance: { type: 'string', enum: Object.keys(STYLES) },
		clip: { type: 'string' },
		label: { type: 'string' },
		loop: { type: 'boolean' },
		durationSec: { type: 'integer', minimum: 1, maximum: 60 },
		startsAt: { type: 'string', format: 'date-time' },
		endsAt:   { type: 'string', format: 'date-time' },
		payer:    { type: ['string', 'null'] },
		network:  { type: ['string', 'null'] },
		amountAtomics: { type: ['string', 'null'] },
		asset:    { type: ['string', 'null'] },
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

function pickStyle(name) {
	const key = String(name || '').trim().toLowerCase();
	if (STYLES[key]) return { key, ...STYLES[key] };
	const err = new Error(
		`unknown dance "${name}". Pick one of: ${Object.keys(STYLES).join(', ')}.`,
	);
	err.status = 400;
	err.code = 'unknown_dance';
	throw err;
}

function pickDancer(raw) {
	const id = String(raw ?? '').trim();
	if (VALID_DANCERS.has(id)) return id;
	const err = new Error(`dancer must be one of 1, 2, 3, 4 — got "${raw}"`);
	err.status = 400;
	err.code = 'unknown_dancer';
	throw err;
}

export default paidEndpoint({
	route: ROUTE,
	method: 'GET',
	priceAtomics: '1000',
	networks: ['base', 'solana'],
	description: DESCRIPTION,
	bazaar: BAZAAR,
	async handler({ req, requirement, payer }) {
		const dancer = pickDancer(req.query?.dancer);
		const style = pickStyle(req.query?.dance);

		const now = new Date();
		const ends = new Date(now.getTime() + style.durationSec * 1000);

		return {
			ok: true,
			ticketId: crypto.randomUUID(),
			dancer,
			dance: style.key,
			clip: style.clip,
			label: style.label,
			loop: style.loop,
			durationSec: style.durationSec,
			startsAt: now.toISOString(),
			endsAt:   ends.toISOString(),
			payer:    payer ?? null,
			network:  requirement?.network ?? null,
			amountAtomics: requirement?.amount ?? null,
			asset:    requirement?.asset ?? null,
		};
	},
});
