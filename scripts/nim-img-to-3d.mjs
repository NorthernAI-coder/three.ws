#!/usr/bin/env node
// Image→3D against the live self-hosted TRELLIS NIM (large:image) on GCP.
// Hits the box directly (firewall open on :8000) at MAX fidelity and saves the
// GLB locally for the auto-orbit viewer.
//
//   node scripts/nim-img-to-3d.mjs path/to/photo.jpg [steps]
//
// Quality knobs (verified live against the NIM's /openapi.json Object3DRequest):
//   • ss_sampling_steps / slat_sampling_steps — TRELLIS default 25, ceiling 50.
//     Too few sparse-structure steps leave HOLES in the mesh; we max both at 50.
//   • slat_cfg_scale — how strictly the structured-latent diffusion adheres to
//     the input photo. The NIM default (3.0) is low, which is why output looks
//     CARTOONISH (the model invents smooth, toy-like detail). We raise it so the
//     reconstruction stays faithful to the real texture/shape in the photo.
//   • ss_cfg_scale — sparse-structure guidance; kept at the tuned default (7.5).
// All three are env-overridable (STEPS / SLAT_CFG / SS_CFG) for live tuning.
// Note: this NIM exposes NO mesh_simplify / texture_size — fidelity comes from
// steps + cfg + a sharp, evenly-lit input photo (the biggest lever of all).
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

const NIM = process.env.NIM_URL || 'http://104.154.74.37:8000';
const imgPath = process.argv[2];
// Max-fidelity defaults; CLI arg or env can override.
const steps = Number(process.argv[3]) || Number(process.env.STEPS) || 50;
const slatCfg = Number(process.env.SLAT_CFG) || 5.0; // ↑ from NIM default 3.0 → less cartoonish
const ssCfg = Number(process.env.SS_CFG) || 7.5; // tuned default
if (!imgPath) { console.error('usage: node scripts/nim-img-to-3d.mjs <image> [steps]'); process.exit(1); }

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

async function main() {
	const buf = await readFile(imgPath);
	const mime = MIME[extname(imgPath).toLowerCase()] || 'image/png';
	const dataUri = `data:${mime};base64,${buf.toString('base64')}`;
	console.log(`→ NIM image→3D  ${NIM}  steps=${steps}/${steps}  slat_cfg=${slatCfg}  ss_cfg=${ssCfg}  input=${imgPath} (${(buf.length / 1024).toFixed(0)} KB)`);

	const t0 = Date.now();
	const res = await fetch(`${NIM}/v1/infer`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept: 'application/json' },
		body: JSON.stringify({
			mode: 'image',
			image: dataUri,
			ss_sampling_steps: steps,
			slat_sampling_steps: steps,
			ss_cfg_scale: ssCfg,
			slat_cfg_scale: slatCfg,
			output_format: 'glb',
		}),
		signal: AbortSignal.timeout(240_000),
	});
	if (!res.ok) { console.error(`✖ NIM ${res.status}: ${(await res.text()).slice(0, 300)}`); process.exit(1); }

	const data = await res.json();
	const a0 = data?.artifacts?.[0];
	if (a0?.finishReason === 'CONTENT_FILTERED') {
		console.error('✖ NIM content filter flagged this image — try a clearer photo of an inanimate object.');
		process.exit(1);
	}
	const b64 = a0?.base64;
	if (!b64) { console.error('✖ no GLB returned:', JSON.stringify(data).slice(0, 300)); process.exit(1); }

	const glb = Buffer.from(b64, 'base64');
	await mkdir('demo', { recursive: true });
	const name = basename(imgPath, extname(imgPath)).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
	const out = `demo/${name}.glb`;
	await writeFile(out, glb);
	const secs = ((Date.now() - t0) / 1000).toFixed(1);
	console.log(`✓ ${(glb.length / 1024).toFixed(0)} KB GLB in ${secs}s → ${out}`);
	console.log(`\nView:  http://localhost:4545/?model=/${out}`);
}
main().catch((e) => { console.error('✖', e.message); process.exit(1); });
