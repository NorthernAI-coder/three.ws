# Fix 05 — Birdeye / GeckoTerminal upstream 429 (P1, ~175 lines)

## The errors (verbatim)

```
[three-token] birdeye error: Birdeye 429: {"success":false,"message":"Too many requests"}
[api] unhandled Error: GeckoTerminal 429: {"status":{"error_code":429,"error_message":"You've exceeded the Rate Limit..."}}
```

- Birdeye: `/api/three-token/[action]` (173 lines) — the heaviest single external-API failure.
- GeckoTerminal: `/api/ibm/oracle` (2 lines).

## Root cause

We call Birdeye and GeckoTerminal on hot read paths with **no caching, no backoff, and no
fallback chain** for the 429 case, so under normal traffic we blow their rate limits and
the failure propagates as a user-facing error. For `ibm/oracle` the 429 is also
**unhandled** (becomes a 500).

## Required fix

Find the call sites (`grep -rln "birdeye\|Birdeye\|geckoterminal\|GeckoTerminal" api/`).

1. **Cache aggressively.** Token price/market data changes on the order of seconds, not
   milliseconds. Add a short-TTL cache (memory + the shared cache layer) keyed by token/mint
   so repeated requests within the TTL never hit the upstream. Per `CLAUDE.md`, the default
   chart pins `$THREE` — that hot key especially must be cached.
2. **Fallback chain on 429/5xx.** Birdeye and pump.fun/GeckoTerminal already coexist in this
   codebase (see the pump-dashboard memory: `Birdeye → pump.fun fallback`). Wire the same
   pattern here: on Birdeye 429, fall back to the alternate source rather than failing.
   Make the fallback real (no mock/placeholder data — `CLAUDE.md` hard rule).
3. **Exponential backoff + jitter** for transient 429s before giving up, bounded so we never
   exceed the function time budget.
4. **Handle the boundary** in `/api/ibm/oracle`: a GeckoTerminal 429 must become a graceful
   degraded response (cached/last-known value or a clean 503), **never an unhandled 500**.
5. **Use an API key if we have one.** Check `.env` / `vercel env` for `BIRDEYE_API_KEY`
   (and any GeckoTerminal Pro key). If present, authenticate to get the higher rate tier; if
   missing and the platform needs it, surface that to the user once.

## Verification

- Hammer `/api/three-token/<action>` for `$THREE` repeatedly — the upstream is hit at most
  once per TTL; the rest serve from cache; no 429 reaches the client.
- Simulate Birdeye 429 → confirm the fallback source serves real data.
- `/api/ibm/oracle` under upstream 429 returns a clean degraded payload, not 500.
- Post-deploy logs: Birdeye/GeckoTerminal 429 counts drop sharply and never produce 500s.

## Definition of done

Token/market reads are cached with a sane TTL, 429s trigger a real fallback (no fake data),
backoff is bounded, `ibm/oracle` handles the upstream error at the boundary, and any
available API key is used for the higher tier.
