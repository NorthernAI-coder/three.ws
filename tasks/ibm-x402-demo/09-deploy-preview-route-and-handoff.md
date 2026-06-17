# Task 09 — Deploy: three.ws preview route + telemetry + IBM handoff

## Context

three.ws workspace at `/workspaces/three.ws`. Deliverable + verified facts:
[00-PLAN.md](00-PLAN.md). The page is [`pages/ibm/x402-demo.html`](../../pages/ibm/x402-demo.html).

Everything before this made the page excellent. This task ships it: a live preview on three.ws,
optional observability, the changelog entry, and a clean handoff package IBM can drop onto
`live.ibm.com`. Run **after** tasks 01–08.

## Do this

1. **Serve it on three.ws as a preview.** Wire the page into the build so it's reachable at a
   stable URL (e.g. `https://three.ws/pages/ibm/x402-demo.html`, or a clean `/ibm/x402-demo`
   route).
   - Add it as a Vite input in [`vite.config.js`](../../vite.config.js) following the existing
     `pages/**` input pattern.
   - Register it in [`data/pages.json`](../../data/pages.json) (the SoT for the dynamic sitemap
     and SEO pipeline) and run `npm run build:pages`. Respect the existing SEO injectors
     (`inject-seo-meta` / `inject-blog-seo`) — don't fight their ordering.
   - Confirm it builds (`npm run build`) and serves locally (`npm run dev`) at the chosen URL,
     identical to the standalone file.
2. **Optional, privacy-respecting telemetry.** The page will run on a foreign origin. If useful,
   POST client errors to `https://three.ws/api/client-errors` (the existing reporter) — first
   confirm that endpoint sends permissive CORS for a cross-origin `live.ibm.com` POST; if it
   doesn't, either add it or skip telemetry rather than ship a console-erroring beacon. Keep it
   to errors + a single "demo_payment_settled" event at most. No PII, no wallet addresses.
3. **Changelog.** Because this becomes a live three.ws page, append an entry to
   [`data/changelog.json`](../../data/changelog.json): holder-readable title + summary, tags
   `feature` (and `sdk` if you frame the embed snippet as a developer feature). Then
   `npm run build:pages` (it validates the entry and regenerates the changelog artifacts). After
   deploy, `npm run changelog:push` posts it (skip silently if Telegram creds are absent locally).
4. **IBM handoff package.** Produce what IBM needs to host it, in `pages/ibm/`:
   - The final standalone `x402-demo.html` (self-contained; absolute `three.ws` URLs; self-hosted
     fonts from task 02 travel alongside it).
   - Expand `pages/ibm/HOSTING.md` (started in task 02) into a short, complete guide: how to
     host (copy the file + `fonts/`), the **two recommended CSP tiers** (strict Base-only / full
     Base+Solana), the wallet requirements for visitors, the iframe-vs-top-level recommendation,
     and a one-paragraph "what this demonstrates" for the IBM team.
   - A copy-paste **8-line embed snippet** (already in the page) IBM can also use elsewhere.
5. **Self-review the diff.** `git diff` every changed line. Watch the known traps: don't commit
   an `npx vercel build` esbuild bundle into `api/`/`public/`; stage explicit paths only.

## Definition of done

- The page is reachable on three.ws at a stable URL, byte-for-byte equivalent to the standalone
  file. `npm run build` clean.
- `pages.json` + sitemap + SEO meta updated; changelog entry added and validated.
- Telemetry is either wired with confirmed cross-origin CORS or deliberately omitted (no
  console-erroring beacon).
- `pages/ibm/HOSTING.md` is a complete handoff doc with CSP tiers and hosting steps.
- Diff reviewed; only intended paths staged. Run the **completionist** subagent. Push to BOTH
  remotes only after the user approves.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

```bash
git rm "tasks/ibm-x402-demo/09-deploy-preview-route-and-handoff.md"
```

Stage the deletion in the same commit as the implementation. A file that still exists is
unfinished work; a file that is gone has shipped. Do not delete early.
