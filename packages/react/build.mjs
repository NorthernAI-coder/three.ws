#!/usr/bin/env node
// Build @three-ws/react with esbuild (same toolchain as the other SDKs) —
// ESM + CJS bundles from src/index.js, react left external, plus the
// hand-written type declarations copied into dist/.
import { build } from 'esbuild';
import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, 'dist');
mkdirSync(outDir, { recursive: true });

const common = {
	entryPoints: [resolve(here, 'src/index.js')],
	bundle: true,
	platform: 'browser',
	target: 'es2020',
	jsx: 'automatic',
	external: ['react', 'react-dom', 'react/jsx-runtime'],
	logLevel: 'info',
};

await build({ ...common, format: 'esm', outfile: resolve(outDir, 'index.esm.js') });
await build({ ...common, format: 'cjs', outfile: resolve(outDir, 'index.cjs.js') });
copyFileSync(resolve(here, 'src/index.d.ts'), resolve(outDir, 'index.d.ts'));
console.log('[react] built dist/index.esm.js, dist/index.cjs.js, dist/index.d.ts');
