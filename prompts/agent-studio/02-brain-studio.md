# P1 — Brain Studio (the visual, programmable agent brain)

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md` and
`STRUCTURE.md` first. **Prerequisite:** P0 (`01-foundation.md`) is merged — the Studio shell,
`src/studio/agent-studio-store.js`, and `<agent-presence>` exist. Read the "Integration notes for
P1–P5" comment at the top of the store before you start. Mount into the **Brain** and **Skills**
tab containers the shell exposes.

## The vision you are enabling

Today an agent's "brain" is a single `persona_prompt` text column. That's invisible config — the
opposite of our product principle. You will make the brain a **thing the user sees and wires**: a
visual, programmable graph where persona, model choice, memory access, skills, and **trading
reasoning** are nodes connected into a living circuit. The user doesn't fill in a textarea — they
*build a mind*, watch it light up as it thinks, and immediately see their avatar's behavior change.

This is the centerpiece of "everything is visual." Make it gamechanging.

## Your mission

### 1. The Brain Graph — a visual node editor for the agent's mind
Build a node-graph editor in the Brain tab. Nodes the user can place, connect, and configure:
- **Persona / Identity** (tone, role, risk appetite — feeds the system prompt)
- **Model** node(s): choose the LLM that powers a branch. Wire to the **real** multi-provider proxies
  that already exist (`api/chat.js`, `api/brain/chat.js`, the widget `brainProvider`/`brainModel`
  config in `api/widgets/[id]/[action].js`). Default to the latest Claude models (see `CLAUDE.md`
  env notes / the claude-api skill) but support the providers already wired (Anthropic, OpenAI,
  IBM watsonx Granite, etc.). Show real per-node latency + token stats like `pages/brain.html` does.
- **Memory** node: a port that reads/writes the agent's memory (P2 owns the memory store; you expose
  the node + call `api/agent-memory.js`). Coordinate via the `studio` contract, not direct coupling.
- **Skill** nodes: each enabled skill (from `agent_identities.skills[]`, licensed via
  `api/skills/` + `api/_lib/skill-license-onchain.js`) becomes a node the brain can invoke.
- **Trading / Reasoning** nodes: conditionals and tools the brain uses to reason about markets
  (P4 owns execution; you own the *reasoning wiring* — e.g. "if watchlist coin breaks level → ask
  brain → propose action"). Define the node interface; P4 fills execution. The only coin promoted
  is `$THREE`; market nodes operate on runtime-supplied mints only.
- **Output** node: drives the avatar (text → speech → emotion via the existing `agent-avatar.js`
  emotion blend + lip-sync). When the brain "thinks," the avatar in the stage reacts live.

Serialize the graph into `meta.studio.brain` (the contract P0 defined). The graph IS the persona —
compile it down to the real `persona_prompt` + tool config the chat endpoints consume, so existing
chat surfaces keep working. Round-trip must be lossless.

### 2. Live "thinking" visualization
When the agent runs (test-chat inside the studio, or a real event), **animate the active path**
through the graph — tokens streaming, which memory was recalled, which skill fired, which model
answered. The user literally watches their agent think. This is the screenshot moment.

### 3. Test harness in-panel
A real chat box that runs the current graph against the **real** LLM proxies with the user's actual
agent + memory, streaming responses, and driving the live avatar. No fake responses, ever.

## Libraries to adopt (research-backed — pick and justify)
- Node-graph rendering: **Rete.js v2** (framework-agnostic, vanilla-friendly, dataflow + control-flow
  engines, plugin system) is the best fit for the vanilla main app. **litegraph.js** is a lighter
  canvas alternative. **React Flow** is excellent *if* you mount the Brain tab as a React island —
  only do that if it doesn't compromise P0's framework-agnostic seams or load cost. Pick one, justify
  it in a code comment, keep the saved graph format your own (don't leak the lib's schema into the DB).
- Sources: React Flow https://reactflow.dev , Rete.js https://retejs.org , litegraph.js
  https://github.com/jagenjo/litegraph.js , awesome-node-based-uis https://github.com/xyflow/awesome-node-based-uis
- Memory framework concepts to mirror in the Memory node (P2 implements storage): **Letta/MemGPT**
  tiered memory and **mem0** add()/search() ergonomics — see https://github.com/mem0ai/mem0 and
  https://github.com/letta-ai/letta . Don't add a heavy backend dep without cause; mirror the *UX*.

## Definition of done
- User can build/edit/save a brain graph; it persists to `meta.studio.brain` and round-trips losslessly.
- Test chat runs against **real** LLM proxies with **real** memory; avatar reacts live via `studio`.
- Active-path animation works during a run. Model nodes show real latency/token stats.
- Existing chat surfaces still work (graph compiles to a valid persona/tool config).
- All states designed (empty graph onboarding, single node, huge graph, model error, rate limit).
- No console errors; `npm test` passes; network tab shows real provider calls. Changelog entry added.

## Operating rules (override defaults)
No mocks/stubs/TODOs/fake responses. $THREE is the only coin promoted; market nodes use runtime
mints only. Design tokens only. Stage explicit paths (never `git add -A`); re-check
`git diff --staged` before commit — concurrent agents share this worktree. Touch `api/agents.js`
only to append brain-config handling; coordinate the memory port with P2 via the `studio` contract.

## When finished
Self-review (CLAUDE.md's five checks). Then push the innovation further: add the one thing that
makes someone share this — e.g. a "brain template" gallery (Sniper, Scalper, Researcher) users can
fork, or a diff view showing how a graph edit changes behavior. Build it. Then **delete this prompt
file** (`prompts/agent-studio/02-brain-studio.md`) and report what you shipped + the graph format
and the node interface P4 should target.
