# Tests

How the three.ws test suite is organized, how to run each part, and which parts
need credentials. Real money rides on this code — green has to mean green.

## TL;DR

```bash
npm run test:core      # full vitest suite, single worker — the reliable local run
npm run test:gate      # 7 critical money/auth files — fast, offline, mock-backed
npm run lint           # eslint . (0 errors is the bar; warnings are a backlog)
npm run typecheck      # tsc -p jsconfig.json — must stay clean (hard CI gate)
```

## Suites

| Command | Runner | What it covers | Needs creds? |
| --- | --- | --- | --- |
| `npm test` | vitest + playwright | Unit suite then the browser e2e specs | Some unit specs are creds-gated (skip cleanly); e2e needs Chromium |
| `npm run test:core` | vitest `--maxWorkers=1` | Same unit suite, serialized | No (creds-gated specs skip) |
| `npm run test:gate` | node `scripts/test-gate.mjs` | 7 highest-consequence files: money-path confirm, HTTP cache boundary, custody/spend guards, vanity flow, x402 verify, holder snapshot, healthz | No — offline + mock-backed |
| `npm run test:e2e` | playwright | `tests/**/*.spec.js` — boots `npm run dev` as its web server | Chromium (`npx playwright install chromium`) |
| `npm run test:pages` | node `scripts/test-pages.mjs` | Chromium health pass over every public route (thrown errors, console errors, dead requests, broken hero images) | Chromium; spawns its own vite |
| `npm run test:all` | — | `test` then `test:pages` | as above |
| `npm run test:mcp` | node `scripts/test-mcp-all.mjs` | MCP transport surface | varies |
| `npm run smoke:onchain` | node | Live Solana/RPC parity checks | RPC access |
| `npm run smoke:agent-wallet` | node | Agent wallet path | wallet/CDP creds |
| `npm run smoke:mcp` | node | Remote MCP endpoints | live endpoints |

`vitest` discovers `tests/**/*.test.{js,mjs}`, `src/**/*.test.js`,
`api/_lib/coin/**/*.test.js`, and `tour-sdk/test/**/*.test.mjs`
(see `vitest.config.js`).

## Credentials

Credential-gated specs **skip cleanly** when their env var is absent — they do not
fail. They run wherever the secret is present (CI secrets, a local `.env`). The
common ones, by frequency in the suite:

`NVIDIA_API_KEY`, `HF_TOKEN`, `JWT_SECRET`, `REPLICATE_API_TOKEN`,
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, `OPENAI_API_KEY`,
`GROQ_API_KEY`, `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET`, `OPENROUTER_API_KEY`,
`DATABASE_URL`, `BIRDEYE_API_KEY`.

A local run with none of these set is expected to show skips, not failures. If you
see a creds-gap spec *fail* rather than skip, that's a bug in the gate — fix the
guard, don't delete the test.

## Concurrency / flakes

Heavy cold ESM imports (Solana toolchain, `@coinbase/x402`, jsdom, neon) make
worker startup memory-hungry. `vitest.config.js` already caps forks
(`MAX_FORKS`) and sets a 120s test/hook timeout for this reason.

On a loaded box (e.g. a Codespace shared by several agents) the default
fork count can still starve and surface as `Timeout waiting for worker to
respond` — that's the host, not the test. When in doubt, run **`npm run
test:core`** (single worker): it's slower but does not flake on CPU contention.
Treat any failure that only appears under heavy load and disappears at
`--maxWorkers=1` as an environment artifact, not a regression.

## CI

`.github/workflows/ci.yml` runs **lint**, **typecheck**, **unit tests**
(`vitest run`), **source guards** (`check-api-not-bundled`, `check:images`,
`build:pages`), **page health** (`test:pages`), and **e2e** (`playwright test`)
on every push to `main` and every PR, and blocks merge on failure. Typecheck is
a hard gate (the JSDoc backlog is cleared). Lint blocks on errors only; the
~5.5k pre-existing warnings are a tracked backlog — tighten to
`--max-warnings 0` once burned down.
