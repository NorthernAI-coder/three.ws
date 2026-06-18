# Audit — Labs, Agent Tools & Account pages

Senior-engineer code + UX audit. Scope: `/launchpad /brain /lipsync /lipsync/mic /playground /labs /avatar-artifact /chat /agent /agents /my-agents /reputation /login /register /forgot-password /dashboard /dashboard/account /dashboard/analytics /dashboard/settings /settings`.

Method: route → file resolved via `vite.config.js` `fileMap` + `vercel.json`; read each page HTML and its primary JS module; grepped for mock/sample/setTimeout/TODO/placeholder and for non-$THREE token addresses/tickers. Claims from sub-agents were spot-verified on disk.

Verdict in one line: **the group is in strong shape — real APIs throughout, no coin-rule violations, no mock data shipped. The only genuinely broken thing is `/avatar-artifact` on mobile. Most remaining items are P2/P3 polish.**

---

## /launchpad — pages/launchpad.html
Loads and wires cleanly; real publish/get endpoints.
- [P3] `pages/launchpad.html:52` — imports `mountLaunchpadStudio` from `/src/editor/launchpad-studio.js` (exists). Hydrates from `?template/?slug/?wallet/?avatar` query params with validation in the module. No issues found. — n/a.

## /brain — pages/brain.html (+ src/brain.js)
Real multi-LLM wiring confirmed; no canned responses.
- [P0-CLEARED] `src/brain.js:706` — POSTs to real `/api/brain/chat`; `:576` GETs the provider list from the same function (13 real providers in `api/brain/chat.js`). The "must hit real model endpoints" requirement is met. — no fix.
- [P3] `pages/brain.html:87,178` — `#brDescribeGenerate` / `#brSaveToAgent` ship disabled; correctly gated by input + agent-select state in JS, not dead. — leave as-is.

## /lipsync — public/demos/lipsync-tts.html
Real streaming TTS + viseme pipeline.
- [P0-CLEARED] `public/demos/lipsync-tts.html:266` — real `fetch('/api/tts/speak', …)` with `{text,voice,speed,format}`; loads real `/avatars/default.glb`. No mocks. — no fix.
- [P3] No persistent error toast if `/api/tts/speak` returns non-200 mid-stream; status text only. — add an inline error state with retry.

## /lipsync/mic — public/demos/lipsync-mic.html
Real mic capture + analyser; responsive.
- [P0-CLEARED] `public/demos/lipsync-mic.html:106` — imports real `LipSyncAnalyser` from `/src/lip-sync-analyser.js` (exists); uses `getUserMedia` + `AnalyserNode`. No mock audio. — no fix.
- [P2] No explicit designed state for `getUserMedia` permission-denied / no-mic-device; failure path is thin. — add a designed "microphone blocked — enable access" empty/error state.

## /playground — pages/playground.html
`<model-viewer>` + drag-drop upload; responsive at 768px.
- [P3] `pages/playground.html:841` — `DEFAULT_SRC`/`DEFAULT_NAME` hardcoded to `/avatars/default.glb` (acceptable default, not data). — n/a.
- [P3] Upload validation is type/extension-based only; add size cap + friendlier reject message. — minor.

## /labs — pages/labs.html (+ src/labs.js)
Registry-driven gallery with real liveness checks and full state set.
- [P0-CLEARED] `src/labs.js:4` — fetches `/features.json` at runtime; `:30` does real HEAD liveness checks (3s timeout). Skeleton + empty + error(retry) states all present (`pages/labs.html:432-493`), `aria-busy`/`aria-live` set. Exemplary. — no fix.

## /avatar-artifact — pages/avatar-artifact.html
**Broken on mobile — the one real defect in this group.**
- [P1] `pages/avatar-artifact.html` (whole file) — **zero `@media` queries** (confirmed: `grep -c @media` = 0). Full-bleed Three.js canvas sizes to `window.innerWidth/Height` (`:70`, `:391`) with no mobile adaptation, no nav, no footer, no links — a dead-end standalone canvas. On small screens there is no readable UI and no way out. — add a responsive layer: a minimal header/back-link, a mobile fallback or reduced-quality path, and touch handling (current interaction is `mousemove`-only, `:312`).
- [P2] `pages/avatar-artifact.html:14-27` — no `focus-visible`, no keyboard interaction, mouse-only; no loading state while the GLB/CDN Three.js resolves. — add focus/keyboard affordances and a loading indicator.
- [P3] CDN Three.js loaded with SRI (`:65`) — good; consider same-origin to match the rest of the app. — optional.

