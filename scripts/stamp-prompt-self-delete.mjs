#!/usr/bin/env node
// Appends an idempotent "delete this file on completion" footer to every real
// prompt/task markdown file under tasks/ and prompts/. Skips meta docs
// (README/PLAN/REPORT/...) and files already stamped. Safe to re-run.
import { readFileSync, writeFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const ROOTS = ['tasks', 'prompts'];
const MARKER = '<!-- AUTO:self-delete-on-complete -->';
// Same exclusion set used to count "real" tasks vs meta docs.
const META = /(README|PLAN|MANIFEST|REPORT|CHECKLIST|PERF_NOTES|START-HERE|_shared|ORPHAN|SIGNERS|overview)/i;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}

function footer(relPath) {
  return `

${MARKER}

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root \`CLAUDE.md\`, remove it in the same change:

\`\`\`bash
git rm "${relPath}"
\`\`\`

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
`;
}

let stamped = 0, skipped = 0, meta = 0;
for (const r of ROOTS) {
  for (const file of walk(join(ROOT, r))) {
    const rel = relative(ROOT, file);
    const base = file.split('/').pop();
    if (META.test(base)) { meta++; continue; }
    const txt = readFileSync(file, 'utf8');
    if (txt.includes(MARKER)) { skipped++; continue; }
    writeFileSync(file, txt.replace(/\s*$/, '') + footer(rel) );
    stamped++;
  }
}
console.log(`stamped=${stamped} already-stamped=${skipped} meta-skipped=${meta}`);
