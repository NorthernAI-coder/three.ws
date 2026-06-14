# Task: Deploy Solana `agent_invocation` Program + Replace Placeholder ID

## Context

`agent-protocol-sdk/` is a typed client for an Anchor program (`contracts/agent-invocation/`)
that records verifiable agent-to-agent skill invocations on Solana. It is **not
production-ready**: the program ID is the Anchor placeholder
`Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS`, the program is not deployed to any
live cluster, and the SDK README warns callers to "deploy the program yourself and
pass your own programId." This is the one Solana-side on-chain primitive that is
spec'd but not live.

## Goal

`agent_invocation` deployed to devnet and mainnet, the real program ID baked into
the program (`declare_id!`), the SDK default, and the IDL, with at least one
confirmed on-chain `invoke_skill` call.

## Files to Read First

- `contracts/agent-invocation/src/lib.rs` — Anchor program; `declare_id!`,
  `invoke_skill(skill_name, parameters)`, PDA seeds `[b"agent", authority]`,
  `SkillInvoked` event, `MAX_SKILL_NAME_LEN=64`, `MAX_PARAMETERS_LEN=512`
- `contracts/idl/` — committed IDL (must be regenerated after deploy)
- `agent-protocol-sdk/src/index.ts` — `AGENT_INVOCATION_PROGRAM_ID`, `invokeSkill()`
- `agent-protocol-sdk/README.md` — current "not deployed" warnings to update
- `api/_lib/pump.js` — RPC selection (`SOLANA_RPC_URL`, `SOLANA_RPC_URL_DEVNET`)

## What to Build / Do

1. **Generate a program keypair** (`solana-keygen new -o agent-invocation-keypair.json`,
   kept OUT of the repo — store in Vercel/secret manager, document the env var name).
   Optionally grind a vanity prefix to match house style, but don't block on it.

2. **Set `declare_id!`** to the new pubkey in `lib.rs` and in `Anchor.toml`.

3. **Build + deploy to devnet** first (`anchor build && anchor deploy --provider.cluster devnet`).
   Fund the deploy authority with devnet SOL.

4. **Smoke test on devnet** — run `invokeSkill()` from the SDK against the deployed
   program with two synthetic agent authorities; confirm the `SkillInvoked` event
   parses and the tx confirms. Add this as a script under `scripts/`.

5. **Deploy to mainnet** once devnet passes. Fund the mainnet deploy authority.
   Record the deploy signature.

6. **Wire the real ID everywhere:**
   - `agent-protocol-sdk/src/index.ts` → `AGENT_INVOCATION_PROGRAM_ID`
   - regenerate + commit `contracts/idl/agent_invocation.json`
   - remove "not deployed / placeholder" warnings from the SDK README; replace with
     the live program ID + cluster note
   - add a `contracts/agent-invocation/DEPLOYMENT.md` with both cluster addresses + sigs

7. **Set the program upgrade authority** deliberately — either a known platform key
   (document it) or make it immutable. Do not leave it as an ephemeral local key.

## Constraints

- Never commit the program keypair or deploy-authority secret.
- Use synthetic agent authorities in tests — never a real third-party wallet.
- The SDK must default to the live mainnet ID but still accept a `programId` override
  (keep that param).
- Devnet must pass before mainnet deploy.

## Success Criteria

- `solana program show <programId>` returns the program on both devnet and mainnet.
- `agent-protocol-sdk` default ID is the live program; IDL regenerated and committed.
- A confirmed `invoke_skill` tx exists on devnet (script under `scripts/`, re-runnable).
- README no longer says "not deployed"; `DEPLOYMENT.md` records both clusters.
- Upgrade authority is intentional and documented.
- Changelog entry (tag: sdk/infra).
