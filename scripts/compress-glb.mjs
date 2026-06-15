#!/usr/bin/env node
// scripts/compress-glb.mjs — shrink a glTF/GLB for the web.
//
// Sketchfab and DCC exports ship full-res PNG/JPEG textures that dominate the
// file size while the geometry is tiny. This pass:
//   • prune + dedup   — drop unused accessors/materials/textures, merge dupes
//   • textureCompress — resize textures to a max edge and re-encode to WebP
//                       (alpha-safe, ~4-8× smaller than full-res PNG) via sharp
//   • flatten/weld    — tidy the scene graph and merge coincident vertices
//
// WebP is read natively by three.js GLTFLoader (EXT_texture_webp). Geometry is
// left uncompressed (no Draco) so the asset loads without a decoder dependency
// — these models are texture-bound, not vertex-bound.
//
// Usage:
//   node scripts/compress-glb.mjs <input.glb> <output.glb> [maxTexturePx=1024] [quality=80]

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, flatten, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import { statSync } from 'node:fs';

const [input, output, maxPxArg, qualityArg] = process.argv.slice(2);
if (!input || !output) {
	console.error('Usage: node scripts/compress-glb.mjs <input.glb> <output.glb> [maxTexturePx=1024] [quality=80]');
	process.exit(1);
}
const maxPx = Number(maxPxArg) || 1024;
const quality = Number(qualityArg) || 80;

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2) + ' MB';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

console.log(`[compress-glb] reading ${input} (${mb(statSync(input).size)})`);
const doc = await io.read(input);

await doc.transform(
	prune(),
	dedup(),
	flatten(),
	weld(),
	textureCompress({
		encoder: sharp,
		targetFormat: 'webp',
		resize: [maxPx, maxPx],
		quality,
	}),
	prune(),
);

await io.write(output, doc);
console.log(`[compress-glb] wrote ${output} (${mb(statSync(output).size)}) — textures ≤${maxPx}px webp q${quality}`);
