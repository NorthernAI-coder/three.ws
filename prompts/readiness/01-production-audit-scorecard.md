# 01 — Production audit & readiness scorecard

**Run this first. Serial.** It produces the source-of-truth report every later
prompt checks against.

## Where you are

You are at `/workspaces/three.ws` — **three.ws**, an open-source browser-native
3D AI-agent platform (Three.js/Vite frontend, Vercel functions in `api/`,
Cloudflare workers in `workers/`, Solana + x402 payments, $THREE token). Read
[CLAUDE.md](../../CLAUDE.md) and [STRUCTURE.md](../../STRUCTURE.md) before doing
anything. The only coin is **$THREE**.

## Objective

Produce an honest, file-level production-readiness scorecard. You are not fixing
anything in this task — you are establishing ground truth so the fix tasks are
targeted and measurable. The deliverable is a committed report plus a machine
-readable inventory the rest of the program consumes.

## Why it matters

You cannot claim "100% production ready" against a number you never measured.
This report is the before-picture. Every later prompt closes a row in it.

## Instructions

1. **Inventory the gaps.** Run each, capture counts AND the file list:
   ```bash
   grep -rIn "TODO\|FIXME\|not implemented\|implement later\|placeholder\|coming soon\|XXX:\|HACK" --include=*.js src/ public/ api/ workers/ | grep -v node_modules
   grep -rIn "catch[^)]*) *{ *}" --include=*.js src/ public/ api/ workers/ | grep -v node_modules
   grep -rIn "const sample\|mockData\|fakeData\|sampleAgents\|dummyData\|hardcoded\|FIXME" --include=*.js src/ public/ api/ | grep -v node_modules
   grep -rIn "console.log\|console.warn\|console.error" --include=*.js src/ public/ | grep -v node_modules | wc -l
   ```
2. **Run the repo's own auditors** and record pass/fail + output:
   ```bash
   npm run audit:handlers   # empty event handlers / dead buttons
   npm run audit:pages      # page index integrity
   npm run check:images     # image loading (strict)
   npm run audit:web        # web audit
   npm run lint             # eslint
   npm run typecheck        # tsc
   npm test 2>&1 | tail -40 # current test state
   ```
   Do not fix failures here — record them.
3. **Map dead paths at the product level.** For each top surface in
   [STRUCTURE.md](../../STRUCTURE.md) (forge, marketplace, trending, studio,
   walk, club, reputation, launches, chat, x402 checkout), note in one line:
   does the primary user flow complete end-to-end with real data? Use the dev
   server if needed (`npm run dev`, port 3000). Flag anything that 404s,
   throws, or shows placeholder/empty content where data should be.
4. **Score each surface** 0–5 on: completeness, error/empty/loading states,
   mobile, accessibility, performance. Be ruthless; a 3 is "works but not
   demoable."
5. **Write the report** to `docs/audits/production-readiness-YYYY-MM-DD.md`
   (use today's date) with: the gap counts table, the auditor results, the
   surface scorecard, and a prioritized fix list keyed to the prompt numbers in
   [00-README-orchestration.md](00-README-orchestration.md).
6. **Write the machine inventory** to `docs/audits/gap-inventory.json` —
   `{ todos: [...], emptyCatches: [...], mockData: [...], deadPaths: [...] }`,
   each entry `{ file, line, snippet }`. Later prompts diff against this.

## Definition of done

- [ ] `docs/audits/production-readiness-<today>.md` committed, with real numbers
      (not estimates) and a per-surface scorecard.
- [ ] `docs/audits/gap-inventory.json` committed and valid JSON.
- [ ] Every auditor command above was run and its result recorded, including
      failures — no command silently skipped.
- [ ] The report names the 10 highest-leverage fixes, each linked to a prompt.
- [ ] No source files changed (this is read-only except the two reports).
- [ ] Changelog: skip — this is an internal audit, not user-visible.
