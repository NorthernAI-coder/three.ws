# 🚀 Innovation Brief — Settings (account control & app preferences)

> **Task file:** `prompts/feature-innovation/11_03_settings.md`
> **Surface:** `/settings` (identity / security / connected accounts / danger zone) and `/dashboard/settings` (app & dashboard preferences)
> **Primary source:** `public/settings/index.html`, `src/dashboard-next/pages/settings.js`, `pages/dashboard-next/settings.html`, `src/dashboard-next/shell.js`, `src/dashboard-next/api.js`
> **Atlas reference:** `docs/ux-flows/11-account-dashboard.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is an account holder who wants to **control their identity, secure their account, manage connections, and tune the product to their taste** — and feel completely safe doing it. three.ws has **two distinct settings surfaces** by design: `/settings` is the identity/security hub (profile, account/email, privacy, sessions, connected accounts like GitHub/X, danger-zone deletion), and `/dashboard/settings` is the app-preferences surface (theme, active sessions, notifications, default payment network, storage/LLM usage meters, preferences, data export). Neither redirects to the other; they overlap only on the concept of "sessions," each with its own UI and revoke calls.

This feature exists to make account control **clear, safe, and confidence-inspiring** — and to **resolve the two-surface overlap** so users never wonder "which settings page do I need?" "Gamechanging" means: high-stakes actions (sign out everywhere, delete account, revoke a session) feel safe and reversible-where-possible with honest consequence copy; every preference change is instant and obviously persisted; security state (verified email, active sessions, connected accounts) reads like a trust dashboard; and the two surfaces become one coherent mental model. Match the bar set by Stripe, Linear, Vercel, and GitHub settings — surfaces people trust with their most sensitive actions.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (GitHub settings + security log, Stripe account settings, Linear preferences, Vercel team settings, 1Password/Apple account-security surfaces). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user. The bar: a security-conscious user lands on settings and immediately understands their account's posture, can act on any risk in one tap, and never fears clicking the wrong button.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/settings` → `public/settings/index.html` (standalone page, inline module script). `/dashboard/settings` → `pages/dashboard-next/settings.html` → `src/dashboard-next/pages/settings.js` (uses `shell.js` + `api.js`). They are **intentionally separate** — neither redirects to the other. `/dashboard/sessions`, `/dashboard/voice`, `/dashboard/storage` and several legacy routes 301 to `/dashboard/settings`.
- **Source:** `/settings` is fully inline in `public/settings/index.html` with hash-routed tabs (`#profile`, `#account`, `#privacy`, `#sessions`, `#connected-accounts`, `#danger`); gated by `loadUser()` → `GET /api/auth/me` (no user / 401 → `/login?next=/settings`). `/dashboard/settings` is gated by `requireUser()` (401 → `/login?return=…`).
- **Current flow:**
  - `/settings` (3 required +5 optional): `GET /api/auth/me` → tabbed UI (default `#profile`). **Profile:** display name (max 80) + username (3–30, pattern-validated, live profile-URL preview) → `PATCH /api/auth/profile` → "Saved!" (4s). **Account:** read-only email with Verified/Unverified badge (`user.email_verified`), password "Reset via email ↗" → `/forgot-password`, connected-wallets count from `GET /api/auth/wallets` (manage at `/dashboard/account`), plan display (→ `/dashboard#billing`), **Sign out everywhere** → `POST /api/auth/logout-everywhere` → clear localStorage → `/login`. **Privacy:** default avatar visibility (private/unlisted/public) → `localStorage['3dagent:default-vis']` (local only) → "Saved preference." **Sessions:** `GET /api/auth/sessions` → "Revoke" `DELETE /api/auth/sessions/{id}`; "Revoke all other" `DELETE /api/auth/sessions` → reload. **Connected Accounts:** GitHub `GET /api/auth/github/status` + connect `/api/auth/github/connect?agent_id=…` + seed `POST /api/agents/{id}/memory-seed`; X `GET /api/agents/{id}/memory/seed/x` + connect `/api/auth/x/connect?agent_id=…` + seed `POST /api/agents/{id}/memory/seed/x`; supports `?agent_id=` prefill. **Danger Zone:** type "delete my account" to enable → **Permanently delete** → `DELETE /api/auth/me` → clear localStorage → `/?deleted=1`.
  - `/dashboard/settings` (3 required +6 optional): `mountShell()` → `requireUser()` → 4 skeletons → parallel `GET /api/auth/sessions`, `GET /api/notifications?limit=20`, `GET /api/billing/summary` (storage), `GET /api/usage/summary` (LLM usage) + dashboard prefs → sections: Appearance/theme, Active sessions, Notifications, Default payment network, Storage usage, LLM usage, Vanity wallet tools, Preferences, Data export, About. **Theme:** Dark/Light/Auto → `localStorage['twx_theme']` (+ `window.threeTheme.set`) → "Theme applied" (no API). **Sessions:** "Revoke" `DELETE /api/auth/sessions/{id}`; "Revoke all other" `POST /api/auth/sessions/revoke-others`. **Notifications:** "Mark all read" `POST /api/notifications/read-all`. **Default network:** Base/Solana/Polygon → `localStorage['twx_default_network']` + best-effort `PATCH /api/dashboard/prefs` `{prefs:{default_network}}`. **Preferences:** email notifications / show tips / compact sidebar → **Save preferences** `PATCH /api/dashboard/prefs`. **Data export:** Agents/Avatars/All → `GET /api/agents`, `GET /api/avatars?limit=100`, `GET /api/widgets` → JSON blob download.
