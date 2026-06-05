# R — 3D World "Make It Fun" program

Turn `/play` from a charming hangout into a place with things to **do** together: Roblox-style
social play + mini-games + an avatar economy, plus a Minecraft-style shared sandbox — all
wallet-native to `$THREE`.

Source roadmap: [`docs/roadmap/3d-world-fun.md`](../../roadmap/3d-world-fun.md). Each brief below
is the corresponding roadmap task, expanded into a self-contained agent prompt.

## Read order

1. **[R00 — Program overview & shared architecture](R00-program-overview.md)** — READ FIRST.
   Stack, the off-schema networking pattern, coin rules, phase map, dependency graph, DoD.
   Every other brief assumes it.

## Briefs (one agent each, end-to-end)

### Phase 1 — Foundation (sequential; unblocks everything)

| Brief | Feature | Depends on |
|-------|---------|------------|
| [R01](phase-1/R01-server-world-object-sync.md) | Server: generic world-object state sync | — |
| [R02](phase-1/R02-client-world-objects-manager.md) | Client: WorldObjects manager for /play | R01 |
| [R03](phase-1/R03-cosmetics-accessory-rig.md) | Cosmetics rig: wire accessory GLBs to avatars | — |

### Phase 2 — Social playground (parallel after Phase 1)

| Brief | Feature | Depends on |
|-------|---------|------------|
| [R04](phase-2/R04-emoji-confetti-reactions.md) | Emoji & confetti reactions | — |
| [R05](phase-2/R05-kickable-physics-ball.md) | Kickable physics ball | R01, R02 |
| [R06](phase-2/R06-dance-floor-zone.md) | Dance floor zone | — |
| [R07](phase-2/R07-minigame-king-of-the-totem.md) | Mini-game: King of the Totem | — |
| [R08](phase-2/R08-minigame-tag.md) | Mini-game: Tag | — |
| [R09](phase-2/R09-emote-wheel.md) | Emote wheel (expose all 70 animations) | — |

### Phase 3 — Sandbox building (mostly sequential)

| Brief | Feature | Depends on |
|-------|---------|------------|
| [R17](phase-3/R17-world-object-persistence.md) | Persistence layer for world objects | R01 |
| [R18](phase-3/R18-build-mode-and-placement-ui.md) | Build mode + placement UI | R01, R02 |
| [R19](phase-3/R19-build-netcode-permissions-antigrief.md) | Build netcode hardening + permissions + anti-grief | R17, R18 |
| [R20](phase-3/R20-structures-snapping-sharing.md) | Structures, snapping, and sharing | R18, R19 |

### Phase 4 — Avatar economy (depends on R03 rig + x402 rails)

| Brief | Feature | Depends on |
|-------|---------|------------|
| [R21](phase-4/R21-cosmetics-catalog-shop-ui.md) | Cosmetics catalog + shop UI | R03 |
| [R22](phase-4/R22-x402-purchase-flow.md) | x402 purchase flow | R21 |
| [R23](phase-4/R23-owned-inventory-equip-persistence.md) | Owned-cosmetics inventory + equip persistence | R03, R22 |
| [R24](phase-4/R24-token-gated-worlds.md) | Token-gated worlds | Solana rails |
| [R25](phase-4/R25-creator-revenue-splits.md) | Creator revenue splits + economy polish | R22 |

Suggested build order = phase order. Phase 1 unblocks the most. See R00 for the full graph.
