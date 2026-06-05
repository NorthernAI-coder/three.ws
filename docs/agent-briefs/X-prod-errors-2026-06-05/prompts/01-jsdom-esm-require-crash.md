# Fix 01 — `ERR_REQUIRE_ESM` crashing the widgets function (P0, ~1,242 lines)

## The error (verbatim from prod)

```
Error [ERR_REQUIRE_ESM]: require() of ES Module
/var/task/node_modules/@exodus/bytes/encoding-lite.js
from /var/task/node_modules/html-encoding-sniffer/lib/html-encoding-sniffer.js
not supported.
... code: 'ERR_REQUIRE_ESM'
Node.js process exited with exit status: 1.
```

Endpoints affected (all return **500**, the process *exits*, so it also poisons sibling
handlers in the same bundle):
- `/api/widgets/[id]/stats` (607)
- `/api/widgets/[id]/transcripts` (562)
- `/api/widgets/[id]/knowledge` (41)
- `/api/widgets/[id]/chat` (31)

## Root cause

The widgets function bundle pulls in `jsdom` (via `api/_lib/text-extract.js`, imported by
the knowledge-ingest path). `jsdom`'s transitive dep `html-encoding-sniffer` does a
**CommonJS `require()`** of `@exodus/bytes/encoding-lite.js`, which is **ESM-only** in the
version resolved on the deployed Node runtime. At cold start the bundler/runtime evaluates
the `require`, throws `ERR_REQUIRE_ESM`, and the **entire serverless function exits(1)** —
which is why `stats` and `transcripts` (which don't even need jsdom) die too.

There is already a comment in `api/widgets/[id]/[action].js` (lines ~23-25) acknowledging
this and *intending* to lazy-load `_knowledge.js`. The lazy-load is **not actually
preventing the crash** — the dependency is still reachable at module-eval / bundle time, so
verify whether the import is truly deferred or whether Vercel NFT is hoisting it.

## Required fix (trace to source, no shortcuts)

1. **Confirm the real entry point.** In `api/widgets/[id]/[action].js`, trace exactly how
   `jsdom` enters the bundle for `stats`/`transcripts`. Map the import chain:
   `[action].js → ? → _knowledge.js → text-extract.js → jsdom → html-encoding-sniffer → @exodus/bytes`.
   Determine whether it's a static `import`, a hoisted dynamic `import()`, or NFT including
   it regardless.
2. **Pick the proper fix, not suppression:**
   - **Preferred:** eliminate the broken require chain. Pin `@exodus/bytes` (and/or
     `html-encoding-sniffer`) to a version pair that is internally consistent (CJS-requires-CJS
     or ESM-imports-ESM) for the deployed Node version. Check `npm ls @exodus/bytes
     html-encoding-sniffer jsdom whatwg-encoding` and resolve the mismatch at the dependency
     level. This makes the crash impossible, everywhere.
   - **If a clean version pin isn't available:** replace `jsdom` for our HTML→text extraction
     with a lighter, ESM-clean parser. We only use it in `text-extract.js` (`new JSDOM(raw)`
     then DOM text walk). `@mozilla/readability` needs a DOM, but a `linkedom` or
     `node-html-parser` based extractor would remove the entire `jsdom` chain. If you swap,
     reproduce the exact extraction output (readable text, same fields) — no quality
     regression.
   - **Genuinely defer** the heavy path: make `stats` and `transcripts` provably independent
     of the jsdom chain so they can never be taken down by knowledge-ingest, even if ingest
     itself still needs work. A crash in `knowledge` must not 500 `stats`.
3. **Do not** wrap the require in try/catch and call it fixed — that hides a broken bundle.
   The bundle must not contain a `require()` of an ESM module on the deployed runtime.

## Verification (must do all)

- `npm ls @exodus/bytes html-encoding-sniffer jsdom` shows a consistent, resolvable tree.
- Build the widgets function locally the way Vercel does (or `vercel build`) and confirm no
  `ERR_REQUIRE_ESM` at function init.
- Hit `/api/widgets/<real-id>/stats`, `/transcripts`, `/knowledge`, `/chat` against a deploy
  preview — all return their real payloads, not 500.
- Exercise the **knowledge ingest** path (the one that genuinely uses HTML extraction) and
  confirm text extraction still produces correct readable text.
- Grep new logs after deploy: zero `ERR_REQUIRE_ESM`.

## Definition of done

All four widget sub-routes return real data, the HTML→text extraction still works on a real
page, the dependency tree is internally consistent, and the crash signature cannot recur.
