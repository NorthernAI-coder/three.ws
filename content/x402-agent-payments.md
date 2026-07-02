# x402: the payment rail of three.ws

*Long-form X article. The complete story of the x402 payments suite: why HTTP 402 is the native rail for agents, the exact challenge and settle mechanics from the shipped code, the pricing model, the self-hosted facilitator, the merchant and buyer SDKs, every surface on the platform that pays or gets paid, developer examples, tutorials, and the honest limits. $THREE is the only coin.*

An autonomous agent cannot fill out a card form. It cannot pass a CAPTCHA, wait for an invoice, or negotiate an enterprise contract. If the machine economy is going to be real, machines need a way to pay for a single HTTP request, in one round trip, with money they custody themselves. The web reserved a status code for exactly this in 1997 and then never used it: 402 Payment Required.

x402 is the protocol that finally uses it. A server answers an unpaid request with a 402 whose body lists what it accepts: asset, amount, network, pay-to address. The client signs a payment, retries the same request with an X-PAYMENT header, and gets the result plus a settlement receipt. No accounts, no API keys, no monthly minimums. One request, one price, one on-chain settlement.

three.ws did not adopt x402 as a feature. We built the entire stack: the seller machinery, the buyer clients, the facilitator that settles, the discovery layer, the revenue ledger, the reconciliation watchdog, and the agents on both sides of the trade. This is everything about it.

## Why we built it

Three reasons, in order of importance.

**First, our agents needed to buy things.** three.ws is a platform where 3D agents hold wallets, trade, and act autonomously. The sniper needs live market sentiment. The oracle needs anomaly scans and fact checks. Health monitors need probes. Every one of those is a purchase decision an agent makes without a human in the loop, and card rails cannot serve it. x402 can: the price is machine readable, the payment is a signature, and the whole dance completes inside a single request cycle.

**Second, we had things worth selling.** The platform runs real intelligence: token intel, crypto market signals, pump.fun anomaly detection, agent reputation, 3D generation, vanity address mining. Behind x402, each of those becomes a product any paying agent on the open web can buy for cents, with no signup. Today more than forty paid endpoints live under `/api/x402/`, every one built on the same shared machinery and cataloged for discovery.

**Third, renting your payment stack is a liability.** If a third party verifies your payments, settles your money, and holds your sponsor key, your economy has a landlord. We wrote a self-hosted facilitator so that on Solana, verification, co-signing, and broadcast all run on our own infrastructure. No money, metadata, or signing authority leaves the platform.

## The system at a glance

Seven pieces, all live.

1. **The catalog**: 40 plus paid endpoints under `api/x402/`, from $0.001 diagnostic probes to a $5.00 managed pump.fun launch, each declaring its price, schemas, and discovery metadata.
2. **The seller machinery**: one helper, `paidEndpoint()` in `api/_lib/x402-paid-endpoint.js`, runs the full dance for every route: challenge, verify, run, settle, receipt, audit.
3. **The facilitator**: `/api/x402-facilitator` verifies and settles Solana USDC payments in-house, with an anti-drain gate on everything it co-signs.
4. **The buyer clients**: server-side `buyerFetch` with hard spending caps, the browser payment modal, `@three-ws/x402-fetch` for anyone's app, and two MCP servers that give AI assistants a paying wallet.
5. **Discovery**: `/.well-known/x402` lists every resource, the bazaar merges the live facilitator catalogs, and `/ca2x402` mints a payable intel endpoint for any token contract address at runtime.
6. **The ledger**: every settlement writes one row to `x402_audit_log`, feeds the public dashboard at `/x402-revenue`, and gets cross-checked against the chain by a daily reconciliation job.
7. **The agent-to-agent economy**: the platform's own agents pay the platform's own paid endpoints in real USDC on a schedule, so the trading engine is a paying customer of the intelligence engine, continuously and in public.

## The 402 dance, exactly as shipped

Here is what happens when you call a paid endpoint, traced through the code.

