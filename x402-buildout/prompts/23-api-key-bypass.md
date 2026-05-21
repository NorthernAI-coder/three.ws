# USE-23: API-Key Bypass — Server lifecycle hook

## Goal
Server-side `onProtectedRequest` hook that allows callers with a valid API key (or other auth) to skip payment entirely. Useful for: internal services, free-tier subscribers, partner integrations, gradual rollout.

## Why
- Not every consumer should pay. Internal services calling our own paid endpoints shouldn't pay themselves.
- Subscribers / partners get a free pass.
- Bot detection or rate-limiting works at the same hook.

## Reference
- Lifecycle hooks: [/tmp/x402-docs/docs/advanced-concepts/lifecycle-hooks.mdx](/tmp/x402-docs/docs/advanced-concepts/lifecycle-hooks.mdx)

## Dependencies
- USE-00, USE-02

## Files to create
- `api/_lib/x402/access-control.js` — `installAccessControl(httpServer, { resolveCaller })`
- `api/_lib/x402/api-keys.js` — Redis-backed API key storage with rate limits

## Files to modify
- Every paid endpoint that benefits: wire the access control hook
- `.env.example` — `INTERNAL_API_KEY` (for internal service-to-service calls)

## Implementation

### Hook
```js
httpServer.onProtectedRequest(async (context, routeConfig) => {
  const apiKey = context.adapter.getHeader("X-API-Key");
  if (apiKey === process.env.INTERNAL_API_KEY) {
    return { grantAccess: true, reason: "internal" };
  }
  if (apiKey) {
    const subscription = await apiKeys.get(apiKey);
    if (!subscription) return { abort: true, reason: "Invalid API key" };
    if (subscription.expiresAt < Date.now()) return { abort: true, reason: "Expired" };
    if (await isRateLimited(subscription.id, routeConfig.path)) return { abort: true, reason: "Rate limit exceeded" };
    return { grantAccess: true, reason: `subscription:${subscription.id}` };
  }

  const oauthToken = context.adapter.getHeader("Authorization");
  if (oauthToken?.startsWith("Bearer ")) {
    const claims = await verifyOAuth(oauthToken.slice(7));
    if (claims?.scopes?.includes(routeConfig.requiredScope)) {
      return { grantAccess: true, reason: `oauth:${claims.sub}` };
    }
  }

  // No bypass — payment flow continues
});
```

### Rate limiting
Sliding-window rate limits per API key per route. Use Redis sorted sets with timestamps.

### Audit trail
Every bypass logged with reason, caller identifier, route. USE-24 picks these up.

### Subscription management
- `POST /api/x402/admin/subscriptions` (admin-only) creates an API key
- `DELETE /api/x402/admin/subscriptions/:id` revokes
- `GET /api/x402/admin/subscriptions/:id/usage` shows usage stats

## Wiring checklist
- [ ] `INTERNAL_API_KEY` set in dev + prod env
- [ ] Internal Vercel functions that hit our own paid endpoints supply this key (no double-payment for our own infra)
- [ ] Subscription API keys created with TTL + rate limits
- [ ] OAuth Bearer tokens accepted where USE-21 declared OAuth in auth-hints
- [ ] Bypass reason logged

## Acceptance
- [ ] Request with `X-API-Key: $INTERNAL_API_KEY` returns 200 with no payment header
- [ ] Request with subscription key + within rate limit returns 200, key usage counter increments
- [ ] Request with subscription key over rate limit returns 403 with clear message
- [ ] Request with invalid OAuth scope falls through to payment flow
- [ ] Request with neither key nor OAuth proceeds through normal 402 flow