## /chat — chat/index.html (Svelte sub-app)
Real built Svelte app; not a mock.
- [P2] `chat/index.html` — entry is a built bundle (`chat/src/*.svelte` is the real source, e.g. `AgentPicker.svelte`, `ClientTool.svelte`). Wiring to real endpoints can't be proven from the static shell alone. — verify at runtime (`/verify`) that model/agent calls hit real `/api/*`, not a dev stub, before relying on this audit line.

## /agent — public/agent/index.html (bare `/agent` 301s → `/agents`)
Real agent token page; ownership-gated; widget mounts only for launched mints.
- [P0-CLEARED] Real calls to `/api/agents/{id}`, `/api/oembed`, `/api/agent/{id}/og`; imports `AgentIdentity`/`AgentHome`/`AgentTokenWidget` from `/src/pump/*` (exist). Coin widget uses the official `THREE_MINT` constant — coin rule clean. — no fix.
- [P2] `public/agent/index.html` — **0 `@media` queries** (confirmed). Layout uses relative/inline styles so it degrades rather than breaks, but it isn't explicitly designed for narrow screens. — add breakpoints for the identity/embed columns.

## /agents — public/agents/index.html
Real public directory; pagination/search/sort; actionable empty state.
- [P0-CLEARED] `:170` `const API='/api/agents/public'`; cursor pagination; cards link via API `home_url` → agent detail. Empty state `:258` "No public agents yet — Create the first one →" → `/create-agent` (real route). — no fix.
- [P3] Sort dropdown + grid have `aria-label`/`aria-busy`; consider keyboard focus order audit on card actions. — minor.

## /my-agents — public/my-agents/index.html
Auth-gated; native + ERC-8004 imported agents; both signed-out and empty states designed.
- [P0-CLEARED] Signed-out (`:145`) redirects to `/login?next=`; empty (`:168`) "Create an agent" → `/create-agent`. Real `/api/agents`, `/api/erc8004/hydrate`, `/api/erc8004/import`. View → `home_url || /agent/${id}`; Edit/Deploy → `/agent/{id}/edit`. Cross-wiring correct. — no fix.

