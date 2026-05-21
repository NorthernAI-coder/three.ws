# USE-39: Weather-Triggered Donations

## Goal
Trigger-based agent: when configured weather conditions hit (temp drop, hurricane warning, etc.) the agent auto-donates a set amount via x402 to a designated charity address. Provably automated, verifiable on-chain.

## Why (from PROJECT-IDEAS.md)
> When temp drops below a threshold or a tornado warning hits, agent donates to a local org.

## Reference
- PROJECT-IDEAS.md
- Weather data sources: OpenWeather, NWS (free), our own paid weather endpoint

## Dependencies
- USE-00..09
- USE-15, USE-17, USE-22, USE-24

## Files to create
- `agents/weather-donations/`
- `agents/weather-donations/src/triggers.js` — trigger evaluator: temp threshold, weather event, etc.
- `agents/weather-donations/src/weather-source.js` — paid endpoint chain (Bazaar-discovered or hardcoded)
- `agents/weather-donations/src/donor.js` — executes the donation transfer
- `agents/weather-donations/src/registry.js` — list of configured triggers per user
- `api/agents/weather-donations/configure.js` — paid POST to add a new trigger
- `api/agents/weather-donations/triggers.js` — GET to list active triggers (auth-only via SIWX)
- `api/cron/weather-donations-check.js` — periodic check; Vercel cron route

## Files to modify
- Root `package.json` — add workspace
- `vercel.json` — cron entry: `{ "path": "/api/cron/weather-donations-check", "schedule": "*/15 * * * *" }`
- `.env.example` — `WEATHER_DONATIONS_CRON_SECRET`, `OPENWEATHER_API_KEY` (or skip if all weather is x402-paid)

## Implementation

### Trigger model
```
{
  id: "uuid",
  owner: "0x...",  // wallet that funds donations
  triggerType: "temp_below" | "weather_event" | "alert",
  params: { ... },
  charityAddress: "0x...",  // EVM or Solana
  donationAmount: "10000000",  // atomic units
  network: "eip155:8453",
  paused: false,
  cooldownHours: 24  // don't fire more than once per N hours
}
```

### Trigger evaluation (cron, every 15 minutes)
1. Load active triggers
2. For each trigger, fetch the relevant weather data (paid call)
3. Evaluate condition
4. If fired AND past cooldown: execute donation
5. Record donation in audit log + send notification

### Donation execution
- EVM: ERC-20 transfer via the configured network's USDC
- Solana: SPL transfer
- Authorized via the owner wallet's signature (pre-signed allowance with limits) OR EIP-7710 delegation OR a one-time SIWX-authorized setup

### Verifiability
Sign each fired donation with offer-receipt key. Public log lets anyone verify "yes this agent really donated $X to address Y when weather Z hit."

### Spending caps
Total monthly donations across all triggers capped at user-configured max.

### UI
Simple dashboard at `/agents/weather-donations` to add, view, pause triggers. SIWX-authenticated.

## Wiring checklist
- [ ] Cron entry firing every 15 minutes
- [ ] Cron route authenticated by secret
- [ ] Donation paths for both EVM and Solana
- [ ] Cooldown enforced (no double-donation in cooldown window)
- [ ] Pause flag respected
- [ ] Monthly cap respected
- [ ] Each fired donation produces a signed receipt

## Acceptance
- [ ] Configure a trigger (temp < 32°F in SF), simulate weather (or wait for it), donation fires once and respects cooldown
- [ ] Pausing a trigger prevents firing
- [ ] Monthly cap blocks further donations after threshold reached
- [ ] Public verifier can confirm a fired donation against the signed receipt + on-chain tx
- [ ] All weather data fetched via paid x402 calls (audit log shows the trail)
