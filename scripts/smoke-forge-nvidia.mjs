#!/usr/bin/env node
// Prod smoke test for the free NVIDIA NIM TRELLIS 3D lane on /forge.
// Submits a draft text→3D job and a draft image→3D job against production,
// polls each to completion, and verifies the returned GLB is a real binary
// glTF (magic "glTF", version 2). Proves the `nvidia` backend serves both
// paths end-to-end for a first-time visitor. No mocks — real API, real GLB.
//
// Usage: node scripts/smoke-forge-nvidia.mjs [baseUrl]
//   baseUrl defaults to https://three.ws

const BASE = (process.argv[2] || 'https://three.ws').replace(/\/$/, '');
const IMAGE_URL = `${BASE}/accessories/thumbs/hat-cowboy.png`;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 4000;

const now = () => Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function submit(body, label) {
	const t0 = now();
	const res = await fetch(`${BASE}/api/forge`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
	const text = await res.text();
	let json;
	try {
		json = JSON.parse(text);
	} catch {
		throw new Error(`${label}: non-JSON response (${res.status}): ${text.slice(0, 300)}`);
	}
	if (!res.ok) {
		throw new Error(`${label}: submit failed ${res.status} — ${JSON.stringify(json)}`);
	}
	console.log(
		`[${label}] submitted in ${now() - t0}ms → status=${json.status} backend=${json.backend} tier=${json.tier} path=${json.path} job_id=${(json.job_id || '').slice(0, 16)}…`,
	);
	if (json.backend !== 'nvidia') {
		throw new Error(`${label}: expected backend=nvidia, got ${json.backend}`);
	}
	return { json, t0 };
}

async function pollToDone({ json, t0 }, label) {
	let state = json;
	const deadline = now() + POLL_TIMEOUT_MS;
	while (state.status !== 'done') {
		if (state.status === 'failed') {
			throw new Error(`${label}: job failed — ${state.error || 'unknown'}`);
		}
		if (now() > deadline) {
			throw new Error(`${label}: poll timed out after ${POLL_TIMEOUT_MS}ms (last status=${state.status})`);
		}
		await sleep(POLL_INTERVAL_MS);
		const res = await fetch(`${BASE}/api/forge?job=${encodeURIComponent(json.job_id)}`);
		const text = await res.text();
		try {
			state = JSON.parse(text);
		} catch {
			throw new Error(`${label}: non-JSON poll response (${res.status}): ${text.slice(0, 200)}`);
		}
		if (!res.ok) throw new Error(`${label}: poll failed ${res.status} — ${JSON.stringify(state)}`);
		process.stdout.write(`  [${label}] ${Math.round((now() - t0) / 1000)}s status=${state.status}\r`);
	}
	const elapsed = now() - t0;
	const glbUrl = state.glb_url;
	if (!glbUrl) throw new Error(`${label}: done but no glb_url`);
	console.log(`\n[${label}] DONE in ${(elapsed / 1000).toFixed(1)}s → ${glbUrl}`);
	return { glbUrl, elapsed };
}

async function verifyGlb(glbUrl, label) {
	const res = await fetch(glbUrl);
	if (!res.ok) throw new Error(`${label}: GLB fetch failed ${res.status}`);
	const buf = Buffer.from(await res.arrayBuffer());
	const magic = buf.subarray(0, 4).toString('ascii');
	const version = buf.readUInt32LE(4);
	if (magic !== 'glTF') throw new Error(`${label}: not a glTF (magic="${magic}")`);
	if (version !== 2) throw new Error(`${label}: unexpected glTF version ${version}`);
	console.log(`[${label}] GLB verified: magic=glTF v${version}, ${(buf.length / 1024).toFixed(0)} KB`);
	return buf.length;
}

async function run() {
	console.log(`Smoke testing free NVIDIA NIM 3D lane @ ${BASE}/forge\n`);

	// Catalog: confirm nvidia is configured + free + the draft default.
	const cat = await (await fetch(`${BASE}/api/forge?catalog`)).json();
	const nvidia = (cat.backends || []).find((b) => b.id === 'nvidia');
	console.log(
		`Catalog: nvidia present=${!!nvidia} configured=${nvidia?.configured} free=${nvidia?.free}; draft default(image)=${cat.default_backend_for_tier?.draft?.image ?? '?'}`,
	);
	if (!nvidia?.configured) throw new Error('nvidia backend not configured on prod (NVIDIA_API_KEY missing?)');

	const results = {};

	// Text→3D, draft tier.
	const text = await submit({ prompt: 'a ceramic teapot', tier: 'draft' }, 'text→3D');
	const textDone = await pollToDone(text, 'text→3D');
	results.textBytes = await verifyGlb(textDone.glbUrl, 'text→3D');
	results.textSec = (textDone.elapsed / 1000).toFixed(1);

	// Image→3D, draft tier.
	const image = await submit({ image_urls: [IMAGE_URL], tier: 'draft' }, 'image→3D');
	const imageDone = await pollToDone(image, 'image→3D');
	results.imageBytes = await verifyGlb(imageDone.glbUrl, 'image→3D');
	results.imageSec = (imageDone.elapsed / 1000).toFixed(1);

	console.log('\n=== SMOKE PASSED ===');
	console.log(`text→3D : ${results.textSec}s, ${(results.textBytes / 1024).toFixed(0)} KB GLB`);
	console.log(`image→3D: ${results.imageSec}s, ${(results.imageBytes / 1024).toFixed(0)} KB GLB`);
}

run().catch((err) => {
	console.error(`\n=== SMOKE FAILED ===\n${err.message}`);
	process.exit(1);
});
