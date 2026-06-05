# Brief 12 — Long-tail hardening (~40 errors across several small bugs)

Each of these is low-volume but a real defect. Fix the source; add a boundary guard.

## 12a. Empty / malformed JSON bodies → `SyntaxError: Unexpected end of JSON input` (7)
- Root cause: a handler does `JSON.parse(body)` / `await req.json()` on an empty or non-JSON
  request body without a try/catch. Find the routes (the `[api] unhandled SyntaxError` rows) and
  parse defensively: validate `content-length`/content-type, wrap parse in try/catch, return
  **400** with a clear message on bad input. Never 500 on a malformed client body.

## 12b. Vercel Runtime Timeout — 30s (27, mostly /api/chat, some elsewhere)
- Mostly covered by Brief 03 for `/api/chat`. For any *other* route timing out, find the slow
  upstream/DB call and add a timeout + failover. No handler should be able to run the full 30s on
  a single unbounded await.

## 12c. UTF-8 / encoding errors
```
NeonDbError: invalid byte sequence for encoding "UTF8": 0x..   (1)
RangeError: encoding overruns Uint8Array                       (Solana — see Brief 08)
```
- Root cause: raw bytes/invalid UTF-8 reaching Postgres. Sanitize/normalize string inputs
  (strip null bytes, validate UTF-8) at the write boundary before they hit `sql\`...\``.

## 12d. Fontconfig error (2)
```
Fontconfig error: Cannot load default config file: No such file: (null)
```
- Root cause: an OG-image / canvas / headless render path needs fonts but the lambda has no
  fontconfig. Bundle the font(s) the renderer needs and point `FONTCONFIG_PATH` / load the font
  explicitly so image generation doesn't warn/degrade. Find the render route (likely an `og`/image
  function) and make font loading explicit and self-contained.

## 12e. ENOENT file open (2)
```
[api] unhandled Error: ENOENT: no such file or directory, open '...'
```
- Root cause: a handler reads a file that isn't included in the deployed bundle (Vercel NFT didn't
  trace it). Identify the file, and either inline its contents, mark it for inclusion via
  `vercel.json` `includeFiles`, or read it from a bundled import instead of `fs` at runtime.

## 12f. `seed-default-agent` / `[audit] insert failed` (2 + 5)
- These reference DB inserts failing — likely the same missing-table/migration class as Brief 04,
  or a constraint violation. Trace the failing insert, confirm the target table/columns exist in
  prod, and make the seed/audit path idempotent (`ON CONFLICT DO NOTHING`) so reruns don't error.

## Done when
- Each sub-item: the source bug is fixed, bad input returns a typed 4xx (not 500), and the log line
  no longer appears in a preview-deploy smoke test.
