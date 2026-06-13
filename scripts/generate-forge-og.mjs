#!/usr/bin/env node
/**
 * Render the Forge-specific Open Graph card → public/og/forge-og.png (1200×630).
 *
 * The card is composed as SVG (dark stage, wireframe gem, prompt pill) and
 * rasterized with sharp, matching the /forge page's #080814 theme. Re-run after
 * any copy change:  node scripts/generate-forge-og.mjs
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'og');
const outFile = path.join(outDir, 'forge-og.png');

const FONT = `system-ui, -apple-system, 'Segoe UI', 'DejaVu Sans', sans-serif`;

// A low-poly gem: front-facing faceted outline, drawn as strokes so it reads
// as "3D wireframe" at thumbnail size.
const gem = `
	<g transform="translate(880,315)" stroke="#ffffff" fill="none" stroke-linejoin="round">
		<g opacity="0.92" stroke-width="2.5">
			<polygon points="0,-150 130,-52 80,118 -80,118 -130,-52" fill="rgba(255,255,255,0.04)"/>
			<polyline points="-130,-52 0,-10 130,-52"/>
			<polyline points="0,-150 0,-10"/>
			<polyline points="-80,118 0,-10 80,118"/>
		</g>
		<g opacity="0.25" stroke-width="1.5">
			<polyline points="-130,-52 -36,-86 0,-150"/>
			<polyline points="130,-52 36,-86 0,-150"/>
			<polyline points="-36,-86 36,-86"/>
		</g>
		<circle cx="0" cy="-10" r="3.5" fill="#ffffff" stroke="none" opacity="0.9"/>
	</g>`;

const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
	<defs>
		<radialGradient id="glow" cx="72%" cy="48%" r="62%">
			<stop offset="0%" stop-color="#1d1d3a"/>
			<stop offset="55%" stop-color="#0c0c1e"/>
			<stop offset="100%" stop-color="#080814"/>
		</radialGradient>
		<linearGradient id="pill" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0%" stop-color="rgba(255,255,255,0.10)"/>
			<stop offset="100%" stop-color="rgba(255,255,255,0.04)"/>
		</linearGradient>
	</defs>

	<rect width="1200" height="630" fill="url(#glow)"/>

	<!-- faint floor grid under the gem -->
	<g stroke="#ffffff" opacity="0.07">
		${Array.from({ length: 7 }, (_, i) => `<line x1="${640 + i * 80}" y1="470" x2="${560 + i * 96}" y2="630"/>`).join('\n\t\t')}
		<line x1="620" y1="500" x2="1200" y2="500"/>
		<line x1="600" y1="560" x2="1200" y2="560"/>
	</g>

	${gem}

	<!-- eyebrow -->
	<text x="84" y="148" font-family="${FONT}" font-size="26" letter-spacing="6" fill="#9b9bb4">FORGE — TEXT → 3D</text>

	<!-- headline -->
	<text x="80" y="248" font-family="${FONT}" font-size="76" font-weight="700" fill="#ffffff" letter-spacing="-1">Type a prompt.</text>
	<text x="80" y="338" font-family="${FONT}" font-size="76" font-weight="700" fill="#ffffff" letter-spacing="-1">Get a 3D model.</text>

	<!-- prompt pill -->
	<g>
		<rect x="80" y="396" rx="18" width="560" height="64" fill="url(#pill)" stroke="rgba(255,255,255,0.22)"/>
		<text x="108" y="437" font-family="${FONT}" font-size="26" fill="#cfcfe2">a brass steampunk owl, full body</text>
		<rect x="556" y="412" width="3" height="32" fill="#ffffff" opacity="0.85"/>
		<circle cx="612" cy="428" r="17" fill="#ffffff"/>
		<path d="M605 428h13m-5 -6 6 6-6 6" stroke="#080814" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
	</g>

	<!-- footer -->
	<text x="84" y="556" font-family="${FONT}" font-size="30" font-weight="600" fill="#ffffff">three.ws/forge</text>
	<text x="84" y="592" font-family="${FONT}" font-size="22" fill="#8a8aa3">Free draft tier · image &amp; sketch too · download the GLB</text>
</svg>`;

await mkdir(outDir, { recursive: true });
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(outFile);
const { size } = await sharp(outFile).metadata().then((m) => ({ size: `${m.width}×${m.height}` }));
console.log(`wrote ${path.relative(root, outFile)} (${size})`);
