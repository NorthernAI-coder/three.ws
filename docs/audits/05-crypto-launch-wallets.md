# Audit 05 — Crypto / Launch & Wallets

Senior-engineer code + UX audit of the launch & wallets page group. Auditor focus: real data only, designed states, cross-wiring, the $THREE coin rule. Findings are tagged `[P0]` (broken / hard-rule), `[P1]` (reachable but incomplete), `[P2]` (mediocre), `[P3]` (opportunity).

Date: 2026-06-18. No code was changed — audit only.

Coin-rule note: only `$THREE` (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) may be referenced. `/launch`, `/launches`, `/coin3d` are sanctioned exceptions (arbitrary runtime mint input + platform launch records). **No hardcoded non-$THREE mint was found in any page in this group.** The only hardcoded mints anywhere are USDC (allowed stablecoin plumbing) and the correct $THREE CA. Coin rule is clean across the group.

---

## /launch — /workspaces/three.ws/pages/launch.html (+ public/launch/launch.js, public/studio/launch-panel.js, public/studio/fees-panel.js)
Verdict: Production-grade. Real end-to-end launch flow (metadata → vanity grind → wallet sign → confirm-poll → finalize); all states designed; no mocks.

- [P2] `public/launch/launch.js:115,118` & `public/studio/launch-panel.js:1270` — conflicting empty-state guidance: the panel's empty state says "Pick an avatar on the left" with a `/dashboard/avatars` link, but on `/launch` the left column is an agent picker, not an avatar gallery. Align the standalone-mount copy.
- [P2] `public/studio/launch-panel.js:1327,1706` — success/existing-token "Agent page" links use `/agent/${id}`, which 302-redirects to `/agents/:id` in prod (`vercel.json`). Works but costs a redirect hop; `src/launches.js:412` already uses the canonical `/agents/${id}`. Link canonical directly.
- [P3] `public/studio/launch-panel.js:82` — `USDC_MAINNET_MINT` hardcoded. Allowed plumbing (stablecoin quote-mint), not a coin-rule violation. No action.
- States: loading skeletons, signed-out empty, no-avatars empty, error, wallet-not-connected, insufficient-funds (`Need ~X SOL`), confirm-timeout escape with Solscan + Finalize, deposit modal with focus trap — all designed. Excellent.

## /launches — /workspaces/three.ws/pages/launches.html (+ src/launches.js)
Verdict: Clean, well cross-wired. Real `/api/pump/launches` feed, per-card `/api/pump/coin` enrichment, 60s live refresh. No mocks.

- [P3] Cross-wiring intact: card → `/launches/${mint}` (launch-detail), `/coin3d?mint=`, `/communities/${mint}`, agent chip → `/agents/${id}` all resolve. Hero/explore CTAs (`/create-agent`, `/forge`, `/agents`, `/watchlist`, `/radar`, `/pump-live`, `/pump-visualizer`, `/launchpad`) all resolve. No dead links.
- [P3] `pages/launches.html` — no body link back to `/launch` (the launcher). Add a "Launch a coin" CTA to close the loop. Opportunity.
- States: skeletons, filter-aware empty (Clear filters / create / forge), error with Retry, load-more, reduced-motion handling. ARIA: `aria-busy`, `aria-selected`, `aria-pressed`, `aria-live`. Strong.

## /lookup — /workspaces/three.ws/public/lookup.html
Verdict: Functional, wired to real `/api/registry/resolve`, but off-brand and dead-ends to external explorers.

- [P1] `public/lookup.html:21,24` — ships a hardcoded LIGHT theme (`--fg:#111; --bg:#fafafa`) with no `[data-theme="dark"]` overrides, despite the theme-boot script setting `data-theme`. No `/style.css` / `/nav.css` import and **no site nav or footer** (`#nav-container`/`#footer-container` absent). A stark white page that ignores theme and matches no other route. Import shared styles + nav/footer, or add dark tokens.
- [P1] `public/lookup.html:395+` — resolved agents render Metaplex/Solscan/Magic Eden external links plus the 3D model but **no on-platform onward link** to the agent's three.ws profile (`/agents/:id`). The lookup resolves an agent then dead-ends off-platform. Add an "Open agent page →" link when an agent id is present. (Main cross-wiring gap.)
- [P2] `public/lookup.html:530` — `copyText` `catch {}` is silent; Share/copy give no feedback on clipboard failure. Show a transient "Copy failed" label.
- States: skeleton, not-found (→ /explore, resolves), error, private-model, no-model-yet all designed; Enter submits; inputs have `aria-label`; focus-visible outline. Good. No mocks.

