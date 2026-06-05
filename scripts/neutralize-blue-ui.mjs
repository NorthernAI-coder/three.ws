#!/usr/bin/env node
// Neutralize blue-tinted dark UI surfaces/borders to luminance-matched grayscale.
//
// The site had a creeping "blueish-black" cast (e.g. /bazaar's #0a0b10 background)
// instead of the homepage's neutral black. This rewrites the dark chrome tones —
// page backgrounds, surfaces, panels, dividers/borders — to neutral gray of the
// SAME perceived lightness, so contrast and elevation are preserved while the
// blue tint is removed. Vivid accents (links, brand colors) and light text tints
// are left untouched: we only touch strictly blue-dominant tones that are dark
// (max channel <= 0x58), which is exactly the surface/border band.
//
// Usage: node scripts/neutralize-blue-ui.mjs [--apply]
//        (default is a dry run that only reports what would change)

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const APPLY = process.argv.includes('--apply');
const MAX_CHANNEL = 0x58; // 88 — surfaces & borders only, never text/accents

// Files in scope: document chrome (HTML/CSS) + the shared payment widget JS.
// src/*.js is intentionally excluded — it holds 3D scene/material colors where a
// blue cast can be a deliberate atmospheric choice, not page chrome.
// Note: git's `**` pathspec does not match top-level files, so list whole trees
// and filter by extension here instead.
const tracked = execSync('git ls-files public pages src', { encoding: 'utf8' })
  .split('\n').filter(Boolean);

const files = tracked.filter((f) => {
  if (f.startsWith('public/') || f.startsWith('pages/')) {
    return /\.(html|css|js)$/.test(f);
  }
  // src/*.js holds 3D scene/material colors — chrome lives in stylesheets only.
  if (f.startsWith('src/')) return f.endsWith('.css');
  return false;
});

const luma = (r, g, b) => Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
const hx = (n) => n.toString(16).padStart(2, '0');

// Decide replacement for a 6-digit hex, or null to leave it alone.
function neutralize(r, g, b) {
  const max = Math.max(r, g, b);
  const isBlueDominant = b > r && b > g && b - r >= 2;
  if (!isBlueDominant || max > MAX_CHANNEL) return null;
  const l = hx(luma(r, g, b));
  return `${l}${l}${l}`;
}

const colorRe = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6})\b/g;

let filesChanged = 0;
let totalSubs = 0;
const distinct = new Map(); // old -> { to, count }

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  let subs = 0;
  const out = src.replace(colorRe, (match, hex) => {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const alpha = hex.length === 8 ? hex.slice(6, 8) : '';
    const gray = neutralize(r, g, b);
    if (!gray) return match;
    subs++;
    const key = '#' + hex.toLowerCase();
    const rec = distinct.get(key) || { to: '#' + gray, count: 0 };
    rec.count++;
    distinct.set(key, rec);
    return '#' + gray + alpha;
  });
  if (subs > 0) {
    filesChanged++;
    totalSubs += subs;
    if (APPLY) writeFileSync(file, out);
  }
}

console.log(`${APPLY ? 'APPLIED' : 'DRY RUN'}: ${totalSubs} substitutions across ${filesChanged} files`);
console.log(`${distinct.size} distinct colors neutralized:\n`);
const rows = [...distinct.entries()].sort((a, b) => b[1].count - a[1].count);
for (const [from, { to, count }] of rows) {
  console.log(`  ${from} -> ${to}  (${count})`);
}
if (!APPLY) console.log('\nRe-run with --apply to write changes.');
