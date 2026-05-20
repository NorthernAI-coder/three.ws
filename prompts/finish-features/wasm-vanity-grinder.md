# Task: WASM-backed vanity-address grinder

## Repo context

Working tree: `/workspaces/three.ws`. `src/solana/vanity/grinder.js` is
a pure-JS Solana keypair vanity grinder — it generates ed25519 keypairs
in a loop until the public key's base58 representation matches a
user-supplied prefix. Today it runs ~50-200k keypairs/sec depending on
device; a WASM build of the same loop typically runs ~10× faster.

A `TODO(perf)` comment at line 138 says:

> TODO(perf): drop in a WASM grinder backed by the toolkit's Rust crate

## Rails (CLAUDE.md — non-negotiable)

- No mocks, no fake data, no placeholders, no TODOs, no stubs.
- Real builds — the WASM must be produced from real Rust source, not
  copied from a CDN of unverified origin.
- Done = the TODO comment is gone, a real WASM grinder is wired in
  with a measurable speedup, `npm test` green.
- Push to both remotes only when the user says push.

## Subagent delegation

This task crosses Rust + WASM + JS, which is a large surface. Spawn
subagents for research; implement sequentially.

### Subagent A (Explore)

> In `/workspaces/three.ws`, find:
>
> 1. The exact API surface of `src/solana/vanity/grinder.js`: every
>    exported function with its signature, return shape, callers.
> 2. Every caller (likely `src/erc8004/vanity-modal.js` and possibly
>    a Web Worker).
> 3. Whether the grinder runs in the main thread or a Web Worker
>    today (read the call site).
> 4. Any existing Rust / WASM build steps in the repo (`Cargo.toml`,
>    `wasm-pack`, `vite.config.js` WASM plugins).

### Subagent B (Explore)

> Survey existing open-source Solana ed25519 vanity grinders that
> compile to WASM. Specifically:
>
> 1. Is there a published npm package (e.g. `@solana/vanity-wasm`,
>    `solana-vanity-wasm`) we can install instead of building our
>    own? If so, quote its API.
> 2. If we must build our own, identify a small audited Rust crate
>    (e.g. `ed25519-dalek` + `bs58`) that compiles cleanly to WASM
>    with `wasm-pack`.
> 3. Note any licensing constraints.

Wait for both subagents before deciding the path.

## What to implement

### Path A — published package (preferred if Subagent B finds one)

1. `npm install <package>` (devDependency or dependency depending on
   whether the grinder is shipped to the browser; it is — so prod
   dep).
2. Replace the JS grinding loop in `src/solana/vanity/grinder.js`
   with a call into the WASM package. Keep the exported function
   signature identical so callers do not need to change.
3. Add a `await initWasm()` step at module load if the package
   requires it.
4. Skip to **Step 5 — benchmark**.

### Path B — build from Rust source (if no good published package)

1. Create `crates/vanity-grinder/` with:
   - `Cargo.toml` declaring `crate-type = ["cdylib"]`, dependencies
     `wasm-bindgen`, `ed25519-dalek`, `bs58`, `getrandom = { version =
     "*", features = ["js"] }`.
   - `src/lib.rs` exposing one function:
     ```rust
     #[wasm_bindgen]
     pub fn grind(prefix: &str, batch: u32) -> JsValue { ... }
     ```
     Grinds up to `batch` keypairs; returns `null` if no hit, else
     `{ secretKey: Uint8Array, publicKey: string }`.
2. Add `wasm-pack` to devDependencies via npm script:
   ```json
   "build:wasm": "wasm-pack build crates/vanity-grinder --target web --out-dir ../../src/solana/vanity/wasm"
   ```
3. Commit the generated `src/solana/vanity/wasm/` output (`.wasm`,
   `.js`, `.d.ts`). Add an `.npmrc`-style note in
   `src/solana/vanity/wasm/README.md` that it is generated from the
   Rust crate and must not be edited.
4. Wire the wasm into `grinder.js`:
   ```js
   import init, { grind } from './wasm/vanity_grinder.js';
   let _ready = false;
   async function ensure() { if (!_ready) { await init(); _ready = true; } }
   export async function grindKeypair(prefix, opts = {}) {
     await ensure();
     const batchSize = opts.batchSize ?? 50_000;
     while (!opts.signal?.aborted) {
       const hit = grind(prefix, batchSize);
       if (hit) return hit;
       await new Promise((r) => setTimeout(r, 0)); // yield to event loop
     }
     throw new Error('aborted');
   }
   ```
   The exact shape depends on Subagent A's findings about the current
   exported signature — match it.

### Step 5 — benchmark

Run the existing pure-JS grinder once on a known prefix (3 chars,
e.g. `"abc"`), record the wall-clock time. Then run the WASM grinder
on the same prefix, record the time. Document both in the PR / commit
message. Expected speedup is at least 5×; if it is below that, the
WASM build is not configured right (likely a debug build instead of
release).

### Step 6 — preserve abort semantics

The current grinder accepts an `AbortSignal` so the modal can cancel
when the user closes it. Verify your WASM path honors abort within a
reasonable latency (one batch at most). If the WASM `grind()` call
blocks for several seconds per batch, lower `batchSize` to keep abort
latency under 200 ms.

### Step 7 — Web Worker

If Subagent A reports the grinder runs in a Web Worker today (likely),
keep it in the Worker. WASM works inside Workers — make sure the
Worker imports the same wasm-bindgen output. Verify the modal's UI
stays responsive while grinding.

### Step 8 — tests

Extend whatever `tests/` covers `grinder.js`. Cases:

1. Grinding for a known prefix returns a keypair whose public key
   starts with that prefix.
2. The secret key, when used to sign a known message and verified
   against the returned public key, validates.
3. Aborting via the AbortSignal returns within 200 ms.

Test against the real WASM; do not stub it.

### Step 9 — run the full suite + dev smoke

```bash
npm test
npm run dev
# Open the vanity modal in the UI, grind a 2-char prefix, watch it
# finish in well under a second. Confirm no console errors.
```

### Step 10 — clean up

- Delete the `TODO(perf)` comment.
- If Path B was taken, add a CI step (or a doc note) that
  `npm run build:wasm` must run after any Rust change. Vite must not
  silently serve a stale wasm.

## Definition of done

- The `TODO(perf)` comment in `src/solana/vanity/grinder.js` is gone.
- The grinder uses a real WASM implementation (path A or path B).
- A benchmark shows at least 5× speedup on a 3-char prefix.
- Tests pass.
- Manual UI smoke test confirms no regression in the vanity modal.
- `git diff` reviewed.

## Constraints

- Do not copy a pre-built `.wasm` from an unverified source. Either
  install a published npm package or build from Rust source in this
  repo.
- Do not freeze the main thread. The grinder must yield (Worker or
  batched microtasks) so the UI stays responsive.
- Do not log secret keys at any level. Even in dev.
- This task is **perf**, not a feature. If the WASM grinder is more
  trouble than the speedup is worth (Subagent B finds no clean path,
  Rust toolchain not available, etc.), report and stop — leave the
  JS grinder in place and convert the `TODO(perf)` comment into a
  doc note explaining the decision.
