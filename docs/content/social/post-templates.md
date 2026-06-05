# Post Templates

One reusable template per format, each with per-platform variants. Copy a block, fill the `[brackets]`, resolve every gate, then post. The bracket conventions:

- `[SOURCE: …]` — a real, sourced figure must replace this. Never an invented number.
- `[HUMAN: …]` — a real person must supply/approve this (a quote, a permission, a status).
- `[PERMISSION CONFIRMED?]` — a hard gate; the post does not ship until a human confirms written permission.
- `[fill: …]` — plain copy you write from the real asset in front of you.

**Before posting anything, re-read the [honesty rules](README.md#honesty-rules--non-negotiable).** Every feature claim links to proof. `/play` is never "single-player." IBM/watsonx is "built on watsonx.ai." $THREE is the only coin.

---

## 1. Build-in-public

> "Here's what we shipped / what broke / what we learned." Always links to a real commit, route, or doc. Honest about failures — that's the point.

**Core template**

```
[fill: what we shipped or what broke this week — one concrete thing]

[fill: the real detail — the bug, the fix, the tradeoff. Be specific.]

[fill: what we learned / what's next]

→ [SOURCE: link a REAL commit, PR, route, or doc — not a generic homepage link]
```

**Platform variants**

- **X (thread):** Post 1 = the headline change + proof link. Posts 2–4 = the technical story (what broke, the fix, the lesson), one idea each. Close with the route to try it live.
- **Farcaster:** Lead with the technical specificity crypto-native devs reward. Link the commit and, if on-chain, the tx/passport. Skip hype words.
- **LinkedIn:** Frame as problem → decision → outcome. Professional tone. Good for "why we chose X over Y" architecture posts. End with what it unlocks for builders.
- **YouTube Shorts/TikTok:** Only if there's a visual diff (before/after a UI fix). 9:16 screen recording, on-screen caption of the change, link in description.

**Example fill (X):** "Shipped real Rapier physics in `/walk` this week. The gnarly bug: a heightfield buffer-dim mismatch threw `RuntimeError: unreachable` until we passed points-1. Lesson: heightfield APIs count edges, not vertices. Try it → /walk"

---

## 2. Feature spotlight

> Hook + **one** real capability + proof link + CTA. One capability per post — don't list. One variant per platform.

**Core template**

```
[hook — pull from hooks-library.md, matched to the capability]

[fill: the one real capability, in plain language — what it does for the user]

[fill: one concrete proof detail — the route, the spec, the standard it implements]

→ Try it: [CTA URL — a real route on three.ws]
Docs/proof: [SOURCE: link the README section or doc that backs the claim]
```

**Platform variants**

- **X:** Hook in line 1. Attach the screen recording/screenshot. One CTA. If it needs depth, make it a thread where post 2 is the proof link and post 3 the "why it matters."
- **Farcaster:** Crypto-native framing for on-chain features (identity, x402, $THREE world). Link the on-chain proof (passport, tx, x402 receipt). A frame works well for "try it" CTAs.
- **LinkedIn:** Lead with the problem the capability solves for a team/business. Professional tone, no slang. CTA toward docs or a demo, not "ape in."
- **YouTube Shorts/TikTok:** The capability IS the video. Payoff in the first 2 seconds, on-screen text naming the feature, CTA route in caption + end card. Use the matching clip in [clip-plan.md](clip-plan.md).

**Real capabilities you may spotlight (each maps to `README.md`):**

| Capability | CTA route | Proof |
| --- | --- | --- |
| Selfie → 3D agent | `/scan`, `/create/selfie` | `README.md` Phase 1 / Vision |
| Forge text → 3D | `/forge` | live route `/forge` (in-house text→3D pipeline) |
| Embed `<agent-3d>` anywhere | `/embed-editor`, `/studio` | `README.md` Examples §1, §6 |
| $THREE coin world (shared, live) | `/play`, `/communities` | `README.md` Coin Communities |
| Agents pay agents over x402 (USDC) | `/x402`, `/x402-discover` | `README.md` x402 § |
| On-chain identity (ERC-8004 / Metaplex Core) | `/deploy`, `/a/[chain]/[id]` | `docs/erc8004.md` |
| Pay-by-name (`@user` / `*.sol`) | `/u/[username]` | `README.md` x402 § |
| MCP server | (host config) | `docs/mcp.md` |
| Granite on watsonx.ai showcase | `/ibm` | `docs/ibm.md` — **"built on watsonx.ai"** |
| AWS Marketplace | `/aws` | `docs/aws-marketplace.md` — **"listing in review"** |

---

## 3. User creation

> Showcase a **real** creation, **only with explicit permission**. Never stage content and pass it off as organic.

**Hard gate — do not draft past this line until it's true:**

```
[PERMISSION CONFIRMED?]  → Written permission from the creator to repost, on this platform, with @credit. YES / NO.
If NO: stop. Do not post. Swap in a feature-spotlight from the backlog.
```

**Core template** (only after the gate is YES)

```
[fill: what the creator made — describe the real agent/avatar/world honestly]

Built on three.ws by [HUMAN: creator's real @handle, with their consent to tag]

[fill: one genuine detail that makes it cool — no embellishment]

→ See it: [creator's public agent/world URL]
Make your own: [CTA URL — /create or /forge or /scan]
```

**Rules baked in**

- The creation must be **real and the creator's own**. We do not produce a demo agent and present it as a user's organic creation.
- No invented reactions ("everyone loved it"), no fabricated stats on the creation.
- Credit the human; link their real public page; honor any takedown request immediately.

**Platform variants**

- **X / Farcaster:** Quote-post or repost the creator's original where possible (keeps attribution native). Add one line of genuine commentary.
- **LinkedIn:** Frame as a case study — what the creator was trying to do and how the platform helped. Still permission-gated.
- **YouTube Shorts/TikTok:** Only with the creator's recording or explicit permission to re-cut. Credit on-screen and in caption.

---

## 4. Dev tip

> A genuinely useful tip pulled from `README.md` / `docs/`. Each ships with a code or route reference so a developer can act on it immediately.

**Core template**

```
[hook — teaching angle from hooks-library.md]

[fill: the tip in one or two sentences — concrete and actionable]

[code snippet OR exact route/command — copy-pasteable]

→ Full docs: [SOURCE: link the README section or doc the tip comes from]
```

**Real, ready-to-use tips (each traceable to docs):**

- **One-tag embed** — `<agent-3d body="…glb" brain="claude-sonnet-4-6">` renders a talking agent, no build step. (`README.md` Examples §1–2)
- **Load a registered agent by ID** — `<agent-3d agent-id="a_…">` pulls the full manifest. (`README.md` Examples §4)
- **iframe embed for Notion/Substack/Webflow** — use the `/embed` widget URL, no script tag. (`README.md` Examples §6)
- **Compress a heavy GLB** — `npx gltf-transform draco input.glb output.glb`. (`README.md` Common gotchas)
- **MCP setup** — point any MCP host at the three.ws MCP endpoint to drive avatars. (`docs/mcp.md`)
- **Pay an x402 endpoint** — agents settle in USDC on Base/BSC/Solana; pay-by-name resolves `@user`/`*.sol`. (`README.md` x402 §)
- **CSP for embeds** — add `script-src 'self' https://three.ws;`. (`README.md` Common gotchas)

**Platform variants**

- **X (thread):** One tip per thread, with the snippet as a code image or formatted block; link docs at the end. A "5 ways to embed an agent" thread works well.
- **Farcaster:** Devs are the core audience — go deeper, link the exact spec under `specs/` where relevant.
- **LinkedIn:** Frame the tip around the outcome ("ship an embedded AI agent in 5 minutes"); keep the snippet but add the business context.
- **YouTube Shorts/TikTok:** Screen-record the tip end to end (paste snippet → working agent). 9:16, on-screen code, CTA to docs.
