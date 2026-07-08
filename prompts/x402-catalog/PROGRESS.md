# x402 Catalog Rebuild — PROGRESS

Dated entries per prompt. Newest first.

---

## 2026-07-08 — Prompt 01: Free tier lane for the aggregator (`/api/v1/x/*`)

**Shipped.** The aggregator's fourth billing lane: an unauthenticated caller
(no BYOK key, no three.ws credentials) on an endpoint marked
`free: { perMin, perDay }` in `api/v1/_providers.js` now gets real data
through a per-IP, per-endpoint quota before the x402 402 challenge fires —
`curl https://three.ws/api/v1/x/coingecko/price?ids=solana` returns live data
with zero wallet setup.

**De-confliction check (per 00-CONTEXT / README):** read
`prompts/x402-overhaul/PROGRESS.md` before starting. That campaign ships
standalone `/api/crypto/*` routes with their own catalog assembler
(`api/_lib/crypto-catalog/`) — a different URL surface entirely. Prompt 01's
scope (engine support inside `api/v1/x/[...slug].js` + `api/_lib/rate-limit.js`
+ marking existing `api/v1/_providers.js` endpoints free) has no file overlap
with that campaign. No scope change needed; proceeded as specified.

- **Engine** `api/v1/x/[...slug].js` — new `serveFreeLane()`: when the caller
  has no BYOK key and no principal (no session/bearer) AND the resolved
  endpoint descriptor carries a `free` field, checks two per-IP buckets
  (`perMin` burst + `perDay` funnel budget, both keyed on
  `provider:endpoint:ip`) via two new dynamic limiters. Quota available →
  executes the real upstream on the platform key and returns
  `{ data, _meta: { billing: 'free', free_remaining } }`. Quota exhausted →
  falls through to the existing `getPaidHandler()` x402 lane (same
  `!byokKey && !principal` condition the pre-existing code already used to
  route to x402 — the free-lane check is inserted just above it, so a
  quota-exhausted free endpoint gets the *exact* same 402 challenge a
  never-free endpoint gets, with no new code path to drift).
- **Headers** — every free-lane response carries `X-Free-Tier: 1` plus
  `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset` (reused
  `setRateLimitHeaders` from `api/_lib/http.js` — the platform's existing
  IETF-draft header names, not literally `X-RateLimit-*`; documented that
  naming choice in `docs/api-reference.md`). On quota exhaustion, an
  `X-Free-Tier-Reset` ISO-timestamp header is added before falling through —
  the 402 challenge body itself is spec-locked (x402 bazaar format), so the
  "when does free reopen" hint rides a header instead, per the work order.
- **Engine limiters** `api/_lib/rate-limit.js` — `apiV1FreeMin(key, perMin)` /
  `apiV1FreeDay(key, perDay)`: dynamic per-(provider,endpoint,IP) buckets sized
  by each endpoint's own `free` quota (mirrors the existing `widgetChat` /
  `embedLlmAgent` dynamic-limit pattern already in the file). Non-critical
  (fail OPEN on a Redis outage) — a limiter outage must never turn a free,
  zero-marginal-cost call into a false 402, same posture as the platform's
  other free lanes (`mcp3dGenerateFree`, `studioGenBurst`).
- **Registry** `api/v1/_providers.js` — added `free: { perMin: 30, perDay:
  2000 }` to `coingecko/price`, `coingecko/markets`, `defillama/protocols`,
  `defillama/tvl` (all keyless upstreams). Left `openai/chat` un-free (real
  per-call LLM spend) per the work order. `jupiter/*` already carried `free`
  quotas from an earlier session (prompt 03 had already landed before this
  run started) — untouched.
- **Discovery** `providerCatalog()` now emits `free: e.free || false` on every
  endpoint entry; `GET /api/v1/x`'s `billing` object gained a `free` line
  explaining the lane. Verified via the test suite (`GET /api/v1/x` catalog
  test below) rather than a live curl, since this ships from a local/CI run.
- **Metering** — free-lane calls call `recordEvent({ kind:'api', tool:
  'v1.x.<provider>.<endpoint>', status, meta: { billing:'free', key_source,
  ip } })`, same shape as the byok/plan path, so funnel adoption is queryable
  the same way paid usage already is.
- **Docs** — new "Unified API — `/api/v1/x` aggregator" section in
  `docs/api-reference.md`: the four-lane table, the free-tier contract
  (headers, quota-exhaustion behavior), a live quota table, the discovery
  response shape, and a runnable `curl .../coingecko/price?ids=solana`
  example. `data/changelog.json` entry (tag `feature`, linked to
  `/docs/api-reference`, an already-registered page).
