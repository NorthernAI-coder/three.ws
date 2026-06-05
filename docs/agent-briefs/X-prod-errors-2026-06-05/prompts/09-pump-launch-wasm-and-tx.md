# Fix 09 — `/api/pump/launch-agent` WASM missing + tx serialize overflow + timeout (P1, ~16 lines)

## The errors (verbatim)

```
[api] unhandled Error: ENOENT: no such file or directory,
  open '/var/task/api/pump/wasm/vanity_grinder_bg.wasm'
  at ensureWasm → grindVanityNode → handleLaunchAgent

[api] unhandled RangeError: encoding overruns Uint8Array
  at Blob.encode (@solana/buffer-layout)
  at MessageV0.serialize → VersionedTransaction.sign → handleLaunchAgent

Vercel Runtime Timeout Error: Task timed out after 30 seconds
```

`/api/pump/[action]` → `handleLaunchAgent`.

## Root cause

Three distinct bugs in the launch path:

1. **`vanity_grinder_bg.wasm` not bundled.** `ensureWasm()` does `readFileSync('/var/task/api/pump/wasm/vanity_grinder_bg.wasm')`
   but the `.wasm` asset isn't included in the Vercel function bundle (Vercel NFT doesn't
   trace `readFileSync` string paths). So vanity grinding crashes in prod.
2. **`encoding overruns Uint8Array`** during `VersionedTransaction.sign` → `MessageV0.serialize`.
   The transaction is **too large / a field overflows its layout** — likely metadata
   (name/symbol/uri/attributes) exceeding the on-chain byte budget. Note the memory
   `onchain-brand-metadata`: the Attributes plugin has a **1232-byte tx budget** and needs a
   byte-aware clamp. The launch path is exceeding the serialization limit.
3. **30s timeout** — vanity grinding (CPU-bound) + launch in one synchronous request blows
   the function limit.

## Required fix

`api/pump/[action].js` — `ensureWasm`, `grindVanityNode`, `handleLaunchAgent`. Cross-check
`src/solana/vanity/brand.js` (the `3ws` mark, per memory `mint-mark-brand`) and
`api/_lib/three-brand.js` (metadata builder, per memory `onchain-brand-metadata`).

1. **Bundle the WASM properly.** Ensure `vanity_grinder_bg.wasm` ships in the function:
   - Reference it so Vercel NFT traces it (e.g. `new URL('./wasm/vanity_grinder_bg.wasm', import.meta.url)`
     and `fs.readFileSync(fileURLToPath(...))`), and/or add it to `vercel.json`
     `functions.includeFiles` / `outputFileTracingIncludes`.
   - Confirm the path resolves under `/var/task` at runtime. Test by deploying and hitting
     the route — `ensureWasm` must find the file.
2. **Byte-budget the transaction.** Before serialize/sign, clamp the metadata to fit the tx
   size limit (apply the existing byte-aware clamp from the brand metadata builder so name +
   symbol + uri + attributes never overrun). Reproduce the overflowing input, confirm the
   clamp keeps the tx within the layout budget, and the launch succeeds. Do **not** silently
   drop the brand mark — clamp intelligently (truncate long fields, not the mark).
3. **Get vanity grinding off the request thread / within budget.** Either:
   - Bound the grind difficulty so it provably completes well under 30s, or
   - Move grinding to a background job / pre-generated vanity pool and have the launch request
     consume a ready key. The launch endpoint must return within the function limit.
   Pick the approach that keeps the `3ws` mark enforcement intact (memory `mint-mark-brand`:
   `THREE_WS_MARK_ENFORCE`).

## Verification

- Deploy preview: `POST /api/pump/launch-agent` with a real launch payload (mint supplied at
  runtime per `CLAUDE.md` — never hardcode a non-`$THREE` mint) → vanity step finds the WASM,
  tx serializes/signs without `encoding overruns`, and the request returns under 30s.
- Test with maximal-length name/symbol/uri to confirm the byte clamp holds.
- Post-deploy logs: zero ENOENT for the wasm, zero `encoding overruns`, zero pump timeouts.

## Definition of done

The WASM is bundled and found at runtime, the launch tx is byte-clamped so it always
serializes within the on-chain budget (mark preserved), vanity grinding completes within the
function time limit, and a real launch succeeds end-to-end.
