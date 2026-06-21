# 26 — Trust surfaces: status, docs, security, pricing, legal

**Phase 6. [parallel-safe]** with 22–25.

## Where you are

`/workspaces/three.ws` — three.ws, 3D AI-agent platform with extensive docs
(`docs/`), a changelog system, an API reference (`docs/api-reference.md`,
`docs/api.html`), and SDKs. Read [CLAUDE.md](../../CLAUDE.md). The only coin is
**$THREE**.

## Objective

The public surfaces that make a platform credible to users, developers, partners,
and investors are present, accurate, and polished: a live status page, complete
and correct developer docs, a clear security/trust page, transparent pricing, and
the legal/policy pages a real company needs.

## Why it matters

Before anyone integrates, invests, or trusts a platform with money, they check:
Is it up? Are the docs real? Is it secure? What does it cost? Who's behind it? A
$1B platform answers all of these with confidence. Missing or sloppy trust
surfaces cap enterprise and developer adoption no matter how good the product is.

## Instructions

1. **Status page.** A real `/status` driven by the health endpoints from
   [11 — observability](11-observability.md): current uptime of core services
   (API, RPC, forge pipeline, payments), recent incidents, and historical
   uptime. Real data, not a static "all good" image. Auto-updates.
2. **Developer docs.** Audit `docs/` and the API reference for accuracy against
   the actual 769 endpoints + SDKs: every documented endpoint exists and matches
   its real signature; every SDK has a working quickstart; code samples actually
   run. Fix drift. Ensure a clear "build your first integration in 10 minutes"
   path. Cross-check `npm run audit:pages` / `validate:cards`.
3. **Security/trust page.** A `/security` page stating the security posture (no
   secrets in client, audited contracts, x402 verification, responsible-
   disclosure contact + policy), linking the public results of
   [09 — security review](09-security-review.md) where appropriate. Add a
   `SECURITY.md` and a disclosure email if absent.
4. **Pricing page.** A clear, honest `/pricing`: free tier (the README's free
   draft tier), paid tiers, x402 pay-per-call, creator economics + platform fee
   (transparent %, consistent with [24 — monetization](24-monetization-completeness.md)).
   No hidden costs. $THREE is the only token referenced.
5. **Legal/policy.** Terms of Service, Privacy Policy (consistent with the data
   collection documented in [25 — analytics](25-analytics-funnel.md)), and any
   required crypto/risk disclosures. Real pages, reachable from the footer, not
   dead links (ties to [05 — dead paths](05-dead-path-and-handler-audit.md)).
6. **About/credibility.** An About surface: what three.ws is, the open-source
   story, links to GitHub/X, and the $THREE contract address with the "always
   verify the CA" guidance from the README. Honest, no vaporware claims.
7. **Consistency.** All trust pages use the unified design system
   ([20](20-design-system-consistency.md)), are responsive
   ([19](19-responsive-mobile-sweep.md)), accessible
   ([17](17-accessibility-audit.md)), and SEO-complete
   ([22](22-seo-and-shareability.md)).
8. **Verify** every link in the footer/trust nav resolves and every doc sample
   runs.

## Definition of done

- [ ] Live `/status` page driven by real health data with uptime + incident
      history.
- [ ] Developer docs + API reference audited against real endpoints/SDKs; drift
      fixed; a working 10-minute quickstart exists; samples run.
- [ ] `/security` page + `SECURITY.md` + responsible-disclosure contact present.
- [ ] Honest `/pricing` page covering free/paid/x402/creator economics; $THREE
      only.
- [ ] ToS, Privacy Policy, and required disclosures exist, are reachable from the
      footer, and match actual data practices.
- [ ] About/credibility surface with correct $THREE CA + verify guidance.
- [ ] All trust pages are consistent, responsive, accessible, SEO-complete; every
      footer/trust link resolves.
- [ ] `npm test` + `npm run audit:pages` pass. Changelog: `docs`/`feature` entry
      for new public pages.
