# Task 06 — Proof-of-grind: verifiable rarity + a gallery of the rarest addresses

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. If
> [01-provably-fair-grinding](./01-provably-fair-grinding.md) shipped, reuse its
> signed-receipt primitive; if not, build the minimal signing here.

## The wedge (why this is gamechanging)

Vanity addresses are a flex — but the flex is unverifiable. Anyone can *claim* they
ground a 6-character address; nobody can prove the work, the rarity, or that it was
ground here. There's no provenance, no leaderboard, no collectible layer.

Build **proof-of-grind**: every grind can emit a **signed, verifiable rarity receipt**
(difficulty, expected attempts, actual attempts, time, entropy commitment), optionally
**anchored on-chain** as a collectible receipt, feeding a **public gallery + leaderboard**
of the rarest addresses ground on three.ws — each with a shareable card. This turns a
one-off purchase into provenance, social proof, discovery, and a reason to come back.
"Minted on three.ws, provably the rarest" becomes a status object.

## What to build

### Verifiable rarity receipt
- Define a **rarity score** from the real probability model
  ([validation.js](../../src/solana/vanity/validation.js)): combine pattern length,
  position (prefix bias vs uniform suffix), case-sensitivity, dictionary-word bonus
  (e.g. real English words), and symmetry/palindrome bonuses into one honest score +
  human tier (Common → Mythic). Document the formula; no arbitrary numbers.
- A service-signed receipt: `{ address, pattern, rarityScore, tier, expectedAttempts,
  attempts, durationMs, entropyCommitment, ts, version }` + ed25519 signature
  (`@noble/curves`). Verifiable offline against the published service key
  (`/.well-known/three-vanity.json` from Task 01, or publish it here).

### On-chain collectible (optional, real)
- Let a user mint the receipt as a real on-chain asset (Metaplex `mpl-core` /
  `@metaplex-foundation/umi`, or an EAS attestation on Base) with the rarity metadata +
  a generated image. Real mint, real metadata URI (store image/JSON on the existing
  storage path — R2/S3 in the repo). No fake mint, no placeholder URI.

### Gallery + leaderboard + cards
- `/vanity/gallery` (and a `/vanity/leaderboard`): the rarest addresses ground on
  three.ws, sortable/filterable by tier/length/pattern/recency, paginated, with a
  verified badge and a link to verify the receipt. **Privacy: never expose any secret,
  seed, or sealed payload** — only the public address + receipt metadata, and only for
  grinds the user opted to make public.
- Beautiful [@vercel/og](../../api) share cards per address (tier, rarity, the
  highlighted pattern) for X/social. A "share my rarity" button on the vanity result.
- Wire it into the platform: rarity badge on agent/avatar wallet chips
  ([src/shared/agent-wallet-chip.js](../../src/shared/agent-wallet-chip.js)), so a rare
  agent address shows its tier everywhere it appears.

## Hard requirements

- Honest, documented rarity math tied to the real difficulty model — no inflated
  scores. Dictionary/word detection uses a real wordlist (one already vendored, e.g.
  the BIP-39 list, or another real source — not a hand-typed sample).
- Opt-in publication only; never leak secrets/seed/sealed data; never publish a grind
  the user didn't choose to share.
- Real signatures, real on-chain mint (if offered), real storage for images/metadata,
  real DB for the gallery/leaderboard. No mock entries, no seeded fake "rarest" list.
- `$THREE` only as the coin; designed states (empty gallery, 1, thousands); fast
  (paginate, lazy images, no N+1); accessible; responsive.

## Definition of done

- [ ] Signed rarity receipt with a documented, honest score + tiers; offline verifiable.
- [ ] Optional real on-chain collectible mint with real metadata/image URIs.
- [ ] `/vanity/gallery` + `/vanity/leaderboard`: real data, opt-in, paginated, no
      secret leakage, every state designed, reachable from nav.
- [ ] OG share cards; rarity badge wired into the shared wallet chip across surfaces.
- [ ] Tests (rarity math vectors, signature verify, gallery query, privacy: secrets
      never serialized). Changelog + `npm run build:pages`. No mocks; `git diff` reviewed.

## Closeout

DoD + self-review, then **improve**: a "rarity appraisal" tool (paste any address →
get its tier + an estimate of grind cost), seasonal leaderboards, and a marketplace
hook so a rare ground wallet can be listed (ties to Task 02/03 — always sealed, never
exposing the key). Summarize, then **delete this file**
(`prompts/vanity-x402/06-proof-of-grind.md`).
