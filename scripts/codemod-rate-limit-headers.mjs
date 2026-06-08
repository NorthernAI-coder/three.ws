// One-off codemod: migrate hand-rolled 429 responses to the standard
// rateLimited() helper so every rate-limited response carries Retry-After +
// RateLimit-* headers. Idempotent — safe to re-run.
//
//   node scripts/codemod-rate-limit-headers.mjs          # apply
//   node scripts/codemod-rate-limit-headers.mjs --dry    # preview only
//
// Transforms single-line guards of the canonical shape:
//   if (!VAR.success) return error(res, 429, 'rate_limited', MSG[, EXTRA]);
//   return error(res, 429, 'rate_limited', MSG[, EXTRA]);   // VAR inferred from nearest prior !X.success
// into rateLimited(res, VAR[, MSG][, EXTRA]) and ensures `rateLimited` is
// imported from the file's existing _lib/http.js import. Lines whose limiter
// variable cannot be resolved are left untouched and reported.

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const DRY = process.argv.includes('--dry');

const files = execSync(`grep -rln "429, 'rate_limited'" api --include="*.js"`, {
	encoding: 'utf8',
})
	.trim()
	.split('\n')
	.filter(Boolean);

// Matches: error(res, 429, 'rate_limited', <msg>) with an optional 5th extra arg.
// <msg> is a single- or double-quoted or backtick string (no nested same-quote).
const CALL_RE =
	/error\(\s*res\s*,\s*429\s*,\s*'rate_limited'\s*,\s*('[^']*'|"[^"]*"|`[^`]*`)\s*(?:,\s*([\s\S]*?))?\)/;

let changedFiles = 0;
let changedLines = 0;
const skipped = [];

for (const file of files) {
	let src = readFileSync(file, 'utf8');
	const lines = src.split('\n');
	let touched = false;
	let lastVar = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Track the most recent `!VAR.success` guard so a bare `return error(...)`
		// on its own line can resolve which limiter result to report.
		const guard = line.match(/!\s*([A-Za-z_$][\w$]*)\.success\b/);
		if (guard) lastVar = guard[1];

		if (!line.includes("429, 'rate_limited'")) continue;
		// Only single-line call sites; multi-line ones (trailing `, {` opening an
		// object across lines) are left for manual review.
		const m = line.match(CALL_RE);
		if (!m) {
			skipped.push(`${file}:${i + 1} (multi-line or unrecognized)`);
			continue;
		}

		const varOnLine = guard ? guard[1] : lastVar;
		if (!varOnLine) {
			skipped.push(`${file}:${i + 1} (no limiter variable in scope)`);
			continue;
		}

		const msg = m[1];
		const extra = m[2] ? m[2].trim() : null;
		// Drop the default message to keep call sites terse; keep custom ones.
		const isDefault = msg === "'too many requests'";
		const args = [`res`, varOnLine];
		if (!isDefault || extra) args.push(isDefault ? `'too many requests'` : msg);
		if (extra) args.push(extra);
		const replacement = `rateLimited(${args.join(', ')})`;

		lines[i] = line.slice(0, m.index) + replacement + line.slice(m.index + m[0].length);
		touched = true;
		changedLines++;
	}

	if (!touched) continue;

	src = lines.join('\n');

	// Ensure `rateLimited` is imported from the file's _lib/http.js import.
	if (!/\brateLimited\b/.test(src.split('\n').filter((l) => l.includes('import')).join('\n'))) {
		const importRe = /import\s*\{([\s\S]*?)\}\s*from\s*'([^']*_lib\/http\.js)'/;
		const im = src.match(importRe);
		if (im) {
			const names = im[1];
			const newNames = names.includes('rateLimited')
				? names
				: names.replace(/\s*\}?\s*$/, '') + ', rateLimited';
			src = src.replace(importRe, `import {${newNames} } from '${im[2]}'`);
		} else {
			skipped.push(`${file} (uses rateLimited but no _lib/http.js import found to extend)`);
		}
	}

	if (!DRY) writeFileSync(file, src);
	changedFiles++;
}

console.log(`${DRY ? '[dry] ' : ''}rewrote ${changedLines} call sites across ${changedFiles} files`);
if (skipped.length) {
	console.log(`\nskipped ${skipped.length} site(s) for manual review:`);
	for (const s of skipped) console.log('  ' + s);
}
