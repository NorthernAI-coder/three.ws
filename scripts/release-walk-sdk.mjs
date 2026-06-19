#!/usr/bin/env node
// Ship @three-ws/walk to npm and/or stage it for its own external repo.
// =====================================================================
// The package lives in the monorepo (walk-sdk/) and stays the source of truth.
// This script handles the two ways it leaves the monorepo, per the promotion
// path in STRUCTURE.md:
//
//   1. npm  — build the self-contained dist and publish (the dist already
//             inlines the shared retargeting engine; only `three` stays a peer).
//   2. repo — produce a STANDALONE copy of the source where the single seam
//             that reaches back into the monorepo (src/internal/runtime.js →
//             ../../../src/animation-manager.js) is replaced with a vendored
//             copy, so the result builds on its own. Then print the exact
//             `git subtree split` commands to push it to an external remote.
//
// Usage:
//   node scripts/release-walk-sdk.mjs                 # build + npm publish --dry-run (default, safe)
//   node scripts/release-walk-sdk.mjs --publish       # actually `npm publish`
//   node scripts/release-walk-sdk.mjs --vendor <dir>  # write a standalone source tree to <dir>
//   node scripts/release-walk-sdk.mjs --split <remote-url>  # vendor + show subtree-split push commands

import { execFileSync } from 'node:child_process';
import {
	cpSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
	existsSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = resolve(repoRoot, 'walk-sdk');
const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueAfter = (flag) => {
	const i = args.indexOf(flag);
	return i >= 0 ? args[i + 1] : null;
};

function run(cmd, cmdArgs, cwd = repoRoot) {
	console.log(`$ ${cmd} ${cmdArgs.join(' ')}`);
	execFileSync(cmd, cmdArgs, { cwd, stdio: 'inherit' });
}

// ── 1. Build the publishable dist ─────────────────────────────────────────────
function build() {
	run('npm', ['run', 'build', '--prefix', 'walk-sdk']);
	const dist = resolve(pkgDir, 'dist', 'index.mjs');
	if (!existsSync(dist)) throw new Error('build did not produce dist/index.mjs');
	console.log('✓ built walk-sdk/dist');
}

// ── 2. npm publish ────────────────────────────────────────────────────────────
function publish({ dryRun }) {
	const flags = ['publish', '--access', 'public'];
	if (dryRun) flags.push('--dry-run');
	run('npm', flags, pkgDir);
	console.log(dryRun ? '✓ dry-run publish OK (no --publish given)' : '✓ published @three-ws/walk');
}

// ── 3. Vendor the monorepo seam into a standalone source tree ──────────────────
// runtime.js re-exports AnimationManager from ../../../src/animation-manager.js,
// which in turn imports ./glb-canonicalize.js, ./animation-retarget.js and
// ./shared/log.js. We copy all four into the standalone tree and rewrite the
// imports to resolve locally, so the result has no link back to the monorepo.
function vendor(targetDir) {
	const dest = resolve(process.cwd(), targetDir);
	console.log(`Staging standalone @three-ws/walk → ${dest}`);
	rmSync(dest, { recursive: true, force: true });
	mkdirSync(dest, { recursive: true });

	for (const entry of ['src', 'types', 'README.md', 'LICENSE', 'package.json', 'build.mjs']) {
		cpSync(resolve(pkgDir, entry), resolve(dest, entry), { recursive: true });
	}

	const vendorDir = resolve(dest, 'src/internal/vendored');
	mkdirSync(vendorDir, { recursive: true });
	// Full transitive closure of src/animation-manager.js (the only seam back
	// into the monorepo). Keep this in sync if that graph grows.
	const seamFiles = {
		'animation-manager.js': resolve(repoRoot, 'src/animation-manager.js'),
		'animation-retarget.js': resolve(repoRoot, 'src/animation-retarget.js'),
		'animation-canonical-rest.js': resolve(repoRoot, 'src/animation-canonical-rest.js'),
		'glb-canonicalize.js': resolve(repoRoot, 'src/glb-canonicalize.js'),
		'log.js': resolve(repoRoot, 'src/shared/log.js'),
	};
	for (const [name, srcPath] of Object.entries(seamFiles)) {
		let code = readFileSync(srcPath, 'utf8');
		// Rewrite the shared/log import to the flattened vendored copy.
		code = code.replace(/from ['"]\.\/shared\/log\.js['"]/g, "from './log.js'");
		writeFileSync(resolve(vendorDir, name), code);
	}

	// Replace the seam: runtime.js now re-exports the vendored copy.
	writeFileSync(
		resolve(dest, 'src/internal/runtime.js'),
		`// Standalone build: the shared retargeting engine is vendored alongside.\n` +
			`export { AnimationManager } from './vendored/animation-manager.js';\n`,
	);

	console.log('✓ vendored seam (animation-manager + retarget + canonicalize + log)');
	console.log(`  Next: cd ${dest} && npm install three && npm run build`);
	return dest;
}

// ── 4. Subtree split guidance ─────────────────────────────────────────────────
function splitGuidance(remote) {
	console.log('\nTo push walk-sdk/ to its own repo, preserving history:\n');
	console.log('  git subtree split --prefix=walk-sdk -b walk-sdk-split');
	console.log('  cd .. && mkdir walk-sdk-repo && cd walk-sdk-repo');
	console.log('  git init && git pull ../three.ws walk-sdk-split');
	console.log(`  git remote add origin ${remote || '<external-repo-url>'}`);
	console.log('  git push -u origin main\n');
	console.log('Then vendor the seam in the new repo (so it builds standalone):');
	console.log('  node ../three.ws/scripts/release-walk-sdk.mjs --vendor .\n');
	console.log('NOTE: an external repo must already exist; this script never creates remote repos.');
}

// ── Dispatch ──────────────────────────────────────────────────────────────────
try {
	const vendorTarget = valueAfter('--vendor');
	const splitRemote = valueAfter('--split');

	if (vendorTarget) {
		vendor(vendorTarget);
	} else if (has('--split')) {
		build();
		vendor(resolve(repoRoot, '..', 'walk-sdk-standalone'));
		splitGuidance(splitRemote);
	} else {
		build();
		publish({ dryRun: !has('--publish') });
		console.log('\nFor an external repo, run with --split <remote-url>.');
	}
} catch (err) {
	console.error('✗ release failed:', err.message);
	process.exit(1);
}
