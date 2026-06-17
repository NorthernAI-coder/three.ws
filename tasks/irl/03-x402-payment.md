# Task: IRL — Real x402 payment flow in the interaction sheet

## What to build

When a nearby pin has an `x402_endpoint`, the interaction sheet shows "Pay via x402". The current handler at `src/irl.js ~line 900` just does a raw `fetch(endpoint, { method: 'POST' })` and reports the 402 status as "coming soon". Build the real x402 payment flow using the existing `@three-ws/x402-fetch` client that is already in the project.

## Current state

```js
// src/irl.js ~line 900
document.getElementById('irl-sheet-pay')?.addEventListener('click', async (e) => {
    const endpoint = e.currentTarget.dataset.endpoint;
    if (!endpoint) return;
    try {
        const r = await fetch(endpoint, { method: 'POST' });
        if (r.status === 402) {
            setStatus('Payment required — x402 support coming soon', { error: true });
        } else if (r.ok) {
            setStatus('Payment sent');
        }
    } catch { setStatus('Payment failed', { error: true }); }
});
```

## x402 client that already exists

`sdk/x402-fetch/src/index.js` (or the published `@three-ws/x402-fetch` package) exports `wrapFetch`. It intercepts a 402 response, parses the `X-Payment-Required` header, signs a payment with the user's connected Solana wallet, and retries.

The Solana wallet adapter is already wired in the codebase — check how other pages that do x402 payments import and use `wrapFetch`. Look in `src/` for existing usages of `wrapFetch` or `x402`.

## How to get the connected wallet in irl.js

IRL mode doesn't currently use the wallet. You need to:

1. Import the wallet connection utility from the existing wallet module (grep for `getWallet` or `connectWallet` in `src/`).
2. On "Pay via x402" click, check if a wallet is connected. If not, prompt the user to connect first (use the existing wallet connect flow — don't invent a new one).
3. Pass the wallet's `signTransaction` / `signMessage` capability to `wrapFetch`.

## Implementation

Replace the current click handler with:

```js
document.getElementById('irl-sheet-pay')?.addEventListener('click', async (e) => {
    const btn      = e.currentTarget;
    const endpoint = btn.dataset.endpoint;
    if (!endpoint) return;

    // 1. Require wallet
    const wallet = await ensureWalletConnected(); // use existing util
    if (!wallet) return; // ensureWalletConnected shows its own error/prompt

    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
        const fetchWithPayment = wrapFetch(fetch, wallet);
        const r = await fetchWithPayment(endpoint, { method: 'POST' });
        if (r.ok) {
            setStatus('Payment sent');
            btn.textContent = 'Paid ✓';
        } else {
            throw new Error(`${r.status}`);
        }
    } catch (err) {
        setStatus(`Payment failed: ${err.message}`, { error: true });
        btn.disabled = false;
        btn.textContent = 'Pay via x402';
    }
});
```

## Research steps

Before writing code, grep the codebase to find:

1. `grep -r "wrapFetch\|x402-fetch" src/ pages/ --include="*.js" -l` — find existing usages
2. `grep -r "connectWallet\|getWallet\|walletAdapter" src/ --include="*.js" -l` — find wallet util
3. Read those files to understand the exact import paths and function signatures

Match whatever pattern the rest of the codebase uses exactly.

## UX notes

- Disable the button while payment is in flight (prevent double-send)
- Show "Paid ✓" on success (don't reset to "Pay via x402" — prevents accidental double-pay)
- On failure, re-enable the button so the user can retry
- If no wallet is connected, show a prompt consistent with how other pages handle it

## Files to touch

- `src/irl.js` — the pay button click handler (~line 900) and any new imports at the top

## Checklist

- [ ] Real x402 payment signed and sent (not mocked)
- [ ] Wallet connect gated before payment attempt
- [ ] Button disabled during in-flight request
- [ ] Success / failure states displayed via `setStatus()`
- [ ] No `// implement later` or stub code

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl/03-x402-payment.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
