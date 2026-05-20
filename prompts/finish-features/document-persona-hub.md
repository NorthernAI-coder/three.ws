# Task: Complete `docs/persona-hub.md`

## Repo context

Working tree: `/workspaces/three.ws`. The "Persona Hub" is a feature that
issues short-lived signed identity tokens to tenant applications so they
can verify which user is making a request without re-implementing auth.
Pieces involved:

- `scripts/generate-persona-key.mjs` — generates a keypair for ES256
  signing.
- `api/auth/persona/issue.js` (or under `api/auth/[action].js`) — issues
  the persona token after the user authenticates here.
- `api/auth/persona/verify.js` (or under `api/auth/[action].js`) —
  verifies a token presented by a tenant.
- `/.well-known/jwks.json` — publishes the active public keys so tenants
  can verify offline.
- HS256 fallback for dev / when no ES256 key is configured.

`docs/persona-hub.md` exists but is partial. This task is **docs only**
— do not change any code.

## Rails (CLAUDE.md — non-negotiable)

- No mocks, no fake data, no placeholders, no TODOs, no stubs.
- Examples in the doc must be **real code that runs** against the
  shipped endpoints. Test every snippet end-to-end before committing
  the doc.
- Done = doc renders cleanly, every snippet has been executed once.
- Push to both remotes only when the user says push.

## What to implement

### Step 1 — read the current code (delegate to subagent)

Spawn an **Explore** subagent with this prompt:

> In `/workspaces/three.ws`, find and summarize the Persona Hub
> implementation. Return:
>
> 1. Where `scripts/generate-persona-key.mjs` lives and what it does
>    (output format, env vars set).
> 2. The exact path + HTTP method of the issue endpoint, request body
>    shape, response body shape, auth requirement.
> 3. The exact path + HTTP method of the verify endpoint, request body
>    shape, response body shape.
> 4. The path serving `/.well-known/jwks.json` and the JWK format it
>    publishes.
> 5. The ES256 → HS256 fallback logic: under which condition does it
>    fall back? Where in the code is that decided?
> 6. Any rate limits, scopes, or audience claims enforced.
>
> Quote file paths with line numbers. Do not modify anything.

### Step 2 — read the current doc

```bash
cat docs/persona-hub.md
```

Identify what is already covered vs missing.

### Step 3 — rewrite `docs/persona-hub.md` to cover

The final doc must include, in this order:

1. **Overview** — one paragraph: what Persona Hub is, who issues
   tokens, who verifies them, what a tenant is, why ES256 (offline
   verification via JWKS).
2. **Key generation** — how to run `scripts/generate-persona-key.mjs`,
   what files / env vars it produces, where the private key must live
   (Vercel env var name), where the public key is published.
3. **Issuing a token** — full request/response with a curl example and
   a fetch example. Include the auth requirement (session cookie?
   bearer? CSRF?). Show the decoded JWT claims (iss, aud, sub, exp,
   custom claims).
4. **Verifying a token (tenant side)** — two complete code examples:
   - Node.js using `jose` (verify against JWKS). Show the import,
     the JWKS fetch + cache, and the verify call.
   - Browser using `jose` from a CDN (or a bundler import). Same
     shape.
   Both examples must be runnable as-is once the reader fills in the
   issuer URL.
5. **ES256 vs HS256 fallback** — explain exactly when the server falls
   back to HS256 (e.g. no ES256 private key set), and what tenants
   should do in that environment (they can't verify offline; they must
   call the verify endpoint).
6. **Tokens in practice** — a one-paragraph note on rotation, TTL,
   revocation (or explicit "no revocation list — short TTL only").
7. **Troubleshooting** — list of common errors (`jwks_uri unreachable`,
   `kid not found`, `alg mismatch`, `aud mismatch`, `expired`) with the
   one-line fix for each.

### Step 4 — verify every snippet

For each code snippet in the doc:

1. Copy it into a scratch file (do not commit the scratch).
2. Fill in the issuer URL with `http://localhost:3000` (or wherever the
   local dev server runs).
3. Run it against `npm run dev`.
4. Confirm it does what the doc says it does.

If a snippet fails, fix the doc (or the snippet) until it works. Never
ship a "should work" example you have not executed.

### Step 5 — sanity check links

Every relative link in the doc must resolve to a file that exists.
Every external link must return 200.

## Definition of done

- `docs/persona-hub.md` covers all seven sections listed above.
- Every code snippet in the doc has been executed at least once
  against the local dev server.
- All links resolve.
- No code changes (only the doc and possibly a `.gitignore` line if a
  generated key file path needs ignoring).
- `git diff` shows only the doc changing.

## Constraints

- Do not add code under `src/` or `api/`. Docs only.
- Do not include screenshots — keep it text + code.
- Do not invent endpoint shapes — read the actual handlers via the
  Explore subagent and quote them.
- If the Explore subagent reports that an endpoint is missing or
  broken, stop and report — do not paper over a broken endpoint with
  doc text.
