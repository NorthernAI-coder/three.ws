# 18 · Agent Studio — Create, Configure, Deploy

## Mission
The agent builder is the heart of the platform: author an agent's avatar, brain (LLM + prompt),
memory, skills, money, and on-chain identity in one place with a live 3D preview — flawlessly.

## Context
- Create: `pages/create-agent.html`, `src/create-agent.js`; review `pages/create-review.html`.
- Studio: the agent editor (brain/memory/body/money/skills) with a live `<agent-3d>` preview
  (`src/element.js`, `avatar-sdk/`). Agent edit route `/agent/:id/edit` (`agent-edit.html`).
- Models: pick the agent's LLM (Claude family default — use latest, see `claude-api` skill); skills
  catalog + on-chain skill licenses (`contracts/skill-license`, `api/skills/*`).

## Tasks
1. **Full create flow:** avatar → brain (model + system prompt) → skills → identity → monetization →
   deploy embed. Every step validated, resumable, with designed states; no dead step.
2. **Brain tab:** model picker uses real, current model IDs (latest Claude by default); prompt editor
   robust; no stray overlay/stacked-panel bugs (a recent fix — keep it clean).
3. **Memory:** create/edit/delete custom memories (per the memory tutorial) via dashboard, chat, MCP,
   API, and skills — all paths work and persist.
4. **Skills:** browse, enable, purchase (skill license = 1/1 SPL NFT + PDA); access checks enforced;
   pay-what-you-want + reviews where applicable.
5. **Live preview:** `<agent-3d>` reflects edits in real time; never errors out — default-avatar
   fallback holds.
6. **Deploy:** produces a working embed widget + monetization; the embed loads on a third-party page.
7. **Identity:** ERC-8004 registration path works; reputation reads.

## Acceptance
- End-to-end create→deploy produces a live, embeddable, monetizable agent with on-chain identity.
- Every tab's states designed; live preview never throws; memory CRUD works on all 5 paths.
- Skill purchase + access enforcement verified; clean console; E2E green; changelog for visible changes.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist. For anything LLM/model-related, consult the `claude-api` skill and use current model IDs.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/18-agent-studio.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
