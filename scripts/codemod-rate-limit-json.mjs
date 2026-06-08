// Second-pass codemod: migrate the json(res, 429, {...rate_limited...}) family
// (mostly the forge endpoints) to the rateLimited() helper so they emit the
// same Retry-After + RateLimit-* headers as the error()-based sites. Idempotent.
//
//   node scripts/codemod-rate-limit-json.mjs [--dry]
//
// Only transforms LOCAL-limiter sites — those whose body is exactly
// { error: 'rate_limited', [message: '…',] retry_after: Math.ceil((VAR.reset - Date.now())/1000) }
// guarded by `if (!VAR.success)`. Upstream-passthrough 429s (no VAR.reset, a
// distinct error code, or extra fields) are left untouched and reported.

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const DRY = process.argv.includes('--dry');

const files = execSync(`grep -rln "json(res, 429" api --include="*.js"`, { encoding: 'utf8' })
	.trim()
	.split('\n')
	.filter(Boolean);

// Block form (multi-line) and one-line form. `message` is optional; both must
// reference the same VAR in the retry_after expression so we know it's a local
// limiter result.
const BLOCK_RE =
	/return json\(\s*res\s*,\s*429\s*,\s*\{\s*error:\s*'rate_limited'\s*,\s*(?:message:\s*('[^']*'|"[^"]*")\s*,\s*)?retry_after:\s*Math\.ceil\(\(\s*(\w+)\.reset\s*-\s*Date\.now\(\)\s*\)\s*\/\s*1000\)\s*,?\s*\}\s*\)/g;

let changedFiles = 0;
let changedSites = 0;
const skipped = [];

for (const file of files) {
	let src = readFileSync(file, 'utf8');
	let touched = false;

	src = src.replace(BLOCK_RE, (_m, msg, varName) => {
		touched = true;
		changedSites++;
		const args = ['res', varName];
		if (msg) args.push(msg);
		return `rateLimited(${args.join(', ')})`;
	});

	if (!touched) {
		skipped.push(`${file} (only non-local-limiter 429s)`);
		continue;
	}

	if (!/\brateLimited\b/.test(src.match(/import[\s\S]*?from\s*'[^']*_lib\/http\.js'/)?.[0] || '')) {
		const importRe = /import\s*\{([\s\S]*?)\}\s*from\s*'([^']*_lib\/http\.js)'/;
		const im = src.match(importRe);
		if (im) {
			src = src.replace(importRe, `import {${im[1].replace(/\s*$/, '')}, rateLimited } from '${im[2]}'`);
		} else {
			skipped.push(`${file} (no _lib/http.js import to extend)`);
		}
	}

	if (!DRY) writeFileSync(file, src);
	changedFiles++;
}

console.log(`${DRY ? '[dry] ' : ''}rewrote ${changedSites} site(s) across ${changedFiles} file(s)`);
if (skipped.length) {
	console.log(`\nuntouched (${skipped.length}) — verify these are upstream-passthrough only:`);
	for (const s of skipped) console.log('  ' + s);
}
