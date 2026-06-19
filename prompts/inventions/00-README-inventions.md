# Program: Inventions — things no other platform has

> **Read this file in full before starting any task in this folder.** Every prompt
> here (`01-*` … `07-*`) assumes the context below. Do not re-derive it.

## The mandate

This is **not** a "build the features competitors have, but nicer" program. This is
an **invention** program. Every task here must produce something that **does not
exist anywhere else** — a capability that is only possible because of what three.ws
uniquely is, and that a user would switch platforms to get.

If you find yourself building a generic wallet/trade/chart that Phantom, Axiom,
Photon, Bullx, or a CEX already has — **stop**. That is table stakes, covered by the
sibling wallet program (`prompts/agent-wallets/`). Your job is the thing on top of
that which no one can copy without our stack.

Hold this bar literally: **would this make a trader screenshot it and say "wait,
how is this possible?"** If not, raise the bar until it would.

## Our unbeatable, unique combination (this is the source of every invention)

No competitor has all of these in one place. Inventions come from **fusing** them:

1. **Every agent is a 3D avatar with a face, persona, and voice.** Not a row in a
   table — a character. ([avatar-sdk/](../../avatar-sdk),
   [character-studio/](../../character-studio), voice fields on `agent_identities`.)
2. **Every agent has its own custodial wallet** (Solana + EVM), owned by whoever
   created that instance. ([api/_lib/agent-wallet.js](../../api/_lib/agent-wallet.js).)
3. **Every agent has a verifiable on-chain identity** (ERC-8004) and can hold,
   spend, and be paid. ([contracts/](../../contracts), `erc8004_agent_id`.)
4. **Agents have a real LLM persona** that can reason in-character (Anthropic via
   worker proxies — see the worker proxy pattern; default to the latest Claude
   models per the platform's `claude-api` reference).
5. **Real Solana + pump.fun rails** — launches, swaps, holders, bonding curves.
   ([api/_lib/agent-pumpfun.js](../../api/_lib/agent-pumpfun.js).)
6. **Multiplayer 3D rooms** — agents can share a space.
   ([multiplayer/](../../multiplayer).)
7. **An agent-to-agent payment + skill protocol** (x402, skill licenses, MCP).
   ([agent-payments-sdk/](../../agent-payments-sdk),
   [mcp-server/](../../mcp-server).)
8. **Text/photo → 3D generation** via the Meshy integration available to the
   platform (real resource — use it, don't fake it).

A wallet is common. A wallet *that belongs to a 3D character with a verifiable
trading reputation, a persona that narrates its own alpha, that other users can
back, that pays other agents autonomously, and that you can mint from a selfie in
60 seconds* — that is ours alone. Build that.

## The ownership model (already implemented — never violate it)

You own the wallet of the avatar you created. Forking/saving someone else's avatar
mints a **new** wallet owned by the forker; secrets are never copied; one agent =
one owner (`agent_identities.user_id`, immutable). Custodial keys are AES-256-GCM
encrypted, decrypted only at signing, every decrypt audited. Full detail in
[../agent-wallets/00-README-orchestration.md](../agent-wallets/00-README-orchestration.md).
Distinguish three viewer roles everywhere: **owner**, **visitor**, **logged-out**.

## Do NOT rebuild the wallet program

The sibling program `prompts/agent-wallets/` already builds: the ubiquitous wallet
identity chip, the Wallet HUD (deposit/withdraw/limits/custody), the Vanity Studio,
fork-to-own, and a base sniper/trade co-pilot. **Consume those**, don't duplicate
them. If your invention needs a wallet surface, import the shared component from
`src/shared/`. If it needs a base trade action, reuse the co-pilot's. Your value is
the layer **above** them.

## Hard rules (from CLAUDE.md — non-negotiable)

- **No mocks. No fake data. No placeholders. No sample arrays. No `setTimeout` fake
  progress. No TODOs/stubs/commented-out code.** Every number, every event, every
  trade, every reputation score traces to a real API / real chain / real DB row you
  can see in the Network tab. If there is no data yet, design the real empty state.
- **The only coin is `$THREE`** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).
  Never name, hardcode, market, or recommend any other token anywhere — code,
  copy, fixtures, commits. Inventions that touch arbitrary launches (radar, vaults,
  economy) operate on **runtime-supplied mints only** (the sanctioned plumbing/
  launch-records exception); never hardcode or promote a specific non-$THREE mint.
  $THREE is the only coin the platform itself features.
- **Real money, real care.** Anything that moves funds is owner-gated in the UI
  **and** server-side, spend-policy-enforced (`api/_lib/agent-trade-guards.js`),
  CSRF-protected on writes, and fully audited in the custody trail. Re-derive truth
  from chain/DB before claiming an outcome. Never lose or double-spend funds.
- **Every state designed** (loading=skeleton, empty=actionable, error=recoverable,
  populated, overflow). **Accessibility** (semantic HTML, ARIA, keyboard, focus,
  contrast). **Errors handled at boundaries with real fallbacks.**

## Design system

Use the tokens in [public/tokens.css](../../public/tokens.css) — never hardcode
hex/px. Monochrome glass on near-black, violet accent for wallet/finance surfaces,
`--font-mono` for all addresses/amounts. Phi spacing, the four radii, the three
shadows, the motion tokens. Match the app; invent within the system.

## Real resources you must wire (no fakes)

- Solana RPC + pump.fun feed: [api/_lib/agent-pumpfun.js](../../api/_lib/agent-pumpfun.js).
- Custodial wallet + signing + balances: [api/_lib/agent-wallet.js](../../api/_lib/agent-wallet.js).
- Spend guards / custody trail: `api/_lib/agent-trade-guards.js`,
  `GET /api/agents/:id/solana/custody`.
- On-chain identity: [contracts/](../../contracts), `erc8004_agent_id`.
- LLM persona: Anthropic via the platform's worker proxy (latest Claude models —
  consult the `claude-api` reference; never hardcode keys, never call a model
  directly from the browser).
