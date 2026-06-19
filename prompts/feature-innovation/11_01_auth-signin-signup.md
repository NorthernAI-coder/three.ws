# 🚀 Innovation Brief — Sign in / Sign up / Forgot password

> **Task file:** `prompts/feature-innovation/11_01_auth-signin-signup.md`
> **Surface:** `/login`, `/register`, `/forgot-password` (+ completion at `/reset-password`)
> **Primary source:** `public/login.html`, `public/register.html`, `public/forgot-password.html`, `public/reset-password.html`, `public/wallet-login.js`, `src/privy-login.js`, `src/auth/email-auth.js`
> **Atlas reference:** `docs/ux-flows/11-account-dashboard.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is someone arriving at three.ws for the first time — or returning after a gap — who wants to get into their account and start building or managing AI agents. They land on `/login` or `/register`, dedicated full pages (not modals). The catch: three.ws supports **six different ways to authenticate** — email + password (`POST /api/auth/login`), Privy email-OTP, Privy EVM SIWE, Privy Solana SIWS, native on-chain SIWE/SIWS via the wallet drawer, and SAML SSO — every one of which mints the same `__Host-sid` cookie. That breadth is a strength and a liability: most web3 auth screens become a confusing wall of buttons where nobody knows which path is *theirs*.

This feature exists to make multi-method authentication the **smoothest, most trustworthy onboarding in web3** — zero confusion about which method to use, zero dead-ends, and a signature delight (the typing-reactive 3D avatar) that makes people screenshot the login page itself. "Gamechanging" here means: a first-time visitor instantly understands their best path, a returning visitor is recognized and routed in one tap, and the trust signals (privacy-preserving reset, real session verification, honest error copy) make people feel the platform is run by serious people. Auth is the front door — make it the most reassuring, fastest, most beautiful front door in the space.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Linear's login, Vercel's auth, Stripe's dashboard sign-in, Privy's own embedded UX, Rainbow/Phantom connect flows). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user. The bar: a crypto-native who has connected a hundred wallets says "this is the cleanest auth I've used," and a non-crypto user never feels lost among the wallet options.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/login` → `public/login.html`; `/register` → `public/register.html`; `/forgot-password` → `public/forgot-password.html`; `/reset-password` → `public/reset-password.html`. All are dedicated full pages; auth is **never** a modal — gated pages redirect here via `requireAuth()` (`src/auth/email-auth.js`) / `requireUser()` (`src/dashboard-next/api.js`) preserving origin in `?return=` / `?next=`.
- **Source:** inline `<script>` in each HTML file; shared helpers in `src/auth/email-auth.js` (`signInWithEmail`, `registerWithEmail`, `getCurrentUser`, `signOut`, `requireAuth`); Privy paths in `src/privy-login.js`; native wallet connect buttons loaded by `public/wallet-login.js` (from `/wallet/connect-button*.js`).
- **Current flow:**
  - `/login` — 9 required steps (+6 optional): on-load `GET /api/auth/me` guard (redirect to `next` if already signed in, default `/dashboard`); email/username + password → `POST /api/auth/login` `{email,password,remember}`; success persists `3dagent:last-email` + `localStorage['3dagent:auth-hint']`, avatar dances, then `location.replace(next)`. Optional: Privy email-OTP (`sendCode`/`loginWithCode` → `POST /api/auth/privy/verify`), Privy EVM SIWE, Privy Solana SIWS (`GET /api/auth/siws/nonce` → `POST /api/auth/siws/verify` with `x-csrf-token`), native on-chain drawer (state in `sessionStorage['login:onchain']`), SAML SSO (shown only if `GET /api/config` returns `samlEnabled`, navigates `/api/auth/saml/login?next=…`).
  - `/register` — 8 required (+2 optional): on-load `me` guard (default `next` = `/create`); **username** (3–30, `[a-zA-Z0-9_-]`) + password (min 10) with live strength meter → `POST /api/auth/register` → server mints a session immediately (signed in on register) → `location.replace(next)`. Same optional Privy/wallet paths; drawer state in `sessionStorage['register:onchain']`.
  - `/forgot-password` — 6 required (+1 completion step on `/reset-password`): email → `POST /api/auth/forgot-password` → **always 200**, privacy-preserving notice ("If an account exists…"). Completion: `/reset-password?token=…` → new password + confirm (both min 10, must match) → `POST /api/auth/reset-password` → "Password reset. You can now log in."
