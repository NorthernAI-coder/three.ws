#!/usr/bin/env node
/**
 * Compresses the authored entrance environments into the runtime assets the
 * /club entrance journey loads (src/club-entrance.js):
 *
 *   alleyway.glb                          → public/club/venue/alleyway.glb
 *   space_smugglers_club_house_-_dark…glb → public/club/venue/space-smugglers-clubhouse.glb
 *
 * Both raw exports are ~17–21 MB — far too heavy to stream while a visitor
 * stands at the door — so we run each through the same GLB → Meshopt + WebP
 * pipeline the rest of the venue assets use:
 *
 *   weld → prune → dedup → resize+WebP textures → quantize → Meshopt
 *
 * The runtime GLTFLoader (src/loaders/gltf.js) already wires the Meshopt
 * decoder + EXT_texture_webp, so the output drops straight in with no loader
 * changes. Re-run after re-exporting a source model:
 *
 *   npm run build:club-entrance-venue
 */

import { writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, prune, dedup, quantize, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'public/club/venue');

const MAX_TEXTURE = 2048;

// Source export → runtime filename. The outside alley you land in, then the
// interior you walk through after paying the cover.
const TARGETS = [
	{ src: 'alleyway.glb', out: 'alleyway.glb' },
	{ src: 'space_smugglers_club_house_-_dark_version.glb', out: 'space-smugglers-clubhouse.glb' },
	// Gallery corridor you walk through before reaching the club door.
	{ src: 'tour.glb', out: 'tour.glb' },
];

const mb = (n) => (n / 1024 / 1024).toFixed(2);

// Drop meshes the artist flagged as junk (`xxx`, `DO NOT RENDER`) — e.g. the
// tour's giant ground disc that otherwise inflates the footprint and breaks the
// runtime's floor/axis normalisation.
function stripJunkMeshes(doc) {
	const junk = /xxx|do not render/i;
	let removed = 0;
	for (const mesh of doc.getRoot().listMeshes()) {
		if (junk.test(mesh.getName() || '')) { mesh.dispose(); removed++; }
	}
	return removed;
}

async function compress(io, srcPath, outPath) {
	const before = statSync(srcPath).size;
	const doc = await io.read(srcPath);

	const stripped = stripJunkMeshes(doc);
	if (stripped) console.log(`  stripped ${stripped} junk mesh(es)`);

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

	const glb = await io.writeBinary(doc);
	writeFileSync(outPath, glb);
	const after = statSync(outPath).size;
	console.log(`${outPath.replace(ROOT + '/', '')}: ${mb(before)} MB → ${mb(after)} MB`);
}

async function main() {
	await MeshoptEncoder.ready;

	const io = new NodeIO()
		.registerExtensions(ALL_EXTENSIONS)
		.registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

	mkdirSync(OUT_DIR, { recursive: true });

	for (const { src, out } of TARGETS) {
		const srcPath = resolve(ROOT, src);
		if (!existsSync(srcPath)) {
			console.warn(`skip — source not found: ${src}`);
			continue;
		}
		await compress(io, srcPath, resolve(OUT_DIR, out));
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
