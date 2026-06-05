# /club release checklist

Run on a clean checkout after `npm install && npm run build`. This file is
human-signed; CI does not check it.

## Local smoke
- [ ] `npm run dev` boots, `/club` loads under 5s on broadband.
- [ ] Venue renders authored GLB, no console errors.
- [ ] All four dancers visible at backstage doors.
- [ ] `npm test` green (unit + e2e).
- [ ] `npm run test:e2e` green standalone.

## Real wallet (mainnet)
- [ ] Connect Phantom on Solana. Tip pole 1 for $0.001 USDC.
- [ ] On-chain confirmation in Solscan within 5s.
- [ ] Dancer 1 walks from backstage to pole.
- [ ] Music for the chosen style fades up; ambience fades down.
- [ ] Volumetric spotlight cone ramps up.
- [ ] Tip row appears in the right-panel feed.
- [ ] Open `/club` in a second browser; same tip row appears via SSE.

## Cron payouts
- [ ] Repeat tips until dancer 1's unpaid total exceeds 0.005 USDC.
- [ ] Trigger `/api/cron/club-payouts` with `CRON_SECRET`.
- [ ] On-chain payout signature recorded in `club_payouts`.
- [ ] `club_tips.paid_at` set on swept rows.
- [ ] Leaderboard "unpaid" column drops for dancer 1.

## Mobile
- [ ] iPhone 12 Safari: profile `medium`, ≥30 fps.
- [ ] Pixel 6 Chrome:    profile `medium`, ≥30 fps.

## Deploy
- [ ] Vercel preview deploy of the branch passes both x402 endpoints
      reachable + SSE keepalive.
- [ ] Promote to production.
- [ ] Verify production OG card renders for `/club` via Twitter card
      validator.
- [ ] Verify x402 bazaar discovery: `curl -i https://three.ws/api/x402/dance-tip`
      returns 402 with the discovery extension intact.

## Secrets — reference only
Never commit secret values to this file. The mainnet checklist relies on:

- `PHANTOM_TEST_WALLET` (held by the release engineer; not stored in repo).
- `CRON_SECRET` (Vercel env: `vercel env pull` to read locally).
- `SOLANA_RPC_URL`, `BASE_RPC_URL` (Vercel env).
- Treasury keypair env vars used by `/api/cron/club-payouts` (see
  `vercel env ls`).
