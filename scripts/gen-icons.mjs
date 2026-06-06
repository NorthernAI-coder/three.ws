#!/usr/bin/env node
/**
 * Generate the full three.ws icon set from the canonical brand mark
 * (public/three.svg — the colorful waveform cube).
 *
 * Outputs into public/:
 *   favicon.ico            (16+32+48, PNG-encoded, transparent)
 *   favicon.svg            (copy of three.svg — crisp modern tab icon)
 *   favicon-16x16.png
 *   favicon-32x32.png
 *   apple-touch-icon.png   (180, dark rounded background)
 *   pwa-192x192.png        (maskable, dark background)
 *   pwa-512x512.png        (maskable, dark background)
 *   site.webmanifest
 *
 * Run: node scripts/gen-icons.mjs
 */
import sharp from 'sharp';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pub = resolve(root, 'public');
const SRC = resolve(pub, 'three.svg');

// Brand background for maskable / apple icons — matches <meta theme-color>.
const BG = '#050510';

const svg = await readFile(SRC);

// Render the logo (transparent) at a given size with light padding so the
// cube breathes inside the canvas instead of touching the edges.
async function renderLogo(size, padRatio = 0.0) {
	const inner = Math.round(size * (1 - padRatio * 2));
	const logo = await sharp(svg)
		.resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.png()
		.toBuffer();
	if (inner === size) return logo;
	return sharp({
		create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
	})
		.composite([{ input: logo, gravity: 'center' }])
		.png()
		.toBuffer();
}

// Logo on a dark rounded square (PWA / apple-touch). Maskable-safe: keeps the
// mark inside the safe zone with generous padding.
async function renderOnBg(size, padRatio = 0.16) {
	const radius = Math.round(size * 0.22);
	const mask = Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}"/></svg>`,
	);
	const inner = Math.round(size * (1 - padRatio * 2));
	const logo = await sharp(svg)
		.resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.png()
		.toBuffer();
	const bg = await sharp({
		create: { width: size, height: size, channels: 4, background: BG },
	})
		.composite([
			{ input: logo, gravity: 'center' },
			{ input: mask, blend: 'dest-in' },
		])
		.png()
		.toBuffer();
	return bg;
}

// Build a PNG-payload .ico from a set of square PNG buffers.
function buildIco(images) {
	const count = images.length;
	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0); // reserved
	header.writeUInt16LE(1, 2); // type: icon
	header.writeUInt16LE(count, 4);

	const entries = [];
	const payloads = [];
	let offset = 6 + count * 16;
	for (const { size, data } of images) {
		const entry = Buffer.alloc(16);
		entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 == 256)
		entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
		entry.writeUInt8(0, 2); // palette
		entry.writeUInt8(0, 3); // reserved
		entry.writeUInt16LE(1, 4); // color planes
		entry.writeUInt16LE(32, 6); // bits per pixel
		entry.writeUInt32LE(data.length, 8); // size of payload
		entry.writeUInt32LE(offset, 12); // offset
		offset += data.length;
		entries.push(entry);
		payloads.push(data);
	}
	return Buffer.concat([header, ...entries, ...payloads]);
}

// --- favicon.ico (16, 32, 48) ---
const icoSizes = [16, 32, 48];
const icoImages = await Promise.all(
	icoSizes.map(async (size) => ({ size, data: await renderLogo(size) })),
);
await writeFile(resolve(pub, 'favicon.ico'), buildIco(icoImages));

// --- standalone PNG favicons ---
await writeFile(resolve(pub, 'favicon-16x16.png'), await renderLogo(16));
await writeFile(resolve(pub, 'favicon-32x32.png'), await renderLogo(32));

// --- apple-touch + maskable PWA icons (dark background) ---
await writeFile(resolve(pub, 'apple-touch-icon.png'), await renderOnBg(180));
await writeFile(resolve(pub, 'pwa-192x192.png'), await renderOnBg(192));
await writeFile(resolve(pub, 'pwa-512x512.png'), await renderOnBg(512));

// --- modern SVG favicon (copy of canonical mark) ---
await copyFile(SRC, resolve(pub, 'favicon.svg'));

// --- web manifest ---
const manifest = {
	name: 'three.ws',
	short_name: 'three.ws',
	description: 'The 3D agent layer of the internet — living 3D AI agents you can embed anywhere.',
	start_url: '/',
	display: 'standalone',
	background_color: BG,
	theme_color: BG,
	icons: [
		{ src: '/favicon.svg', type: 'image/svg+xml', sizes: 'any' },
		{ src: '/pwa-192x192.png', type: 'image/png', sizes: '192x192', purpose: 'any maskable' },
		{ src: '/pwa-512x512.png', type: 'image/png', sizes: '512x512', purpose: 'any maskable' },
	],
};
await writeFile(resolve(pub, 'site.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');

console.log('Icon set generated from', SRC.replace(root + '/', ''));
for (const f of [
	'favicon.ico',
	'favicon.svg',
	'favicon-16x16.png',
	'favicon-32x32.png',
	'apple-touch-icon.png',
	'pwa-192x192.png',
	'pwa-512x512.png',
	'site.webmanifest',
]) {
	console.log('  public/' + f);
}
