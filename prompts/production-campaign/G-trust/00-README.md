# Track G — Trust, Compliance, Access & Brand

**Goal:** make three.ws **safe, legal, accessible, and on-brand everywhere.** A platform
worth $1B is trusted with money, lawful to operate globally, usable by everyone, and visually
one product on every screen. This track hardens the four pillars that a regulator, an
acquirer, an app-store reviewer, or a first-time international user checks *before* they
trust us with anything: real legal pages + content moderation, WCAG 2.2 AA accessibility,
production internationalization, and an enforced design system. These are not chores — they
are the trust floor under everything Tracks A–F build.

Read `prompts/production-campaign/00-README-orchestration.md` (the $1B thesis + global
definition of done) and `00b-the-bar.md` (the measurable bars) before starting any prompt
here. Each prompt is self-contained: paste it into a fresh agent chat, ship it end-to-end,
verify for real, append a changelog entry if user-visible, then delete the prompt file. When
this directory contains only this `00-README.md`, Track G is done.

---

## The four prompts

| # | File | Mission | Key surfaces it owns |
|---|------|---------|----------------------|
| **G1** | [`G1-legal-moderation-abuse.md`](G1-legal-moderation-abuse.md) | Ship the platform Privacy Policy + Terms (footer already links them, they 404 today); extend moderation beyond anon-chat to Forge prompts, generated avatars/images, and agent profiles; build report + takedown + an admin queue; close rate-limit gaps and instrument the audit log. | `pages/legal/*`, `api/report.js`, `api/admin/reports.js`, `api/_lib/moderation.js`, `api/_lib/audit.js`, `api/_lib/rate-limit.js` |
| **G2** | [`G2-accessibility-audit.md`](G2-accessibility-audit.md) | A real WCAG 2.2 AA audit: semantic HTML, landmarks, keyboard nav, focus management, ARIA on 3D/canvas controls, screen-reader labels, `prefers-reduced-motion`, contrast ≥ AA. Wire an axe check into CI. | `public/nav.js`/`public/nav.css`, `src/**` canvas surfaces, `.github/workflows/ci.yml` |
| **G3** | [`G3-i18n-completeness.md`](G3-i18n-completeness.md) | Finish i18n: annotate + extract all surfaces, build all 11 configured locales via the real Groq pipeline, mount the locale switcher everywhere, make RTL correct, centralize `Intl` number/date/currency formatting, add an i18n lint gate. | `public/locales/*`, `src/i18n.js`, `src/format-intl.js`, `scripts/i18n-*.mjs`, `.i18nrc.json`, `.github/workflows/ci.yml` |
| **G4** | [`G4-brand-design-system.md`](G4-brand-design-system.md) | Enforce the design system: eliminate hardcoded colors/spacing/fonts in favor of `public/tokens.css`, kill reintroduced legacy palettes (`--mk-*` … `--t-*`), unify buttons/cards/badges/skeletons, add a lint/audit that fails on token violations. | `public/tokens.css`, `public/style.css`, `scripts/verify-b09-tokens.mjs`, stylelint config, `.github/workflows/ci.yml` |

---

## Run order

All four can run in parallel — they own distinct lanes. The natural priority:

1. **G1 first** — the legal pages are a live broken promise (the footer links 404) and
   moderation is the highest-trust gap. Foundational.
2. **G2 and G3 in parallel** — independent surfaces (a11y vs. localization), no shared files
   beyond the shared nav and the CI workflow.
3. **G4 last (or re-run at the end)** — it is the **enforcement backstop**. G2's contrast
   fixes and any other track's CSS must land in tokens; running G4's lint after the others
   catches regressions they introduced. If run early, re-run `lint:tokens` once the track
   finishes.

**Shared-file coordination:** G2, G3, and G4 each add a job to
`.github/workflows/ci.yml` (`a11y`, the i18n lint, `tokens`) — append, never reformat the
file. G2 (contrast) and G4 (tokens) must agree: **every contrast fix is a token choice, not a
new hardcoded color.** G1, G3, and the switcher styling all consume `public/tokens.css` — none
of them introduce raw values.

---

## File-ownership map

| Path | Owner |
|------|-------|
| `pages/legal/privacy.html`, `pages/legal/tos.html` | G1 |
| `api/report.js`, `api/admin/reports.js`, new `content_reports` migration | G1 |
| `api/_lib/moderation.js` (extend), `api/_lib/audit.js` (instrument), `api/_lib/rate-limit.js` (apply) | G1 |
| `public/nav.js` / `public/nav.css` — landmarks, skip-link, focus order | G2 (a11y) + G3 (mount switcher) — coordinate |
| `src/**` canvas/3D controls — ARIA, keyboard equivalents, `aria-live` | G2 |
| `npm run test:a11y` + `a11y` CI job | G2 |
| `public/locales/*.json`, `public/locales/manifest.json` | G3 |
| `src/i18n.js`, `src/format-intl.js`, `scripts/i18n-*.mjs`, `.i18nrc.json` | G3 |
| i18n lint CI job | G3 |
| `public/tokens.css`, `public/style.css` — tokenization, no legacy palettes | G4 |
| `scripts/verify-b09-tokens.mjs` (broaden), stylelint config, `npm run lint:tokens`, `tokens` CI job | G4 |
| `data/changelog.json` | append-only, all four (never reformat) |
| `.github/workflows/ci.yml` | append-only, G2/G3/G4 (one job each) |

**Done buys us:** a platform that is lawful to run globally, safe for user-generated content,
usable by keyboard-only and screen-reader users in 11 languages including RTL, and visually
one product on every surface — the trust and universality a $1B platform is held to.
