#!/usr/bin/env node
/**
 * Verify a 3D Agent Card v1 against the published JSON Schema AND the spec's
 * mandatory conformance point #3: the bytes at `model.uri` MUST hash to
 * `model.sha256` (specs/3D_AGENT_CARD.md). A card that fails the hash check is
 * "unverified" regardless of any validation report.
 *
 * Used by the self-registration flow (scripts/erc8004-register-self.mjs) as a
 * pre-mint gate — we never point a tokenURI at a card that doesn't verify — and
 * runnable standalone to audit the served documents.
 *
 *   # verify the platform card against the local GLB bytes (default):
 *   node scripts/erc8004-verify-card.mjs
 *
 *   # verify a specific card file:
 *   node scripts/erc8004-verify-card.mjs --card public/.well-known/3d-agent-card.json
 *
 *   # fetch model.uri over the network instead of resolving to a local file:
 *   node scripts/erc8004-verify-card.mjs --remote
 *
 * Exit code 0 = conformant, 1 = failed (schema or hash). No network, no keys
 * needed in the default (local) mode.
 */

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

function arg(name, fallback) {
	const i = process.argv.indexOf(name);
	return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
		? process.argv[i + 1]
		: fallback;
}
function flag(name) {
	return process.argv.includes(name);
}

const CARD_PATH = resolve(REPO_ROOT, arg('--card', 'public/.well-known/3d-agent-card.json'));
const SCHEMA_PATH = resolve(REPO_ROOT, 'public/.well-known/3d-agent-card.schema.json');
const remote = flag('--remote');

/**
 * Resolve `model.uri` to raw bytes.
 *  - In local mode an `https://three.ws/avatars/<file>` (or any first-party
 *    `/avatars/...`) URI maps to the committed asset under public/, so the check
 *    runs offline against the exact bytes that will be served.
 *  - `ipfs://` and arbitrary `https://` URIs are fetched (network) — also used
 *    when --remote is passed so the served bytes are checked end-to-end.
 */
async function loadModelBytes(uri) {
	if (!remote) {
		const m = /\/avatars\/([^/?#]+)$/.exec(uri);
		if (m) {
			const local = resolve(REPO_ROOT, 'public/avatars', m[1]);
			if (existsSync(local)) {
				return { bytes: readFileSync(local), source: `local:public/avatars/${m[1]}` };
			}
		}
	}
	let url = uri;
	if (uri.startsWith('ipfs://')) {
		url = `https://w3s.link/ipfs/${uri.slice('ipfs://'.length)}`;
	}
	const res = await fetch(url);
	if (!res.ok) throw new Error(`fetch ${url} → ${res.status} ${res.statusText}`);
	const buf = Buffer.from(await res.arrayBuffer());
	return { bytes: buf, source: `remote:${url}` };
}

async function main() {
	if (!existsSync(CARD_PATH)) {
		console.error(`✗ card not found: ${CARD_PATH}`);
		process.exit(1);
	}
	if (!existsSync(SCHEMA_PATH)) {
		console.error(`✗ schema not found: ${SCHEMA_PATH}`);
		process.exit(1);
	}

	const card = JSON.parse(readFileSync(CARD_PATH, 'utf8'));
	const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));

	console.log(`Verifying ${basename(CARD_PATH)} (${card.name || 'unnamed'})\n`);

	// ── 1. JSON Schema ────────────────────────────────────────────────────────
	const ajv = new Ajv({ allErrors: true, strict: false });
	addFormats(ajv);
	const validate = ajv.compile(schema);
	const schemaOk = validate(card);
	if (schemaOk) {
		console.log('✓ schema       valid against 3d-agent-card.schema.json');
	} else {
		console.log('✗ schema       INVALID:');
		for (const e of validate.errors || []) {
			console.log(`               ${e.instancePath || '/'} ${e.message}`);
		}
	}

	// ── 2. Conformance: type[] includes both required URIs ────────────────────
	const types = Array.isArray(card.type) ? card.type : [card.type];
	const ERC = 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1';
	const TWS = 'https://three.ws/specs/3d-agent-card-v1';
	const allTypes = [...types, ...(card.additionalTypes || [])];
	const typeOk = allTypes.includes(ERC) && allTypes.includes(TWS);
	console.log(
		typeOk
			? '✓ type         includes both ERC-8004 + three.ws Card v1 URIs'
			: `✗ type         missing required URI (has: ${allTypes.join(', ') || 'none'})`,
	);

	// ── 3. Mandatory: model bytes hash to model.sha256 ────────────────────────
	let hashOk = false;
	if (!card.model?.uri || !card.model?.sha256) {
		console.log('✗ model.sha256 card has no model.uri / model.sha256');
	} else {
		try {
			const { bytes, source } = await loadModelBytes(card.model.uri);
			const actual = createHash('sha256').update(bytes).digest('hex');
			hashOk = actual === card.model.sha256.toLowerCase();
			if (hashOk) {
				console.log(`✓ model.sha256 ${actual}`);
				console.log(`               bytes: ${bytes.length} from ${source}`);
			} else {
				console.log('✗ model.sha256 MISMATCH — card is UNVERIFIED');
				console.log(`               card:   ${card.model.sha256}`);
				console.log(`               actual: ${actual}  (${source})`);
			}
		} catch (err) {
			console.log(`✗ model.sha256 could not load bytes: ${err.message}`);
		}
	}

	const ok = schemaOk && typeOk && hashOk;
	console.log(`\n${ok ? '✓ CONFORMANT' : '✗ NOT CONFORMANT'} — 3D Agent Card v1`);
	process.exit(ok ? 0 : 1);
}

main().catch((err) => {
	console.error('fatal:', err?.stack || err?.message || err);
	process.exit(1);
});
