# SIWX prompt 04 — opt in existing endpoints + add the canonical asset-download endpoint

## Context

three.ws workspace at `/workspaces/three.ws`. Architecture in
[prompts/siwx/PLAN.md](PLAN.md). Prompt 03 added an optional `siwx:` field
to `paidEndpoint(spec)` in
[api/_lib/x402-paid-endpoint.js](../../api/_lib/x402-paid-endpoint.js).

This prompt is **step 4 of 7** — turning on SIWX for real endpoints. We do
three things:

1. Opt in `skill-marketplace` and `dance-tip` (existing endpoints).
2. Ship a brand-new `asset-download` endpoint that is the textbook "buy
   once, re-download forever" use case — a creator uploads a GLB / avatar /
   accessory, prices it, buyers pay once via x402, and afterwards any
   wallet on the grant list can re-download by signing.
3. Surface SIWX status on the `/api/x402-status` page so we can debug.

## Rails (CLAUDE.md, non-negotiable)

- No mocks. No fake data. No placeholders. No TODOs. No stubs. No commented-
  out code. No `setTimeout` fake-loading. No fallback sample arrays.
- Real R2 (or whatever object store this repo already uses — check
  [api/_lib/r2.js](../../api/_lib/r2.js)) for the asset bytes.
- Real Neon for listing rows.
- Real signed URLs / streams from R2 — don't proxy bytes through Vercel
  unless you've checked the file is small (<5MB) and the route stays
  under Vercel's response size limits.
- Done = endpoint works end-to-end in `npm run dev`, browser console clean,
  network tab shows the SIWX retry returning 200, payments table has the
  expected row, `git diff` reviewed.

## Files to edit / create

### A. Opt in `api/x402/skill-marketplace.js`

The marketplace catalog is polled by agent shoppers — paying $0.001 per
poll is fine the first time, but a returning agent should be able to
re-fetch for free by signing. Add to the existing `paidEndpoint({...})`
spec:

```js
siwx: {
  statement: 'Sign in to refresh the three.ws skill marketplace without re-paying.',
  ttlSeconds: 24 * 3600, // grants expire after 24h so prices stay paid-fresh
  expirationSeconds: 300,
},
```

Nothing else changes — the handler doesn't care whether it served via
payment or signature. Verify by re-reading the file after your edit; the
diff should be exactly the new `siwx:` block.

### B. Opt in `api/x402/dance-tip.js`

A tipper who paid to make Dancer 1 perform Rumba should be able to retrigger
the same performance later from the same wallet without re-paying. But each
new `(dancer, dance)` combination is a fresh purchase. The grant key is the
endpoint URL, not the query params — so we add `siwx:` but keep grants
permanent (one wallet = one free repeat of any previously-paid combo).

The handler currently issues a fresh `ticketId` per call. Keep that — the
ticket is per-performance, not per-grant. The signing flow just lets the
buyer skip the payment step before the ticket is issued.

```js
siwx: {
  statement: 'Sign in to retrigger a dance you already tipped for.',
  ttlSeconds: null, // permanent grant
  expirationSeconds: 300,
},
```

### C. New endpoint — `api/x402/asset-download.js`

This is the marquee SIWX example. Creators monetize 3D assets; buyers pay
once and re-download as many times as they want from the same wallet.

Schema (already exists or add via migration if not — check
[api/_lib/migrations/](../../api/_lib/migrations/) first):

```sql
-- in api/_lib/migrations/2026-05-21-paid-assets.sql, IF not already present
CREATE TABLE IF NOT EXISTS paid_assets (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text        NOT NULL UNIQUE,           -- 'rumba-dancer-glb', 'cz-avatar', ...
  title         text        NOT NULL,
  description   text        NOT NULL,
  mime_type     text        NOT NULL,                  -- 'model/gltf-binary', 'image/png', ...
  size_bytes    bigint      NOT NULL,
  r2_key        text        NOT NULL,                  -- e.g. 'assets/rumba-dancer.glb'
  price_atomics text        NOT NULL,                  -- USDC atomics, '5000' = $0.005
  creator_payto_base    text,                          -- optional override; defaults to env.X402_PAY_TO_BASE
  creator_payto_solana  text,                          -- optional override; defaults to env.X402_PAY_TO_SOLANA
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS paid_assets_slug_idx ON paid_assets (slug);
```

Apply the same way prompt 01's migration was applied (one-shot
`scripts/apply-paid-assets-migration.mjs` modeled on
`scripts/apply-siwx-migration.mjs`).

