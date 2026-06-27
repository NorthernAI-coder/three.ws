// Manual test for the GLB Canonicalization autonomous pipeline (USE-011).
//
// Exercises the value-extraction + storage logic of the 'glb-canonicalize'
// registry entry against REAL model bytes (a Mixamo-rigged avatar shipped in
// public/avatars), using the same glTF inspector the live /api/x402/model-check
// endpoint runs. No mocks — the only thing not exercised here is the on-chain
// USDC payment itself (that requires the seed wallet + Solana mainnet and is
// driven by the cron loop in production).
//
//   node scripts/test-glb-canonicalize.mjs
//
// With DATABASE_URL set it additionally upserts into glb_canonicalization_results
// for real and reads the row back.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { inspectModel, suggestOptimizations } from '../src/gltf-inspect.js';
import {
	getSelfRegistry,
	classifyCanonicalization,
	RIG_REFERENCE_AVATARS,
} from '../api/_lib/x402/autonomous-registry.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
function check(label, cond, detail) {
	const ok = !!cond;
	if (!ok) failures++;
	console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
}

function getEntry() {
	const entry = getSelfRegistry().find((e) => e.id === 'glb-canonicalize');
	if (!entry) throw new Error('glb-canonicalize entry not found in registry');
	return entry;
}

// Build the exact response shape /api/x402/model-check returns, from real bytes.
async function modelCheckResponseFor(file) {
	const bytes = new Uint8Array(await readFile(join(ROOT, 'public', 'avatars', file)));
	const model = await inspectModel(bytes, { fileSize: bytes.byteLength });
	return {
		url: `https://three.ws/avatars/${file}`,
		fetchedBytes: bytes.byteLength,
		model,
		suggestions: suggestOptimizations(model),
	};
}

async function main() {
	const entry = getEntry();

	console.log('\n1. Registry entry shape');
	check('id', entry.id === 'glb-canonicalize');
	check('method GET', entry.method === 'GET');
	check('pipeline tag', entry.pipeline === 'canonicalize', entry.pipeline);
	check('cooldown 300s', entry.cooldown_s === 300);
	check('enabled', entry.enabled === true);
	check('has resolveTarget', typeof entry.resolveTarget === 'function');
	check('has extractSignal', typeof entry.extractSignal === 'function');
	check('has storeValue', typeof entry.storeValue === 'function');

	console.log('\n2. resolveTarget rotation (stub redis)');
	let counter = 0;
	const redis = { incr: async () => ++counter };
	const seen = [];
	for (let i = 0; i < RIG_REFERENCE_AVATARS.length + 2; i++) {
		const t = await entry.resolveTarget({ redis, origin: 'https://three.ws' });
		seen.push(t.targetUrl.split('/').pop());
		check(`call ${i} → ${seen[i]}`, t.path.includes('/api/x402/model-check?url=') && t.targetUrl.startsWith('https://three.ws/avatars/'));
	}
	check('rotates through full set', new Set(seen).size === RIG_REFERENCE_AVATARS.length, `${new Set(seen).size}/${RIG_REFERENCE_AVATARS.length} unique`);
	check('wraps around', seen[0] === seen[RIG_REFERENCE_AVATARS.length]);

	console.log('\n3. extractSignal on a real skinned (Mixamo) avatar');
	const resp = await modelCheckResponseFor('xbot.glb');
	const sig = entry.extractSignal(resp);
	console.log('   signal:', JSON.stringify(sig));
	check('model_url present', sig.model_url === resp.url);
	check('detected skin', sig.is_skinned === true, `skins=${sig.skins}`);
	check('rig_type skinned/vrm', sig.rig_type === 'skinned' || sig.rig_type === 'vrm', sig.rig_type);
	check('canonical_ready true for skinned rig', sig.canonical_ready === true);
	check('classify agrees with extractSignal', JSON.stringify(sig) === JSON.stringify(classifyCanonicalization(resp)));

	console.log('\n4. static (non-skinned) classification');
	const staticResp = { url: 'https://three.ws/avatars/none.glb', model: { container: 'glb', counts: { skins: 0, animations: 0, nodes: 3 } }, suggestions: [] };
	const staticSig = entry.extractSignal(staticResp);
	check('rig_type static', staticSig.rig_type === 'static', staticSig.rig_type);
	check('canonical_ready false', staticSig.canonical_ready === false);

	console.log('\n5. storeValue → glb_canonicalization_results (captured SQL)');
	const captured = [];
	const stubSql = (strings, ...vals) => {
		captured.push({ sql: strings.join('?').replace(/\s+/g, ' ').trim(), vals });
		return Promise.resolve([]);
	};
	await entry.storeValue({ sql: stubSql, responseBody: resp, signalData: sig, runId: randomUUID(), targetUrl: resp.url });
	const insert = captured.find((c) => /INSERT INTO glb_canonicalization_results/i.test(c.sql));
	check('issued CREATE TABLE IF NOT EXISTS', captured.some((c) => /CREATE TABLE IF NOT EXISTS glb_canonicalization_results/i.test(c.sql)));
	check('issued upsert INSERT', !!insert);
	check('upsert carries model_url', insert?.vals?.includes(resp.url));
	check('upsert carries rig_type', insert?.vals?.includes(sig.rig_type));

	console.log('\n6. error handling');
	let threw = false;
	try { await entry.storeValue({ sql: null, responseBody: resp, signalData: sig, runId: 'x', targetUrl: resp.url }); }
	catch { threw = true; }
	check('no-sql is a no-op (no throw)', threw === false);

	// Optional: real DB round-trip when DATABASE_URL is configured.
	if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
		console.log('\n7. real DB upsert + read-back');
		const { sql } = await import('../api/_lib/db.js');
		const runId = randomUUID();
		await entry.storeValue({ sql, responseBody: resp, signalData: sig, runId, targetUrl: resp.url });
		const rows = await sql`SELECT model_url, rig_type, is_skinned, canonical_ready, run_id FROM glb_canonicalization_results WHERE model_url = ${resp.url}`;
		check('row persisted', rows.length === 1, JSON.stringify(rows[0]));
		check('rig_type stored', rows[0]?.rig_type === sig.rig_type);
		check('run_id stored', rows[0]?.run_id === runId);
	} else {
		console.log('\n7. real DB round-trip skipped (no DATABASE_URL)');
	}

	console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failed check(s)\n`);
	process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error('test crashed:', err);
	process.exit(1);
});
