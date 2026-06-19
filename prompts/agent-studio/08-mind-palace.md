# P7 — Mind Palace (walk through your agent's memory; see why it believes what it believes)

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/agent-studio/00b-innovation-north-star.md` first. **Prerequisites:**
P0 (`01-foundation.md`) merged; depends on P2 (Memory Studio) for the real memory store and on P1's
brain reasoning. Coordinate via the `studio` contract — do not duplicate P2's storage.

## The invention

P2 makes memory visible as a timeline + graph. P7 makes it a **place you walk through with your agent.**
Instead of reading a list, you step into a 3D "mind palace" where memories are spatial objects —
clustered by coin, by strategy, by person, by era — and your avatar physically guides you, picks up a
memory, and explains *why it believes what it believes about a token*: "I'm bearish on this because of
these three things I remember." This is embodiment over dashboards taken to its conclusion: the most
intuitive interface to a machine's mind humans have ever had is *space*, and we have the avatar to walk it.

No crypto tool — no AI tool — lets you literally walk inside your agent's reasoning. That's the moat.

## Your mission

### 1. The spatial memory environment
- A real 3D scene (reuse `src/viewer.js`, the scene-studio primitives in `src/scene-studio/`, and the
  WebXR/AR path in `src/ar/` for an optional immersive mode). Memories from P2's real store render as
  navigable objects; layout is meaningful (semantic clustering via the embeddings P2 already computes —
  recency, salience, entity, topic). No fake nodes — every object is a real memory record.
- Smooth first-person/orbit navigation, search-to-fly-to, filter by type/coin/time, and level-of-detail
  so thousands of memories stay performant (instancing, frustum culling, lazy detail loading).

### 2. The agent as your guide (the magic)
- Your live avatar (from P0's presence + `src/agent-avatar.js`) is *in* the palace with you, walking,
  pointing, narrating. Ask it a question ("why do you avoid this kind of launch?") and it pathfinds to
  the relevant memory cluster, gathers the evidence, and explains using P1's real brain over P2's real
  recall — speaking (lip-sync) and emoting. The path it walks = the reasoning chain, made physical.
- Click any memory to inspect/curate it (edit/pin/forget) — writes go through P2's real API, and the
  brain's belief updates visibly.

### 3. Belief & contradiction surfacing
- Render the agent's current *beliefs* (e.g. stance on a mint, a strategy it trusts) as structures built
  from supporting memories, with strength shown spatially. Surface contradictions ("two memories
  disagree") as visible tension the user can resolve. This turns memory curation into an intuitive,
  almost physical act and builds real trust in the agent's judgment.

## Definition of done
- A real, navigable 3D memory space populated entirely from P2's real memory store + embeddings.
- The avatar guides, narrates (real brain + voice), and pathfinds to evidence for real questions.
- Inspect/edit/pin/forget all persist through P2's API; beliefs/contradictions reflect real data.
- Performant at thousands of memories (LOD, instancing, disposal); optional WebXR mode works.
- All states designed (sparse memory → a small, inviting starter space, not an empty void; huge memory →
  navigable, not overwhelming). Reduced-motion + accessible non-spatial fallback list view.
- No console errors; `npm test` passes; network tab shows real memory/brain calls. Changelog entry added.

## Operating rules (override defaults)
No mocks/fake memory nodes. $THREE only; coin memories use runtime mints. Design tokens only. Stage
explicit paths (never `git add -A`); re-check `git diff --staged` before commit. Own `src/mind-palace/**`
and a page entry; read P2's memory API and P1's brain — never fork their stores.

## When finished
Self-review (CLAUDE.md's five checks). Then push it — e.g. a "time-lapse" walk showing how the agent's
view of a coin evolved (ties to P2's memory replay), shared guided tours of a public agent's mind, or an
AR mode where the palace appears in the user's room (`src/ar/`). Build it. Then **delete this prompt
file** (`prompts/agent-studio/08-mind-palace.md`) and report what you shipped + how you consumed P2/P1.
