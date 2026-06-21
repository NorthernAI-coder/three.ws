# 05 — Secrets & env hygiene

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/billion-dollar-program/00-README.md`
> for shared context.

## Why this matters for $1B

This platform holds custody keys, x402 payment routing addresses, RPC and AI
provider credentials, and a Telegram bot token. A single leaked secret in git
history is a wallet drain or a takeover — the kind of incident that ends a $1B
trajectory overnight. Equally damaging in slow motion: an undocumented env var
that makes a surface silently fail in production because nobody knew to set it.
Both must be closed: nothing secret committed, everything required documented.

## Mission

Ensure `.env.example` documents every env var the code actually reads, no secret
is committed or sits in git history, anything ever exposed is rotated, and the
required env per surface is documented.

## Map (trust but verify — files move)

- **Centralized env access** — [api/_lib/env.js](../../api/_lib/env.js). Lazy by
  design: `req()` throws at first use on a missing var, `opt()`/`addr()` for
  optional/address values. This is the canonical inventory of what the backend reads.
- **Env template** — [.env.example](../../.env.example) (~246 documented vars,
  grouped by surface; copy to `.env.local` for dev). The doc that must stay in
  sync with what the code reads.
- **Secret handling** — [api/_lib/secret-box.js](../../api/_lib/secret-box.js)
  (encryption at rest), [api/_lib/agent-wallet.js](../../api/_lib/agent-wallet.js)
  (custody key derivation/spend guards).
- **Deploy env surface** — [vercel.json](../../vercel.json) (functions, crons,
  headers; env is set in the Vercel dashboard, not committed).
- **Ignore rules (already block .env files)** — [.gitignore](../../.gitignore)
  (lines for `.env`, `.env.local`, `.env*.local`, `.env*`, etc.).
- **Note:** there is currently **no** dedicated secret-scan workflow in
  [.github/workflows/](../../.github/workflows) — installing one is in scope.

## Do this

1. **Build the read-set.** Grep every `process.env.X`, `req('X')`, `opt('X')`,
   `addr(env.X)` across [api/](../../api), [src/](../../src), [workers/](../../workers),
   and [scripts/](../../scripts). Dedupe into the authoritative list of vars the
   code reads. `api/_lib/env.js` is the spine; capture the rest too.
2. **Reconcile with `.env.example`.** Diff the read-set against
   [.env.example](../../.env.example). Add every read-but-undocumented var with a
   one-line comment (purpose, format, whether required), grouped under its surface.
   Mark each as required/optional. Remove entries for vars no longer read.
3. **Scan working tree + history for committed secrets.** Run a real scanner —
   `npx gitleaks detect --no-banner` (or `npx --yes @trufflesecurity/trufflehog
   git file://. --only-verified`). Triage every hit: real secret vs. test fixture
   vs. example placeholder. Treat the $THREE CA and clearly-synthetic placeholders
   as non-secrets.
4. **For any real secret found committed or in history:** rotate it at the provider
   immediately, update the value in Vercel/Upstash/etc. (never in the repo), and
   document the rotation in this task's report. A scrubbed value that was ever
   pushed is already compromised — rotation is non-negotiable; removal alone is not.
5. **Confirm `.gitignore` coverage.** Verify every `.env*` variant and any local
   key/credential file is ignored (`git check-ignore .env .env.local`). Add any
   gap. Ensure no `.env*` file is currently tracked (`git ls-files | grep -E '\.env'`).
6. **Document required env per surface.** For each major surface (Forge/text→3D,
   wallet/x402, pump.fun/Oracle, MCP, Solana RPC), list the vars it needs to
   function so an operator knows what to set. Keep this in `.env.example` group
   comments — the existing file is already grouped by surface; extend that pattern.
7. **Verify graceful degradation.** Confirm a surface with a missing optional var
   fails honestly (designed error/clear log) rather than crashing unrelated
   endpoints — the lazy `req()` pattern in `env.js` exists for exactly this; check
   it holds for any var you add.
8. **Add a secret-scan CI gate** (no GitHub Actions secret scan exists today): a
   `gitleaks` job in [.github/workflows/ci.yml](../../.github/workflows/ci.yml) so
   future pushes are blocked on a committed secret. Run `npx vitest run` to confirm
   nothing broke. Add a `data/changelog.json` entry only if a user-visible/security
   change resulted, then `npm run build:pages`.

## Must-not

- Do not commit any real secret, key, or token — values live in Vercel/Upstash,
  not the repo. `.env.example` holds placeholders only.
- Do not "fix" an exposed secret by deleting it from the file without rotating it
  at the provider — an exposed secret is a compromised secret.
- Do not paste a real coin's mint/creator/holder address anywhere; the only coin
  is `$THREE` (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).
- Do not introduce mocks, stubs, or TODOs; do not weaken `env.js` guards.
- Do not log secret values in any new error path you add.

## Acceptance (all true before claiming done)

- [ ] Every env var read by `api/`, `src/`, `workers/`, `scripts/` is documented in
      `.env.example` (purpose + format + required/optional), grouped by surface.
- [ ] `gitleaks`/`trufflehog` scan of working tree **and** history is clean (or
      every finding triaged as a non-secret placeholder, documented).
- [ ] Any real secret ever committed is rotated at the provider and the rotation
      is recorded; no secret value sits in the repo or history.
- [ ] No `.env*`/credential file is tracked; `.gitignore` covers all variants.
- [ ] Required-env-per-surface is documented so an operator can configure cleanly.
- [ ] A secret-scan CI gate is added to `ci.yml`; `npx vitest run` passes.
- [ ] Only `$THREE` referenced; changelog updated if any user-visible/security
      change resulted and `npm run build:pages` is clean.
