#!/usr/bin/env node
// Build the OpenAI Apps SDK 3D Studio viewer component.
//
// Outputs (both inline the same self-contained IIFE — three.js + GLTFLoader +
// OrbitControls + RoomEnvironment + the viewer; no external <script>):
//   • public/apps-sdk/studio-viewer.bundle.js
//       the bundle, read at runtime by api/_mcp3d/studio-viewer-resource.js and
//       inlined into the `ui://widget/studio-viewer.html` skybridge resource.
//   • public/apps-sdk/studio-viewer.html
//       a standalone page that inlines the bundle and reads ?glb=<url> — used
//       for local verification and the "open in a normal browser" fallback.
//
// Run via: node scripts/build-apps-sdk-viewer.mjs   (npm run build:apps-sdk-viewer)

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync, mkdirSync, statSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ENTRY = resolve(ROOT, 'apps-sdk/studio-viewer/src.js');
const OUT_DIR = resolve(ROOT, 'public/apps-sdk');
const OUT_BUNDLE = resolve(OUT_DIR, 'studio-viewer.bundle.js');
const OUT_HTML = resolve(OUT_DIR, 'studio-viewer.html');

mkdirSync(OUT_DIR, { recursive: true });

const result = await build({
	entryPoints: [ENTRY],
	bundle: true,
	format: 'iife',
	platform: 'browser',
	target: ['es2020'],
	minify: true,
	legalComments: 'none',
	write: false,
	logLevel: 'info',
	define: { 'process.env.NODE_ENV': '"production"' },
});

const [bundle] = result.outputFiles;
const banner =
	'/* three.ws 3D Studio — Apps SDK viewer bundle (three.js + GLTFLoader + viewer).\n' +
	' * Built from apps-sdk/studio-viewer/src.js. Do not edit by hand.\n' +
	' * Regenerate with: npm run build:apps-sdk-viewer */\n';
writeFileSync(OUT_BUNDLE, banner + bundle.text);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>three.ws 3D Studio — viewer</title>
<style>html,body{margin:0;height:100%;background:#0a0c10;overflow:hidden}</style>
</head>
<body>
<div id="studio-stage"></div>
<script>${bundle.text}</script>
</body>
</html>
`;
writeFileSync(OUT_HTML, html);

console.log(`✓ ${OUT_BUNDLE}\n  ${(statSync(OUT_BUNDLE).size / 1024).toFixed(1)} KB`);
console.log(`✓ ${OUT_HTML}\n  ${(statSync(OUT_HTML).size / 1024).toFixed(1)} KB`);
