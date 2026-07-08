// Service-catalog descriptor — the single written-once listing for this
// service. api/wk.js derives its /.well-known/x402.json resource entry from
// this file via api/_lib/service-catalog/index.js (toBazaarDiscovery), and
// the OKX storefront projection reads the same record (toOkxCatalog).
// Contract: specs/service-catalog.md. Do not re-add a hand-written mirror
// for this route in api/wk.js — edit this descriptor instead.

export default {
	slug: 'embody',
	title: 'Embodiment',
	category: '3d',
	useCase:
		'Give your agent a 3D body — one x402 call returns a rigged, animated, talking avatar plus a one-tag embed for any website. The only embodiment endpoint in the x402 ecosystem.',
	path: '/api/x402/embody',
	method: 'POST',
	free: false,
	status: 'live',
	priceAtomics: '1000000',
	acceptsBuilder: 'standard',
	serviceName: 'three.ws Embodiment',
	tags: ['3d', 'avatar', 'embed', 'agent', 'embodiment'],
	description:
		'Give your agent a 3D body — one x402 call returns a rigged, animated, talking ' +
		'avatar plus a one-tag embed for any website. The only embodiment endpoint in the ' +
		'x402 ecosystem. POST { name, prompt | image_url, personality?, voice? } and get back ' +
		'{ agent_id, glb_url, viewer_url, profile_url, embed_html, voice }. The body is a ' +
		'durable persona that reloads by id in any future session. $1 USDC, no account. ' +
		'Generation failures never settle — you are only charged when a finished body is returned.',
	input: {
		name: 'Nova Scout',
		prompt: 'a friendly explorer in a teal jumpsuit',
		voice: 'nova',
	},
	inputSchema: {
		type: 'object',
		required: ['name'],
		oneOf: [{ required: ['prompt'] }, { required: ['image_url'] }],
		properties: {
			name: { type: 'string', minLength: 1, maxLength: 64 },
			prompt: { type: 'string', minLength: 1, maxLength: 600 },
			image_url: { type: 'string', format: 'uri' },
			personality: { type: 'string', maxLength: 600 },
			voice: { type: 'string' },
		},
	},
	storefronts: ['x402scan'],
};
