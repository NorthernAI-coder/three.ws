# C6 — Learn, chat & pay surfaces to the bar

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:** none.

## Why this matters for $1B

Docs, tutorials, the glossary, and "what is three.ws" are the **onboarding and ecosystem**
surfaces — the pages that turn a curious visitor into a user and a user into a builder. Per
the $1B thesis, an outside developer must go from zero to a working integration in 10 minutes
using these pages; a docs surface with a dead anchor, a broken copy-button, or no search reads
as an abandoned project. Chat is the conversational front door (the talking page guide, the
avatar chat); pay is a **money surface** where x402/$THREE payments settle — a payment page
with an undesigned pending/failed state is a trust leak on the most sensitive interaction
there is. These pages must be the most polished on the platform, because they set expectations
for everything else.

## Surfaces in scope (the real pages)

- **Docs:** `/docs` → `docs/index.html` (and the docs sub-pages it links) — the developer
  reference and quickstart
- **Tutorials:** `pages/tutorials.html`; single tutorial `pages/tutorial.html`
- **Chat:** `/chat` → `chat/index.html` → `api/chat.js` (and `api/chat/proxy.js`,
  `api/brain/chat.js`); avatar chat `pages/avatar-wallet-chat.html`
- **Pay:** `/pay` → `public/pay/index.html` → x402 / payment endpoints
  (`api/x402-checkout`, `public/x402.js`, `public/x402-pay-core.js`)
- **Avatar SDK page:** `pages/avatar-sdk.html` — the SDK landing/quickstart
- **Glossary:** `pages/glossary.html` → `src/glossary/`
- **What is three.ws:** `pages/what-is.html`
- **AR:** `pages/ar.html` → `src/forge-ar.js` (AR view-in-space surface)
- Data sources: `api/chat.js`, the x402/payment endpoints, the docs/tutorial content.

## Current state (read before you write)

Docs/tutorials/glossary/what-is are largely static content; chat and pay are live. The gaps to
find: **docs/tutorials** missing on-page search, a working copy-to-clipboard on every code
block, anchor links that all resolve, a "you're on the latest" freshness signal, and a
designed 404/empty for a missing doc; **chat** missing a streaming-response state, an empty
"start the conversation" state, a typing indicator from the **real** stream (no `setTimeout`
fake typing), and an error/retry on a failed `api/chat.js` call; **pay** missing a full
payment state machine (idle → awaiting signature → settling → settled → failed-with-recovery)
and an honest "did not go through, funds safe" state. Audit **overflow**: a 200-message chat,
a doc page with a huge code block, a glossary of 1000 terms, a payment for $0.000001 vs a
large amount.

## Your mission

### 1. Audit every surface for the five states
**Loading** = skeleton for docs/chat history; honest streaming status for chat; real awaiting
state for pay. **Empty** = "start the conversation" for chat, a "search the docs / popular
guides" for an empty docs landing, a designed "nothing here yet" for a missing tutorial.
**Error** = chat/pay failures named in plain language with retry; a designed docs 404.
**Populated** = token-consistent typography and code styling with microinteractions.
**Overflow** = long chats, huge code blocks, big glossaries, tiny-to-large payment amounts.

### 2. Make docs and tutorials a 10-minute on-ramp
Every code block has a working copy button; every anchor/cross-link resolves (no dead
fragments); add on-page search/filter to the glossary and docs if absent; surface a clear
quickstart path from the avatar-sdk page into the docs. This maps to `00b-the-bar.md` §6 —
zero-to-integration in 10 minutes.

### 3. Chat: honest streaming and recovery
Wire the chat UI to the **real** `api/chat.js` stream — a real typing/streaming indicator,
token-by-token render where supported, an empty starter state with example prompts, and an
error/retry on stream failure. No faked typing, no spinner that never resolves.

### 4. Pay: a complete, honest payment state machine
The pay surface gets a full state machine on the **real** x402/payment flow: idle → awaiting
signature → settling → settled (with receipt/link) → failed (with a "funds safe, here's what
happened" recovery). Confirm settlement before claiming success. `$THREE` and x402 USDC are
the only payment rails referenced.

### 5. Mobile, a11y, microinteractions, tokens
All four surfaces work at **320 / 768 / 1440px** (docs nav collapses, code blocks scroll, chat
composer stays reachable above the keyboard). Full keyboard nav, labelled inputs, `aria-live`
for chat/pay status, focus management on the chat composer, contrast ≥ WCAG AA. Honor
`prefers-reduced-motion`. Replace hardcoded colors/spacing/fonts with `public/tokens.css`
tokens; every interactive element gets hover, active, and focus states.

## Definition of done

Clears `00b-the-bar.md` §3 (five states, responsive, a11y), §6 (10-minute on-ramp from docs),
§1 (pay path idempotent with honest failure recovery). Inherits the **global definition of
done** in `00-README-orchestration.md`: real APIs only, `$THREE` the only coin, tokens only,
verified in a browser at `npm run dev` with zero console errors from your code and real
network calls (real chat stream, real payment flow), existing tests pass (the
`x402-checkout` tests included). State which bars you cleared and how you verified each.

## Operating rules (override defaults)

No mocks / fake data / placeholders / TODOs / stubs / sample arrays / faked typing or progress.
`$THREE` (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) is the only coin — never name another
token in docs, glossary, copy, or examples; x402 USDC is a payment rail, not a promoted coin.
Design tokens only (`public/tokens.css`). Stage explicit paths only (never `git add -A`); check
`head -1` of any `api/*.js` you touch for the `__defProp` bundle trap (the `api/x402-checkout`
and `public/x402*.js` files are live — review their diffs carefully). Own **only the pages
listed here**; extend, don't rewrite, the shared nav/tokens.

## When finished

Run `CLAUDE.md`'s five self-review checks. Ship one improvement (e.g. on-page docs search, a
shared copy-button component, or example prompts on the empty chat state). Append a
holder-readable `data/changelog.json` entry if user-visible (`npm run build:pages` to
validate). Then delete this prompt file
(`prompts/production-campaign/C-surfaces/C6-learn-chat-pay-surfaces.md`) and report what you
shipped, which bars you cleared and how you verified them, and any seam for the next agent.
