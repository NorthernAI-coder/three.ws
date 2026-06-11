// One-off live verification for the NVIDIA TRELLIS provider (task T1.1).
//
//   node scripts/verify-nvidia-trellis.mjs "a teapot"
//
// Runs a real draft-quality text→3D generation through createNvidiaProvider,
// polls to completion, fetches the persisted R2 GLB, and asserts it is a valid
// binary glTF (the `glTF` magic + a non-trivial size). Prints observed latency.
// No scratch files are written; nothing is committed by this script.

import { config as dotenv } from 'dotenv';
dotenv({ path: new URL('../.env.local', import.meta.url) });

const { createNvidiaProvider } = await import('../api/_providers/nvidia.js');

const prompt = process.argv[2] || 'a teapot';
const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 120; // ~5 min ceiling

const started = Date.now();
const provider = createNvidiaProvider();

console.log(`[trellis] submitting text→3D draft: "${prompt}"`);
const submitted = await provider.textTo3d({ prompt, tier: { id: 'draft' } });
console.log('[trellis] submit result:', submitted);

let glbUrl = submitted.resultGlbUrl || null;
if (!glbUrl) {
	if (!submitted.taskId) throw new Error('submit returned neither a GLB url nor a task id');
	for (let i = 0; i < MAX_POLLS; i++) {
		await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
		const s = await provider.status({ taskId: submitted.taskId });
		console.log(`[trellis] poll ${i + 1}: ${s.status}${s.error ? ' — ' + s.error : ''}`);
		if (s.status === 'done') {
			glbUrl = s.resultGlbUrl;
			break;
		}
		if (s.status === 'failed') throw new Error(`generation failed: ${s.error}`);
	}
	if (!glbUrl) throw new Error('timed out waiting for TRELLIS completion');
}

const elapsedMs = Date.now() - started;
console.log(`[trellis] GLB persisted to R2: ${glbUrl}`);
console.log(`[trellis] end-to-end latency: ${(elapsedMs / 1000).toFixed(1)}s`);

// Validate the persisted asset is a real binary glTF.
const res = await fetch(glbUrl);
if (!res.ok) throw new Error(`R2 GLB fetch returned ${res.status}`);
const buf = Buffer.from(await res.arrayBuffer());
const magic = buf.subarray(0, 4).toString('ascii');
if (magic !== 'glTF') throw new Error(`not a binary glTF — magic was "${magic}"`);
if (buf.byteLength < 1024) throw new Error(`GLB suspiciously small: ${buf.byteLength} bytes`);
console.log(`[trellis] ✓ valid GLB — magic "glTF", version ${buf.readUInt32LE(4)}, ${buf.byteLength} bytes`);
console.log('[trellis] PASS');
