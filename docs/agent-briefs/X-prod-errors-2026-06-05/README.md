# Production Error Remediation — 2026-06-05

Source: `3dagent-log-export-2026-06-05T10-18-30.json` (Vercel function logs, project `three.ws`).
Window: **2026-06-04 10:19 UTC → 2026-06-05 10:18 UTC** (24h).
Volume: **5,945 log lines** — 2,571 `error`, 563 `warning`, plus status-code rollups
(965×200, 4,030×500, 948×502).

Every line in the export traces back to **~12 distinct root causes**. This document
groups them, names the source of each, and ships a self-contained fix prompt per issue
under [`prompts/`](prompts/). Each prompt is written to be handed to one agent and
executed end-to-end — trace to source, fix properly, wire 100%, verify. No suppression,
no swallowing errors, no shortcuts.

## How to use this

1. Work the prompts in **priority order** (P0 → P2). P0 issues are taking whole
   functions down (HTTP 500/502) and dwarf everything else by volume.
2. One agent per prompt file. Each prompt is the agent's complete brief.
3. After each fix: the agent must reproduce-or-prove the failure path, fix at the
   source, redeploy/verify, and confirm the specific log signature can no longer occur.
4. Push to **both** remotes only on explicit user approval (see `CLAUDE.md`).

## Severity ledger (by blast radius, not just count)

| # | Prompt | Root cause | Endpoints hit | ~Lines | Sev |
|---|--------|-----------|---------------|-------:|-----|
| 01 | [`01-jsdom-esm-require-crash.md`](prompts/01-jsdom-esm-require-crash.md) | `jsdom → html-encoding-sniffer → @exodus/bytes` `ERR_REQUIRE_ESM` crashes the bundled function at load | widgets `stats`, `transcripts`, `knowledge`, `chat` | **1,242** | **P0** |
| 02 | [`02-upstash-request-limit.md`](prompts/02-upstash-request-limit.md) | Upstash Redis monthly request cap (500k) exhausted → every Redis-backed route 500s | explore, marketplace, agents, auth, solana-rpc, +15 more | **737** | **P0** |
| 03 | [`03-chat-provider-exhaustion.md`](prompts/03-chat-provider-exhaustion.md) | All LLM fallback routes 429/quota-exhausted; OpenAI billing quota hit; free OpenRouter models rate-limited | `/api/chat`, `/api/llm/anthropic` | ~700 | **P0** |
| 04 | [`04-missing-db-tables.md`](prompts/04-missing-db-tables.md) | Prod DB missing tables: `forge_creations`, `usage_events` (migrations/schema not applied) | forge-gallery, agents/[id] | ~25 | **P1** |
| 05 | [`05-birdeye-geckoterminal-429.md`](prompts/05-birdeye-geckoterminal-429.md) | Birdeye + GeckoTerminal 429 (no cache/backoff/key) | three-token, ibm/oracle | ~175 | **P1** |
| 06 | [`06-brain-chat-openrouter-credits.md`](prompts/06-brain-chat-openrouter-credits.md) | `/api/brain/chat` OpenRouter free-tier credit ceiling + invalid Responses-API payloads | `/api/brain/chat` | ~95 | **P1** |
| 07 | [`07-token-treasury-wallet-unset.md`](prompts/07-token-treasury-wallet-unset.md) | `THREE_TREASURY_WALLET` unset in prod → `/api/token/config` throws (fail-closed, correct, but unconfigured) | `/api/token/[action]` | 18 | **P1** |
| 08 | [`08-cron-eth-rpc-failures.md`](prompts/08-cron-eth-rpc-failures.md) | `index-delegations` cron: public ETH RPCs 429 / `eth_getLogs` unsupported / time-budget exceeded | `/api/cron/index-delegations` | ~40 | **P1** |
| 09 | [`09-pump-launch-wasm-and-tx.md`](prompts/09-pump-launch-wasm-and-tx.md) | `/api/pump/launch-agent`: missing bundled `vanity_grinder_bg.wasm`; `encoding overruns Uint8Array` tx serialize; 30s timeouts | `/api/pump/[action]` | ~16 | **P1** |
| 10 | [`10-skills-pricing-neon-transaction.md`](prompts/10-skills-pricing-neon-transaction.md) | `db.transaction()` called with wrong arg shape (Neon serverless contract) | `/api/agents/[id]/skills-pricing` | 4 | **P2** |
| 11 | [`11-og-and-url-edge-cases.md`](prompts/11-og-and-url-edge-cases.md) | `/api/play-og` Invalid URL; `agent-og` `:id` literal passed to uuid; `x402-pay/og` Fontconfig | play-og, agent-og, x402-pay/og | ~5 | **P2** |
| 12 | [`12-misc-data-integrity.md`](prompts/12-misc-data-integrity.md) | `explore` NUL byte in UTF8 insert; `llm/anthropic` double body-read; `tts/edge` ws 200 mishandle | explore, llm/anthropic, tts/edge | ~5 | **P2** |

## Cross-cutting note

Two P0s (01, 02) are responsible for the overwhelming majority of the 500/502 volume.
Fixing those two will quiet ~2,000 of the ~2,571 error lines. Do them first.

Issue 03 (LLM provider exhaustion) is partly operational (quota/billing) but the logs
also reveal **fixable** routing bugs (a free model with no tool-capable endpoint is
retried blindly; `brain/chat` sends payloads the Responses API rejects). The prompts
separate "add credits" (ops) from "fix the routing" (code) so the code half can ship.