**The challenge.** With no X-PAYMENT header, the endpoint responds 402. The body carries an `accepts` array: one entry per payable rail, each with `scheme`, `amount` in atomic units, `payTo`, `asset`, and a 60 second settlement timeout. USDC has six decimals, so an amount of `10000` is one cent. Solana leads the list by platform default, then Base, so first-accept clients settle on Solana unless a route overrides the order. A half-configured network is silently dropped rather than advertised: Solana needs a pay-to, a fee payer, and the USDC mint; Base needs its pay-to, the USDC contract, and a provably settleable facilitator. The endpoint only fails when no network at all is payable. There is also a contract-mediated direct scheme on BSC, where the buyer calls a payments contract from their own wallet and the settlement is read from the on-chain event.

**The $THREE accept.** When the operator sets `X402_ACCEPT_THREE_SOLANA`, every Solana challenge advertises a second accept right after USDC: the same resource, payable in $THREE at a configurable amount. USDC stays first so simple clients keep settling USDC, and the browser modal shows a token chooser so holders can pay in the platform token. The published merchant SDK ships the same behavior: one config, and your endpoint advertises USDC and $THREE in a single 402 challenge, with $THREE enforced as Solana-only because it is an SPL mint.

**Verify, run, settle, in that order.** The retry carrying X-PAYMENT goes through two rate-limit tiers (a per-IP probe cap for anonymous traffic, then per-IP and global verify caps that fail closed, because each junk payment header would otherwise amplify into a facilitator round trip at our expense). The payment is verified against the advertised requirements, the handler runs, and only then does settlement move the USDC. A handler that throws moves no funds, so a failed call cannot charge the buyer, and a retry cannot double-charge.

**The replay guard is unconditional.** Because the flow delivers the result before settling, a captured X-PAYMENT header replayed against the endpoint could re-run the paid work. The shipped code hashes the signed payment proof itself and uses it as a dedup key even when the client opts into nothing, caches the response only after a successful settle, and serves the cached response to any replay. Concurrent duplicates race for an atomic reservation; exactly one runs, the rest observe the in-flight marker or the finished result. A transient settle failure releases the reservation, so a legitimate payer is never locked out of retrying their own payment.

**Receipts.** Every settlement issues a signed receipt in the X-PAYMENT-RESPONSE extensions and persists it. A buyer reads their own receipt history at `/api/x402/my-receipts` for free, gated by a wallet signature rather than another payment: you prove you own the payer address, you get your receipts.

**Three ways to skip paying, all explicit.** Endpoints can opt into SIWX, the CAIP-122 sign-in-with-wallet flow: a wallet that already paid can return with a signed message instead of a second payment, for whatever grant window the route declares. Endpoints can declare auth-hints, advertising OAuth or SIWX as zero-amount accepts in the same 402 body, so subscribers and authenticated users bypass the payment dance structurally (a zero-amount accept can never be redeemed via X-PAYMENT; verification excludes it from matching). And an access-control hook lets internal callers through. Every bypass is logged to the same audit ledger as a bypass event, so free access is as visible as paid access.

## Pricing: one resolver, one override scheme

Every endpoint declares a default price inline through `priceFor(slug, defaultAtomics)`. Operators override any of them at deploy time with a single env var, `X402_PRICE_<SLUG>` in USDC atomics; a malformed value logs a warning and falls back to the default rather than mispricing the route.

The defaults are deliberately a low curve. Real figures from the shipped catalog: symbol availability checks at $0.001 (batch at $0.005), the bazaar feed at $0.001, dance tips at $0.001, crypto intel and token intel at $0.01, the pole-club cover charge at $0.01 with free re-entry for the pass window, tutoring at $0.01 per answer with a running session tab, pump agent audits at $0.02, platform analytics at $0.005, the billboard at $0.05, batch mint-to-mesh at $0.05, and a managed pump.fun launch at $5.00. Six paid SLA probes at $0.001 each let any agent buy proof that our auth, API keys, live feed, model backend, Telegram, and Solana register are up: observability itself as a sellable product.

## The facilitator we host ourselves

