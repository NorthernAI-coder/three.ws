# USE-07: Buyer — `axios` interceptor

## Goal
Add an axios-based variant of the buyer client. Many of our worker scripts and SDK helpers use axios; wrap with `@x402/axios` so they can hit paid endpoints with zero code change.

## Why
- Several existing modules (workers/, agent-payments-sdk/) use axios.
- Some downstream consumers (USE-30, USE-32) prefer axios for retry config and interceptor inspection.

## Reference
- Buyer quickstart axios tab: [/tmp/x402-docs/docs/getting-started/quickstart-for-buyers.mdx](/tmp/x402-docs/docs/getting-started/quickstart-for-buyers.mdx)
- `@x402/axios`: [typescript/packages/http/axios](https://github.com/x402-foundation/x402/tree/main/typescript/packages/http/axios)

## Dependencies
- USE-00, USE-01
- USE-06 (mirror its signer factory)

## Files to create
- `api/_lib/x402/buyer-axios.js` — exports `buildBuyerAxios({ baseURL, ...axiosOpts })`

## Files to modify
- Any existing call site in `workers/` or `agent-payments-sdk/` that hits paid endpoints — migrate to `buildBuyerAxios()`
- `.env.example` — same signer vars as USE-06

## Implementation

```js
// api/_lib/x402/buyer-axios.js
import axios from "axios";
import { wrapAxiosWithPayment, x402Client, x402HTTPClient } from "@x402/axios";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { getEvmSigner, getSvmSigner } from "./signers.js";

export async function buildBuyerAxios(opts = {}) {
  const client = new x402Client();
  client.register("eip155:*", new ExactEvmScheme(getEvmSigner()));
  client.register("solana:*", new ExactSvmScheme(await getSvmSigner()));
  return {
    api: wrapAxiosWithPayment(axios.create(opts), client),
    httpClient: new x402HTTPClient(client),
    client
  };
}
```

### Receipt extraction
After every successful call, expose the settlement response:
```js
const { api, httpClient } = await buildBuyerAxios();
const res = await api.get("/paid-endpoint");
const receipt = httpClient.getPaymentSettleResponse(name => res.headers[name.toLowerCase()]);
```
Return `receipt` from every helper so callers can record transactions.

### Migration audit
- Search the repo for `axios.create(`, `axios.get(`, `axios.post(` in `workers/`, `agent-payments-sdk/`, `sdk/`.
- Decide per call site whether it's hitting a paid endpoint. If yes, swap to `buildBuyerAxios()`.

## Wiring checklist
- [ ] `buildBuyerAxios()` returns `{ api, httpClient, client }` so callers can both make requests and inspect receipts
- [ ] Existing axios call sites identified and updated where appropriate (don't blindly swap every one)
- [ ] Retries on network error preserved; payment retry is a separate concern handled by the wrapper

## Acceptance
- [ ] Axios call to `/api/x402/exact-evm-demo` returns 200 with body
- [ ] Receipt object contains `transaction`, `network`, `payer`
- [ ] Worker scripts that previously failed against paid endpoints now succeed
