# B6 — Home & Landing Conversion

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:**
B1 (the first-run path the hero CTA drops into), B3 (the events that measure conversion),
B4 (the share cards / social proof). Run **last** in Track B — it consumes the others.

## Why this matters for $1B
The home page is the single most-trafficked surface and the one that decides whether a visitor
becomes a user or a bounce. Polish that signals seriousness (`00-README-orchestration.md`
pillar 5) is communicated here first: a sharp value prop, credible social proof, a clear CTA
hierarchy, and an above-the-fold "wow" are how trust is established *before* it's earned. A
landing page that buries what three.ws does, or asks for signup before showing value, wastes
every dollar of acquisition the rest of this track generates. This prompt makes the front door
convert at the bar of Vercel / Linear / Stripe.

## Current state (read before you write)
- `pages/home.html` is the landing surface and already contains a **press/partner strip**
  (grep `press-strip` / `press-logo` — the markup and styles exist around line 294+). That's
  real social proof to feature, not invent.
- `public/features.json` is the feature registry (large — the source of truth for what to
  showcase). `data/pages.json` is the page registry. The hero/value-prop today — read it and
  judge honestly against the bar: is the value prop sharp in five words? Is there an above-the-
  fold wow? Is the CTA hierarchy clear or a wall of equal-weight buttons?
- B1 ships the first-run path the primary CTA must drop into; B3 ships the event taxonomy
  conversion is measured with; B4 ships the share cards and referral proof. Build on them.
- The gap: the landing isn't conversion-optimized — value prop, above-fold wow, CTA hierarchy,
  and measured social proof need a deliberate pass.

## Your mission
### 1. Sharpen the value proposition above the fold
One sentence a stranger understands in three seconds: what three.ws is and the one thing it
lets them do *right now*. Supporting subhead, then the primary CTA. No jargon, no coin-pitch
in the hero — the value is the product. Real, on-token typography and spacing rhythm.

### 2. Make the above-the-fold a live "wow", not a static screenshot
Per `00b-the-bar.md` §2/§3: a real, progressively-loaded 3D moment — a rigged avatar idling,
or a rotating freshly-forged model — that loads behind a real skeleton, lazy-loads Three.js,
hits 60fps, disposes GPU resources, and never blocks LCP (< 2.5s, CLS < 0.1). The wow must be
real (an actual GLB/companion), never a video of a feature that then 404s.

### 3. Build a clear CTA hierarchy that drops into B1's first-run
One unmistakable primary CTA ("Forge a 3D model free" / "Type anything → get a model") wired to
B1's <60s first-run path — no signup wall before the wow. Secondary CTAs (explore agents, walk
companion, docs) are visibly subordinate. Every CTA carries B3's `data-cta`/funnel attributes
so conversion is measured. No dead or "coming soon" buttons.

### 4. Feature real social proof
Elevate the existing press/partner strip (don't fabricate logos — use what's already there).
Add credible, real proof: live counts (models forged, agents created, $THREE-gated unlocks)
pulled from real endpoints with honest empty/loading states — never hardcoded vanity numbers.
Surface a real shared model or agent card from B4's OG system as living proof of the product.

### 5. Tell the product story down the page
Below the fold, a tight, scannable walk through the real surfaces (Forge, walk companion,
agents, marketplace, $THREE) sourced from `public/features.json` — each with a real
screenshot/3D snippet and a working link to the actual surface. Every link goes somewhere real;
every section earns its scroll. Mobile-first at 320 / 768 / 1440px.

### 6. Measure conversion end-to-end
Emit B3's funnel events: `landing.viewed` (exists), hero CTA clicked, scroll-depth milestones,
section CTA clicks, first-run entered. The home page's conversion rate must be a number on B3's
dashboard — verify the events fire in the network tab.

## Definition of done
Maps to `00b-the-bar.md` §2 (LCP < 2.5s, CLS < 0.1, progressive 3D, no FOUC), §3 (screenshot
test, all states, responsive, a11y), and §5 (no pre-wow signup wall, conversion measured).
Specifically: a sharp above-the-fold value prop + live 3D wow that hits the performance bars
(measured in Lighthouse mentally / via `.lighthouserc.json`); a clear CTA hierarchy whose
primary action enters B1's first-run with no signup gate; real, honest social proof (existing
press strip + live counts with designed empty/loading states); every section link resolves;
conversion events flow to B3; keyboard/screen-reader/reduced-motion clean; no console errors.
**Also inherits the global definition of done in `00-README-orchestration.md`.**

## Operating rules (override defaults)
No mocks/fake data/placeholders/TODOs — no fabricated counts, no fake testimonial, no canned
hero video, no `setTimeout` wow. `$THREE` is the only coin referenced anywhere on the page.
Design tokens only — no hardcoded colors/spacing/fonts. Stage explicit paths only (never
`git add -A`); re-check `git diff --staged` before commit. **You own `pages/home.html`'s
layout and markup** — coordinate with B1 (it added only a first-run trigger hook) and B3 (it
added only `data-cta` attributes); preserve their hooks, restyle freely around them. Extend the
existing home surface; don't replace the whole page wholesale.

## When finished
Run the five self-review checks. Ship one improvement — e.g. an A/B-ready hero variant flag
wired to B3, or a "made on three.ws" live gallery rail fed by B4's share records. Append a
`data/changelog.json` entry (tag `improvement`/`feature`). Then delete this prompt file
(`prompts/production-campaign/B-growth/B6-home-landing-conversion.md`) and report the value
prop, the measured LCP/CLS, the CTA→first-run wiring, the real social proof you surfaced, and
the conversion events — the last seam that closes Track B's funnel loop.
