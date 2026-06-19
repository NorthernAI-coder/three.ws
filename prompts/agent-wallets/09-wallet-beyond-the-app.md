# Task 09 — The Wallet Beyond the App (embeds, IRL/AR, web component, share)

> **Read [00-README-orchestration.md](./00-README-orchestration.md) first** for the
> ownership model, design tokens, real APIs, hard rules, definition of done, and the
> "improve then delete this file" close-out. Extends the shared wallet component
> (**task 01**) and HUD (**task 02**) to every surface that lives *outside* the main
> app shell.

## Mission

The user's ask was literal: **every single surface where an avatar is visible** must
carry its wallet identity — not just in-app pages. That includes the surfaces other
tasks don't reach: the embeddable `<agent-3d>` web component on third-party sites, the
avatar SDK viewer, IRL/AR mode, the walk/play 3D world, the chat app, and shareable
links. This task carries the wallet to all of them and invents the moments unique to
each — tap-to-tip in AR, a wallet you can drop on any website, a share card that *is*
the wallet. Wherever the avatar's face shows, its wallet shows.

Every balance, address, and tip here is real. No surface gets a degraded fake version
"because it's just an embed."

## The surfaces to cover (audit, don't assume — grep for each)

1. **The `<agent-3d>` / `<agent-stage>` web component**
   ([src/element.js](../../src/element.js), [src/stage-element.js](../../src/stage-element.js))
   and the **avatar SDK viewer** ([avatar-sdk/src/viewer.js](../../avatar-sdk/src/viewer.js),
   [src/avatar-sdk-page.js](../../src/avatar-sdk-page.js)). Add an opt-in wallet
   affordance (attribute-driven, e.g. `wallet` / `wallet="tip"`) so anyone embedding
   an agent on any site gets a real, working wallet chip + tip/deposit. It must be
   self-contained (shadow DOM, no app globals), read real data from the public wallet
   endpoints, and respect viewer role (embeds are almost always the visitor view:
   tip + "open on three.ws", never owner controls).
2. **IRL / AR mode** ([pages/irl.html](../../pages/irl.html),
   [src/irl/discovery.js](../../src/irl/discovery.js)). Invent **tap-to-tip in the
   real world**: a real QR / deep link to the agent's wallet, a one-tap tip from a
   connected wallet, the agent's vanity address shown as its real-world identity. A
   real moment — you meet an agent IRL and can pay it on the spot.
3. **Walk / play 3D world** ([pages/walk.html](../../pages/walk.html),
   [src/walk.js](../../src/walk.js),
   [multiplayer/src/rooms/WalkRoom.js](../../multiplayer/src/rooms/WalkRoom.js)).
   Approaching another player's agent reveals its wallet identity (vanity address,
   tip) in-world. Tipping an agent you walk up to is a delightful, real interaction.
   Keep it performant — this is a live multiplayer render loop.
4. **Chat app** ([chat/src/AgentPicker.svelte](../../chat/src/AgentPicker.svelte),
   [chat/src/AvatarIcon.svelte](../../chat/src/AvatarIcon.svelte),
   [chat/src/AvatarPreview.svelte](../../chat/src/AvatarPreview.svelte)). The agent you
   chat with shows its wallet identity; tip it for a good answer. Bridge the shared
   wallet logic into the Svelte components (wrap the shared module — don't fork its
   logic).
5. **Shareable wallet** — a real OG share card and a public, link-addressable wallet
   view. Reuse/extend `/api/agent-share` to render a real card (avatar + vanity
   address + real headline stat like tips received or volume). "Share my wallet"
   produces a real link/image that brings people back to tip or fork.

## Real APIs

Public reads (no auth) power the visitor/embed view: `GET /api/agents/:id/solana`
(address + balance), `/solana/holdings`. Tips: `POST /api/agents/:id/solana/tip`
(plus the real on-chain transfer from the tipper's connected wallet where applicable).
Share: `/api/agent-share`. Auth/CSRF for any owner action follows the existing
patterns (see task 02). If an embed needs a tiny CORS-safe public endpoint that
doesn't exist, build it for real with rate limiting — never expose anything beyond
public address/balance, and never a secret.

## Ownership & roles

- Embeds, IRL, walk, chat are overwhelmingly the **visitor** context: tip + "open on
  three.ws" + (for a signed-in non-owner) fork-to-own. Owner controls
  (withdraw/limits/vanity/trade) **must not** render or be reachable from an untrusted
  embed — only the owner, authenticated on three.ws itself, gets those.
- Across origins, never trust a host page to assert identity. Role is derived from the
  real session/auth on three.ws; an embed cannot grant owner powers.

## Innovation mandate

- **The wallet is portable** — an agent's wallet works the same on a stranger's blog,
  in AR, and in the 3D world. That portability is the product: the agent's financial
  identity follows its face everywhere.
- **IRL tipping is a genuinely new moment** — meeting an autonomous agent in physical
  space and paying it. Make the QR/deep-link → tip flow flawless and fast.
- **The share card is a growth loop** — a wallet worth screenshotting that links back
  to tip or fork. Coordinate with the Money Pulse (task 07) so standout moments share
  themselves.
- Invent past this where it raises the bar — but an embed/AR/world wallet is a *real*
  wallet with real balances and real tips, never a stripped placeholder.

## States & edge cases

Embed offline / API blocked by CORS (degrade to a clean static identity + "open on
three.ws", never a broken widget); embed of a private/deleted agent; AR with no
camera / denied permission; a tipper with no connected wallet (clear connect prompt);
walk world with many agents (don't fetch N balances at once — lazy/batched, reuse task
01's strategy); chat with a long agent list; very long vanity addresses on a tiny
embed; 320/768/1440 and a 200px embed.

## Definition of done

Per the orchestration README. Plus: the `<agent-3d>` web component renders a real,
self-contained wallet chip + working tip on a bare test page (`examples/`); IRL mode
shows a real tap-to-tip with a real address/QR; the walk world reveals an agent's
wallet in-world without jank; the chat app shows the shared wallet identity; "share my
wallet" produces a real OG card/link; owner controls never leak into any untrusted
embed; balances are real and lazy-hydrated; no console errors; responsive down to a
small embed. No non-$THREE coin named or promoted.

When done: self-review + improvement pass, real changelog entry,
`npm run build:pages`, commit (explicit paths only; both remotes if asked), then
**delete this file** (`prompts/agent-wallets/09-wallet-beyond-the-app.md`).
