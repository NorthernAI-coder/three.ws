# 4-Week Content Calendar

~3–5 posts/week, rotating the four formats (Build-in-public · Feature spotlight · User creation · Dev tip) across X, Farcaster, LinkedIn, and YouTube Shorts/TikTok. Every row ties to a **real** feature in [`README.md`](../../../README.md) or a clip in [clip-plan.md](clip-plan.md).

**No engagement or metric columns by design** — we do not predict or claim numbers. Where a post body needs a real figure, the [template](post-templates.md) carries a `[SOURCE: …]` gate; the calendar never asserts one.

**Asset needed** = what a human must capture before drafting (a real screen recording, screenshot, commit link, or — for user creations — written permission). **Source link** = the proof the post must point at.

Formats are abbreviated: **BIP** build-in-public · **FS** feature spotlight · **UC** user creation · **DT** dev tip.

---

## Week 1 — Foundations: what three.ws is

| Week | Day | Platform | Format | Topic | Asset needed | Source link |
| --- | --- | --- | --- | --- | --- |
| 1 | Mon | X (thread) | FS | "Give your AI a body" — GLB + LLM brain + embed in one flow | 20s screen recording: drop GLB → talking agent | `README.md` Examples §; live `/app` |
| 1 | Tue | YouTube Shorts / TikTok | FS | Selfie → 3D agent, 9:16 clip | Vertical capture of `/scan` 3-photo flow (Clip 1) | `/scan`, `/create/selfie`; `README.md` Phase 1 |
| 1 | Wed | Farcaster | DT | Embed an agent with one `<agent-3d>` tag | Code snippet card (Example 1) | `README.md` Examples §1 |
| 1 | Thu | LinkedIn | BIP | What we're building and why: photo → avatar → agent → on-chain identity | Roadmap graphic (Phases 0–4) | `README.md` Vision + Roadmap |
| 1 | Fri | X | FS | $THREE coin world: pick a token, land in a live shared 3D world | Capture of `/play` with peer avatars + market-cap screen | `/play`, `/communities`; `README.md` Coin Communities |

## Week 2 — Creation flows

| Week | Day | Platform | Format | Topic | Asset needed | Source link |
| --- | --- | --- | --- | --- | --- |
| 2 | Mon | YouTube Shorts / TikTok | FS | Forge: type a prompt → 3D model, 9:16 clip | Vertical capture of `/forge` text→3D (Clip 2) | `/forge` |
| 2 | Tue | X (thread) | DT | From a registered agent: load by ID, no inline attrs | Snippet card (Example 4) + screenshot | `README.md` Examples §4 |
| 2 | Wed | Farcaster | FS | Agents pay agents in USDC over x402 (real, on Base/BSC/Solana) | Capture of an x402 paid call / receipt | `README.md` x402 §; `docs/mcp-x402-bazaar.md` |
| 2 | Thu | LinkedIn | BIP | This week we shipped: [pull a real merged change] | `git log` link to a real commit/PR | `[SOURCE: link a real commit from git history]` |
| 2 | Fri | X | UC | Showcase a real creator's agent (permission-gated) | Creator's clip + written permission | `[PERMISSION CONFIRMED?]` + creator's public agent URL |

## Week 3 — On-chain + developer surface

| Week | Day | Platform | Format | Topic | Asset needed | Source link |
| --- | --- | --- | --- | --- | --- |
| 3 | Mon | X (thread) | FS | Register an agent on-chain: ERC-8004 (EVM) or Metaplex Core (Solana) | Capture of `/deploy` → passport at `/a/[chain]/[id]` | `docs/erc8004.md`; `README.md` On-Chain Identity § |
| 3 | Tue | Farcaster | DT | Pay-by-name: send USDC to `@username` / `*.sol`, verify before signing | Capture of pay-by-name modal on a `/u/[username]` page | `README.md` x402 §; `/api/x402/pay-by-name` |
| 3 | Wed | YouTube Shorts / TikTok | FS | Embed an agent anywhere (Notion/Webflow/WordPress), 9:16 | Vertical capture: paste iframe → live agent (Clip 3) | `README.md` Examples §6; `/embed-editor` |
| 3 | Thu | LinkedIn | FS | MCP server: drive 3D agents from any MCP host | Screenshot of MCP tool call from a host | `docs/mcp.md`; `README.md` MCP Server § |
| 3 | Fri | X | DT | Claim `[you].threews.sol` in one Solana tx (platform pays gas) | Capture of `/threews/claim` | `README.md` SNS § ; `/threews/claim` |

## Week 4 — Distribution, partners, recap

| Week | Day | Platform | Format | Topic | Asset needed | Source link |
| --- | --- | --- | --- | --- | --- |
| 4 | Mon | LinkedIn | FS | three.ws on AWS — AWS Partner; Marketplace SaaS listing in review | AWS partner page screenshot | `docs/aws-marketplace.md`; `/aws` |
| 4 | Tue | X (thread) | FS | Granite on watsonx.ai — the `/ibm` developer showcase (built on watsonx.ai) | Capture of `/ibm/galaxy` or `/ibm/oracle` | `docs/ibm.md`; link IBM social kit if present |
| 4 | Wed | Farcaster | UC | Community spotlight: a real agent built on three.ws (permission-gated) | Creator clip + written permission | `[PERMISSION CONFIRMED?]` + public agent URL |
| 4 | Thu | YouTube Shorts / TikTok | FS | On-chain identity in 30s: passport, signed action log, reputation | Vertical capture of an on-chain passport (Clip 5) | `/a/sol/[asset]`; `README.md` On-Chain Identity § |
| 4 | Fri | X | BIP | Month in review: what shipped, what's next (Phase 1/2 status) | Honest changelog pulled from real commits | `docs/changelog.md`; `README.md` Roadmap |

---

### Operating notes

- **Rotate, don't repeat.** Each week touches all four formats at least once; FS leads because we have real features to show.
- **Launch days** (token, partner, or release) reference G04's press kit rather than restating it; partnership-status wording (G01) stays human-owned.
- **Clip rows** (YouTube Shorts/TikTok) map to the numbered clips in [clip-plan.md](clip-plan.md). When G02's scripts land under `docs/content/video-scripts/`, re-point the source links at the actual beat tables.
- **User-creation rows never ship without the `[PERMISSION CONFIRMED?]` gate resolved.** No permission → swap in a feature-spotlight from the backlog.
