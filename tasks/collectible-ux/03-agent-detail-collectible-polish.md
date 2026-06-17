# Task: Agent-Detail Collectible Polish

## Goal
`pages/agent-detail.html` / `src/agent-detail.js` currently reads as a feature dashboard. It needs to feel like a premium collectible page — something you'd screenshot and share. The 3D avatar should be the hero, the on-chain provenance should be unmissable, and the overall visual weight should say "this is yours."

This task does NOT add new data sources. It reorganizes and elevates what's already there.

## Key files
- `pages/agent-detail.html` — markup + skeleton CSS
- `src/agent-detail.js` — render logic
- `src/agent-detail.css` — styles

## Changes

### 1. Hero layout — 3D avatar takes the top

Currently the avatar is a small left-aligned element. Rework the hero section:

```
┌─────────────────────────────────────────────────┐
│  [full-width gradient banner — subtle, dark]    │
│                                                 │
│        [3D avatar — centered, 280px tall]       │
│             slow auto-rotate                    │
│                                                 │
│        Agent Name                               │
│        [on-chain badge]  [chain pill]           │
│                                                 │
│        [description — max 2 lines, truncated]   │
└─────────────────────────────────────────────────┘
```

- Avatar container: `min-height: 280px`, centered, no left float
- If the agent has a GLB (via `agentAvatarGlb()`), mount the Viewer with auto-rotate and disable orbit controls (display only, not interactive — tap/click opens a fullscreen modal)
- If no GLB: the existing gradient-initial SVG fallback, but larger (168px → 280px)
- The gradient banner behind the avatar: pull from the agent's name-based GRADIENTS array, use as a subtle radial glow (`background: radial-gradient(ellipse at center, ${c1}22 0%, transparent 70%)`)

### 2. On-chain provenance badge — prominent and glowing

The existing `onchainBadgeEl` is small and easily missed. Elevate it:

- Render it directly below the agent name as a pill with a pulsing dot animation (CSS):
  ```css
  .ad-onchain-live::before {
    content: '';
    display: inline-block;
    width: 7px; height: 7px;
    border-radius: 50%;
    background: #10b981;
    margin-right: 6px;
    animation: pulse-dot 2s ease-in-out infinite;
  }
  @keyframes pulse-dot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.7); }
  }
  ```
- Show the chain name (Solana, Base, etc.) as an adjacent pill
- If the agent is NOT on-chain yet (owner viewing their own undeployed agent), show a "Deploy on-chain" CTA pill instead that scrolls to the deploy section

### 3. Share button — visible, above the fold

The existing `showSharePanel` call exists but the button is buried. Add a share icon button to the hero row (top-right corner of the hero section, floating):

```html
<button class="ad-share-btn" aria-label="Share this agent" title="Share">
  <!-- SVG share icon -->
</button>
```

On click: call the existing `showSharePanel` with agent data. Ensure the share URL is `https://three.ws/agent/<id>` and the pre-filled text is:
```
[agent name] — a 3D AI Agent deployed on-chain.
Explore it on three.ws: https://three.ws/agent/<id>
```

### 4. Fullscreen 3D viewer modal

When user taps/clicks the avatar, open a fullscreen dark overlay with:
- The Viewer instance (same GLB) in full orbit-controls mode
- An ✕ close button (top right)
- "View in AR" button if `seeInWorldHref` returns a valid URL

This is a lightweight modal (no library). Inject it into `document.body` on first tap, destroy on close.

### 5. Visual cleanup

Remove or visually demote these elements on the initial view (they can still exist further down the page):
- "Embed code" section — move below the fold, collapse by default behind a "Developers →" disclosure
- Raw wallet address display — keep for owners but visually subdued (monospace, muted color, small font)
- The `ad-card` grid structure — keep the card structure but increase card `border-radius` to 16px and add a subtle `box-shadow` to lift them off the page

## What NOT to change
- The data sources — same API calls, same fetches
- The deploy button section — separate task (01)
- The launch history section — leave as-is
- The validation badge logic

## Definition of done
- The 3D avatar is the first thing you see, centered, auto-rotating
- The on-chain badge is immediately visible with a pulsing green dot
- Share button is in the hero, above the fold
- Tapping the avatar opens the fullscreen 3D viewer
- The page looks like a collectible card, not a dashboard
- No console errors, no regressions on existing functionality
- Works on mobile (375px) and desktop

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/collectible-ux/03-agent-detail-collectible-polish.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
