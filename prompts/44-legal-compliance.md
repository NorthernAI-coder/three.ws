# 44 · Legal, Privacy & Compliance

## Mission
Ship the legal and compliance foundation a serious platform needs: Terms of Service, Privacy Policy,
cookie/consent handling, content policy, and clear disclaimers — accurate to what the product does.

## Context
- Platform handles accounts, wallets, payments (USDC/x402), user-generated 3D content, token launches,
  and AI generation. i18n live. $THREE is the only coin promoted.

## Tasks
1. **Core policies:** Terms of Service, Privacy Policy, and a Content/Acceptable-Use Policy as real,
   reachable pages (footer + signup). Reflect actual data flows (what's collected, why, retention,
   third parties: providers, RPC, analytics).
2. **Cookie/consent:** consent mechanism for analytics/tracking where required; honor opt-out; no
   non-essential tracking before consent.
3. **Disclaimers:** crypto/token risk disclaimers where coins/launches appear; AI-content disclaimer;
   "not financial advice." $THREE referenced correctly; no implied guarantees.
4. **User content + IP:** clear ownership/licensing terms for generated avatars/models; DMCA/abuse
   reporting path; respect upstream licenses (character-studio MIT, three.js, Mixamo terms).
5. **Data rights:** account deletion + data export paths (coordinate with prompt 38 retention); PII
   minimization.
6. **Accessibility statement** + contact; link everything from the footer.

## Acceptance
- ToS, Privacy, Content policy live + accurate + linked; consent handling correct.
- Risk/AI disclaimers present where needed; user-content IP terms clear; DMCA/abuse path exists.
- Account deletion + data export work; upstream licenses respected; footer links complete.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. Policies must reflect reality — no placeholder legalese that misstates the product. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); never reference another token. Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist. (This is product/legal scaffolding, not legal advice — flag anything that needs counsel review.)

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/44-legal-compliance.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