#### Endpoint behavior

`GET /api/x402/asset-download?slug=<slug>` →

- 402 if no payment + no SIWX. Challenge includes the asset's price (per-asset
  override of `priceAtomics`) and the SIWX extension.
- 200 + binary body (correct `Content-Type`, `Content-Length`, and `Content-
  Disposition: attachment; filename="<slug>.<ext>"`) on success.

Implementation outline (write the full file, no shortcuts):

```js
// api/x402/asset-download.js
import { paidEndpoint } from '../_lib/x402-paid-endpoint.js';
import { buildBazaarSchema, X402Error } from '../_lib/x402-spec.js';
import { sql } from '../_lib/db.js';
import { getAssetStream, getAssetBytes } from '../_lib/r2.js'; // use existing R2 client

const ROUTE = '/api/x402/asset-download';

const DESCRIPTION =
  'three.ws Asset Bazaar — pay once in USDC to unlock a 3D asset (GLB, ' +
  'avatar, accessory). Wallets that have already paid can re-download for ' +
  'free by signing in with SIWX (CAIP-122). Each asset has its own price ' +
  'and creator payout address.';

const INPUT_EXAMPLE = { slug: 'rumba-dancer-glb' };

const INPUT_SCHEMA = { /* slug: string required */ };

const OUTPUT_EXAMPLE = {
  ok: true,
  slug: 'rumba-dancer-glb',
  title: 'Rumba Dancer GLB',
  mimeType: 'model/gltf-binary',
  sizeBytes: 1843201,
  downloadUrl: 'https://...presigned R2 URL...',  // when stream-via-presigned
};

// NOTE on shape: prefer responding with a short-lived presigned R2 URL
// when the asset is > 1MB. Proxying through Vercel works for small assets
// (avatars, accessories) but blows past Vercel's body-size limits for
// full-size GLBs.

export default async function handler(req, res) {
  const slug = req.query?.slug ? String(req.query.slug).trim() : null;
  if (!slug) {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'slug required' }));
    return;
  }

  const [asset] = await sql`
    SELECT id, slug, title, description, mime_type, size_bytes, r2_key,
           price_atomics, creator_payto_base, creator_payto_solana
      FROM paid_assets
     WHERE slug = ${slug}
     LIMIT 1
  `;
  if (!asset) {
    res.statusCode = 404;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'asset not found' }));
    return;
  }

  // Build a per-asset paidEndpoint on the fly: price + per-creator payout
  // come from the row, everything else is shared.
  const inner = paidEndpoint({
    route: ROUTE,
    method: 'GET',
    priceAtomics: asset.price_atomics,
    networks: ['base', 'solana'],
    description: `${DESCRIPTION} — currently delivering: ${asset.title}.`,
    mimeType: asset.mime_type,
    bazaar: {
      discoverable: true,
      info: {
        input: { type: 'http', method: 'GET', queryParams: INPUT_EXAMPLE },
        output: { type: 'json', example: OUTPUT_EXAMPLE },
      },
      schema: buildBazaarSchema({
        method: 'GET',
        queryParamsSchema: INPUT_SCHEMA,
        outputSchema: { /* full schema */ },
      }),
    },
    siwx: {
      statement: `Sign in to re-download "${asset.title}" without re-paying.`,
      ttlSeconds: null, // permanent grant per (asset, wallet)
      expirationSeconds: 300,
    },
    async handler({ req, res }) {
      // Stream the file (presigned URL preferred — see comment above).
      const presigned = await getAssetStream(asset.r2_key, { expiresSec: 60 });
      return {
        ok: true,
        slug: asset.slug,
        title: asset.title,
        mimeType: asset.mime_type,
        sizeBytes: Number(asset.size_bytes),
        downloadUrl: presigned.url,
      };
    },
  });

  return inner(req, res);
}
```

**Important — per-creator payouts.** If `asset.creator_payto_base` or
`asset.creator_payto_solana` is set, the `paidEndpoint` you build inline
needs to use those instead of the shared `env.X402_PAY_TO_*`. The current
`buildAccept()` in `api/_lib/x402-paid-endpoint.js` reads directly from
`env`. Extend `paidEndpoint(spec)` (in this prompt OR push back to prompt
03 and update both) to accept an optional `payTo: { base?, solana?, bsc? }`
override map, and have `buildAccept()` fall back to env when a key is
missing. Document this change in the helper's file-top comment.

#### Seed two real assets

