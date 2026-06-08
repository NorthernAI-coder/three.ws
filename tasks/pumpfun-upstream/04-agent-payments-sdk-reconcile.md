# Task: Reconcile our local agent-payments-sdk@3.1.0 with upstream's published 3.0.3

You are a senior engineer in the **three.ws** repo (`/workspaces/three.ws`).
Read `CLAUDE.md` and obey it (only `$THREE`, no mocks, real APIs, clean repo,
no push without approval). **Low priority** — nothing is broken today.

## Background

`package.json` depends on `@pump-fun/agent-payments-sdk: ^3.1.0`. That version
**does not exist on npm** — the public registry's `latest` is **3.0.3** (versions
top out there). It resolves anyway because there is a **local workspace** at
`agent-payments-sdk/` whose `package.json` is
`{"name": "@pump-fun/agent-payments-sdk", "version": "3.1.0"}` and `package.json`
lists `agent-payments-sdk` in its `workspaces` array. So in-repo installs use the
local copy; the published 3.0.3 is never fetched.

This works, but it's worth making intentional:

- If our local 3.1.0 is just a **copy that drifted ahead of a version number**,
  fresh consumers outside the workspace (or anyone reading the manifest) will be
  confused, and we miss upstream fixes.
- If our local 3.1.0 has **deliberate three.ws patches**, that's a fork we should
  document and keep in sync deliberately.

## Goal

1. Determine the relationship between our `agent-payments-sdk/` and upstream:
    - Diff our local source against upstream npm `3.0.3`
      (`npm pack @pump-fun/agent-payments-sdk@3.0.3` and compare), and against the
      upstream repo if one is public.
    - Identify whether our copy has real code changes or is just a version bump.
2. Decide and implement one of:
    - **(a) Keep as an intentional local fork** — add a short `agent-payments-sdk/FORK_NOTES.md`
      explaining why it diverges and what our patches are; keep the `^3.1.0` pin.
    - **(b) Track upstream** — align our local copy/version to the published
      release (or pin the dependency to `^3.0.3` and drop/justify the workspace) so
      we get upstream updates, re-applying any necessary patches on top.
      Pick the option that matches what the diff shows; explain the call.
3. Verify everything that imports it still works:
    - `grep -rl "@pump-fun/agent-payments-sdk" api/ packages/ scripts/ pump-fun-skills/`
    - Build green (`npm run build`), tokenized-agent payment flows
      (`api/agents/payments/[action].js`, `api/_lib/agent-pumpfun.js`,
      `pump-fun-skills/tokenized-agents/`) still resolve and type-check.

## Verification (Definition of done)

- A clear written decision (FORK_NOTES or a manifest/version change) committed.
- `npm install` resolves cleanly; `npm run build` green; no broken imports.
- `git diff` self-reviewed. No push without approval; then both remotes.
