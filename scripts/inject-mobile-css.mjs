#!/usr/bin/env node
/* Insert `<link rel="stylesheet" href="/mobile.css" />` into every real HTML
 * page that has a viewport meta tag. Skips embed/widget/artifact contexts —
 * those render inside hosts that own their own styling and should not
 * inherit our mobile guardrails.
 *
 * Idempotent: re-running does nothing if the link is already present.
 * Place strategy: insert immediately after the LAST <link rel="stylesheet">
 * in the <head>, so the new rules cascade over page-specific CSS as intended.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PAGES_DIR = new URL('../pages/', import.meta.url).pathname;
const LINK = '<link rel="stylesheet" href="/mobile.css" />';

const SKIP_PATTERNS = [
	/embed/i,
	/widget/i,
	/badge/i,
	/artifact/i,
	/-kiosk/i,
];

function shouldSkip(filename) {
	return SKIP_PATTERNS.some((re) => re.test(filename));
}

function injectLink(html) {
	if (html.includes('/mobile.css')) return { html, changed: false };
	// Find the last <link rel="stylesheet" ...> tag inside the document head.
	// Use a tolerant regex: rel may come before or after href.
	const stylesheetTag = /<link\b[^>]*\brel=["']stylesheet["'][^>]*\/?>/gi;
	let lastMatch = null;
	let m;
	while ((m = stylesheetTag.exec(html)) !== null) lastMatch = m;
	if (!lastMatch) return { html, changed: false };
	const end = lastMatch.index + lastMatch[0].length;
	// Preserve the indentation of the matched tag for the new line.
	const lineStart = html.lastIndexOf('\n', lastMatch.index) + 1;
	const indent = html.slice(lineStart, lastMatch.index).match(/^[\t ]*/)[0];
	const insertion = `\n${indent}${LINK}`;
	return { html: html.slice(0, end) + insertion + html.slice(end), changed: true };
}

const files = readdirSync(PAGES_DIR).filter((f) => f.endsWith('.html'));
const stats = { changed: 0, skipped: 0, alreadyHas: 0, noViewport: 0 };
for (const file of files) {
	if (shouldSkip(file)) {
		stats.skipped += 1;
		continue;
	}
	const path = join(PAGES_DIR, file);
	const orig = readFileSync(path, 'utf8');
	if (!/<meta[^>]+name=["']viewport["']/i.test(orig)) {
		stats.noViewport += 1;
		continue;
	}
	const { html, changed } = injectLink(orig);
	if (!changed) {
		stats.alreadyHas += 1;
		continue;
	}
	writeFileSync(path, html);
	stats.changed += 1;
	console.log(`  + ${file}`);
}

console.log(
	`\nmobile.css link: ${stats.changed} updated, ${stats.alreadyHas} already had it, ${stats.skipped} skipped (widget/embed), ${stats.noViewport} no viewport`,
);
