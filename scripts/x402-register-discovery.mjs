// Register three.ws's paid x402 endpoints with open discovery indexes so agents
// can find and pay them. Reads our OWN live discovery catalog
// (https://three.ws/.well-known/x402.json) as the single source of truth — no
// hardcoded endpoint list — and maps each resource onto the 402index.io /
// x402search register schema.
//
// The CDP Bazaar needs no submission (it auto-catalogs on first CDP-facilitator
// settlement); this script handles the open indexes that take a direct POST.
//
// Usage:
//   node scripts/x402-register-discovery.mjs              # DRY RUN — prints payloads, sends nothing
//   node scripts/x402-register-discovery.mjs --live       # actually submit
//   node scripts/x402-register-discovery.mjs --live --limit 8     # respect 10/hr/IP rate cap
//   node scripts/x402-register-discovery.mjs --only model-check,fact-check   # filter by path/name
//
// 402index.io: POST /api/v1/register — no API key, rate-limited 10 registrations/hour/IP.

const CATALOG_URL = process.env.X402_CATALOG_URL || 'https://three.ws/.well-known/x402.json';
const REGISTER_URL = process.env.X402_REGISTER_URL || 'https://402index.io/api/v1/register';
const PROVIDER = 'three.ws';
const CONTACT_EMAIL = 'support@three.ws';

function parseArgs(argv) {
	const args = { live: false, limit: Infinity, only: null, skip: 0 };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--live') args.live = true;
		else if (a === '--limit') args.limit = Math.max(1, Number(argv[++i]) || Infinity);
		else if (a === '--skip') args.skip = Math.max(0, Number(argv[++i]) || 0);
		else if (a === '--only') args.only = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
	}
	return args;
}

function usdFromPrice(accept) {
	if (accept?.price && /\$[\d.]+/.test(accept.price)) return Number(accept.price.replace(/[^\d.]/g, ''));
	const decimals = Number(accept?.extra?.decimals ?? 6);
	if (accept?.amount != null) return Number(accept.amount) / 10 ** decimals;
	return undefined;
}

// Map one catalog resource → a 402index register payload. Prefer the Solana
// accept's network label when present (so the index shows our multi-chain
// support), else the first accept.
function toRegistration(resource) {
	const accepts = Array.isArray(resource.accepts) ? resource.accepts : [];
	const primary = accepts[0] || {};
	const networks = [...new Set(accepts.map((a) => a.network_label || a.network).filter(Boolean))];
	const reg = {
		url: resource.url,
		name: resource.serviceName || resource.path || resource.url,
		protocol: 'x402',
		http_method: (resource.method || 'GET').toUpperCase(),
		description: resource.description || undefined,
		price_usd: usdFromPrice(primary),
		payment_asset: primary.asset_symbol || 'USDC',
		payment_network: networks.join(', ') || undefined,
		category: (resource.tags && resource.tags[0]) || 'ai-agents',
		provider: PROVIDER,
		contact_email: CONTACT_EMAIL,
	};
	// POST endpoints that validate a body: hand the index a probe body so its
	// compliance check can reach the 402 instead of a 400.
	const input = resource.extensions?.bazaar?.info?.input;
	if (reg.http_method !== 'GET' && input && input.body) {
		reg.probe_body = typeof input.body === 'string' ? input.body : JSON.stringify(input.body);
	}
	// Drop undefined keys for a clean payload.
	return Object.fromEntries(Object.entries(reg).filter(([, v]) => v !== undefined));
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	process.stdout.write(`\nDiscovery registration → ${REGISTER_URL}\nCatalog: ${CATALOG_URL}\nMode: ${args.live ? 'LIVE (submitting)' : 'DRY RUN (nothing sent)'}\n\n`);

	const res = await fetch(CATALOG_URL);
	if (!res.ok) throw new Error(`could not fetch catalog: HTTP ${res.status}`);
	const catalog = await res.json();
	let resources = Array.isArray(catalog.resources) ? catalog.resources : [];
	if (args.only) {
		resources = resources.filter((r) =>
			args.only.some((t) => (r.path || '').includes(t) || (r.serviceName || '').toLowerCase().includes(t.toLowerCase())),
		);
	}

	// Dedupe by URL: MCP servers (/api/mcp, /api/mcp-3d) are cataloged once per
	// tool but are a SINGLE payable endpoint — register each URL once (first
	// occurrence keeps the richest metadata).
	const byUrl = new Map();
	for (const r of resources.map(toRegistration)) {
		if (r.url && r.name && !byUrl.has(r.url)) byUrl.set(r.url, r);
	}
	const regs = [...byUrl.values()];
	const after = regs.slice(args.skip);
	const slice = after.slice(0, args.limit === Infinity ? after.length : args.limit);
	process.stdout.write(`${regs.length} resources in catalog · submitting ${args.live ? slice.length : 0}${args.limit !== Infinity ? ` (limit ${args.limit})` : ''}\n\n`);

	let ok = 0;
	let failed = 0;
	for (const reg of slice) {
		const label = `${reg.name} (${reg.http_method} ${new URL(reg.url).pathname})`;
		if (!args.live) {
			process.stdout.write(`• ${label} — $${reg.price_usd ?? '?'} ${reg.payment_asset} on ${reg.payment_network || '?'}\n`);
			continue;
		}
		try {
			const r = await fetch(REGISTER_URL, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(reg),
			});
			const text = await r.text();
			if (r.ok) {
				ok++;
				process.stdout.write(`✓ ${label} — ${r.status}\n`);
			} else if (r.status === 409 || /exists|duplicate|already/i.test(text)) {
				ok++;
				process.stdout.write(`= ${label} — already listed (${r.status})\n`);
			} else if (r.status === 429) {
				process.stdout.write(`\n⚠ Rate limited (10/hr/IP). Stopping — re-run later for the rest.\n`);
				break;
			} else {
				failed++;
				process.stdout.write(`✗ ${label} — ${r.status}: ${text.slice(0, 160)}\n`);
			}
		} catch (err) {
			failed++;
			process.stdout.write(`✗ ${label} — ${err.message}\n`);
		}
	}

	if (args.live) process.stdout.write(`\nDone. ${ok} listed/ok, ${failed} failed, ${Math.max(0, regs.length - slice.length)} not attempted.\n`);
	else process.stdout.write(`\nDry run only. Re-run with --live to submit (respecting the 10/hr/IP cap with --limit).\n`);
}

main().catch((err) => {
	process.stderr.write(`\n✗ ${err.message}\n`);
	process.exit(1);
});
