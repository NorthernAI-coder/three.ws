#!/usr/bin/env node
// Rank the open (partial/pending) backlog by a transparent composite priority score.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const rows = JSON.parse(readFileSync('reports/task-completion-verified.json', 'utf8'))
  .filter(x => x.verdict !== 'done' && existsSync(x.file));

const LABEL = /priority[:*\s]*\**\s*(critical|high|medium|low|p0|p1|p2|p3)/i;
const labelWeight = { critical: 4, p0: 4, high: 3, p1: 3, medium: 1, p2: 1, p3: -1, low: -1 };

// product-value weights, grounded in repo focus + memory
function valueWeight(file) {
  if (/^tasks\/nvidia-nim|^prompts\/tripo-gap|^prompts\/animation-studio/.test(file)) return 3; // generation suite = top focus
  if (/^prompts\/agent-fixes/.test(file)) return 3;                                            // live production bug fixes
  if (/^tasks\/onchain-deployment|^prompts\/siwx|^tasks\/pumpfun-launchpad/.test(file)) return 2; // payments/onchain infra
  if (/^tasks\/agent-monetization|^tasks\/monetization-feature/.test(file)) return 1;          // real monetization backend
  if (/^prompts\/monetization(\/|-)/.test(file)) return -2;                                    // duplicate prompt explosion -> dedupe, not 90 tasks
  return 0;                                                                                    // walk/site-overhaul/wow-sprint/etc.
}

for (const r of rows) {
  const t = readFileSync(r.file, 'utf8');
  const m = t.match(LABEL);
  r.label = m ? m[1].toLowerCase() : '';
  let score = 0;
  score += r.label ? labelWeight[r.label] : 0;
  score += r.verdict === 'partial' ? 2 : 0;
  score += r.confidence === 'high' ? 1 : 0;
  score += valueWeight(r.file);
  r.score = score;
}
rows.sort((a, b) => b.score - a.score || (a.verdict < b.verdict ? -1 : 1) || a.file.localeCompare(b.file));

writeFileSync('reports/task-priority.csv',
  'rank,score,verdict,confidence,label,file,missing\n' +
  rows.map((r, i) => [i + 1, r.score, r.verdict, r.confidence, r.label || '-', r.file,
    JSON.stringify((r.missing || '').replace(/\s+/g, ' ').slice(0, 160))].join(',')).join('\n'));

const dups = rows.filter(r => valueWeight(r.file) === -2);
const quickWins = rows.filter(r => r.verdict === 'partial' && r.confidence === 'high' && valueWeight(r.file) >= 0);
const topPending = rows.filter(r => r.verdict === 'pending' && r.score >= 3);

const show = (r) => `  [${r.score}] ${r.verdict}/${r.confidence}${r.label ? ' ·' + r.label : ''}  ${r.file}\n        ↳ ${(r.missing || '').replace(/\s+/g, ' ').slice(0, 130)}`;

console.log(`open backlog: ${rows.length}\n`);
console.log(`=== TIER 1 — QUICK WINS (partial + high confidence, real value): ${quickWins.length} ===`);
quickWins.slice(0, 12).forEach(r => console.log(show(r)));
console.log(`\n=== TIER 2 — HIGH PRIORITY, NOT STARTED (score>=3, pending): ${topPending.length} ===`);
topPending.slice(0, 12).forEach(r => console.log(show(r)));
console.log(`\n=== DEPRIORITIZE / DEDUPE — duplicate monetization prompts: ${dups.length} ===`);
console.log(`  (collapse into one canonical set instead of treating as ${dups.length} tasks)`);
console.log(`\nFull ranking: reports/task-priority.csv`);
