// Live end-to-end check for the photo → 3D reconstruction provider.
//
// Exercises the REAL Replicate API through api/_providers/replicate.js: submits
// a reconstruct job from an image, polls to completion, and verifies a valid
// binary glTF (GLB) comes back. This is the proof that the TRELLIS contract fix
// (generate_model:true + model_file output key) works against the live model —
// not just the stubbed vitest regression.
//
// Usage:
//   node scripts/test-reconstruct-live.mjs [imageUrl]
//
// Requires REPLICATE_API_TOKEN in the environment (loaded from .env if present).

import { readFileSync } from 'node:fs';
import { createRegenProvider } from '../api/_providers/replicate.js';

// Minimal .env loader so the script runs without extra deps.
function loadDotEnv() {
	try {
		const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
		for (const line of raw.split('\n')) {
			const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
			if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
		}
	} catch (_) {}
}

const DEFAULT_IMAGE =
	'https://raw.githubusercontent.com/microsoft/TRELLIS/main/assets/example_image/typical_creature_dragon.png';

const GLB_MAGIC = 0x46546c67; // 'glTF' little-endian

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

async function main() {
	loadDotEnv();
	if (!process.env.REPLICATE_API_TOKEN) {
		console.error('✗ REPLICATE_API_TOKEN is not set. Paste a token into .env and re-run.');
		process.exit(1);
	}

	const imageUrl = process.argv[2] || DEFAULT_IMAGE;
	const provider = createRegenProvider();

	console.log('→ submitting reconstruct job');
	console.log('  image:', imageUrl);
	const submission = await provider.submit({
		mode: 'reconstruct',
		params: { images: [imageUrl] },
		sourceUrl: imageUrl,
	});
	console.log('  model:', submission.model);
	console.log('  prediction:', submission.extJobId);

	const deadline = Date.now() + 8 * 60 * 1000;
	let glbUrl = null;
	let last = '';
	while (Date.now() < deadline) {
		await sleep(3000);
		const s = await provider.status(submission.extJobId);
		if (s.rawStatus && s.rawStatus !== last) {
			last = s.rawStatus;
			console.log('  status:', s.rawStatus);
		}
		if (s.status === 'done') {
			glbUrl = s.resultGlbUrl || null;
			if (!glbUrl) {
				console.error('✗ job finished but no GLB url — extractGlbUrl returned nothing:', s.error);
				process.exit(1);
			}
			break;
		}
		if (s.status === 'failed') {
			console.error('✗ job failed:', s.error);
			process.exit(1);
		}
	}

	if (!glbUrl) {
		console.error('✗ timed out before the job completed');
		process.exit(1);
	}

	console.log('→ downloading GLB:', glbUrl);
	const resp = await fetch(glbUrl);
	if (!resp.ok) {
		console.error('✗ could not download GLB:', resp.status);
		process.exit(1);
	}
	const buf = Buffer.from(await resp.arrayBuffer());
	const magic = buf.readUInt32LE(0);
	const version = buf.readUInt32LE(4);
	if (magic !== GLB_MAGIC || version !== 2) {
		console.error(`✗ downloaded file is not a valid binary glTF 2.0 (magic=${magic.toString(16)}, version=${version})`);
		process.exit(1);
	}

	console.log(`✓ PASS — valid GLB, ${(buf.length / 1024).toFixed(0)} KB`);
	console.log('  The selfie → 3D pipeline produces a real, well-formed model end to end.');
}

main().catch((err) => {
	console.error('✗ unexpected error:', err?.message || err);
	process.exit(1);
});
