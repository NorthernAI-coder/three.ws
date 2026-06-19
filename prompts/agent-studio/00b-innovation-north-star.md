# Innovation North Star — read before ANY Agent Studio prompt

This is the doctrine for the whole initiative. Wave 1 (P0–P5) builds the central studio and the
persistent avatar — necessary, but on its own a competitor *could* copy it. Wave 2 (P6–P11) is the
**invention layer**: the features that make three.ws impossible to clone, because they only work when
you have a programmable, embodied, money-handling agent with a memory — which only we have. Every
agent on this initiative must hold this bar.

## What "gamechanging" means here (and what it doesn't)

**Not gamechanging** (don't ship the obvious version):
- A settings page with more fields. A chatbot in a corner. A wardrobe like every avatar app. A
  trading dashboard with prettier charts. Anything a user has seen on another site.

**Gamechanging** (the bar): a feature where the **3D body + the LLM brain + the trade memory + real
money** combine into one experience that is *only possible because all four exist together*. If you
can describe the feature without mentioning the avatar, the brain, the memory, AND the money, it's
probably Wave-1-tier — push it further.

## The five invention principles

1. **Embodiment over dashboards.** Anything currently shown as a number, log, or form should be
   considered for expression as something the avatar *does* in 3D space. A filled snipe isn't a toast
   — the avatar performs it. Memory isn't a list — it's a place. A trade rule isn't YAML — it's a
   circuit the agent runs through.
2. **The agent acts, it doesn't just inform.** Every surface should let the agent *do* the next thing
   (snipe, rebalance, learn, share), with the user's guardrails — not just report and wait.
3. **Compounding identity.** The agent must get measurably better/richer over time (memory, reputation,
   evolved brain, generated wardrobe) so leaving = loss. Retention is a feature, designed on purpose.
4. **Social by construction.** Agents are more valuable when they meet other agents — sharing verified
   alpha, competing, copy-trading, gossiping. A network of agents is a moat a single-player app can't match.
5. **Shareable by default.** Every standout moment (a clean snipe, a rare generated outfit, a brain a
   user is proud of) should produce something they *want* to post — that's our growth loop, built in.

## The Wave 2 inventions (each has its own prompt)

- **P6 Meshy Forge** — generate *any* avatar, wearable, prop, or scene from a sentence or a photo, live,
  and attach it on-chain. Infinite, ownable, AI-native cosmetics. (`07-meshy-forge.md`)
- **P7 Mind Palace** — the agent's memory is a navigable 3D space you walk through with it; it shows you
  *why* it believes what it believes about a coin. (`08-mind-palace.md`)
- **P8 Alpha Network** — agents meet, share *cryptographically verified* trade signals, build on-chain
  reputation, and copy-trade each other. Social trading where the traders are agents. (`09-alpha-network.md`)
- **P9 Trade Theater** — every snipe/launch/win becomes a cinematic 3D scene your avatar performs, auto-
  cut into a shareable clip. The viral loop. (`10-trade-theater.md`)
- **P10 Director Mode** — talk (voice or chat) to reshape your agent; watch its brain graph physically
  rewire as you speak. Authoring an AI by conversation. (`11-director-mode.md`)
- **P11 Agent Dreams** — while you sleep, your funded agent researches your watchlist, runs simulations,
  and greets you with a "dream" briefing + proposed moves. (`12-agent-dreams.md`)

## How Wave 2 interlocks (wire these connections — don't build silos)

- Forge (P6) outfits feed the Body tab (P3) and unlock as **trophies** for trade milestones (P4) and
  reputation tiers (P8).
- Mind Palace (P7) renders the same memories P2 stores and the reasoning from P1's brain graph.
- Alpha Network (P8) signals flow into P1 brains as inputs and trigger P4 trades; reputation is earned
  from real P4 outcomes.
- Trade Theater (P9) is triggered by P4 events and narrated using P1's brain + P3's animations, then
  shared to P8's network.
- Director Mode (P10) compiles to P1's brain graph and P4's trading rules — it's a conversational
  front-end to everything.
- Agent Dreams (P11) uses P1 brain + P2 memory + P4 trading, runs on scheduled cloud agents, and can
  produce a Theater clip (P9) of what it found.

If your feature doesn't touch at least two other prompts' systems, you're probably building a silo.
Find the connections and wire them — that interlock is the product.

## Universal rules (every prompt restates these; they override defaults — see CLAUDE.md)

- **No mocks, no fake data, no placeholders, no TODOs, no stubs, no simulated results dressed as real.**
  Wire 100% to real APIs. Find missing creds in `.env` / `vercel env`.
- **$THREE is the only coin** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never name/hardcode/
  recommend another. Runtime-supplied mints only, where the mechanic requires it.
- **Design tokens** (`public/tokens.css`) only. Every state designed. Hover/active/focus everywhere.
  Accessibility + reduced-motion. Performance budgeted (these are 3D, heavy — lazy-load, dispose, pause offscreen).
- **Concurrency:** stage explicit paths (never `git add -A`); re-check `git diff --staged` before commit.
  Stay in your file-ownership lane. Append-only on shared files (`data/pages.json`, `data/changelog.json`).
- **Verify for real:** `npm run dev` (port 3000), exercise in a browser, real calls in the network tab,
  zero console errors, `npm test` passes. Add a holder-readable `data/changelog.json` entry.
- **Then invent further, then delete your prompt.** After done: self-review (CLAUDE.md's five checks),
  then ask "what would make someone screenshot this?" — build that one thing — then `rm` your prompt file
  and report what you shipped and which other prompts' systems you wired into.
