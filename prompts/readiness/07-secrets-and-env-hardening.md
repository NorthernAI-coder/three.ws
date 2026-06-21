# 07 — Secrets & environment hardening

**Phase 2. [parallel-safe]** with 08–11.

## Where you are

`/workspaces/three.ws` — three.ws, 3D AI-agent platform. Backend is Vercel
functions (`api/`) + Cloudflare workers (`workers/`). There are ~275 keys in
`.env.example`. Read [CLAUDE.md](../../CLAUDE.md). The only coin is **$THREE**.

## Objective

A clean, documented, leak-proof secrets posture: nothing secret in the repo, a
single canonical inventory of every env var (what it's for, where it's set, is
it required), startup validation that fails loudly on missing critical config,
and a verified separation between client-exposed and server-only values.

## Why it matters

275 env vars is a large attack surface. One leaked private key (Solana deploy
wallet, parent SNS secret, Telegram bot token, RPC API key) is a catastrophic,
irreversible event for a token platform. Institutional readiness means you can
prove no secret is in the tree and every required one is validated at boot.

## Instructions

1. **Scan for committed secrets** (history included):
   ```bash
   grep -rIn "PRIVATE_KEY\|SECRET\|_TOKEN\|BASE58\|sk-\|AKIA\|-----BEGIN" --include=*.js --include=*.json --include=*.env* . | grep -v node_modules | grep -v ".env.example"
   git log --all -p -S "PRIVATE_KEY" -- . | head -200   # spot-check history for leaks
   ```
   If a real secret is found in the tree or history, treat it as compromised:
   rotate it (tell the user which key to rotate and where) and remove it. Do not
   just delete the line.
2. **Client vs server boundary.** Any secret referenced in `public/` or in
   client bundles is exposed. Confirm only intentionally-public values (e.g.
   `VITE_`-prefixed, public RPC URLs, publishable keys) appear client-side.
   Anything sensitive in client code is a leak — move it behind an `api/` proxy.
3. **Build the canonical inventory.** Generate `docs/configuration.md` (or update
   it) and a checked-in `.env.example` that lists **every** var with: one-line
   purpose, `required|optional`, `server|client`, and which feature breaks
   without it. Derive the list from actual `process.env.X` / `import.meta.env.X`
   usage:
   ```bash
   grep -rohE "process\.env\.[A-Z0-9_]+|import\.meta\.env\.[A-Z0-9_]+" --include=*.js . | grep -v node_modules | sort -u
   ```
   Flag any var used in code but missing from `.env.example`, and any var in
   `.env.example` never used in code (dead — remove).
4. **Startup validation.** Add a single `assertEnv()` / config-loader module that,
   at function/worker cold start, validates the critical secrets for that surface
   are present and well-formed, and fails with a clear message naming the missing
   var. No feature should fail deep in a request because a key was silently
   undefined.
5. **`.gitignore` audit.** Confirm `.env`, `.env.*` (except `.env.example`),
   keypair files, and `~/.claude/*` artifacts are ignored. Add any gaps.
6. **Rotation runbook.** Document in `docs/configuration.md` how to rotate each
   class of secret (Solana keypair, RPC key, Telegram token, SNS parent secret)
   and where it's set (`vercel env`, CF dashboard, etc.).

## Definition of done

- [ ] No real secret in the working tree or surfaced from history (or any found
      one is flagged for rotation with exact instructions to the user).
- [ ] No sensitive value reachable from client bundles; sensitive lookups proxied
      through `api/`.
- [ ] `.env.example` lists every used var with purpose/required/scope; no
      used-but-undocumented and no documented-but-dead vars remain.
- [ ] `assertEnv()` validates critical config at cold start on each surface and
      fails loudly with the missing var name. Verified by temporarily unsetting
      one in dev.
- [ ] `.gitignore` covers all secret/keypair/artifact patterns.
- [ ] Rotation runbook in `docs/configuration.md`.
- [ ] Changelog: skip (internal hardening) unless a user-facing config UX changed.
