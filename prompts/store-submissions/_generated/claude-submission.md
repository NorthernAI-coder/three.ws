# Claude Connectors Directory — Submission Answer Sheet

**Status:** copy-paste-ready. Fields the operator must supply privately are marked `[HUMAN: fill in]`.
**Generated for:** three.ws MCP servers. **Date:** 2026-06-28.
**Sources:** live checklist re-fetched 2026-06-28 from
`claude.com/docs/connectors/building/submission` (the `support.claude.com` guide now redirects
there); tool data read from the prompt-01 artifacts `_generated/tool-inventory.md` and
`_generated/remote-tools-list.json` (the captured `tools/list` wire payload), cross-checked
against source `api/_mcp/tools/*.js` and `api/_mcp3d/`. Production re-verified 2026-06-28 (§1).

---

## 0. Read this first — open items the operator must resolve

These are gating decisions/risks surfaced while assembling the package. None are blank
form fields; they are judgment calls only the operator can make.

1. **Org / role (gating).** The in-app portal requires a **Team or Enterprise** Claude org
   and an **Owner** (or a custom role with *Directory management* / *Libraries* permission).
   - `[HUMAN: confirm]` you have a Team/Enterprise org + Owner role. **If not**, use the
     **public MCP directory submission form** instead of the in-app portal — same field
     content below applies.

2. **Media-generation policy (review risk).** The review criteria list *"AI-generated images,
   video, or audio"* among **rejected** use cases (design tools for diagrams/charts are
   permitted). Our **`/api/mcp-3d` 3D Studio** server is almost entirely generative
   (`text_to_3d`, `image_to_3d`, `retexture_*`, `stylize_model`, `generate_material`), and the
   main server has a few generative tools too (`render_avatar_image`, `text_to_animation`).
   - **Recommendation:** submit **`/api/mcp` (main)** first — it is dominated by read-only data,
     glTF *validation/inspection*, agent identity, and account management. Hold **`/api/mcp-3d`**
     as a separate, later submission and, if needed, ask the directory team whether *3D model
     (GLB) generation* is treated as prohibited media generation. `[HUMAN: decide]`

3. **Transactions / financial use (review risk).** Two things to disclose and watch:
   - The connector **charges USDC via x402** for paid tools (a per-call *service fee* for
     compute — disclose under the Transactions acknowledgment).
   - The review criteria reject *"financial asset transfers."* The main server's
     **trader / copy-trading / Oracle / Solana tools** (`trader_leaderboard`, `trader_profile`,
     `copy_subscribe`, `copy_status`, `oracle_*`, `solana_agent_*`, `pumpfun_*`) are **read-only
     market data and on-chain reputation reads — they do not move funds or execute trades.**
     State that explicitly so they aren't misread as asset transfers. `[HUMAN: confirm copy_subscribe
     never auto-executes a trade on the user's behalf — it records a copy subscription only.]`

4. **Discovery is auth-gated in production (verify with reviewer access).** Against
   production, unauthenticated `initialize` / `tools/list` return an **x402 `PaymentRequired`**
   (the server also issues a proper **OAuth `Bearer` challenge** via
   `WWW-Authenticate` + `/.well-known/oauth-protected-resource`). The directory portal syncs
   tools **after** completing the OAuth connection, so this is expected — but the reviewer/portal
   **must connect via OAuth** to see `tools/list`. Confirm the reviewer OAuth account works
   end-to-end (see §6). `[HUMAN: verify in the portal's Connection step.]`

5. **Prerequisite artifacts (present & reconciled).** `_generated/tool-inventory.md` (prompt 01,
   with `_generated/remote-tools-list.json` — the captured `tools/list` wire payload) and
   `_generated/claude-reviewer-guide.md` (prompt 02) **are** in the repo; §4 below is now taken
   verbatim from them. **Caveat:** the prompt-02 `claude-reviewer-guide.md` documents the
   **separate stdio npm connector** (`@three-ws/mcp-server`, 17 tools) — a *different* submission
   path — not the remote `/api/mcp` server this sheet submits. So §6 here is the **remote-server
   (OAuth) reviewer guide** and is self-contained; cite the stdio guide only if/when the npm
   package is submitted as a local connector. `[HUMAN: confirm the remote reviewer OAuth account
   (and operator-funded paid-tool entitlement) is provisioned before submitting.]`

