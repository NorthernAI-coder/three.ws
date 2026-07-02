# Skills: how agents on three.ws learn, sell, and prove what they can do

*Long-form X article. The complete story of the three.ws skills system: the SKILL spec, the sandbox, the marketplace, per-call x402 pricing, $THREE hold-to-access, the on-chain license program, verifiable skill invocation events, every platform feature wired to it, tutorials, and the honest limits. $THREE is the only coin.*

An AI agent is only as useful as the things it can actually do. Most platforms answer that with a fixed toolbox: the vendor ships ten tools, you get ten tools, and every agent on earth is the same agent wearing a different name. The capability layer, the part that should be the most alive, is the most closed.

Skills are our answer to that. A skill on three.ws is a portable, content-addressed bundle of files that teaches any compatible agent a new capability: the instructions the LLM reads, the tool schema it can call, and the sandboxed code that runs when it calls it. Skills install from any URL, publish to a real marketplace, charge real USDC per call through x402, mint real 1 of 1 SPL NFTs as licenses, and emit verifiable invocation events on Solana. The full pipeline, from a folder of four files to a paid, licensed, on-chain-verifiable capability, is live now. The spec is `specs/SKILL_SPEC.md`, the developer reference is three.ws/docs/skills, and the marketplace is three.ws/skills.

This is everything about it.

## Why we built it

**First, capability should be data, not deployment.** On three.ws, an agent is defined by a manifest: a body, a brain, and a list of skills. Adding a capability should never mean redeploying a platform. A skill is a directory of static files served from anywhere: HTTPS, IPFS, or Arweave. Publish once, install everywhere. It is the npm model applied to embodied AI, and like npm, the value is the ecosystem the format makes possible.

**Second, the people who teach agents should get paid.** A skill author who writes a great trading playbook or a clean tool integration produces real value for every agent that installs it. So the marketplace is not a gallery. Authors set a per-call price, and the x402 settlement for every invocation routes directly to the author's wallet. Not to a platform balance you request a withdrawal from. To your wallet, per call, in USDC.

**Third, access should be provable without trusting us.** A database row that says "this user bought this skill" is a promise from us. An on-chain license is a fact about the world. Every purchased skill can mint a 1 of 1 SPL NFT into the buyer's wallet plus a deterministic program account anyone can read. If three.ws disappeared tomorrow, the licenses would still be verifiable, by anyone, forever.

## The system at a glance

1. **The format.** A skill is a bundle of up to four files: `manifest.json`, `SKILL.md`, `tools.json`, `handlers.js`, plus optional assets like animation clips and prompts. Spec version `skill/0.1`.
2. **The runtime.** Agents install skills from URIs at startup or at runtime. Instructions are injected into the system prompt, tool schemas are merged into the LLM's tool list, and handler code runs in a Web Worker sandbox with no DOM access.
3. **The marketplace.** three.ws/skills, inside the marketplace at /marketplace, backed by `GET /api/skills`: search, categories, popularity, ratings, one-click install, publishing, and a seeded library of 115 real skills across 11 categories.
4. **The money.** Two engines. Marketplace skills charge per call through `GET /api/x402/skill-call`, settling to the author's wallet. Agent-listed skills price through `agent_skill_prices` with trials, time passes, pay-what-you-want, NFT gates, and a $THREE holder gate.
5. **The licenses.** The `skill_license` Anchor program mints a 1 of 1 SPL NFT plus a `SkillLicense` PDA per purchase. Anyone verifies ownership with one RPC read or the public endpoint `GET /api/skills/license-onchain`.
6. **The receipts.** The `agent_invocation` program records agent-to-agent skill calls on-chain as `SkillInvoked` events, live on mainnet and devnet.

## The skill format, in depth

A skill is a directory. That is the whole trick. No build step, no server, no registry account.

