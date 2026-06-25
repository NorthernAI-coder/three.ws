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

## C7 — Inspect the transaction before signing (CRITICAL, blocks launch)
**This is now the central control.** Omniology's real submit flow is NOT x402: the
engine returns a base64 `pending_tx` that **we sign with the player's agent key
and broadcast** (CONTRACTS §1.3). Signing a transaction a third party built is
the highest-risk operation in the whole integration. Before signing, the server
endpoint MUST fully decode `pending_tx` and assert ALL of:
- It contains **exactly one** SPL `TransferChecked` of the USDC mint (canonical
  mainnet mint read from the repo), for **exactly** `expected_fee_micro_usdc`,
  to the contest's `deposit_address` from the **proxied** `/active` feed (not a
  value pulled from the same step-1 response alone — cross-check against the feed).
- **No other instructions**: no `Approve`/`SetAuthority`/delegate, no additional
  transfers, no SOL movement charged to the agent, no unknown programs.
- `feePayer` is **Omniology's** account, not the agent (they pay network fees).
- A sane recent blockhash; reject if it tries to make the agent the fee payer.
Reject and do not sign if any assertion fails. Cover this with a unit test that
feeds a tampered `pending_tx` (wrong recipient, extra instruction, inflated
amount) and asserts rejection.

## C1 — Cross-check the recipient + cap the amount (CRITICAL, blocks launch)
The `deposit_address` is **per-contest** (returned in the feed), so a single
static allowlist doesn't fit. Instead:
- The recipient is verified transitively by C7: the signed transfer must pay the
  `deposit_address` that OUR server-side proxy fetched from `/active` over TLS —
  not an address asserted only by the step-1 enter response.
- Because the address is dynamic, the **hard per-entry USDC cap is the real
  backstop**: reject any `expected_fee_micro_usdc` above a small ceiling (e.g.
  ≤ $0.10). Sub-cent fees mean worst-case loss per entry is negligible even if
  the engine is compromised. Surface the exact fee + contest to the player before
  they confirm.
- If Omniology ever asks us to sign anything that is not a single sub-cent USDC
  transfer to a feed-published pool address, **stop** — that is the red flag.

## C2 — (folded into C1)
The Omniology flow has no separate attacker-set "amount" step to cap beyond the
per-entry ceiling already covered in C1 + the transaction inspection in C7. Keep
the rule: **show the player the exact fee + contest before they confirm; never
sign silently.**

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
