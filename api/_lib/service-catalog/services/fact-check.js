// Service-catalog descriptor — the single written-once listing for this
// service. api/wk.js derives its /.well-known/x402.json resource entry from
// this file via api/_lib/service-catalog/index.js (toBazaarDiscovery), and
// the OKX storefront projection reads the same record (toOkxCatalog).
// Contract: specs/service-catalog.md. Do not re-add a hand-written mirror
// for this route in api/wk.js — edit this descriptor instead.
//
// Re-listed per the 2026-07-08 storefront cleanup (prompt 18) — see
// api/x402/fact-check.js for the header note superseding the prior
// "internal-use only" de-listing.

export default {
	slug: 'fact-check',
	title: 'Real-Time Fact Checker',
	category: 'trust',
	useCase: 'Real-Time Fact Checker — submit a claim and receive a sourced verdict (supported/contradicted/mixed/insufficient) backed by live web search and LLM analysis, with cited sources and a SHA-256 attestation you can audit.',
	path: '/api/x402/fact-check',
	method: 'POST',
	free: false,
	status: 'live',
	priceAtomics: '100000',
	acceptsBuilder: 'standard',
	serviceName: 'three.ws Fact Checker',
	tags: ['fact-check', 'search', 'verification'],
	description: 'Real-Time Fact Checker — submit a claim and receive a sourced verdict (supported/contradicted/mixed/insufficient) backed by live web search and LLM analysis, with cited sources and a SHA-256 attestation you can audit. Each result includes source authority weights, a confidence score, and a cost breakdown. Strictness controls how aggressively low-authority sources are downweighted. Price: $0.10 base per check on Base or Solana USDC.',
	input: {
		claim: 'The Eiffel Tower is 330 meters tall.',
		strictness: 'high',
	},
	inputSchema: {
		type: 'object',
		required: ['claim'],
		properties: {
			claim: {
				type: 'string',
				minLength: 5,
				maxLength: 1000,
			},
			strictness: {
				type: 'string',
				enum: ['high', 'medium', 'low'],
			},
			imageUrl: {
				type: 'string',
				format: 'uri',
				maxLength: 2048,
			},
		},
	},
	storefronts: ['x402scan'],
};
