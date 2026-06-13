#!/usr/bin/env node
// One-off: backfill `added` dates in data/pages.json from git history.
//
// For every non-news page without an `added` date, resolve its source file
// (vite dev map first, then conventional locations), take the date of the
// commit that first added that file (--follow --diff-filter=A), and write it
// back. Pages that can't be resolved are reported, not guessed.
//
// Run with --write to persist; default is a dry-run report.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pagesFile = resolve(root, 'data/pages.json');
const pages = JSON.parse(readFileSync(pagesFile, 'utf8'));
const write = process.argv.includes('--write');

// path → repo file from the vite dev-server map ('/route': resolve(root, 'file'))
const viteSrc = readFileSync(resolve(root, 'vite.config.js'), 'utf8');
const viteMap = new Map();
for (const m of viteSrc.matchAll(/'(\/[^']*)':\s*resolve\(root,\s*'([^']+)'\)/g)) {
	viteMap.set(m[1].replace(/\/$/, '') || '/', m[2]);
}

function candidatesFor(path) {
	const p = path.replace(/^\//, '');
	const list = [];
	const mapped = viteMap.get(path) || viteMap.get(path.replace(/\/$/, ''));
	if (mapped) list.push(mapped);
	if (/\.[a-z0-9]+$/i.test(p)) {
		list.push(`public/${p}`, p);
	} else {
		list.push(
			`pages/${p}.html`,
			`pages/${p}/index.html`,
			`public/${p}.html`,
			`public/${p}/index.html`,
			`${p}/index.html`,
			`${p}.html`,
		);
	}
	return list;
}

function firstAddDate(file) {
	try {
		const out = execFileSync(
			'git',
			['log', '--follow', '--diff-filter=A', '--format=%as', '--', file],
			{ cwd: root, encoding: 'utf8' },
		).trim();
		const lines = out.split('\n').filter(Boolean);
		return lines[lines.length - 1] || null;
	} catch {
		return null;
	}
}

const unresolved = [];
let filled = 0;
for (const section of pages.sections) {
	if (section.id === 'news') continue;
	for (const page of section.pages) {
		if (page.added) continue;
		let date = null;
		let via = null;
		for (const cand of candidatesFor(page.path)) {
			if (!existsSync(resolve(root, cand))) continue;
			date = firstAddDate(cand);
			via = cand;
			if (date) break;
		}
		if (date) {
			page.added = date;
			filled++;
			console.log(`${page.path}  ←  ${date}  (${via})`);
		} else {
			unresolved.push(page.path);
		}
	}
}

console.log(`\n${filled} dates backfilled, ${unresolved.length} unresolved.`);
if (unresolved.length) {
	console.log('Unresolved (need manual dates):');
	for (const p of unresolved) console.log(`   ${p}`);
}

if (write) {
	writeFileSync(pagesFile, JSON.stringify(pages, null, '\t') + '\n');
	console.log(`\nWrote ${pagesFile}`);
} else {
	console.log('\nDry run — re-run with --write to persist.');
}