6. **Privacy is live (no action).** The MCP/AI/payments section
   (`public/legal/privacy.html` §10) is **already deployed** — verified 2026-06-28 that
   `https://three.ws/legal/privacy` returns 200 and contains the "MCP Connectors, AI Processing &
   Payments" section. No pending privacy deploy.

---

## 1. Primary server choice

**Submit `https://three.ws/api/mcp` (the "three.ws Avatars & Agents" server) as the flagship.**

Why:
- Broadest, most directory-friendly surface: account-scoped avatar management, glTF/GLB
  **validation/inspection/optimization** (read-only), agent identity & reputation, agent memory,
  and live market/Oracle/trader **reads** — most tools are read-only or non-generative.
- Lower review risk than the 3D Studio server on the media-generation criterion (see §0.2).
- Production resolves and presents a correct OAuth challenge + x402 fallback (verified below).

Optionally submit **`https://three.ws/api/mcp-3d` (three.ws 3D Studio)** as a **second** listing
once the media-generation question (§0.2) is settled.

**Production verification (run 2026-06-28):**
```
POST https://three.ws/api/mcp  (no auth, body = tools/list)
→ 401, WWW-Authenticate: Bearer resource_metadata="https://three.ws/.well-known/oauth-protected-resource",
       resource="https://three.ws/api/mcp"
→ also emits the x402 PAYMENT-REQUIRED header (pay-per-call fallback for unauthenticated callers)
GET  https://three.ws/.well-known/oauth-protected-resource
→ 200, authorization_servers:["https://three.ws"], resource_documentation:"https://three.ws/docs/mcp",
       scopes_supported: avatars:read/write/delete, profile, memory:read/write, agents:read/write
https://three.ws/legal/privacy → 200   https://three.ws/docs/mcp → 200   https://three.ws/three-ws-mcp-icon.svg → 200
```
Discovery/`tools/list` returns results **after OAuth** (anonymous discovery is OAuth-challenged +
x402-gated — §0.4). The captured authenticated payload is `_generated/remote-tools-list.json`
(35 tools for `/api/mcp`).

---

## 2. Listing fields (portal "Listing" + "Connection" + "Company" + "Authentication" steps)

| Field | Value |
|---|---|
| **Server name** (≤100) | three.ws — Avatars & Agents |
| **Server URL** | `https://three.ws/api/mcp` |
| **Transport** | Streamable HTTP (MCP 2025-06-18) |
| **Tagline** (≤55) | `3D avatars, glTF tools & on-chain agent data` (44) |
| **Categories (1–5)** | Developer Tools; Productivity; Data & Analytics |
| **Documentation URL** | `https://three.ws/docs/mcp` |
| **Privacy policy URL** | `https://three.ws/legal/privacy` |
| **Support contact** | `support@three.ws` `[HUMAN: confirm this inbox is monitored]` |
| **Icon** | `https://three.ws/three-ws-mcp-icon.svg` |
| **URL slug** | `three-ws` |
| **Company name** | `[HUMAN: fill in legal entity name]` |
| **Company website** | `https://three.ws` |
| **Primary contact** | `[HUMAN: fill in name + email]` |
| **Authentication** | OAuth 2.1 (authorization-code + PKCE); x402 (USDC) as an alternative pay-per-call path for unauthenticated callers |
| **User connection model** | Each user connects their own three.ws account via OAuth |

