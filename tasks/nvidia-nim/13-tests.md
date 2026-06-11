# Task T1.4: Test suite for the NVIDIA provider + backend registration

You are a senior engineer working in the **three.ws** repo (`/workspaces/three.ws`).
Read `CLAUDE.md` first and obey it, then read `tasks/nvidia-nim/PLAN.md` for context.

**Dependencies:** T1.1, T1.2, T1.3.

## Goal

`tests/api/providers-nvidia.test.js`, mirroring the structure and rigor of
`tests/api/providers-replicate.test.js` (mocked fetch, no live calls in tests).

## Coverage required

1. Submit — text→3D and image→3D request construction against the probed schema.
2. The 202-then-poll loop: pending → succeeded; pending → failed; poll timeout.
3. Asset-upload branch selection by image size (inline base64 under the limit, NVCF
   asset handshake over it).
4. Base64-GLB decode + R2 persist call (persist helper mocked; assert it receives the
   decoded bytes and the provider returns the public URL).
5. Every normalized error mapping: 401/403 → `invalid_key`, 402 → `insufficient_credits`,
   429 → `rate_limited`, 5xx → `provider_error`, network throw → `provider_unreachable`.
6. Forge-tiers registration: the `nvidia` backend resolves for both paths, draft-tier
   default selection picks it when `NVIDIA_API_KEY` is set, and is skipped cleanly when
   the env var is absent.

No third-party token/coin addresses in fixtures — if a mint-like string is ever needed,
use `$THREE` or a clearly-synthetic placeholder (CLAUDE.md).

## Done when

- New suite green.
- Full `npm test` shows **no NEW failures** (6 pre-existing MCP-auth 401-vs-402 failures
  on clean main are known; fresh clones also need `data/_generated` + the
  solana-agent-sdk built first).

## Before you finish (mandatory bookkeeping)

Tick T1.4 in `tasks/nvidia-nim/PLAN.md`, append a dated Worklog entry, and commit with
explicit path staging (re-check `git status` / `git diff --staged` first — concurrent
agents share this worktree).
