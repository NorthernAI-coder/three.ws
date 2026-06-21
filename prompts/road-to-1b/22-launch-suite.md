# 22 — Launch suite

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 4 — Surface completeness
**Owns:** Launch a Coin (pump.fun launcher), Launchpad Studio, Coin Intelligence, Claim Your Wallet; `api/pump/[action].js` (`launch-prep`, `launch-agent`, `launches`), `pump_agent_mints`.
**Depends on:** Phase 0–1, 07 (security), 24 (wallets).  ·  **Parallel-safe with:** 18–21, 23.

## Why this matters for $1B
Launching is a money-moving, irreversible action. It must be airtight, transparent, and
honest. This is also where the two CLAUDE.md $THREE exceptions live (the generic
launcher + platform launch directories) — they must be preserved exactly and not turned
into endorsements of any non-$THREE coin.

## Mission
Make the full launch lifecycle — prep, launch, track, claim — real, safe, and clearly
presented, with correct handling of the runtime-data coin exceptions.

## Do this
1. **Launch a Coin:** the pump.fun launcher accepts a user-supplied mint/params, with
   input validation, amount/price sanity bounds, idempotency, and a confirmation step
   (ties to prompt 07). Real on-chain result, designed error/success states.
2. **Launchpad Studio:** building a white-label hosted launchpad page works end to end
   and the published page is real and reachable.
3. **Launches feed / history** (`/api/pump/launches` over `pump_agent_mints`,
   agent-profile launch history): renders user-launched coins from platform records
   only — verify this exception stays runtime-data-only, never a hardcoded mint.
4. **Coin Intelligence:** classification + learning score presented honestly (ties 21).
5. **Claim Your Wallet:** verified pump.fun track record publishes as a Trader Card.
6. Confirm no non-$THREE coin is promoted/recommended anywhere in copy (prompt 04).

## Must-not
- No launch without validation, bounds, idempotency, and explicit confirmation.
- Do not hardcode or market any specific non-$THREE mint; keep the two exceptions intact.

## Acceptance
- [ ] Launch prep → launch → appears in feed/history verified with real on-chain action.
- [ ] Launchpad pages publish; Claim → Trader Card works; states designed.
- [ ] Money-path invariants (bounds/idempotency/confirmation) present; `npm test` green; changelog entry.