In a new file `scripts/seed-paid-assets.mjs`, upload two real GLBs that
already live in this repo (e.g. `public/avatars/<name>.glb` — `ls
public/avatars/*.glb`) to R2 under `assets/<slug>.glb` and insert the rows.
**No placeholders** — actually push the bytes and write the row with the
real `size_bytes` from `fs.statSync(file).size`. The script is idempotent
(slug is UNIQUE; use `ON CONFLICT (slug) DO NOTHING`).

Pick two slugs that map to assets the team will recognize:

- `pole-dancer-rumba` — points at the same GLB the /club page uses for Rumba.
- One avatar GLB from `public/avatars/`.

Price both at `5000` atomics ($0.005).

#### Register the route in `vercel.json`

Check the existing `vercel.json` rewrites/functions block. The current
catch-all `api/x402/*.js` rewrite (collapsed in recent commits — see
`36dfec9a fix(vercel): collapse functions block to a single wildcard`) most
likely already routes `/api/x402/asset-download` automatically. Confirm via
`grep -n asset-download vercel.json` plus a `curl -sI http://localhost:3000/api/x402/asset-download?slug=...`
after `npm run dev`.

### D. Surface SIWX status on `/api/x402-status`

Read [api/x402-status.js](../../api/x402-status.js) and append a new section
to the JSON it returns:

```js
siwx: {
  configured: true,
  paymentsRowCount: <int from `select count(*) from siwx_payments`>,
  noncesRowCount:   <int from `select count(*) from siwx_nonces`>,
  evmVerifierConfigured: Boolean(env.BASE_RPC_URL),
}
```

Wrap the count queries in a try/catch — `siwx_payments` may not exist on a
brand-new database — and return `{ configured: false, error: err.message }`
when the SELECT throws. Don't fail the whole status endpoint.

### E. Documentation

Add one section to [docs/api-reference.md](../../docs/api-reference.md) (or
the closest existing reference page — check `ls docs/`) describing:

- The SIWX flow on three.ws.
- The `sign-in-with-x` extension declared in 402 bodies.
- The `SIGN-IN-WITH-X` header clients send to skip payment.
- That `paid_assets` is the canonical example, and that any new
  `paidEndpoint()` can opt in by adding `siwx: { statement, ttlSeconds }`.

Keep it to ~60 lines. No marketing copy.

## Verification you must perform

```bash
# 1. Migrations applied
DATABASE_URL=$DATABASE_URL node scripts/apply-siwx-migration.mjs
DATABASE_URL=$DATABASE_URL node scripts/apply-paid-assets-migration.mjs

# 2. Seed runs (uploads to R2, inserts rows)
R2_*=... DATABASE_URL=$DATABASE_URL node scripts/seed-paid-assets.mjs

# 3. Dev server up
npm run dev
# In a second terminal:

# 4a. First request: 402 with SIWX extension declared
curl -sS http://localhost:3000/api/x402/asset-download?slug=pole-dancer-rumba | jq .
curl -sSI http://localhost:3000/api/x402/asset-download?slug=pole-dancer-rumba | grep -i payment-required
#   Confirm the PAYMENT-REQUIRED header decodes to a body containing
#   extensions['sign-in-with-x'].

# 4b. /api/x402-status reports siwx { configured: true, ... }
curl -sS http://localhost:3000/api/x402-status | jq .siwx

# 4c. Existing endpoints still work
curl -sS http://localhost:3000/api/x402/skill-marketplace | jq .
curl -sS 'http://localhost:3000/api/x402/dance-tip?dancer=1&dance=rumba' | jq .
```

You don't need to drive the SIWX retry from `curl` here — that's the
verify dance in prompt 07. For this prompt the goal is: the extension is
advertised, the seed assets exist, the status endpoint sees the tables.

## Done means

- `api/x402/skill-marketplace.js` and `api/x402/dance-tip.js` each have one
  new `siwx:` block in their `paidEndpoint(...)` call; no other diff.
- `api/x402/asset-download.js` exists, is end-to-end wired, returns
  presigned R2 URLs, and respects per-asset payout overrides.
- `paid_assets` table exists and is seeded with two real GLBs from `public/`.
- `api/x402-status.js` reports SIWX configuration + table counts.
- `docs/api-reference.md` (or equivalent) explains the flow.
- Browser test on http://localhost:3000 shows clean network tab + no
  console errors when hitting the three endpoints.
- `git diff` reviewed.

Do not commit or push.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/siwx/04-wire-endpoints.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