- **What works today:** Both surfaces fully boot and gate correctly. Profile edit with live URL preview, email verified badge, sign-out-everywhere, session listing + per-session and bulk revoke (on *both* surfaces, with different endpoints — `/settings` uses `DELETE /api/auth/sessions`, `/dashboard/settings` uses `POST /api/auth/sessions/revoke-others`), GitHub/X connect + memory seeding, type-to-confirm account deletion, theme switching, notifications mark-all-read, default-network preference, preferences save, JSON data export, read-only storage/LLM meters. Inline `.ok`/`.err` messaging and toasts.
- **Real APIs / dependencies already wired:** `GET /api/auth/me`, `PATCH /api/auth/profile`, `GET /api/auth/wallets`, `POST /api/auth/logout-everywhere`, `GET /api/auth/sessions`, `DELETE /api/auth/sessions/{id}`, `DELETE /api/auth/sessions`, `POST /api/auth/sessions/revoke-others`, `GET /api/auth/github/status`, `/api/auth/github/connect`, `POST /api/agents/{id}/memory-seed`, `GET`/`POST /api/agents/{id}/memory/seed/x`, `/api/auth/x/connect`, `DELETE /api/auth/me`, `GET /api/notifications`, `POST /api/notifications/read-all`, `GET /api/billing/summary`, `GET /api/usage/summary`, `PATCH /api/dashboard/prefs`, `GET /api/agents`, `GET /api/avatars`, `GET /api/widgets`.
- **Where it's mediocre, thin, or unfinished:** **The two-surface overlap is the core problem** — "sessions" exists on both pages with *different endpoints and different UI*, and a user has no idea which "Settings" a nav link will take them to. There's no cross-link between the two surfaces, no shared header that says "you're in Account vs App settings." Privacy default-visibility and theme are localStorage-only with no real persistence or cross-device sync. There's no security overview/posture summary (e.g. "email unverified, 3 active sessions, 1 connected account") — the security-critical info is scattered across tabs. Session rows are thin (device/IP/date) with no "this is your current session" marker, no suspicious-session highlighting, no last-active sort. The danger zone is correct but cold — no export-before-delete prompt, no clear list of what gets deleted. Connected Accounts is agent-scoped and confusing outside an agent context. The two pages duplicate session logic that should be one component.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Resolve the two-surface overlap with one clear model.** Establish an explicit, shared mental split: `/settings` = "Account & Security" (who you are, how you sign in, what's connected, deletion); `/dashboard/settings` = "App Preferences" (how the product looks and behaves). Add a consistent header/sub-nav on both that names the surface and cross-links to the other ("Looking for theme & notifications? → App Preferences"). Unify the duplicated session logic into a single shared component used by both, with one canonical revoke behavior.
- **A security posture panel.** Lead `/settings` with a computed at-a-glance security summary from real state: email verified?, active session count + locations, connected accounts, last password reset, primary wallet set. Each item is a one-tap action to improve posture (verify email, revoke sessions, set primary wallet). Make account security legible the way GitHub's security log is.
- **Session intelligence.** Mark the current session ("This device"), sort by last-active, flag sessions from new locations/devices, and make "revoke all other" a confident one-tap with honest consequence copy. Show real device/IP/last-active from the sessions API.
- **Safe-by-design danger zone.** Before deletion, offer a one-click "export all my data first" (reuse the existing `/api/agents` + `/api/avatars` + `/api/widgets` export), show an itemized list of exactly what will be permanently removed (agents, avatars, revenue history, wallets), and keep the type-to-confirm gate. Make irreversible actions feel deliberate, never accidental.
- **Real preference persistence + cross-device sync.** Move theme and default-visibility from localStorage-only to best-effort server prefs (`PATCH /api/dashboard/prefs`) with local-first optimistic UX, so settings follow the user across devices. Keep the instant local apply; sync underneath.
- **Cross-feature wiring:** link the security panel's "verify email" to the real verification path; link connected-accounts seeding to the agent memory surfaces it actually feeds; link default payment network to the monetization/checkout surfaces that consume it; link "manage wallets" to `/dashboard/account` and "billing/plan" to the dashboard billing surface; ensure sign-out-everywhere and account deletion clear the same `localStorage['3dagent:auth-hint']` that login set, so chrome across the platform reflects the new state immediately.

