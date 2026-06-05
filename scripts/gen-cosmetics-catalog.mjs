// Generate the static cosmetics catalog mirror from the canonical source module
// (api/_lib/cosmetics.js). The shop fetches /api/cosmetics/catalog first; this
// static file at /cosmetics/catalog.json is the CDN-served fallback (and the
// dev source, where /api/* proxies to prod and the new endpoint isn't live yet).
//
// Run after changing the catalog:  node scripts/gen-cosmetics-catalog.mjs

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildCatalog, RARITIES } from '../api/_lib/cosmetics.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'cosmetics');
const outFile = join(outDir, 'catalog.json');

const payload = { items: buildCatalog(), rarities: RARITIES };

await mkdir(outDir, { recursive: true });
await writeFile(outFile, JSON.stringify(payload, null, '\t') + '\n');
console.log(`wrote ${outFile} (${payload.items.length} items)`);
