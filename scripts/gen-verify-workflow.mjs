#!/usr/bin/env node
// Generates scripts/wf-verify-tasks.mjs: a Workflow that fans out one agent per
// batch (grouped by directory, chunked) to verify real completion against the repo.
import { readFileSync, writeFileSync } from 'node:fs';

const rows = JSON.parse(readFileSync('reports/task-completion.json', 'utf8'));
const guess = b => b === 'DONE' ? 'likely-done' : b === 'PENDING' ? 'likely-pending(missing artifact)' : 'unknown';

// group by directory
const groups = new Map();
for (const r of rows) {
  const dir = r.file.includes('/') ? r.file.slice(0, r.file.lastIndexOf('/')) : r.file.split('/')[0];
  if (!groups.has(dir)) groups.set(dir, []);
  groups.get(dir).push({ path: r.file, tier1: guess(r.bucket), missing: [...(r.newMissing||[]), ...(r.refMissing||[])].slice(0, 4) });
}

// chunk each group into batches of <=8
const CHUNK = 8;
const batches = [];
for (const [group, files] of groups) {
  for (let i = 0; i < files.length; i += CHUNK) {
    batches.push({ group, idx: Math.floor(i / CHUNK) + 1, files: files.slice(i, i + CHUNK) });
  }
}

const script = `export const meta = {
  name: 'verify-and-prune-tasks',
  description: 'Verify task completion against the repo and delete confirmed-complete files',
  phases: [{ title: 'Verify', detail: 'one agent per batch verifies + deletes done files' }],
}

const BATCHES = ${JSON.stringify(batches)}

const SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          verdict: { type: 'string', enum: ['done', 'partial', 'pending'] },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          evidence: { type: 'string', description: 'concrete repo evidence: file paths, symbols, endpoints, commits checked' },
          missing: { type: 'string', description: 'what is absent or unwired if not done; empty if done' },
          deleted: { type: 'boolean', description: 'true only if you removed this file (done + high confidence)' },
        },
        required: ['file', 'verdict', 'confidence', 'evidence', 'deleted'],
      },
    },
  },
  required: ['results'],
}

phase('Verify')
log('Verifying ' + BATCHES.length + ' batches across ' + ${groups.size} + ' groups')

const PROMPT = (b) =>
  'You are auditing whether work items in the three.ws repo are ACTUALLY complete, and deleting the ones that are. Make NO edits to source files; the ONLY filesystem change you may make is deleting confirmed-complete task files as instructed below.\\n\\n' +
  'For EACH task/prompt file below: (1) Read the file. (2) Determine its concrete deliverables — files to create, endpoints, UI, DB tables, symbols, env/ops actions — usually in its "Files", "What to build", "Acceptance", "Verify" or "Definition of Done" sections. (3) Inspect the repo to see if those deliverables truly exist AND are wired/used: use Glob/Grep for files and symbols, Read to confirm wiring, and git log (oneline, case-insensitive grep on a key term) for history. \\n\\n' +
  'Verdict rules: "done" = deliverables exist and are wired/reachable (not just a file present); "partial" = some deliverables exist but it is incomplete or unwired; "pending" = not started, OR an ops/action task (fund wallet, rotate token, run migration, deploy) whose action has no evidence of having been performed. A topic appearing in a commit message is NOT proof — verify the artifact. The tier1 guess is only a prior; override it when evidence disagrees, and say so in evidence.\\n\\n' +
  'Files to verify (path :: tier1 guess :: heuristic-missing):\\n' +
  b.files.map(f => '- ' + f.path + ' :: ' + f.tier1 + (f.missing.length ? ' :: missing? ' + f.missing.join(', ') : '')).join('\\n') +
  '\\n\\nDELETION STEP — after you have verified every file: for EACH file you judged verdict="done" AND confidence="high", delete it now by running the shell command  rm "<path>"  (plain rm, never git rm — agents share one git index). Delete ONLY done+high files; never delete partial, pending, or medium/low-confidence files. When in any doubt about completeness, do NOT delete — downgrade to medium confidence instead. Do NOT run git add, git commit, or git push. Set deleted=true for every file you removed and deleted=false for all others.\\n\\n' +
  'Return exactly one result object per file listed.'

const out = await parallel(BATCHES.map(b => () =>
  agent(PROMPT(b), { label: b.group + ' #' + b.idx, phase: 'Verify', schema: SCHEMA })
    .then(r => (r && r.results) ? r.results : [])
))

const all = out.filter(Boolean).flat()
const n = v => all.filter(x => x.verdict === v).length
log('done=' + n('done') + ' partial=' + n('partial') + ' pending=' + n('pending') + ' of ' + all.length)
return { total: all.length, done: n('done'), partial: n('partial'), pending: n('pending'), results: all }
`;

writeFileSync('scripts/wf-verify-tasks.mjs', script);
console.log(`generated scripts/wf-verify-tasks.mjs : ${batches.length} batches, ${groups.size} groups, ${rows.length} files`);
