# 32 — Legal, compliance & trust

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 6 — Growth & business
**Owns:** Privacy Policy, Terms of Use, cookie/consent, risk disclaimers, data-handling, age/jurisdiction gating.
**Depends on:** 05 (secrets), 30 (analytics consent).  ·  **Parallel-safe with:** 33.

## Why this matters for $1B
A platform that custodies wallets, moves money, and touches crypto trading cannot raise
or scale without real legal footing. Diligence checks for it; users trust it; regulators
require it. Trust is a growth multiplier, not a checkbox.

## Mission
Put accurate, accessible legal and compliance foundations in place and make trust
visible across money and data surfaces.

## Map
- Footer links to Privacy Policy + Terms of Use; trading/launch surfaces (prompts 21,
  22) that need risk disclaimers; analytics consent (prompt 30).

## Do this
1. Ensure Privacy Policy and Terms of Use are present, accurate to what the product
   actually does (data collected, custody model, payments), and linked site-wide.
2. Add a cookie/consent mechanism that gates non-essential analytics (ties prompt 30)
   and respects Do-Not-Track; document data retention and deletion.
3. Add clear, non-dismissive risk disclaimers on trading/launch/intelligence surfaces:
   not financial advice, crypto risk, no guaranteed returns — without fabricating any
   specific coin claim (prompt 04).
4. Verify GDPR/CCPA basics: data export/deletion path, lawful basis, processor list.
5. Confirm wallet/custody disclosures match the real model (prompt 24) — never overstate
   security or control.
6. Add age/jurisdiction gating where required for token/trading features.

## Must-not
- Do not ship boilerplate that contradicts actual data/custody behavior.
- Do not bury or auto-dismiss required risk disclosures.

## Acceptance
- [ ] Accurate Privacy + Terms linked site-wide; consent + DNT respected; retention documented.
- [ ] Risk disclaimers on trading/launch surfaces; data export/deletion path works.
- [ ] `npm test` green; changelog `security`/`docs` entry.