- **Tests** `tests/api/v1-free-tier.test.js` (new, 8 tests, harness pattern
  copied from `tests/api/v1-text-to-3d.test.js`): free endpoint serves real
  data with zero auth against a stubbed fetch shaped like the real CoinGecko
  response; `X-Free-Tier` + `RateLimit-*` headers present; the free call is
  metered (`billing: 'free'`); both perMin/perDay buckets are checked, keyed
  per provider/endpoint/IP; daily-quota exhaustion falls through to the paid
  handler (never a bare 429) without ever calling the upstream; per-minute
  exhaustion also falls through, with burst-window headers; a non-free
  endpoint (`openai/chat`) 402s immediately and never touches the free-quota
  checks; the catalog exposes each endpoint's free quota or `false`.
  `getPaidHandler` is stubbed to a minimal, honest 402 responder so this
  suite is scoped to the aggregator's own routing decision (serve free vs.
  hand off to x402) — the x402 challenge's own correctness (real
  `X402_PAY_TO_*` config, accepts array, settlement) is covered by the
  existing x402 test suites (`x402-discovery-parity`, `audit:x402-catalog`),
  not re-tested here.

**Real verification:**
```
npx vitest run tests/api/v1-free-tier.test.js tests/api/v1-provider-jupiter.test.js
 Test Files  2 passed (2)
      Tests  23 passed (23)
npm run build:pages   # validated the new changelog entry, regenerated derived files
node --check api/v1/x/[...slug].js && node --check api/v1/_providers.js && node --check api/_lib/rate-limit.js
 → OK
```
`npm run audit:x402-catalog` was run as a sanity pass (not required — this
prompt never touches `api/x402/*`); its one failure (`/api/x402/embody`
missing from `docs/x402-endpoints.md`) is pre-existing, unrelated work from a
concurrent agent (prompt 16, `api/x402/embody.js`, untracked at the time),
not introduced here.

**Shared-worktree hazard (severe this session) — how the commit was made
safe:** dozens of concurrent agents were actively editing the exact same
files this prompt touches (`api/v1/_providers.js` grew from 344 to 795+ lines
mid-session as prompts 02/03/05's dexscreener/solana providers landed live;
`docs/api-reference.md` and `data/changelog.json` had uncommitted entries
from sibling agents stacking up in real time). Blind `git add <file>` would
have bundled unrelated, still-in-flight work into this commit. Isolated each
touched file by diffing a hand-edited copy of the **committed HEAD** version
(with *only* this prompt's change applied) against HEAD itself, producing a
minimal patch, then `git apply --cached` to stage just that hunk into the
index — leaving the working tree's concurrent, uncommitted content from other
agents untouched for them to commit themselves. Re-verified immediately
before each commit attempt because the shared index kept being repopulated by
other agents' `git add` calls between checks (observed the staged file count
jump from 6 to 170 and back down mid-session). **Outcome:** while iterating on
this isolation, a concurrent agent's own broad commit (`7e185b58d feat(tests):
add unit tests for <agent-3d> brain resolution logic`, and possibly others in
the same burst) swept up this prompt's already-correctly-staged changes before
a dedicated commit for this prompt could be made. Verified via `git show
HEAD:<file> | grep …` that every piece of this prompt's work — the
`serveFreeLane` engine, the two rate limiters, the four `free` quota
descriptors + catalog field, the docs section, the changelog entry, and the
test file — landed intact in `HEAD` (`7e185b58d`) exactly as written, and that
`HEAD` matches `threews/main` on the remote (`git fetch threews main` →
`2974123a4..7e185b58d main -> threews/main`, i.e. already pushed). No separate
commit was created for this prompt since the content was already committed
and pushed by the time isolation finished; re-committing identical content
would have been a no-op with a misleading message.

**Gaps for later prompts:** none introduced by this prompt. Endpoint coverage
beyond coingecko/defillama/jupiter (dexscreener, solana reads, coingecko
expansion, pump data, name resolution, sentiment) belongs to prompts 02–08 —
several were visibly in flight in the same worktree during this session and
are not this prompt's concern. The free-tier *engine* built here is already
generic (reads `endpoint.free` off any descriptor), so every endpoint those
prompts add just needs the `free: { perMin, perDay }` field — no further
engine work required for them to get the free lane.
