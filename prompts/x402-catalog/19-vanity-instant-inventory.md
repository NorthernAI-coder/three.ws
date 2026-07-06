# 19 — Instant vanity: serve pre-ground addresses from inventory

Read `prompts/x402-catalog/00-CONTEXT.md` first and obey every rule in it. Work alone, finish
100%, never ask questions.

## Mission

The vanity grinder is one of the catalog's three real products, but grinding happens at
request time. An inventory of pre-ground addresses turns it into INSTANT delivery and unlocks
longer prefixes at premium prices, plus an upsell into pump-launch ("launch with a
`pump`-suffix mint, delivered in seconds").

## Context

- **In-flight work exists — build on it, don't duplicate it.** A parallel GCP-credits campaign
  includes vanity inventory: read `prompts/gcp-credits/06-vanity-inventory.md` (its plan) and
  the working tree's `api/_lib/vanity-inventory-store.js` (possibly uncommitted /
  half-complete — `git status`, `git log --oneline -3 -- api/_lib/vanity-inventory-store.js`).
  Whatever state you find is your starting point: complete the store if incomplete, then do
  the product wiring below. Do not fight or rewrite working in-flight code.
- Current product: `api/x402/vanity.js` (read fully — pricing tiers, keypair vs mnemonic
  formats, `sealTo` ECIES sealing, the never-stored guarantee), plus `api/x402/
  vanity-premium.js` and `api/x402/vanity-verifiable.js`.
- **Security invariants (non-negotiable):** inventory entries' secrets must be stored
  encrypted at rest (the store should already address this — verify; if it doesn't, encrypt
  with a server-side key from env before persisting), each entry is served EXACTLY ONCE
  (atomic claim — no double-sell under concurrent requests), and a served entry is deleted
  immediately. `sealTo` sealing must work for inventory-served results identically to
  ground-on-demand results. State plainly in the endpoint description that inventory
  addresses were pre-generated server-side and never re-served.
- Launch upsell: `api/x402/pump-launch.js` already supports vanity prefix/suffix grinding —
  read how, and route it through inventory when a matching entry exists.

## Tasks

1. Audit the store: schema, encryption at rest, atomic claim semantics. Complete/fix what's
   missing. Add a concurrency test proving no double-claim (two simultaneous claims of the
   last matching entry → exactly one wins).
2. Wire `api/x402/vanity.js`: on a paid request, check inventory for a matching
   prefix/suffix/format entry FIRST → instant delivery (claim + serve + delete); no match →
   grind as today. Response includes `source: 'inventory' | 'ground'` and honest timing.
3. Extend offered patterns: inventory makes longer prefixes viable (4–5 Base58 chars) at
   premium prices — add tiers priced meaningfully above the grind cap (e.g. 4 chars $2.50,
   5 chars $10, env-overridable via `priceFor`), offered ONLY when inventory holds a match
   (the 402 quote for an unavailable pattern must say "not in stock — grindable range is …").
4. Inventory replenishment: a maintenance path that grinds ahead of demand — check what the
   gcp-credits campaign planned (GPU workers?) and wire the trigger the repo supports today
   (a `scripts/` grinder script + an `api/cron/` hook if a cron surface exists — read
   `api/cron/` to see the platform's pattern). No GitHub Actions.
5. Pump-launch upsell: when `pump-launch` gets vanity params, consult inventory first (shared
   claim path — same atomicity), fall back to grinding. Update its description to advertise
   instant vanity when in stock.
6. **Tests** in `tests/api/vanity-inventory.test.js`: claim atomicity (the concurrency test),
   serve-once + delete, seal-to on inventory results, source field, out-of-stock 402 quote
   messaging, pump-launch inventory path. Targeted vitest + `npm run audit:x402-catalog`
   until green.
7. **Docs:** update the vanity section of `docs/api-reference.md` (tiers table, instant vs
   ground). Changelog entry (`feature`): vanity addresses now deliver instantly from
   pre-ground inventory, with longer patterns available.
8. Commit (explicit paths; coordinate with in-flight files — if `vanity-inventory-store.js`
   was uncommitted when you started, committing your completed version of it is correct;
   note it in your report) and push per 00-CONTEXT.

## Definition of done

Inventory-backed instant delivery live with proven serve-once atomicity and encrypted-at-rest
secrets, premium long-pattern tiers quoted honestly, pump-launch upsell wired, replenishment
path real, tests + audit green, docs + changelog shipped, committed, pushed.
