# Site-UI Game-Feel Rollout — Surface Audit

**Date:** 2026-06-30
**Scope:** every paired `src/<name>.js` + `src/<name>.css` front-end surface.
**Method:** the real surface list was regenerated from disk, each surface's `.js` and
`.css` were read (not guessed), routes were cross-referenced to
[data/pages.json](../../data/pages.json) and the vite route table in
[vite.config.js](../../vite.config.js), and every claim below cites the file it came
from. This document changes **no** surface code.

Surface list (regenerated):

```
for f in src/*.css; do b=$(basename "$f" .css); [ -f "src/$b.js" ] && echo "$b"; done | sort
```

→ **31 paired surfaces.** All 31 are covered below (swarms is the reference baseline; the
other 30 are audited). None skipped.

---

## Headline finding — the foundation already exists and nobody uses it

The rollout's "foundation library" is **already written, styled, and unit-tested** —
and imported by **zero** surfaces.

- [src/ui-juice.js](../../src/ui-juice.js) (412 lines) exports the exact generalized
  game-feel vocabulary the rollout needs: `countUp`, `updateValue` (count-up + flash on
  change), `flashValue` (directional tint), `enterRow` / `enterStagger`, `sparkline` /
  `sparklinePath`, `ring` / `playRings`, `flipReorder` / `reorderedKeys` (FLIP), `liveDot`
  / `setLiveDot`, `rippleOnce`, plus `durationMs`/`reducedMotion` token+a11y helpers. Its
  own doc-comments say it generalizes "the swarms `updateTile` pattern" and "the swarms
  `flash()`" ([ui-juice.js:106](../../src/ui-juice.js#L106),
  [ui-juice.js:125](../../src/ui-juice.js#L125)).
- [src/ui-juice.css](../../src/ui-juice.css) ships the matching `.juice-*` classes and
  keyframes; [tests/ui-juice.test.js](../../tests/ui-juice.test.js) covers
  `reorderedKeys`, `sparklinePath`, `ringGeometry`.
- **Production importers: 0.** `grep -rln ui-juice src/ pages/ public/` matches only the
  module itself and its test.

Meanwhile the game-feel that *does* ship is **copy-pasted per surface**: `swarms.js` rolls
its own `countTile`/`flashTile`/FLIP ([swarms.js:622-754](../../src/swarms.js#L622-L754),
6 `countTile`/`flashTile` refs), `launch-detail.js` rolls its own SSE+rAF price ticker
([launch-detail.js:1627](../../src/launch-detail.js#L1627),
[1973](../../src/launch-detail.js#L1973)), `vaults.js` rolls its own `countUp`
([vaults.js:63-74](../../src/vaults.js#L63-L74)), and `agents-live-arena.js` rolls its own
`flashTile`. Four independent implementations of the same thing; one tested library that
unifies them; none of the four migrated.

**This reframes the rollout.** The first move is not "build a foundation" — it is
**adopt `ui-juice` and delete the four bespoke copies**. Every per-surface "add count-up /
flash / FLIP / sparkline" task below collapses to a few imports plus one CSS link once
that's done. Effort estimates below assume `ui-juice` is the tool, not from-scratch code.

---

## Master table

Importance signal: **nav** = present in [public/nav-data.js](../../public/nav-data.js);
**prio** = `priority` in `data/pages.json` (route prominence, sitemap weight). Honest
limits: there is no analytics/traffic feed in-repo, so "traffic" is inferred from nav +
priority + whether the surface is a destination page vs. an embedded component. Marked
where inferred.

| Surface | Route | Cluster | Live data? | Standings? | Missing states | Top game-feel opportunity | Priority |
|---|---|---|---|---|---|---|---|
| **swarms** *(reference)* | /swarms · nav | markets | ✅ SSE [swarms.js:577](../../src/swarms.js#L577) | ✅ FLIP roster [728-754](../../src/swarms.js#L728-L754) | — (full) | *Is the baseline; extract its toolkit into ui-juice and delete the inline copy* | REF |
| **leaderboard** | /leaderboard · nav · 0.8 | markets | ⏱ 20s poll [leaderboard.js:406](../../src/leaderboard.js#L406) | ✅ ranked, **snaps** [286-303](../../src/leaderboard.js#L286-L303) | — (full) | FLIP rank reorder + count-up PnL/win-rate; flash on sign change | **P0** |
| **watchlist** | /watchlist · nav · 0.7 | markets | ⏱ 5s poll [watchlist.js:620](../../src/watchlist.js#L620) | ✅ ranked conviction [591-599](../../src/watchlist.js#L591-L599) | error; overflow | Count-up conviction + FLIP on "movers" re-sort; flash deltas [549](../../src/watchlist.js#L549) | **P0** |
| **launches** | /launches · nav · 0.8 | launch | ⏱ 60s poll [launches.js:970](../../src/launches.js#L970) | chronological | — (full) | Count-up the "deployed today"/mcap stat tiles on each poll [858](../../src/launches.js#L858) | **P0** |
| **theater** | /theater · nav · 0.8 | agents | ✅ SSE [theater.js:250](../../src/theater.js#L250) | ✅ trust-ranked roster [71-79](../../src/theater.js#L71-L79) | — (full) | Live-event counter badge (count-up) + receipt flash on arrival [286-294](../../src/theater.js#L286-L294) | **P0** |
| **radar** | /radar · nav · 0.8 | markets | ⏱ 12s poll [radar.js:19](../../src/radar.js#L19) | grid sort, no FLIP/stagger [752](../../src/radar.js#L752) | — (full) | Count-up quality scores + stagger card enters; focus rings on cards | **P0** |
| **vaults** | /vaults · nav · 0.8 | markets | ⏱ 12s poll [vaults.js:362](../../src/vaults.js#L362) | ✅ ROI-ranked [261](../../src/vaults.js#L261) | — (full) | Has count-up already [63-74](../../src/vaults.js#L63-L74); add FLIP on rank shift + NAV flash | **P1** |
| **clash** | /clash · nav · 0.7 | markets | ⏱ 5s poll [clash.js:620](../../src/clash.js#L620) | ✅ ranked standings [209-225](../../src/clash.js#L209-L225) | overflow/queue | Already tap-juicy [393-426](../../src/clash.js#L393-L426); add army-power count-up + FLIP standings | **P1** |
| **signals** | /signals · nav · 0.8 | markets | ⏱ 30s poll [signals.js:15](../../src/signals.js#L15) | ✅ edge-ranked [104](../../src/signals.js#L104) | verified-but-empty substate | Alias the **own `--sm-*` token island** [signals.css:5-12](../../src/signals.css#L5-L12) to canonical; FLIP on sort | **P1** |
| **pulse** | /pulse · nav · 0.8 | markets | ⏱ 60s poll + live cmpt [pulse.js:252](../../src/pulse.js#L252) | ✅ top-earners rows [110-129](../../src/pulse.js#L110-L129) | — (full) | Factor the **forced dark `:root` override** [pulse.css:12-30](../../src/pulse.css#L12-L30) into a token namespace; count-up earners | **P1** |
| **labor-market** | /labor-market · nav · 0.8 | markets | ⏱ 8s poll [labor-market.js:605](../../src/labor-market.js#L605) | chronological [189](../../src/labor-market.js#L189) | overflow (bid lists) | Count-up volume ticker + flash new settlements as they arrive [105-120](../../src/labor-market.js#L105-L120) | **P1** |
| **deployments** | /deployments · nav · 0.8 | launch | ⏱ 45s poll [deployments.js:315](../../src/deployments.js#L315) | ranked top-chains [134-145](../../src/deployments.js#L134-L145) | — (full) | Stagger-grow sparkline bars on first render; replace hardcoded `.14s`/`2.4s` with tokens | **P1** |
| **genesis** | /genesis · nav · 0.9 | launch | ⏱ avatar-status poll [genesis.js:32-36](../../src/genesis.js#L32-L36) | sequential | — (full) | Animate step progress fill + color on each milestone; finish `prefers-reduced-motion` guards | **P1** |
| **user-launcher** | /launcher · 0.8 | launch | ⏱ 6s poll [user-launcher.js:258](../../src/user-launcher.js#L258) | scored narratives [400](../../src/user-launcher.js#L400) | **error** (console has none) | FLIP narrative reorder + animate bar widths on live score change | **P1** |
| **launch-copilot** | *(component — launch flow)* | launch | ✅ SSE [launch-copilot.js:117](../../src/launch-copilot.js#L117) | chronological log | — (full) | Color-wash flash on action-row arrival (money moved) [146](../../src/launch-copilot.css#L146) | **P1** |
| **alpha-copilot** | /alpha-copilot · nav · 0.8 | ai | ⏱ request-driven [alpha-copilot.js:234](../../src/alpha-copilot.js#L234) | pickTop, unordered [266](../../src/alpha-copilot.js#L266) | — (full) | Count-up the conviction % label to match the bar-width anim [212](../../src/alpha-copilot.css#L212) | **P1** |
| **agi** | /agi · nav? · 0.95 | ai | ⏱ 20s poll [agi.js:331](../../src/agi.js#L331) | none (doctrine lists) | overflow (mind stream) | Count-up conviction % alongside the ring stroke-anim [agi.css:201](../../src/agi.css#L201) | **P1** |
| **agent-detail** | /agents/&lt;id&gt; | agents | delegated to panels [45-46](../../src/agent-detail.js#L45-L46) | rep tiers (from swarms copy) [249-254](../../src/agent-detail.js#L249-L254) | visual loading on `.ad-main` | **Hardcoded-hex island** ([agent-detail.css:138,353,598](../../src/agent-detail.css#L138)); hero net-worth flash; focus rings | **P1** |
| **character** | /character/&lt;id&gt; | agents | static snapshot [character.js:44](../../src/character.js#L44) | none | **loading** (class removed, never set) [362](../../src/character.js#L362); token-empty | **a11y: no `:focus-visible` anywhere**; light-theme hex island; add load skeleton | **P1** |
| **characters** | /characters · 0.8 | agents | snapshot pagination [characters.js:106](../../src/characters.js#L106) | none | error **retry** missing [130](../../src/characters.js#L130) | Structured skeleton + retry button; light-theme **contrast risk** `#0a0a0a` on glass [characters.css:102](../../src/characters.css#L102) | **P1** |
| **trader** | /trader/&lt;id&gt; | markets | ❌ one-shot [trader.js:550](../../src/trader.js#L550) | single profile | — (full) | Animate equity-curve SVG reveal; **canvas hardcodes** `#4ade80`/`#f87171` [444-450](../../src/trader.js#L444-L450); tab focus rings | **P2** |
| **reasoning-ledger** | /signals/&lt;slug&gt; | markets | ❌ one-shot [reasoning-ledger.js:374](../../src/reasoning-ledger.js#L374) | seq timeline | — (full) | Add a background poll (vaults cadence) + flash new ledger entries; inline SVG hex | **P2** |
| **launch-detail** | /launches/&lt;mint&gt; | launch | ✅ SSE [launch-detail.js:1627](../../src/launch-detail.js#L1627) | rep-tiered members | — (full) | **Near reference-grade** — harvest its SSE ticker into ui-juice; animate Oracle pillar bars | **P2** |
| **admin-launcher** | /admin/launcher | launch | ⏱ 5s poll [admin-launcher.js:148](../../src/admin-launcher.js#L148) | scored narratives | **error** in console | Arm-switch → live-warning pulse [299-302](../../src/admin-launcher.js#L299-L302); hardcoded `#000`/`ms` [admin-launcher.css:45](../../src/admin-launcher.css#L45) | **P2** |
| **agent-picker** | *(component — dashboards)* | agents | ❌ pagination [agent-picker.js:344](../../src/agent-picker.js#L344) | none | overflow (long text) | Accent-glow flash on preview stage at selection [507-534](../../src/agent-picker.js#L507-L534) | **P2** |
| **avatar-gallery-picker** | *(component — gallery picker)* | agents | ❌ scroll pagination | none | reduced-motion on shimmer [avatar-gallery-picker.css:478](../../src/avatar-gallery-picker.css#L478) | Glow/flash on avatar selection; hardcoded `8px`/`14px`/`120ms` | **P2** |
| **first-meet** | *(component — onboarding)* | agents | ❌ one-time | none | **error** recovery if tier/tour fails [first-meet.js:380](../../src/first-meet.js#L380) | Staggered entrance via `enterStagger`; hardcoded `0.4s`/`#3d7eff` focus | **P2** |
| **three-gate** | *(component — $THREE gate)* | agents | ❌ once [three-gate.js:185](../../src/three-gate.js#L185) | none | — (full, scoped) | Highlight-flash the progress fill on tier change [three-gate.css:298](../../src/three-gate.css#L298) | **P2** |
| **share-panel** | *(component — share/embed)* | agents | ❌ static | none | **error** (no embed-fail UI) | Copy-success flash on snippet copy [304](../../src/share-panel.js#L304); hardcoded `#333`/`#111` [share-panel.css:14](../../src/share-panel.css#L14) | **P2** |
| **character-creator** | /create/character | agents | ❌ local 3D loop [character-creator.js:84](../../src/character-creator.js#L84) | none | unsaved-changes warning | TX-confirmation progress counter on pending cosmetic buy; own palette [character-creator.css:6-17](../../src/character-creator.css#L6-L17) | **P2** |
| **ca2x402** | /ca2x402 · nav · 0.7 | ai | ❌ one-shot [ca2x402.js:69](../../src/ca2x402.js#L69) | none | — (full) | Swap ~20 hardcoded `0.15s`/`0.12s` for duration tokens; retire the `--brand-blue-*` silo [ca2x402.css:21-22](../../src/ca2x402.css#L21-L22) | **P2** |

Legend: ✅ real-time stream · ⏱ interval poll · ❌ no live data.

---

## Prioritized rollout order

The ordering principle: **(1) ship the foundation first so every later task is cheap;
(2) lead with high-prominence surfaces whose *shape* (live + ranked) makes the treatment
most visible; (3) bank the low-effort/high-impact quick wins; (4) leave components,
static pages, and big islands for last.**

### Phase 0 — Foundation (do this before any surface; unblocks everything)
Adopt [src/ui-juice.js](../../src/ui-juice.js) as the single game-feel module: wire
`ui-juice.css` into the global style entry, then migrate the four bespoke implementations
(`swarms.js`, `launch-detail.js`, `vaults.js`, `agents-live-arena.js`) onto it and delete
their inline copies. This is mostly mechanical and is the highest-leverage work in the
whole effort — it turns every "add count-up/flash/FLIP" below into a 3-line import.
*Rationale: the library is already tested ([tests/ui-juice.test.js](../../tests/ui-juice.test.js)); the cost is adoption, not authorship.*

### Phase 1 — Flagship standings & live surfaces (P0, max visible payoff)
`leaderboard` → `watchlist` → `radar` → `launches` → `theater`.
*Rationale: all five are nav-present destinations; four are ranked/competitive lists and
the fifth (theater) is a live SSE spectacle. The ladder/FLIP/count-up/flash treatment is
most dramatic exactly where rows rank and numbers tick — these are the surfaces someone
screenshots. `leaderboard` is the literal "Trader Leaderboard" and today its rows **snap**
to new positions ([leaderboard.js:286-303](../../src/leaderboard.js#L286-L303)) — the
single most conspicuous missing-FLIP in the app. `theater` already has the SSE plumbing
([theater.js:250](../../src/theater.js#L250)); it just needs the counter+flash veneer.*

### Phase 2 — Quick wins (P1, low effort, surfaces already half-there)
`vaults` (already has count-up — just add FLIP+flash), `launch-detail` (reference-grade —
harvest into ui-juice, add pillar-bar anim), `alpha-copilot` (one conviction label),
`labor-market` (count-up + settlement flash), `deployments` (sparkline stagger + token
sweep), `clash` (already tap-juicy — add count-up + standings FLIP), `characters` (skeleton
+ retry + contrast fix).
*Rationale: each is S/M effort and lands a visible improvement; several also close a real
bug (characters' missing retry + contrast, clash's snapping standings).*

### Phase 3 — Token & state remediation (P1, medium, fixes correctness + consistency)
`signals` (collapse the `--sm-*` token island), `pulse` (namespace the forced dark
override), `genesis` (progress anim + finish reduced-motion guards), `user-launcher` (add
the missing console **error** state + narrative FLIP), `agi` (conviction count-up).
*Rationale: these mix a real gap (missing error state, divergent token namespaces, partial
a11y) with the game-feel add — fix both in one pass.*

### Phase 4 — Identity profiles (P1, larger, a11y-critical)
`character` (add the never-set loading state + **focus rings on every control** — currently
none), `characters` if not already done in P2, `agent-detail` (the 2,770/2,734-line
hardcoded-hex island — biggest single token-migration job).
*Rationale: `character` has a genuine a11y defect (no `:focus-visible` anywhere,
[character.css](../../src/character.css)) and a broken loading state; `agent-detail` is
high-traffic but large, so it trails the cheaper wins.*

### Phase 5 — Components & long-tail (P2)
`trader`, `reasoning-ledger`, `admin-launcher`, `agent-picker`, `avatar-gallery-picker`,
`first-meet`, `three-gate`, `share-panel`, `character-creator`, `ca2x402`.
*Rationale: embedded components (limited standalone reach), static/one-shot surfaces (low
live-data payoff), admin-only screens (low traffic), and self-contained islands. Worth the
selection-flash / copy-flash / focus-ring polish, but last.*

---

## Consistency debt (fix once in the foundation or a sweep)

These are shared problems. Each is cheap to fix **once** via `ui-juice` adoption or a
single CSS sweep, and expensive to fix surface-by-surface.

1. **One tested foundation, zero adopters, four duplicate implementations.**
   `ui-juice.js` is unused while `swarms.js`/`launch-detail.js`/`vaults.js`/
   `agents-live-arena.js` each carry their own count/flash/FLIP. *Fix: Phase 0 adoption +
   delete the copies.* This is the root cause of most items below.

2. **Hardcoded durations instead of the token ladder** (`--duration-instant` 80 /
   `--duration-fast` 140 / `--duration-base` 220 / `--duration-slow` 420 exist in
   [public/tokens.css](../../public/tokens.css)). Pervasive raw values: `ca2x402.css`
   (~20× `0.15s`/`0.12s`), `agent-picker.css` (`120/150/180ms` ad-hoc band),
   `deployments.css` (`.14s`/`2.4s`/`1.4s`), `admin-launcher.css` (`0.14s`/`0.24s`),
   `character.css`/`characters.css` (`0.12s`/`0.15s`), `leaderboard.js:213` (`22ms`
   stagger), `signals.css:106` (`width 0.5s`). *Fix: a CSS find-replace sweep to token
   vars; the motion already converges on ~140–220ms, it's just not named.*

3. **Hardcoded hex instead of semantic color tokens** (`--success`/`--danger`/`--warn`/
   `--wallet-accent` exist). Offenders: `leaderboard.css:312-314` (rank medals),
   `trader.js:444-450` (canvas PnL card), `watchlist.css:310-311` (delta up/down),
   `launches.js:28` (`ORACLE_TIER_COLOR`), `admin-launcher.css` (`#000` knobs),
   `genesis.css` (`#fff7d6`/`#7a5c00`), `vaults.js:134` (palette array). *Fix: same sweep.*

4. **Divergent / siloed token namespaces.** Six surfaces define their own `:root`:
   `signals.css` (`--sm-*`), `pulse.css` (forced dark override of canonical tokens),
   `ca2x402.css` (`--brand-blue-*`), plus the intentional-but-undocumented light-theme
   **islands** `agent-detail.css`, `character.css`, `characters.css` and the dark island
   `character-creator.css`. *Fix: alias the accidental silos (`--sm-*`, `--brand-blue-*`)
   to canonical tokens; if the consumer-profile light theme is intentional, formalize it as
   a documented `[data-theme]` brand variant rather than free-floating hex.*

5. **No FLIP on any ranked list except swarms.** `leaderboard`, `watchlist`, `clash`,
   `vaults`, `radar`, `signals`, `deployments`, `user-launcher` all re-sort by snapping
   rows to new positions. `ui-juice.flipReorder` exists for exactly this. *Fix: Phase 0
   makes this a per-list one-liner.*

6. **No count-up on live numerics except swarms/vaults.** Most polled tiles set values via
   `textContent =` and jump. `ui-juice.updateValue`/`countUp` solves it uniformly.

7. **Missing `:focus-visible` rings** on interactive controls across many surfaces —
   `character.css` (none at all — a11y defect), plus toggles/buttons in `agent-picker`,
   `trader` tabs, `launch-copilot`, `share-panel`, `theater`, `radar` cards. *Fix: a shared
   `:focus-visible` utility class shipped in `ui-juice.css`, applied in the sweep.*

8. **Missing/weak states (the five-state rule, CLAUDE.md).** Genuine gaps, not motion:
   **error** missing on `user-launcher` & `admin-launcher` consoles and `share-panel`
   embeds; **error retry button** missing on `characters` ([130](../../src/characters.js#L130));
   **loading** set-but-never-shown on `character` ([362](../../src/character.js#L362));
   **overflow** unhandled on `watchlist` summary bar, `labor-market` bid lists, `agi` mind
   stream, `agent-picker`/`avatar-gallery-picker` long text. *Fix: per-surface, but track
   as a checklist so none ship without all five.*

9. **`prefers-reduced-motion` not honored everywhere.** swarms/agi/ca2x402/launch-detail
   guard it; `deployments`, `genesis` (partial), `avatar-gallery-picker` shimmer, and the
   bespoke animations don't. *Fix: `ui-juice` centralizes the `reducedMotion()` check
   ([ui-juice.js:53](../../src/ui-juice.js#L53)) — adoption fixes it for free.*

---

## Coverage check

31 paired surfaces, all accounted for: swarms (REF) · leaderboard, watchlist, launches,
theater, radar (P0) · vaults, clash, signals, pulse, labor-market, deployments, genesis,
user-launcher, launch-copilot, alpha-copilot, agi, agent-detail, character, characters
(P1) · trader, reasoning-ledger, launch-detail, admin-launcher, agent-picker,
avatar-gallery-picker, first-meet, three-gate, share-panel, character-creator, ca2x402
(P2). = **1 + 5 + 14 + 11 = 31.**
