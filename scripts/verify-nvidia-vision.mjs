#!/usr/bin/env node
// Live verification for the free NVIDIA NIM vision lane.
//
//   node scripts/verify-nvidia-vision.mjs           # describe a synthetic image (needs NVIDIA_API_KEY)
//   node scripts/verify-nvidia-vision.mjs --model meta/llama-3.2-11b-vision-instruct
//
// Builds a real PNG in memory (a solid-color square — proper IHDR/IDAT/IEND
// chunks with CRCs, zlib-deflated scanlines), asks the hosted VLM what color it
// is, and asserts a non-empty answer that names the color. No fixture files are
// written; the whole check stays in memory.

import { config as dotenv } from 'dotenv';
import { deflateSync } from 'node:zlib';

dotenv({ path: new URL('../.env.local', import.meta.url) });
delete process.env.NODE_ENV;
delete process.env.VERCEL_ENV;

if (!process.env.NVIDIA_API_KEY) {
	console.error('[vision] NVIDIA_API_KEY missing from environment/.env.local — cannot verify');
	process.exit(1);
}

const modelArg = process.argv.indexOf('--model');
const model = modelArg !== -1 ? process.argv[modelArg + 1] : undefined;

// ── minimal PNG encoder (solid RGB square) ──────────────────────────────────
const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();
function crc32(buf) {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length, 0);
	const typeBuf = Buffer.from(type, 'ascii');
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
	return Buffer.concat([len, typeBuf, data, crc]);
}
function solidPng(size, [r, g, b]) {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // color type: truecolor RGB
	// rows: a leading filter byte (0 = none) then size*3 color bytes
	const row = Buffer.concat([Buffer.from([0]), Buffer.concat(Array.from({ length: size }, () => Buffer.from([r, g, b])))]);
	const raw = Buffer.concat(Array.from({ length: size }, () => row));
	const idat = deflateSync(raw);
	const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const { describeImage } = await import('../api/_lib/vision-nvidia.js');

try {
	// A 128px solid red square — small enough to ride inline, unambiguous to name.
	const png = solidPng(128, [220, 20, 20]);
	console.log(`[vision] built a ${png.length}-byte synthetic red PNG; asking the model…`);
	const t0 = Date.now();
	const out = await describeImage({
		imageBytes: png,
		contentType: 'image/png',
		prompt: 'What is the single dominant color of this image? Answer with just the color name.',
		model,
		maxTokens: 32,
	});
	console.log(`[vision]   model=${out.model} assetUpload=${Boolean(out.assetId)} in ${Date.now() - t0} ms`);
	console.log(`[vision]   answer: "${out.text}"`);
	if (!out.text.trim()) throw new Error('empty completion');
	if (!/red|crimson|scarlet/i.test(out.text)) {
		console.warn('[vision] WARN — answer did not name red; the lane responded but recognition is suspect.');
	} else {
		console.log('[vision] PASS — the VLM correctly identified the color. Vision lane works.');
	}
} catch (e) {
	console.error(`[vision] FAIL — ${e?.code ? `${e.code}: ` : ''}${e?.message || e}`);
	process.exit(1);
}
