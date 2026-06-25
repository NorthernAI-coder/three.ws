# Security requirements — Omniology Arena (mandatory)

These controls are **hard requirements**, not suggestions. The payment path lets
a player's agent wallet pay an endpoint Omniology controls. We verified the
existing `/api/x402-pay` external flow: it is well-defended in most respects
(end user pays from *their own* agent wallet; auth + CSRF required; URL is
SSRF-guarded with DNS-rebinding pinning; the signed Solana tx is constrained to a
single USDC `TransferChecked` — no arbitrary-instruction injection). But three
gaps must be closed before pointing it at any third party, and two more apply to
rendering their content. Any prompt that touches payments or renders Omniology
data MUST implement the relevant items here and prove it in acceptance criteria.

## C1 — Pin the recipient (CRITICAL, blocks launch)
The external flow trusts whatever `payTo` the endpoint returns in the 402
challenge ([api/x402-pay.js](../../api/x402-pay.js) ~line 340) — there is **no
allowlist**. A compromised/malicious Omniology server can return an attacker
address and the player signs USDC to it.
- Obtain Omniology's **fixed** Solana receiving address out-of-band and verify it.
- Enforce an allowlist: reject any `payTo` that is not the pinned address, before
  building/signing. Add `x402_recipient_allowlist` to the agent spend-limits
  shape (`api/_lib/agent-trade-guards.js` `normalizeSpendLimits`) and check it in
  `runExternalFlow` after probing.
- If Omniology says the receiver is "dynamic per contest," that is a **red flag** —
  do not proceed without a verifiable scheme (e.g. a small set of pinned
  addresses, or an on-chain program they control).

## C2 — Cap the amount (CRITICAL, blocks launch)
The external endpoint dictates the charge amount; there is **no platform-wide
ceiling** — only optional per-agent daily/per-tx caps which may be unset.
- Enforce a hard per-call max for the Arena desk (e.g. the known entry fee + a
  small tolerance). Reject any challenge that exceeds it, with a clear message.
- Surface the exact amount + recipient to the player **before** they approve.
  No silent payment.

## C3 — Bound the response (required)
`guardedFetch` has a 20s timeout but **no body-size limit** — a malicious
endpoint can stream gigabytes.
- Cap the external response body (e.g. 1 MB) and reject oversize with an error.
- Validate content-type is JSON before parsing as the contest result.

## C4 — Sanitize and contain rendered content (required)
Omniology supplies agent names, entry titles, winner names, and image URLs.
- Canvas text (screens) is XSS-safe, but anything reaching the **DOM** (compose
  UI, receipts, labels) MUST be escaped/`textContent`, never `innerHTML` with
  partner strings.
- Image/thumbnail URLs MUST be host-allowlisted (or proxied through our server)
  before being loaded as textures — never load arbitrary remote hosts into the
  user's browser. Designed fallback when an image is missing/blocked.
- Treat all partner strings as untrusted: length-clamp, strip control chars.

## C5 — Don't leak users to the partner (required)
Polling Omniology's feed from the browser leaks every viewer's IP to them.
- Proxy the contest feed through a three.ws server endpoint (read-through cache),
  so the partner sees our server, not our users. This also lets us enforce C3/C4
  centrally and cache the ~88s feed cheaply.

## C6 — Data-only boundary (required)
- **Never** embed Omniology's JavaScript, iframe, or third-party script into the
  Arena or any three.ws page. Integrate via data APIs and our own rendering only.
  A compromised partner script would run in our origin — categorically disallowed.

## Containment posture (why this is safe once C1–C6 hold)
With recipient pinned (C1), amount capped (C2), responses bounded (C3), content
sanitized + image hosts allowlisted (C4), users un-leaked (C5), and no partner
code in our origin (C6), even a **fully compromised Omniology** can only: show
wrong contest data on their own screens, or fail submissions. It cannot redirect
funds, overcharge, OOM us, inject content, or run code in our origin. The
residual risk collapses to "is their contest legit" — a business/legal judgment
(see the project-diligence checklist), not a technical exposure.

## Non-technical gates (must clear before placement)
- **Regulatory:** paid-entry + cash (USDC) prizes may constitute gambling/lottery
  unless winners are determined purely by skill. We would be hosting the entry
  point. Confirm how winners are decided and that they're structured/licensed
  appropriately. This is the highest-severity risk and is a go/no-go.
- **On-chain:** verify the prize/treasury wallet is genuinely funded and pays out
  (not just recycling entry fees).
- **Identity & reputation:** domain age, named team, track record. Placing them
  in-world is an implicit endorsement to $THREE holders.
