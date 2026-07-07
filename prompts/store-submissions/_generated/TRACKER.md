# three.ws Store Submission Tracker

Last updated: 2026-06-25. Re-run prompt 14 near the end to refresh status.

Legend: **not-started** | **blocked** | **ready-to-submit** | **submitted** | **live**

---

## Submission status

| Target | Status | Owning prompt | Blocking items | Listing URL |
|---|---|---|---|---|
| **Claude Connectors Directory** | blocked | 03 | `[HUMAN: Team/Enterprise org + Owner role required for in-app portal; OR use public form]` · Privacy policy must be deployed with MCP section (§9 of answer sheet) · Reviewer test account not yet provisioned | — |
| **Claude plugin marketplace** | not-started | 10 | Plugin install test not yet run end-to-end; `three-ws-3d` plugin not yet created | — |
| **Claude Agent Skills pack** | not-started | 11 | 3D-creation skills (`generate-3d-model`, `create-3d-avatar`, `rig-a-model`) not yet added | — |
| **OpenAI App Directory** | blocked | 04–06 | Package + audit done (`_generated/openai-submission.md`, 7/7 policy PASS; 3 real-model screenshots). **B1:** limiter store over monthly quota → studio generation 429s; **B2:** `/viewer?src=` route 404s (dead link in tool output). Clear both + redeploy before submit. `[HUMAN: OpenAI identity verification + support contact + final submit]` | — |
| **OpenAI GPT Store** | ready-to-build | 12 | `/api/3d/studio` free REST Actions lane built + live-verified (real GLB, safety gate, zero crypto/PII); `_generated/openai-actions.yaml` lints clean; `_generated/openai-gpt-config.md` complete; `[HUMAN: paste config into GPT builder, upload icon-512x512.png, verify Builder Profile, submit]` | — |
| **Official MCP Registry** | ready-to-submit | 13 | `server.json` manifests verified clean; `[HUMAN: Run mcp-publisher commands (staged in prompt 13 output) — do not publish without explicit operator approval]` | https://registry.modelcontextprotocol.io/?q=io.github.nirholas |
| **Smithery** | not-started | 13 | Listing doc not yet written | — |
| **Glama** | not-started | 13 | Listing doc not yet written | — |
| **mcp.so** | not-started | 13 | Listing doc not yet written | — |
| **PulseMCP** | not-started | 13 | Listing doc not yet written | — |
| **LobeHub** | not-started | 13 | `public/lobehub/plugin.json` exists but needs refresh | — |

---

## Prerequisite prompt status

| Prompt | Title | Status | Output artifact |
|---|---|---|---|
| 01 | Tool annotation & title audit | ✅ complete | `_generated/tool-inventory.md`, `stdio-tools-list.json` |
| 14 | Cross-store asset kit | ✅ complete | `_generated/assets/`, `listing-copy.md`, `TRACKER.md` |
| 02 | Claude reviewer access guide | ⬜ not started | `_generated/claude-reviewer-guide.md` |
| 03 | Claude submission package | ⬜ not started | `_generated/claude-submission.md` (exists from earlier run — verify/refresh) |
| 04 | OpenAI free 3D endpoint | ⬜ not started | `/api/mcp-studio` live endpoint |
| 05 | OpenAI Apps SDK component | ⬜ not started | GLB viewer component; hero screenshot |
| 06 | OpenAI submission package | ⬜ not started | `_generated/openai-submission.md` |
| 07 | Embodied live agent avatar | ⬜ not started | Inline avatar component + emote/lip-sync |
| 08 | Live agent commerce | ✅ verified | Loop live (discover→pay→delegate→receipt) + guardrails; evidence in `_generated/commerce/`. On-chain settle needs funded wallet + `MCP_AGENT_TALK_TOKEN` (owner) |
| 09 | Conversational remixable 3D | ⬜ not started | Iterate-by-chat + royalty wiring |
| 10 | Claude plugin marketplace | ⬜ not started | 4 installable plugins |
| 11 | Agent Skills pack | ⬜ not started | Hardened skills + 3D-creation skills |
| 12 | OpenAI GPT Store Actions | ✅ built | `api/3d/studio.js` + `_generated/openai-actions.yaml` (lints clean) + `_generated/openai-gpt-config.md` |
| 13 | MCP registries & directories | ⬜ not started | `_generated/mcp-directories/` + canonical metadata |
| 16 | Tokenized 3D NFT | 🟨 code-complete, live mint blocked | `mint_3d_asset` + `get_3d_asset_onchain` shipped + unit-verified (15/15). Live devnet mint blocked on devnet faucet daily-IP limit; run `scripts/tokenize-3d-devnet-e2e.mjs` (or `E2E_PAYER_SECRET=…`) to finish. Evidence: `_generated/tokenized/` |
| 17 | Embodied on-chain identity | ⬜ not started | Persona↔wallet binding + visual chain state |
| 18 | Token-gated 3D embeds | ⬜ not started | Holder-only embed gating |
| 19 | Verifiable AI-3D provenance | ⬜ not started | Content credentials + on-chain anchor |
| 20 | Spatial MCP standard | ⬜ not started | Open spec + reference renderer |
| 21 | AR-ready exports | ⬜ not started | GLB→USDZ + Scene Viewer links |

---

## Asset kit reference (from listing-copy.md)

| Asset | Dimensions | Ready? |
|---|---|---|
| `assets/icon.svg` | scalable | ✅ |
| `assets/icon-512x512.png` | 512×512 | ✅ |
| `assets/icon-256x256.png` | 256×256 | ✅ |
| `assets/icon-128x128.png` | 128×128 | ✅ |
| `assets/screenshot-viewer.png` | 1400×900 | ✅ |
| `assets/screenshot-create.png` | 1400×900 | ✅ |
| `assets/screenshot-studio.png` | 1400×900 | ✅ |
| `assets/screenshot-validation.png` | 1400×900 | ✅ |
| `assets/screenshot-discover.png` | 1400×900 | ✅ |
| `assets/screenshot-landing.png` | 1400×900 | ✅ |
| `assets/og-image.png` | ~1200×630 | ✅ |
| Hero: real generated 3D inline | per-store | ⬜ pending prompt 05/07 |

---

## `[HUMAN: ...]` items that block submission

1. **Claude org + role** — Team or Enterprise plan with Owner (or Directory-management) role. Without it use the public form instead of the in-app portal.
2. **Claude reviewer test account** — a fully-populated three.ws account (avatars + memory) + a USDC-funded Solana wallet or operator-funded OAuth path for paid tool testing. Provision before submitting.
3. **Privacy policy deploy** — the "MCP Connectors, AI Processing & Payments" section (§9 of `claude-submission.md`) must be live at `https://three.ws/legal/privacy` before submitting.
4. **OpenAI identity verification** — complete on `platform.openai.com` before any OpenAI listing can go live.
5. **mcp-publisher commands** — review and approve the staged publish commands from prompt 13 before running them.
6. **Smithery/Glama/mcp.so accounts** — create accounts on each directory platform if not already done.
