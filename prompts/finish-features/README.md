# Finish-features queue

Each file below is a **fully self-contained prompt**. You can hand any one of
them to a fresh Claude Code session (or to yourself in a future turn) without
loading anything else from this directory — they restate all the context they
need.

**Run any file at any time.** Files do not depend on each other. There is no
ordering between them.

## Rails every prompt repeats (CLAUDE.md, non-negotiable)

- No mocks, no fake data, no placeholders, no TODOs, no stubs, no
  `throw new Error('not implemented')`, no commented-out code, no
  `setTimeout` fake-loading, no fallback sample arrays.
- Real APIs only: Pump.fun, Solana RPC, OpenAI/Anthropic via worker proxies,
  Resend, Neon Postgres, R2.
- Errors handled at boundaries only (network, user input).
- Done = code wired, dev server confirms feature in a real browser with no
  console errors, `npm test` green, `git diff` reviewed.
- Push to **both** `origin` (nirholas/3D-Agent) and `threews` (nirholas/three.ws)
  only when the user explicitly says push.

## The queue

### From `docs/internal/TODO.md` (curated, agent-doable)

| File | Subagents? | Estimate |
|---|---|---|
| [finish-resend-integration.md](finish-resend-integration.md) | Yes — Explore to map callers | medium |
| [add-healthz-resend-probe.md](add-healthz-resend-probe.md) | No | small |
| [document-persona-hub.md](document-persona-hub.md) | Yes — Explore to read all persona code | medium |
| [expand-lipsync-tests.md](expand-lipsync-tests.md) | No | small |
| [verify-demo-routes.md](verify-demo-routes.md) | No | small |
| [stale-todo-sweep.md](stale-todo-sweep.md) | Yes — Explore for the grep, recurring task | small |

### Real code TODOs found in `src/` and `api/`

| File | Subagents? | Estimate |
|---|---|---|
| [fix-referral-code-uniqueness.md](fix-referral-code-uniqueness.md) | No | small |
| [implement-pump-swap-inner-ix.md](implement-pump-swap-inner-ix.md) | Yes — Explore for pump-swap SDK + Solana CPI | large |
| [clarify-speech-provider-errors.md](clarify-speech-provider-errors.md) | No | small |
| [wasm-vanity-grinder.md](wasm-vanity-grinder.md) | Yes — Explore for Rust crate + wasm-pack | large |
| [resolve-viewer-light-todo.md](resolve-viewer-light-todo.md) | No | small |

### Decisions deferred in `docs/internal/NEXT.md`

| File | Subagents? | Estimate |
|---|---|---|
| [server-side-glb-render.md](server-side-glb-render.md) | Yes — Explore for OG card flow + puppeteer integration | large |
| [add-mesh-compression-deps.md](add-mesh-compression-deps.md) | No | small |

## What is NOT in this queue and why

- **Abstract base classes** (`src/onchain/adapters/base.js`,
  `src/onchain/tokens/base.js`): the `throw new Error('not implemented')`
  calls there are the documented abstract contract that family-specific
  subclasses override. They are not stubs.
- **JSON-RPC `-32601 method not found`** in `api/pump-fun-mcp.js` and
  `workers/pump-fun-mcp/worker.js`: standard JSON-RPC sentinel. Not a stub.
- **Human-blocked items** (3D-Agent mirror PAT, Resend domain verify,
  `RESEND_AUDIENCE_ID`, confirm Resend test email delivery): need credentials
  or dashboard access only the user has. Tracked in
  `docs/internal/TODO.md` under "Human-blocked".
