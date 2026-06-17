# Task: Dynamic OG Image for Agent Collectible Pages

## Goal
When someone shares a link to `https://three.ws/agent/<id>`, the Twitter/X card and Discord/Slack unfurl should show the agent's actual avatar image — not the generic three.ws OG image. This makes every shared link a visual proof of the collectible's existence.

Right now `pages/agent-detail.html` has static OG meta tags that never change regardless of which agent is being viewed.

## What to build

### 1. Vercel function: `api/og/agent.js`

Generates a static PNG for a given agent ID using only node-canvas or Vercel's `@vercel/og` (satori + resvg, already available in the Vercel runtime).

```
GET /api/og/agent?id=<agentId>
→ image/png  (1200×630)
```

Layout of the generated image:

```
┌──────────────────────────────────────────────────┐
│ [dark background gradient — #050508 → #0f0f18]  │
│                                                  │
│   [avatar image — 300×300, centered left]        │
│                          [agent name — large]    │
│                          [3D AI Agent]           │
│                          [three.ws]              │
│                                                  │
│   ◈ On-chain · Solana                            │
└──────────────────────────────────────────────────┘
```

Implementation notes:
- Fetch the agent record from `GET /api/agents/<id>` internally (same-origin fetch using `process.env.VERCEL_URL` or a hardcoded `https://three.ws`)
- The avatar is a 2D PNG/JPG image (`agent.avatarImage` or the `/api/avatars/<avatarId>` endpoint). Do NOT try to render GLB in a serverless function — use the flat image.
- If no avatar image: render the gradient-initial SVG (same as the fallback in agent-detail.js — a colored rectangle with the agent's first letter)
- Use `@vercel/og` (ImageResponse from `next/og` or `@vercel/og`) — it's available in Vercel Edge Functions with zero setup
- Cache headers: `Cache-Control: public, max-age=3600, s-maxage=86400`
- On any error: return the static `/og-image.png` (redirect or stream it)

Check `api/` for any existing OG generation patterns to follow before writing from scratch.

### 2. Update `pages/agent-detail.html` meta tags to be dynamic

The static meta tags in the `<head>` get overwritten by `src/agent-detail.js` once the agent loads. But for unfurling bots (which don't run JS), the meta needs to be server-rendered.

The current page is static HTML. We have two options — choose option A:

**Option A: Vercel rewrite rule (simplest, no SSR)**

In `vercel.json`, add a rewrite so that requests to `/agent/<id>` get a thin server-rendered HTML shell:

```json
{
  "rewrites": [
    { "source": "/agent/:id", "destination": "/api/agent-page?id=:id" }
  ]
}
```

Create `api/agent-page.js`:
- Fetches `/api/agents/<id>`
- Returns the full `pages/agent-detail.html` content but with the OG meta tags replaced:
  ```html
  <meta property="og:title" content="[agent name] · three.ws" />
  <meta property="og:description" content="A 3D AI Agent deployed on-chain. Explore it on three.ws." />
  <meta property="og:image" content="https://three.ws/api/og/agent?id=[id]" />
  <meta name="twitter:image" content="https://three.ws/api/og/agent?id=[id]" />
  ```
- Everything else in the HTML stays exactly the same
- If agent fetch fails, return the unmodified static HTML (same as today)
- Read `pages/agent-detail.html` at startup using `fs.readFileSync` (Vercel bundles this at build time)

Check `vercel.json` for existing rewrite patterns and follow them.

### 3. Update `pages/agent-detail.html` — add canonical tag

Add to the `<head>`:
```html
<link rel="canonical" href="https://three.ws/agent/AGENT_ID" />
```

`src/agent-detail.js` should update this once the agent ID is known:
```js
const canonical = document.querySelector('link[rel="canonical"]');
if (canonical) canonical.href = `https://three.ws/agent/${agent.id}`;
```

## Files to create
- `api/og/agent.js` — OG image generator
- `api/agent-page.js` — SSR shell for meta tags

## Files to edit
- `vercel.json` — add the `/agent/:id` rewrite (check existing rewrites carefully, don't break anything)
- `pages/agent-detail.html` — add canonical tag, update twitter:card to `summary_large_image` if not already
- `src/agent-detail.js` — update canonical href

## Files to read before editing
- `vercel.json` — understand existing routes
- `api/` — scan for existing OG or SSR patterns
- `pages/agent-detail.html` full head section

## Definition of done
- `GET /api/og/agent?id=<valid-id>` returns a 1200×630 PNG with the agent's name and avatar
- Sharing `https://three.ws/agent/<id>` on Twitter shows the agent-specific card image (verify with Twitter Card Validator or by inspecting the returned HTML head)
- No regressions in the existing agent-detail page functionality
- No console errors

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/collectible-ux/04-og-image-dynamic.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
