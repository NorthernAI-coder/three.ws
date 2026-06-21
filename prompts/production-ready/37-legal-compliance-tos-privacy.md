# 37 — Legal, compliance, ToS & privacy

> Part of **Production-Ready** (`prompts/production-ready/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 4 — Growth
**Owns:** Terms of Service, Privacy Policy, cookie/consent, licenses/attribution, financial/crypto disclosures, data-rights flows.
**Depends on:** `05`, `33`, `36`. Pairs with `26`.

## Why this matters for $1B
A platform that custodies wallets, processes payments, hosts UGC, and uses AI must be
legally defensible to raise, to sell to enterprises, and to survive scrutiny. Missing
ToS/privacy/disclosures is a hard blocker in diligence and an existential risk given
the money and crypto involved.

> You are an engineer, not a lawyer. Build the surfaces, wire the flows, and flag
> exactly where qualified legal counsel must review/author the binding text. Do not
> invent legal guarantees.

## Map
- Forks/vendored code attribution already tracked: `character-studio/LICENSE`,
  `src/scene-studio/vendor/LICENSE`, `public/animations/LICENSES.md`, per-asset
  `LICENSES.md` under `public/club/`. Custodial wallets + payments (prompts `17`,
  `18`). Analytics/PII (prompt `33`).

## Do this
1. **ToS + Privacy + AUP pages:** real, reachable pages (linked in footer + signup +
   onboarding). Draft thorough content covering accounts, custodial wallets, payments,
   UGC + moderation (prompt `36`), AI-generated content + IP/ownership, disclaimers,
   liability, and termination — clearly marked for counsel review where binding.
2. **Privacy specifics:** what data is collected (derive from prompt `33` taxonomy +
   prompt `05` env), why, retention, processors/subprocessors, and user rights
   (access, export, delete). Build the **data export + deletion** flows (real, wired —
   not a mailto), respecting the data model (prompt `26`).
3. **Consent management:** cookie/analytics consent banner honoring opt-out and
   do-not-track (ties to prompt `33`); no non-essential tracking before consent.
4. **Crypto/financial disclosures:** clear, non-misleading disclosures for the
   custodial wallet, payments, token activity, and risk — no investment advice, no
   guaranteed returns. Reinforce the one-coin rule: $THREE is the only coin; no
   promotion of others (prompt `22`).
5. **Licenses & attribution:** confirm all forks/vendored/3rd-party assets keep
   correct licenses + attribution (the files above); generate a third-party-notices
   page. Confirm the platform's own license posture.
6. **Compliance posture:** document the platform's stance on the regimes that apply
   (GDPR/CCPA-style data rights, age gating, geo-restrictions if any, KYC/AML
   considerations for money movement) and where counsel sign-off is required. Flag, do
   not fabricate.
7. **Records:** terms-acceptance is recorded per user with version + timestamp
   (prompt `26`).

## Must-not
- Do not invent legal text as if it were vetted — mark counsel-review points explicitly.
- Do not collect/track without the required consent.
- Do not make financial guarantees or give investment advice anywhere.
- Do not strip third-party license/attribution.

## Acceptance
- [ ] ToS, Privacy, AUP pages live + linked (footer/signup/onboarding), with counsel-review flags.
- [ ] Privacy policy reflects real data practices; working data export + deletion flows.
- [ ] Consent management honoring opt-out/DNT; no pre-consent non-essential tracking.
- [ ] Crypto/financial + AI-content disclosures present, non-misleading; one-coin rule reinforced.
- [ ] All third-party licenses/attribution correct; third-party-notices page generated.
- [ ] Compliance posture documented with counsel sign-off points flagged.
- [ ] Versioned terms-acceptance recorded per user.