The facilitator is the party that verifies a signed payment and broadcasts the settlement. Ours lives at `/api/x402-facilitator` with `/verify`, `/settle`, and `/supported`, speaking the standard x402 v2 facilitator contract, so pointing `X402_FACILITATOR_URL_SOLANA` at it is a drop-in switch.

Co-signing is the dangerous part. The sponsor key signs the whole transaction, so a naive facilitator that blind-signs whatever `/settle` receives would let anyone drain the sponsor's SOL. The shipped gate refuses to co-sign any transaction whose program set is not exactly: a compute-budget instruction, an optional token-account create for our own treasury, and one USDC TransferChecked to an allowlisted pay-to. No System program instructions means no SOL can be transferred out. Compute unit price and priority fee are capped. The recipient must be a platform wallet. One validation function enforces both "the sponsor cannot be drained" and "only our wallets settle here."

Two more guards: below a SOL floor (default 0.02 SOL) the facilitator refuses to settle, pausing any paying loop before it can run the sponsor dry. And the whole thing is off by default; without the explicit enable flag and the sponsor secret it answers 503 and nothing settles.

## The agent-to-agent economy

This is the part most platforms fake and we run for real: our own agents are paying customers of our own paid endpoints, with real USDC, on a schedule, on chain.

**The autonomous loop** runs from a cron every 5 minutes. Each tick selects up to 12 ready entries from a registry, sorted by priority, probes each endpoint for its 402 challenge, builds a Solana USDC payment, and fires the paid request. Every call, success or failure, is recorded. A hard daily spend cap of $15 in USDC atomics bounds the whole loop, and per-endpoint cooldowns gate how often any one entry fires. The registry groups entries into pipelines: oracle intel purchases, sniper enrichment, health and circuit-breaker probes, security audits that exercise our own payment guards end to end, discovery sweeps that keep the external catalog fresh, and content QA.

**The sharpest loop is the sniper's.** On each run, the sniper enrichment pipeline pays the platform's own crypto intel feed, one cent of USDC per call, for live sentiment on up to 8 coins the sniper is actively watching: open positions first, then fresh high-conviction Oracle candidates. The signal maps to a clamped threshold delta, bounded to plus or minus 10 points, that raises or lowers each coin's snipe bar. It is fail-open: a missing or stale signal never moves the bar. And it carries an honesty guard in the endpoint itself: if the coin has no resolvable live market listing, the endpoint returns 503 before settlement, the wallet is never charged, and no signal is written. The trading engine buys only reads a real market produced.

**The closed loop is labeled a closed loop.** For settlement volume that cycles entirely between platform-controlled wallets, there is a dedicated internal primitive, `/api/x402/ring-settle`, priced at $1.00 per call by default and operator-tunable. It is deliberately marked non-discoverable so it never appears in the public bazaar catalog, its report endpoint tags the activity internal, and the public organic-revenue feed excludes it. The economics are worth knowing: a Solana settlement costs a roughly flat network fee per transaction regardless of size, 5,000 lamports at the one-signature self-pay floor and double that when a sponsor co-signs, so cycling value in fewer, larger payments costs orders of magnitude less SOL than the same gross in micro-payments. The live net-position report at `/api/x402-ring` shows gross volume, transaction count, exact SOL burned, and live balances for any period.

**And the books are audited against the chain.** A daily reconciliation job pulls every record that claims an on-chain settlement, from both the outbound spend log and the inbound payment intents, verifies each Solana signature via `getSignatureStatuses`, and writes one verdict per record. A row where the database claims a settlement the chain does not corroborate is a financial-integrity alert. The job is read-only and runs even when no spend wallet is configured.

## Everything on the platform that runs on it

**/pay** is the hosted payer: paste any x402 URL, see the price, settle it with your wallet, get the response.

**/x402/studio** is the merchant console, the Stripe of x402: products and pricing, payout and agent wallets, real USDC send and receive with .sol name resolution, a drag-and-drop storefront, an embeddable pay-button builder, charity and round-up giving, CORS and security settings. You run a paid API business from one screen.

