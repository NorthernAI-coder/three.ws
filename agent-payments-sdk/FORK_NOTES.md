# Fork notes — `@pump-fun/agent-payments-sdk` (local 3.1.0)

This directory is a **deliberate three.ws fork** of `@pump-fun/agent-payments-sdk`,
not a stale copy. It is wired as a local npm workspace (listed in the root
`package.json` `workspaces`), so in-repo installs always resolve `^3.1.0` to this
source and the published npm release is never fetched.

## Relationship to upstream

| | Upstream npm `3.0.3` (`latest`) | This fork `3.1.0` |
|---|---|---|
| Author | Pump Fun | nirholas |
| Scope | Solana only | Solana **+ EVM + cross-chain** |
| Ship shape | single bundle (`dist/index.*`) | 7 export subpaths |
| Runtime deps | 3 | 13 |
| Source | not published (`files: ["dist"]`) | full `src/` tree (~14.8k LOC) |

Upstream `3.0.3` exports a single Solana surface: `PumpAgent`, `PumpAgentOffline`,
the PDA helpers, account decoders, and the program constants/types for the agent
payments program (`AgenTMiC2hvxGebTsgmsD4HHBa8WEcqGFf87iwRRxLo7`). The published
package is restricted/private and ships only `dist`; there is no public upstream
source repo to diff against, so the Solana core here was **reverse-engineered**
from the published bundle (see `README.md`).

> Note: npm `latest` tops out at `3.0.3`. There is **no published `3.1.0`** — the
> `3.1.0` version number is ours and signals "upstream Solana core + three.ws
> extensions." This is intentional; do not "fix" the `^3.1.0` pin as if it were
> a broken/missing version.

## What we add on top of the upstream Solana core

Everything below is **net-new in this fork** and has no equivalent in upstream
`3.0.3`. All of it is consumed elsewhere in the repo (see "Consumers"):

- **EVM** (`./evm`) — `EvmAgent`, `EvmAgentOffline`, ABI, addresses, on-chain
  events, invoice/quote/transaction builders, validation.
- **x402** — HTTP 402 payment protocol on both chains:
  - `./x402` (EVM): client + facilitator.
  - `./solana/x402`: client, facilitator, header codecs, types.
- **a2a** (`./a2a`) — agent-to-agent payment helpers.
- **Cross-chain** — `CrossChainPaymentClient` tying the Solana and EVM agents
  together behind one client.
- **solana-agent-kit** (`./solana/solana-agent-kit`) — action adapters for the
  solana-agent-kit runtime.
- **legacy-agent-payments** (`./solana/legacy-agent-payments`) — the prior
  program variant, kept (with tests) for back-compat.
- **Event subscriptions** — `events.ts` / `pump-events.ts` WebSocket decoding and
  live subscriptions over the Solana core.

## Why we keep it as a fork (not "track upstream")

Switching the dependency to the published `^3.0.3` would drop every extension
above — EVM, x402, a2a, cross-chain, solana-agent-kit, legacy — all of which are
imported by `api/` routes and skills today. There is no upstream artifact that
provides them, so "tracking upstream" is not a drop-in; it would be a feature
regression. The fork is the right call.

## Keeping the Solana core in sync with upstream

Because upstream ships no source, sync is a manual, periodic check of the
**Solana core only** (PumpAgent / PDAs / decoders / program constants):

```bash
# Is there a release newer than what we forked from?
npm view @pump-fun/agent-payments-sdk dist-tags version

# Pull the published bundle and diff its public surface against ours.
cd "$(mktemp -d)" && npm pack @pump-fun/agent-payments-sdk@latest \
  && tar xzf *.tgz && grep -E '^export' package/dist/index.d.ts
```

If upstream changes the program ID, PDA seeds, IDL, or account layouts, port those
into `src/solana/` (and `src/solana/idl/`) and re-run `npm run build`. Leave the
extensions untouched. Bump our local version (e.g. `3.1.1`) when we port a sync.

## Consumers (repo-wide, excluding the fork itself)

`api/pump/[action].js`, `api/_lib/pump.js`, `api/_lib/pump-swap-ix.js`,
`api/agents/payments/[action].js`, `api/agents/pumpfun/[action].js`,
`api/cron/[name].js`, `scripts/buyback-devnet-smoke.mjs`,
`pump-fun-skills/create-coin/`, `pump-fun-skills/tokenized-agents/`,
`solana-agent-sdk/`, plus `src/agent-skills-*.js`. All resolve via the workspace
symlink; `npm run build` here regenerates `dist/` (the root `postinstall`
rebuilds it on demand via `scripts/build-cache.mjs`).
