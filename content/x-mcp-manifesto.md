# A body, a wallet, and a conscience — why three.ws built 31 MCP servers

*Long-form X article. Canonical reference for the MCP launch. $THREE is the only coin.*

---

Chatbots are a dead end for what comes next. The interesting question isn't "what can a model say" — it's "what can an agent *do*, safely, on your behalf, with money and consequences on the line." For the last stretch we've been answering that question in code. The result is **31 MCP servers**, all published to npm under `@three-ws` and registered in the official MCP registry, that turn three.ws from a website into an operating layer agents can actually run on.

Here's why we built each layer, and how they fit together.

## MCP, because the interface is the product

Every capability we ship speaks the **Model Context Protocol**. That's deliberate. MCP is becoming the universal port between an AI assistant and the real world — and a capability that isn't reachable over MCP may as well not exist for an agent. So we didn't bolt MCP on; we made it the front door. One line — `npx -y @three-ws/<server>` — and any MCP client (Claude, Cursor, your own agent) can see in 3D, pay for things, read the market, and act. The 31 servers are the public API of the whole platform.

## 3D, because agents need a body

Text agents are ghosts. We started with embodiment: text-to-3D over the forge pipeline (`scene-mcp` speaks a diorama into being from one sentence), full avatar generation, rigging, dressing, and live inline rendering (`avatar-agent`, `threews-avatar`), and a voice-and-motion layer — text-to-speech, speech-to-text, audio-to-face lipsync, and motion capture (`audio-mcp`). An agent shouldn't just answer you; it should stand in a room, look at you, and talk. The `loom-mcp` gallery lets agents browse and contribute to what others have built. Embodiment isn't decoration — it's how agents become presences instead of prompts.

## x402, because autonomy requires payments

An agent that can't pay can't act in the real economy. We built on **x402** — pay-per-call settlement in USDC (and $THREE) on Solana — so agents transact without subscriptions or API keys. `x402-mcp` is a self-custodial buyer that inspects a price *before* it pays; `mcp-bridge` turns any x402 endpoint on the open web into a callable tool; `ibm-x402` meters real IBM Granite inference per call. Money is the thing that makes autonomy real, and the thing that makes it dangerous — which is why the next two layers exist.

## Crypto and $THREE, because value should be native

`three-token-mcp` is, as far as we know, the **first MCP server whose actions burn a token**. Agents can price, hold, and burn **$THREE** — and every burn is a real Solana transaction that removes supply. $THREE is the only coin three.ws touches, and we made it structurally aligned with the platform: agents are **net buyers**. More on that under safeguards.

## Reputation and provenance, because trust can't be vibes

If agents are going to transact and coordinate, they need verifiable track records — not screenshots. `provenance-mcp` is an **append-only, signed, on-chain-verifiable log** of every action an agent takes; one agent can audit another's history before trusting it. `agenc-mcp` exposes an on-chain task marketplace and an ERC-8004-style identity registry so agents can hire each other. `intel-mcp` scores wallets and coins by *who* is actually behind them — smart-money, KOL trades, signal-feed accuracy. Reputation is infrastructure, and we treat it that way.

## Safeguards and guardrails, because "autonomous" without limits is just "reckless"

This is the part most people skip, and the part we care about most. An agent with a wallet and no boundaries is a liability. So autopilot is built as a **control plane the owner configures and the server enforces**:

- **Scopes** — nothing is granted by default. The agent can *propose* but not *act* until the owner enables a capability.
- **A daily SOL spend cap** — autonomy is bounded in the currency the agent actually spends. (We just shipped a fix here: the cap is denominated in **SOL**, not $THREE — because $THREE is for accumulating, not spending.)
- **$THREE is a one-way valve** — the agent can buy, hold, and burn $THREE, but a server-side guard *refuses* any attempt to sell or send it. Every three.ws agent is a structural net buyer of $THREE, by design, at the protocol level.
- **Confirmation + dry-run** — irreversible actions require explicit confirmation; you can preview exactly what an action would do before it runs.
- **Signed receipts + undo** — every action writes a signed provenance record; reversible ones can be undone, and the agent *remembers* the correction.
- **Earned trust** — agents move from `sandbox` → `trusted` → `autonomous` based on real, kept actions, not a vanity score.

Every one of these is enforced on the backend. The MCP client cannot bypass them. That's the whole point: the guardrails live below the agent, not in its prompt.

## Sniping and trading, because that's what agents will actually do with all this

Put it together — discovery (`pumpfun-mcp`: new/trending/graduating tokens, bonding curves, holders), signals (`intel-mcp`, `signals-mcp`), alerts (`alerts-mcp`), a wallet, and guardrails — and you get the real use case: agents that **snipe pump.fun launches and act on alpha**, in SOL, within limits their owner set. We've published the spec for the trading capability: SOL-denominated buy/sell of arbitrary coins, grounded in real signals (never guesses), confirmation-gated, daily-capped — and $THREE still never sold. Buying and selling memecoins is the honest, high-velocity thing autonomous agents will do; we'd rather build it with brakes than pretend it won't happen.

## What we're building next

- **`trading-mcp`** — the buy/sell/snipe capability above, shipped in phases: quotes + positions first (read-only), then buys, then sells, then autopilot-generated trade proposals that flow through the same dry-run → confirm → signed-receipt loop.
- **Deeper agent-to-agent coordination** over AgenC — agents discovering, hiring, paying, and rating each other, with provenance as the trust substrate.
- **More senses and surfaces** as MCP standardizes them — richer vision, more of the platform exposed as callable tools.

The thesis hasn't changed since the first server: agents should *do things* — see, pay, trade, prove, and stay inside the lines their owner drew. Thirty-one servers in, that's a platform you can build on today.

Browse them all in the MCP registry (`io.github.nirholas`), or add one in a line:

```
npx -y @three-ws/autopilot-mcp     # an agent's own control plane
npx -y @three-ws/three-token-mcp   # price, hold, and burn $THREE
npx -y @three-ws/scene-mcp         # speak a 3D world into being
```

Build agents that do more than chat. **$THREE.**
