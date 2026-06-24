# Task 04 — Semantic Vanity Compiler: addresses with meaning

**Read `prompts/vanity-frontier/00-README.md` and `/workspaces/three.ws/CLAUDE.md` first** (rules,
codespace traps, file map). Then make vanity addresses *mean something* instead of "three random
chars at the front."

You are a senior product + systems engineer with a designer's eye. Today every grinder asks for a
prefix and/or suffix. That's a primitive. Build a **pattern compiler** that turns human intent —
words, names you own, dates, numbers, lookalike spellings — into an optimal grind plan with honest
difficulty and a delightful, real-time UI.

---

## Why this is gamechanging

People don't want "starts with `So`." They want their **name**, their **brand**, their **SNS
handle**, a **word** that reads in Base58, a **birthday**, a **repeated/mirror pattern**. Doing that
well requires real difficulty math, a Base58-aware dictionary/leetspeak engine, multi-constraint
solving, and honesty about what's feasible. No vanity tool treats the *pattern itself* as a
first-class compiled artifact. We will.

## What to build (real resolution, real math, real UX)

1. **Pattern compiler** (`src/solana/vanity/pattern-compiler.js`): a small language/spec that
   compiles high-level intent into concrete matchers + an accurate expected-difficulty estimate:
   - **prefix/suffix/contains/position** constraints (note: Base58 leading chars aren't uniformly
     distributed — model real difficulty, not naive `58^n`; reuse and extend `validation.js`).
   - **word mode**: map a target word to Base58-valid spellings, including opt-in leetspeak/lookalike
     substitutions (Base58 excludes `0 O I l` — handle that), ranking candidates by difficulty so
     the user picks an achievable one. Real dictionary, real ranking.
   - **numeric/date mode**: encode dates/numbers; **emoji/lookalike mode** where sensible.
   - **multi-constraint**: combine (e.g., prefix = handle AND suffix = year), with a correct joint
     difficulty estimate and a clear "this will take ~X on your machine / ~$Y on our grinder."
   - **owned-name mode**: resolve an SNS (`.sol`) name the user actually owns via
     `@bonfida/spl-name-service` (already a dependency; see the MCP `ens_sns_resolve` tool) and let
     them grind an address that visually ties to it. Real on-chain resolution — verify ownership.
2. **Difficulty + routing engine**: given a compiled pattern, estimate expected attempts and route
   it: trivial → browser grinder; moderate → the paid x402 server grind; extreme → tell the truth
   ("this would take years; here's the closest achievable pattern") and suggest alternatives. No
   silent failures, no fake progress.
3. **Live UI** on `/vanity` (or a new `/vanity/design` view): as the user types intent, show in
   real time the compiled matchers, difficulty, estimated time/cost, and achievable suggestions.
   Wire it to the **real** grinders (browser WASM pool for cheap patterns, the real x402 endpoint
   for paid ones) and the sealed/trustless delivery from Tasks 01/02 where applicable. Every state
   designed; responsive; accessible; microinteractions that make it feel premium.
4. **Cross-pollinate**: feed a "rarity/meaning score" into the proof-of-grind certificate (Task 03)
   and expose the compiler in the SDK + an MCP tool so agents can request *meaningful* addresses,
   not just prefixes.

## Correctness, edge cases, honesty

- Difficulty math must be defensible (account for case-folding, prefix non-uniformity, combined
  constraints). Show your reasoning in code comments and validate against actual grind rates.
- Never claim a pattern is feasible when it isn't — compute the truth and present alternatives.
- SNS ownership must be verified on-chain; never assert a name belongs to a user without proof.
- Internationalization/abuse: filter patterns that would render slurs/hate; do it thoughtfully.
- Performance: debounce input, compute estimates off the main thread where heavy, paginate
  suggestion lists.

## Definition of done

- The compiler produces correct matchers + honest difficulty for prefix/suffix/contains/word/
  numeric/date/multi/SNS modes, validated against real grind throughput.
- Real SNS resolution via `@bonfida/spl-name-service`; real browser + x402 grinding wired; sealed/
  trustless delivery honored. No mocks, no fake estimates.
- `/vanity/design` exercised in a real browser: real-time updates, real network calls, every state
  designed, accessible, responsive, no console errors.
- Tests (vitest specs + direct `node` verification) for the compiler + difficulty math.
- `data/changelog.json` entry; `STRUCTURE.md` updated; SDK + MCP exposure added.
- **Self-improvement pass:** then go further — e.g., a "vanity studio" with shareable pattern
  presets, a rarity leaderboard, or a generative suggester that proposes meaningful patterns from a
  user's handle/agent persona. Ship the best one.
- **Delete this file** (`prompts/vanity-frontier/04-semantic-vanity-compiler.md`) last. Report what
  shipped, where to reach it, and any tradeoffs.

Make it the tool people screenshot. Real APIs, real math, no shortcuts.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/vanity-frontier/04-semantic-vanity-compiler.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
