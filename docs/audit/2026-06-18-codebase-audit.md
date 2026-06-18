# three.ws Codebase Audit — 2026-06-18

Full-repo audit of the three.ws monorepo: backend (`api/`, `workers/`), frontend
(`src/`, `pages/`, `public/`), SDKs (`sdk/`, `*-sdk/`, `packages/*`), MCP servers,
and on-chain contracts (`contracts/`). The audit paired the repo's own mechanical
tooling (eslint, tsc, knip, `audit:*` scripts, vitest) with targeted manual
review against the [CLAUDE.md](../../CLAUDE.md) operating rules.

## Headline

**The codebase is in strong, production-ready shape.** Every one of the repo's
own structural audits passes clean:

| Check | Result |
|---|---|
| `audit:handlers` (empty API handlers) | ✓ 872 handlers, all export a body |
| `audit:pages` (route ↔ manifest parity) | ✓ 103 routes, all documented |
| `audit:mcp` (manifest consistency) | ✓ 14 manifests consistent |
| `audit:deploy` (symlinks / peers / undeclared imports) | ✓ clean |
| `typecheck` (`tsc -p jsconfig.json`) | ✓ 0 errors |

No mocks, fake-data arrays, `setTimeout` fake-loading, `throw new
Error("not implemented")`, or non-`$THREE` coin references were found in shipped
source. The findings below are therefore **hardening and consistency** work, not
"the platform is broken" work — with one genuine security issue at the top.

## Findings (verified)

Severity reflects real, reproduced issues. Several findings surfaced by the
exploration pass were **investigated and dismissed** — see
[Dismissed findings](#dismissed-findings-false-positives) so they don't get
re-reported.

### HIGH

**H1 — Clickjacking: `frame-ancestors *` on the global route default.**
`vercel.json` route `"/(.*)"` (the catch-all applied to every response via
`continue: true`) sets `frame-ancestors *` and lacks `x-frame-options`. That
makes every non-auth page — `/`, `/marketplace`, `/agents`, `/forge`,
`/launches`, `/chat` — embeddable in an `<iframe>` on any origin, the classic
clickjacking precondition. The auth-sensitive routes
(`/login|register|wallet|dashboard|…`) are *correctly* locked to
`frame-ancestors 'self'` + `x-frame-options: SAMEORIGIN`, and the embed/widget
routes (`/embed`, `/widget`, `/walk`, …) *intentionally* keep `*`. The fix is to
flip the global default to `'self'` (+ `x-frame-options: SAMEORIGIN`); the
later, more-specific embed routes still override back to `*` because Vercel
merges headers with last-match-wins. **Status: fixed in this pass.**

### MEDIUM

**M1 — UUID regex duplicated across ~73 API files.** The literal
`const UUID_RE = /^[0-9a-f]{8}-…$/i` is redeclared in 73 `api/**` handlers even
though `api/_lib/validate.js` already exports `isUuid()`. Pure DRY debt: a format
change today means editing 73 files. **Status: consolidated in this pass** —
all sites now import `isUuid` from `_lib/validate.js`.

**M2 — Pagination clamp logic duplicated across ~20 endpoints.** The pattern
`Math.min(Math.max(parseInt(url.searchParams.get('limit') || 'N', 10), 1), MAX)`
(and the `offset` twin) is copy-pasted across ~20 handlers with no shared helper.
**Status: shared helper `api/_lib/http-params.js` added and the duplicated sites
migrated in this pass.**

**M3 — `IdentityRegistry.sol` uses `.transfer()` for ETH payouts.**
`withdraw()` (L246) and `spend()` (L274) send ETH with `recipient.transfer(...)`,
which forwards only 2300 gas and reverts when the recipient is a smart-contract
wallet (Gnosis Safe, AA wallet) with a non-trivial `receive()`. The sibling
`ReputationRegistry.sol` already uses the correct `(.call{value:}(""))` +
success-check pattern. Both functions already carry `nonReentrant`, so the
checked-call form is safe. **Status: fixed in this pass** (forge tests could not
be run locally — `forge` is not installed in this environment; the change
mirrors the audited pattern already shipped in `ReputationRegistry`).

### LOW

**L1 — knip: 9 duplicate named/default exports.** e.g. `api/_lib/embeddings.js`
(`OPENAI_EMBED_TAG`), `src/shared/log.js` (`log`/`default`),
`src/agent-protocol.js` (`protocol`/`default`). Harmless but noisy; collapse to a
single export form where trivial.

**L2 — eslint warnings: console + empty-block + unused-var noise in `workers/`.**
~5083 warnings (0 blocking), concentrated in `workers/agent-sniper/**` and
`workers/oracle/**` (deliberate operational logging) and a handful of
`catch {}` empty blocks. Not shipped to the browser; track but don't churn.

**L3 — Unused exports flagged by knip** across `packages/*` MCP libs (e.g.
`tts-nvidia.js` helpers, `three-token-mcp` config). Several are public-API
surface kept intentionally; prune only the genuinely-dead ones.

## Dismissed findings (false positives)

Recorded so they aren't re-raised:

- **"SDK `dist/` / `.d.ts` missing → packages unpublishable" (claimed CRITICAL).**
  False. `agent-payments-sdk` (`tsup`, `dts: true`), `agent-protocol-sdk` (`tsc`),
  and `agent-ui-sdk` (`build.mjs`) all build their declarations in
  `prepublishOnly`, and `dist/` exists locally — it is simply `.gitignore`d. The
  npm tarball is regenerated at publish time; nothing is broken.
- **"`frame-ancestors *` on embed/widget routes is a vuln."** Intentional — those
  surfaces exist to be embedded. Only the *global default* (H1) was wrong.
- **"Hardcoded USDC mint / RPC URLs in SDKs."** These are the canonical Base/Solana
  USDC mints and public RPC defaults, overridable by env. Not a coin-policy
  violation (USDC is settlement plumbing, not a promoted coin) and not a bug.
- **"`MESHY_API_KEY=msy_your_key_here` is a leaked secret."** It is a labelled
  placeholder in `.env.example`, not a real key.

## Methodology

- Mechanical: `npm run lint`, `npm run typecheck`, `npx knip`,
  `npm run audit:handlers|audit:pages|audit:mcp|audit:deploy`, `npm run test:core`.
- Manual: four parallel read-only surface sweeps (api, frontend, sdk/mcp,
  contracts/config) against the CLAUDE.md hard rules, with every high-severity
  claim re-verified by hand before inclusion here.

See [remediation.md](./remediation.md) for what was changed in this pass and what
is deferred.
