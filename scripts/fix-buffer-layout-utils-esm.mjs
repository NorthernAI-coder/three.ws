// Patches @solana/buffer-layout-utils after install to repair its broken ESM build.
//
// 0.2.0 ships an INCOMPLETE `lib/esm/` directory: `base.mjs`, `bigint.mjs`, and
// `decimal.mjs` are present, but `index.mjs`, `native.mjs`, and `web3.mjs` never
// made it into the tarball (only their `.js.map` files did). The package's
// `exports.import` condition and `module` field still advertise the missing
// `./lib/esm/index.mjs`, so any ESM consumer fails with:
//
//   Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../lib/esm/index.mjs'
//   imported from .../@solana/spl-token/lib/esm/instructions/amountToUiAmount.js
//
// @solana/spl-token is imported all over the agent-wallet / pump trade paths
// (and exercised by `npm run smoke:agent-wallet`), so this breaks the whole ESM
// graph that touches SPL token instructions.
//
// Fix: redirect the `import` condition (and drop the dangling `module` field) to
// the complete CJS build. `lib/cjs/index.js` re-exports everything via the TS
// `__exportStar` pattern, which both Node's cjs-module-lexer and Vite/esbuild
// interop statically resolve into named exports (`u64`, `publicKey`, `bool`, …),
// so `import { u64 } from '@solana/buffer-layout-utils'` works under raw Node and
// in the bundler. Same approach as fix-x402-extensions-esm.mjs.
//
// Idempotent (re-points only when still aimed at the missing .mjs); survives
// `npm ci` via postinstall.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const repo = dirname(root);
const pkgPath = join(repo, 'node_modules/@solana/buffer-layout-utils/package.json');

if (!existsSync(pkgPath)) {
	console.log('[fix-buffer-layout-utils-esm] package not installed, skipping');
	process.exit(0);
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const cjsEntry = './lib/cjs/index.js';

// The complete build is CJS; only repoint if the package still has it.
if (!existsSync(join(dirname(pkgPath), 'lib/cjs/index.js'))) {
	console.log('[fix-buffer-layout-utils-esm] cjs build missing, cannot repoint — skipping');
	process.exit(0);
}

let mutated = false;

if (pkg.exports && typeof pkg.exports === 'object' && pkg.exports.import !== cjsEntry) {
	pkg.exports.import = cjsEntry;
	mutated = true;
}

// `module` points at the missing ESM entry; bundlers that prefer it over
// `exports` would re-introduce the same broken resolution. Drop it.
if (pkg.module) {
	delete pkg.module;
	mutated = true;
}

if (mutated) {
	writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
	console.log('[fix-buffer-layout-utils-esm] redirected import→cjs (esm build is incomplete)');
} else {
	console.log('[fix-buffer-layout-utils-esm] already patched');
}
