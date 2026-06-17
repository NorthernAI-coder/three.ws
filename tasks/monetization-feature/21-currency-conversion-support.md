---
status: not-started
---

# Prompt 21: Backend & Frontend - Multi-Currency Support

## Objective
Enhance the platform to support pricing in multiple fiat currencies and allow users to see prices in their local currency.

## Explanation
To operate globally, you cannot assume all transactions will be in USD. This task involves integrating a real-time currency conversion service to allow creators to price their skills in their preferred currency and to display an estimated local currency price to potential buyers, improving the user experience for a global audience.

## Instructions
### Backend
1.  **Integrate a Currency Conversion API:**
    *   Sign up for a service like Open Exchange Rates or ExchangeRate-API.
    *   Create a helper function to fetch and cache the latest exchange rates to avoid hitting the API on every request.

2.  **Update Pricing Table:**
    *   Modify the `agent_skill_prices` table. Instead of a single `amount` and `currency_mint` (which is crypto-specific), have `price_amount` and `price_currency` (e.g., 10.00, 'USD'). The `currency_mint` for crypto can remain.

3.  **Modify Earnings/Royalty Table:**
    *   Your `royalty_ledger` should store both the original `price_amount` and `price_currency`, as well as a calculated `amount_usd` for standardized reporting.

4.  **Update Payment Endpoints:**
    *   When creating a payment (`/api/payments/solana-pay`), you will need to convert the skill's price (e.g., 10 EUR) into the required on-chain currency amount (e.g., USDC lamports) using the latest exchange rate.

### Frontend
1.  **Allow Creators to Set Price Currency:**
    *   In the UI where creators set a skill's price, add a dropdown to select the currency (USD, EUR, JPY, etc.).

2.  **Display Localized Prices to Buyers:**
    *   On the marketplace detail page, the API should still send the base price and currency (e.g., 10 EUR).
    *   The frontend can then either:
        *   a) Call a new backend endpoint to get the user's estimated local price.
        *   b) Use a library like `Intl.NumberFormat` in JavaScript, combined with rates fetched from the backend, to display the local price estimate. For example, showing "€10.00 (approx. $10.85)".

## Currency Helper Example

```javascript
// /api/_lib/currency.js
let ratesCache = null;
let cacheTime = 0;

export async function getRates() {
  // Cache for 1 hour to stay within API limits
  if (ratesCache && Date.now() - cacheTime < 3600 * 1000) {
    return ratesCache;
  }

  const response = await fetch(`https://api.exchangerate-api.com/v4/latest/USD`);
  ratesCache = await response.json();
  cacheTime = Date.now();
  return ratesCache.rates;
}

export async function convertToUsd(amount, fromCurrency) {
  if (fromCurrency === 'USD') return amount;
  const rates = await getRates();
  const rate = rates[fromCurrency];
  if (!rate) throw new Error(`Unknown currency: ${fromCurrency}`);
  return amount / rate;
}
```

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/monetization-feature/21-currency-conversion-support.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
