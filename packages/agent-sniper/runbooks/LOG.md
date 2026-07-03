# Process Log — 33 AI Agents on three.ws

Append-only. Newest at the bottom. One entry per meaningful step; note what was done,
what was recorded, and what's next. Pairs with [PLAN.md](PLAN.md).

---

## 2026-07-03

**Phase 0 — Docs & setup / tooling.**

- Mapped the three.ws surfaces (sniper, wallets, agent-screen, arena/theater/terminal)
  and the standalone `@three-ws/agent-sniper` engine (adapters, hooks, presets).
- Built the fleet tooling in `packages/agent-sniper/scripts/`:
  - `fleet.js` — `gen | plan | balance | fund | run | sweep`; `--serve` mounts the
    package console over the live fleet; `--telegram` + `--allow-mayhem` flags.
  - `reel.js` — Playwright recorder (video + per-scene PNG + caption bar); `CAST=1`
    broadcasts frames to a three.ws agent-screen.
  - `telegram.js` — live per-trade buy/sell feed + 15-min summary.
  - `mayhem-filter.js` — excludes pump.fun Mayhem tokens via `isMayhemMode`.
  - Runbooks `00–03` (overview + on-chain-truth / platform-native / caster cuts) + scenes.
- **Verified:**
  - Sniper pipeline in simulate — 33 strategies armed, scored live pump.fun mints, guards
    fired (`insufficient_sol`, `global_throttle`). Recorded a `.webm` + stills of live
    three.ws `/trades`, `/theater`, `/play/arena`, `/terminal`, `/pulse`.
  - **Mayhem filter on LIVE mints** via `@nirholas/pump-sdk` + Helius: correctly read
    `isMayhemMode` (one live token flagged `true` → excluded; normals passed). Rule proven.
  - Telegram message formatting (buy/sell/PnL/tx links) dry-run.
- **Secrets** (owner-provided, shared in chat → to rotate): stored in `~/.three-ws-fleet/env`
  (chmod 600). Identified: funder key = `niChP…Keevy` (base58); 64-byte symmetric secret =
  likely `WALLET_ENCRYPTION_KEY`/`JWT_SECRET` (not a keypair); `DATABASE_URL` (Neon);
  Helius RPC. No launcher-master keypair → fund from funder directly.
- 33 throwaway wallets generated (funder `GiE8Rv…`) — **pre-vanity**; will be replaced by
  vanity keypairs in Phase 2.

**UI recon (owner directive: do EVERYTHING via the real three.ws UI, recorded).**
- Traced the full human click-path in source — all core steps are UI-doable:
  `/register` → `/create-agent` (avatar from gallery) → `/agent/{id}/edit` Wallet panel →
  **arm at `/dashboard/sniper`** (full fields + stop-loss + Arm button; NOT `/oracle/arm`,
  NOT the broken agent-edit "Alpha Hunt") → watch at `/agent-screen`/`/terminal` →
  optional manual buy at `/terminal`.
- **Honest gaps flagged to owner:** (1) **vanity wallets not UI-doable** — UI makes random
  wallets, no key import; (2) **funding fan-out is external** (on-chain transfer from the
  funder, not a three.ws click); (3) **Avaturn not in normal UI** (gallery/upload only).

**Phase 1 — real-UI execution begins.**
- Owner provided the three.ws account login (`three-ws`) → stored in `~/.three-ws-fleet/env`.
- Owner rule reaffirmed (4×): do EVERYTHING via the real three.ws UI; flag any deviation.
- Vanity default set to **random UI wallets** (pure-UI) unless owner opts into the one
  non-UI import step.
- **Signed in via the real `/login` UI** (Playwright, recorded): filled form → landed on
  `https://three.ws/dashboard` as `three-ws`. Video + screenshots captured.
  Driver: `scripts/ui-login.mjs`.
- Hardened login (wait for the field before filling; `waitForURL` for success) after a
  timing-race failure (blank page). **Session persisted** to `~/.three-ws-fleet/state.json`
  (chmod 600) — reused by all later steps so we log in once. Driver: `scripts/ui-session.mjs`.
- **Captured the real `/create-agent` wizard** signed in: 5-step flow. Selectors:
  `#magic-input`+`#magic-go` (describe→Generate), `#f-name`, `#f-description`,
  `#f-tags-input`, `#btn-next`; avatar step + review follow. $THREE CA present in footer.
- ✅ **Agent #1 "Scout 01" CREATED via the real 5-step UI wizard, recorded.** Rigged
  **Saga** avatar (starter gallery), Pump.fun market-intel skill enabled, published.
  Platform confirmed "Scout 01 is ready — its own wallet and on-chain identity."
  Driver: `scripts/ui-create-agent.mjs` (5-step walk: basics → body → skills → persona →
  review → Create). Note for batch: success screen stays on `/create-agent`; capture the
  agent id via the "Open agent" button, not a URL change.
- Next: read Scout 01's agent id + Solana wallet → arm its sniper at `/dashboard/sniper`
  in **simulate** → watch at `/agent-screen`. Then batch the other 32, fund, go live.

**Open / next (blocking, owner decisions):**
- Vanity vs random UI wallets? (vanity ⇒ a non-UI import step).
- Account: register a fresh three.ws account in-UI, or use the owner's login?
- Then execution shifts to a **recorded single-agent UI dry-run** (register → create →
  arm → watch) to prove the human-UI + continuous-recording flow before scaling to 33.
- Retire the CLI-first framing of runbooks 01–03; keep as fallback only (owner-flagged).