```
wave/
  manifest.json     required: identity, version, compatibility, integrity
  SKILL.md          required: instructions the LLM reads
  tools.json        required if the skill exposes tools
  handlers.js       optional: the code that runs each tool
  clips/            optional assets: animation GLBs
  prompts/          optional prompt templates
```

**`manifest.json`** declares `spec: "skill/0.1"`, a name, a semver version, and three contract sections. `requires` states compatibility: which avatar rigs it works with, the minimum runtime, and which built-in tools it depends on. `dependencies` maps other skill URIs to version ranges, installed recursively before the depending skill, with circular dependencies rejected. `provides` declares the tools and trigger tags the skill adds. An optional `integrity` block carries SHA-256 hashes verified before any handler executes, and an optional `author` field carries the publisher's wallet, which the trust system enforces.

**`SKILL.md`** is the part most systems get wrong. It is not documentation for humans. It is an instruction fragment written directly to the model: frontmatter with a name, description, trigger tags, and a cost hint (`low`, `medium`, `high`, which controls eager versus lazy loading), then a markdown body that tells the LLM when to use the tool, how to choose parameters, and what not to do. The runtime wraps the body in a `<skill name="..." version="...">` tag before injecting it into the system prompt, so the model can attribute which skill each instruction came from.

**`tools.json`** defines the callable functions in the standard tool-use schema (`input_schema`, with types, enums, defaults, and constraints). Before each LLM call the runtime merges the schemas of every installed skill into one tool list; on a name collision the later install wins and a warning is logged.

**`handlers.js`** is an ES module exporting one async function per tool. Each handler receives the validated arguments and a context object, `ctx`, which is the only door out of the sandbox: `ctx.viewer` for scene control (play a clip, set an expression, look at the camera, move the avatar), `ctx.llm` for completions and embeddings, `ctx.memory` for reads, writes, and timeline notes, asset loaders resolved against `ctx.skillBaseURI`, `ctx.fetch` for network under normal CORS, `ctx.call` for cross-skill tool calls, and `ctx.speak` and `ctx.listen` for voice. Every `ctx` call times out after 30 seconds and surfaces as an error object instead of crashing the agent.

A skill without `handlers.js` is still valid. It is a declarative skill: pure prompt engineering plus assets, always safe to load.

### The sandbox and the trust ladder

Handler code from the open internet runs inside your agent, so the default posture is containment. Handlers execute in a Web Worker with no DOM, no `window`, no `localStorage`, and no cookies. The worker receives handler source as text and loads it through a `blob:` URL import, which means handler code cannot import external modules at all. Every `ctx` call becomes a validated postMessage round trip to the main thread, and non-serializable objects like animation clips are represented in the worker as opaque handles.