**/bazaar** searches the merged live facilitator catalogs: filter by network, price ceiling, and protocol extensions, and pay any listed service in one click. The same catalog is queryable from any MCP client through the bazaar MCP server at `/api/mcp-bazaar`, with `search_services`, `browse_services`, and `get_service` returning exact payment requirements and a ready pay link.

**/arbitrage** surfaces cross-provider price disparities live from that merged catalog: the cheapest endpoint for any capability, computed from what sellers actually advertise. **/providers** quantifies the operators themselves: service counts, price bands, dominant categories.

**/shopper** is the demo that makes the point: describe a task, set a budget, and an agent discovers relevant paid endpoints through the bazaar, chains them, pays per call, and synthesizes the answer.

**/ca2x402** turns any token contract address into a live, agent-payable x402 endpoint for that token's market intel at $0.01 USDC, discoverable in the bazaar. The mint is runtime input; the plumbing is coin-agnostic.

**/x402-revenue** is the public ledger view: a live revenue chart, gross and net and success-rate KPIs, top-earning endpoints, revenue by network, and a filterable feed of every settlement with an explorer link the moment it lands.

**The Play worlds** embed the buyer experience in 3D. Every coin town in /play has an intel kiosk by the plaza: walk your avatar up, press E, pay one cent USDC through the wallet modal (Phantom on Solana, or an EVM wallet on Base), and the kiosk's screen lights up with live purchased intel for the town's coin. The flagship $THREE town buys from its dedicated feed at `/api/x402/three-intel`; every other town uses the generic token oracle with the world's mint supplied at runtime. Payment fires only on an explicit player interaction, and the player signs with their own wallet. The **/agent-exchange** demo runs the same feed with two avatars trading intel while the settlement shows live.

**Pay by name** removes the last piece of friction: `/api/x402/pay-by-name` resolves `@username` to that user's default agent wallet, any `.sol` name including subdomains like `nich.threews.sol` through on-chain resolution, or passes a raw address through. It can build an unsigned USDC transfer for browser signing or, with authorization, sign and broadcast as your own agent under its spend limits. The paid resolve costs $0.001 and doubles as the registry's continuous health check.

## How people use it

**The player** never reads a spec. They walk to a kiosk, press E, approve a one cent payment in their own wallet, and watch a 3D screen render the intel they just bought, with an explorer link proving it settled.

**The developer with something to sell** wraps one route with the merchant SDK and has a paid API in an afternoon: challenge, verification, settlement, receipt, all handled, USDC and optionally $THREE advertised in one challenge.

**The agent operator** gives their assistant a wallet with `@three-ws/x402-mcp`, funds it with a few dollars of USDC, sets a per-call ceiling, and lets the assistant discover, inspect, and pay services on its own key.

**The merchant** runs the whole business from /x402/studio: pricing, payouts, a storefront, an embeddable pay button.

**The analyst** watches /x402-revenue and the bazaar surfaces: which endpoints earn, which providers dominate a category, where the same capability is priced apart.

## For developers: real endpoints, runnable code

**Probe a price without paying.** Every paid endpoint answers an unpaid request with its full challenge:

```
curl -s -X POST https://three.ws/api/x402/crypto-intel -H 'content-type: application/json' -d '{"topic":"sol"}'
```

The 402 body lists the accepts (Solana USDC first, amount `10000` for one cent), the schemas, and the discovery metadata. Site-wide discovery is one GET away at `https://three.ws/.well-known/x402`.

**Pay from a browser app.** `@three-ws/x402-fetch` is a drop-in wrapper: on a 402 it parses the challenge, signs the USDC authorization, and retries before your await resolves.

```js
import { withX402 } from '@three-ws/x402-fetch';

const pay = withX402(window.ethereum, { maxPaymentUsd: 0.1 });
const res = await pay('https://three.ws/api/x402/crypto-intel', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ topic: 'sol' }),
});
const intel = await res.json(); // paid and unlocked
```

**Charge for your own endpoint.** The seller half is `@three-ws/x402-server`. One wrapper makes any handler a paid one; verification gates the work, settlement follows success, and the platform fee is split out of the listed price so the buyer is never marked up:

