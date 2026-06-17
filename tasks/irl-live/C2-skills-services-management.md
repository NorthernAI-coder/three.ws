# C2 — Skills & services management for an IRL agent

> Epic C · Size **M** · Opens from the C1 card "Skills" link.
> Depends on C1 (overview), pairs with B2 (the inspect card that renders these).

## Goal

Let an owner, from the dashboard, choose which **skills** their placed agent
offers IRL and set the **x402 per-call price** for each. These are exactly the
services that B2's tap card lists and B3 lets a passer-by pay for. Designed
attach/detach forms with validation, save states, and real persistence.

## Why it matters

A placed agent is only interesting if it *does* something payable. The whole
loop — tap → see services → pay via x402 → owner earns — starts with the owner
declaring services and prices. Today there's no dashboard path to do that for an
IRL-placed agent, so every pin is mute.

## Current state (real lines)

- Skill catalog: `GET /api/skills/index.js` lists `marketplace_skills`
  (`:84` `handleList`) with `price_per_call_usd` per skill (`:71`). Install state
  via `skill_installs` (`:204`).
- Canonical prices live in **`agent_skill_prices`** — see
  `api/agents/x402/[action].js:20` `priceFor()`:
  `SELECT amount, currency_mint, chain FROM agent_skill_prices WHERE agent_id=… AND skill=… AND is_active=true`.
- Single-skill upsert already exists: `POST /api/agent-skill-price?agentId=:id`
  (`api/agent-skill-price.js:31`) — body `{ skill, amount, currency_mint, chain }`,
  `amount=0` deactivates, CSRF-guarded (`:38`), owner-checked (`:52`).
- Bulk endpoint referenced in its header: `PUT /api/agents/:id/skills-pricing`.

## What to build

A **Services** panel (modal or expandable card region, matching `widgets.js`
modal pattern `:537`). Two sections:

### 1. Attached services list

`GET /api/agents/:id` (agent record exposes `skills[]`) joined with
`agent_skill_prices` to show each currently-priced skill:

```
┌ web-search ────────────────────────────── active ┐
│ 0.05 USDC / call · Solana                         │
│ [edit price]  [pause]  [remove]                    │
└────────────────────────────────────────────────────┘
```

### 2. Add a service

A picker fed by `GET /api/skills?installed=true` (the owner's own skills) plus a
price form. Real currency only — default the mint to **$THREE**
(`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) or USDC; never a third token.

```js
const form = { skill, amount, currency_mint, chain: 'solana' };
// validate before submit
if (!form.skill) return invalid('Pick a skill');
if (!(Number(form.amount) >= 0)) return invalid('Price must be ≥ 0');
if (!BASE58_RE.test(form.currency_mint)) return invalid('Invalid mint');

const r = await fetch(`/api/agent-skill-price?agentId=${agentId}`, {
  method:'POST', credentials:'include',
  headers:{ 'content-type':'application/json', 'x-csrf-token': csrf },
  body: JSON.stringify(form),
});
```

`amount` is integer atomic units (see `bodySchema` `:16` — `z.number().int()`),
so the form must convert the displayed decimal (e.g. `0.05 USDC`) to atomic
(`50000` at 6 decimals) using the mint's decimals, and back for display. Surface
the human value, store the atomic value.

### Save states

Per-row: idle → `Saving…` (button disabled) → success pulse / inline error.
"Pause" = re-POST with the same row but `amount` set to deactivate, or a
dedicated `is_active=false` path. "Remove" confirms via the shared confirm modal
(`widgets.js:537`) then deactivates.

### Validation rules

- Price `≥ 0`; `0` documented as "free / deactivate".
- Mint must pass `BASE58_RE` (`api/agent-skill-price.js:14`).
- Block skills the agent doesn't actually expose (`agent_identities.skills[]`).
- CSRF token required (cookie-session mutation) — read from the dashboard session.

## Data / API changes

- Reuse `POST /api/agent-skill-price?agentId=:id` (no change) for single upserts.
- Optional: add a **read** endpoint `GET /api/agents/:id/skills-pricing` returning
  active `agent_skill_prices` rows so the panel can render current prices without
  scraping the x402 manifest. If `PUT /api/agents/:id/skills-pricing` exists,
  reuse it for bulk save; otherwise loop the single-skill POST.
- No schema change — `agent_skill_prices` already exists.

## Acceptance checklist

- [ ] Panel lists currently-priced services for the placed agent with human price.
- [ ] Add-service picker only offers skills the agent exposes; decimal↔atomic
      conversion correct against the mint's decimals.
- [ ] Save → real `agent_skill_prices` row written; pause/remove deactivate.
- [ ] CSRF token sent; non-owner gets 403; validation errors shown inline.
- [ ] Mint defaults to $THREE/USDC; no other token referenced anywhere.
- [ ] Loading/empty/error via state-kit; save states designed; no console errors.

## Out of scope

Authoring brand-new skills (that's the skills marketplace), and the pay flow
itself (B3). This task only attaches existing skills and prices them.

## Verify

`npm run dev` → open Skills from a C1 card → add `web-search` at `0.05 USDC` →
confirm a real `agent_skill_prices` row, then `GET /api/agents/:id/x402/manifest`
(or B2's `agent-card`) reflects the new price.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-live/C2-skills-services-management.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
