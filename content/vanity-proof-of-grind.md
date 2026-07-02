# Proof of Grind: the vanity wallet suite behind three.ws

*Long-form X article. The complete story of the three.ws vanity address suite: the WASM grinder that keeps keys on your machine, the provably fair protocol and what a receipt actually proves, the honest rarity math, the Proof-of-Grind Gallery, the secret-blind Grind-Bounty Market, the split-key scheme for wallets worth real money, the EVM twin, the developer surface, and the honest limits. $THREE is the only coin.*

Your wallet address is the one thing about you that every counterparty, every explorer, and every leaderboard sees. For almost everyone, it is a random string. A vanity address fixes that: a real keypair whose public key happens to start or end with characters you chose. The catch has always been trust. Every paid vanity service sees the private key it sells you, and "we deleted our copy" is not a security model.

We built the vanity suite to kill that problem. Grinding on three.ws is client-side by default, WASM-fast, and the key never leaves your machine. When you do pay someone else to grind, the protocol makes theft mathematically impossible instead of contractually discouraged. A market and a gallery sit on top, because a provably rare address is worth showing off and a provably hard pattern is worth paying for. This is everything about it.

## Why we built it

**First, the trust problem is solvable with math, and nobody had shipped the full solution.** A vanity service normally asks you to trust that the randomness was real and no copy was kept. Commit-reveal, sealed delivery, and split-key elliptic curve arithmetic each remove one leg of that trust. We specified them together as `three-vanity/v1` and its siblings, published the spec, and shipped verifiers that run entirely in your browser. Hope became a checklist.

**Second, self-custody should be the default, not the premium tier.** The primary grinder is not a service at all. It is Rust compiled to WebAssembly, running in a Web Worker pool across your CPU cores, on your machine, with no network call in the loop. There is nothing for us to leak because we never see anything. The paid lanes exist for agents and environments that cannot run WASM, and even those are engineered so the plaintext key transits once or never.

**Third, hard patterns deserve a market.** Expected work grows by a factor of 58 per character; a six character pattern is a fleet-scale job. So we built a two-sided market: post a pattern, escrow a USDC bounty over x402, and let independent miners race. The winner is paid on-chain and never sees your wallet, because the only thing a claim may carry is a secret sealed to your key. Compute becomes a commodity; custody never moves.

## The system at a glance

Six surfaces, one shared core of pure protocol code that runs identically in the browser, the serverless verifiers, and the tests.

1. **The grinder** at three.ws/vanity-wallet: mine a Solana address with a custom prefix or suffix in your browser, across every core.
2. **The verifier** at three.ws/vanity/verify: paste a receipt or certificate and watch every claim get recomputed from first principles.
3. **The Proof-of-Grind Gallery** at three.ws/vanity/gallery: a public leaderboard of the rarest verified addresses, plus an appraisal tool.
4. **The Grind-Bounty Market** at three.ws/vanity/bounties: escrow a bounty for a hard pattern, or earn USDC grinding other people's.
5. **The EVM twin**: three.ws/eth-vanity grinds CREATE2 contract addresses, three.ws/evm-wallet grinds secp256k1 wallet keys, both client-side.
6. **The developer surface**: the `@three-ws/vanity` npm SDK, the `/api/vanity` HTTP API, and the `@three-ws/vanity-mcp` MCP server.

## The grind, and why your key never leaves the machine

A Solana address is the Base58 encoding of an Ed25519 public key. There is no shortcut to an address that starts with your handle: you generate keypairs and check each one. Naive JavaScript manages a few thousand candidates per second, which makes a four character prefix, at roughly eleven million expected attempts, painful.

Our hot loop is Rust, using ed25519-dalek for keygen and bs58 for encoding, compiled to WebAssembly. Single-threaded it sustains about 25,000 keypairs per second. In the browser the SDK fans that module across one Web Worker per logical core, capped at eight; the first worker to hit terminates the rest, pause genuinely frees the cores, and resume continues the attempt count. In Node the same module runs on the calling thread under a time budget.

The security posture is one sentence: on the local path there is no network call. The keypair is produced inside WASM on your device, resolved to your code once, and persisted nowhere. No address, no secret, not even the pattern you searched is transmitted. That is why local grinding is the strongest option we offer.

Two honest details the UI shows before you commit a fan of workers. The difficulty model is the mean of a geometric distribution: 58 to the power of the effective pattern length, with case-insensitive characters counting for less because both cases match. And the leading characters of a Base58-encoded 32-byte key are not uniformly distributed, so a given prefix can be harder than the formula predicts. Suffix characters are uniform. Pick the suffix when you can.