**Description** (≤2,000 chars):
> three.ws turns Claude into a 3D-content and on-chain-agent workstation. Manage your three.ws
> avatars (list, fetch, search public avatars, render to an interactive viewer or a static image,
> delete); validate, inspect, and get optimization guidance for any glTF/GLB model; list and apply
> animation presets to rigged models; and embed a live 3D viewer anywhere with a generated snippet.
>
> It also reads the on-chain agent economy: ERC-8004 / Solana agent reputation, attestations, and
> identity "passport" checks for impersonation screening; an agent registry you can call and
> register into; and persistent agent memory (remember / recall / forget) scoped to your account.
>
> For market context it surfaces live pump.fun data (recent claims, token and creator intel,
> graduations), Oracle conviction signals, and a pump.fun trader leaderboard with full track records
> and copy-subscription management — all read-only market data.
>
> Connect your three.ws account with OAuth to use your account-scoped tools; public data tools can
> alternatively be paid per call with x402 (USDC). The only token three.ws references is $THREE.

---

## 3. Read / write capabilities summary (portal "Use cases" step)

- **Reads:** avatars (own + public search), glTF/GLB validation & inspection, animation presets,
  agent registry & reputation / attestations / passport, agent memory recall, pump.fun market data,
  Oracle signals, trader leaderboard & profiles, copy-subscription status, embed-code generation.
- **Writes:** save/render avatar assets, delete avatar, register an agent on-chain, call another
  agent, remember/forget memory, arm an Oracle watch, subscribe to copy a trader. Writes that
  touch a chain or external API carry `openWorldHint: true`.
- **Destructive:** two tools carry `destructiveHint: true` on the wire — `delete_avatar`
  (deletes an avatar) and `forget` (deletes a stored memory). Every other tool sets
  `destructiveHint: false` explicitly.
- **Payments:** paid tools return a structured x402 `PaymentRequired` (not an error) when
  unauthenticated and unpaid; OAuth-connected account tools are operator-funded for the user.

### Use cases (3–5 concrete)
1. **Avatar ops in chat** — "List my three.ws avatars, render `nova` to an image, and give me an
   embed snippet for my site."
2. **glTF QA** — "Validate this GLB URL, inspect its mesh/material counts, and suggest optimizations
   before I ship it."
3. **Agent due-diligence** — "Check the on-chain reputation and impersonation passport for this
   agent address before I delegate to it."
4. **Agent memory** — "Remember that this user prefers low-poly avatars," recalled in later sessions.
5. **Market read** — "Show the top pump.fun traders this week and the recent graduations" (read-only).

---

## 4. Full tool list (with titles)

> Taken verbatim from `_generated/remote-tools-list.json` (the captured `tools/list` wire payload)
> and `_generated/tool-inventory.md` (prices). **R/O** = `readOnlyHint: true`; **Dx** =
> `destructiveHint: true`. **Price** = pay-per-call in USDC via x402 for unauthenticated callers;
> *free* tools never charge. OAuth-connected account tools are operator-funded for the user.

