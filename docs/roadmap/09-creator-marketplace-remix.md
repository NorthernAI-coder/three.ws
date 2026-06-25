# Prompt 09 — Creator marketplace, gallery & remix economy (new)

> Paste into a fresh Claude Code chat. Follow CLAUDE.md + `docs/roadmap/00-README.md`. Run `npm run gate` before and after.

## Context
`packages/loom-mcp/` is a Loom 3D-creation gallery (browse/fetch/submit). The launches feed + agent profiles already render platform-created records at runtime. `marketplace/` and `packages/marketplace-mcp/` exist for the agent marketplace. The gap: a polished **creator-facing** place to publish, discover, and remix 3D creations.

## Objective
A discovery + remix surface where people browse 3D creations, view creators, and remix any published asset — closing the create → share → remix → earn loop (royalties from prompt 08).

## Tasks (new web surface; reuse Loom gallery + launches records)
1. **Gallery + discovery.** A web gallery of published 3D creations (reuse `loom-mcp` data + the launches-records pattern) with search, filters (style, type, creator), sorting (new, trending, most-remixed), and a live 3D preview per item via `<agent-3d>`. Designed empty/loading/error states; paginate.
2. **Creator profiles.** Per-creator pages: their creations, lineage/remix tree, on-chain identity (ERC-8004) and reputation, and a follow action. Link from existing agent profiles where the creator is an agent.
3. **Remix flow.** "Remix this" on any published asset opens it in the material/restyle tools (prompt 06) or refinement, records parent→child lineage, and (opt-in) routes royalties on mint (prompt 08). One-click from gallery to creating.
4. **Trending + leaderboards.** Surface most-remixed assets and top creators (reuse `activity-mcp` trending patterns). Make discovery feel alive.
5. **Submit flow.** Polished publish path from any creation (Forge result, edited model, scene) into the gallery with title, tags, license terms, and provenance attached.

## Non-negotiables
- New routes/pages; reuse `loom-mcp`, launches records, marketplace data — don't fork them. Existing tool contracts unchanged.
- Only $THREE referenced for any value/coin display; USDC settlement only. Render only platform-created records (allowed product feature), never hardcode external mints.

## Verification
- Browse, filter, sort, and live-preview a populated gallery; open a creator profile with a real remix tree; remix an asset end-to-end and see lineage recorded. Screenshots to `docs/roadmap/_generated/09/`.
- 0-item, 1-item, and large-list states all designed. `npm run gate` green. Changelog + `npm run build:pages`.

## Definition of done
- A live creator gallery + profiles + remix flow + trending, wired to existing data and the royalty/provenance system, with every state designed.

## Hand-off
Report the new routes, how lineage/remix and royalties connect (prompts 06/08), and discovery surfaces. Commit/push only if asked; both remotes.