There is also a mnemonic mode: roll a fresh BIP-39 phrase per attempt and derive the keypair at m/44'/501'/0'/0', the Phantom default, so a hit is a seed phrase you can type into any wallet. Each attempt costs a 2048-iteration PBKDF2 run, roughly 100 times slower than the keypair grinder, so the hosted lane caps it at two characters and says so instead of timing out.

## What a receipt proves

The paid grinder's provably fair lane, `three-vanity/v1`, produces the interesting artifact: a receipt whose verification recomputes, never trusts, five things.

1. **Freshness.** Before grinding, the server publishes `SHA-256(tag || serverSeed)` as a commitment. The receipt reveals the seed; the verifier rehashes it. The server was locked to that entropy before it knew your pattern, so a precomputed table of keys is impossible.
2. **Shared control.** Your own entropy, plus a per-request nonce, is mixed with the server seed through HKDF-SHA256 into one master seed. Neither party alone controlled the output.
3. **Derivation.** Candidate `i` is a deterministic HMAC-SHA256 of the master seed and the counter, expanded to an Ed25519 keypair. The verifier re-derives the winning candidate and checks it equals the address, matches the pattern, and that the claimed difficulty equals the honest 58-to-the-n model.
4. **Identity.** The receipt is signed by the three.ws service key over a canonical JSON projection of the signed fields. The key is published at three.ws/.well-known/three-vanity.json and pinned in the SDK, the CLI, and the web verifier, so a self-signed impostor is rejected the moment a pin is present.
5. **Custody, optionally.** If you had the secret sealed to your X25519 key, you can open the envelope client-side and confirm the recovered seed derives to the attested address. The sealing is ECIES with an ephemeral key, forward-secret with respect to the server, and the plaintext never appears in the response, a proxy log, or the idempotency cache.

Negative tests pin that a tampered address, swapped seed, wrong index, inflated difficulty, impostor signing key, or mismatched opened secret each fail. All of it runs at three.ws/vanity/verify with no server round trip for the math.

On top of the heavy protocol sits a lighter, universal attestation: the proof-of-grind certificate, `three-pog/v1`. It attaches to any grind output (keypair, mnemonic, or split-key) and every claim in it is checkable offline: pattern, address, honest difficulty, rarity score, and a 32-byte freshness nonce. The certificate id is a content hash of the facts plus that nonce, and the registry at `/api/vanity/cert` binds one canonical certificate per address. That closes the re-sale hole: a second "freshly ground" proof minted for an already-sold address no longer matches the canonical record, and the verifier flags it as a duplicate.

## Rarity, in bits, with no arbitrary numbers

A vanity address is a flex, but a flex is hand-waving unless the rarity is grounded in the real probability model. Rarity on three.ws is one honest number derived from the same difficulty math the receipts attest to.

The base is bits of work: `baseBits = log2(expectedAttempts)`. On top of that, bounded bonuses credit patterns that are genuinely harder to obtain on purpose, each in the same unit. A real English word from the vendored BIP-39 list earns 1.4 bits per letter, capped at 9. A palindrome of three or more characters earns a flat 3.5. A repeated run earns 2.2 bits per character beyond the second, capped at 8. Grinding both a prefix and a suffix earns 2. The caps exist so a clever three character pattern can never out-rank a brute five character prefix on raw difficulty.

`rarityScore` is the bit total times 100, which keeps leaderboards sortable on integer keys while preserving sub-bit resolution. Tiers cut on whole-character boundaries, since one Base58 character is log2(58), about 5.86 bits: Common under one character of work, then Uncommon, Rare, Epic, Legendary, and Mythic at five-plus characters, roughly 29.3 bits, where expected attempts run into the hundreds of millions. Every certificate carries its rarity, and the verifier recomputes it: a certificate claiming a better tier than its pattern earns fails on the spot.

## The gallery: provable flexes only

The Proof-of-Grind Gallery at three.ws/vanity/gallery is the public trophy room, and its one rule is that entry requires proof. Publishing is a POST of your signed receipt; the server re-runs the full protocol verification against the live service key and refuses anything that does not completely pass. What gets stored is an allowlisted, secret-free projection: address, pattern, rarity breakdown, attempt count, and a fingerprint of the exact receipt (the SHA-256 of address and signature), so a viewer can confirm which verified grind an entry came from without the store ever holding a seed or an envelope.