```js
import { paid } from '@three-ws/x402-server';

export default paid(
  { price: '10000', asset: 'usdc', payTo: { solana: 'YourSolanaAddress' } },
  async (req, res) => {
    res.json({ summary: await summarize(req.body.text) });
  },
);
```

**Give your assistant a wallet.** Add `@three-ws/x402-mcp` to Claude Desktop, Cursor, or Claude Code:

```json
{
  "mcpServers": {
    "x402": {
      "command": "npx",
      "args": ["-y", "@three-ws/x402-mcp"],
      "env": { "SOLANA_SECRET_KEY": "<base58>", "MAX_PAY_USD": "1" }
    }
  }
}
```

Four tools ship: a wallet balance read, live bazaar search, a payment-requirements inspector that reads any endpoint's price without paying, and `pay_and_call`, which probes the 402 first and refuses before any money moves if the price exceeds your cap (default $1). Confirmation is required by default, and the key never leaves your machine.

**Or bridge every paid API into your tool list.** `@three-ws/mcp-bridge` pre-loads a tool per service discovered on the live bazaar plus a universal `call_paid_endpoint`, behind hard controls: a per-call cap (default $0.10), an atomically reserved session ceiling (default $1.00) so a looping agent cannot overshoot it even concurrently, an optional payee allowlist, and an SSRF chokepoint that resolves every outbound host and refuses private, loopback, link-local, and cloud-metadata addresses, never following redirects.

## Three tutorials in one place

**Buy your first paid result in sixty seconds.** Open three.ws/bazaar, pick a cheap service, and click pay; the hosted payer at /pay settles it and shows the response next to the transaction. Or do it in the world: walk into a coin town in /play, find the kiosk, press E, pay one cent. Either way, check `/api/x402/my-receipts` afterward with a wallet signature: your receipt is there, free to read, because you already paid once.

**Stand up a paid API this afternoon.** `npm install @three-ws/x402-server`, wrap your handler with `paid()` at a one cent price, deploy, then probe it yourself with curl and watch the 402 come back with your address in the accepts. Pay it once with `@three-ws/x402-fetch` from a test script. You now operate the same machinery that runs the three.ws catalog, and /x402/studio gives you the storefront and the pay button when you want them.

**Watch the machine economy work.** Open three.ws/x402-revenue and leave it running. Settlements land in the feed with route, amount, network, payer, and an explorer link. What you are watching includes agents paying agents: the sniper buying sentiment on the coins it holds, health probes buying proof that the backends are up, discovery sweeps paying for catalog reads. That is the agent-to-agent economy, one cent at a time, in public.

## The honest limits

The default prices are a development curve, not final unit economics; operators are expected to tune every `X402_PRICE_<SLUG>` to reality. Base is advertised only when it can provably settle, because a dead facilitator that 404s on verify would let a buyer pay and then fail; when that gate is closed, the challenge is Solana-only, and that is correct even though it narrows the buyer's options. The intel endpoints have no mock path by design, so when upstream market sources fail, the call 503s before settlement and the buyer keeps their money, which also means the feed is only as available as its real sources. Closed-loop settlement volume between platform wallets is real on chain but is not third-party demand, so it is labeled internal, kept out of the public bazaar catalog, and excluded from the organic revenue framing; conflating the two would be the easiest lie in this business and the ledger is built to make it impossible. Reconciliation verifies Solana signatures only; settlements on other rails are classified as skipped rather than falsely confirmed. And the paying MCP tools are deliberately conservative: caps before signatures, confirmation by default, dedicated low-balance wallets recommended. The rail is built to move small money safely before it moves big money at all.

## Where to start

Pay anything: three.ws/pay. Find anything: three.ws/bazaar, with price arbitrage at three.ws/arbitrage and operator profiles at three.ws/providers. Sell anything: three.ws/x402/studio. Turn a contract address into a paid feed: three.ws/ca2x402. Let an agent shop for you: three.ws/shopper. Watch the money: three.ws/x402-revenue. Machine discovery: three.ws/.well-known/x402. And the buyer's first purchase is one cent away at any kiosk in three.ws/play.

HTTP finally has its payment rail. Ours is live now.
