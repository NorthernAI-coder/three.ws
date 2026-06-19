# P5 — Living Presence (the avatar is alive on every page)

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md` and
`STRUCTURE.md` first. **Prerequisite:** P0 (`01-foundation.md`) is merged — `<agent-presence>` and
the `studio` store (with `emitMarket`/`onMarket`) exist. Read the "Integration notes for P1–P5" at
the top of `src/studio/agent-studio-store.js`.

## The vision you are enabling

Our core product principle: **the user's 3D agent is present on every page**, reacting to what's
happening, so the platform feels alive and the user stays engaged. Studio (P0–P4) is where the agent
is authored; **your job is to make that agent show up and behave everywhere else** — the launch feed,
the trading views, discovery, the snipe terminal, the dashboard, the changelog — as a companion that
emotes, comments, and acts in context. This is the difference between "a website with a mascot" and
"a living agent that lives with you." Make it feel inevitable, not gimmicky.

## Your mission

### 1. Mount the presence site-wide
- Place `<agent-presence>` across the platform's pages (`pages/*.html` + their `src/*.js` entry
  points). Pick the right `mode` per surface: `mini` floating companion on dense data pages, larger
  `companion` where the avatar is contextually central. Respect the existing nav/shell
  (`src/next-layout.js`, `public/nav.html`) — integrate, don't fight it.
- The companion is **the same agent** the user edits in Studio (one identity, one source of truth via
  `studio`). Editing in Studio → presence updates live, no refresh.
- It must be **opt-out-able and unobtrusive**: draggable, dismissible to a small bubble, position +
  state remembered per user, never covering critical UI, never blocking interaction. Respect
  `prefers-reduced-motion`. Pause rendering when offscreen/tab hidden (P0 set this up — honor it).

### 2. Make it react to real events (the magic)
- Subscribe to real platform signals and translate them into avatar behavior using the existing
  emotion blend + animations (`src/agent-avatar.js`, the event→animation map P3 stored in
  `meta.studio.body`) and the events P4 emits via `studio.emitMarket`:
  - `snipe:filled` / big win → celebrate + a short, real spoken/typed callout.
  - `position:down` / dump / failed tx → concern + a useful prompt ("cut or hold?").
  - new launch matching the user's watchlist/brain filters → alert + "want me to snipe?".
  - incoming agent-to-agent message / DM → notice + summarize.
- Reactions must be driven by **real data** (real RPC/feed/launch/trade events already in the repo —
  pump.fun feed, Solana RPC, the trade events from P4). No fake/random "ambient" events dressed up as
  real signals. Idle behavior (breathing/micro-moves via `src/idle-animation.js`) is fine between
  real events.

### 3. Context-aware behavior per page
- The companion adapts to where the user is: on a coin/launch page it watches that mint and offers
  one-tap actions through the agent's real wallet/trading config (P4); on discovery it can comment on
  what it "remembers" (P2); on the dashboard it surfaces the agent's status. Always provide a one-tap
  path back to `/studio` to edit the relevant aspect.
- Voice/lip-sync is already available — use it sparingly and tastefully (default muted, user enables).

## Definition of done
- The user's live agent renders on every major page in an appropriate mode, performant (no scroll
  jank, shared/cached WebGL context, paused when hidden), with real edits reflecting instantly.
- Reactions fire from **real** market/trade/platform events and map to real emotions/animations.
- Companion is draggable, dismissible, position-remembered, reduced-motion-aware, never blocks UI,
  fully keyboard accessible, with ARIA.
- Context actions (snipe/watch/back-to-studio) are wired to the real P2/P4 surfaces — no dead buttons.
- All states designed (no agent yet → "create your agent" CTA; reconnecting; muted). No console errors;
  `npm test` passes; network tab shows real event sources. Changelog entry added.

## Operating rules (override defaults)
No mocks/stubs/TODOs/fake events/random ambient signals presented as real. $THREE is the only coin
promoted; coin pages use runtime mints only. Design tokens only. Stage explicit paths (never
`git add -A`); re-check `git diff --staged` before commit — you touch many shared page files, so be
surgical and append-only where others may be editing. Own `src/presence/**`; mount points across
pages. Consume P3's event→animation map and P4's market events via the `studio` contract; do not
rewrite the `<agent-presence>` element P0 owns — extend it through its documented API.

## When finished
Self-review (CLAUDE.md's five checks). Then add the unforgettable touch — e.g. the companion
"narrating" a live snipe as it executes, or a subtle cross-page continuity where the agent finishes a
thought it started on the previous page, or a daily "your agent's recap" the avatar presents. Build
it. Then **delete this prompt file** (`prompts/agent-studio/06-living-presence.md`) and report what
you shipped + which pages now host the presence and the full event→reaction mapping.
