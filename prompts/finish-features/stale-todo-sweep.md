# Task: Stale-TODO sweep (recurring)

## Repo context

Working tree: `/workspaces/three.ws`. CLAUDE.md forbids `TODO`,
`// implement later`, stub functions, and `throw new Error("not
implemented")` in shipped code. This sweep is a **recurring task** —
run it whenever the prompt is loaded, even if a previous run cleaned
the repo.

## Rails (CLAUDE.md — non-negotiable)

- No mocks, no fake data, no placeholders, no TODOs, no stubs, no
  `throw new Error('not implemented')`, no commented-out code, no
  `setTimeout` fake-loading, no fallback sample arrays.
- Real APIs only.
- Done = every grep hit is either resolved or explicitly classified
  as legitimate (abstract base, JSON-RPC sentinel, vendored code).
- Push to both remotes only when the user says push.

## What to implement

### Step 1 — delegate the grep to a subagent

Spawn an **Explore** subagent with this prompt:

> In `/workspaces/three.ws`, grep these directories only:
>
> - `src/`
> - `api/`
> - `workers/`
> - `pages/`
> - `services/`
> - `tasks/` (excluding the markdown task files)
> - `scripts/`
>
> Skip: `node_modules/`, `dist/`, `publish/`, `agent-voice-chat/`,
> `agent-payments-sdk/`, `agent-protocol-sdk/`, `agent-voice-chat/`,
> `solana-agent-sdk/`, `sdk/`, `avatar-sdk/`, `chat-plugin/`,
> `multiplayer/`, `experiments/`, `scratch/`, `examples/`, all
> `*.test.js` / `*.spec.js` files, and `docs/`.
>
> Find every match for these patterns in `.js`, `.ts`, `.mjs`,
> `.cjs`, `.jsx`, `.tsx`, `.html`, `.css`:
>
> - `\bTODO\b`
> - `\bFIXME\b`
> - `\bXXX\b`
> - `\bHACK\b`
> - `implement later`
> - `not implemented`
> - `throw new Error\((['"])(not implemented|unimplemented|todo|stub)`
>
> Also find every match for these patterns in the same scope:
>
> - `const fake[A-Z]` (fake-data arrays)
> - `const sample[A-Z][a-z]+` (sample-data arrays)
> - `setTimeout\([^)]+,\s*\d+\).*//.*(fake|simulate|placeholder)`
>
> Return a markdown table: `file:line | pattern | one-line context`.

### Step 2 — classify each hit

For each row in the table, classify into exactly one of:

- **real-unfinished** — a feature or fix that was started and stopped.
  Must be implemented now.
- **abstract-base** — `throw new Error('not implemented')` inside an
  `@abstract` class whose method is the documented interface for
  subclasses. Legitimate. Skip.
- **jsonrpc-sentinel** — `throw rpcError(-32601, ...)` for "method
  not found" in a JSON-RPC handler. Legitimate. Skip.
- **vendor-tracked** — a TODO referencing an upstream issue number
  (e.g. `TODO(#116)` in vendored code like the glTF Sample Viewer).
  Leave the comment; do not implement. Skip with note.
- **perf-tracked** — a `TODO(perf):` comment for an optimization that
  is not currently broken (e.g. WASM grinder upgrade). Leave the
  comment; surface to user. Do not silently delete.

### Step 3 — implement every real-unfinished item

For each `real-unfinished` hit:

1. Read the file and surrounding context.
2. Implement the missing behavior with real wires per CLAUDE.md.
3. Delete the comment / replace the throw with the implementation.
4. Add a test if the file under `tests/` has a sibling for this
   module — extend it. Do not create a brand-new test file just for
   the comment removal unless the behavior change is non-trivial.

If a `real-unfinished` item is genuinely out of scope (depends on
infra you cannot touch, or needs credentials only the user has),
stop and surface it. Do not delete the comment to silence the lint.

### Step 4 — run the suite

```bash
npm test
npx vite build
```

Both must succeed.

### Step 5 — write a summary

Return a markdown summary with:

- A table of every hit, its classification, and the action taken.
- A list of items left as `perf-tracked` so the user sees them.
- A list of items escalated as out-of-scope (if any).

Do not commit unless the user asks.

## Definition of done

- Every `real-unfinished` hit is implemented or escalated.
- No `real-unfinished` hit remains in the codebase.
- `vendor-tracked`, `abstract-base`, `jsonrpc-sentinel`, and
  `perf-tracked` items remain documented in their inline form.
- `npm test` and `npx vite build` both succeed.
- Summary report includes every grep hit and what happened to it.

## Constraints

- Do not delete code to silence the grep. Either finish it or
  escalate it.
- Do not add new `TODO` comments to replace the old ones. If
  something is deferred, escalate it — do not re-encode it.
- Do not touch vendored code (`agent-voice-chat/`,
  `agent-payments-sdk/`, etc.) even when matches appear under those
  trees if a stray grep slipped through.
- This sweep is recurring. If a previous run already implemented the
  obvious items, you may find zero `real-unfinished` hits — that is
  the success state. Report it and stop.
