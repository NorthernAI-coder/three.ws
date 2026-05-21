# Scripts

This directory contains various scripts for the 3D-Agent application.

## Usage

...

## Operational

### `set-r2-cors.mjs` — apply the bucket CORS policy

Runs the canonical CORS policy against the R2 bucket holding all media
(avatars, thumbnails, posters). Required for browser reads (`<model-viewer>`,
`<img>`, `fetch`) and presigned uploads to work cross-origin.

```sh
vercel env pull .env
node scripts/set-r2-cors.mjs            # apply
node scripts/set-r2-cors.mjs --get      # show what's currently live
node scripts/set-r2-cors.mjs --dry-run  # print the policy without pushing
```

Allowed origins are defined inline in the script — edit `ALLOWED_ORIGINS`
when you add a new domain (preview branch, staging host, etc.) and re-run.
Idempotent: re-running with the same policy is a no-op.

Run this any time you see `No 'Access-Control-Allow-Origin' header` errors
on assets served from `*.r2.dev` or your custom R2 domain.