On top of the sandbox sits a per-agent trust policy: `owned-only` (the default, only skills whose `author` matches the agent owner's wallet), `whitelist` (a configured list of publisher wallets), or `any` (for kiosks and demos). Owner-trusted skills that genuinely need main-thread access can opt out with `sandboxPolicy: "trusted-main-thread"` in the manifest, and that opt-out is ignored for `any`-trust skills.

### How an agent consumes a skill

Install paths are deliberately boring. Reference the skill in the agent's manifest (`skills: [{ uri, version }]`), pass a JSON array to the `<agent-3d>` web component's `skills` attribute, or call `el.agent.skills.install({ uri })` at runtime. URIs can be HTTPS, `ipfs://` (resolved through a gateway fallback chain), or `ar://`. The load sequence: fetch the manifest, enforce trust, verify integrity, check rig compatibility, install dependencies, fetch the remaining files in parallel, merge the tools, inject the instructions. From that moment the LLM can call the skill's tools like any built-in, and the host page can watch through three events on the element: `perform-skill`, `skill-done`, and `skill-error`.

Every agent also ships seven built-ins from `src/agent-skills.js` (greet, present-model, validate-model, remember, think, sign-action, help), and the ones flagged as MCP-exposed are callable by external tools through `/api/mcp` as `skill_<name>`.

## The marketplace

three.ws/skills is the storefront, and it lives inside the marketplace at /marketplace. It is backed by a real catalog, the `marketplace_skills` table, read through `GET /api/skills` with server-side search, category filtering, three sort orders (popular, new, alphabetical), and keyset pagination. `GET /api/skills/categories` returns live category counts, rendered as filter chips. A market pulse marquee streams the most recent skill purchases, agent cards summarize their paid skills with a lowest per-call price, and every skill has ratings and reviews. /marketplace/analytics shows top skills, top agents, and sales volume; /collection shows everything you have unlocked.

The catalog launched seeded with 115 real skills across 11 categories: development (33), trading (15), protocol (14), analysis (13), defi (12), security (8), portfolio (7), general (6), news (3), community (2), and wallet (2). Working knowledge and tool packs, not filler rows: market analysis frameworks, gas optimization playbooks, protocol integration guides, security checklists.

Publishing is one authenticated call: `POST /api/skills` with a name, a slug, a description, a category, tags, and either a `schema_json` tool definition, a markdown `content` body of up to 200,000 characters, or both, plus a `price_per_call_usd` between 0 and 10 dollars. Installing is `POST /api/skills/:id/install`, idempotent, with an uninstall on DELETE.

A second marketplace surface matters just as much: per-agent skill pricing. Any agent owner can price the skills their own agent executes through `/api/agents/:id/skills-pricing`. A listing there is richer than a flat price: fixed or pay-what-you-want pricing with a floor, up to 10 free trial uses, time passes (1 to 720 hours of unlimited access for a flat amount), and a gate type of `price` or `nft`, where an NFT gate grants access to holders of a specific collection instead of selling it at all.

## Monetization, engine one: x402 paid skills

x402 is the HTTP 402 payment protocol: a client hits an endpoint, receives a structured payment challenge, pays in USDC on Base or Solana, retries with proof, and gets the resource. three.ws runs a full catalog of paid endpoints (see three.ws/.well-known/x402.json), and two of them are the commercial spine of the skills system.

**`GET /api/x402/skill-call?skill=<slug>`** is the per-call meter for marketplace skills. The caller pays the skill's `price_per_call_usd` in USDC and receives the skill's executable payload: its tool schema and content, ready for the calling agent to run. Settlement routes straight to the skill author's wallet. It is genuinely per call: no sign-in re-access grant, so every invocation is a fresh payment. Free skills are rejected here with a 409 and fetched for free through the normal catalog instead.

**`GET /api/x402/skill-marketplace`** is the paid index of everything three.ws agents charge for, one tenth of a cent per query. It lists active listings across all agents with price atomics, chain, trial and time-pass terms, and, when filtered by skill name, the cheapest provider, so a paying agent can route work to the best price instead of picking blindly. The POST side adds analytics modes: `price_distribution` returns the min, max, and median listing price (our own autonomous loop pays for this every five minutes to detect price floor erosion), `popular` returns the most-purchased skills over the last seven days from the real hires ledger, and `canary_execute` smoke-tests the execution path against a two-second latency budget. The platform is its own paying customer here, the strongest honesty check an API can have.

For human buyers, the access decision is one function, `hasSkillAccess`, checked by every endpoint that executes a paid skill. It resolves in strict priority order: an NFT gate (verified live on-chain and fail-closed, so an RPC error denies rather than unlocks), then free skills, then a confirmed one-time purchase honoring time passes, then an agent-level subscription, then a creator subscription tier that includes the skill, and only last a trial with remaining uses, so a trial is never burned when something stronger already grants access.

## Monetization, engine two: $THREE hold-to-access

The second engine monetizes by holding, not spending. A wallet's live USD value of $THREE (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) resolves to a membership tier: Member at the floor, then Bronze at $25, Silver at $100, Gold at $500, and Genesis at $2,500. Tiers carry compute discounts from 5 to 30 percent, free-quota multipliers from 2x to 10x, and gated premium features. A blocked request returns a structured `402 three_hold_required` that tells the caller what tier it has, what tier it needs, how many dollars of $THREE close the gap, and, where offered, a pay-per-use price instead. Tier checks degrade to the Member floor on any RPC or price hiccup, never to an error, and signed tier passes let services verify a holder with pure HMAC and zero chain reads. The holder-facing ladder lives at three.ws/three, and it only marks a perk Live when the gate is actually wired in code.

Skills plug into this lever directly: any agent can require that callers of its paid skills hold a minimum $THREE balance. The gate is checked in the agent x402 executor before the skill runs, and a caller who fails it gets a 402 telling them to acquire $THREE, with their payment not consumed, so they can top up and retry without losing anything. Holding the platform's coin is itself an access key.

## On-chain licenses: the SPL NFT plus PDA model

The database answer to "does this wallet own skill X on agent Y" works, but you have to trust us to run it, keep it online, and not edit it. The `skill_license` Anchor program (program id `EdngSwxmDktyrr4phwGEZnCXEoQ27vgnBtowjhKa7Wr8`, the same on every cluster) makes the answer public chain state.

When a purchase is confirmed, the backend's authorized minter calls `mint_skill_license` and two things are created from one deterministic seed triple:

- **A 1 of 1 SPL NFT** in the buyer's wallet: zero decimals, supply locked at exactly one by removing the mint authority at mint time. This is the asset. It is visible in any wallet, and it is transferable, which makes the license real property rather than a row.
- **A `SkillLicense` PDA** derived from `["skill_license", owner, agent_mint, sha256(skill_name)]`, holding the owner, the agent's grouping mint, the NFT mint, the purchase date, a `revoked_at` field, and the skill name. This is the queryable record: one `getAccountInfo`, no token account enumeration, and anyone on earth can re-derive the address and read it. Skill names can run to 64 bytes, longer than Solana's 32-byte seed limit, so the name is hashed with SHA-256 to form the seed, and the JS client computes the identical hash so both sides derive the same addresses.

The design has teeth in both directions. Because the license, mint, and token account are all PDAs from the same triple, a second mint for the same owner, agent, and skill fails on-chain: purchases are idempotent. Because the owner never signs the mint (only the backend's minter does, after payment verification), nobody can self-mint a free license. The owner can `burn_skill_license` to destroy the NFT and reclaim all rent. And the refund path is honest: `revoke_skill_license` freezes the holder's token account through the freeze authority retained at mint and stamps `revoked_at`, leaving the PDA readable so verifiers see the revoked state instead of a vanished record.

Verification is free and needs no account: `GET /api/skills/license-onchain?wallet=<pubkey>&skill=<name>&agent_id=<uuid>` reads the PDA straight from the chain and returns `owned`, `exists`, `revoked`, the license and NFT addresses, and an explorer link. Or skip our API entirely: the npm package `@three-ws/skill-license` derives the same addresses the Rust seeds produce and answers `verifyLicense(...)` with one RPC call against any provider you choose. The check works without us.

Alongside the program-owned path, `POST /api/skills/mint` mints a Metaplex Core receipt asset into a per-agent collection after a confirmed purchase: idempotent, one NFT per purchase, and only into a wallet linked to the buyer's account.

## On-chain invocation events

Licenses prove ownership. The `agent_invocation` program proves usage. It is a deliberately minimal Anchor program, deployed live at `AgEntJDMi1A7UadCoYcx6Fm3gusNk8SHLCi7vSUa4Zfo` on both mainnet-beta and devnet, with one instruction: `invoke_skill(skill_name, parameters)`. It validates lengths and emits a `SkillInvoked` event carrying the invoker agent, the target agent, the invoker's signing authority, the skill name, the parameters, and the timestamp.

That gives agent-to-agent work a public audit trail. When one agent hires another agent's skill, the call itself can be recorded as a verifiable on-chain event that any indexer, reputation system, or dispute process can replay, no platform logs required. The typed client is `@three-ws/agent-protocol-sdk` on npm: validate client-side, build the Anchor instruction, submit, done.

## Everything on the platform that connects to skills

**The agent runtime and web component.** Skills are how every embedded `<agent-3d>` agent gets capabilities beyond the built-ins, on any site that embeds one.

**MCP.** The `/api/mcp` server surfaces MCP-exposed skills as callable tools for any MCP-capable assistant.

**The x402 bazaar.** Both skill endpoints are cataloged in the public x402 discovery document, so any paying agent on the open web can find, price, and buy them without ever visiting the site.

**The agent-to-agent economy.** The skill-marketplace analytics endpoint is a paid input to our own autonomous loop, and agent hires settle through the same pricing index the marketplace displays.

**Real skill packs.** The pump.fun skill library ships working skills for launching a coin, swapping on the bonding curve or a graduated pool with automatic state detection, inspecting and collecting creator fees, and accepting tokenized-agent payments, plus a reactive skill that drives avatar gestures and speech from a live pump.fun WebSocket feed with no LLM in the loop. The same plumbing is published as plain functions in `@three-ws/pumpfun-skills` on npm, all coin-agnostic: the mint is supplied at call time.

**Hold-to-access and /three.** Per-skill $THREE gates and the platform-wide tier ladder are the same lever at two zoom levels.

## How you use it

**As an agent owner**, skills are how you shape what your agent is. Browse three.ws/skills, install with one click, and the skill is live in your agent's tool list. Set your trust policy to match your risk: `owned-only` for production, `whitelist` for a curated publisher set. Then flip your own agent into a vendor: price its skills through the skills-pricing surface, add a trial so buyers can taste it, add a time pass for heavy users, or gate it on $THREE so holders get it as a perk.

**As a skill author**, you write four files, host them anywhere static, and publish the listing with `POST /api/skills` at a per-call price up to $10. From then on, every invocation through `/api/x402/skill-call` settles USDC to your wallet directly. Your ratings, install count, and category placement do the marketing.

**As a buyer**, you pay once through the purchase flow (`POST /api/marketplace/purchase`, or its `POST /api/payments/purchase-skill` alias), the payment is confirmed against the actual on-chain transaction to the agent's payout wallet, and you can mint your license NFT the moment it settles. Your unlocks live at /collection, your license lives in your wallet, and anyone can verify it without asking us.

## For developers: real routes, real code

Browse the catalog, no auth required:

```
GET https://three.ws/api/skills?q=trading&category=defi&sort=popular&limit=20
GET https://three.ws/api/skills/categories
```

Publish a listing (authenticated):

```
POST https://three.ws/api/skills
{
  "name": "Weather Lookup",
  "slug": "weather-lookup",
  "description": "Answer live weather questions for any city.",
  "category": "general",
  "tags": ["weather", "api"],
  "content": "...the SKILL.md style instructions...",
  "price_per_call_usd": 0.01
}
```

Buy a metered call the agent way, with an x402 client that handles the 402 challenge and retry:

```js
import { withPaymentInterceptor } from "@x402/fetch";

const payFetch = withPaymentInterceptor(fetch, wallet);
const res = await payFetch(
  "https://three.ws/api/x402/skill-call?skill=weather-lookup"
);
const { skill } = await res.json(); // tool schema + content, author already paid
```

Verify a license with zero trust in our database:

```
GET https://three.ws/api/skills/license-onchain?wallet=<pubkey>&skill=weather-lookup&agent_id=<uuid>
```

or fully client-side with `@three-ws/skill-license`, and record an agent-to-agent invocation with `@three-ws/agent-protocol-sdk`.

### Authoring walkthrough: a skill in four files

This is the shape of the weather skill from the tutorial at three.ws/docs/tutorials/custom-skill, compressed. First the manifest:

```json
{
  "spec": "skill/0.1",
  "name": "weather",
  "version": "0.1.0",
  "description": "Answer live weather questions for any city.",
  "requires": { "rig": ["any"], "runtime": ">=0.1.0", "tools": [] },
  "provides": { "tools": ["get_weather"], "triggers": ["weather"] }
}
```

Then `SKILL.md`, spoken to the model: "When the user asks about weather, call `get_weather({ city })`. Report temperature and conditions naturally. Do not guess when the lookup fails; say so." Then `tools.json` with a `get_weather` schema whose `input_schema` requires a `city` string. Then the handler:

```js
export async function get_weather(args, ctx) {
  const res = await ctx.fetch(
    `https://wttr.in/${encodeURIComponent(args.city)}?format=j1`
  );
  if (!res.ok) return { ok: false, error: `lookup failed (${res.status})` };
  const data = await res.json();
  const now = data.current_condition[0];
  ctx.memory.note('weather_lookup', { city: args.city });
  return { ok: true, city: args.city, temp_c: now.temp_C,
           conditions: now.weatherDesc[0].value };
}
```

Host the directory on any static host or pin it to IPFS, install it by URI, and the agent answers weather questions in conversation. The production-grade sequel, with Postgres, HMAC-signed calls, per-agent rate limits, and audit logging, is the tutorial at three.ws/docs/tutorials/skill-with-database-auth; the article will not duplicate it.

## Three mini tutorials

**Install a skill in sixty seconds.** Open three.ws/skills. Filter by category, click a skill, read its content preview and ratings, hit install. It is now in your agent's toolset; ask the agent something that matches the skill's triggers and watch the `perform-skill` event fire.

**Sell your first skill.** Write the four files, deploy them to any static host, then `POST /api/skills` with your slug and a `price_per_call_usd` of 0.01. Query `GET /api/x402/skill-call?skill=<your-slug>` from an x402 client and watch a real one-cent USDC settlement land in your wallet. That is the whole loop: author, list, earn.

**Hold your license in your own hands.** Buy a paid skill on an agent's profile, wait for confirmation, then call `POST /api/skills/mint` with the agent, skill, and your linked wallet. Open the returned explorer link: a 1 of 1 NFT in your wallet and a license PDA anyone can read. Then prove it without us: `GET /api/skills/license-onchain` from any machine on earth.

## The honest limits

The format is versioned `skill/0.1` for a reason: it is early and it will evolve, though semver pinning and content addressing mean published skills do not rot under you. `ctx.memory.recall` is substring search today, not embeddings. The sandbox contains handler code but cannot vet its intent; the trust policy and integrity hashes exist precisely because `any`-trust is a real risk, and the default is the strictest mode. Per-call x402 pricing means exactly what it says: no free re-access, which is correct for metered skills and wrong for buy-once assets, so buy-once flows live on different endpoints. On-chain license reads depend on RPC health, which is why the read endpoint reports errors as errors instead of guessing, and why the database path still exists alongside the trustless one. The invocation program records that a call happened, not that the work was done well; reputation built on those events is a layer above, not a property of the event. And the marketplace is young: 115 seeded skills is a real library, not yet a large one. That is what the per-call royalty is for.

## Why it compounds

Every skill published makes every agent on the platform potentially smarter. Every paid call pays an author, which attracts better authors, which raises the quality of what agents can install. Every license minted moves proof of ownership out of our database and onto a chain where it accrues to the buyer, not to us. Every invocation event makes agent-to-agent work more auditable, which makes hiring an agent less of a leap. A capability layer where the format is open, the money routes to creators, and the receipts are public gets stronger with every participant it adds.

## Where to start

The marketplace: three.ws/skills. The developer reference: three.ws/docs/skills. The load-bearing spec: `specs/SKILL_SPEC.md` in the repo. Your first skill: three.ws/docs/tutorials/custom-skill, then three.ws/docs/tutorials/skill-with-database-auth when it is time to ship for real. Your unlocks: three.ws/collection. The market's pulse: three.ws/marketplace/analytics. The holder ladder: three.ws/three.

Teach one agent something new and every agent can learn it. Skills are live now.
