# B06 — Auth (sign-in/up, session, wallet) production pass

> Phase B · Depends on: none (foundational) · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
Auth is the foundation under every paid action and saved asset. Confusing sign-in, silent
session expiry, or wallet mismatches quietly destroy conversion and trust. Make the entire
identity layer obvious, resilient, and secure across email, social, and wallet.

## Where this lives (real files)
- `src/wallet-auth.js`, `pages/login.html` (+ register flow).
- `api/_lib/auth.js` — OAuth/JWT, refresh tokens, session rotation, CSRF, API keys, Privy.
- `api/_lib/agent-wallet.js` — custodial wallet binding.

## Current state & gaps
- Session timeout / expiry handling not surfaced to the user; "remember me" persistence unclear; social-login + wallet-connect error messaging basic; no clear re-auth on session/wallet mismatch.

## Build this
1. **Clear flows:** designed states for email, GitHub/social, and wallet sign-in + sign-up; specific errors (wrong creds, unverified email, popup blocked, wallet rejected) with recovery.
2. **Session lifecycle:** on expiry, a non-destructive "your session expired — sign in to continue" prompt that resumes the in-progress action; honor refresh-token rotation; "remember me" with a documented, secure persistence.
3. **Wallet ↔ account binding:** handle the case where the connected wallet differs from the signed-in account (prompt to switch/link, never silently act); make linking/unlinking wallets clear.
4. **Email verification + reset:** working verify + password-reset with sensible link expiry and duplicate-email handling.
5. **Security:** preserve CSRF + HttpOnly cookies; never expose tokens to JS; rate-limit auth attempts; (optionally) bind session to coarse device/IP signal with mobile tolerance.
6. **A11y + mobile:** labels, focus, keyboard, 320px.

## Out of scope
- Deep token-binding/replay hardening (that's **G05/E08**) beyond the basics here.

## Definition of done
- [ ] All sign-in/up paths work with specific, recoverable errors; verification + reset work.
- [ ] Session expiry prompts and resumes the user's action; wallet/account mismatch handled explicitly.
- [ ] Auth attempts rate-limited; tokens never exposed; a11y + mobile verified.
- [ ] `npx vitest run` green; changelog entry; committed + pushed to both remotes.

## Verify
- Sign in via each method; let a session expire mid-action and confirm resume; connect a wallet that differs from the account.