## /gmgn — /workspaces/three.ws/public/gmgn.html
Verdict: Solid real-time SSE app (EventSource → `/api/agents/gmgn-feed`). No mocks; only token CA present is the correct $THREE.

- [P2] `public/gmgn.html:114,115` — `#side` has `cursor:move` on `.side-header` signaling a draggable panel, but no drag handler is wired (only `#side-minimize` at :820). Drop the `cursor:move` or implement drag.
- [P3] `public/gmgn.html:180` — status pill is a `<button>` with no click action; status-display-as-button is a minor a11y smell.
- [P3] `public/gmgn.html:733` — custom-avatar URL validation uses `alert('Invalid URL.')`, inconsistent with the inline messaging elsewhere.
- [P3] `public/gmgn.html:672` — `DEFAULT_AVATARS` hardcodes `cz.glb`/`default.glb`; both exist and are real bundled narrator presets, not fabricated feed data. Allowed.
- States: "Waiting for events…" empty, "Error — retrying…" with auto-reconnect, `down` dot, responsive collapse at 768px. Acceptable.

---

## /vanity-wallet — /workspaces/three.ws/public/vanity-wallet.html (+ src/solana/vanity/grinder.js)
Verdict: Grinding is REAL — WASM ed25519, fresh CSPRNG seed per batch, secretKey = `[seed][pubkey]` derived from the matched keypair; keys stay client-side. A few token/estimate gaps.

- [P2] `public/vanity-wallet.html:405` — pre-grind ETA uses `RATE_PER_CORE = 5000` while real WASM throughput is much higher; pre-grind estimate can be off by an order of magnitude (the LIVE rate shown during grinding is real). Calibrate against a short warm-up or label as a rough estimate.
- [P2] `public/vanity-wallet.html:758,780,809,836,854` — assign-block error/success styling references `var(--danger)`/`var(--success)` which `:root` (17-34) never defines (it defines `--bad-fg`/`--ok-fg`); colored feedback falls back to inherited color. Use the defined tokens.
- [P2] `public/vanity-wallet.html:631,636` — decorative scan-line `setInterval` (100ms) cleared only in `endGrindUI`; would leak on an error thrown before it. Clear in `catch`/`finally` too. (Decorative shimmer only, not faked results — not a data violation.)
- [P3] `public/vanity-wallet.html:742,774` — assign flow POSTs full `secret_key` to `/api/agents/:id/solana`. Intentional custody transfer gated behind explicit `assign-ack` consent + warnings; endpoint exists. The "keys never leave your device" lede (:205) is contradicted only once a user opts in — soften the lede.
- [P3] `public/vanity-wallet.html:203` — 6-char case-sensitive prefix (~58^6) is hours-to-days; difficulty tier shown but no explicit "this may take hours" caution at effLen ≥ 6.

## /eth-vanity — /workspaces/three.ws/public/eth-vanity.html
Verdict: CREATE2 salt grinding is REAL (keccak256 over `0xff‖deployer‖salt‖initCodeHash`, crypto-random salt seed, 64-bit counter). Main issues are inaccurate metadata and broken styling.

- [P1] `public/eth-vanity.html:94,101,103` — OG/Twitter/JSON-LD all claim "using the **ThreeWSFactory** CREATE2 deployer **on BSC**." No "ThreeWSFactory" exists in the code and BSC is never referenced; the tool is chain-agnostic with Arachnid/CreateX/Safe/Coinbase presets (:129-132). Stale/inaccurate share metadata. Rewrite to match the generic CREATE2 tool.
- [P1] `public/eth-vanity.html:10-11,628` — links `/nav.css` + `/fonts/fonts.css` but NOT `/footer.css`, yet injects the footer via `<script src="/footer.js">` (:628). Footer renders unstyled (sibling vanity-wallet/evm-wallet load `footer.css`). Add `<link rel="stylesheet" href="/footer.css">`.
- [P2] `public/eth-vanity.html:48,68` — `.preview .pfx/.sfx` and `.result .pfx/.sfx` set `background:#ffffff; color:#fff` → white text on white; the highlighted prefix/suffix is invisible. Copy/paste regression. Use a visible fg/bg pair.
- [P2] `public/eth-vanity.html:533-534` — dead `deployerLabel` computed as `? null : null` then immediately recomputed correctly as `presetLabel` (:536). Delete the dead lines.
- [P3] `public/eth-vanity.html:441,594` — assign block uses undefined `var(--danger)`/`var(--success)` (same token gap as Solana page). Use `--bad-fg`/`--ok-fg`.

