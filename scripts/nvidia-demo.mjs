#!/usr/bin/env node
// Self-contained NVIDIA TRELLIS text→3D demo runner.
//
// Mirrors the verified protocol in api/_providers/nvidia.js but with ZERO repo
// coupling (no env.js, no R2) so it runs anywhere with just the key:
//
//   NVIDIA_API_KEY=nvapi-… node scripts/nvidia-demo.mjs "a friendly robot mascot"
//
// Output: writes the GLB to demo/<slug>.glb and prints the path. Point the
// viewer (scripts/nvidia-demo-viewer.html) at it to record the X clip.

const TRELLIS_INVOKE_URL = 'https://ai.api.nvidia.com/v1/genai/microsoft/trellis';
const NVCF_STATUS_URL = 'https://api.nvcf.nvidia.com/v2/nvcf/pexec/status';
const NVCF_POLL_SECONDS = 30;
const PROMPT_MAX = 77;
const STYLE_SUFFIX = ', studio lighting';
const STYLE_WORDS = ['studio', 'light', 'bright', 'backlit', 'colorful', 'vibrant', 'cartoon', 'stylized'];

const apiKey = process.env.NVIDIA_API_KEY;
if (!apiKey) {
	console.error('✖ NVIDIA_API_KEY is not set. Run:\n  NVIDIA_API_KEY=nvapi-… node scripts/nvidia-demo.mjs "your prompt"');
	process.exit(1);
}

const prompt = process.argv.slice(2).join(' ').trim() || 'a friendly robot mascot, colorful';
const tier = process.env.TIER || 'draft';
const steps = tier === 'high' ? 40 : 15; // hosted preview only completes at 15 reliably

function enhancePrompt(raw) {
	const text = String(raw || '').trim();
	const lower = text.toLowerCase();
	if (STYLE_WORDS.some((w) => lower.includes(w))) return text.slice(0, PROMPT_MAX);
	const maxBase = PROMPT_MAX - STYLE_SUFFIX.length;
	return text.slice(0, maxBase) + STYLE_SUFFIX;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function extractGlb(res) {
	const ct = (res.headers.get('content-type') || '').toLowerCase();
	if (ct.includes('json')) {
		const data = await res.json().catch(() => null);
		const a0 = data?.artifacts?.[0];
		if (typeof a0 === 'string' && a0 && !a0.startsWith('http')) return Buffer.from(a0, 'base64');
		const inline = a0?.base64 ?? a0?.data ?? (typeof data?.output === 'string' ? data.output : null);
		if (typeof inline === 'string' && !inline.startsWith('http')) return Buffer.from(inline, 'base64');
		const url = a0?.url ?? (typeof inline === 'string' && inline.startsWith('http') ? inline : null);
		if (url) {
			const r = await fetch(url);
			if (r.ok) return Buffer.from(await r.arrayBuffer());
		}
		const arts = data?.artifacts;
		if (arts && typeof arts === 'object' && !Array.isArray(arts)) {
			const v = arts['0'] ?? Object.values(arts)[0];
			const b64 = v?.base64 ?? (typeof v === 'string' && !v.startsWith('http') ? v : null);
			if (b64) return Buffer.from(b64, 'base64');
		}
		throw new Error('No GLB in JSON response: keys=' + JSON.stringify(Object.keys(data || {})));
	}
	if (ct.includes('gltf') || ct.includes('octet-stream') || ct.startsWith('model/') || ct.includes('binary')) {
		return Buffer.from(await res.arrayBuffer());
	}
	throw new Error('Unexpected content-type: ' + ct + ' — ' + (await res.text()).slice(0, 160));
}

async function main() {
	const t0 = Date.now();
	const finalPrompt = enhancePrompt(prompt);
	console.log(`→ TRELLIS text→3D  tier=${tier} steps=${steps}\n  prompt: "${finalPrompt}"`);

	const invokeBody = JSON.stringify({
		mode: 'text',
		prompt: finalPrompt,
		ss_sampling_steps: steps,
		slat_sampling_steps: steps,
		output_format: 'glb',
	});
	const invokeHeaders = {
		authorization: `Bearer ${apiKey}`,
		accept: 'application/json',
		'content-type': 'application/json',
		'nvcf-poll-seconds': String(NVCF_POLL_SECONDS),
	};

	// NVCF answers a cold model with a transient 502/503/504. Retry a few times
	// with backoff before giving up — the model just needs to spin up.
	let res;
	for (let attempt = 1; attempt <= 6; attempt++) {
		res = await fetch(TRELLIS_INVOKE_URL, { method: 'POST', headers: invokeHeaders, body: invokeBody });
		if (![502, 503, 504].includes(res.status)) break;
		const wait = Math.min(attempt * 5, 20);
		console.log(`  ${res.status} (model warming) — retry ${attempt}/6 in ${wait}s…`);
		await res.text().catch(() => {});
		await sleep(wait * 1000);
	}

	let glb;
	if (res.status === 202 || (res.ok && res.headers.get('nvcf-reqid') && !(await res.clone().json().catch(() => ({}))).artifacts?.length)) {
		const reqId = res.headers.get('nvcf-reqid');
		console.log(`  queued (NVCF-REQID ${reqId}) — polling…`);
		for (let i = 0; i < 60; i++) {
			await sleep(2500);
			const p = await fetch(`${NVCF_STATUS_URL}/${encodeURIComponent(reqId)}`, {
				headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
			});
			if (p.status === 202) { process.stdout.write('.'); continue; }
			if (p.ok) { glb = await extractGlb(p); process.stdout.write('\n'); break; }
			if (p.status === 401 || p.status === 403) throw new Error('NVIDIA rejected the API key');
			throw new Error(`poll returned ${p.status}: ${(await p.text()).slice(0, 200)}`);
		}
		if (!glb) throw new Error('timed out waiting for TRELLIS');
	} else if (res.ok) {
		glb = await extractGlb(res);
	} else {
		throw new Error(`invoke ${res.status}: ${(await res.text()).slice(0, 300)}`);
	}

	const { mkdir, writeFile } = await import('node:fs/promises');
	const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'model';
	await mkdir('demo', { recursive: true });
	const out = `demo/${slug}.glb`;
	await writeFile(out, glb);
	const secs = ((Date.now() - t0) / 1000).toFixed(1);
	console.log(`✓ ${(glb.length / 1024).toFixed(0)} KB GLB in ${secs}s → ${out}`);
	console.log(`\nView it:\n  node scripts/nvidia-demo-serve.mjs\n  then open http://localhost:4545/?model=/${out}`);
}

main().catch((e) => { console.error('✖', e.message); process.exit(1); });
