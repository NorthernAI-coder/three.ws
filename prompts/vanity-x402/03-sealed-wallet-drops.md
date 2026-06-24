# Task 03 — Sealed wallet drops (end-to-end encrypted crypto gifting)

> Read [00-README-orchestration.md](./00-README-orchestration.md) first.

## The wedge (why this is gamechanging)

Crypto "gift links" today are insecure theatre: the sender generates a key, emails it,
and now the link, the server, and every inbox in between can drain it. There is no
real end-to-end encryption.

Build a **sealed drop**: pay x402 to mint a vanity wallet, optionally pre-fund it
(SOL / USDC / **$THREE**), and deliver it **sealed to the recipient** so the private
key is end-to-end encrypted — unreadable to the link, the server, our logs, anyone
but the claimer. The recipient claims by proving control of their key. And because
this is three.ws, a drop can be **handed out by a 3D agent** at an IRL pin or in a
room — walk up to the agent, scan, claim your sealed wallet.

A memorable address + real funds + true E2E encryption + an embodied agent handing it
to you: nobody has this. It's viral, on-brand, and technically defensible.

## What to build

### Create a drop
- `POST /api/vanity/drops` (x402-paid). Inputs: pattern (optional vanity via the
  grinder), pre-fund amount + asset, claim policy (open link, or sealed to a specific
  recipient X25519 key, or "claim sets the seal" — see below), expiry, optional
  message + theme.
- Pre-funding is **real**: move funds into the freshly-ground address on-chain
  (Solana via [@solana/web3.js](../../api/_lib) + Helius RPC; $THREE via SPL transfer).
  Never fake a balance.
- Two security modes, both real:
  1. **Direct seal** — sender knows the recipient's X25519 pubkey; seal at creation.
  2. **Claim-time seal** — recipient generates an X25519 keypair in their browser on
     claim; the server seals the secret to it **only then**, so the key is never
     transmitted in plaintext and the link alone can't reveal it (claim requires a
     freshly generated recipient key + a one-time claim token). Document the threat
     model honestly (what a leaked link can and cannot do).

### Deliver + claim
- Shareable claim link (`/drop/:id`) + a **Solana Pay**/standard QR
  ([@solana/pay](../../api/_lib), `qrcode`) + a beautiful [@vercel/og](../../api) share
  card showing the vanity address + amount + theme.
- `/drop/:id` claim page: shows the gift (address, amount, message, theme, who it's
  from), generates the recipient key client-side if needed, claims, opens the sealed
  secret **in-browser**, and offers: import into wallet (seed phrase or key), download
  Solana CLI JSON, or sweep into a connected wallet. Designed states: unclaimed /
  claiming / claimed-by-you / already-claimed / expired / wrong-recipient.
- IRL/3D tie-in: let a drop be attached to an IRL pin or room agent (see
  [api/irl/](../../api/irl) and the agent surfaces) so an embodied agent "hands" the
  drop — scanning the agent opens the claim page. Wire it for real if the surfaces
  support it; otherwise ship the link/QR path fully and leave a clean extension point
  (no stub).

## Hard requirements

- The plaintext private key/seed **never** leaves the browser unsealed and is **never**
  logged or stored unencrypted. Sealed envelope ([sealed-envelope.js](../../src/solana/vanity/sealed-envelope.js))
  for delivery; [secret-box.js](../../api/_lib/secret-box.js) only for any unavoidable
  at-rest holding before claim — and prefer a design where the server cannot read it
  at all (claim-time seal).
- Real on-chain pre-funding + real balance reads (Helius). Real x402 payment for the
  create step. Confirm funding before the drop is shown as "ready".
- Exactly-once claim (atomic); expiry auto-refunds the funder on-chain.
- `$THREE` is the only coin you may feature/name as *a coin*; SOL/USDC are funding
  options (runtime), never marketed.
- Every state designed; mobile-first (this gets opened on phones); accessible; QR
  scannable; OG card correct.

## Definition of done

- [ ] Create (paid + real pre-fund) → deliver (link + QR + OG card) → claim (E2E
      sealed, client-side open) → import/sweep, all working with real funds + real RPC.
- [ ] Both seal modes implemented with an honest, documented threat model; claim-time
      seal verified (a leaked link without the recipient key cannot reveal the secret).
- [ ] Exactly-once claim + on-chain expiry refund, tested for the double-claim race.
- [ ] IRL/3D agent handoff wired if surfaces allow, else a clean, reachable link/QR
      flow with a real extension point (no stub, no fake).
- [ ] Tests (seal modes, claim atomicity, refund, OG card render). Changelog +
      `npm run build:pages`. No mocks; no console errors; `git diff` reviewed.

## Closeout

DoD + self-review, then **improve**: batch drops (mint N sealed gifts for an event/
airdrop from one payment), a "drip" drop that vests, or a "scan to receive" mode where
a room agent emits drops to attendees. Add a recovery story if the recipient loses
their claim key. Summarize, then **delete this file**
(`prompts/vanity-x402/03-sealed-wallet-drops.md`).

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/vanity-x402/03-sealed-wallet-drops.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
