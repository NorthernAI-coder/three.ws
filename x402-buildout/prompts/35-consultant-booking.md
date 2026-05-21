# USE-35: Consultant Agent — Find, Book, Pay

## Goal
Agent that finds a domain expert (LinkedIn, Cal.com listing), books a call at a chosen time, and pays the booking fee — all via x402.

## Why (from PROJECT-IDEAS.md)
> Finds an expert, books a call, pays automatically. Payment moment: Up-front booking fee. Suggested APIs: Cal.com, Twilio, XTMP messaging, LinkedIn search.

## Reference
- PROJECT-IDEAS.md
- Cal.com API: https://cal.com/docs

## Dependencies
- USE-00..09
- USE-14 (Bazaar discovery for finding experts who've listed themselves)
- USE-16 (SIWX so user can authenticate as the booker)
- USE-22, USE-24

## Files to create
- `agents/consultant/`
- `agents/consultant/src/search.js` — LinkedIn search via Tavily/Brave + Cal.com directory + Bazaar listings
- `agents/consultant/src/scheduler.js` — Cal.com booking API integration
- `agents/consultant/src/notify.js` — Twilio SMS / email confirmation
- `api/agents/consultant-book.js` — paid endpoint that takes a request and returns a confirmation

## Files to modify
- Root `package.json` — add workspace
- `.env.example` — `CALCOM_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `LINKEDIN_API_KEY` (or scrape via Tavily)

## Implementation

### Endpoint contract
```
POST /api/agents/consultant-book
Body: {
  expertise: "Solana smart contracts",
  budgetMaxUsd: 200,
  timeWindow: { start: "2026-05-25T09:00:00Z", end: "2026-05-30T17:00:00Z" },
  duration: 30,
  bookerEmail: "...",
  bookerPhone: "..."
}
402 → pay $5 (booking-fee placeholder; actual cost added at settle via `upto`)
200 → {
  expert: { name, profile, hourlyRate },
  bookingId: "...",
  scheduledFor: "...",
  meetingUrl: "...",
  confirmationsSent: ["email", "sms"]
}
```

### Flow
1. Search for experts matching expertise
2. Rank by rating + price + availability within window
3. Pick top match within budget
4. Call Cal.com API to book
5. Pay the booking fee (the agent's wallet pays the expert via on-chain transfer OR Cal.com Stripe)
6. Confirm via Twilio + email
7. Return confirmation

### Two-sided economics
- The agent charges the END USER $5 for the booking service + the consultant's actual fee
- It pays the consultant out-of-band (via Cal.com Stripe or on-chain transfer)
- Margin = booking fee

### Use `upto`
Because consultant prices vary, advertise `upto` $250 max. Actual settle = $5 + consultant fee.

### Cancellation
Out of scope for v1. Document as a future enhancement.

## Wiring checklist
- [ ] Cal.com integration tested with a real test account
- [ ] Twilio SMS sends real confirmation in dev (use a test number)
- [ ] Search returns real experts (not hallucinated)
- [ ] Budget cap enforced
- [ ] Consultant paid out via real rail (Cal.com Stripe or on-chain)

## Acceptance
- [ ] Booking a 30-minute call within a 5-day window succeeds end-to-end on testnet
- [ ] Confirmation email + SMS received
- [ ] Expert appears on Cal.com (real booking)
- [ ] `upto` settles for actual cost (booking fee + consultant rate)
- [ ] No booking exceeds budget cap
