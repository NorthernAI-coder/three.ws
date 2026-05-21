# SIWX prompt 05 — browser modal: detect SIWX, sign with wallet, retry

## Context

three.ws workspace at `/workspaces/three.ws`. Architecture in
[prompts/siwx/PLAN.md](PLAN.md). Prompts 03 + 04 mean every paid endpoint
that opts into SIWX now advertises the extension in its 402 body and
accepts a `SIGN-IN-WITH-X` header instead of payment for previously-paid
wallets.

This prompt is **step 5 of 7** — the browser side. The drop-in modal lives
at [public/x402.js](../../public/x402.js) (~910 lines). It currently drives
the **payment** flow for EVM (Base USDC via EIP-3009 + `window.ethereum`)
and Solana (Phantom + SPL transfer). You're extending it to also drive the
**sign-in** flow, so a returning buyer's first click is one signature
instead of one payment.

## UX target

When the user clicks an `[data-x402-endpoint]` element:

1. Modal POPs as today, with merchant + action labels.
2. Modal hits the endpoint, gets 402, decodes body.
3. **If body contains `extensions['sign-in-with-x']`:**
   - Modal shows **two** primary buttons: "Sign in with wallet" (top,
     primary) and "Pay $X.XXX USDC" (below, secondary).
   - User clicks "Sign in with wallet" → wallet picker (same EVM/Solana
     branch as the payment flow) → sign the CAIP-122 message → retry the
     endpoint with `SIGN-IN-WITH-X` header.
   - If retry returns 200 → success path identical to a paid call.
   - If retry returns 401/402 with `code: siwx_not_paid` → modal swaps to
     "You haven't paid for this yet — pay now" and proceeds via the payment
     flow (same as if SIWX hadn't been offered).
4. If body does NOT contain the SIWX extension → behavior unchanged.

No new merchant-side API: same `<button data-x402-endpoint>` works. Same
`window.X402.pay({...})` programmatic call works. The modal just gains a
new code path internally.

## Rails (CLAUDE.md, non-negotiable)

- No mocks. No fake data. No placeholders. No TODOs. No stubs. No commented-
  out code in the shipped file.
- No `setTimeout` fake-loading. No fallback sample arrays.
- Real wallet APIs: `window.ethereum` (viem under the hood is OK but the
  modal currently uses raw `eth_signTypedData_v4` — staying consistent with
  that is fine), `window.solana` / Phantom adapter.
- Real signature verification happens server-side via prompt 03; the
  browser just constructs + signs + posts the header.
- Done = `npm run dev` up, exercised on the `/club` page and any
  `data-x402-endpoint` button, signing flow succeeds, retry returns 200,
  no console errors, no network errors except deliberate 402/401.

## Files to edit / create

### File 1 — `public/x402.js` (edit)

Add SIWX support without breaking the existing payment flow. Suggested
structure:

1. **Constants** at top of file:

   ```js
   const SIWX_HEADER = 'SIGN-IN-WITH-X';
   const SIWX_EXTENSION_KEY = 'sign-in-with-x';
   ```

2. **Helper: detect SIWX in 402 body.**

   ```js
   function extractSiwxExtension(body) {
     const ext = body?.extensions?.[SIWX_EXTENSION_KEY];
     if (!ext || !ext.info || !Array.isArray(ext.supportedChains)) return null;
     return ext;
   }
   ```

3. **Helper: match the user's wallet against `supportedChains`.**

   ```js
   // Returns { chain, kind: 'evm' | 'solana' } or null.
   function pickSiwxChain(ext, walletKind) {
     for (const chain of ext.supportedChains) {
       if (walletKind === 'evm' && chain.type === 'eip191') return { chain, kind: 'evm' };
       if (walletKind === 'solana' && chain.type === 'ed25519') return { chain, kind: 'solana' };
     }
     return null;
   }
   ```

4. **Helper: build the CAIP-122 message string locally.**

   The upstream `formatSIWEMessage` / `formatSIWSMessage` are not exported
   to the browser bundle without a build step. The CAIP-122 message format
   is small enough to reconstruct here — match the spec exactly:

   ```
   <domain> wants you to sign in with your <Ethereum|Solana> account:
   <address>

   <statement>

   URI: <uri>
   Version: 1
   Chain ID: <chainRef>   ← numeric for EVM (extract from "eip155:<n>"), genesis-hash for Solana
   Nonce: <nonce>
   Issued At: <issuedAt>
   ```

   Optional fields (`Expiration Time`, `Not Before`, `Request ID`,
   `Resources`) follow on subsequent lines per CAIP-122. Build them
   conditionally; an empty list means omit the line entirely.

   For exact line-by-line correctness re-read
   `node_modules/@x402/extensions/dist/esm/sign-in-with-x/index.d.mts`
   for the field list. Anything you emit must be parseable by
   `parseSIWxHeader` on the server.

5. **Helper: build the encoded `SIGN-IN-WITH-X` header value.**

   ```js
   function encodeSiwxHeader(payload) {
     // base64-encoded JSON per x402 v2 spec.
     const json = JSON.stringify(payload);
     // btoa is fine for ASCII JSON (no non-Latin-1 chars in CAIP-122 fields).
     return btoa(unescape(encodeURIComponent(json)));
   }
   ```

6. **EVM signing.** Reuse the existing wallet-connection path. Once you
   have an address, call:

   ```js
   const signature = await ethereum.request({
     method: 'personal_sign',
     params: [message, address],
   });
   ```

   Build the payload:

   ```js
   const payload = {
     domain: ext.info.domain,
     address,
     statement: ext.info.statement,
     uri: ext.info.uri,
     version: ext.info.version || '1',
     chainId: chain.chainId,            // CAIP-2 string
     type: 'eip191',
     nonce: ext.info.nonce,
     issuedAt: ext.info.issuedAt,
     ...(ext.info.expirationTime ? { expirationTime: ext.info.expirationTime } : {}),
     ...(ext.info.notBefore ? { notBefore: ext.info.notBefore } : {}),
     ...(ext.info.requestId ? { requestId: ext.info.requestId } : {}),
     ...(ext.info.resources ? { resources: ext.info.resources } : {}),
     signatureScheme: 'eip191',
     signature,
   };
   ```

7. **Solana signing.** Use the existing Phantom path (`window.solana ||
   window.phantom?.solana`). Once connected:

   ```js
   const encoded = new TextEncoder().encode(message);
   const { signature } = await provider.signMessage(encoded, 'utf8');
   // signature is Uint8Array; base58-encode for transport.
   const sigB58 = bs58encode(signature);
   ```

   You need a base58 encoder in the browser. `bs58` ships in `node_modules`
   (used by `api/_lib/siws.js`); pull a minimal browser-safe base58 helper
   inline rather than adding a bundle dependency. Solana's alphabet is the
   Bitcoin alphabet; the helper is <30 lines. Reference impl: the existing
   `api/_lib/siws.js` uses `bs58` from npm — for the browser side, write
   the encoder inline (a vanilla loop over the byte array). No bundler
   needed; the existing `x402.js` already follows the "no build step"
   constraint.

   Payload:

   ```js
   const payload = {
     domain: ext.info.domain,
     address: publicKey.toBase58(),
     statement: ext.info.statement,
     uri: ext.info.uri,
     version: '1',
     chainId: chain.chainId,
     type: 'ed25519',
     nonce: ext.info.nonce,
     issuedAt: ext.info.issuedAt,
     ...(ext.info.expirationTime ? { expirationTime: ext.info.expirationTime } : {}),
     signatureScheme: 'siws',
     signature: sigB58,
   };
   ```

8. **Retry with the header.**

   ```js
   const headerValue = encodeSiwxHeader(payload);
   const res = await fetch(endpoint, {
     method: requestMethod,
     headers: { ...requestHeaders, [SIWX_HEADER]: headerValue },
     body: requestBody,
   });
   if (res.status === 200) return await res.json();
   if (res.status === 401 || res.status === 402) {
     // Likely siwx_not_paid — fall through to the payment flow.
     return null;
   }
   throw new Error(`SIWX retry failed: ${res.status}`);
   ```

9. **Modal layout** (CSS lives inline in `x402.js`). Add a second action
   button above the existing pay button when SIWX is offered. Style:
   primary = sign-in (the bet is: most clicks become signs as the userbase
   matures), secondary = pay-with-USDC. When the user clicks pay, hide
   the sign-in button so the existing flow runs unchanged.

10. **CustomEvents.** Today the modal dispatches `x402:result` /
    `x402:error`. Add `x402:siwx-signed` (detail: `{ address, network }`)
    fired right after a successful SIWX retry, so merchants can wire
    analytics. Existing events stay.

### File 2 — `public/x402.js` smoke test page

There's an existing test surface — look for `public/x402-test.html` or
add `public/siwx-test.html`. The page should:

- Have one button bound to `/api/x402/asset-download?slug=pole-dancer-rumba`.
- Have one button bound to `/api/x402/dance-tip?dancer=1&dance=rumba`.
- Show the raw `x402:result` and `x402:siwx-signed` event details in a
  `<pre>` block so you can eyeball the flow.

Keep it visually minimal — this is for verification, not marketing.

### File 3 — public docs

Update [public/docs-widgets.html](../../public/docs-widgets.html) (or the
equivalent "drop-in modal" docs page) to describe the new "Sign in with
wallet" option. One paragraph + a screenshot or ASCII mockup is enough.

## Verification you must perform

```bash
# 1. Dev server
npm run dev

# 2. Manual browser test (MetaMask or Phantom installed):
#    a. Open http://localhost:3000/siwx-test.html
#    b. Click "Buy GLB" — pay flow runs, asset downloads.
#    c. Reload page. Click "Buy GLB" again.
#    d. Modal now shows "Sign in with wallet" first. Click it.
#    e. Wallet prompts to sign a CAIP-122 message. Approve.
#    f. Network tab shows GET /api/x402/asset-download → 401 → GET with
#       SIGN-IN-WITH-X header → 200.
#    g. <pre> block shows x402:siwx-signed then x402:result.
#    h. No console errors.

# 3. Repeat for /api/x402/dance-tip in the second button.

# 4. Sanity: clear browser localStorage, repeat step b without SIWX
#    sign-in — the pay flow must still work bit-identically.
```

## Done means

- `public/x402.js` has the SIWX detection + sign + retry path, no
  `// TODO`, no commented blocks.
- The modal renders two buttons when SIWX is offered; one when it isn't.
- A real wallet (MetaMask + Phantom both tested) can sign and re-enter
  the asset-download endpoint without re-paying.
- `public/siwx-test.html` exists and reproduces the dance reliably.
- Docs page mentions the new flow.
- No regressions in the original payment flow.
- `git diff` reviewed.

Do not commit or push.
