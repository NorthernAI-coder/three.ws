# Coin Launch & Wallets

UX Flow Atlas — Cluster 08. Traced end-to-end against real source. Routes resolved
via `vercel.json` rewrites → page HTML → imported modules. All on-chain paths use
real Solana/EVM RPC, pump.fun, and x402 — no mocks.

> Coin rule: the launcher is generic coin-agnostic plumbing — the user supplies
> their own name/symbol/description/mint at runtime. The platform's own promoted
> coin is `$THREE` (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`), surfaced
> on `/three` and `/three-live`. The launch flow stamps every minted address with
> the leading `3ws` brand mark.

---

### Launch a Coin — `/launch`
- **Source:** `pages/launch.html` (inline module imports `/launch/launch.js`) → `public/launch/launch.js` (`mountLaunchCoin`) → `public/studio/launch-panel.js` (`mountLaunchPanel`, the real flow) → `public/studio/fees-panel.js` (`mountFeesPanel`, post-launch). Vanity stamp: `src/solana/vanity/grinder.js` + `src/solana/vanity/brand.js` (`THREE_WS_VANITY`).
- **Entry point:** `#launch-root` mounts a two-column shell: agent picker (left, `launch.js`) + launch panel (right, `launch-panel.js`).
- **Prerequisites / gates:**
  - Account/session required to actually launch (`GET /api/auth/me`). Signed-out users see the guided empty state; the launch button reads "Sign in to launch."
  - A non-demo agent/avatar must be selected (panel refuses `__demo__`).
  - Wallet source: either a connected Solana wallet (Phantom/Backpack/Solflare/backpack) that is SIWS-**linked** to the account, OR a custodial agent wallet.
  - SOL balance ≥ estimated cost (`PUMP_BASE_COST` 0.022 SOL + initial buy). USDC coin type debits the buy from the wallet's USDC ATA instead of SOL.
- **Steps (N):**
  1. Page boots: `fetchMe()` then `fetchAvatars()` (`GET /api/avatars?limit=100`). Picker shows 3 shimmer skeletons while loading.
  2. Picker renders agent cards; `?avatar=<id|slug>` deep link is honored, else the first agent is auto-selected. Panel pre-fills name/symbol/description from the avatar.
  3. Panel auto-checks for an existing mint for the selected agent (`GET /api/pump/by-agent?agent_id=|avatar_id=`). If one exists, it shows the "Token already launched" card with stats + Fees & rewards panel (skip to step 16) unless the user clicks "Launch a new token."
  4. (optional) User edits the **token image** — click/drag-drop a file (≤4 MB), or "📸 Use 3D view" to snapshot the preview canvas (only when a preview viewer is present, i.e. studio mount).
  5. User edits **name** (≤32 chars), **symbol** (≤10 codepoints, any chars incl. emoji; auto-derived from name until edited), **description** (≤500).
  6. User picks a **coin type**: Regular / Mayhem / Agent (default, buyback-bound) / USDC / Reward.
  7. (optional, Agent/USDC only) User sets the **buyback share** slider (0–50%, `buybackBps` 0–5000).
  8. (optional) User sets an **initial buy** (SOL, max 50; or USDC, max 1,000,000). Live cost line in the wallet bar updates as they type.
  9. User picks **wallet source** via the tab toggle: "Connected wallet" or "Agent wallet (custodial · server-signed)."
  10a. **Connected-wallet path:** if no wallet detected → "Install Phantom" opens phantom.app. If detected but not connected → "Connect" calls `wallet.connect()`. Balance polls every 30s via `/api/solana-rpc`. (optional) "Deposit" opens a modal with a Solana Pay QR + copyable address.
  10b. If the connected wallet is not SIWS-linked → "Link wallet" button runs the link ceremony: `POST /api/auth/wallets/nonce-solana` → `provider.signMessage` → `POST /api/auth/wallets/link-solana`. A 409 (`address_in_use`) flips to a "Transfer wallet to this account" confirmation that re-signs with `takeover:true`.
  10c. **Agent-wallet path:** `POST /api/pump/agent-wallet` provisions/resolves the custodial wallet, returns address + lamports/sol. (optional) "Fund" opens a deposit modal (QR + address); balance polls every 30s.
  11. User clicks **Launch $SYMBOL**. The button's `data-action` routes: sign-in / focus-first-missing-field / connect / link / agent-fund / agent-retry / launch.
  12. **Build metadata** (both paths): phase `building` — if image present, `fileToDataUrl`, then `POST /api/pump/build-metadata` → `metadata_url` (cached by name|symbol|desc|hasImage key).
  13a. **Connected-wallet launch:** phase `stamping` — client grinds the `3ws` mint keypair via `grindVanity(THREE_WS_VANITY)` with live k/s + ETA progress. Then phase `signing` → `POST /api/pump/launch-prep` (sends `wallet_address`, `mint_address` = ground pubkey, coin_type, buyback_bps, buy-in, network=mainnet) → returns `tx_base64` + `prep_id`. Deserialize `VersionedTransaction`, `wallet.signTransaction`, then co-sign with the ground mint keypair.
  13b. Phase `confirming` — `conn.sendRawTransaction(skipPreflight:false)` over `/api/solana-rpc`, then `pollConfirmation` (75s, 2s interval). On confirm → `finalizeConfirm`: `POST /api/pump/launch-confirm` with `prep_id` + `tx_signature` → echoes `pump_agent_mint.mint`.
  14a. **Agent-wallet launch:** phase `stamping` (server stamps `3ws`), then phase `confirming` → `POST /api/pump/launch-agent` (server signs + submits with the custodial key, ~10s) → returns `mint`. Agent balance refreshes.
  15. Phase `success` — success card shows the stamped mint (with the `3ws` mark visually emphasized), "✓ three.ws coin" badge, links to pump.fun / Solscan / the agent page, "Copy launch announcement," and "Launch another token."
  16. (existing-token branch) Fees & rewards panel mounts against the mint for claim/delegation management.
- **Decision points / branches:**
  - Existing mint found → existing-token card vs. "force new."
  - Coin type: Regular / Mayhem (high-volatility, no buyback) / Agent (SOL buyback+burn) / USDC (stablecoin-paired agent) / Reward (delegated creator fees; launches as a plain coin, fees split post-graduation). USDC & Reward both remap server-side (`coin_type: 'agent'` / `'regular'`).
  - Wallet source: connected (client-grinds mark, client-signs) vs. agent (server-grinds, server-signs).
  - Connected path may require a one-time SIWS link, and a link may hit a takeover branch.
  - Confirmation timeout → escape-hatch screen ("Finalize once confirmed" re-checks signature status, "Start over").
- **External calls / dependencies:** `/api/auth/me`, `/api/avatars`, `/api/pump/by-agent`, `/api/auth/wallets`, `/api/auth/wallets/nonce-solana`, `/api/auth/wallets/link-solana`, `/api/pump/agent-wallet`, `/api/pump/build-metadata`, `/api/pump/launch-prep`, `/api/pump/launch-confirm`, `/api/pump/launch-agent`, `/api/solana-rpc` (Connection RPC). External: `esm.sh/@solana/web3.js@1.98.4`, `esm.sh/qrcode@1.5.3`, pump.fun (mint target), Solscan (links).
- **Success state:** `lp-ok` card — stamped mint, verified badge, pump.fun/Solscan/agent-page links, share-announcement copy, relaunch button. The coin appears in `/launches` within 60s via live refresh.
- **Empty / error states:** signed-out / no-avatar guided onboarding (4-step explainer + coin-type legend + cost note); "Checking for existing token…"; per-phase `lp-phase` status line; `friendlyError()` maps rejections/insufficient SOL/no-wallet/rate-limit to plain copy; confirmation-timeout escape hatch; agent-wallet error/retry/provision states; insufficient-balance "Fund" CTA.
- **Step count:** 15 required (+5 optional)

---

### Launch Feed — `/launches`  (and `/launches/:mint` detail)
- **Source:** `pages/launches.html` → `src/launches.js`. Imports `src/pump/coin-status-card.js` (`mountCoinStatus`), `src/shared/agent-wallet-chip.js` (`walletChipEl`).
- **Entry point:** `#lx-feed` (card grid), hero stats, network/oracle filter buttons, marquee ticker, ambient particle canvas.
- **Prerequisites / gates:** None — fully public, read-only.
- **Steps (N):**
  1. Boot reads URL params: `network` (mainnet|devnet), `agent_id` (UUID), `oracle_tier` (prime|strong|lean). Starts the particle field; renders 8 skeletons.
  2. `loadPage()` → `GET /api/pump/launches?network=&offset=&limit=24[&agent_id=&min_tier=]`. Registry rows render immediately as cards.
  3. Per mainnet card, `mountCoinStatus` fetches `GET /api/pump/coin?mint=` and streams price / logo / market cap / graduation over the seeded identicon placeholder. Devnet cards show a static identity line.
  4. After each page, `enrichCardsWithOracle` batch-fetches `GET /api/oracle/batch?mints=…&network=mainnet` (≤20/req) and paints a conviction tier badge.
  5. (optional) User toggles **network**, picks an **Oracle tier**, or applies an **agent filter** (chip resolved via `GET /api/agents/:id`) — each resets and reloads the feed; URL is kept in sync.
  6. (optional) User clicks **Load more** (offset paginates) or stars a coin (localStorage `ld_watchlist`).
  7. Live refresh every 60s re-checks page zero and prepends genuinely new launches.
  8. (optional) Per card: open coin detail (`/launches/:mint`), pump.fun, 3D view (`/coin3d?mint=`), 3D world (`/communities/:mint`), or the launching agent's profile.
- **Decision points / branches:** mainnet vs devnet (devnet → Explorer link, no market data); filtered vs. unfiltered empty state; watchlist toggle.
- **External calls / dependencies:** `/api/pump/launches`, `/api/pump/coin`, `/api/oracle/batch`, `/api/agents/:id`. External: pump.fun, Solscan, Solana explorer (links).
- **Success state:** populated card grid with live market data, ticker, hero stats (count / latest / network).
- **Empty / error states:** "No launches yet" (with Create-agent / Forge CTAs) or "No matching launches" (Clear-filters) for filtered views; devnet-specific copy; `renderError` with Retry; per-card identicon fallback when pump.fun art is missing.
- **Step count:** 4 required (+4 optional)

---

### Claim Wallet (Trader Card) — `/claim-wallet`
- **Source:** `pages/claim-wallet.html` → `src/claim-wallet.js`.
- **Entry point:** `#cwInput` address field + `#cwBtn` Preview; results render in `#cwResult`.
- **Prerequisites / gates:** Preview is public. Claiming requires sign-in AND control of the keypair (SIWS signature). The claimed wallet must equal the connected wallet.
- **Steps (N):**
  1. Boot warms `GET /api/auth/me`. `?wallet=` param pre-fills + auto-previews.
  2. User pastes a base-58 Solana wallet; client validates with `WALLET_RE`.
  3. Click **Preview** → `GET /api/traders/preview?wallet=` → renders the Trader Card: label, win rate / early-win / smart-money score / net PnL / dumps stats, and up to 15 recent pump.fun coins.
  4. CTA branches by state: claimed (View card + Share) / signed-in-unclaimed (Claim button) / signed-out (Sign-in-to-claim link). Claimed status verified via `GET /api/auth/wallets` (filtered to chain_type=solana).
  5. (claim) User clicks **Claim this wallet** → detect provider → `provider.connect()`. If connected pubkey ≠ previewed wallet, abort with a switch-wallet message.
  6. `POST /api/auth/wallets/nonce-solana` → `provider.signMessage` (gasless, no tx) → base64.
  7. `POST /api/auth/wallets/link-solana` with message+signature. A 409 `address_in_use` prompts a `window.confirm` takeover; on confirm, re-POST with `takeover:true`.
  8. On success, re-read linked wallets (force) and re-render in the claimed state; message "Claimed — your Trader Card is live."
- **Decision points / branches:** claimable+known vs. not-indexed (`notFoundHtml`); signed-in vs out; wallet-mismatch; takeover confirm; share via Web Share API vs Twitter intent.
- **External calls / dependencies:** `/api/auth/me`, `/api/traders/preview`, `/api/auth/wallets`, `/api/auth/wallets/nonce-solana`, `/api/auth/wallets/link-solana`. Wallet providers: Phantom/Solana/Backpack/Solflare.
- **Success state:** "Your Trader Card is live" card with View (`/trader/:wallet`) + Share buttons; linked row reflected server-side.
- **Empty / error states:** invalid-address inline error; "Wallet not yet indexed" not-found state; signature-cancelled message; per-step error toasts on the claim button.
- **Step count:** 8 required (claim path; preview alone is 3)

---

### Solana Vanity Wallet — `/vanity-wallet`
- **Source:** `public/vanity-wallet.html` (self-contained inline module). Grinder: `src/solana/vanity/grinder.js` (`grindVanity`); validation: `src/solana/vanity/validation.js`.
- **Entry point:** Prefix / suffix inputs, case-insensitive toggle, CPU-core slider, Generate button.
- **Prerequisites / gates:** None to grind (runs entirely in-browser; keys never leave the device). Assigning the result to an agent requires sign-in.
- **Steps (N):**
  1. User types a **prefix** ("Starts with", ≤6) and/or **suffix** ("Ends with", ≤6); live base-58 validation, difficulty meter, and per-core ETA update.
  2. (optional) Toggle **case-insensitive** (much faster). (optional) Click a suggested pattern chip. (optional) Adjust **CPU cores** (slider + presets; defaults to half of hardware concurrency).
  3. Click **Generate wallet** → `grindVanity({ prefix, suffix, ignoreCase, maxWorkers })` spins a Web Worker pool. Live attempts/sec, ETA, and an animated scan line.
  4. (optional) **Pause/Resume** or **Stop** (AbortController) mid-grind.
  5. On hit → result card: highlighted address, attempts/duration/rate stats, **Download keypair (Solana CLI JSON)**, **Copy public key**, and a "save before leaving" warning.
  6. (optional) **Assign to an agent**: `GET /api/agents`. If 401 → sign-in prompt; if none → create-agent prompt; else select an agent + check the custody-ack box.
  7. (optional, assign) If the agent already has a wallet, the flow switches to "Replace" — `DELETE /api/agents/:id/solana` first, then `POST /api/agents/:id/solana` with `secret_key` (array) + `vanity_prefix`/`vanity_suffix`. 409 handled. Success confirms "encrypted server-side" custody transfer.
- **Decision points / branches:** prefix vs suffix vs both; case-sensitive vs insensitive; assign vs keep self-custody; replace-existing-wallet branch.
- **External calls / dependencies:** None for grinding (client-side WASM ed25519 workers). Assign: `/api/agents`, `/api/agents/:id/solana` (POST + DELETE).
- **Success state:** vanity address found + downloadable keypair; optionally "Assigned to <agent>" with an open-agent link.
- **Empty / error states:** invalid-Base58 preview; combined-length-over-max warning; grind-failed error; assign 401/empty/409/network errors each handled inline.
- **Step count:** 3 required (+4 optional)

---

### EVM CREATE2 Vanity (contract address) — `/eth-vanity`
- **Source:** `public/eth-vanity.html` (inline module). Grinder: `src/eth/vanity/grinder.js` (`grindCreate2Vanity`); validation: `src/eth/vanity/validation.js`; wordlist: `src/eth/vanity/wordlist.js`. (Card variant also in `src/agent-eth-vanity-card.js` for agent pages.)
- **Entry point:** Prefix/suffix inputs, deployer-factory address, init-code-hash (or raw init code to auto-hash), Grind button.
- **Prerequisites / gates:** None to grind (computes a salt, not a private key — fully deterministic, in-browser). Assign-to-agent requires sign-in.
- **Steps (N):**
  1. User enters a hex **prefix/suffix** (EIP-55 case-sensitive if any A–F uppercase), a **deployer/factory** address (preset chips e.g. Arachnid available), and an **init code hash** (or pastes raw init code → auto-keccak to fill the hash).
  2. Live preview + EIP-55 case-sensitivity tag + per-core ETA; Grind enabled only when deployer + hash + pattern all validate.
  3. Click **Grind** → `grindCreate2Vanity({ deployer, initCodeHash, prefix, suffix })` worker pool grinds salts; live attempts/rate/ETA + animated scan.
  4. (optional) **Cancel** (AbortController).
  5. On hit → result card: predicted address (checksummed when case-sensitive), **salt**, deployer, initCodeHash. Copy salt / copy address / **Download JSON**.
  6. (optional) **Assign to an agent**: `GET /api/agents` → select → `POST /api/agents/:id/eth-vanity` with deployer/salt/init_code_hash/(raw init_code)/predicted_address/pattern. 409 → confirm replace → DELETE then re-POST. No private key stored (the record is a deterministic CREATE2 input set).
- **Decision points / branches:** raw-initcode-provided (enables one-click deploy later, Arachnid-only) vs hash-only; case-sensitive EIP-55 vs lowercase; assign + replace branches.
- **External calls / dependencies:** None for grinding. Assign: `/api/agents`, `/api/agents/:id/eth-vanity` (POST + DELETE). Hashing via `@noble/hashes/sha3`.
- **Success state:** "Salt found" — predicted vanity contract address + salt; optionally assigned to an agent for later deploy from the agent home page.
- **Empty / error states:** invalid deployer / init-code-hash inline; grind-failed error; assign 401/empty/409/network handled.
- **Step count:** 4 required (+2 optional)

---

### EVM Vanity Wallet (EOA) — `/evm-wallet`
- **Source:** `public/evm-wallet.html` (inline module). Grinder: `src/eth/vanity/eoa-grinder.js` (`grindEoaVanity`); validation + wordlist as above.
- **Entry point:** Prefix/suffix inputs, core slider, Grind button.
- **Prerequisites / gates:** None — pure self-custody. The private key is generated in-browser and never sent to the server (no agent-assign path; importable into MetaMask/ethers/viem/Rabby).
- **Steps (N):**
  1. User enters a hex **prefix/suffix** (≤MAX_PATTERN_LENGTH; EIP-55 case-sensitive if any A–F). Live preview + ETA. (optional) wordlist chips + core slider/presets.
  2. Click **Grind** → `grindEoaVanity({ prefix, suffix, … })` secp256k1 + keccak worker pool; live attempts/rate/ETA + scan animation.
  3. (optional) **Cancel** mid-grind.
  4. On hit → result card: checksummed address, attempts/rate stats, the **private key** (injected as text, not markup), **Copy private key**, and **Download keystore** (encrypted UTC keystore via `Wallet`).
  5. Self-custody warning — three.ws never receives the key, so there is no server handoff.
- **Decision points / branches:** prefix/suffix/both; case-sensitive vs not; copy raw key vs download encrypted keystore.
- **External calls / dependencies:** None — fully client-side (secp256k1/keccak workers; ethers `Wallet` for keystore export).
- **Success state:** vanity EOA with downloadable encrypted keystore + copyable private key.
- **Empty / error states:** invalid-hex inline; grind-failed error; keystore-export error handled at the download button.
- **Step count:** 4 required (+1 optional)

---

### Agent Wallet x402 Pay (3D demo) — `/play/agent-wallet`
- **Source:** `pages/play/agent-wallet.html` → `src/play-agent-wallet.js`. Uses `src/game/avatar-rig.js` + `src/game/play-handoff.js`. Bridge: hosted `api/agent-wallet-bridge` (prod) or local `scripts/agent-wallet-x402-bridge.mjs` on `127.0.0.1:4402` (dev).
- **Entry point:** `#stage3d` 3D scene (avatar + kiosk + stage board) + side panel with topic chips, endpoint card, and a Pay button.
- **Prerequisites / gates:** Bridge must be **online** (status poll). On the **hosted** bridge a real spend requires a signed-in session (402→401 surfaces "Sign in to pay"); rate-limited (429) handled. Agent wallet must hold USDC.
- **Steps (N):**
  1. Boot loads the saved `/play` avatar (`CC_AVATAR_KEY` / `?avatar=`), builds the 3D rig, and calls `refreshStatus()` → bridge `?status=1` for wallet address/mode + USD balance. Status repolls every 30s.
  2. `loadQuote()` → bridge `?quote=1&endpoint=…&method=POST&body={topic}` → fills endpoint name, price, pay-to, tags.
  3. (optional) User selects a topic chip (BTC/ETH/SOL) — re-quotes implicitly on next pay.
  4. User clicks **Send avatar to pay — $0.01 USDC**. Avatar walks to the kiosk (stage `walk`); pay ring pulses.
  5. `POST` bridge `?pay=1` (SSE, `accept: text/event-stream`) streams stages: `challenge` (402) → `signing` (agent wallet signs the SPL USDC transfer) → `signed`/`submitting` (X-PAYMENT submitted, facilitator settles) → `done` (settled on Solana mainnet). Board, kiosk, and side-panel stepper animate in lockstep.
  6. On `done` → receipt: amount, payer (agent wallet) → payTo (endpoint), Solscan tx link, and the purchased crypto-intel payload (signal/headline/rationale). Avatar plays a celebrate emote, then walks home. Status refreshes; session total accrues.
- **Decision points / branches:** local dev bridge vs hosted prod bridge (different URL shapes + auth model); `?bridge=`/`?endpoint=` overrides; 401 needs-auth vs 429 rate-limit vs generic failure; bridge online/offline/connecting.
- **External calls / dependencies:** bridge `status`/`quote`/`pay` (`/api/agent-wallet-bridge` or local `:4402`); the paid endpoint `https://three.ws/api/x402/crypto-intel`; Solana mainnet settlement via the x402 facilitator; Solscan (tx link). External payment is **real** ($0.01 USDC leaves the wallet).
- **Success state:** "✓ $0.01 USDC settled on Solana" board + receipt card with tx link and purchased intel; avatar celebrates.
- **Empty / error states:** "Bridge offline" banner (dev hint to run the bridge) with Retry; low-balance banner; "Sign in to pay" (needs-auth); rate-limit message; "Payment failed — no funds moved" with the stepper marking the failed stage red.
- **Step count:** 6 required (+1 optional)

---

### Avatar Wallet Chat — `/avatar-wallet-chat`
- **Source:** `pages/avatar-wallet-chat.html` (self-contained inline module). Avatar rendered via `/avatar-embed.html` iframe (postMessage bridge).
- **Entry point:** Avatar iframe + a wallet chip (balance/network/address) + a chat composer.
- **Prerequisites / gates:** Read-only wallet view is open. Autonomous SOL sends run through `/api/agent/send-sol` (optional `?token=` shared secret → `x-avatar-token` header). A server-side IBM Granite Guardian governance check can block a send.
- **Steps (N):**
  1. Boot configures the avatar iframe (`?id=`/`?handle=`/`?model=`, transparent bg, overlay mode) and posts a `v1.avatar.hello`; queued speech/gestures flush on `v1.avatar.ready` (or a 5s resilience timeout).
  2. `refreshWallet()` → `GET /api/agent/wallet` → renders balance (SOL + USD), network badge, short address + explorer link.
  3. A "Fund your wallet" hint appears when the live balance can't cover a $1 send + fee buffer; user can copy the deposit address.
  4. User chats; `ask()` streams an assistant reply, the avatar speaks/gestures, and the model may emit actions.
  5. On a `sendSol` action → a payment card renders ("Signing & broadcasting…"); `POST /api/agent/send-sol` with `{ usd, to? }`.
  6. On success → card flips to "Confirmed on-chain" with SOL amount, recipient, and a Solscan signature link; the avatar celebrates and the wallet refreshes.
  7. If a send was held server-side, a governance chip explains the IBM Granite Guardian block (the action is already stripped from the stream — client never gates).
- **Decision points / branches:** avatar-source param (id/handle/model); send governance allowed vs blocked; send success vs fail; optional shared-secret token.
- **External calls / dependencies:** `/api/agent/wallet`, `/api/agent/send-sol`, the chat/stream endpoint, `/avatar-embed.html`; Solscan (links). Real on-chain SOL transfer on success.
- **Success state:** "Confirmed on-chain" payment card with signature link; avatar verbal + gesture confirmation.
- **Empty / error states:** "wallet offline" balance fallback; fund-hint / low-balance states; payment-failed card + toast + avatar "didn't go through"; governance-blocked chip.
- **Step count:** 6 required (+1 optional)

---

### threews.sol Name Claim (SNS subdomain) — `/threews/claim`
- **Source:** route `/threews/claim` → `pages/threews-claim.html` (self-contained inline module). Pay-by-name plumbing: `src/sns/pay-by-name.js`. Surfaced from `/three`'s rare-name studio.
- **Entry point:** `#tw-label` label input + `#tw-mint` Mint button; `#tw-status` availability line; `#tw-result`.
- **Prerequisites / gates:** Sign-in required to mint (CSRF token from `/api/csrf-token`; "not signed in" if absent). Minting an on-chain SNS subdomain under `*.threews.sol`.
- **Steps (N):**
  1. User types a label; input is lowercased and stripped to `[a-z0-9-]`. Debounced 350ms availability check.
  2. `GET /api/threews/subdomain?label=` → shows "<full> is available" (enables Mint) or "claimed by @user / owned by <addr>".
  3. User clicks **Mint** → `getCsrf()` (`GET /api/csrf-token`) → `POST /api/threews/subdomain` with `{ label }` + `x-csrf-token`.
  4. On success → "<full> minted" with the showcase URL and a Solscan tx link for the on-chain mint signature.
- **Decision points / branches:** available vs taken; pricing tier (common = free; short/dictionary/reserved are priced in $THREE, surfaced via `/three` name-quote before landing here); signed-in vs not.
- **External calls / dependencies:** `/api/threews/subdomain` (GET check + POST mint), `/api/csrf-token`; Solscan (tx link). On-chain SNS mint.
- **Success state:** Minted name card with showcase URL + tx signature link.
- **Empty / error states:** "Type a label to check"; availability "bad" state for taken names; mint-failed (re-enables button); not-signed-in CSRF failure.
- **Step count:** 4 required

---

### $THREE Economy — `/three`
- **Source:** `pages/three.html` → `src/three-economy.js`. Wallet/tier via `src/three-access.js` (`getAccess`) + `src/wallet.js` (`initWalletButton`).
- **Entry point:** "The Flow" canvas viz, live stats, treasury/rewards wallets, holder-tier ladder, pricing explorer, rare-name studio.
- **Prerequisites / gates:** All read-only. Connecting a wallet resolves the holder tier from on-chain $THREE; no purchase happens on this page (CTAs link out to `/three-token` to buy and `/threews/claim` to mint names).
- **Steps (N):**
  1. Boot fetches `/api/three/{catalog,stats,tier,access}` + `/api/token/price`; renders the flow viz, animated stats, and on-chain-verifiable treasury/rewards wallet addresses.
  2. (optional) User clicks **Connect wallet to see your tier** (hidden `#connect-wallet-btn` wired by `initWalletButton`); a `wallet:changed` event re-reads the tier and applies the discount live in the pricing explorer.
  3. (optional) **Rare-name studio:** user types a `*.threews.sol` name → `GET /api/three/name-quote?name=` → "Free to mint" (common) or a $THREE rarity price; links to `/threews/claim` to mint.
  4. (optional) Explore the holder-tier ladder (Live vs Planned feature matrix from `/api/three/access`) and the pricing explorer (tier discount applied).
- **Decision points / branches:** wallet connected (real tier) vs synthesized-from-wallet vs no-wallet; name common (free) vs rare (priced).
- **External calls / dependencies:** `/api/three/catalog`, `/api/three/stats`, `/api/three/tier`, `/api/three/access`, `/api/three/name-quote`, `/api/token/price`. Wallet connect via the global `initWalletButton`.
- **Success state:** fully populated economy dashboard reflecting live treasury/rewards/holder data; tier + discount applied for a connected wallet.
- **Empty / error states:** connect-wallet prompts where no tier is resolved; designed loading/empty states throughout; name-quote validation feedback.
- **Step count:** 1 required (+3 optional)

---

### $THREE Live (Protocol Pulse) — `/three-live`
- **Source:** route `/three-live` → `pages/three-live.html` (self-contained Three.js inline module). Empty-state helper: `src/shared/state-kit.js` (`emptyStateHTML`).
- **Entry point:** Full-screen 3D "living organism" viz of the $THREE protocol + a live trade ticker + hero badge.
- **Prerequisites / gates:** None — public, read-only, real-time.
- **Steps (N):**
  1. Boot fetches `GET /api/three-token/stats` (no-store) for figures and opens an SSE stream `GET /api/agents/pumpfun-feed?kind=trades&mint=<$THREE>`.
  2. Each on-chain trade emits a particle burst; whales send shockwaves through the 3D organism; the ticker prepends the trade.
  3. Hero badge tracks connection state (connecting → live/quiet → reconnecting on SSE error, with auto-reconnect); stats refresh on an interval.
- **Decision points / branches:** live vs quiet (no recent trades) vs error/reconnecting; reduced-motion aware.
- **External calls / dependencies:** `/api/three-token/stats`, `/api/agents/pumpfun-feed` (SSE). The mint is the fixed $THREE CA.
- **Success state:** live 3D protocol pulse with streaming trades and live stats badge.
- **Empty / error states:** "Live trades will appear here" guided empty ticker; "$THREE · stats unavailable" / "reconnecting…" hero badge; SSE auto-reconnect.
- **Step count:** 1 required (read-only/ambient)

---

### Coin 3D Snapshot — `/coin3d`
- **Source:** `pages/coin3d.html` → `src/coin3d/main.js`. Deep-linked from `/launches` cards and the MCP tool `pumpfun_token_3d`.
- **Entry point:** Full-screen Three.js scene seeded by `?mint=<base58>` (& optional `&network=`).
- **Prerequisites / gates:** A valid `?mint=` param. Read-only.
- **Steps (N):**
  1. Boot reads `mint` + `network`; shows a loading overlay.
  2. Parallel MCP calls via `POST /api/pump-fun-mcp`: `getTokenDetails`, `getBondingCurve`, `getTokenHolders` (top 12). Token logo fetched from its metadata URI (IPFS→HTTP, 6s timeout).
  3. Renders a spinning coin medallion (logo-textured), a galaxy of top holders (spheres sized by balance, tinted by concentration), and a graduation ring filled to bonding-curve progress. OrbitControls for interaction.
  4. (optional) Watchlist toggle persists to localStorage (`ld_watchlist`, shared with `/launches`).
- **Decision points / branches:** mainnet vs devnet; mint present vs missing; logo available vs fallback.
- **External calls / dependencies:** `/api/pump-fun-mcp` (pump.fun MCP), IPFS gateway for the logo. All on-chain/live.
- **Success state:** interactive 3D token scene (medallion + holder galaxy + graduation ring).
- **Empty / error states:** designed loading / error / empty overlays (`?mint=` missing, MCP failure, no holders) via the status-overlay helper.
- **Step count:** 3 required (+1 optional)

---

## Source-coverage notes
- All routes resolved and traced to real source. No missing source.
- `/launch` HTML loads its module by URL (`/launch/launch.js`) — the real source is `public/launch/launch.js`; the launch engine is `public/studio/launch-panel.js` (shared with `/studio` and the avatar page).
- `/vanity-wallet`, `/eth-vanity`, `/evm-wallet`, `/threews/claim`, `/three-live`, `/avatar-wallet-chat` are served from prebuilt HTML (`public/*.html` or `pages/*.html`) with self-contained inline modules; their crypto workers live under `src/solana/vanity/` and `src/eth/vanity/`.
- `/threews/claim` rewrites to `threews-claim.html` (no `pages/threews/` dir).
- `src/agent-eth-vanity-card.js` and `src/agent-vanity-grinder.js` are the embedded-card variants of the standalone vanity tools, mounted on agent home/dashboard pages rather than the standalone routes above.
