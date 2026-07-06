// OKX.AI (X Layer agent marketplace) service catalog — the single source of
// truth for every A2MCP service agent #2632 "three.ws 3D Studio" sells on
// OKX.AI. Endpoints, the free catalog/health service, tests, AND the listing
// update submitted to OKX all read from this module, so the live endpoints can
// never drift from the marketplace listing.
//
// OKX listing format: every service carries a 2-part description — part 1 says
// what the service does, part 2 says what the caller must provide — and each
// part must fit in 200 display-width characters, where East-Asian wide glyphs
// count 2 and everything else counts 1 (OKX rejects over-length listings).
// `validateCatalog()` enforces this; tests/okx-catalog.test.js runs it in CI.
//
// Work order 03 (prompts/okx-ai/03-service-decomposition.md) decomposes the
// rest of the 3D studio into rows of this catalog; work order 06 seeded it
// with the Agent Identity Studio flagship plus the free discovery lane.

const BASE = 'https://three.ws';

// Display width per the OKX listing rule: East-Asian Wide / Fullwidth code
// points count 2, everything else counts 1. Ranges follow Unicode UAX #11
// (W/F categories) closely enough for listing validation: CJK ideographs and
// radicals, Hangul, Kana, fullwidth forms, and the supplementary ideographic
// planes.
export function displayWidth(str) {
	let width = 0;
	for (const ch of String(str ?? '')) {
		const cp = ch.codePointAt(0);
		const wide =
			(cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
			(cp >= 0x2e80 && cp <= 0x303e) || // CJK radicals, Kangxi, CJK symbols
			(cp >= 0x3041 && cp <= 0x33ff) || // Kana, CJK compat
			(cp >= 0x3400 && cp <= 0x4dbf) || // CJK ext A
			(cp >= 0x4e00 && cp <= 0x9fff) || // CJK unified
			(cp >= 0xa000 && cp <= 0xa4cf) || // Yi
			(cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
			(cp >= 0xf900 && cp <= 0xfaff) || // CJK compat ideographs
			(cp >= 0xfe30 && cp <= 0xfe4f) || // CJK compat forms
			(cp >= 0xff00 && cp <= 0xff60) || // Fullwidth forms
			(cp >= 0xffe0 && cp <= 0xffe6) || // Fullwidth signs
			(cp >= 0x20000 && cp <= 0x3fffd); // Supplementary ideographic planes
		width += wide ? 2 : 1;
	}
	return width;
}

export const DESCRIPTION_MAX_WIDTH = 200;

// USDC uses 6 decimals on every rail we accept.
function usdToAtomics(usd) {
	return String(Math.round(Number(usd) * 1e6));
}

// One row per marketplace service. Fields:
//   id                  URL slug — the service's route is /api/okx/3d/<id>
//   name                Listing display name
//   kind                'a2mcp' (MCP Streamable HTTP JSON-RPC) | 'rest' (plain JSON GET)
//   describes           2-part OKX listing description { capability, input }
//   priceUsd            Retail price in USD as a string ('0' = free)
//   amountAtomics       x402 amount (USDC 6-decimals atomic string), null = free
//   endpoint            Absolute endpoint URL buyers call
//   tool                For a2mcp services: the paid MCP tool name on that endpoint
//   inputSchema         JSON Schema of the paid call's arguments (free lanes: response shape)
export const OKX_CATALOG = Object.freeze([
	{
		id: 'identity-studio',
		name: 'Agent Identity Studio',
		kind: 'a2mcp',
		describes: {
			capability:
				'Creates a 3D identity for an AI agent from a text brief: a rigged, animation-ready GLB ' +
				'avatar plus posed studio renders — a square PFP sized for the OKX avatar slot and ' +
				'full-body shots.',
			input:
				'Call create_identity with agent_name and a brief (any language); optional style_hints ' +
				'and reference_image_url. Returns a job_id — poll identity_status free until the ' +
				'deliverables are ready.',
		},
		priceUsd: '1.50',
		amountAtomics: usdToAtomics(1.5),
		endpoint: `${BASE}/api/okx/3d/identity-studio`,
		tool: 'create_identity',
		inputSchema: {
			type: 'object',
			required: ['agent_name', 'brief'],
			additionalProperties: false,
			properties: {
				agent_name: {
					type: 'string',
					minLength: 1,
					maxLength: 80,
					description: 'The agent’s display name. Rendered into the identity brief.',
				},
				brief: {
					type: 'string',
					minLength: 3,
					maxLength: 4000,
					description:
						'Personality / brand description in any language. Longer than 2000 characters is ' +
						'truncated (the response flags brief_truncated).',
				},
				style_hints: {
					type: 'string',
					maxLength: 500,
					description: 'Optional visual direction: palette, materials, era, mood.',
				},
				reference_image_url: {
					type: 'string',
					format: 'uri',
					description:
						'Optional public image to guide the look. Validated before any charge — an ' +
						'unreachable URL fails the call without settling payment.',
				},
			},
		},
	},
	{
		id: 'catalog',
		name: '3D Studio Catalog (free)',
		kind: 'rest',
		describes: {
			capability:
				'Free machine-readable index of every three.ws 3D Studio service on OKX.AI: names, ' +
				'descriptions, prices, endpoints, and input schemas — generated from the module the ' +
				'endpoints run on.',
			input: 'GET with no parameters. No payment, no account.',
		},
		priceUsd: '0',
		amountAtomics: null,
		endpoint: `${BASE}/api/okx/3d/catalog`,
		tool: null,
		inputSchema: null,
	},
	{
		id: 'health',
		name: '3D Studio Health (free)',
		kind: 'rest',
		describes: {
			capability:
				'Free live health of the 3D studio lanes backing every paid service: generation, ' +
				'rigging, rendering, and storage — real subsystem probes, not a hardcoded OK.',
			input: 'GET with no parameters. No payment, no account.',
		},
		priceUsd: '0',
		amountAtomics: null,
		endpoint: `${BASE}/api/okx/3d/health`,
		tool: null,
		inputSchema: null,
	},
]);

export function catalogEntry(id) {
	return OKX_CATALOG.find((e) => e.id === id) || null;
}

// The machine-readable index the free catalog service returns — the exact
// payload OKX buyers (and work order 05's listing update) consume.
export function catalogIndex() {
	return {
		provider: 'three.ws 3D Studio',
		okxAgentId: 2632,
		chain: 'eip155:196',
		services: OKX_CATALOG.map((e) => ({
			id: e.id,
			name: e.name,
			kind: e.kind,
			description: e.describes,
			price_usd: e.priceUsd,
			endpoint: e.endpoint,
			...(e.tool ? { tool: e.tool } : {}),
			...(e.inputSchema ? { input_schema: e.inputSchema } : {}),
		})),
		docs: `${BASE}/docs/okx-marketplace`,
	};
}

// Catalog integrity check — throws on the first malformed entry. Tests call
// this; anything that would get the listing rejected fails CI instead.
export function validateCatalog(catalog = OKX_CATALOG) {
	const seen = new Set();
	for (const e of catalog) {
		const ctx = `okx-catalog entry "${e?.id}"`;
		if (!e.id || !/^[a-z0-9-]+$/.test(e.id)) throw new Error(`${ctx}: bad id`);
		if (seen.has(e.id)) throw new Error(`${ctx}: duplicate id`);
		seen.add(e.id);
		if (!e.name) throw new Error(`${ctx}: missing name`);
		if (!['a2mcp', 'rest'].includes(e.kind)) throw new Error(`${ctx}: bad kind`);
		for (const part of ['capability', 'input']) {
			const text = e.describes?.[part];
			if (!text) throw new Error(`${ctx}: missing describes.${part}`);
			const w = displayWidth(text);
			if (w > DESCRIPTION_MAX_WIDTH) {
				throw new Error(`${ctx}: describes.${part} display width ${w} > ${DESCRIPTION_MAX_WIDTH}`);
			}
		}
		if (!/^\d+(\.\d{1,2})?$/.test(e.priceUsd)) throw new Error(`${ctx}: bad priceUsd`);
		const free = e.priceUsd === '0';
		if (free && e.amountAtomics !== null) throw new Error(`${ctx}: free row must have null atomics`);
		if (!free) {
			if (!/^\d+$/.test(e.amountAtomics ?? '')) throw new Error(`${ctx}: bad amountAtomics`);
			if (String(Math.round(Number(e.priceUsd) * 1e6)) !== e.amountAtomics) {
				throw new Error(`${ctx}: amountAtomics does not equal priceUsd in USDC atomics`);
			}
		}
		if (!/^https:\/\/three\.ws\/api\/okx\/3d\/[a-z0-9-]+$/.test(e.endpoint)) {
			throw new Error(`${ctx}: endpoint must be https://three.ws/api/okx/3d/<id>`);
		}
		if (!e.endpoint.endsWith(`/${e.id}`)) throw new Error(`${ctx}: endpoint/id mismatch`);
		if (e.kind === 'a2mcp' && (!e.tool || !e.inputSchema)) {
			throw new Error(`${ctx}: a2mcp row needs tool + inputSchema`);
		}
	}
	return true;
}
