# B3 — Resolve the empty `api/agents/[id]/skill-collection.js`

**Track:** B — complete feature · **Priority:** P2 · **Effort:** 30m (delete) – 2h (implement) · **Depends on:** none

## Context

`api/agents/[id]/skill-collection.js` is a **1-byte (empty) file**. It exports nothing and is
referenced nowhere in `api/`, `src/`, or `vercel.json`. It is the single genuinely-dead endpoint
file in the API surface. Empty handler files are hazardous in this repo because the dispatcher-shim
pattern makes thin files look normal — a zero-byte file can masquerade as a real endpoint.

## Decision

Choose one, based on a quick check of intent:

1. **Search for any intended consumer / spec.** Grep `src/`, `api/`, `docs/`, `specs/`, `tasks/`
   for `skill-collection`, "skill NFT", "Metaplex", "skill collection" to see if a feature was
   planned (the name suggests a Metaplex on-chain collection of an agent's skills).
2. **If there is no live consumer and no committed spec → delete the file.** This is the default and
   correct action; do not leave dead scaffolding.
3. **If there is a clear, committed spec/consumer that this was meant to satisfy → implement it
   fully** (real Metaplex mint / collection read, wired into a reachable route in `vercel.json` and
   a UI entry point), per the no-stubs rule. Only do this if the scope is genuinely small and
   specified; otherwise delete and, if the feature is still wanted, it belongs in its own task —
   note that in your commit message rather than half-building it here.

## Acceptance criteria

- [ ] The empty file no longer exists, **or** it is a complete, reachable, real implementation
      (no stub, no `not_implemented`, wired into a route + UI).
- [ ] No dangling import/route references remain.
- [ ] If deleted: a one-line note in the commit message explains it was dead (no consumer/spec).

## Verification

1. `rg -n "skill-collection" .` returns no live code references (only, at most, this resolved state).
2. `npm run build` (or the relevant lint/knip step) passes with no new unused-file/route warnings.

## Rules

Obey [CLAUDE.md](../../CLAUDE.md): delete aggressively; no stubs; if it exists, it must work and be
reachable.

## Completion protocol

1. Re-read your diff (`git diff`) and confirm every line is justified.
2. Delete this file: `tasks/week-2026-06-08/B3-dead-file-skill-collection.md`.
3. Commit your change **and** this file's deletion together, e.g.:
   `git add -A && git commit -m "chore(api): remove dead empty skill-collection.js endpoint; close B3"`
4. Do **not** push — the human controls pushes.
