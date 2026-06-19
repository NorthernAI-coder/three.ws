# Repo hygiene audit — 2026-06-19

A pass over the "table stakes" every serious project should have: GitHub community
health, repository config, SEO/agent discoverability, and social/metadata wiring.
The platform was already strong on most fronts — this records what existed, what
was missing, what was added in this pass, and what still needs a human (it can't be
automated from the repo).

## Already in place (verified, no action needed)

- **Licensing & conduct**: `LICENSE` (Apache-2.0), `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`.
- **Changelog**: curated `data/changelog.json` → `CHANGELOG.md` + `public/changelog.{json,xml}`, with Telegram push (`npm run changelog:push`).
- **SEO / crawler**: `public/robots.txt`, dynamic sitemap via `/api/sitemap` + `/api/sitemap/[type]` (rewritten from `/sitemap.xml`), human-readable `/sitemap` page.
- **Agent discoverability**: `public/llms.txt`, `public/llms-full.txt` (llmstxt.org standard).
- **Security disclosure**: `public/.well-known/security.txt` (securitytxt.org), Solana `actions.json`, chat-plugin manifest.
- **PWA**: `public/site.webmanifest`, favicons (`favicon.ico`, `favicon.svg`, `apple-touch-icon.png`).
- **Editor / formatting**: `.editorconfig`, `.prettierrc.json`, `.prettierignore`, `eslint.config.js`, `knip.config.js`.
- **Dependency automation**: `renovate.json` (Renovate is the configured updater — Dependabot is intentionally **not** used to avoid duplicate PRs).
- **Per-commit gate**: `.githooks/pre-push` runs `npm run typecheck` (wired via `core.hooksPath` in `npm run setup`).
- **Node version**: `engines.node` pinned to `24.x` in `package.json`.
- **People/credits**: `public/humans.txt`.

> **Note on CI:** GitHub Actions are unavailable on this account by design. The Vercel
> build + the `pre-push` typecheck hook are the automated gates. No workflow files
> were added — they would not run. This is deliberate, not an oversight.

## Added in this pass

### GitHub community-health files (`.github/`) — these render on GitHub without Actions

- `ISSUE_TEMPLATE/bug_report.yml` — structured bug form (area dropdown, repro, console output).
- `ISSUE_TEMPLATE/feature_request.yml` — structured feature form (problem → solution → alternatives).
- `ISSUE_TEMPLATE/config.yml` — disables blank issues; routes to Discussions, the private security advisory flow, X, and docs.
- `PULL_REQUEST_TEMPLATE.md` — wired to the CLAUDE.md Definition of Done and the changelog rule.
- `SECURITY.md` — GitHub-rendered security policy mirroring `security.txt` (private advisories + security@three.ws).
- `CODEOWNERS` — default + high-blast-radius paths (contracts, payment rails, published SDKs, MCP server).
- `FUNDING.yml` — coin-agnostic Sponsor button linking to the product (never a token).

### Repository config

- `.nvmrc` — `24`, matching `engines.node`, so `nvm`/`fnm`/Vercel pick the right runtime.
- `.gitattributes` — LF normalization, LF-locked shell/hooks, binary handling for 3D/media assets, and `linguist-generated`/`-diff` on lockfile + generated outputs (cleaner diffs and accurate GitHub language stats).

### Metadata corrections

- `package.json`: replaced the stale "drag-and-drop glTF/GLB preview tool" description with the actual platform description; added `homepage`, `repository`, and `bugs`; refreshed `keywords`.
- `public/humans.txt`: added the official X handle (`https://x.com/trythreews`).

## Needs a human (cannot be automated from the repo)

These are real, basic-but-important items that live in external dashboards, not the codebase:

- **GitHub repo settings**: confirm Discussions, Issues, and the Security tab are enabled; add a repo description + topics; set the social preview image (Settings → Options → Social preview).
- **Branch protection** on `main` (requires the GitHub UI; note that without Actions there are no required status checks, so rely on the pre-push hook + Vercel).
- **Social profiles**: ensure X (`@trythreews`), Telegram, and any Discord are linked consistently from the site footer and profiles, with matching avatars/banners.
- **`security.txt` expiry**: currently `2027-04-14` — renew before it lapses.
- **Monitoring/status**: a public status page or uptime monitor for the API, if not already external.
- **Analytics & error tracking**: confirm a privacy-respecting analytics + error-reporting pipeline is live in production.