### `https://three.ws/api/mcp` — three.ws Avatars & Agents (35 tools)
| Tool name | Title | R/O | Dx | Price |
|---|---|:--:|:--:|---|
| `getting_started` | Getting Started (free) | ✅ | — | free |
| `list_my_avatars` | List my avatars | ✅ | — | free |
| `get_avatar` | Get avatar | ✅ | — | free |
| `search_public_avatars` | Search public avatars | ✅ | — | free |
| `render_avatar` | Render avatar | ✅ | — | $0.005 |
| `render_avatar_image` | Render an avatar to an image | — | — | free |
| `delete_avatar` | Delete avatar | — | ✅ | free |
| `get_embed_code` | Get embed code | ✅ | — | free |
| `validate_model` | Validate glTF/GLB model | ✅ | — | $0.01 |
| `inspect_model` | Inspect glTF/GLB model | ✅ | — | $0.01 |
| `optimize_model` | Suggest optimizations for a glTF/GLB model | ✅ | — | $0.05 |
| `list_animations` | List animation presets | ✅ | — | free |
| `apply_animation` | Apply an animation preset to a rigged model | — | — | $0.02 |
| `text_to_animation` | Generate an animation from a text prompt and retarget it onto a model | — | — | free |
| `solana_agent_reputation` | Get Solana agent reputation | ✅ | — | free |
| `solana_agent_attestations` | List Solana agent attestations | ✅ | — | free |
| `solana_agent_passport` | Get Solana agent passport | ✅ | — | free |
| `pumpfun_recent_claims` | Recent pump.fun claims | ✅ | — | free |
| `pumpfun_token_intel` | Pump.fun token intel | ✅ | — | free |
| `pumpfun_creator_intel` | Pump.fun creator intel | ✅ | — | free |
| `pumpfun_recent_graduations` | Recent pump.fun graduations | ✅ | — | free |
| `call_agent` | Call agent | — | — | free |
| `register_agent` | Register an agent on-chain | — | — | free |
| `identity_check` | Screen an agent identity for impersonation | ✅ | — | free |
| `remember` | Remember | — | — | free |
| `recall` | Recall | ✅ | — | free |
| `forget` | Forget | — | ✅ | free |
| `oracle_top_plays` | Oracle top conviction plays | ✅ | — | free |
| `oracle_coin` | Oracle verdict for one coin | ✅ | — | free |
| `oracle_arm_watch` | Arm agent Oracle watch | — | — | free |
| `oracle_watch_status` | Oracle watch status + track record | ✅ | — | free |
| `trader_leaderboard` | Top pump.fun traders | ✅ | — | free |
| `trader_profile` | Full track record for one agent | ✅ | — | free |
| `copy_subscribe` | Subscribe to copy a trader | — | — | free |
| `copy_status` | My copy subscriptions | ✅ | — | free |

### `https://three.ws/api/mcp-3d` — three.ws 3D Studio (optional second listing)
> **Re-snapshot before this separate, later submission.** The captured wire payload
> (`remote-tools-list.json`) shows **21** tools; the live catalog has since grown
> (`capture_scene` plus the living-persona tools `create_agent_persona` / `get_agent_persona` /
> `persona_say`), so the current count is **24**. Regenerate `tool-inventory.md` /
> `remote-tools-list.json` at submission time and paste the fresh list here. Core tools below.
> Note the media-generation review risk in §0.2 applies to this server first.

| Tool name | Title | R/O | Dx | Price |
|---|---|:--:|:--:|---|
| `getting_started` | Getting Started (free) | ✅ | — | free |
| `text_to_3d` | Generate a 3D model from a text prompt | — | — | $0.15 |
| `image_to_3d` | Reconstruct a 3D model from one or more images | — | — | $0.15 |
| `generation_status` | Check a 3D generation job | ✅ | — | free |
| `preview_3d` | Preview any GLB as an interactive 3D artifact | ✅ | — | free |
| `remove_background` | Remove the background from an image | — | — | $0.01 |
| `remesh_model` | Remesh, simplify, repair, or convert a 3D model | — | — | $0.02 |
| `stylize_model` | Apply a one-click geometric stylization filter to a 3D model | — | — | $0.02 |
| `segment_model` | Split a 3D model into named, separable parts | — | — | $0.02 |
| `retexture_model` | Paint a new texture onto a 3D model from a text prompt | — | — | $0.05 |
| `retexture_region` | Repaint one masked region of a model's texture (magic brush) | — | — | $0.05 |
| `auto_rig_model` | Auto-rig a static 3D model (skeleton + skin weights) | — | — | $0.05 |
| `pose_model` | Resolve a text prompt to a pose-studio seed + joint rotations | ✅ | — | $0.01 |
| `direct_prompt` | Optimize a rough idea into a 3D-generation prompt (IBM Granite) | — | — | $0.01 |
| `generate_material` | Generate a glTF PBR material from a description (IBM Granite) | — | — | $0.01 |
| `save_avatar` | Save a generated GLB as a durable, named avatar | — | — | free |
| `inspect_model` | Inspect glTF/GLB model | ✅ | — | free |
| `optimize_model` | Suggest optimizations for a glTF/GLB model | ✅ | — | free |
| `list_animations` | List animation presets | ✅ | — | free |
| `apply_animation` | Apply an animation preset to a rigged model | — | — | $0.01 |
| `text_to_animation` | Generate an animation from a text prompt and retarget it onto a model | — | — | free |
| `create_agent_persona` | Mint a persistent, living agent persona from a rigged GLB | — | — | free |
| `get_agent_persona` | Reload a persisted persona by id (continuity across sessions) | ✅ | — | free |
| `persona_say` | Speak a reply through a persona — lip-sync + emotion + gesture | — | — | free |

