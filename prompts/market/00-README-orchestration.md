# three.ws — Production Campaign to $1B (Orchestration Index)

This directory is a **campaign**, not a feature. Its single goal: take three.ws from
"impressive and mostly built" to **100% production-ready, proper, and professional** —
the quality, reliability, and depth a platform needs to be credibly worth **$1B**.

Each `.md` here is a **self-contained task prompt**. Paste one into its own fresh agent
chat. The agent works in this shared worktree, follows `CLAUDE.md` exactly, ships the
work end-to-end, verifies it for real, then **deletes its own prompt file**. When a track
directory contains only its `00-README.md`, that track is done. When every track is done,
the campaign is done.

> **This is not a greenfield build.** three.ws already ships 125+ pages, 100+ API
> endpoints, SDKs, MCP servers, workers, on-chain contracts, and payment rails. These
> prompts **harden, complete, and connect what exists** — they do not rewrite it. Read
> before you write. Reuse before you build. Delete dead paths. Every prompt assumes the
> agent first reads `CLAUDE.md`, `STRUCTURE.md`, and `00b-the-bar.md`.

> **Concurrency note.** Multiple agents run in this worktree simultaneously. There may be
> a parallel hardening checklist under `prompts/road-to-1b/`; this campaign is the broader,
> structured complement (7 tracks across reliability, growth, surfaces, monetization,
> ecosystem, infra, and trust). The two are compatible — neither owns the other's files.

---

## The $1B thesis (read this — every agent internalizes it)

A platform is worth $1B when it is **trusted with money, used daily, and built upon by
others**. That decomposes into exactly the things this campaign hardens:

1. **Trust** — nobody pays an agent, mints a coin, or wires a wallet through software that
   throws unhandled errors, loses funds on an edge case, or 500s under load. Reliability,
   payment correctness, and security are the *foundation of valuation*, not chores.
2. **Activation & retention** — value the first-time visitor reaches in 60 seconds, and a
   reason to come back tomorrow. A platform nobody activates on is worth its liquidation value.
3. **Monetization depth** — real revenue surfaces: $THREE holder value, x402 paid rails,
   marketplace economics, billing. Revenue × multiple = valuation.
4. **Distribution & network effects** — SEO, virality, an SDK/MCP ecosystem others build on.
   The platform that other products depend on is the one that compounds.
5. **Polish that signals seriousness** — every state designed, every surface screenshot-worthy,
   accessible, fast, branded. Polish is how trust is *communicated* before it is earned.

If a piece of work doesn't advance one of these five, it isn't on the path to $1B. If it
advances several, do it first.

**The bar:** Vercel / Linear / Stripe / Figma. If you wouldn't screenshot it and put it in
your portfolio, it isn't done. See `00b-the-bar.md` for the concrete, measurable definition.

---

## How to run the campaign

Each prompt is independent enough to run in its own chat, but the tracks have a natural
priority. **Run Track A (Reliability) first and keep it green** — every other track ships
on top of a foundation that must not wobble. Then fan out B–G in parallel; within a track,
the lower numbers are usually prerequisites for the higher ones (noted per file).

```
A — Reliability, Observability & Trust   ← foundation. Do first. Never regress.
        │
        ├── B — Activation, Growth & Distribution   (turn visitors into users)
        ├── C — Surface Completeness                (every page to the bar)
        ├── D — Monetization & $THREE Economy        (turn users into revenue)
        ├── E — Developer Ecosystem & SDKs           (turn users into builders)
        ├── F — Scale & Infrastructure               (hold up under success)
        └── G — Trust, Compliance, Access & Brand    (be safe, legal, universal)
```

Concurrent agents share this worktree. **Stage explicit paths only — never `git add -A`.**
Re-check `git status` and `git diff --staged` immediately before any commit. Each prompt
declares a file-ownership lane; stay in it. Shared files (`data/changelog.json`,
`data/pages.json`) are **append-only** — never reformat them.

---

## Track index

