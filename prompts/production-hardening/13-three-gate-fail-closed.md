# 13 · $THREE gating: fail-closed + tier caching

> **Phase 2 — Money safety** · **Depends on:** 08 (breakers) · **Parallel-safe:** yes · **Effort:** M

## Mission
$THREE holder gating is server-verified (good), but `api/_lib/three-access.js` **degrades to the
Member tier on any RPC failure** ("never throws — degrades to the Member floor"). When RPC is
flaky, gated benefits leak to non-holders. Decide and implement the correct posture: cache verified
tiers so transient RPC blips don't drop real holders, and fail-*closed* (not open) for paid/elevated
gates while keeping a graceful experience for read-only surfaces.

## Context (read first)
- `CLAUDE.md` — **$THREE is the only coin**, CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`.
- `api/_lib/three-gate.js` (`checkThreeBalance`), `api/_lib/three-access.js` (~lines 165–174 fail-open degrade), `public/x402.js` (~213–231 client balance reads — display only, never authority).
- Memory: "Solana is the platform-wide default network."
- RPC failover (`api/_lib/solana/connection.js`) + resilience layer (prompt 08).

## Build this
1. **Tier cache** — cache a wallet's verified $THREE tier (Redis, TTL ~1h with jittered refresh) so a momentary RPC failure reuses the last *known-good* tier instead of dropping to Member. Cache only *successful* reads.
2. **Fail-closed for elevation** — for anything that grants paid features, free generation beyond the public allotment, or spend benefits: on an uncached RPC failure, **deny the elevated grant** (treat as unverified) rather than silently granting Member-or-above benefits that cost money. Make the distinction explicit in `three-access.js`.
3. **Graceful read surfaces** — purely cosmetic/read-only gating may degrade softly, but must not unlock anything monetizable.
4. **Client is never authority** — confirm `public/x402.js` balance reads are display-only and every grant is server-checked. Remove any path where the client value influences access.
5. **Tests** — RPC down + warm cache → real tier preserved; RPC down + cold cache → elevated denied, read-only soft-degrades; client-supplied balance never elevates. Add to gate.

## Files likely in play
`api/_lib/three-access.js`, `api/_lib/three-gate.js`, tier cache module (Redis), `public/x402.js` (audit), tests.

## Definition of done
- [ ] Verified tiers cached; transient RPC failures don't drop real holders.
- [ ] Elevated/monetizable grants fail-closed on uncached RPC failure.
- [ ] No client-supplied balance can elevate access.
- [ ] Tests cover warm-cache, cold-cache, and client-spoof cases; added to `GATE_TESTS`.
- [ ] Changelog: **security**/**fix** entry ("$THREE benefits no longer leak during RPC hiccups").

## Guardrails
Follow CLAUDE.md. $THREE is the only coin — never reference another token in code, tests, or copy. Fail-closed on money. Push both remotes.
