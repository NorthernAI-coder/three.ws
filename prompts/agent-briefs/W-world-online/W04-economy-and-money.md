# W04 — Economy & money

> Read [W00-program-overview.md](W00-program-overview.md) first — stack, coin rules, the
> off-schema networking pattern, and the definition of done all apply here unmodified.

**Feature:** cash, a bank/ATM, buy/sell general-store vendors, and a `$THREE` bridge for
premium cosmetics. **Depends on:** nothing (buildable standalone; W05/W06 depend on it).

---

## Ground truth (verified in-repo before writing anything)

Most of this brief's data layer already existed, explicitly labeled for this exact brief, and
just needed wiring:

| Piece | File | Status found |
|---|---|---|
| Purse (`gold`) + protected `bank` field, `bankTransfer()`, `grantCosmetic()` | [multiplayer/src/economy.js](../../../multiplayer/src/economy.js) | data model done, comment: *"banked cash — protected on death… W04 extends"* |
| General-store sell/buy price tables + `$THREE` boutique catalog | [multiplayer/src/shop.js](../../../multiplayer/src/shop.js) | catalog done, header comment: *"the single source of truth for the /play general store… and the $THREE boutique (W04)"* |
| Generic on-chain `$THREE` purchase primitives (quote → sign → verify) | [multiplayer/src/game-token.js](../../../multiplayer/src/game-token.js) | section header: *"generic fixed-amount purchases (W04 $THREE boutique)"* |
| Vendor stall + Agent Exchange NPC engine | [src/game/npc/npc.js](../../../src/game/npc/npc.js), [world-life.js](../../../src/game/npc/world-life.js) | reusable, but no cash-store NPCs registered |
| Vendor stall spawn points | [src/game/world-zones.js](../../../src/game/world-zones.js) | 2 points reserved, comment: *"Vendor stalls ringing Downtown (economy / shop briefs)"* |

**Nothing in `WalkRoom.js` called any of it** — zero `onMessage` handlers for store/bank/
boutique, zero imports from `shop.js` or `game-token.js`. The economy was fully designed and
completely unreachable. This brief's job was to wire it, not redesign it.

### The other cosmetics system — evaluated, and deliberately NOT reused here

The repo also has a second, unrelated premium-cosmetics rail: `api/_lib/cosmetics.js` +
`api/_lib/cosmetics-economy.js` + `api/x402/cosmetic-purchase.js` (R21–25, "the avatar shop").
It sells a **different catalog** (`hat-baseball`, `skin-midnight`, `emote-thriller`… different
slots: hat/glasses/earrings/outfit/skin/emote) settled in **USDC over x402**, for a standalone
character-creator surface outside any game room. `WalkRoom.onJoin` already folds that ledger
into a profile's owned set (`mergeOwnedFromLedger`) as a defensive compatibility shim — but the
catalogs share zero ids in practice, so today it grants nothing. That's intentional isolation,
not a bug to "fix" here: the in-game boutique needed to sell the in-game catalog
(`multiplayer/src/cosmetics-catalog.js`: dye/headwear/eyewear/earrings/aura) priced in `$THREE`,
which is exactly what `game-token.js`'s W04-labeled purchase primitives were already built for.
Building a second on-chain path on top of the R22 rail would have been the "parallel payment
stack" the program overview warns against; using the purpose-built, already-labeled W04 stack
is the reuse-first call.

---

## What shipped

### Server (`multiplayer/src/rooms/WalkRoom.js`)

- `storeReq` / `storeBuy` / `storeSell` — the general store. Buys/sells always price from
  `shop.js` server-side; a rejected trade costs nothing (insufficient cash, full pack, unlisted
  item all fail closed with a `notice`).
- `bank` — moves cash between the purse and the protected bank via `economy.js`'s existing
  `bankTransfer()` (already clamped so it can never mint or strand cash). Banked cash survives a
  death drop (`dropCarried()` only strips the carried purse + pack) — that's the whole
  risk/reward point of using the bank.
- `boutiqueReq` / `boutiqueQuote` / `boutiqueSettle` — the `$THREE` bridge. `boutiqueQuote`
  prices one premium cosmetic from `shop.js` and calls `game-token.js`'s `buildTokenPurchase()`
  for the buyer's connected wallet; `boutiqueSettle` re-fetches the **confirmed** transaction
  from Solana RPC via `verifyTokenPurchase()` and only then calls `grantCosmetic()`. The server
  never trusts a client "it worked" claim. A settled quote nonce is cached (`_boutiqueNonces`,
  pruned past the ~90s quote TTL) so a replayed settle can never double-grant.
