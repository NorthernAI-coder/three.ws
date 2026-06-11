#!/usr/bin/env node
// Photo→3D leg, tight-burst variant: poll every 2.5s to catch a transient slot
// opening on the saturated shared-IP forge limiter. Stops on first non-429 and
// runs the full poll+verify. Bounded to ~maxAttempts.
const BASE = (process.argv[2] || 'https://three.ws').replace(/\/$/, '');
const PHOTO = `${BASE}/accessories/thumbs/hat-cowboy.png`;
const MAX_ATTEMPTS = Number(process.argv[3] || 150);
const START_AT = process.argv[4] ? Date.parse(process.argv[4]) : 0; // ISO time to begin bursting
const INTERVAL_MS = Number(process.argv[5] || 2500);
const now = () => Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function submitBurst(body, label) {
	if (START_AT && now() < START_AT) {
		const waitMs = START_AT - now();
		console.log(`[${label}] holding ${Math.round(waitMs / 1000)}s until boundary ${new Date(START_AT).toISOString()}`);
		await sleep(waitMs);
		console.log(`[${label}] boundary reached, bursting every ${INTERVAL_MS}ms`);
	}
	let lastRA = null;
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		const t0 = now();
		const res = await fetch(`${BASE}/api/forge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		const text = await res.text();
		let json; try { json = JSON.parse(text); } catch { throw new Error(`${label}: non-JSON ${res.status}: ${text.slice(0, 300)}`); }
		if (res.status === 429) {
			if (json.retry_after !== lastRA) { console.log(`[${label}] 429 ra=${json.retry_after}s (attempt ${attempt}) @ ${new Date().toISOString()}`); lastRA = json.retry_after; }
			await sleep(INTERVAL_MS); continue;
		}
		if (!res.ok) throw new Error(`${label}: submit ${res.status} — ${JSON.stringify(json)}`);
		console.log(`[${label}] GOT THROUGH attempt ${attempt} in ${now() - t0}ms → status=${json.status} backend=${json.backend} tier=${json.tier} path=${json.path} eta=${json.eta_seconds}s`);
		return { json, t0 };
	}
	throw new Error(`${label}: rate-limited after ${MAX_ATTEMPTS} tight attempts`);
}

async function poll({ json, t0 }, label) {
	let state = json;
	const deadline = now() + 6 * 60 * 1000;
	while (state.status !== 'done') {
		if (state.status === 'failed') throw new Error(`${label}: failed — ${state.error || 'unknown'}`);
		if (now() > deadline) throw new Error(`${label}: poll timeout (last=${state.status})`);
		await sleep(4000);
		const res = await fetch(`${BASE}/api/forge?job=${encodeURIComponent(json.job_id)}`);
		const t = await res.text();
		try { state = JSON.parse(t); } catch { throw new Error(`${label}: non-JSON poll ${res.status}: ${t.slice(0, 200)}`); }
		if (!res.ok) throw new Error(`${label}: poll ${res.status} — ${JSON.stringify(state)}`);
		process.stdout.write(`  [${label}] ${Math.round((now() - t0) / 1000)}s ${state.status} (backend=${state.backend})        \r`);
	}
	if (!state.glb_url) throw new Error(`${label}: done but no glb_url`);
	console.log(`\n[${label}] DONE ${((now() - t0) / 1000).toFixed(1)}s backend=${state.backend} durable=${state.durable} → ${state.glb_url}`);
	return { glbUrl: state.glb_url, backend: state.backend, sec: (now() - t0) / 1000 };
}

async function verifyGlb(url, label) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${label}: GLB fetch ${res.status}`);
	const buf = Buffer.from(await res.arrayBuffer());
	const magic = buf.subarray(0, 4).toString('ascii');
	const version = buf.readUInt32LE(4);
	const declaredLen = buf.readUInt32LE(8);
	if (magic !== 'glTF') throw new Error(`${label}: not glTF (magic="${magic}")`);
	if (version !== 2) throw new Error(`${label}: glTF v${version}`);
	if (declaredLen !== buf.length) throw new Error(`${label}: length mismatch decl=${declaredLen} actual=${buf.length}`);
	console.log(`[${label}] GLB OK: glTF v2, ${(buf.length / 1024).toFixed(0)} KB, length self-consistent`);
	return buf.length;
}

async function run() {
	console.log(`Photo→3D tight-burst @ ${BASE}, image=${PHOTO}, maxAttempts=${MAX_ATTEMPTS}\n`);
	const photo = await submitBurst({ image_urls: [PHOTO], tier: 'draft', prompt: 'a cowboy hat' }, 'photo→3D');
	if (photo.json.backend === 'nvidia') throw new Error('photo→3D routed to nvidia (text-only) — routing bug');
	const r = await poll(photo, 'photo→3D');
	const bytes = await verifyGlb(r.glbUrl, 'photo→3D');
	console.log(`\n=== PHOTO LEG PASSED ===\nphoto→3D: backend=${r.backend}  ${r.sec.toFixed(1)}s  ${(bytes / 1024).toFixed(0)} KB`);
}
run().catch((e) => { console.error(`\n=== PHOTO LEG FAILED ===\n${e.message}`); process.exit(1); });
