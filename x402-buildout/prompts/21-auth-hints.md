# USE-21: Auth-Hints — Signal OAuth2 / SIWX before payment

## Goal
On paid endpoints where certain `accepts[]` entries require authentication first, declare the `auth-hints` extension so clients know which auth method to use before constructing payment.

## Why
- Some endpoints offer two paths: (1) pay every time, (2) authenticate (OAuth2 or SIWX) and pay reduced rate / get session.
- Without auth-hints, clients can't programmatically discover this option.

## Reference
- Spec: [/tmp/x402-docs/specs/extensions/extension-auth-hints.md](/tmp/x402-docs/specs/extensions/extension-auth-hints.md)

## Dependencies
- USE-00, USE-02
- USE-16 (SIWX) for the SIWX path
- Existing OAuth at `api/auth/persona/*` and `api/wk?name=oauth-protected-resource` for OAuth path

## Files to modify
- Paid endpoints that benefit (e.g., the agent-reputation API): declare `auth-hints` with both OAuth2 and SIWX requirements
- Buyer client: surface auth options to caller, let them choose

## Files to create
- `api/_lib/x402/auth-hints.js` — `declareAuthHintsExtension({ oauth2, siwx })` helper

## Implementation

### Per-route
```js
extensions: {
  "auth-hints": {
    info: {
      authRequirements: [
        {
          acceptIndexes: [0], // first accepts entry
          methods: [
            {
              type: "oauth2",
              auth: { authorizationServers: ["https://three.ws/.well-known/oauth-authorization-server"], scopesSupported: ["read:agent-reputation"] }
            }
          ]
        },
        {
          acceptIndexes: [1],
          methods: [
            { type: "sign-in-with-x", auth: { /* SIWX challenge params */ } }
          ]
        }
      ]
    }
  }
}
```

### Existing OAuth integration
This repo already has OAuth at `/.well-known/oauth-authorization-server` (via `api/wk.js`). Reuse that.

### Auth credentials in transit
Auth credentials (Bearer token, SIWX header) travel as standard HTTP headers — NOT inside the x402 payload. The auth-hints extension just signals which method to use.

### Client surface
Update buyer wrappers to:
1. Detect `auth-hints` in 402
2. Surface choices to caller (e.g., `client.onPaymentRequired` returns a callback letting the caller pick auth method)
3. Attach the right header before retry

## Wiring checklist
- [ ] Existing OAuth server URLs verified (already at `.well-known/oauth-authorization-server`)
- [ ] At least one endpoint demonstrates auth-hints with both OAuth and SIWX options
- [ ] Buyer client respects auth-hints: attempts auth before paying when method matches available credentials

## Acceptance
- [ ] Buyer with valid OAuth2 Bearer token hits the auth-hints route and accesses without paying
- [ ] Buyer without OAuth but with wallet signs SIWX and accesses without paying
- [ ] Buyer without either pays normally
- [ ] auth-hints schema validates per spec (test with the SDK's validator if available)
