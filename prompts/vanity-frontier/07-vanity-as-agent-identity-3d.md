# Task 07 — Vanity as Agent Identity + the 3D/AR Key Ceremony

**Read `prompts/vanity-frontier/00-README.md` and `/workspaces/three.ws/CLAUDE.md` first** (rules,
codespace traps, file map). Then fuse the wallet stack with three.ws's 3D/AR avatar layer into
something nobody has: an agent whose **identity, address, and birth ceremony are one experience.**

You are a senior creative engineer (Three.js + product). three.ws agents have 3D avatars (glTF/GLB),
WebXR/AR placement, and rich profiles. Their wallets are currently an afterthought. Make a wallet a
**meaningful, visible, screenshot-worthy part of an agent's identity** — and make creating one a
cinematic moment.

---

## Why this is gamechanging

Wallets are boring strings. Avatars are alive. Fuse them: an agent's vanity address *encodes its
identity* (its name/persona via the Task 04 compiler), and **minting that wallet is a real-time 3D
"key ceremony"** — the grind visualized, the address materializing, the sealed key delivered to the
owner — that people will record and share. It turns a $0.50 utility into an identity ritual and a
growth loop. The 3D/AR surface is a moat competitors don't have; this is the one feature in the
suite that *can't* be copied by a generic key tool.

## What to build (real grinding, real 3D, real delivery)

1. **Identity binding**: an agent's vanity address is derived from its persona — use the Task 04
   semantic compiler to propose patterns from the agent's name/handle/traits; let the owner pick;
   grind via the **real** browser pool and/or the **real** x402 endpoint; deliver trustlessly
   (Task 01) and/or sealed (Task 02) to the owner. Persist the link between agent identity and
   wallet (reuse the agent/avatar data model and `api/_lib/agent-wallet.js`).
2. **The Key Ceremony (Three.js)**: a genuinely beautiful real-time visualization of the grind and
   reveal — bound to **actual** grind progress/attempts (no fake `setTimeout` progress; drive it
   from real grinder events), culminating in the address materializing on/around the agent's
   avatar. Performance-first (lazy-load heavy modules, `transform`/`will-change`, no jank). Respect
   reduced-motion. Designed loading/empty/error states. It should look like a flagship product.
3. **Identity surfacing**: show the agent's wallet identity (address, proof-of-grind badge from
   Task 03, "non-custodial" mark) on the agent profile/detail and in the 3D scene; make it
   shareable (an OG image / shareable card / shorts-friendly capture). Cross-link to the wallet
   concierge (Task 06) for funding/operating.
4. **AR moment (WebXR)**: extend the existing AR placement so the ceremony / the agent's wallet
   identity can be experienced in AR (place the agent, witness/reveal its address in your space).
   Use the existing WebXR floor-placement work as the base.

## Correctness, craft, edge cases

- The visualization MUST be driven by real grinder telemetry; if a grind is instant or fails, the
  ceremony degrades gracefully and truthfully.
- Accessibility: keyboard paths, reduced-motion fallback, captions/labels; the ceremony is
  enhancement, never a gate to getting the wallet.
- Mobile + AR performance budgets; test at 320/768/1440 and on a real device path.
- Never expose the secret in the 3D layer/telemetry/screenshots — only the public address; secret
  stays sealed/trustless to the owner.
- Reuse existing avatar/GLB loading, scene, and AR code — match patterns, don't fork the renderer.

## Definition of done

- An owner can give an agent a persona-derived vanity wallet through a real, polished flow: pick
  pattern (Task 04) → watch the **real** grind as a 3D ceremony → receive the key trustlessly/sealed
  (Tasks 01/02) → see the verified identity (Task 03) on the agent and in AR. Real grinding, real
  delivery, real persistence — no mocks, no fake progress.
- Exercised in a real browser (and a real AR path where possible): no console errors, real network
  calls, designed states, accessible, responsive, smooth.
- Tests where logic warrants (identity binding, telemetry plumbing) via vitest + direct `node`.
- `data/changelog.json` entry; `STRUCTURE.md` updated; cross-links to agent/avatar surfaces wired.
- **Self-improvement pass:** then elevate — e.g., generative avatar accessories unlocked by address
  rarity, a shareable "birth certificate" video/card, or a gallery of the rarest agent identities.
  Ship the best.
- **Delete this file** (`prompts/vanity-frontier/07-vanity-as-agent-identity-3d.md`) last. Report
  what shipped, where to experience it, and any tradeoffs.

This is the one that goes viral. Make it feel like magic — but every frame is backed by real
crypto and real grinding. No shortcuts.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/vanity-frontier/07-vanity-as-agent-identity-3d.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