| Track | Directory | Prompts | What "done" buys us |
|---|---|---|---|
| **A** | [`A-reliability/`](A-reliability/) | A1–A7 | A platform that does not lose money, data, or uptime. The trust foundation. |
| **B** | [`B-growth/`](B-growth/) | B1–B6 | Visitors activate and come back. SEO, virality, analytics, lifecycle. |
| **C** | [`C-surfaces/`](C-surfaces/) | C1–C6 | All 125+ pages finished to the screenshot bar — every state, mobile, a11y. |
| **D** | [`D-monetization/`](D-monetization/) | D1–D4 | Real revenue: $THREE value, billing, x402 rails, marketplace economics. |
| **E** | [`E-ecosystem/`](E-ecosystem/) | E1–E4 | Others build on us: SDKs, MCP servers, docs, templates — network effects. |
| **F** | [`F-infra/`](F-infra/) | F1–F3 | It holds up under success: data layer, workers, CI/CD, deploy safety. |
| **G** | [`G-trust/`](G-trust/) | G1–G4 | Safe, legal, accessible, on-brand everywhere. |

Each track directory has its own `00-README.md` with the per-track run order and the
file-ownership map for that track's prompts. Total: **34 task prompts** + 2 framing docs.

---

## Global definition of done (every prompt inherits this — in addition to its own)

A task is **not** done until ALL of these hold. This is `CLAUDE.md`'s definition of done,
restated as the campaign's non-negotiable floor:

- [ ] Code written, wired into the UI/flow, and **reachable** by a real user via navigation.
- [ ] **No mocks, fake data, placeholders, TODOs, stubs, or `setTimeout` fake-loading.** Real
      APIs, real endpoints, real data. Missing credential → find it in `.env` / `vercel env`.
- [ ] **The only coin is `$THREE`** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never
      name, hardcode, or recommend any other token anywhere. (Runtime-supplied mints in
      user-launch directories are the only mechanical exception — see `CLAUDE.md`.)
- [ ] **Every state designed:** loading (skeletons > spinners), empty (tells the user what to
      do next), error (actionable recovery), populated, overflow. Tested at 320 / 768 / 1440px.
- [ ] Every interactive element has hover, active, and focus states. Keyboard-navigable.
      `prefers-reduced-motion` respected.
- [ ] **Design tokens only** (`public/tokens.css` / `DESIGN-TOKENS.md`) — no hardcoded colors,
      spacing, or fonts.
- [ ] Verified for real: `npm run dev` (port 3000), exercised in a browser, **zero console
      errors/warnings from your code**, network tab shows real calls returning real data.
- [ ] Existing tests pass (`npm test`); new logic has new tests. Money/auth/3D paths covered.
- [ ] **Changelog:** user-visible change → append a holder-readable entry to
      `data/changelog.json` (tags: feature, improvement, fix, sdk, infra, docs, security).
      Internal-only chores get no entry. Run `npm run build:pages` to validate it.
- [ ] `git diff` self-reviewed — every changed line justified. Stage explicit paths only.
- [ ] Watch the two repo traps: `npx vercel build` overwrites `api/*.js` with bundles
      (check `head -1` for `__defProp`/`createRequire` before committing an `api/` diff);
      and **never** `git pull`/`fetch`/`merge` from the `threeD` mirror.

If you cannot verify a step, **say so explicitly**. Do not claim done.

---

## The self-improvement pass (do this before deleting your prompt)

After the task is complete and verified, run `CLAUDE.md`'s five-point self-review (lazy /
user / integration / edge-case / pride). Find the **single biggest remaining quality gap**
in what you touched, fix it, then:

1. Append your changelog entry (if user-visible).
2. `rm` your own prompt file.
3. Report — in two or three sentences — what you shipped, what you verified, and any seam or
   follow-up the next agent should know about.

A silo is a failure. The best work in this campaign **wires surfaces together** — observability
that feeds the status page, analytics that feeds retention, a paid endpoint that appears in the
marketplace and the docs. Find the connections. Wire them.