- **What works today:** All six auth methods work and mint the same `__Host-sid` cookie. The typing-reactive 3D avatar (`@three-ws/agent-ui` / `/avatars/cz.glb` model-viewer) covers its eyes on credential focus, facepalms on errors, and dances on success. Already-auth guard, Caps-Lock warning, password-strength meter, live username/email validation, per-field inline errors with shake, SSO error-code mapping from URL params, `?signed_out` notice, wallet skeleton shimmer, Privy CAPTCHA (Turnstile), and Solana-provider auto-fallback to EVM are all present.
- **Real APIs / dependencies already wired:** `GET /api/auth/me`, `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, `POST /api/auth/privy/verify`, `GET /api/auth/siws/nonce`, `POST /api/auth/siws/verify`, `GET /api/config`, `/api/auth/saml/login`; Privy JS SDK (`@privy-io/js-sdk-core`, app id from `/api/config`), Cloudflare Turnstile, browser wallet providers (`window.ethereum`, Phantom/Backpack/Solflare), `@three-ws/agent-ui` avatar, model-viewer CDN.
- **Where it's mediocre, thin, or unfinished:** The six methods compete for attention with no intelligent prioritization — a returning user who last used Solana SIWS still has to hunt for it. There is **no "last method used" memory** beyond `3dagent:last-email`, no recognized-returning-visitor treatment, no method recommendation. The two pages (`/login`, `/register`) duplicate large amounts of inline script that drift apart. Error copy is honest but generic; there's no progressive trust-building (why is each method safe?). The avatar delight is real but isn't tied to *which* method you're using. The reset flow is correct but cold — no strength guidance continuity, no "you're almost there" momentum. SSO discovery is binary (button appears or doesn't) with no domain-based detection. Wallet drawer is buried behind a click with no signal of *which* wallets are actually installed.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Smart method recall & one-tap return.** Persist the *last successful method* (not just email) in `localStorage` and, on load, surface it as the hero CTA ("Continue with Solana wallet" / "Continue with email") while collapsing the rest into a clean "Other ways to sign in" disclosure. A returning Phantom user taps once. Detect installed wallet providers up front and only show what's actionable, labeled by the real wallet name and icon.
- **Avatar as a live auth narrator.** Make the typing-reactive avatar method-aware: it watches the password field (eyes covered), reacts to wallet-signature requests ("waiting for your signature…" pose), celebrates the *specific* method on success, and gives a reassuring gesture during the privacy-preserving reset. Tie its micro-states to real auth events, not timers — turn the front door into the thing people screenshot.
- **Unify the auth client into one module.** Extract the duplicated inline logic from `/login` and `/register` into a single shared controller (alongside `src/auth/email-auth.js`) so both pages, all six methods, every error map, and the avatar choreography live in one place. Consistency compounds; drift is the enemy.
- **Domain-aware SSO discovery.** When a user types a work email, probe `/api/config` (or a lightweight org lookup) and, if their domain is SAML-enabled, *promote* the SSO path inline ("Looks like your team uses SSO — continue with your company login") instead of hiding it behind a static button.
- **Trust microcopy that earns the click.** Each method gets a one-line, honest "why this is safe" affordance (passwords never leave hashed; wallet sign-in never spends; reset is privacy-preserving — we never reveal if an account exists). Make security legible without lecturing.
- **Cross-feature wiring:** carry `?return=`/`?next=` perfectly through *every* method (including the wallet drawer and SSO round-trips) so a user redirected from `/dashboard`, `/create`, or any gated agent surface lands exactly where they were. On first successful auth, hand off the recognized identity to the dashboard greeting (`home.js`) and the `localStorage['3dagent:auth-hint']` chrome so the very next surface already feels personalized. If the user arrived via a referral link, ensure `claimPendingReferral()` fires once the session exists.

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
4. **Delete this task file** — `prompts/feature-innovation/11_01_auth-signin-signup.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/11-account-dashboard.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
