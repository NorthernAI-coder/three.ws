// Service-catalog descriptor — the single written-once listing for this
// service. api/wk.js derives its /.well-known/x402.json resource entry from
// this file via api/_lib/service-catalog/index.js (toBazaarDiscovery), and
// the OKX storefront projection reads the same record (toOkxCatalog).
// Contract: specs/service-catalog.md. Do not re-add a hand-written mirror
// for this route in api/wk.js — edit this descriptor instead.
//
// Re-listed per the 2026-07-08 storefront cleanup (prompt 18) — batch sibling
// of mint-to-mesh, same disposition.

export default {
	slug: 'mint-to-mesh-batch',
	title: 'Mint to Mesh (Batch)',
	category: '3d',
	useCase: 'Mint to Mesh (Batch) — resolve 1–10 Solana SPL mints to themed glTF (GLB) cubes in a single paid call instead of paying for N round-trips.',
	path: '/api/x402/mint-to-mesh-batch',
	method: 'POST',
	free: false,
	status: 'live',
	priceAtomics: '50000',
	acceptsBuilder: 'standard',
	serviceName: 'three.ws Mint Mesh Batch',
	tags: ['3d', 'gltf', 'solana', 'batch', 'render'],
	description: 'Mint to Mesh (Batch) — resolve 1–10 Solana SPL mints to themed glTF (GLB) cubes in a single paid call instead of paying for N round-trips. Each mint is processed in parallel; per-mint failures (bad mint, RPC unreachable, off-chain metadata 404) report ok:false individually rather than failing the whole batch. Output is base64 JSON-safe GLB bytes ready for Three.js / Babylon.js / model-viewer. Useful for rendering a portfolio carousel or leaderboard of token-themed objects in one call.',
	input: {
		mints: [
			'C3vQABCDEFGHJKLMNopqrstuvwxyZ12345abcdefghi',
			'F7kXZYXWVUTSRQPONMLKJIHGFEDCba9876543210xyz',
		],
	},
	inputSchema: {
		type: 'object',
		required: ['mints'],
		properties: {
			mints: {
				type: 'array',
				minItems: 1,
				maxItems: 10,
				items: { type: 'string', minLength: 32, maxLength: 44 },
			},
		},
	},
	storefronts: ['x402scan'],
};
