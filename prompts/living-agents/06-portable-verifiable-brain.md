# Task 06 — Portable & Verifiable Brain (own your agent's mind)

> Read `prompts/living-agents/00-README.md` and `CLAUDE.md` first. Depends on Task 01;
> integrates with Task 03 (Mind Palace) if present. Builds on the REAL primitives that
> already exist: `agent_memory_pins`, IPFS pinning, ECIES encrypt-to-owner (the
> `encrypted-ipfs` memory mode), ERC-8004 on-chain identity in `contracts/`,
> `agent_actions` signed action log.

## Mission

Make the agent's mind something the user **truly owns** — verifiable, portable, and
exportable — instead of rows in our database they implicitly rent. Your agent's memories
and personality are yours: cryptographically signed, optionally encrypted to your wallet,
pinned to IPFS, anchored on-chain, and exportable/importable as a portable "brain file."

## The innovation bar

No consumer agent platform lets you _own and carry your agent's mind_. The game-changers:
- **Provable growth:** an agent's brain has a verifiable history — memories are signed
  (extend the existing `agent_actions` signing) and key milestones anchored on-chain via
  ERC-8004, so a buyer/forker can trust what an agent "knows" and how it evolved.
- **Encrypted personal memory:** private memories encrypted to the owner's wallet pubkey
  (ECIES, already used for `encrypted-ipfs`) and pinned to IPFS — we can't read them; the
  user can move them.
- **Portable brain export/import:** export a `.brain` bundle (persona + curated memories +
  manifest, schema-versioned) the user can back up, move between agents, or — for public
  parts — share. Import reconstitutes a mind into a new or forked agent.
- This makes the marketplace's existing fork mechanic meaningful: you fork a mind with
  provenance, not just a prompt.

## What to build

1. **Signed memory + verification.** Sign memory writes (reuse the `agent_actions`
   signer infrastructure: `signature`, `signer_address`) so any memory's integrity and
   authorship are verifiable. Add a real verification endpoint/utility that checks a
   memory or a whole brain bundle against its signatures.
2. **Encryption & pinning UX.** Expose the existing `local | ipfs | encrypted-ipfs | none`
   memory storage modes as a real, understandable control on the agent (per-agent default
   + per-memory override). Wire encrypted-IPFS through the real ECIES + pinning path; record
   CIDs in `agent_memory_pins`. Show pin status and CIDs honestly in the UI.
3. **On-chain anchoring.** Anchor brain milestones (e.g. a content-addressed hash of the
   curated memory set + persona version) to the real ERC-8004 identity in `contracts/` via
   the existing on-chain path. Surface "verified on-chain" with a real explorer link — never
   a fake checkmark.
4. **Export / import brain bundle.** `GET /api/agent/{id}/brain/export` produces a
   schema-versioned bundle (persona + selected memories + manifest + signatures; private
   memories stay encrypted). `POST …/brain/import` reconstitutes into a new/forked agent
   with provenance preserved and a real ownership/permission check. Define the bundle schema
   (consider `packages/avatar-schema` conventions) and validate on import.
5. **UI.** A "Brain ownership" surface (in `/agent/{id}/edit`, linked from the Mind Palace):
   storage mode, pin/encryption status + CIDs, on-chain anchor status + explorer link,
   export/import with clear consequences. Every action wired to a real endpoint.

## Wiring & real-API mandate

- Real IPFS pinning, real ECIES encryption, real on-chain anchoring through the existing
  contracts and worker paths. Real signature verification.
- `$THREE` is the only coin; any on-chain/token references obey `CLAUDE.md`. Use only the
  `$THREE` CA or synthetic placeholders in tests/fixtures — never a real foreign mint/address.
- No fake CIDs, no decorative "verified" badges, no mock signatures.

## Definition of done

- [ ] Memory writes are signed and a real verification check passes/fails correctly.
- [ ] Storage-mode control works end to end; encrypted-IPFS memories pin with real CIDs in
      `agent_memory_pins` and are unreadable without the owner key.
- [ ] A real on-chain anchor is written and surfaced with a working explorer link.
- [ ] Export produces a valid signed bundle; import reconstitutes a mind into a forked
      agent with provenance + permission checks; round-trip verified.
- [ ] Loading/empty/error states designed; destructive actions (export of private data,
      import overwrite) clearly confirmed.
- [ ] No console errors/warnings; `npm test` passes; `git diff` reviewed.
- [ ] Changelog entry (`feature`/`security`) + `npm run build:pages`.

## Self-improvement pass

Ask: is ownership real and legible to a non-crypto user? Add the elevating layer — a
human-readable "brain passport" showing provenance and verification at a glance, a
diff/merge when importing into an agent that already has memories, or a public,
privacy-safe "proof of growth" others can verify. Build the best one, fully wired.

## When done

Delete this file. Report the bundle schema, the encryption/pinning path, and the on-chain
anchor mechanism you used.
