# 40 — Legal, compliance, ToS & privacy

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/production-1b/00-README.md`
> for shared context.

## Why this matters for $1B

A platform that handles wallets, on-chain trading, user uploads, and PII cannot scale
without a defensible legal posture. Enterprise customers, app stores, payment rails,
and the chains we integrate with all require accurate ToS, a real privacy policy with
GDPR/CCPA data rights, financial disclaimers on trading surfaces, and correct
open-source attribution for the vendored three.js and animation libraries. One missing
disclaimer or one un-attributed MIT library is an avoidable legal and reputational risk.

## Mission

Make the legal pages accurate to what the platform actually does, wire real GDPR/CCPA
data-rights and consent flows, place financial/custody disclaimers on every trading and
wallet surface, and ensure every vendored library is correctly attributed.

## Map (trust but verify — files move)

- **Legal pages** — [public/legal/privacy.html](../../public/legal/privacy.html)
  (already has GDPR/Cookie/Retention sections), [public/legal/tos.html](../../public/legal/tos.html)
  (has a disclaimer + wallet section), [public/legal/eula.html](../../public/legal/eula.html),
  [public/legal/aws-marketplace-eula.html](../../public/legal/aws-marketplace-eula.html).
- **Footer links** — [public/footer.html](../../public/footer.html) (`/legal/privacy`,
  `/legal/tos`), [public/footer.js](../../public/footer.js); routes in
  [vercel.json](../../vercel.json).
- **Surface-specific legal** — [pages/extension-privacy.html](../../pages/extension-privacy.html),
  [pages/extension-terms.html](../../pages/extension-terms.html),
  [pages/irl-privacy.html](../../pages/irl-privacy.html),
  [extensions/walk-avatar/PRIVACY.md](../../extensions/walk-avatar/PRIVACY.md),
  [extensions/walk-avatar/TERMS.md](../../extensions/walk-avatar/TERMS.md).
- **Wallet / trading surfaces (need disclaimers)** — [pages/pricing.html](../../pages/pricing.html),
  Oracle / trader / pump.fun surfaces (search `pages/` and `src/` for `agent-trade`,
  `oracle`, `trader`, `pumpfun`), x402 payment UI in
  [src/payment-modal.js](../../src/payment-modal.js).
- **Vendored OSS to attribute** — [character-studio/LICENSE](../../character-studio/LICENSE)
  (Atlas Foundation, MIT), [public/scene-studio/LICENSE](../../public/scene-studio/LICENSE)
  (three.js authors, MIT), [public/animations/LICENSES.md](../../public/animations/LICENSES.md)
  (per-clip upstream + license), [public/environments/LICENSES.md](../../public/environments/LICENSES.md).
- **Data-rights backend hook** — referral/user data in [api/users/](../../api/users),
  privacy-center task reference at
  [tasks/irl-hardening/H5-privacy-center-forget-me.md](../../tasks/irl-hardening/H5-privacy-center-forget-me.md).

## Do this

1. **Audit ToS + Privacy against reality.** Read `tos.html` and `privacy.html` line by
   line; verify every claim matches what the platform actually collects, stores, and
   does (uploads, wallet addresses, on-chain activity, analytics, cookies, third-party
   providers). Fix anything inaccurate; remove anything no longer true.
2. **GDPR/CCPA data rights — make them real.** Confirm the privacy policy lists the data
   collected, retention periods, and lawful basis. Provide working "export my data" and
   "delete my account / forget me" flows (a real `api/` endpoint backed by the user/referral
   tables), not a "contact us" stub. Reference the H5 privacy-center task for scope.
3. **Cookie / consent.** If analytics or any non-essential storage runs, add a consent
   mechanism (banner or settings) that actually gates those scripts; record consent and
   respect "reject." If everything is strictly necessary, document that explicitly so the
   policy is truthful.
4. **Financial / trading disclaimers.** Every surface that shows prices, trading, the
   Oracle, pump.fun launches, or token data must carry a clear "not financial advice / no
   warranty / DYOR" disclaimer placed in-context (not buried). Wire it as a shared,
   reusable component so it's consistent everywhere.
5. **Custody / wallet disclosures.** Wallet and x402 payment surfaces must disclose
   custody model, that on-chain transactions are irreversible, and fee/risk notes. Verify
   the disclosure appears in `payment-modal.js` and any agent-wallet UI.
6. **Open-source attribution.** Cross-check vendored libraries: three.js (scene-studio),
   character-studio (Atlas Foundation), and every animation clip's upstream license. Ensure
   each is attributed in a reachable place (an `/legal/licenses` or open-source page linked
   from the footer), and that the per-clip `LICENSES.md` is complete for shipped clips.
7. **$THREE-only sweep of legal copy.** Ensure no legal/disclaimer text names any token
   other than `$THREE`; trading disclaimers stay coin-agnostic about user-supplied mints.
8. Add a `data/changelog.json` entry (tag `security` or `docs`) for the legal/privacy
   updates, run `npm run build:pages`, and confirm footer links resolve via `audit:pages`.

## Must-not

- Do not write legal claims you cannot verify against the actual implementation.
- Do not ship a "delete my data" or "export" button that doesn't actually do it.
- Do not omit attribution for any vendored MIT/OSS library or animation clip.
- Do not reference any coin other than `$THREE` in legal, disclaimer, or consent copy.
- Do not gate consent with a banner that doesn't actually block the non-essential scripts.

## Acceptance (all true before claiming done)

- [ ] ToS and Privacy accurately describe real data practices, providers, retention, and
      on-chain/wallet behavior.
- [ ] Working data-export and account-deletion ("forget me") flows backed by real
      endpoints, linked from the privacy policy.
- [ ] Cookie/consent mechanism gates non-essential scripts and records the choice (or the
      policy truthfully states all storage is strictly necessary).
- [ ] Financial/DYOR disclaimers appear in-context on every trading/Oracle/pump/token
      surface via a shared component.
- [ ] Custody/wallet/irreversibility disclosures present on wallet + x402 payment UIs.
- [ ] Every vendored library (three.js, character-studio, animation clips) attributed on a
      footer-linked licenses page; per-clip `LICENSES.md` complete.
- [ ] No non-`$THREE` coin referenced in any legal copy; footer legal links resolve;
      changelog updated and `npm run build:pages` clean.
