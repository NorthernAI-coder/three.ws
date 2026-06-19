# Task 11 — End-to-End Devnet Smoke Harness + Definition-of-Done Sweep (epic gate)

> **Operating bar (applies to the whole task).** Senior engineer + product thinker building
> three.ws to beat the best in the world. No mocks, no fake/sample data, no placeholders, no
> TODO/stubs, no `setTimeout` fake-loading. Real APIs and real on-chain data only. Simulate-first
> with **honest BLOCKED reporting** — never a fake PASS. Only coin is **$THREE**
> (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); runtime mints in generic plumbing are the only
> exception and are never promoted. `data/changelog.json` entry for user-visible changes. Run the
> **completionist** subagent. Stage only changed paths (never `git add -A`); re-check `git status`.
>
> **Final gate. Run after tasks 01–10 are shipped (their files deleted).**

## Context

Tasks 01–10 build the three.ws trading edge: firewall (01), MEV execution (02), smart-money graph
(03), pre-launch radar (04), NL strategy compiler + backtester (05), signal marketplace (06),
trading swarms (07), launch copilot MM (08), Mission Control terminal (09), and the trading arena
(10). This task proves the **whole edge works end-to-end** and runs one Definition-of-Done pass
across every new surface so nothing ships half-wired. It is the gate before the epic is called done.

Known funding constraint (memories `pump-devnet-smoke`, `three-ws-self-registration`): devnet
airdrops are rate-limited and platform signers may be unfunded, so the harness runs simulate-first
and degrades to clearly-reported "blocked: needs funded devnet signer" rather than failing or
faking. Mirror the existing pattern in `scripts/pump-devnet-smoke.mjs` / `scripts/onchain-smoke.mjs`.

## Files to read first

- All of `tasks/next-gen-trading/` (this README + any task files still present) — the success
  criteria each task promised.
- `scripts/pump-devnet-smoke.mjs`, `scripts/onchain-smoke.mjs` — the simulate-first, funding-gated
  smoke pattern + CI-runnable shape to mirror.
- `scripts/page-audit.mjs` + the console-audit baseline (memories `page-audit-tooling`,
  `console-audit-baseline`) — for the UI sweep + distinguishing real errors from known noise.
- The endpoints built by this epic (firewall safety, smart-money, radar, compile/backtest,
  signals marketplace, swarms, launch MM, tournaments) + `CLAUDE.md` "Definition of done".

## What to build / do

1. **End-to-end smoke** — `scripts/next-gen-trading-smoke.mjs` covering, in order, each printing
   PASS / BLOCKED(reason) / FAIL with simulate fallbacks and zero fake passes:
   1. Create + fund an agent (assert wallet provisioned).
   2. **Firewall**: assert `assessTradeSafety` blocks a honeypot-shaped simulated round-trip and
      allows a healthy one, on real RPC.
   3. **MEV**: assert a buy routes through `submitProtected` (Jito on mainnet, protected fallback
      on devnet) with real telemetry.
   4. **Smart-money**: assert `wallet_reputation`/clusters compute from real data and
      `getSmartMoneyForMint` returns a real verdict.
   5. **Radar**: assert the watchlist builds and a real precursor event is detected (or BLOCKED if
      no webhook/RPC).
   6. **Strategy compiler/backtester**: compile a plain-English strategy → valid config; backtest
      returns honest metrics from real history.
   7. **Signal marketplace**: a verified feed publishes; a subscriber pays real x402 (simulate if
      unfunded) and mirrors a firewall-gated trade.
   8. **Swarm**: create + fund a swarm; consensus fires a treasury buy; a payout settles pro-rata.
   9. **Launch MM**: attach a policy to a launched coin; assert an MM action executes (simulate).
   10. **Arena**: create a tournament, compute live standings from real metrics, attest standings
       on-chain (or BLOCKED), settle $THREE prize (or BLOCKED with unblock step).
   - Each live step degrades to BLOCKED with the exact missing credential/funding, never a fake PASS.
2. **DoD sweep across all new UI** (firewall safety panel, smart-money panel, radar view, strategy
   builder, signals marketplace + subscriber panel, swarms dashboard, launch copilot, Mission
   Control terminal, arena): use `scripts/page-audit.mjs` + a real browser pass to verify for each
   surface — designed loading/empty/error/populated states; hover/active/focus on every interactive
   element; responsive at 320/768/1440; semantic HTML + ARIA + keyboard nav + focus rings; no dead
   buttons/links; console-clean (filtered against the known-noise baseline). File a punch-list; fix
   every real issue or hand specific items back to the owning task with specifics.
3. **Build gates** — confirm `npm run build`, `npm run typecheck`, `npm test` clean across the
   epic; confirm every user-visible change has a `data/changelog.json` entry and new pages are in
   `data/pages.json`.
4. **Epic completion report** — a short summary of what is fully live vs. built-but-blocked-on-
   credentials/funding (Cloud Run deploy, funded devnet signer, Jito, prize funding), with the
   exact unblock step for each. Do not claim done for anything you could not verify.

## Constraints

- Simulate-first, honest reporting: never fabricate an on-chain result; BLOCKED is first-class with
  the precise reason + unblock step.
- Synthetic agent authorities + the $THREE mint (or a clearly-synthetic placeholder) in tests —
  never a real third-party wallet or any non-$THREE mint.
- Re-runnable + idempotent (cleans up or reuses test agents); no secrets committed; lives under
  `scripts/`, not the repo root.
- The DoD sweep fixes real defects but must not silently rewrite another task's scope.

## Success criteria

- `node scripts/next-gen-trading-smoke.mjs` runs end-to-end, printing PASS/BLOCKED/FAIL per step,
  with simulate fallbacks and zero fake passes.
- The DoD punch-list is resolved: every new surface has all states, is responsive + accessible, has
  no dead paths, and is console-clean.
- `npm run build`, `npm run typecheck`, `npm test` clean; changelog + pages entries present.
- A completion report distinguishes live vs. blocked with unblock steps — no overclaiming.
- Changelog entry (tag: infra). Completionist passes on the epic's changed files.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

```bash
git rm "tasks/next-gen-trading/11-e2e-and-dod-sweep.md"
```

When every numbered task file is gone, delete the epic `README.md` too. A file that still exists is
unfinished work; a file that is gone has shipped. Do not delete early.