---

## 5. Allowed link URIs (portal "Allowed links" — optional, suppresses confirm prompts)

Declare these HTTPS origins (every external link a tool response can open). We **own/control**
the three.ws origins; the rest are reputable, read-only public asset/explorer hosts that tool
responses may reference.

**Owned (declare):**
- `https://three.ws` — viewer links, embed targets, avatar pages, docs, legal.

**Asset hosts we serve from (declare):**
- `https://three-ws-public.r2.dev` — Cloudflare R2 public CDN for GLB/glTF + thumbnails.

**Third-party hosts referenced in responses (reputable; declare as needed):**
- `https://pump.fun` — token/coin links in market-data tool output.
- `https://explorer.solana.com` — Solana tx/address links.
- `https://basescan.org` — Base tx links (x402 settlement / EVM agent data).
- EVM explorers for ERC-8004 agent data (only when that chain is referenced):
  `https://arbiscan.io`, `https://polygonscan.com`, `https://etherscan.io`,
  `https://optimistic.etherscan.io`, `https://snowtrace.io`, `https://bscscan.com`.
- `https://nvidia-kaolin.s3.us-east-2.amazonaws.com` — NVIDIA-hosted reference assets (3D Studio).

> Custom URI schemes: none — the connector opens only `https://` links.

---

## 6. Reviewer access & test instructions (portal "Test & launch" step)

> Paste this into the reviewer-instructions box. Replace the `[HUMAN: ...]` credentials privately.
> This is the **remote-server (OAuth)** reviewer guide. The repo's
> `_generated/claude-reviewer-guide.md` covers the **separate stdio npm connector**
> (`@three-ws/mcp-server`) — use that one only if the npm package is submitted as a local connector.

**Server:** `https://three.ws/api/mcp` (Streamable HTTP). 3D Studio: `https://three.ws/api/mcp-3d`.

**Connect (OAuth 2.1):**
1. Add the connector by URL; the client discovers
   `https://three.ws/.well-known/oauth-protected-resource` and runs the OAuth flow.
2. Sign in with the reviewer test account: `[HUMAN: fill in test account login / wallet]`.
   The account is **fully populated** (sample avatars + agent memory) so list/get/search/recall
   return real data.
3. After OAuth, `tools/list` returns the full catalog and account-scoped tools run
   **operator-funded (free to the reviewer).**

**Free smoke path (no payment needed):**
- `getting_started` → server overview + per-tool pricing.
- `list_my_avatars` → returns the seeded avatars.
- `get_avatar` (id from the list) → full avatar record + viewer URL on `https://three.ws`.
- `search_public_avatars` (e.g. `"robot"`) → public results.
- `list_animations` → preset list.
- `recall` → seeded memory.
- (3D Studio) `generation_status` / `preview_3d` on a sample GLB URL → free, returns a viewer artifact.

**Funded path — exercising paid (x402) tools for real:**
- Paid tools called **without** payment return a clean `PaymentRequired` (price + asset + how to
  pay), **not** an error — see note below.
- To run them for real, use the prepared reviewer path: `[HUMAN: choose ONE and fill in —
  (a) reviewer OAuth account flagged for operator-funded paid tools, or (b) a small pre-funded
  Solana USDC test wallet: address + funding note.]`
- With that, exercise e.g. `validate_model` (pass any public GLB URL) and `render_avatar` to see
  real paid responses.

