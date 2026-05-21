# USE-33: Pay-As-You-Learn Tutor

## Goal
Interactive tutor that bills per-explanation (1 cent per response). Session has a running tab; final invoice at session end with itemized breakdown.

## Why (from PROJECT-IDEAS.md)
> Every executed command explanation costs 1 cent; itemized bill at session end.

## Reference
- PROJECT-IDEAS.md
- `upto` scheme for variable per-response cost
- `batch-settlement` for the session model

## Dependencies
- USE-00..09
- USE-05 (batch-settlement on server)
- USE-09 (batch-settlement on client)
- USE-16 (SIWX for session resumption)
- USE-17 (offer-receipt for session invoice)

## Files to create
- `agents/tutor/`
- `agents/tutor/src/session.js` — session state (questions asked, costs accrued)
- `agents/tutor/src/teach.js` — LLM-backed explanation generator
- `agents/tutor/src/examples.js` — code execution sandbox (e.g., V8 isolate, Docker, Pyodide for Python)
- `api/x402/tutor.js` — paid endpoint, `batch-settlement` scheme
- `public/tutor.html` — chat UI
- `public/tutor.js` — front-end with channel state, session invoice display

## Files to modify
- Root `package.json` — add workspace
- `vercel.json` — `/tutor` route
- `.env.example` — `TUTOR_PROVIDER` (anthropic|openai), `TUTOR_MAX_COST_PER_SESSION_USD`

## Implementation

### Session model
- One x402 batch-settlement channel per (buyer, session)
- Each question → one voucher signed by buyer
- Session ends when buyer hits "end session" (cooperative refund of unused channel balance)
- Session resumed by SIWX challenge — buyer doesn't repay for prior session

### Endpoint contract
```
POST /api/x402/tutor
Body: { sessionId: "uuid", question: "explain my code", context: "...", level: "beginner|expert" }
402 (first call) → opens batch channel, returns PaymentRequired
200 → { answer: "...", costThisCharge: "1000", sessionTotal: "12000", sessionId }
```

### Cost model
- Base: $0.01 per response
- Per-token surcharge: $0.0001 per 100 LLM output tokens
- Sandbox execution: $0.005 per execution
- Per-call max: $0.10 (caller-authorized via batch voucher ceiling)

### Code execution
For tutoring code, run user-provided snippets in a sandboxed environment. Pyodide in browser for Python, V8 isolate for JS, Docker for everything else. Sandbox time-bounded.

### Final invoice
At session end:
1. Show itemized bill (each question, cost, transcript)
2. Sign invoice with offer-receipt key
3. Refund unused channel balance via cooperative refund

### UI
Chat-style. Each AI response shows cost on the message bubble. Running total visible. "End session and pay" button at top.

## Wiring checklist
- [ ] Batch-settlement channel opened per session
- [ ] Cost tracking accurate at sub-cent granularity
- [ ] Code sandbox isolated, time-bounded
- [ ] SIWX-based session resume works
- [ ] Invoice signed and stored
- [ ] Cooperative refund triggered at session end

## Acceptance
- [ ] Tutor session of 20 questions costs roughly 20 × per-response charge
- [ ] Killing the browser mid-session and returning later (after SIWX) resumes without re-payment
- [ ] Session-end invoice shows itemized cost matching audit log
- [ ] Refund returns unused balance — verified on-chain
- [ ] Code execution sandbox prevents file system / network access
