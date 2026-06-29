# <NN> — <Feature Title>

> **Mission (one line):** <What an agent does live, and why a viewer can't look away.>

## The watchable moment
<2–4 sentences. Describe exactly what a viewer sees on /agents-live or /agent-screen when this is live. Make it screenshot-worthy. Name the emotion: tension, delight, "how is it doing that?".>

## Who benefits
- **Viewer:** <what they get out of watching>
- **Agent owner:** <why an owner wants their agent doing this>
- **Platform:** <the second-order effect — what this unlocks or links to>

## Where it lives
- **Surface:** `/agents-live` card | `/agent-screen?agentId=…` panel | both
- **Entry points (verify these exist before editing):**
  - `pages/agent-screen.html` / `src/agent-screen.js`
  - `pages/agents-live.html` / `src/agents-live.js`
  - <other concrete files this touches>

## Data flow (source → transform → render)
1. **Source:** <real API/worker/MCP — exact endpoint or file. No mocks.>
2. **Transform:** <normalization / scoring / shaping>
3. **Transport:** <SSE via `api/agent-screen-stream.js` + `api/agent-screen-push.js`, or new endpoint>
4. **Render:** <canvas frame / 3D avatar emote / activity-log entry / HUD overlay>

## Build spec
Concrete, ordered steps. Each step names the file and what changes. No "implement the logic" hand-waving.
1. …
2. …
3. …

## Files to create / modify
- `api/…` — <purpose>
- `src/…` — <purpose>
- `workers/…` — <purpose, if a loop is involved>

## Real integrations (no mocks, ever)
- <pump.fun feed / Solana RPC / x402 USDC / aixbt / TTS / brain LLM router — the actual ones>
- Credentials: locate in `.env` / `vercel env`. If missing, ask once then proceed.

## Every state designed
- **Loading:** skeleton, not spinner.
- **Empty:** tells the viewer what's about to happen / how to trigger it.
- **Error:** actionable, with recovery — never a silent fail.
- **Populated:** the hero state above.
- **Overflow:** 0 / 1 / 1000 items, very long names, mid-action network drop.

## Definition of done
- [ ] Reachable from the live surfaces via real navigation.
- [ ] Real API calls visible in the network tab, real data rendered.
- [ ] Hover / active / focus states on every interactive element.
- [ ] All five states above implemented.
- [ ] No console errors or warnings from this code.
- [ ] Existing tests pass (`npm test`); add a test for any new pure logic.
- [ ] Verified live in a browser against `npm run dev` (port 3000).
- [ ] `git diff` self-reviewed; every line justified.

## Changelog
Append a holder-readable entry to `data/changelog.json` (tags from: feature, improvement, fix, sdk, infra, docs, security), then `npm run build:pages`.

## Non-negotiables
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never name another. Generic launcher/launch-feed plumbing that takes a runtime mint is the only exception — never hardcode or promote a non-$THREE mint.
- No mocks, no fake data, no `setTimeout` fake progress, no TODOs, no stubs.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
