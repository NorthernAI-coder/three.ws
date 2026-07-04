# Mainnet end-to-end test — 2026-07-03

Real-SOL verification of every money-touching surface, run against production three.ws with a throwaway burner wallet. Audience: engineers. Every claim below carries a transaction signature or an HTTP transcript reference.

## Parameters

| | |
| --- | --- |
| Burner wallet | `FGwp62JfNaX2oqQctKZkmY7PM3ey21HgtsRda6A1B3rg` (secret at `~/.threews-test-keypair.json`, mode 600, off-repo) |
| Funded | 0.759860663 SOL — sig [`39JT2pCBRCVK5E11jkzDd66auF71bPxtkgJb63NTLCa6hXsSWnyJjcEYaxLKPnKwANpVcikPFf8Trqcrik2Lfkup`](https://solscan.io/tx/39JT2pCBRCVK5E11jkzDd66auF71bPxtkgJb63NTLCa6hXsSWnyJjcEYaxLKPnKwANpVcikPFf8Trqcrik2Lfkup) at 2026-07-03T23:24:32Z |
| Sweep-back address | `wwwqvAbN4RjaRvfGsorxMuauq7SWVcV13Aa7GaqHGUn` (owner-provided) |
| Rails | No mainnet sniper strategies armed (prod auto-funder foot-gun). Master/treasury untouched. Spend caps + withdraw allowlist on every custodial wallet at creation. Full sweep-back at end. |

## Ledger

Running log, newest last. ✅ pass · ❌ fail · ⚠ degraded/blocked (with reason).

| # | Time (UTC) | Surface | Action | Result | Proof |
| --- | --- | --- | --- | --- | --- |
| 0 | 23:24 | funding | 0.759860663 SOL received | ✅ | `39JT2pCB…Lfkup` |
| 1 | 23:3x | infra | Apex `three.ws` returning `DEPLOYMENT_NOT_FOUND` / 404 on every route | ⚠→✅ | self-healed once `dpl_EjRk25U6…` (23:06 prod build) reached READY and auto-promoted; was genuinely between-deployments |
| 2 | 23:41 | auth | SIWS login (nonce → sign → verify) | ❌ | `GET /api/auth/siws/nonce` → **500** `internal_error` ref `6e9e719e2475fb87` |
| 3 | 23:41 | auth | SIWE login (ethereum) — cross-check | ❌ | `GET /api/auth/siwe/nonce` → **500** ref `968c1908874bda75` |
| 4 | 23:41 | health | Read-only endpoints sanity | ✅ | `/api/trades/feed`, `/api/oracle/stats` (scored_total 53,630), `/api/agents/public`, `/api/leaderboard` all 200 with real data |

**Test is BLOCKED at authentication.** No SOL spent beyond the inbound funding. Burner holds 0.759860663 SOL (recoverable in full minus a sweep fee).

## Active production bug: wallet sign-in is down

`GET /api/auth/siws/nonce` and `GET /api/auth/siwe/nonce` both 500 on their `INSERT INTO {siws,siwe}_nonces`. This blocks **every wallet login on production** (Solana and Ethereum), not just this test.

### Evidence

- Both nonce writers fail identically; every read-only DB endpoint returns 200 with real data → the DB connection is healthy and the NEW Neon instance is populated. The failure is specific to these two tables' writes.
- The insert SQL is trivial and unchanged: [api/auth/siws/[action].js:53](../../api/auth/siws/[action].js#L53) `insert into siws_nonces (nonce, expires_at) values (…)`; same shape in [api/auth/siwe/[action].js:52](../../api/auth/siwe/[action].js#L52).
- These tables are defined in `api/_lib/migrations/2026-05-21-siwx.sql`.
- **Migrations are manual** (`npm run db:migrate` → `scripts/apply-migrations.mjs`); there is **no migration step in the Vercel build/deploy** (`scripts/build-vercel.mjs` runs no migration).
- Per the account-migration memo, prod moved to a new Neon DB in July 2026. A manual migration run that missed this file — or copied the migration-tracking table without the tables — leaves `siws_nonces`/`siwe_nonces` absent on the new DB while reads keep working.

### Most likely root cause

`siws_nonces` / `siwe_nonces` do not exist (or aren't writable) on the new production Neon DB — the SIWX migration was not applied to it. Cannot be 100% confirmed without DB access (see below).

### Fix (needs owner — I have no prod DB access)

Run against the production `DATABASE_URL`, from a machine that has it:

```bash
npm run db:migrate            # applies all pending migrations incl. 2026-05-21-siwx.sql
# or, targeted + idempotent:
DATABASE_URL=<prod> node scripts/apply-siwx-migration.mjs
```

Both are idempotent (every CREATE is `IF NOT EXISTS`). Then re-hit `/api/auth/siws/nonce` — expect 200.

I could not obtain `DATABASE_URL` from here: `vercel env pull` produced no file (sensitive vars pull empty on this account, matching the migration memo). To let me run it and continue the test unattended, either provide the prod `DATABASE_URL` or run one of the commands above yourself.

### Secondary observation (not a blocker)

The apex was fully down (`DEPLOYMENT_NOT_FOUND`) during the deploy window because production builds are slow — one prior build hit `BUILD_EXCEEDED_MAXIMUM_TIME`, and there were **no READY deployments to fall back to** during the gap. The site is up now, but there is no green deployment to instant-rollback to if the next build fails. Worth a separate look at build time (46 workspaces, `build:vercel`).

## Findings

(Authenticated tiers pending — blocked on the auth fix above.)
