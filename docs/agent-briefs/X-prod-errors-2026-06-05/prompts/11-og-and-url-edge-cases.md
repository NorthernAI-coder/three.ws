# Fix 11 — OG image + URL edge cases (P2, ~5 lines)

## The errors (verbatim)

```
/api/play-og   : TypeError: Invalid URL  (code ERR_INVALID_URL, input: '/api/play-og')
                 at new URL (api/play-og.js:48)
/api/agent-og  : NeonDbError: invalid input syntax for type uuid: ":id"  (path /api/agent/:id/og)
/api/x402-pay/og: Fontconfig error: Cannot load default config file: No such file: (null)
```

## Root causes — three independent bugs

### A. `/api/play-og` — `new URL(req.url)` with a relative input
`req.url` is a **path** (`/api/play-og`), not an absolute URL. `new URL('/api/play-og')`
throws `ERR_INVALID_URL`. The handler needs a base. (The source already does
`new URL(req.url, 'http://x')` in one place — line ~191 — but the crashing line ~48 in the
deployed bundle doesn't pass a base, or constructs a URL from an unvalidated query param.)

**Fix:** never call `new URL(req.url)` without a base. Use `new URL(req.url, originOf(req))`
(the file already has `originOf(req)`), and validate/guard any URL built from query params —
on bad input, render the default OG image, not a 500. Trace line ~48 in source and fix at
the construction site.

### B. `/api/agent-og` — literal `:id` reaching the DB
The route received the **literal** `/api/agent/:id/og` (the unsubstituted path template), so
`:id` was passed straight into a `uuid` column → `invalid input syntax for type uuid`. Some
caller (a crawler, a prerender, or a broken internal link) is hitting the template path.

**Fix:** validate `id` is a real UUID **before** querying (`/^[0-9a-f-]{36}$/i` or a uuid
guard). If it isn't a valid UUID (or is the literal `:id`), return the **default OG image**
with a 200, not a DB error. Then hunt the source of the bad link — grep for `agent/:id/og`
or template strings that aren't being interpolated, and fix the caller so the template path
is never requested.

### C. `/api/x402-pay/og` — Fontconfig can't load default config
The OG renderer (likely `@vercel/og` / satori / a canvas lib) can't find a font config in
the serverless runtime. Per memory `seo-meta-and-og-runtime`, `@vercel/og` Edge runtime is
broken here — **use the node runtime**, and bundle/register the font explicitly.

**Fix:** ensure `/api/x402-pay/og` runs on the **node** runtime (not edge), register the
font file explicitly (load the `.ttf`/`.woff` and pass it to the renderer) and bundle it via
`includeFiles`, so it never depends on a system Fontconfig default. Confirm the OG image
renders with correct fonts.

## Verification

- `GET /api/play-og` (and with weird query params) → returns a valid PNG, never 500.
- `GET /api/agent-og?id=:id` and `?id=<garbage>` → default OG image, 200; valid UUID → real
  agent OG. No `invalid input syntax for type uuid` in logs. The bad-link source is fixed.
- `GET /api/x402-pay/og` → renders with fonts, no Fontconfig error.
- Post-deploy logs: all three signatures gone.

## Definition of done

All three OG/URL endpoints handle bad/edge input gracefully (default image, never 500), the
literal-`:id` caller is traced and fixed, and the x402-pay OG renders on the node runtime
with an explicitly bundled font.