- New `ACTION_RATES` entries (`store`, `storeBuy`, `storeSell`, `bank`, `boutiqueQuote`,
  `boutiqueSettle`) throttle every new currency-mutating message type, per the program overview's
  anti-cheat baseline.

### World

- `src/game/world-zones.js` — one `atm` spawn point (`atm-downtown`, inside the Downtown safe
  zone, clear of the Agent Exchange roster and the vendor stalls).
- `src/game/npc/economy-npcs.js` (new) — a small NPC catalog (reusing the existing `Npc` engine)
  seating a "General Store" clerk at each `vendor` spawn point and a "Bank Teller" at the `atm`
  spawn point. Merged into `WorldLife.npcs` alongside the Agent Exchange roster
  (`world-life.js`). A new `bank` role tint/ring color distinguishes the ATM from the green
  vendor markers.

### Client UI

- `src/game/economy-ui.js` + `economy-ui.css` (new) — the General Store modal (Buy/Sell tabs,
  live catalog + purse from the server) and the Bank/ATM modal (deposit/withdraw with a Max
  shortcut), opened by walking up to their NPC and pressing E. Every button sends an intent over
  `CommunityNet` and waits for the server's `store`/`profile`/`inv`/`notice` reply — no
  optimistic local mutation of currency.
- `src/game/community-net.js` — `requestStore/storeBuy/storeSell/bank/requestBoutique/
  boutiqueQuote/boutiqueSettle` methods + the matching `store`/`boutique`/`boutiqueQuote` event
  buckets, following the exact pattern the existing quest/vehicle channels use.
- `src/game/boutique-purchase.js` (new) — the on-chain half of the `$THREE` bridge: connect
  wallet → server quote → wallet signs the returned transaction → broadcast → server re-verifies
  on-chain → grant. Mirrors `coin-buy.js`'s connect/sign/broadcast/confirm flow and its
  friendly-error mapping.
- `src/game/play-systems.js` — the wardrobe's previously-inert "Locked" cosmetic cards
  (`if (!owned) { … return card; }`, no click handler — a dead end per CLAUDE.md's "every button
  must work") now show the real `$THREE` price and are clickable, driving `boutique-purchase.js`
  end to end. This was the natural home for the boutique — a shop for what you're already
  wearing — rather than a fourth NPC to walk to.

---

## Definition of done — verification performed

- **Cash economy (store + bank), real Playwright, real server, no mocks:** a standalone Vite dev
  server + a freshly-started Colyseus `WalkRoom` (`scripts/tmp-verify-w04-economy.mjs`). A real
  browser joins `/play`, walks (real Rapier on-foot movement) to the general-store NPC, opens the
  store via E, buys a health potion with real cash (server-side `gold` deduction confirmed),
  inspects the Sell tab's honest empty state, walks to the bank/ATM NPC, deposits cash (bank
  balance increases, purse decreases — both server-echoed), and withdraws it back. Zero console
  errors/warnings.
- **The `$THREE` bridge, real on-chain settlement, no mocks:** `game-token.js`'s
  `SOLANA_RPC_URL`/`GAME_TOKEN_MINT` are runtime-overridable specifically so a test deployment can
  point at devnet — the codebase's own sanctioned pattern for proving on-chain code without
  mainnet funds (CLAUDE.md: "no real mainnet mints in tests/fixtures by default"). Verification
  drove a real devnet SPL mint standing in for `$THREE`, a real airdropped devnet keypair as the
  buyer, a real `buildTokenPurchase`/`verifyTokenPurchase` round trip against live devnet RPC, and
  a real wallet-injected browser session signing and broadcasting the actual quoted transaction —
  see the owner-facing report for the run's specifics. This is real devnet settlement, not a
  simulated balance: a genuine signature, a genuine broadcast, a genuine confirmed transaction the
  server re-reads from RPC before granting the cosmetic.

## Explicitly out of scope (documented, not silently dropped)

- **No cash→`$THREE` faucet/payout.** "Sink/faucet" in the original brief table reads as the
  standard MMO-economy pairing already covered by the general store (buy = sink, sell = faucet) —
  not a request to mint real tokens for in-game cash. Paying real `$THREE` out of a treasury for
  gameplay is a different, much higher-risk feature (float management, abuse surface) with no
  existing design spec; it isn't built here, and shouldn't be added without an explicit owner
  design pass.