- Voice: ElevenLabs fields on `agent_identities` (`voice_provider`, `voice_id`).
- Text/photo → 3D: the **Meshy** integration available to the platform (use the real
  Meshy MCP/API wired into the repo; grep for existing Meshy usage before adding).
- Auth/ownership: [api/_lib/auth.js](../../api/_lib/auth.js)
  (`user_id === auth.userId`).
- Multiplayer: [multiplayer/](../../multiplayer).
- Agent-to-agent payments / skills: [agent-payments-sdk/](../../agent-payments-sdk),
  [mcp-server/](../../mcp-server).

If an invention genuinely needs a new endpoint or contract, **build it for real** —
proper auth, CSRF, audit, spend-limit enforcement, real chain calls. Never fake it
client-side.

## Working rules for THIS repo (traps)

- **Concurrent agents share this worktree.** Stage **explicit paths only** (never
  `git add -A`/`.`). Re-check `git status` + `git diff --staged` before committing.
- **`npx vercel build` overwrites `api/*.js` with esbuild bundles** — if you build,
  check `head -1` for `__defProp` and `git restore -- api/ public/` if bundled.
- Never pull/fetch/merge from the `threeD` remote. Push to **both** `threeD` and
  `threews` when asked.
- `npm run dev` (port 3000), exercise in a real browser, zero console errors/
  warnings from your code, real API calls visible in Network. `npm test` passes.
- **Changelog:** every user-visible change → an entry in
  [data/changelog.json](../../data/changelog.json); `npm run build:pages` validates.

## Definition of done (per task)

1. The invention is real, wired end-to-end, reachable by navigation, and works in a
   real browser with real data (Network tab proves it). No console errors/warnings.
2. Owner / visitor / logged-out roles correct; funds-moving paths owner-gated +
   server-enforced + spend-limited + audited.
3. Every state designed; responsive at 320/768/1440; accessible.
4. `npm test` passes; changelog entry added; `git diff` self-reviewed.
5. It is genuinely novel — you can name the competitor feature it beats and why they
   can't copy it without our stack.
6. You'd proudly demo it to senior engineers **and** to professional traders.

## Then: improve, then delete this task

After meeting the definition of done, run the self-review protocol from
[CLAUDE.md](../../CLAUDE.md) (lazy/user/integration/edge-case/pride checks). Fix the
single biggest weakness now. Then look up one level: what does this invention
unlock adjacent to it? Wire that connection. **Finally, when truly complete and
committed, delete your own prompt file** (`prompts/inventions/0X-*.md`). Leave this
`00-README-inventions.md` until the whole program ships.

## Suggested order / dependencies

- The inventions are mostly **independent** and can run in parallel — they share the
  wallet program's `src/shared/` components but build separate surfaces.
- **`02` (on-chain reputation)** is foundational for `03` (back-an-agent vaults) and
  `01` (theater) — a verifiable track record is what makes spectating/backing
  meaningful. Land or coordinate it early.
- **`07` (Integration & QA)** runs last.
