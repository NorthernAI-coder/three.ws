#!/usr/bin/env node
/**
 * Compresses the authored "space smugglers club house" GLB into the runtime
 * asset the /club entrance scene loads (src/club-entrance.js). The raw export
 * is ~21 MB — far too heavy to stream behind the cover-charge door while a
 * visitor waits in line — so we run the same GLB → Meshopt + WebP pipeline the
 * rest of the venue assets use:
 *
 *   weld → prune → dedup → resize+WebP textures → quantize → Meshopt
 *
 * The runtime GLTFLoader (src/loaders/gltf.js) already wires the Meshopt
 * decoder + EXT_texture_webp, so the output drops straight in with no loader
 * changes. Re-run after re-exporting the source model:
 *
 *   npm run build:club-entrance-venue
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
	weld,
	prune,
	dedup,
	quantize,
	textureCompress,
	meshopt,
} from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const SRC = resolve(ROOT, 'space_smugglers_club_house_-_dark_version.glb');
const OUT_DIR = resolve(ROOT, 'public/club/venue');
const OUT = resolve(OUT_DIR, 'space-smugglers-clubhouse.glb');

const MAX_TEXTURE = 2048;

async function main() {
	if (!existsSync(SRC)) {
		throw new Error(`source GLB not found: ${SRC}`);
	}

	await MeshoptEncoder.ready;

	const io = new NodeIO()
		.registerExtensions(ALL_EXTENSIONS)
		.registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

	const before = statSync(SRC).size;
	const doc = await io.read(SRC);

	await doc.transform(
		weld(),
		prune(),
		dedup(),
		textureCompress({
			encoder: sharp,
			targetFormat: 'webp',
			resize: [MAX_TEXTURE, MAX_TEXTURE],
			quality: 82,
		}),
		quantize({ pattern: /.*/, quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
		meshopt({ encoder: MeshoptEncoder, level: 'high' }),
	);

	mkdirSync(OUT_DIR, { recursive: true });
	const glb = await io.writeBinary(doc);
	writeFileSync(OUT, glb);

	const after = statSync(OUT).size;
	const mb = (n) => (n / 1024 / 1024).toFixed(2);
	console.log(`club entrance venue: ${mb(before)} MB → ${mb(after)} MB`);
	console.log(`wrote ${OUT}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
