# Task 03 — The Vanity Studio (make every agent's address a brand)

> **Read [00-README-orchestration.md](./00-README-orchestration.md) first** for the
> ownership model, tokens, real APIs, hard rules, definition of done, and the
> "improve then delete this file" close-out. Builds on the shared wallet component
> from **task 01** and is launched from the HUD (**task 02**).

## Mission

A custom (vanity) wallet address is an agent's signature — `THREExyz…` reads as
brand, not noise. The backend already grinds vanity addresses (Solana base58
prefix/suffix; EVM CREATE2 hex) and safely sweeps funds into the new address. Today
the UI is a bare link. Build the **Vanity Studio**: a delightful, owner-only
surface that makes minting a custom address feel like a premium feature people
brag about.

## What exists (read it before building)

- Solana grinder: [api/_lib/pump-vanity.js](../../api/_lib/pump-vanity.js)
  (`grindMintKeypair`, `estimateAttempts`), base58, max ~6 chars, yields every 10k
  attempts.
- Solana vanity endpoint: `GET/POST /api/agents/:id/solana/vanity` in
  [api/agents/solana-wallet.js](../../api/agents/solana-wallet.js) — grinds a new
  keypair server-side, **sweeps existing funds to the new address**, swaps keys
  (money-safe). Stores `meta.solana_vanity_prefix/suffix`. Serverless bounds:
  `VANITY_MAX_CHARS`, `VANITY_MAX_ITERATIONS`.
- EVM CREATE2 vanity: [api/agents/eth-vanity.js](../../api/agents/eth-vanity.js) —
  hex prefix/suffix, verifies CREATE2 derivation and on-chain deployment.

## What the Studio must do

1. **Pattern designer** — input for prefix and/or suffix with **live validation**:
   base58 alphabet for Solana (reject `0OIl`), hex for EVM, max-length enforcement.
   Show a live **preview** of what the resulting address will look like
   (`THREE…xyz`) with the matched part highlighted in the same violet the chip uses.
2. **Difficulty / time estimate** — call/replicate `estimateAttempts` to show, in
   real time, "≈ N attempts, ~T to grind" as the user types. Make the cost of a
   longer pattern visceral and honest. No fake progress.
3. **Grind with real progress** — kick off the real server grind. Because grinding
   is bounded server-side, surface real status: queued → grinding → sweeping funds
   → swapped, with the **real** attempt count / outcome from the endpoint. If the
   pattern exceeds serverless bounds, tell the user the real limit and the longest
   pattern that will succeed — don't pretend.
4. **Money-safe swap, clearly explained** — the user must understand their funds
   move to the new address and the old key is retired. Show before/after addresses,
   the sweep tx (explorer link), and a clear success state. This touches real
   custodial funds — the copy must be precise and reassuring, the confirm explicit.
5. **Both chains** — Solana (base58) and EVM (CREATE2 hex) in one coherent surface,
   each with its own validation and flow. Make the difference legible (an EVM
   vanity is a predicted CREATE2 address that deploys; a Solana vanity is a real
   keypair swap).
6. **Owner-only** — enforce in UI and rely on server owner checks. Visitors never
   see grind controls.

## Innovation mandate

- **Vanity as identity, surfaced everywhere** — once minted, the vanity prefix/
  suffix highlight propagates to the chip on every surface (it already does via the
  shared component from task 01 — verify it does for newly minted patterns too).
- **Smart suggestions** — offer on-brand patterns derived from the agent's name
  (e.g. name → valid base58 stub) so users get a great address without thinking.
- **A "rarity"/flex angle** — longer matched patterns are rarer; show that
  tastefully (this is honest scarcity, computed from real attempt estimates, not a
  fake badge).
- Make the grind feel alive and premium — real status, satisfying success moment,
  shareable result. Invent beyond this if it raises the bar.

## States & edge cases

- Live validation errors (illegal chars, too long) as the user types — inline,
  friendly. Estimate updates without jank (debounce).
- Grind that hits the serverless iteration cap: honest "couldn't find in N
  attempts, try a shorter pattern" with the funds untouched and the old address
  intact. Never lose funds, never leave the wallet in a half-swapped state — verify
  the endpoint's guarantees and reflect them.
- Network failure mid-grind / mid-sweep: clear recoverable state, re-check actual
  on-chain/db state before claiming success or failure.
- Agent with no wallet yet: provision first, then offer vanity.

## Definition of done

Per the orchestration README. Plus: a real Solana vanity grind + sweep completes
end-to-end (devnet acceptable) with the new address showing on the chip across
surfaces and a real sweep-tx explorer link; live estimate reflects real attempt
math; EVM CREATE2 flow validates and persists a real record; owner-only enforced;
no console errors; responsive.

When done: self-review + improvement pass, changelog entry, commit (explicit paths
only), then **delete this file** (`prompts/agent-wallets/03-vanity-studio.md`).
