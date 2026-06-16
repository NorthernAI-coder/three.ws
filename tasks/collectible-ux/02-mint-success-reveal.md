# Task: Post-Mint Reveal Page

## Goal
Create `pages/mint-success.html` — a full-screen cinematic reveal shown immediately after an agent is deployed on-chain. This is the money shot for content recording: the 3D avatar materializing on-screen with the transaction hash confirming beneath it. Nothing else exists like this in the platform today.

## URL and params

```
/mint-success.html?id=<agentId>&tx=<txSignature>&asset=<assetPubkey>&chain=<chainId>
```

All params come from the deploy redirect added in task 01. Read them with `new URLSearchParams(location.search)`.

## Page structure

Single-file implementation: `pages/mint-success.html` (inline `<script type="module">` + inline `<style>`).

### Visual layout (full viewport, dark background `#050508`)

```
┌─────────────────────────────────────────────┐
│                                             │
│          [3D avatar — large, centered]      │
│          spinning slowly on its axis        │
│                                             │
│     ✦ Agent deployed on-chain               │
│       [agent name]                          │
│                                             │
│       ◈ Solana · [short tx hash]            │
│         [View on explorer ↗]               │
│                                             │
│       [  View your agent  ]                 │
│       [  Share  ]                           │
│                                             │
└─────────────────────────────────────────────┘
```

### Entrance animation sequence (CSS transitions, no library)

1. Page loads: black screen
2. 0ms: starfield/particle canvas fades in (subtle, ~30 white dots drifting)
3. 300ms: 3D avatar fades in and begins slow rotation
4. 800ms: a soft radial glow behind the avatar pulses in (CSS radial-gradient, animated opacity)
5. 1200ms: "Agent deployed on-chain" text fades up from below
6. 1600ms: agent name fades in, larger
7. 2000ms: tx hash row fades in
8. 2400ms: CTA buttons slide up

All transitions: `opacity` + `transform: translateY` with `ease-out` curves. No jarring pops.

### 3D avatar

Fetch `/api/agents/<id>` to get the agent record. Then load the GLB:

```js
import { agentAvatarGlb } from '/src/shared/agent-3d.js';
// agentAvatarGlb(agent) returns the GLB URL

// Use three.js directly — import from the same CDN/module path used by viewer.js
// Lazy import: import('/src/viewer.js').then(({ Viewer }) => ...)
// Mount into a <canvas id="avatar-canvas"> element
// Configure: auto-rotate ON, no orbit controls (just spin), env lighting
// Model fills roughly 60% of viewport height
```

If the agent fetch fails or GLB fails to load: show a large glowing hexagon placeholder (`#4f46e5` fill) with the agent's initial letter. Never show a blank.

### Transaction display

- Chain badge: `SOLANA` in a monochrome pill
- Tx hash: first 8 + `…` + last 8 chars, monospace font
- "View on explorer" link:
  - Solana mainnet: `https://solscan.io/tx/<txSig>`
  - Solana devnet: `https://explorer.solana.com/tx/<txSig>?cluster=devnet`
  - EVM (numeric chainId): look up in `src/erc8004/chain-meta.js` CHAIN_META for explorerUrl pattern

### CTA buttons

**View your agent** → `/agent-detail.html?id=<agentId>` (or `/agent/<agentId>` if that route exists)

**Share** → Opens a native `navigator.share()` if available, else falls back to Twitter/X intent:
```
Pre-filled text:
"Just deployed my 3D AI Agent on-chain.

[agent name] is live on Solana.

three.ws/agent/<agentId>"
```
Twitter intent URL: `https://twitter.com/intent/tweet?text=<encoded>`

### Starfield canvas

Simple `<canvas>` absolutely positioned behind everything. 30–40 dots at random positions, each drifting slowly upward, wrapping. Pure vanilla JS, `requestAnimationFrame`. Keep it subtle — this is background texture, not the hero.

## Files to create
- `pages/mint-success.html` (self-contained)

## Files to read but NOT edit
- `src/shared/agent-3d.js` — to understand `agentAvatarGlb()`
- `src/viewer.js` — to import `Viewer` for the 3D canvas
- `src/erc8004/chain-meta.js` — for explorer URL patterns

## Definition of done
- Navigating to `/mint-success.html?id=<any-valid-agent-id>&tx=abc123&chain=solana-mainnet` shows the full reveal animation
- 3D avatar spins in the center with glow
- Tx hash is displayed and links to the correct explorer
- Both CTA buttons work
- Page looks polished on mobile (375px) and desktop (1440px)
- No console errors
