#!/usr/bin/env node
// Parse the verify-and-prune workflow result, persist verdicts, and sweep-delete
// every file verified `done` that still exists. Keeps partial/pending.
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';

const OUT = process.argv[2];
const wrapper = JSON.parse(readFileSync(OUT, 'utf8'));
const data = wrapper.result || wrapper;
const results = data.results || [];
if (!results.length) { console.error('no results in output'); process.exit(1); }

const byVerdict = v => results.filter(r => r.verdict === v);
const done = byVerdict('done'), partial = byVerdict('partial'), pending = byVerdict('pending');

// persist full verdicts
writeFileSync('reports/task-completion-verified.json', JSON.stringify(results, null, 2));

// SWEEP: delete every done file still on disk
let deletedNow = 0, alreadyGone = 0;
const deletedManifest = [];
for (const r of done) {
  if (existsSync(r.file)) { rmSync(r.file); deletedNow++; deletedManifest.push(r.file); }
  else { alreadyGone++; }
}
writeFileSync('reports/deleted-done-manifest.txt',
  '# Files deleted because verified DONE (this run + sweep)\n' + done.map(r => r.file).sort().join('\n') + '\n');
writeFileSync('reports/kept-partial.txt',
  partial.map(r => `${r.file}\t${r.confidence}\t${(r.missing||'').replace(/\s+/g,' ').slice(0,200)}`).join('\n') + '\n');
writeFileSync('reports/kept-pending.txt',
  pending.map(r => `${r.file}\t${r.confidence}\t${(r.missing||'').replace(/\s+/g,' ').slice(0,200)}`).join('\n') + '\n');

// group breakdown
const groups = {};
for (const r of results) {
  const g = r.file.split('/').slice(0, 2).join('/');
  groups[g] ||= { done: 0, partial: 0, pending: 0 };
  groups[g][r.verdict]++;
}

console.log(`VERIFIED: done=${done.length} partial=${partial.length} pending=${pending.length} total=${results.length}`);
console.log(`SWEEP: deleted now=${deletedNow}, already gone (deleted earlier/by fleet)=${alreadyGone}`);
console.log(`\nTop groups still needing work (partial+pending):`);
Object.entries(groups)
  .map(([g, c]) => [g, c.partial + c.pending, c])
  .filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 18)
  .forEach(([g, n, c]) => console.log(`  ${String(n).padStart(3)} open  (${c.partial}p/${c.pending}P, ${c.done}done)  ${g}`));
