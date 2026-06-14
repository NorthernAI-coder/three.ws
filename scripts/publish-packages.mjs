#!/usr/bin/env node
// Publish three.ws npm library packages (not MCP servers — see
// publish-mcp-servers.mjs for those), idempotently.
//
// For each package below it:
//   1. reads the local version from package.json;
//   2. checks that version against npm — if already published, skips;
//   3. otherwise runs the package build (prepublishOnly handles this too) and
//      `npm publish --access public`.
//
// Requires `npm whoami` to succeed (or NPM_TOKEN in the environment).
//
// Usage:
//   node scripts/publish-packages.mjs --dry-run        # report only
//   node scripts/publish-packages.mjs                  # publish what's missing
//   node scripts/publish-packages.mjs --only react     # one package by key

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Every publishable library package in this repo.
const PACKAGES = [{ key: 'react', dir: 'packages/react' }];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? (args[onlyIdx + 1] || '').split(',').filter(Boolean) : null;

function readPkg(dir) {
	return JSON.parse(readFileSync(resolve(root, dir, 'package.json'), 'utf8'));
}

function publishedVersions(name) {
	try {
		const out = execFileSync('npm', ['view', name, 'versions', '--json'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		});
		const parsed = JSON.parse(out);
		return Array.isArray(parsed) ? parsed : [parsed];
	} catch {
		return []; // 404 → never published
	}
}

let published = 0;
let skipped = 0;
let failed = 0;

for (const entry of PACKAGES) {
	if (only && !only.includes(entry.key)) continue;
	const pkg = readPkg(entry.dir);
	const { name, version } = pkg;
	const existing = publishedVersions(name);

	if (existing.includes(version)) {
		console.log(`• ${name}@${version} — already on npm, skipping`);
		skipped++;
		continue;
	}

	if (dryRun) {
		console.log(`• ${name}@${version} — would publish (dry run)`);
		continue;
	}

	console.log(`• ${name}@${version} — publishing…`);
	try {
		execFileSync('npm', ['publish', '--access', 'public'], {
			cwd: resolve(root, entry.dir),
			stdio: 'inherit',
		});
		console.log(`  ✓ published ${name}@${version}`);
		published++;
	} catch (err) {
		console.error(`  ✗ failed to publish ${name}@${version}: ${err.message}`);
		failed++;
	}
}

console.log(`\nDone — ${published} published, ${skipped} skipped, ${failed} failed.`);
process.exit(failed ? 1 : 0);
