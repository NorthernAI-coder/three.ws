// Service-catalog descriptor — the single written-once listing for this
// service. api/wk.js derives its /.well-known/x402.json resource entry from
// this file via api/_lib/service-catalog/index.js (toBazaarDiscovery), and
// the OKX storefront projection reads the same record (toOkxCatalog).
// Contract: specs/service-catalog.md. Do not re-add a hand-written mirror
// for this route in api/wk.js — edit this descriptor instead.

export default {
	slug: 'forge',
	title: 'Forge: text/image to 3D',
	category: '3d',
	useCase: 'three.ws Forge — pay-per-call text→3D and image→3D generation for autonomous agents.',
	path: '/api/x402/forge',
	method: 'POST',
	free: false,
	status: 'live',
	priceAtomics: '150000',
	acceptsBuilder: 'standard',
	serviceName: 'three.ws Forge: text/image to 3D',
	tags: ['3d', 'ai', 'text-to-3d', 'image-to-3d', 'utility'],
	description: 'three.ws Forge — pay-per-call text→3D and image→3D generation for autonomous agents. Turn a text prompt (or up to four reference photos of one object) into a production-ready GLB mesh for game assets, NFT collections, 3D scenes, and product visualization — the only real 3D generation on any agent marketplace. Three quality tiers in USDC: draft $0.05 (fast low-poly blockout), standard $0.15 (balanced detail, the default), high $0.50 (maximum geometry + PBR textures). Pay autonomously in USDC on Solana mainnet — no API key, no account, no signup. Returns a job token you poll for FREE at GET /api/forge?job=<id>; draft prompts often finish inline and hand back the GLB url with status:"done". New here? Start on the free keyless draft lane at POST /api/3d/generate, then upgrade to a paid tier for standard/high quality or image→3D.',
	input: {
		prompt: 'a brass steampunk owl, full body',
		tier: 'standard',
		aspect_ratio: '1:1',
	},
	inputSchema: {
		$schema: 'https://json-schema.org/draft/2020-12/schema',
		type: 'object',
		description: 'Provide exactly one of prompt (text→3D) or image_urls (image→3D). tier and aspect_ratio are optional; tier defaults to "standard".',
		properties: {
			prompt: {
				type: 'string',
				minLength: 3,
				maxLength: 1000,
				description: 'Describe one subject for text→3D. Omit when supplying image_urls.',
			},
			image_urls: {
				type: 'array',
				items: {
					type: 'string',
					format: 'uri',
				},
				minItems: 1,
				maxItems: 4,
				description: 'Up to four public https reference views of one object for image→3D. Omit when supplying a prompt.',
			},
			tier: {
				type: 'string',
				enum: ['draft', 'standard', 'high'],
				default: 'standard',
				description: 'Quality/price tier: draft $0.05 (low-poly), standard $0.15 (default), high $0.50 (PBR textures). The 402 quotes the price for the requested tier.',
			},
			aspect_ratio: {
				type: 'string',
				enum: ['1:1', '4:3', '3:4', '16:9', '9:16'],
				default: '1:1',
				description: 'Aspect ratio of the synthesized reference view for text→3D.',
			},
		},
	},
	storefronts: ['x402scan'],
};
