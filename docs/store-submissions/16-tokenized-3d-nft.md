# Prompt 16 — Tokenized 3D: mint a generated avatar as an on-chain Solana 3D NFT

> Paste into a fresh Claude Code chat in the three.ws repo. Follow CLAUDE.md. Use TodoWrite. Prereqs: 04/05 (studio + viewer), ideally 07 (personas) and 09 (provenance). **Claude / paid track only** — keep this entirely out of the OpenAI free app.

## The thesis
three.ws is the only platform in either directory that does text→3D→rig AND owns Solana rails. Today a generated avatar is just a file on a CDN. The web3-native move that nobody else can ship: let the user (or an agent acting for them) **own that avatar on-chain** — mint the rigged GLB as a Metaplex NFT whose media is a live, interactive 3D viewer, with verifiable provenance and enforced creator royalties. Generated assets become ownable, transferable, composable property.

## Objective
A tool `mint_3d_asset` that mints a generated/owned GLB as a Metaplex NFT on Solana, and a read-back tool `get_3d_asset_onchain` that resolves a mint to its live 3D asset + holder + provenance.

## What to build (all real — real storage, real on-chain mint, no simulated tx)
1. **Durable media + metadata.** Promote the GLB to durable storage (reuse `api/_lib/r2.js` `publicUrl`; add Arweave/permanent pinning if available). Render a thumbnail via the existing `render_avatar_image` path. Build **Metaplex-compliant** metadata JSON: the GLB under `animation_url` + `properties.files` (mimeType `model/gltf-binary`), `image` = thumbnail, `external_url` = the three.ws viewer link. No placeholder fields.
2. **Mint.** Use the existing Solana signing rails (`api/_lib/avatar-wallet.js`, `vault-transfer.js`, `explorerTxUrl`). Mint a programmable NFT with enforced royalties to the connected user's wallet (OAuth) or a supplied address. **Devnet default, explicit `network` flag for mainnet** — document which. Return mint address + `explorerTxUrl` + viewer link. Real on-chain mint.
3. **Provenance baked in.** Embed creator, prompt, parent lineage (from prompt 09 if present), generation model/provider, and timestamp into the metadata `properties` and the platform launch records (reuse the existing launch-records pattern — do not invent a parallel store).
4. **Royalties.** `seller_fee_basis_points` configurable with a hard cap; creator share routed via the standard royalty enforcement. `$THREE` is the only coin referenced anywhere in copy/UI; SOL/USDC are mint/settlement mechanics only; never hardcode or recommend any other mint.
5. **Read-back.** `get_3d_asset_onchain(mint)` reads the on-chain metadata, confirms it resolves to a live viewer, and returns holder, provenance, and royalty terms. `readOnlyHint: true`, `openWorldHint: true`.
6. **States + guardrails.** Designed loading/minting/success/error states; idempotency guard so a double-call doesn't double-mint; clean failure at the boundary (RPC down, insufficient SOL for rent).

## Why only three.ws
Generation + rig + avatar storage + Solana signing already coexist in this repo. Minting is the payoff of infrastructure competitors would have to assemble from scratch — and tying the NFT media to a *live rigged viewer* (not a static PNG) is unique.

## Verification (must actually run)
- Real **devnet** mint end-to-end: generate → mint → paste mint address + explorer link. Metadata resolves and the viewer renders the owned, animated GLB.
- `get_3d_asset_onchain(mint)` returns the correct holder + provenance + royalty terms.
- Royalty basis points respect the hard cap; a double-call does not double-mint.
- `grep` the feature for any non-`$THREE` token reference — must be clean. No private key ever appears in a response.
- `npm test` green; add tests for the metadata shape (model under `animation_url`), royalty cap, and mint idempotency. Evidence to `docs/store-submissions/_generated/tokenized/`.

## Definition of done
- A generated avatar mints to a real on-chain Solana NFT with live-viewer media, baked provenance, capped enforced royalties, and a working read-back — all real settlement, designed states, coin policy clean.

## Hand-off
Report the mint/read tool names, the storage + metadata shape, the network used, the royalty cap, and the evidence path. Strong flagship use case for the Claude submission (prompt 03). Commit/push only if asked; stage touched paths; both remotes.
