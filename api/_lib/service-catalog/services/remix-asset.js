// Service-catalog descriptor — the single written-once listing for this
// service. api/wk.js derives its /.well-known/x402.json resource entry from
// this file via api/_lib/service-catalog/index.js (toBazaarDiscovery), and
// the OKX storefront projection reads the same record (toOkxCatalog).
// Contract: specs/service-catalog.md. Do not re-add a hand-written mirror
// for this route in api/wk.js — edit this descriptor instead.

export default {
	slug: 'remix-asset',
	title: 'Remix a 3D asset (with creator royalties)',
	category: '3d',
	useCase: 'Remix a published 3D model by describing a change; a creator-set royalty of the fee routes on-chain to the original creator.',
	path: '/api/x402/remix-asset',
	method: 'POST',
	free: false,
	status: 'live',
	priceAtomics: '250000',
	acceptsBuilder: 'standard',
	serviceName: 'Remix a 3D asset (with creator royalties)',
	tags: ['3d', 'remix', 'royalties', 'generation', 'glb'],
	description:
		'Remix a published, remixable 3D model: pay a fixed fee in USDC and describe the change in words ' +
		'("make it metallic", "add wings"). The platform generates a NEW model anchored to the source, records ' +
		'durable parent→child provenance, and routes a creator-set royalty (≤20% of the fee, the remixer always ' +
		'keeps the majority) on-chain to the original creator. Browse remixable assets and their royalty terms for ' +
		'free at GET /api/remix-feed; publish your own finished models there to earn royalties when others build on them.',
	input: {
		source_creation_id: '00000000-0000-0000-0000-000000000000',
		instruction: 'make it metallic',
	},
	inputSchema: {
		type: 'object',
		required: ['source_creation_id', 'instruction'],
		properties: {
			source_creation_id: {
				type: 'string',
				minLength: 1,
				maxLength: 64,
				description: 'The id of a remixable creation (from GET /api/remix-feed).',
			},
			instruction: {
				type: 'string',
				minLength: 1,
				maxLength: 500,
				description: 'The change to make, in plain language: "make it metallic", "bigger helmet", "add a cape".',
			},
		},
	},
	storefronts: ['x402scan'],
};
