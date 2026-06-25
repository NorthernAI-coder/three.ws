#!/usr/bin/env node
/**
 * Authors public/arena/omniology/hdri.hdr — the equirectangular HDR the
 * /arena/omniology bootstrap pre-filters through PMREMGenerator.fromEquirect-
 * angular() to drive PBR reflections on the venue materials. The HDR only
 * affects materials (scene.environment), not the visible background, which
 * stays the dark arena fog colour.
 *
 * Run via: npm run build:arena-hdri
 *
 * Why synthesise instead of shipping a Polyhaven download: the three.ws asset
 * rails (CLAUDE.md) require every committed asset to have crystal-clear
 * provenance. A locally-generated HDR is fully owned by three.ws and dedicated
 * CC0 — see public/arena/omniology/LICENSES.md. Drop a real CC0 .hdr into that
 * directory and update the LICENSES entry to upgrade fidelity later; the
 * bootstrap reads whatever `hdri.hdr` is present.
 *
 * Palette mirrors the venue: a cool blue-purple hemisphere wash, a warm key
 * glow on the +X/+Z (entry/desk) side, and a band of cyan/magenta/amber glow
 * along the −Z screen wall so chrome bezels and the desk pick up the contest
 * colours. Output is Radiance RGBE (`.hdr`), uncompressed, ~32 kB.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'public/arena/omniology');

const WIDTH = 128;
const HEIGHT = 64;

// Pack (r,g,b) float radiance into the Greg Ward RGBE convention.
function packRGBE(r, g, b) {
	const v = Math.max(r, g, b);
	if (v < 1e-32) return [0, 0, 0, 0];
	let e = Math.ceil(Math.log2(v));
	let m = v / 2 ** e;
	if (m >= 1) {
		m *= 0.5;
		e += 1;
	}
	const scale = (m * 256) / v;
	return [
		Math.min(255, Math.max(0, Math.round(r * scale))),
		Math.min(255, Math.max(0, Math.round(g * scale))),
		Math.min(255, Math.max(0, Math.round(b * scale))),
		Math.min(255, Math.max(0, e + 128)),
	];
}

// Smooth gaussian bump centred at (theta0, phi0) with falloff `width`.
function bump(theta, phi, theta0, phi0, width) {
	const dTheta = Math.atan2(Math.sin(theta - theta0), Math.cos(theta - theta0));
	const dPhi = phi - phi0;
	const d2 = dTheta * dTheta + dPhi * dPhi;
	return Math.exp(-d2 / (2 * width * width));
}

// Sample radiance for one equirectangular pixel. (u, v) in [0, 1).
//   u ↔ azimuth (theta): 0 → -π, 1 → +π   (theta 0 faces -Z, the screen wall)
//   v ↔ latitude (phi):  0 → +π/2 zenith, 1 → -π/2 nadir
function sampleRadiance(u, v) {
	const theta = (u - 0.5) * Math.PI * 2;
	const phi = (0.5 - v) * Math.PI;

	// Base ambient — very low cool wash.
	let r = 0.01;
	let g = 0.014;
	let b = 0.022;

	// Hemisphere: cool blue ceiling, near-black floor — gives PBR chrome a
	// faint tint even where no glow points.
	const hemi = 0.5 + 0.5 * Math.sin(phi);
	r += hemi * 0.024;
	g += hemi * 0.034;
	b += hemi * 0.06;

	// Warm key glow on the entry/desk side (theta ≈ +π toward +Z, high up).
	const key = bump(theta, phi, Math.PI, 0.85, 0.5);
	r += key * 2.6;
	g += key * 1.7;
	b += key * 0.95;

	// Contest-screen wall glow band (theta ≈ 0, toward −Z) — three coloured
	// pools so bezels/desk pick up cyan / magenta / amber contest light.
	const SCREEN_GLOWS = [
		{ theta: -0.42, hue: [3.0, 0.9, 2.8] }, // magenta (rim_01 side)
		{ theta: 0.0, hue: [0.7, 2.6, 3.4] }, // cyan (rim_02, centre)
		{ theta: 0.42, hue: [3.2, 1.9, 0.7] }, // amber (rim_03 side)
	];
	for (const s of SCREEN_GLOWS) {
		const w = bump(theta, phi, s.theta, 0.55, 0.26);
		r += w * s.hue[0];
		g += w * s.hue[1];
		b += w * s.hue[2];
	}

	// Recessed ceiling cove — a soft cool ring near the zenith so the floor
	// inlay and metallic floor catch an overhead sheen.
	const cove = bump(theta, phi, theta, 1.25, 0.5) * (0.4 + 0.6 * Math.cos(theta * 3));
	r += Math.max(0, cove) * 0.5;
	g += Math.max(0, cove) * 0.62;
	b += Math.max(0, cove) * 0.9;

	return [r, g, b];
}

function buildHdr() {
	const header =
		'#?RADIANCE\n' +
		'# Authored by three.ws build-arena-hdri (CC0 1.0)\n' +
		'FORMAT=32-bit_rle_rgbe\n' +
		'EXPOSURE=1.0\n' +
		'\n' +
		`-Y ${HEIGHT} +X ${WIDTH}\n`;
	const headerBuf = Buffer.from(header, 'ascii');

	const pixelBytes = Buffer.alloc(WIDTH * HEIGHT * 4);
	for (let y = 0; y < HEIGHT; y += 1) {
		for (let x = 0; x < WIDTH; x += 1) {
			const u = (x + 0.5) / WIDTH;
			const vv = (y + 0.5) / HEIGHT;
			const [r, g, b] = sampleRadiance(u, vv);
			const [R, G, B, E] = packRGBE(r, g, b);
			const idx = (y * WIDTH + x) * 4;
			pixelBytes[idx] = R;
			pixelBytes[idx + 1] = G;
			pixelBytes[idx + 2] = B;
			pixelBytes[idx + 3] = E;
		}
	}
	return Buffer.concat([headerBuf, pixelBytes]);
}

function main() {
	mkdirSync(OUT_DIR, { recursive: true });
	const buf = buildHdr();
	const outPath = resolve(OUT_DIR, 'hdri.hdr');
	writeFileSync(outPath, buf);
	console.log(`[arena-hdri] wrote hdri.hdr ${(buf.length / 1024).toFixed(1)} kB (${WIDTH}x${HEIGHT})`);
}

main();
