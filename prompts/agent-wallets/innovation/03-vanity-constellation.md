# Task 03 — Vanity Constellation: social, gifted, gamified vanity addresses

> Read [00-README-innovation.md](./00-README-innovation.md) first. Build on the existing
> vanity stack: `src/solana/vanity/grinder.js` (`grindVanity`, WASM), `grinder-node.js`,
> `brand.js` (`3ws` mark), the in-flight `mnemonic-grinder.js` / `sealed-envelope.js`,
> and the money-safe assign+sweep at `POST /api/agents/:id/solana/vanity`.

## The screenshot moment

An agent's fans pool their phones' spare GPU to grind it a legendary address —
`3wsAPEXxz…GOAT` — racing a live leaderboard of who contributed the most hashes. When
they hit it, the address is **gifted** to the agent in a sealed envelope the owner opens
with a flourish, the funds sweep over safely, and a "forged by 312 fans" badge lives on
the wallet forever. Vanity stops being a solo grind and becomes a community event.

## What you're inventing

Three linked primitives that turn vanity addresses into a social, gift-able, collectible
layer:

1. **Grind Pools** — distributed, consented, browser-side collaborative grinding toward a
   target pattern for an agent, with a real-time contribution leaderboard.
2. **Sealed-Envelope Vanity Gifting** — grind a custom address for *someone else's* agent
   and gift it; they claim it (one agent, one owner: claiming = the owner assigning it via
   the existing sweep-safe path, or fork-to-claim if they're not the owner).
3. **Vanity Rarity** — a real, computed rarity/score for an address (pattern length,
   dictionary words, symmetry, the `3ws` brand mark) shown as a collectible trait.

## Build it

**Grind Pools (real distributed compute)**
- A pool = `{ agentId, target pattern, status, contributions[] }` in a new
  `vanity_grind_pools` + `vanity_grind_contributions` table. Anyone can join; their browser
  runs the existing WASM grinder (`grindVanity`) in a worker, reporting **real** hash counts
  (not time-based fakes) to `POST /api/vanity/pools/:id/progress`. Throttle, batch, and
  stop on `visibilitychange`/offscreen. When a worker finds a match, it submits the public
  key only; the secret is handled via the sealed-envelope flow below (never POST a raw
  secret to a pool feed).
- Live leaderboard (real contributions), ETA from real aggregate hashrate, and a calm
  "grinding…" state that's honest about probability. Designed empty/done/failed states.

**Sealed-Envelope Gifting (secret-safe)**
- Use/extend `src/solana/vanity/sealed-envelope.js`: the finder encrypts the found keypair
  to the recipient owner (envelope), so only the intended owner can open it. Persist the
  envelope (not the plaintext secret) server-side keyed to the agent. On claim, the owner
  decrypts client-side and assigns via `POST /api/agents/:id/solana/vanity` (which sweeps
  funds safely and stores the encrypted secret). A non-owner recipient must fork first
  (one agent, one owner). No secret is ever logged, emailed, or stored in plaintext.
- A real gifting UX: "Grind a vanity gift for @agent" → progress → "send envelope" →
  recipient gets a notification + a beautiful claim flow.

**Vanity Rarity (real scoring)**
- `api/_lib/vanity/rarity.js`: deterministic score from pattern length, base58 dictionary
  hits, repetition/symmetry, and the `3ws` brand bonus. Show it as a trait on the chip
  (`src/shared/agent-wallet-chip.js` already marks vanity — extend, don't duplicate), the
  passport (task 06), and the hub vanity tab. No arbitrary numbers — document the formula.

## Innovate further
- A **"vanity of the day"** discovery strip from real rarest-recently-minted addresses.
- **Mnemonic vanity** (build on `mnemonic-grinder.js`): human-memorable seed-word
  addresses as a premium option, clearly explained, fully sweep-safe.

## Guardrails
- Consent + transparency for contributed compute (clear start/stop, battery/heat-aware,
  reduced-motion). Never grind without an explicit user action. Server validates every
  claimed match (recompute the address from the key) before assignment. Funds always
  sweep old→new; a failed sweep leaves the old wallet untouched.

## Definition of done
Per the README checklist. Prove live: run a real grind pool with 2+ browser tabs/devices,
find a `3ws…` match, gift it via sealed envelope, claim+assign it with a real on-chain
sweep, see rarity reflected everywhere. Add your improvement, summarize, then delete this
file (`prompts/agent-wallets/innovation/03-vanity-constellation.md`).
