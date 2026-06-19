# Moonshot 03 — Agent Genome (breeding & provable trait inheritance)

> Read [00-README-orchestration.md](./00-README-orchestration.md) and the repo-root
> `CLAUDE.md` first. Ships a complete, on-chain-verifiable feature — not a toy.

## The invention

Two agents can **breed**. The offspring provably inherits a mix of its parents'
**brain** (personality/reasoning graph), **voice**, **3D body traits**, and **skill
licenses** — with the lineage recorded **on-chain** so descent is verifiable and
non-forgeable. The result is a genuinely new agent that is recognizably the child of its
parents: it talks a bit like one, looks a bit like the other, inherited grandma's rare
skill, and carries a tamper-evident family tree.

three.ws already has **fork-to-own** (clone an agent into a new wallet without copying
secrets). Genome is the leap from *cloning* to *genetics*: combine two distinct lineages
into novel offspring with inherited-but-mutated traits and a provable pedigree.

Why it's gamechanging: it creates an open-ended **collectible meta-game** with real
scarcity (rare skills, rare traits, deep pedigrees become valuable) on top of assets that
are already real and ownable. It also produces genuinely novel agents at scale, each with
a coherent identity. Nobody has agent genetics that span brain + body + voice + on-chain
skills + verifiable lineage — because nobody else has all those primitives wired.

## Real systems to build on (already wired)

- **Fork-to-own (the foundation)** — `api/agents/` fork endpoints, the ownership
  invariant (new distinct Solana + EVM wallet, no secret copied, lineage on both sides).
  Genome extends this to **two** parents. Reuse the wallet-provisioning + lineage code.
- **Brain / personality** — `api/brain/`, `api/_lib/` brain-graph code, `src/agent-edit.js`.
  Inherit + recombine the reasoning graph / system persona.
- **Memory** — `api/memory/` (working/recall/archival, embeddings). Decide what an
  offspring inherits (traits/disposition) vs. starts fresh (episodic memory) — and justify it.
- **Voice** — `src/agent-edit.js` + ElevenLabs (`ELEVENLABS_API_KEY`) + `api/tts/`.
  Blend parent voices into a child voice (real synthesis, not a label).
- **3D body / traits** — `character-studio/`, `src/avatar-studio.js`, avatar schema
  (`packages/avatar-schema/`), the wardrobe/cosmetics system (`src/avatar-wardrobe.js`).
  Recombine visual traits into a coherent new body (real GLB, not a swatch).
- **On-chain skill licenses** — `contracts/skill-license/`, `api/_lib/skill-license-onchain.js`.
  Inheritance of a skill = a real license grant/derivation, royalty-respecting.
- **On-chain identity / lineage** — `contracts/` (ERC-8004 identity), `contracts/agent-invocation/`.
  Record the breeding event + parentage verifiably.
- **LLM router** — `api/chat.js` for the trait-recombination reasoning (use the latest Claude).
- **Surfaces** — `src/agent-detail.js`, `src/agent-home.js`, `src/galaxy.js` (visualize the
  family tree in the 3D star-map), `src/marketplace.js`.

## Scope — the full genetic pipeline

1. **Genome representation** — define an explicit, versioned **genome schema** (a real
   package under `packages/` or `api/_lib/genome.js`): the heritable loci (brain traits,
   voice parameters, body/visual traits, skill alleles) with deterministic inheritance +
   bounded mutation rules. A genome must be reproducible from a seed so a breeding event
   is auditable and re-derivable. No randomness without a recorded seed.

2. **Breeding eligibility + consent** — both parents must be breedable and the caller must
   own (or have permission for) both, or a cross-owner breeding requires the other owner's
   on-chain/`x402` consent + optional $THREE stud fee. Enforce server-side. Cooldowns to
   prevent spam-minting; rarity-aware so deep pedigrees stay scarce.

3. **The breeding transaction (`api/genome/breed.js`)** — `POST /breed` provisions the
   child's fresh wallet (reuse fork's invariant: distinct keys, no secret copied), derives
   the child genome from both seeds, **synthesizes the real artifacts** (child voice via TTS,
   child GLB via the avatar pipeline, child brain graph), grants inherited skill licenses
   on-chain, and writes parentage to the lineage record. **Idempotent** per breeding id;
   ownership invariant proven (child wallet ≠ either parent, both parents byte-for-byte
   untouched).

4. **Provenance + verification** — `GET /lineage/:agentId` returns the verifiable family
   tree; expose a verify path that re-derives the child genome from the recorded seeds +
   parents and confirms it matches (so a forged "child" is detectable). Lineage shows on
   all three nodes (both parents + child), mirroring fork.

5. **The breeding surface (`src/genome.js` + `pages/genome.html`)** — pick two parents,
   preview the predicted offspring (trait blend, voice sample, body render) *before*
   committing, then breed. A **family-tree visualization** (wire into `src/galaxy.js`'s 3D
   star-map — descent lines between agents). A "Lineage" tab on every agent profile.

6. **Cross-wire** — rare-pedigree badge on the marketplace + leaderboard; the genome
   feeds Moonshot 01 (inherited skills make a worker more hireable) and Moonshot 05
   (lineage is part of reputation). Emit a holder-facing feed event on a notable birth.

## Quality + security bar

- **The ownership invariant is sacred** (same as fork): child gets new distinct Solana +
  EVM addresses; **neither parent's wallet is touched**; no secret copied; lineage on all
  sides. Prove it live with a real breed, not just in code.
- Deterministic, seed-recorded genetics — a breed is reproducible and auditable. Real
  synthesized artifacts (voice/GLB/brain), never a stub or a renamed parent asset.
- Every state designed: selecting parents, ineligible/cooldown, consent-pending, previewing,
  breeding (real async progress from the synthesis jobs — no fake progress bar), born, failed.
  a11y, responsive, reduced-motion for the tree viz.
- $THREE only for any stud fee. Skill royalties respected on inherited licenses. CSRF + ownership server-side.

## Then make it better (mandatory)

After it works: recessive/rare traits that only express across generations; a "genetic
marketplace" for breedable agents and stud services; trait fusion that can produce an
*emergent* skill neither parent had (with a clear, auditable rule). Pick the upgrade that
makes pedigree feel valuable, build it, re-evaluate.

## Definition of done

Meets the README Definition of done. Specifically: breeding two real agents produces a
real child agent with a fresh wallet, a synthesized blended voice + body + brain, inherited
on-chain skill licenses, and a verifiable lineage — with both parents provably untouched and
the genome re-derivable from recorded seeds. `npm test` green (unit: deterministic
inheritance + mutation bounds, ownership invariant; e2e: breed + lineage-verify + cooldown).
Changelog entry; `npm run build:pages` validates.

## On completion — delete this file

```bash
git rm "prompts/moonshots/03-agent-genome-breeding.md"
```
Stage it in the same commit as the implementation.
