// POST /api/x402/pipeline-stylize   { glb_url, style?, resolution? }
//
// 3D Asset Pipeline — Stylize stage. Pay $0.03 USDC and get back a geometrically
// restyled GLB: voxel, brick, Voronoi-shatter, or faceted low-poly filters that
// rebuild the mesh itself (not a shader), so the style survives export to any
// engine. Input: a public GLB URL + a style. Output: a durable first-party GLB
// URL. One payment, one stylized mesh.
//
// Runs the same workers/stylize Cloud Run service the free /api/forge-stylize
// endpoint drives — its synchronous, pay-per-call twin: submit → poll → validate
// → persist → return the URL. Any worker/env/validation failure throws BEFORE
// settlement, so a buyer is never charged for a stage that didn't produce a valid
// GLB.

import { paidEndpoint } from '../_lib/x402-paid-endpoint.js';
import { buildBazaarSchema } from '../_lib/x402-spec.js';
import { withService } from '../_lib/x402/bazaar-helpers.js';
import { installAccessControl } from '../_lib/x402/access-control.js';
import { priceFor } from '../_lib/x402-prices.js';
import {
	readJsonBody,
	validateAssetUrl,
	sniffRemoteAsset,
	runStageJob,
	persistStageOutput,
	stageObjectKey,
} from '../_lib/pipeline-stage.js';

const ROUTE = '/api/x402/pipeline-stylize';
const SLUG = 'pipeline-stylize';

// Density bounds per filter — kept in lockstep with workers/stylize STYLE_CATALOG
// and api/forge-stylize.js.
const STYLE_BOUNDS = {
	voxel: { def: 32, min: 8, max: 96 },
	brick: { def: 24, min: 8, max: 64 },
	voronoi: { def: 48, min: 12, max: 120 },
	lowpoly: { def: 40, min: 8, max: 120 },
};

const DESCRIPTION =
	'3D Asset Pipeline — Stylize: pay $0.03 USDC to geometrically restyle a GLB. ' +
	'Voxel, brick, Voronoi-shatter, or faceted low-poly filters that rebuild the ' +
	'mesh itself (not a shader), so the look survives export to any engine. POST a ' +
	'public glb_url + style; get back a durable first-party GLB URL. Pay ' +
	'autonomously in USDC on Solana mainnet.';

export const INPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	required: ['glb_url'],
	properties: {
		glb_url: {
			type: 'string',
			format: 'uri',
			description: 'Public HTTPS URL of the source binary glTF (.glb) mesh.',
		},
		style: {
			type: 'string',
			enum: Object.keys(STYLE_BOUNDS),
			default: 'voxel',
			description: 'Geometric filter to apply — voxel, brick, voronoi, or lowpoly.',
		},
		resolution: {
			type: 'integer',
			description: 'Style density (clamped to each filter\'s range). Higher = finer detail.',
		},
	},
};

export const OUTPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	required: ['stage', 'input_url', 'output_url'],
	properties: {
		stage: { type: 'string', const: 'stylize' },
		input_url: { type: 'string', format: 'uri' },
		output_url: { type: 'string', format: 'uri', description: 'The restyled GLB.' },
		bytes: { type: ['integer', 'null'] },
		persisted: { type: 'boolean' },
		style: { type: 'string' },
		resolution: { type: 'integer' },
		face_count: { type: ['integer', 'null'] },
	},
};

export const BAZAAR = {
	discoverable: true,
	info: {
		input: { type: 'http', method: 'POST', bodyType: 'json', body: { glb_url: 'https://three.ws/forge/statue.glb', style: 'voxel', resolution: 48 } },
		output: {
			type: 'json',
			example: {
				stage: 'stylize',
				input_url: 'https://three.ws/forge/statue.glb',
				output_url: 'https://cdn.three.ws/x402-pipeline/stylize/abc123.glb',
				bytes: 512_880,
				persisted: true,
				style: 'voxel',
				resolution: 48,
				face_count: 18_240,
			},
		},
	},
	schema: buildBazaarSchema({
		method: 'POST',
		bodyType: 'json',
		bodySchema: INPUT_SCHEMA,
		outputSchema: OUTPUT_SCHEMA,
	}),
};

export default paidEndpoint({
	route: ROUTE,
	method: 'POST',
	priceAtomics: priceFor(SLUG, '30000'), // $0.03 USDC
	networks: ['solana', 'base'],
	description: DESCRIPTION,
	bazaar: BAZAAR,
	service: withService({
		serviceName: 'three.ws Pipeline - Stylize',
		tags: ['3d', 'stylize', 'voxel', 'glb', 'pipeline'],
	}),
	requiredScope: 'x402:bypass',
	accessControl: installAccessControl({ requiredScope: 'x402:bypass' }),

	async handler({ req }) {
		const body = await readJsonBody(req);
		const glbUrl = await validateAssetUrl(body?.glb_url, 'glb_url');
		await sniffRemoteAsset(glbUrl, 'glb');

		const style = STYLE_BOUNDS[body?.style] ? body.style : 'voxel';
		const bounds = STYLE_BOUNDS[style];
		const requested = Number(body?.resolution);
		const resolution = Number.isFinite(requested)
			? Math.max(bounds.min, Math.min(bounds.max, Math.round(requested)))
			: bounds.def;

		const result = await runStageJob({
			mode: 'stylize',
			sourceUrl: glbUrl,
			params: { style, resolution, output_format: 'glb' },
		});

		const key = await stageObjectKey({ stage: 'stylize', sourceUrl: glbUrl, ext: 'glb' });
		const out = await persistStageOutput({
			resultUrl: result.resultGlbUrl,
			key,
			contentType: 'model/gltf-binary',
			kind: 'glb',
		});

		return {
			stage: 'stylize',
			input_url: glbUrl,
			output_url: out.url,
			bytes: out.bytes,
			persisted: out.persisted,
			style,
			resolution,
			face_count: typeof result.faceCount === 'number' ? result.faceCount : null,
		};
	},
});
