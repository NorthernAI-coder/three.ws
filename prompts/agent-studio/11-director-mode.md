# P10 — Director Mode (talk to your agent to reshape it; watch its brain rewire live)

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/agent-studio/00b-innovation-north-star.md` first. **Prerequisites:**
P0 (`01-foundation.md`) merged; compiles to P1's brain graph and P4's trading rules — coordinate via
the `studio` contract and the node/execution interfaces P1/P4 published.

## The invention

Authoring an AI today means editing prompts, configs, and node graphs by hand. P10 lets the user **author
by conversation**: they talk (voice or chat) to their agent — "be more aggressive on fresh launches but
never risk more than 2% per trade, and remember I hate rug-prone devs" — and the agent (a) understands,
(b) **rewires its own brain graph and trading rules in front of you**, with the P1 nodes physically
animating into their new configuration, and (c) confirms what changed and why. You're directing a being,
not filling a form. It's the most natural agent-authoring interface possible, and it makes the whole
studio approachable to non-technical traders without dumbing anything down.

Gamechanging test: a user who never opens the node editor can still build a sophisticated agent purely by
talking to it — and an expert can watch every change land precisely in the graph.

## Your mission

### 1. Conversational authoring engine
- Voice + chat input. Voice uses the real STT/TTS already wired in the repo (the agent already speaks via
  lip-sync — reuse `voice_provider`/`voice_id`/`voice_model` on the agent and the existing chat/voice
  proxies; do not add a new vendor without cause). Default to the latest Claude models for the reasoning
  (see CLAUDE.md / the claude-api skill).
- The agent interprets intent into **concrete, structured edits** against P1's brain-graph format and
  P4's trading-rule/guardrail schema — not freeform prose dumped into a persona field. Use real tool/
  function calling so edits are typed and validated, then applied through `studio.patch` and P1/P4's APIs.
- It must handle ambiguity by asking a crisp clarifying question (spoken + shown), and it must **refuse or
  flag** edits that would breach safety limits (e.g. removing a stop, exceeding spend caps) — money safety
  from P4 is enforced server-side regardless of what the user says.

### 2. Live rewiring visualization (the wow)
- As edits apply, P1's brain graph **animates the change**: nodes added/removed/reconnected, the active
  diff highlighted, with an inline plain-language summary ("I increased launch aggression, added a 2%
  per-trade cap, and saved a memory about avoiding those devs"). The user sees cause → effect instantly.
- Every change is reversible: an undo/redo timeline of conversational edits, and a "diff vs. yesterday"
  view so the user always understands how their agent drifted.

### 3. Closed loop with memory + behavior
- Preferences stated in conversation become real P2 memories (so the agent remembers *why* it's configured
  this way). The reshaped agent's new behavior reflects immediately on the live avatar (P0 presence) and
  in subsequent trades (P4). Test it on the spot: "show me how you'd handle this launch now."

## Definition of done
- Voice + chat authoring produces real, typed, validated edits to P1 brain graph + P4 rules via real APIs.
- Brain graph animates the diff live; plain-language summary is accurate; undo/redo + diff-vs-prior work.
- Safety limits enforced server-side even against direct user instruction; ambiguity → clarifying question.
- Conversational preferences persist as real P2 memories; new behavior reflects on the live avatar + trades.
- All states designed (mic denied → chat fallback; misunderstood → graceful re-ask). Accessible (captions,
  keyboard, reduced-motion). No console errors; `npm test` passes; network tab shows real STT/LLM/API
  calls. Changelog entry added.

## Operating rules (override defaults)
No mocks/fake transcription/unvalidated freeform edits. $THREE only. Money-safety enforced server-side.
Design tokens only. Stage explicit paths (never `git add -A`); re-check `git diff --staged` before commit.
Own `src/studio/director/**`, `api/director/**`; compile to P1's graph + P4's rules via their published
interfaces; write memories via P2.

## When finished
Self-review (CLAUDE.md's five checks). Then push it — e.g. a "coach my agent after a trade" loop where the
user debriefs a real result and the agent proposes a concrete rule change (ties to P4/P2), or scheduled
voice check-ins (ties to P11). Build it. Then **delete this prompt file**
(`prompts/agent-studio/11-director-mode.md`) and report what you shipped + the edit/diff format.