> These are starting points, not a checklist. The best idea may not be listed — find it. Think second-order: how does improving this unlock value in adjacent three.ws features? **Wire those connections.** The best platforms feel like everything is linked.

## 5. Hard rules (non-negotiable — from `CLAUDE.md`)

- **Real APIs, real data, real integrations. No mocks, no fake/sample arrays, no placeholders, no `setTimeout` fake-loading or fake progress.** If credentials are missing, find them in `.env` / `.env.example` / `vercel env` — then proceed.
- **Wire 100%.** Every button works, every link goes somewhere, every reachable state exists. Design *every* state: loading (skeletons over spinners), empty (tell the user what to do next), error (actionable recovery), populated, and overflow (0 / 1 / 1000 items, very long strings, mid-operation network failure, expired session).
- **No TODO comments, no stubs, no `throw new Error("not implemented")`, no commented-out code.** If you write it, finish it.
- **No errors without solutions.** Every error has a root cause; every root cause has a fix. Ship failsafes, not lazy propagation.
- **$THREE is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never name, add, hardcode, link, render, or recommend any other coin anywhere — code, copy, tests, fixtures, commits. The only exceptions are coin-agnostic runtime plumbing (user supplies a mint) and platform launch records rendered at runtime.
- **Read before you write.** Match the existing patterns, naming, file organization, and the design tokens in `DESIGN-TOKENS.md`. Consistency compounds.
- **Accessibility + responsive (320 / 768 / 1440) + microinteractions** are part of done, not polish. Semantic HTML, ARIA, keyboard nav, focus rings, sufficient contrast.
- **Performance by default:** lazy-load heavy modules, debounce input handlers, paginate large lists, animate with `transform`/`opacity`. Ship no jank.
- **Changelog:** append a holder-readable entry to `data/changelog.json` for any user-visible change, then run `npm run build:pages` to validate.
- **Concurrent agents share this worktree.** Stage explicit paths only — **never** `git add -A` / `git add .`. Re-check `git status` + `git diff --staged` immediately before any commit. Never commit `api/*.js` esbuild bundles (check `head -1` for `__defProp` / `createRequire`).

## 6. Definition of done

- [ ] Feature is built, wired into navigation, and reachable by a real user.
- [ ] Exercised in a real browser via `npm run dev`; **no console errors or warnings** from your code.
- [ ] Network tab shows real API calls succeeding with real data.
- [ ] Every interactive element has hover / active / focus states; fully keyboard-navigable.
- [ ] Loading, empty, error, populated, and overflow states all designed and reachable.
- [ ] Existing tests pass (`npm test`); add tests for new logic you introduce.
- [ ] `git diff` self-reviewed — every changed line justified.
- [ ] Changelog updated if the change is user-visible.
- [ ] You would be proud to demo this to a room of senior engineers.

> Note: do **not** run `npm install` in this codespace (the cache is corrupted and it hangs the box). Use the already-installed dependencies.

## 7. Self-improvement loop (REQUIRED before you finish)

When you think you're done: **STOP.** Re-read §2.

1. Find the single weakest aspect of what you built and make it excellent. Repeat until nothing obvious remains.
2. Run the self-review protocol: **lazy check** (any shortcut, any half-wire, any hardcoded value where dynamic belongs?), **user check** (first-time user — does it make sense, is it findable, does it feel polished?), **integration check** (connects to the rest of the platform, navigable to/from?), **edge-case check** (0 / 1 / 1000, long names, network failure, expired session), **pride check** (portfolio-worthy? if not, fix what's stopping you).
3. Update `data/changelog.json` if user-visible.
4. **Delete this task file** — `prompts/feature-innovation/11_03_settings.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/11-account-dashboard.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
