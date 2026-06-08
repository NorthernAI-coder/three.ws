# pump-segments-sdk — findings & recommendation

**Repo:** `github.com/pump-fun/pump-segments-sdk` (default branch `devnet`)
**npm name in manifest:** `@pump-fun/segments-sdk` v1.0.4 — **not the searched `pump-segments-sdk`**, and `publishConfig.access: "restricted"`
**Published to npm:** no (`npm view @pump-fun/segments-sdk` → 404 as of 2026-06-08)
**History:** all real code committed 2025-11-25/26 by one author ("sharuk", 12 commits); the 2026-04-16 "push" is only Dependabot/Socket security bumps (`fast-xml-parser` CVE). Open PRs #2/#3 are both dependency-security bumps. No README, no description.
**Verdict: NOT RELEVANT — do not adopt.**

## What it is

It is Pump.fun's **internal user-segmentation SDK** — a thin TypeScript read-client over a private **DynamoDB** table of audience cohorts that a Lambda materializes from Pump.fun's **BigQuery** warehouse. "Segments" means *marketing/growth audience cohorts of pump.fun app users* (not on-chain, not token/fee related). The three baked-in segments in [`src/segments/definitions.ts`](https://github.com/pump-fun/pump-segments-sdk/blob/devnet/src/segments/definitions.ts) make this unambiguous: `mobile-users-no-notifications`, `mobile-high-volume-traders` ($1k+ weekly), `mobile-active-yesterday` — each defined by a BigQuery SQL string against `pump-data-production.analytics.daily_user_activity` (columns `user_id`, `was_on_mobile`, `notifications_received`, `usd_volume`). It is push-notification / growth-targeting infrastructure.

## Capability list (actual API)

- `SegmentClient(config)` — wraps `@aws-sdk/lib-dynamodb`; reads a DynamoDB table (`tableName`, `region`, optional `endpoint`). Keys: `SEGMENT#<id>#META` and `SEGMENT#<id>#V#<version>` / `USER#<userId>` ([`src/client.ts`](https://github.com/pump-fun/pump-segments-sdk/blob/devnet/src/client.ts)).
- `segment(client, id)` → `Segment` with: `contains(userId)`, `getAll({cursor,limit})`, `getSample(pct)`, `stream(batchSize)` (async iterator), `getMetadata()`, `count()` ([`src/segment.ts`](https://github.com/pump-fun/pump-segments-sdk/blob/devnet/src/segment.ts)).
- Deterministic sampling: `computeSampleBucket(userId, segmentId, salt)` via `imurmurhash` (`hash % 10000`), `isInSample(bucket, pct)` ([`src/utils.ts`](https://github.com/pump-fun/pump-segments-sdk/blob/devnet/src/utils.ts)).
- Types: `SegmentMetadata` (memberCount, versionId, status, BigQuery bytes/duration stats), `MembershipResult`, `ExportResult` ([`src/types.ts`](https://github.com/pump-fun/pump-segments-sdk/blob/devnet/src/types.ts)).

## Relevance to three.ws

**None usable.** Every capability is gated behind Pump.fun's private infrastructure:

- **Hard dependency on their AWS account.** It reads a specific DynamoDB table populated by their Lambda from their BigQuery project `pump-data-production`. Without their AWS credentials and that pre-computed table, every method throws `SegmentError` immediately. There is no public endpoint and no on-chain component.
- **Wrong domain.** Segments are about *pump.fun app users* (mobile usage, notification counts, USD trading volume keyed by internal `user_id`). They are **not** $THREE holders, wallets, creators, or fees. This does not touch fee sharing, creator revenue, or royalties.
- **No overlap with our features.** Nothing here unlocks the `/go` bounty board, `api/_lib/coin-communities.js`, `holder-pass.js`, `royalty.js`, or the fee-sharing paths in `api/pump/[action].js` (all confirmed present). Those operate on Solana wallets/mints/holders — a different data plane entirely.

## Availability

Pre-release and effectively private: unpublished on npm, `access: restricted` (intended for an internal/private scope), README-less, default branch `devnet`. Adopting would mean a git dependency or vendoring — but even vendored it would be **inert**, since it only proxies Pump.fun's internal DynamoDB. The maintenance cost would buy nothing.

## Recommendation

**Not relevant — do not adopt, do not watch for an npm release.** This is internal growth tooling Pump.fun is unlikely to expose, and the model (read their warehouse cohorts) has no public surface we could call.

## Addendum — re-evaluated for agent-token holder segmentation

Raised use case: we let users launch tokens for their agents, so segment *those token holders* into cohorts (whales, diamond hands, new buyers, dormant) and wire them into the `/go` bounty board, communities, and holder worlds.

**The product instinct is right; this SDK is the wrong vehicle.** Verified against our actual code:

- **We already own the data plane this SDK lacks.** [`api/_lib/coin/holders.js`](../../api/_lib/coin/holders.js) snapshots every agent-token holder on-chain via Helius `getTokenAccounts` (Token-2022) into a **Neon Postgres** `coin_holders` table — `persistHolderSnapshot({coinId, balances})`, `readEligibleHolders({coinId, minBalance})`. [`api/_lib/holder-pass.js`](../../api/_lib/holder-pass.js) already does USD-tiered gating. The segments-sdk computes *none* of this — it is a pure read proxy over a table someone else populates.
- **Datastore mismatch.** The SDK is hardwired to **DynamoDB** (`@aws-sdk/lib-dynamodb`). Our store is Neon Postgres (`sql` tagged template). Adopting it means standing up a second datastore for zero benefit.
- **Its real value is a backend we can't touch.** The "segments" are materialized by Pump.fun's private Lambda from their internal `pump-data-production` BigQuery, keyed by *pump.fun app `user_id`* — not Solana wallets, not our mints. Even pointed at our own DynamoDB table, every method returns empty until we build the entire cohort-materializer ourselves — which we already 80% have in `holders.js`.
- **Reusable surface ≈ 40 lines.** Only the base64 cursor pagination and the `imurmurhash` deterministic sampling (`bucket = hash % 10000`) are worth borrowing as a *pattern*. Trivial to write natively against `coin_holders`.

**Revised recommendation:** **Do not adopt the SDK** (unchanged), but **do build native agent-token holder cohorts** on top of `coin_holders` — a small, high-leverage feature. Sketch: a `coin_holder_cohorts` definition (SQL predicate over `coin_holders` joined with priced balances), a refresh that runs alongside the existing snapshot, deterministic sampling for "pick N% of whales," and exports the bounty board / communities can target. This is our build, against our data — borrow the *idea*, not the dependency.