Un-publishing is proof-gated too: a DELETE must carry an Ed25519 signature by the address itself over a server challenge, so only the keyholder can remove an entry. Around the gallery sit a leaderboard sorted by rarity score, per-tier stats, and the appraisal tool: paste any Solana address and get its honest tier, bits, and expected grind cost, pure math with no persistence.

## The Grind-Bounty Market: paying strangers who can never rob you

The market at three.ws/vanity/bounties is where the suite stops being a toy. You want a hard pattern; a fleet of independent miners wants USDC. The protocol, `three-vanity-bounty/v1`, makes the trade safe in both directions.

**Posting.** You post a pattern, an X25519 recipient key generated on the page, a refund address, and an expiry between one hour and thirty days, default 48 hours. The escrow is funded by a real x402 USDC payment, on Base or Solana, before the bounty goes live. A built-in pricing oracle suggests what to escrow, and it is derived, not vibes: expected attempts from the same geometric model, translated to grind hours at a published reference fleet rate of 1.5 million addresses per second, priced at one dollar per expected grind hour, clamped between a five cent floor and a five thousand dollar ceiling.

**Mining.** Workers poll the open queue, grind in parallel, and race. A claim contains the matching address and a sealed envelope, nothing else. The server verifies four things before paying: the address is a well-formed Solana key, it matches the bounty's pattern, the envelope is well-formed under the supported ECIES scheme, and the envelope's recipient is exactly the bounty's X25519 key. That last check is the secret-blind invariant: a worker can only submit an envelope the requester can open. It cannot open its own submission, the wire never carries plaintext, and neither does the operator, because the server-side verifier has no private key and structurally cannot decrypt.

**Settlement.** Exactly one worker gets paid. The store performs the open-to-settled transition as a compare-and-set keyed on the bounty id; the first valid claim flips it, and every later claim is told it lost the race. A deterministic claim digest makes retries idempotent, so a resubmitted claim is de-duplicated rather than double-paid. Payout and refund are exactly-once and mutually exclusive: a settled bounty cannot be refunded, an expired unfilled bounty refunds its escrow, and a recorded transaction short-circuits any re-send. The requester then fetches the sealed envelope and opens it client-side. The market keeps a public leaderboard of grinders ranked by USDC earned, plus live totals of open bounties, escrowed funds, and paid volume.

**Split-key, for wallets worth real money.** Sealed delivery still means the winning worker generated, and therefore momentarily saw, the key before sealing it. For high-value addresses, `three-split-key/v1` goes further. You pick a secret scalar a1 locally and publish only the point P1 = a1 times B. Workers grind an offset a2, checking candidates of the form P1 plus a2 times B. On a hit, the server verifies the point equation from public values alone and pays. You combine a1 plus a2 mod L on your own machine: neither the worker nor the server ever knew a1, so the full private key exists exactly once, on your device. The certificate carries this as a non-custody assertion any verifier recomputes. The tradeoff is surfaced, not hidden: the combined scalar is an expanded key, not a seed, so it signs perfectly through the SDK signer but cannot be typed into seed-only wallet imports.

## The EVM twin

The same philosophy runs on the other chain family. three.ws/eth-vanity grinds CREATE2 contract addresses: give it a deployer and an init code hash, and a worker pool races for a salt whose derived address matches your hex pattern. No private key is involved; a CREATE2 address is a deterministic function of deployer, salt, and init code.

three.ws/evm-wallet grinds real secp256k1 wallet keys with incremental point addition, one point addition per candidate instead of a full scalar multiplication. Its security model is written in the shadow of the 2022 Profanity disaster, where a 32-bit seed made every ground key brute-forceable: the base scalar here is a full 256 bits from the platform CSPRNG, the walk re-seeds every million attempts, and every match is independently re-derived through a separate code path before it may leave the worker. Uppercase pattern characters switch matching to EIP-55 checksum comparison. As on Solana, nothing is transmitted.

## Where it plugs into the rest of the platform

The suite feeds the platform's core loops. Launching a coin through the three.ws pump.fun launcher can grind a vanity mint address client-side first, defaulting to the 3ws brand mark, then hand the public key to the launch-prep endpoint so the unsigned transaction is built around it. The mint secret never leaves the browser; you co-sign locally. Agents get the same powers: the `vanity_grinder` MCP tool on the 3D Studio server grinds for any assistant, and an agent with an x402 wallet can buy a grind, post a bounty, or mine one, which makes vanity work one more job in the agent-to-agent economy. The gallery and market are readable by any assistant through `@three-ws/vanity-mcp`, so "how rare is this address" and "what should I escrow for this pattern" are one tool call away.