**Expected output shapes:**
- Read tools → JSON records (avatars, agents, market data) + `https://three.ws/...` links.
- Render/preview → a viewer artifact / image URL on `three.ws` or `three-ws-public.r2.dev`.
- Paid + unpaid → structured x402 `PaymentRequired` (see below).

**"What `PaymentRequired` means" (not a bug):** three.ws tools are pay-per-call in USDC. An
unauthenticated, unpaid call returns a structured `PaymentRequired` (`x402Version: 2`, the price,
the asset = USDC on Solana/Base, and `payTo`). This is the documented v2 MCP/x402 behavior, **not**
a failure — the tool is working and quoting its price. OAuth-connected account calls skip this.

---

## 7. Compliance acknowledgments (portal "Compliance" step — 7 statements)

Truthful draft answers; `[HUMAN: ...]` marks where operator confirmation is required.

1. **Directory guidelines** — *Acknowledged.* We will follow the Connectors Directory guidelines
   and the (non-waivable, evolving) MCP open-source terms; the server source is public at
   `https://github.com/nirholas/three.ws`.
2. **API usage / ownership** — *Acknowledged.* All tools call **first-party three.ws APIs** under
   `three.ws`, or legitimately proxy upstream services for which three.ws holds accounts (model
   providers, Solana/EVM RPC, pump.fun data). No third-party API is impersonated.
3. **Transactions** — *Disclosed.* Paid tools charge a **per-call service fee in USDC via x402**
   for compute. The market/trader/Oracle/Solana tools are **read-only data — they do not transfer
   user funds or execute trades.** `[HUMAN: confirm legal entity for the Company step and that
   copy_subscribe records a subscription only, with no automated on-chain order execution.]`
4. **Media generation** — *Disclosed.* `render_avatar_image` / `text_to_animation` (main) and the
   3D Studio generative tools produce **3D models / rendered images**. `[HUMAN: confirm with the
   directory team whether 3D-model generation is acceptable; if media generation is disallowed,
   submit `/api/mcp` only and exclude the two generative main-server tools or scope them out.]`
5. **Prompt injection** — *Acknowledged.* Tool descriptions are function-only: no hidden/encoded
   instructions, no directions for Claude to call other tools or follow external instruction
   sources, no system-prompt overrides.
6. **Data collection** — *Acknowledged.* We collect only the tool inputs needed to fulfill a call
   (prompts, asset URLs, addresses) plus usage metadata for quota/abuse. We **never** query
   Claude's memory, chat history, or user files. Disclosed in the privacy policy (§ MCP Connectors).
7. **Documentation** — *Acknowledged.* Public docs are live at `https://three.ws/docs/mcp`; the
   privacy policy at `https://three.ws/legal/privacy`. Both resolve over HTTPS today.

---

## 8. Manifest sanity (server.json / server-3d.json)

Verified clean:
- Schema: `https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json` (live, 200).
- `server.json` → name `io.github.nirholas/three.ws`, remote `https://three.ws/api/mcp`
  (`streamable-http`), website `https://three.ws`, repo public.
- `server-3d.json` → name `io.github.nirholas/threews-3d-studio`, remote `https://three.ws/api/mcp-3d`.
- **No non-`$THREE` token anywhere** in either manifest (no base58 mint strings present). `$THREE`
  remains the only coin referenced across the package.

---

## 9. Privacy policy — coverage confirmation

`https://three.ws/legal/privacy` (live, HTTP 200 — verified 2026-06-28) covers:
data collection ✓ · usage/storage ✓ · third-party sharing ✓ (infra + **AI model providers**:
NVIDIA NIM/TRELLIS, Meshy, Replicate, Stability, Hugging Face, OpenAI, Anthropic, IBM Granite) ✓ ·
retention ✓ (90-day usage data; saved content until deleted) · contact (`privacy@three.ws`) ✓ ·
**MCP tool inputs, x402 payment/wallet data, OAuth scope limits** ✓ (live §10 "MCP Connectors, AI
Processing & Payments" section — confirmed present on the deployed page). No pending privacy deploy.