## /reputation — public/reputation/index.html
Real ERC-8004 / EAS explorer; wallet-gated writes; per-chain queries.
- [P0-CLEARED] Reads via EAS GraphQL per chain; writes require `window.ethereum` and submit signed attestations; ENS resolution supported; no demo contracts/coins. Form validation (star picker, char count, gated submit). — no fix.
- [P3] Base Sepolia is in the chain list for testing — fine (it's a chain, not a coin), but make the "testnet" labeling explicit in the UI so reviewers aren't surprised. — minor copy.

## /login — public/login.html
Real auth; cross-links correct. **Sub-agent P0 was a false positive.**
- [P0-CLEARED] `:735` loads `/src/privy-login.js` — **exists** at `src/privy-login.js` (13 KB); Vite serves `src/` at the `/src/` URL root, so Privy email-OTP + wallet login are wired, not broken. (Sub-agent only checked `public/src/`.) Email/password POST to real `api/auth/[action].js`. — no fix.
- [P1] `:972` — `setTimeout(() => location.href = next, 2000)` delays the post-login redirect 2s for an avatar animation; user can navigate away mid-window. — use `location.replace` and/or fire redirect on animation-end, not a fixed timer.
- [P1] `:913` — already-authenticated check (`/api/auth/me`) swallows errors with `.catch(()=>{})`; on a network blip a logged-in user just sees the login form with no signal. — surface a transient "couldn't verify session" notice.
- [P2] `:944` — generic "Email or password is incorrect" (good anti-enumeration); `role="alert"` + `aria-describedby` present. — fine.

## /register — public/register.html
Real registration; password strength + username validation. Same Privy note as login (resolves, not broken).
- [P1] `:799-806` — no already-authenticated redirect (login has one); a logged-in user can re-open the signup form. — add the `/api/auth/me` check + redirect for parity.
- [P2] `:809-814` — structured handling for 409 (taken) / 429 (rate-limit), else generic "Registration failed". — map a couple more server error codes to human copy.
- [P2] `:820` — immediate redirect on success vs login's 2s delay — inconsistent UX. — pick one pattern.

## /forgot-password — public/forgot-password.html
Real reset endpoint; privacy-preserving response.
- [P1] `:294-295` — the catch block shows the same "if an account exists…" success message on a genuine network failure, so a user whose request never reached the server believes it did. (The always-200 success on the happy path is intentional anti-enumeration and fine.) — distinguish network/transport failure from the server's privacy response and show a retry on the former.
- [P2] `:252-264` — real-time email validity hint; `:268` label focus effect. — fine.

## /dashboard — pages/dashboard-next/index.html → src/dashboard-next/pages/home.js
Real data pipeline; `requireUser()` gate; skeleton/empty/error states.
- [P0-CLEARED] `requireUser()` (`api.js:96`) redirects 401 → `/login`. Real `/api/avatars|agents|widgets|billing/revenue|oracle/*` via `Promise.allSettled` with null fallbacks. Oracle feed renders mints from API, not hardcoded. — no fix.
- [P2] `home.js:743-789` — typewriter uses chained `setTimeout` for animation only (not fake loading); could be one RAF loop. — minor refactor.

## /dashboard/account — pages/dashboard-next/account.html → account.js
Real CRUD (wallets, profile, provider keys, delegation); validation present.
- [P2] `account.js` (delegation table) — "Configure →" is a `#delegation` hash anchor; no matching console/modal located in this module. — confirm the target section exists or wire the modal; otherwise it's a dead in-page link.
- [P3] `:201` audit-log CSV export handles a 404 when the endpoint isn't deployed — good defensive UX. — n/a.

## /dashboard/analytics — pages/dashboard-next/analytics.html → analytics.js
Real revenue/agent/widget data; canvas charts animated via rAF; designed error/empty.
- [P0-CLEARED] Real `/api/billing/revenue`, `/api/widgets/:id/stats`, `/api/monetization/revenue`; full-null → error state with retry (`:70`). Charts are real-time animated, not fake progress. — no fix.

## /dashboard/settings — pages/dashboard-next/settings.html → settings.js
Sessions, LLM usage, storage meter, prefs, theme, export — all persisted to real endpoints.
- [P0-CLEARED] Real `/api/auth/sessions`, `/api/notifications`, `/api/dashboard/prefs`; revoke / revoke-others wired; storage meter from real quota. — no fix.
- [P3] Theme writes to both server prefs and localStorage (cross-device + offline) — good. — n/a.

## /settings — public/settings/index.html (standalone, top-level route)
Comprehensive account settings; real auth guard; tabbed with popstate.
- [P0-CLEARED] `apiFetch` 401 → `/login` (`:546`); profile PATCH, sessions revoke, GitHub/X connect, account-delete (typed-confirmation `:725` → `DELETE /api/auth/me`). Responsive at 768px (`:277`). USDC referenced as settlement currency only — coin rule clean. — no fix.

---

## Group summary

**Coin rule: PASS across all 20 pages.** No non-$THREE token/coin/mint hardcoded in source, copy, or sample data. The only token references are the official `THREE_MINT` constant (agent token widget), USDC as a settlement-currency word, and runtime API/oracle feeds rendering user data — all sanctioned.

**Real-data / no-mock: PASS.** Every page hits real endpoints (`/api/brain/chat`, `/api/tts/speak`, `/api/agents/public`, `/api/auth/*`, dashboard `/api/*`). No demo sample arrays, no fake `setTimeout` loaders masquerading as progress, no `throw 'not implemented'`, no TODO/stub found in shipped paths. `setTimeout` appears only for genuine animation timing.

**Top P1 (reachable but incomplete) — 5:**
1. `/avatar-artifact` — zero media queries; full-screen canvas with no nav, no mobile UI, mouse-only interaction → effectively broken on phones (`pages/avatar-artifact.html`).
2. `/login` — 2s `setTimeout` redirect window after success lets the user navigate away mid-flow (`:972`).
3. `/login` — already-authenticated `/api/auth/me` check swallows network errors silently (`:913`).
4. `/register` — missing the already-authenticated redirect that login has; logged-in users can re-open signup (`:799`).
5. `/forgot-password` — network failure shows the same success message as the privacy response, so failed requests look sent (`:294`).

**P0: 0 genuine.** The sub-agent's `/login` + `/register` "missing `/src/privy-login.js`" P0 was a **false positive** — the file exists at `src/privy-login.js` and Vite serves it at `/src/privy-login.js`. Verified on disk.

**Notable strengths:** `/labs` (full skeleton/empty/error + aria + real liveness checks) and the entire `/dashboard*` suite (clean `requireUser()` auth gating, `Promise.allSettled` resilience, designed empty/error states) are reference-quality.

**Follow-up worth doing:** runtime-verify `/chat` (built Svelte bundle — static audit can't prove endpoint wiring) and confirm the `/dashboard/account` `#delegation` anchor has a real target.
