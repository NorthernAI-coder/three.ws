# 05 — Secrets & env hygiene

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 0 — Foundation
**Owns:** `.env*`, `vercel.json` (`env`), `api/`, `workers/`, `.gitignore`, anything reading `process.env`.
**Depends on:** none. Run early — a leaked key is a $1B-killer.

## Why this matters for $1B
A single leaked private key (Solana parent secret, RPC key, bot token) can drain
funds and end the company. Diligence teams scan git history for secrets. This must be
airtight.

## Mission
Guarantee no secret is committed, every secret is loaded from the environment with a
clear failure when missing, and the set of required env vars is documented and
validated at boot.

## Map
- Required secrets referenced across the codebase include (verify the live set):
  `THREEWS_SOL_PARENT_SECRET_BASE58`, Solana RPC keys, `TELEGRAM_BOT_TOKEN`,
  `TELEGRAM_CHANGELOG_CHAT_ID`, OpenAI/Anthropic keys (via worker proxies), x402
  facilitator config.
- `vercel.json` has an `env` block. Functions in `api/`, workers in `workers/`.

## Do this
1. Scan the working tree **and git history** for committed secrets (use
   `git log -p` filtered, or a tool like gitleaks/trufflehog run locally). Treat any
   hit as an incident: rotate the key, purge if feasible, and document.
2. Confirm `.gitignore` excludes `.env`, `.env.*` (except `.env.example`), key files,
   and any wallet keypair JSON. Add what's missing.
3. Create/maintain a complete `.env.example` listing **every** env var the app reads,
   grouped by surface, with a one-line description and whether it's required. Derive
   the list by grepping `process.env.` across `api/`, `workers/`, `src/`, `scripts/`.
4. Add a startup/env-validation step (a small `api/_lib/env.js` or similar) that, on
   cold start, asserts required vars are present and fails loud with a precise message
   naming the missing var — never a silent undefined that 500s later.
5. Ensure secrets are read server-side only. Grep `public/` and client `src/` for any
   secret-looking value or `VITE_`-exposed secret that should be server-only. Move
   them behind an API route or worker proxy.
6. Confirm the AI provider keys are only ever used via the worker proxies, never
   shipped to the client (per `/CLAUDE.md` stack notes).
7. Document secret rotation steps in `docs/` (where to rotate each, blast radius).

## Must-not
- Do not print secrets in logs or error messages.
- Do not commit a real key even to `.env.example` — use obvious placeholders.
- Do not expose any secret via a `VITE_`/client-bundled var.

## Acceptance
- [ ] git history + working tree scanned; zero live secrets present (rotations done if found).
- [ ] `.gitignore` covers all secret/keypair patterns.
- [ ] `.env.example` is complete and grouped, derived from actual `process.env` usage.
- [ ] Boot-time env validation fails loud on missing required vars, naming each.
- [ ] No secret reachable from the client bundle.
- [ ] Rotation runbook written in `docs/`.