## Who this is for

**The self-custodian** grinds locally at three.ws/vanity-wallet and trusts nobody, because there is nothing to trust. **The collector** publishes verified grinds to the gallery and climbs the rarity leaderboard with receipts attached. **The requester** wants a six character pattern no laptop will find, posts a bounty, and receives a key no miner ever saw. **The miner** turns spare cores into USDC by racing open bounties. **The agent builder** wires in the SDK or MCP tools and gives an autonomous agent a branded wallet in one call.

## For developers

Reads are free, no key required.

**Quote a pattern, appraise an address:**

```
GET https://three.ws/api/vanity/bounties?view=quote&prefix=THREE
GET https://three.ws/api/vanity/gallery?view=appraise&address=<base58>
```

**A minimal market watcher in JavaScript:**

```js
const BASE = 'https://three.ws/api/vanity';

async function scan() {
  const { bounties } = await fetch(`${BASE}/bounties?view=open&limit=20`)
    .then(r => r.json());
  for (const b of bounties || []) {
    const q = await fetch(
      `${BASE}/bounties?view=quote&prefix=${b.pattern.prefix || ''}&suffix=${b.pattern.suffix || ''}`
    ).then(r => r.json());
    const reward = Number(b.amountAtomics) / 1e6;
    const fair = Number(q.oracle.suggestedAtomics) / 1e6;
    if (reward >= fair) console.log(`worth grinding: ${b.id} pays $${reward} (fair $${fair})`);
  }
}
setInterval(scan, 30000);
```

**Grind locally with the SDK:**

```js
import { grind, expectedAttempts } from '@three-ws/vanity';

console.log(expectedAttempts({ suffix: '3ws' })); // gate before you commit cores
const { publicKey, secretKey, attempts } = await grind({ suffix: '3ws' });
// secretKey is Keypair.fromSecretKey compatible and never left this machine
```

**Give your assistant the market:** `npx -y @three-ws/vanity-mcp` exposes eight read tools over stdio: `vanity_quote`, `vanity_appraise`, `vanity_board`, `vanity_open`, `vanity_stats`, `vanity_leaderboard`, `vanity_config`, and `vanity_gallery`. Docs at three.ws/docs/mcp-vanity. The paid write paths (posting and claiming bounties, plus the hosted grinder at `/api/x402/vanity` and `/api/x402/vanity-verifiable`) settle over x402 in USDC; pair with `@three-ws/x402-fetch` to automate the 402. Settlement happens only after a successful grind, so an exhausted time budget costs nothing.

**Two mini tutorials.** To grind and publish: open three.ws/vanity-wallet, enter a suffix, and let it run; or buy the verifiable lane, paste the receipt at three.ws/vanity/verify, watch every check recompute green, then publish it to the gallery. To buy a hard pattern: open three.ws/vanity/bounties, let the oracle price the pattern, generate the recipient key on the page and store its private half safely, escrow via the x402 modal, and when the board shows settled, reveal and open the envelope client-side. Import the key, then confirm against the certificate registry that yours is the canonical proof.

## The honest limits

The suite documents its edges instead of hiding them. Prefix difficulty can exceed the 58-to-the-n estimate because leading Base58 characters are not uniform; suffixes are, and the UI says so. The hosted grinder caps patterns at three characters, two for mnemonic mode, because serverless time budgets are real; longer patterns belong in your browser pool or the bounty market by design. Sealed-envelope bounties still mean the winning worker briefly held the key before sealing it, which is why split-key exists for high-value targets, and split-key wallets in turn cannot be imported into seed-only wallets, a limitation printed on the tin. The MCP grinder returns a plaintext secret over a channel your MCP host may log: import it immediately or grind locally instead. And rarity measures the difficulty of the pattern, not the market price of the address; the gallery ranks work, the market discovers price.

## Where to start

Grind your first address: three.ws/vanity-wallet. Verify a receipt or certificate: three.ws/vanity/verify. Browse and appraise: three.ws/vanity/gallery. Post or mine a bounty: three.ws/vanity/bounties. The EVM side: three.ws/eth-vanity and three.ws/evm-wallet. The service key everything pins to: three.ws/.well-known/three-vanity.json.

Your keys, your cores, your address. The proof is the product.
