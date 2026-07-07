# Start here

Welcome to three.ws. If you're new, this is the right place to begin — no prior experience with 3D, AI, or crypto required.

---

## What is three.ws?

three.ws lets you create AI agents that live inside a 3D avatar — a character that speaks, reacts, and can be embedded anywhere on the web.

Think of it as giving your AI a body and a face. Instead of a plain text chatbox, your agent appears as a 3D character that talks, waves, and expresses emotion. It still uses the same AI models (Claude, GPT, etc.) under the hood — it just has a presence.

**You can:**

- Create a 3D AI character that responds to questions in natural language
- Pick from a gallery of avatars or upload your own 3D model
- Embed the agent on any website with a single line of code
- Give it a personality, a voice, and a set of capabilities ("skills")
- Optionally give it an on-chain identity so it outlives any single platform

**You don't need:**

- Any coding experience to create and embed a basic agent
- Crypto or a wallet to view or embed agents made by others
- A 3D background — the platform handles all the rendering

---

## Two kinds of people use three.ws

**Creators (no code required):** You want to publish a 3D AI character — for your business, your personal site, a product, or just for fun. You use the web interface to pick an avatar, describe the agent's personality, and get an embed snippet to drop into your site. Start with [Make your first agent →](./make-your-agent.md)

**Developers:** You want to build on top of the platform — integrate the `<agent-3d>` web component, write custom skills, call the REST API, or self-host the stack. Start with the [Introduction →](./introduction.md) or [Quick start →](./quick-start.md)

---

## The four things on three.ws

Every page on the platform is one of four things. Knowing these will orient you:

| | What it is | Where to find it |
|---|---|---|
| **Avatar** | A 3D model — the body | `/marketplace` |
| **Agent** | An AI mind wearing an avatar | Your dashboard |
| **Marketplace** | Where avatars (and shared agents) live | `/marketplace` |
| **Studio** | Where you assemble everything | `/studio` |

For a deeper explanation of how agents and avatars differ, see [Agents vs. Avatars →](./agents-vs-avatars.md)

---

## The non-developer track

If you're here to create and share agents rather than write code, follow this path in order:

1. **[Agents vs. Avatars](./agents-vs-avatars.md)** — understand the two core concepts (5 min read)
2. **[Make your first agent](./make-your-agent.md)** — create a 3D AI character in the browser, no code
3. **[Share & embed](./share-and-embed.md)** — get the embed snippet and put your agent anywhere
4. **[Do I need crypto?](./do-i-need-crypto.md)** — honest answers to the wallet and payment questions

---

## Ready to build?

- **Just exploring?** → Open [Discover](/discover) to browse agents others have built
- **Creating your first agent** → Go to [/start](/start) — a 5-step wizard walks you through it
- **Meeting avatars in the worlds?** → Press <kbd>I</kbd> on anyone in `/play`, `/city`, a coin world, or `/agora` to see who they are — the [avatar inspector](./avatar-inspector.md) shows their reputation, wallet, and profile
- **Trading?** → [The trading surfaces](./trading-surfaces.md) maps the solo stack (Radar, Coin Intelligence, Live Trade Feed, Watchlist, Mission Control); [trading arenas](./trading-arenas.md) covers tournaments, the theater, vaults, and swarms; [Oracle](./oracle.md) is the conviction engine underneath all of it
- **Trusting an agent with money?** → [Custody you can verify](./custody.md) — spend limits, freeze, Merkle proof-of-custody, and social recovery; [claim your wallet](./trader-card.md) turns any pump.fun track record into a public, provable Trader Card. Every real-funds feature sits behind the [risk acknowledgment](./risk-acknowledgment.md) — read the [Risk Disclosure](https://three.ws/legal/risk) before committing anything
- **Vetting a counterparty before you pay it?** → [Trust primitives](./trust-primitives.md) — the cross-chain Agent Reputation endpoint scores ANY wallet, mint, or agent id (Solana or EVM) 0–100 from real on-chain evidence, in one paid call, before your agent transacts
- **Want a branded on-chain address?** → [Vanity grinder](./vanity.md) — grind a Solana address that starts with your ticker (branded token mint or agent/treasury wallet) in one paid USDC call; keypair or importable mnemonic, nothing stored, optional sealed delivery, plus a provably-fair variant and a pre-ground premium inventory
- **Going Pro?** → [Paid plans](./plan-checkout.md) — upgrade with a single on-chain payment in USDC, SOL, or $THREE (the platform coin takes 20% off); [hold-to-access](./hold-to-access.md) covers the separate hold-$THREE tier ladder
- **Developer docs** → Read the [Introduction](./introduction.md) for the full technical picture
- **Your agent needs a face?** → [OKX.AI marketplace services](./okx-marketplace.md) — the Agent Identity Studio and the pay-per-call 3D services other agents buy from us; demo identities at [/agent-identities](/agent-identities)
- **Buying 3D asset work per call?** → [The 3D Asset Pipeline](./3d-pipeline.md) — pay a few cents in USDC to rig, remesh, make game-ready, stylize, or background-remove an asset; one call, one finished URL, no account or API key
- **Building UI?** → [ui-juice](./ui-juice.md) is the shared game-feel library (count-ups, sparklines, ring gauges, live dots, the "it shipped" ripple) every surface animates with
- **Teaching another AI to use three.ws?** → [The Agent Skills pack](./agent-skills.md) — portable `SKILL.md` folders that give any Claude surface (Claude Code, the Claude apps, the Agent SDK) three.ws's 3D-creation, wallet, and x402-economy skills; the 3D subset is cross-platform-safe
