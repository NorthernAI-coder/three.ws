# Feature: the `3ws` mint mark — every three.ws coin carries the brand in its address

## The idea

Every coin launched **through three.ws** should be recognizable on-chain by its mint
address alone. We stamp a vanity mark — the literal string **`3ws`** — onto the mint
public key of every launch. A three.ws coin reads `3wsAbc…xyz` in any wallet, explorer,
or block feed. No legend, no metadata lookup: the address *is* the brand.

This is the same move pump.fun made with its `…pump` suffix, applied to *our* surface.
It compounds: every launch is a free, permanent billboard for three.ws, and holders can
verify provenance at a glance.

## Design decisions (locked — do not re-litigate)

- **Mark:** the string `3ws` (three.ws, condensed). Base58-valid (`3`, `w`, `s` are all
  in the alphabet; none are confusable `0/O/I/l`).
- **Position: prefix.** Wallets, explorers, and our own UIs truncate addresses to the
  first 4–6 characters (`3wsAb…`). A prefix gets prime visibility; a suffix is usually
  hidden behind the `…`. The mark leads.
- **Case-insensitive.** Matching `3ws`/`3wS`/`3Ws`/… keeps the grind ~sub-second.
  Expected attempts ≈ 58 × 29 × 29 ≈ **49k** (digit `3` is exact; `w`/`s` each match two
  cases). The WASM worker pool does this in well under a second; the single-thread
  server grinder (`grindVanityNode`) handles it inside one request with margin.
- **Always-on, server-enforced.** This is not a toggle the user flips. Every branded
  three.ws launch (`coin_type` ∈ `agent | regular | mayhem`) gets the mark by default.
  The client grinds it; the server *also* enforces it so a hand-rolled API call can't
  bypass the brand.
- **One exemption:** the generic, coin-agnostic x402 launcher that accepts an arbitrary
  user-supplied mint at runtime (per `CLAUDE.md`). That plumbing stays mint-neutral.
  Everything that launches a *three.ws* coin gets the mark.

## Why this is cheap and safe

The vanity infrastructure already exists and is battle-tested — this feature **wires it on
by default**, it does not build a grinder from scratch:

- `src/solana/vanity/grinder.js` — `grindVanity({prefix, suffix, ignoreCase, signal, onProgress})`, WASM web-worker pool (client).
- `src/solana/vanity/grinder-node.js` — `grindVanityNode(...)`, `expectedAttemptsFor`, `GrindExhaustedError`, `MAX_SERVER_PATTERN_LENGTH = 3` (server). `3ws` is exactly 3 chars.
- `src/solana/vanity/launch-with-vanity.js` — grind → `POST /api/pump/launch-prep` → return prep + local mint keypair for co-sign.
- `src/solana/vanity/validation.js` — base58 validation, difficulty + time estimates.
- `api/pump/[action].js` — `launch-prep` (user-signed) and `launch-agent` (server-signed) already accept a client-ground `mint_address`; both fall back to `Keypair.generate()`.

Our launches do **not** grind pump.fun's `…pump` suffix today (they use plain
`Keypair.generate()`), so the address space is fully ours — no 7-char (`3ws…pump`)
collision-of-constraints problem. Just a clean 3-char prefix.

## Task order

| # | File | What it delivers |
|---|------|------------------|
| 00 | `00-brand-constant-and-validator.md` | One source of truth: `src/solana/vanity/brand.js` (the mark config + `hasThreeWsMark` / `assertThreeWsMark`). Everything else imports this. |
| 01 | `01-server-enforce-launch-prep.md` | `launch-prep` grinds `3ws` when no mint supplied and rejects an unmarked supplied mint. |
| 02 | `02-server-enforce-launch-agent.md` | `launch-agent` (server-signed / autonomous) grinds `3ws` server-side. |
| 03 | `03-client-launch-surfaces-default.md` | Every client launch UI defaults to grinding `3ws` (remove the `pump` default + opt-in toggle framing). |
| 04 | `04-skill-and-cli-scripts.md` | The `create-coin` skill + `coin-cli`/`direct-pump-launch` scripts grind the mark. |
| 05 | `05-ux-branded-success-state.md` | Progress ("stamping your three.ws mark…") + a success state that celebrates the marked address. All states designed. |
| 06 | `06-tests.md` | Unit + integration + e2e proving every path produces a `3ws…` mint. |
| 07 | `07-docs-rollout-telemetry.md` | Docs, feed event, telemetry, and the kill-switch flag. |

Do 00 first (everyone depends on it). 01–04 can run in parallel after 00. 05 layers on
01/03. 06 and 07 close it out.

## Definition of done (whole feature)

- A launch from **every** surface (agent-home, /studio, pump-modals, skills, CLI, the
  create-coin skill, and the autonomous `launch-agent` path) produces a mint whose
  Base58 address begins with `3ws` (case-insensitive).
- The server **rejects** a branded launch whose supplied `mint_address` lacks the mark
  (clear 400), and **mints one with the mark** when none is supplied — a raw API call
  cannot ship an unbranded three.ws coin.
- The generic x402 launcher is untouched and still mint-neutral.
- No coin other than `$THREE` is referenced anywhere in the work (`CLAUDE.md` law).
- Grinding never *blocks* a launch: it runs inside a bounded budget with a designed
  progress state; the kill-switch flag (task 07) can disable enforcement instantly.
- Existing vanity tests still pass; new tests cover every launch path.