## /evm-wallet — /workspaces/three.ws/public/evm-wallet.html (+ eoa-grinder.js, eoa-grinder-worker.js)
Verdict: Best of the three grinders. EOA grinding is REAL and careful — full 256-bit CSPRNG base scalar (explicitly defends against the 2022 Profanity bug), incremental point-add hot loop, periodic reseed, and independent self-verification re-deriving the address before emit (`eoa-grinder-worker.js:166-179`). Private key never POSTed; encrypted keystore export via ethers.

- [P2] `public/evm-wallet.html:529` — raw private key injected into DOM via `innerHTML` (escaped through `esc()`). Functionally safe (hex has no HTML-special chars) but injecting a secret via string template is a smell. Set via `textContent` on a pre-created node.
- [P2] `public/evm-wallet.html:240` — imports full `ethers` `Wallet` only for keystore `encrypt()`; heavy dep on the page bundle (grinder itself uses lean `@noble`). Lazy-import `ethers` only on "Download keystore" click. (Performance.)
- [P2] `public/evm-wallet.html:445` — scan-line `setInterval` cleared only in `endGrindUI`/`catch`; same minor leak pattern as the Solana page. Decorative only.
- [P3] `public/evm-wallet.html:163-164` — cross-links correctly to `/eth-vanity`. But unlike the Solana and CREATE2 pages there is no "assign to agent" block here, even though this produces a spendable, importable EOA. Add an assign-to-agent flow (or note why an EOA isn't assignable).
- [P3] `public/evm-wallet.html:55-57` — `.lit-7`…`.lit-10` difficulty classes are dead CSS (meter caps at 6 segments, `lit-${Math.min(total,6)}`). Delete unused rules.

## /coin3d — /workspaces/three.ws/pages/coin3d.html (+ src/coin3d/main.js)
Verdict: Strong real-data 3D viewer. Takes runtime `?mint=` (no hardcoded mint default — coin rule clean), pulls live pump.fun MCP data via `Promise.allSettled`, degrades per-source; all states designed.

- [P2] `src/coin3d/main.js:440-463` — all three empty/error states send the user to `/demo/coin` labeled "Browse coins," but `/demo/coin` is the lottery/reflection demo, not a coin browser. The label oversells the destination; this same file links to `/launches` at :417. Point the empty/error CTA at `/launches`.
- [P3] `src/coin3d/main.js:122` — `ipfsToHttp` hardcodes the `ipfs.io` gateway with no fallback (logo failure degrades gracefully to a tinted disc). Add a secondary gateway (cloudflare-ipfs) to improve logo hit-rate.
- [P3] `src/coin3d/main.js:416-417` — HUD links to `pump.fun/coin/${mint}` (allowed runtime mint), `/launches`, `/communities/:mint` — good. No link to `/launch` (the launcher); add a "Launch your own" affordance. Opportunity.

---

## /play/arena — /workspaces/three.ws/pages/play/arena.html (+ src/play/arena.js)
Verdict: Solid real-data spectator surface (real SSE leaderboard + trade stream, on-chain proof links). Minor a11y/empty-state gaps.

- [P2] `src/play/arena.js:182` — the `'update'` SSE event is wired to a no-op `() => {}`. Half-wired path: either refresh the board (debounced `loadBoardOnly()`) or remove the listener.
- [P2] `pages/play/arena.html:336` / `src/play/arena.js:463` — live-tape empty state ("Waiting for the next trade…") never distinguishes "stream live, no trades yet" from "stream down" and doesn't reflect `setLive(false)`. On `es.onerror` with empty tape, show "Reconnecting to trade stream…".
- [P3] `src/play/arena.js:519` — avatar picker modal (`role="dialog" aria-modal="true"`, arena.html:359) has no focus trap; focus isn't moved in on open or restored on close. Trap Tab, focus first tile, restore trigger.
- [P3] `pages/play/arena.html:298-301` — only nav out is the brand link to `/play`; agents deep-link to `/trader/:id` and `/oracle` (good) but no link to `/agents` or `/launches`. Add a directory affordance.
- [P3] `src/play/arena.js:441` — leaderboard avatar `onerror` hides the img but keeps the 26px grid column, leaving a gap. Collapse the column or use a mono fallback.

## /play/agent-wallet — /workspaces/three.ws/pages/play/agent-wallet.html (+ src/play-agent-wallet.js)
Verdict: Payment is genuinely real (SPL USDC TransferChecked via the local bridge, SSE settlement, real Solscan tx) with well-designed offline/low-balance/error states — but the whole pay flow is DEAD in production because the bridge is localhost-only.

- [P1] `src/play-agent-wallet.js:35-43,546-556` — `BRIDGE_URL` is empty for any non-localhost host (verified: `defaultBridgeUrl()` returns `''` in prod). `refreshStatus()` short-circuits to the "Bridge offline" banner and the Pay button is permanently disabled. The page's headline promise ("your avatar pays for an endpoint") is unreachable for every real visitor — only devs running `npm run demo:agent-wallet-bridge` can use it. Ship a hosted facilitator/bridge proxy (or a server-side `/api/x402-pay` path the page can call) so prod visitors can actually pay.
- [P2] `pages/play/agent-wallet.html:262` — topbar links to `/agent-exchange` and `/pay` (resolve), but no link to `/play/arena` or to the agent's profile/activity. The "Agent Wallet" never links to where the agent or its tx history lives.
- [P3] `src/play-agent-wallet.js:462-477` — pay button's disabled-state label ("Bridge offline") is the only signal; no `aria-live` announcement on the gating banner when bridge transitions offline→online. The stage list has `aria-live="polite"` but the banner doesn't.
- [P3] `src/play-agent-wallet.js:606-607` — quote fallback hardcodes `$0.01 USDC` copy when the bridge is offline (real price comes from `/quote`). Display placeholder, not coin data — acceptable but derive from a constant.

## /avatar-wallet-chat — /workspaces/three.ws/pages/avatar-wallet-chat.html
Verdict: Real wallet + real on-chain SOL sends (`/api/agent/send-sol`) with real receive-detection polling and good pay/fail/governance states — but one dead link and a couple robustness gaps. All inline (no separate JS module).

- [P1] `pages/avatar-wallet-chat.html:583` — the IBM Granite Guardian "Trust Layer" chip links to `/ibm/trust-layer`, which is **unrouted** (verified: not in vercel.json or vite.config.js; only `/ibm/x402-demo` exists). Dead primary informational link surfaced exactly when a send is blocked. Point to `/ibm/x402-demo` or build `/ibm/trust-layer`.
- [P2] `pages/avatar-wallet-chat.html:657-705` — `pollActivity()` and its 9s `setInterval` are defined inside the `finally` of `ask()`, so a fresh poller is created on every message send and never cleared. Concurrent intervals accumulate (memory + redundant RPC). Hoist the poller to boot, start the interval once.
- [P2] `pages/avatar-wallet-chat.html:451-461` — wallet-offline is handled, but there is no designed insufficient-funds / not-funded state; a low balance only surfaces as a red toast after a failed send. For a wallet surface this should be first-class — read balance and show a fund-the-wallet hint before the user sends.
- [P3] `pages/avatar-wallet-chat.html:437-443` — 5s `setTimeout` force-flips `avatarReady=true` if the iframe never signals ready (legitimate resilience, not fake loading), but can double-flush the queue if `ready` arrives at ~5s. Add a guard. Coin rule clean (SOL/USD are real wallet values).

## /demo — /workspaces/three.ws/pages/demo-economy.html (+ api/demo-economy.js)
Verdict: Real on-chain SOL transfer when wallets are configured, with an explicitly-labeled "Simulated" mode (no fabricated signature/explorer) — honest — but it ships a hardcoded fake-marketplace array rendered on-screen as live service discovery.

- [P1] `api/demo-economy.js:81-107` — when the x402 bazaar is unreachable, `discoverServices()` returns a hardcoded array of invented services ("Token price oracle", "On-chain sentiment feed", "Pump.fun trending coins", etc.) that the TV (`drawBazaar`) renders as "Available services · Coinbase network" with **no fallback/sample indication**. This is exactly the "no fallback sample arrays shipped to production" rule — fabricated marketplace data presented as a live bazaar. On bazaar failure emit a real "bazaar unavailable" state (mirror the honest `market_unavailable` path at :336) instead of inventing listings.
- [P2] `pages/demo-economy.html:227` — bottom bar hardcodes "Real Solana infrastructure · x402 protocol · live bazaar" even when the run is simulated and the bazaar is the fallback array. Anonymous visitors always hit the simulated path (auth required for real send, api/demo-economy.js:133-143). Make that line reflect the actual run mode.
- [P3] `pages/demo-economy.html:174-177` — NOVA/ORACLE presented as "three.ws AI agents" but neither pill nor wallet row links anywhere (no `/agents`, `/launches`, profile). Economy view is an island. Link the agent pills.
- [P3] `pages/demo-economy.html:162-165` — at ≤680px the entire sidebar (wallets, transaction, activity log) is `display:none`, so mobile users see only the 3D scene + Run button and none of the payment proof the demo exists to show. Move the tx/activity into a collapsible sheet instead of hiding.
- Coin rule: the fallback array uses generic three.ws endpoint names only (no foreign mint/ticker) — not a coin-rule P0, but still fabricated data.

## /live — /workspaces/three.ws/pages/live.html (+ api/demo/economy.js)
Verdict: Real on-chain trade path (`/api/demo/economy?trade=1` signs + sends real SOL, gated behind auth, real underfunded handling) and real LLM-driven agent speech — but anonymous visitors silently get an unlabeled "demo mode" that still shows "settled on-chain" copy.

- [P1] `pages/live.html:470-474,525` + `api/demo/economy.js:161-164` — for anonymous visitors the stream emits `demo_mode` ("Running in demo mode — set AGENT_B_WALLET_SECRET…"), logged as a terse `DEMO` line, then the UI proceeds through PAY/PAID beams and "Trade complete … settled on-chain" copy even though no payment occurred. The visible outcome implies a settled on-chain trade with only a dev-oriented env hint. On `demo_mode`, suppress the "settled on-chain" language and show "no real payment — sign in to run a live trade."
- [P2] `pages/live.html:418-426` — `refreshStatus()` only renders wallet chips when `agentA/B.configured`; with neither configured (prod default) `#wallets` stays silently empty with no message. Render a "wallets not configured" chip.
- [P2] `pages/live.html:512-521` + `api/demo/economy.js:178` — on a real underfunded-wallet error the only feedback is one gray `ERROR` log line; the button resets with no recovery (no fundable address). For a payment surface this insufficient-funds state should be designed — surface the address + retry.
- [P3] `pages/live.html:259-265` — page shows two agents trading but links nowhere (`/agents`, `/launches`, trader/oracle profiles). Link the agent tags to profiles.
- [P3] `pages/live.html:267-273,429-439` — speech bubbles depend on `llmSay()` → `/api/chat`; on failure it returns `''` and the agent stays silent, making the "live" world look dead during a chat outage. Fall back to a static persona line.

---

## Group summary

No P0 issues. **Coin rule is clean across all 13 pages** — no hardcoded non-$THREE mint or ticker anywhere; the only hardcoded mints are USDC (allowed plumbing) and the correct $THREE CA. The three vanity grinders are all genuinely real cryptographic grinding in Web Workers (WASM ed25519 for Solana, Profanity-hardened `@noble` secp256k1 with self-verification for EVM EOA, real keccak CREATE2 salt search) — keys client-side, no faked results.

Top P1s (reachable but incomplete / integrity):

1. `/play/agent-wallet` `src/play-agent-wallet.js:35-43` — pay flow is DEAD in production; `BRIDGE_URL` is empty for non-localhost, so the headline "your avatar pays" promise is unreachable for every real visitor. Needs a hosted bridge/facilitator.
2. `/demo` `api/demo-economy.js:81-107` — hardcoded fake-marketplace array rendered as a live bazaar with no fallback indication (direct "no sample arrays in prod" violation).
3. `/live` `pages/live.html:525` + `api/demo/economy.js:161` — anonymous "demo mode" still shows "settled on-chain" success copy though no payment occurs; misrepresents the outcome.
4. `/avatar-wallet-chat:583` — governance "Trust Layer" chip links to unrouted `/ibm/trust-layer` (dead link, shown exactly when a send is blocked).
5. `/lookup` — ships a hardcoded light theme with no nav/footer (off-brand white page) and dead-ends to external explorers with no on-platform agent-profile link.
6. `/eth-vanity` — stale/inaccurate "ThreeWSFactory…on BSC" share metadata, and missing `footer.css` (footer renders unstyled).

Notable P2 cluster: undefined `--danger`/`--success` CSS tokens shared by the vanity assign blocks; eth-vanity invisible white-on-white prefix highlight; per-send leaking `setInterval` pollers (`avatar-wallet-chat`, plus decorative scan-line intervals on the grinders); several "island" pages (arena, demo, live, agent-wallet) with no cross-link to `/agents` / `/launches` / agent profiles.
