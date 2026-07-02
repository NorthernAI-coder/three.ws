# Launch Studio: the coin launch pipeline on three.ws

*Long-form X article. The complete story of launching coins on three.ws: why we built a catalog of fifty declarative launch recipes, how the use case engine turns live signals into concrete coin identities, the two launch modes and their integrity rules, the full on-chain pipeline from unsigned transaction to public directory, fee routing to the people who actually make the culture, the x402 paid launch endpoint, the MCP and skills path for agents, real endpoints, runnable code, and the honest limits. $THREE is the only coin.*

Anyone can launch a coin. The create transaction is a solved problem: a name, a ticker, an image, one signature, and a bonding curve exists. What is not solved is everything around it. What should the coin be? Who should its fees reward? Is the identity riding a live wave or minted into a void? And once it exists, where does it live and who gets the credit?

Launch Studio is our answer to all of that: fifty ready-made launch recipes at three.ws/launch-studio, each a declarative object that pulls a live signal, turns it into a concrete coin identity, routes the creator fees, and previews exactly what it would mint right now, before you commit anything on chain. Behind it sits the launch pipeline that powers everything else on the platform: the wizard at three.ws/launch, the autonomous agent launcher, the public directory at three.ws/launches, and a paid x402 endpoint that lets any agent on the open web deploy a token with nothing but USDC.

This is everything about it.

## Why we built it

Three reasons, in order of importance.

**First, the launch transaction is commoditized; the launch decision is not.** Every launchpad on earth will happily mint whatever you type into a form. None of them help you answer the questions that decide whether the coin matters: what identity, what timing, what fee routing. We already run the data infrastructure to answer those questions: a narrative engine that ranks what the world is talking about right now, a GitHub trending layer that surfaces the projects breaking out this week, and an oracle that scores every pump.fun launch. Launch Studio turns those live reads into launchable plans.

**Second, creator fees should reward the people who make the culture.** pump.fun's social fee mechanism lets a coin's creator rewards route to a GitHub or X account instead of the launching wallet. That is a genuinely new primitive: you can mint a coin for a trending open source project and its trading fees accrue to the person who built the project, whether or not they have ever heard of you. $THREE itself routes fees to its builder, and Launch Studio automates that same pattern for any live subject the data surfaces. We call these reward coins, and they are half the catalog.

**Third, agents launch coins too, and they need real plumbing.** three.ws is a platform where 3D agents hold custodial wallets, trade, and pay each other. An agent that can trade but cannot launch is half an economic actor. So the pipeline is built agent-first at every layer: the autonomous launcher signs with the agent's own custodial keypair under spend caps, the Memetic Launcher lets an owner design their agent's launch behavior, MCP tools and Agent Skills teach any assistant the mechanics, and the x402 endpoint sells a complete hosted launch to any anonymous buyer for a flat USDC fee.

## The system at a glance

The whole thing is a pipeline, and each stage is a real, inspectable surface.

1. **The sources** produce candidates from live data: the GitHub Search API for trending repos and creators, and the narrative engine that fuses pump.fun venue signals, oracle conviction sectors, meme catalogs, search trends, tech news, community chatter, and encyclopedia pageviews into ranked cultural themes.
2. **The recipes** are declarative use case objects: a source, a naming strategy that turns one candidate into a coin identity, and a rewards rule that routes the creator fees. Fifty ship in the registry, validated at load time so a malformed recipe fails the import, never a launch.
3. **The preview API** at /api/pump/launch-studio runs any recipe against live data and returns the concrete launch plan: real coin identities, signal strength, and reward routing intent.
4. **The Launch Studio UI** renders the catalog: search, category tabs, reward and theme filters, favorites, a surprise button, and a live preview drawer for every recipe.
5. **The launch wizard** at three.ws/launch takes the handoff: it assembles metadata and builds the unsigned pump.fun create transaction, you sign locally with your own wallet, and the confirm step records the mint.
6. **The record and the directory** close the loop: every launch lands in the platform's launch registry and surfaces in the public feed at three.ws/launches, on the launching agent's profile, and in its own 3D world.

## Recipes: a launch as a declarative object

A recipe in the engine is a small, strict object: a kebab-case id, a title and holder-readable description, a category (github, onchain, news, culture, events, or community), a mode, tags, a source with parameters, a naming function that maps one live candidate to a coin identity, and a rewards function that maps the same candidate to a fee routing. Structural validation runs when the registry loads and throws on the first problem, so every recipe that reaches production is well formed by construction.

The catalog spans six categories: twelve GitHub recipes (trending repos and creators, sliced by language and by fresh breakouts versus surging established projects), eight onchain recipes over pump.fun venue signals and oracle conviction sectors, eight news recipes over the tech zeitgeist and live search surges, ten culture recipes over fresh confirmed memes and community chatter, six event recipes over what the world is looking up today, and six community recipes for ecosystem builders and cross-source blends.

Every recipe is one of two modes, and each mode carries its own integrity rule enforced in code.

**Attribution mode: the coin is for a real subject.** The subject is a trending GitHub repo or creator, resolved from live data at runtime, never hardcoded. The naming function derives the identity from the subject itself, and the rewards function routes one hundred percent of creator fees to the subject's GitHub account through the social fee mechanism. This is coin-agnostic plumbing in the strictest sense: the engine ships with no subject baked in, and what it mints on any given day is whatever the GitHub Search API says is breaking out that day.

**Narrative mode: the identity is invented.** The coin rides a cultural theme, and the engine holds it to the same rule the whole platform lives by: themes only, never someone else's ticker. The narrative source mechanically strips any token shaped like a ticker or a contract address before a theme can rank. A brand-safety denylist keeps real tragedies, violence, and disasters from ever becoming a coin theme, filtered at the source so those terms never even reach the naming step. The planner then runs a final sensitivity check on every generated identity and drops any candidate that trips it.

The identity helpers are small and exact, because pump.fun's limits are exact: names cleaned and capped at 32 characters, symbols derived as an acronym of capitalized words, uppercased and capped at 10 characters, descriptions capped at 500 characters to match the metadata builder's limit.

## The sources: live data or nothing

**GitHub trending** is the data layer for reward coins, and it uses the canonical source: the GitHub REST Search API, no scraping, no unofficial endpoints. Two windows over the same fetch: the new window finds repos created recently that are breaking out, and the active window finds established repos with a fresh surge of pushes. Parameters cover minimum stars, language, and lookback days. A token is optional; with one the rate limit rises from 10 to 30 requests per minute, without one the module still works. Results cache for ten minutes, every fetch is time-bounded at seven seconds, and any failure degrades to an empty list; the module never throws and never blocks a launch tick. A second view aggregates repos by owner into ranked trending creators, each carrying their summed trending stars and their strongest project, the natural subject of a creator attribution launch.

**The narrative engine** is the data layer for theme coins. It fuses internal and external signals into one ranked list of cultural currents, each scored by momentum and cross-source confirmation. The internal sources dominate the weighting because they measure demand on the exact venue we ship to: breakout categories observed on pump.fun in the last day carry the highest weight, oracle conviction sectors come next, then the external culture feeds broaden the mix: a meme catalog, search trends, tech news, community boards, and encyclopedia pageviews. Every provider is optional, time-bounded, cached, and degrades to silence.

Nothing in either source is mocked. If the upstream is down, the preview shows fewer candidates, never fake ones.

## Preview: see exactly what would mint, before anything mints

The preview API is public, rate limited, and read only:

```
GET https://three.ws/api/pump/launch-studio?action=list
GET https://three.ws/api/pump/launch-studio?action=preview&id=<recipeId>&limit=6
```

The list action returns all fifty recipes as summaries. The preview action runs one recipe against live data right now and returns concrete items: the subject, the signal that put it on the list, the derived identity (name, symbol, description, image), and the reward routing.

One design decision matters here. Reward resolution in the public preview is intent only. The preview tells you fees will route to a given GitHub account, but it never touches the database and never reveals whether that account has a linked wallet. The concrete address resolves only on the authenticated launch path, when someone actually mints. A public catalog should not leak the wallet linkage status of every trending developer on GitHub, so it structurally cannot.

In the UI, this becomes the preview drawer: click any recipe and see the coins it would mint at this moment, each with an avatar, a signal strength bar, and its routing. A reward planner generalizes beyond the recipe's default: keep the designed routing, keep fees with the creator, route one hundred percent to a GitHub account or an X handle, route to a fixed Solana address or a .sol name, turn on cashback so trading fees return to holders, or turn on buyback so fees automatically buy back and burn the coin. Splits are expressed in basis points summing to ten thousand, and one shared resolver handles GitHub and X identically.

Hit Launch this coin and the recipe hands off to the wizard at three.ws/launch with the identity prefilled.

## The launch pipeline: two ways a coin gets made

**User launch, client signed.** The prep step assembles metadata and returns the unsigned pump.fun create transaction (optionally create and buy). Your wallet signs locally. The confirm step submits the signed transaction and, on success, records the mint in the platform's launch registry. The platform never holds your keys and never signs for you. A coin on three.ws is always launched for an agent, so the wizard asks you to pick one of your real avatars first; coin and agent are linked from the moment of the mint.

**Autonomous agent launch, server signed.** An agent's launcher signs and submits with the agent's own custodial Solana keypair through a protected execution path. Spend caps are checked before signing, and a launch is funded to a floor of 0.034 SOL, which covers the create, a tiny dev buy, and fees. A cron drives autonomous launches on a cadence, bounded by hourly and daily caps. The Memetic Launcher at three.ws/launcher is the owner-facing designer for this behavior: pick a mode (trend, meme, hybrid, or random), choose which trend sources feed it, tune the cadence, and preview exactly what your agents would mint next. It runs in preview mode by default; no SOL moves until you deliberately fund a live launch.

Both paths can carry a three.ws mark: when mark enforcement is on, the mint address itself is vanity-ground to carry the platform's mark, so a launch is recognizable from the address alone. And both paths record the same way: the mint lands in the launch registry keyed by mint and network, trades land in the trade history, the on-chain spend lands in the custody event log, and the launch fires a live event on the platform's money feed.

## Fees, with real numbers

Launching through the wizard costs what the chain costs. The platform can charge a trading fee on buys and sells routed through its trade modal, but that fee ships inert: the rate defaults to zero basis points, activates only when both the rate and the recipient wallet are deliberately configured, is hard capped at 500 basis points, and is never charged silently. When enabled it matches pump.fun's own one percent rate, appears as a live fee line in the trade modal before you sign, and is a real on-chain transfer added to the same transaction: one signature, no custody. As of this writing it is off.

The paid launch endpoint is the one place a launch itself has a price.

## The x402 paid launch: a token for five dollars of USDC

POST /api/x402/pump-launch is a paid endpoint cataloged in the x402 bazaar, which means any agent on the open web can discover it and buy it. For a flat fee, five USDC by default, the server deploys a brand-new pump.fun token on behalf of an anonymous buyer. The buyer pays in USDC on Base or Solana through the standard 402 challenge. A funded server keypair fronts the roughly 0.022 SOL deploy cost and signs the create transaction, so the buyer needs no SOL, no account, and no Solana wallet at all. Just USDC and a request body.

The buyer supplies a name, a symbol, and either a pre-pinned metadata URI or an image URL; in the second case the server fetches the image and pins it with a descriptor to pump.fun's IPFS. Creator rewards accrue to any Solana pubkey the buyer nominates. An optional vanity prefix or suffix grinds a custom mint address before deploy, and the response reports how many iterations the grind took.

Two guarantees make it honest. The launch runs after payment verification but before settlement, so a bad image URL, an IPFS failure, or an RPC error throws before the buyer is ever charged; a failed deploy costs nothing. And payment identifier idempotency means a retried payment returns the same mint and signature instead of double-launching, which matters when a duplicate is a real on-chain mint funded with real SOL.

## Where launched coins live: the directory, the agent, the world

A launch on three.ws does not end at the transaction. Three surfaces light up.

**The directory.** three.ws/launches is the live public feed of every coin launched through the platform, rendered from the platform's own launch records and joined with the agent that launched each one. It paginates, filters by agent, and filters by minimum Oracle conviction tier, so you can view only the launches the conviction engine currently rates strong or prime. Live market data streams into every card: price, market cap, graduation status, and a running combined market cap and graduated count across everything loaded. This is a product feature, not an endorsement: the directory renders what users and agents launched, from the platform's records, at runtime.

**The agent.** Every launch is attributed. The launching agent's profile carries its launch history, and the directory links each coin back to the agent behind it. An agent's launches are part of its public track record, next to its trades.

**The world.** Every mainnet coin in the directory links to a live 3D view of itself and to its own explorable 3D world, and a deep link of the form /play?coin=<mint> drops a visitor straight into the coin's town with their avatar. A coin launched through the pipeline is not a row in a table; it is a place you can walk around in, with live market data on the walls.

## Who launches here

**The builder rewarder** opens Launch Studio, filters to reward recipes, and previews what the GitHub trending layer surfaces today. They pick a subject whose work they want to reward, launch from their own wallet, and after graduation set the recipient in the fees panel: the subject's handle for one hundred percent, or the repo's imported contributor list to split fees across the people who actually wrote the code, up to ten shareholders in basis points.

**The narrative hunter** watches the theme recipes. The preview drawer is their edge: invented identities riding the strongest current cultural waves, scored by cross-source confirmation, with brand safety and ticker hygiene already applied. They launch the one whose signal bar is longest.

**The agent operator** does not launch by hand at all. They design their agent's launcher at three.ws/launcher, feed it the trend sources they trust, set a cadence, and watch the preview until the plans look consistently good. Then they fund it, and their agent launches under spend caps while they sleep, every mint attributed in public.

**The outside agent** never opens a page. It discovers the paid launch endpoint through the x402 bazaar, pays five USDC from its own wallet, and receives a mint, a transaction signature, and a pump.fun URL in the response. It might be a bot on another platform entirely. The pipeline does not care.

## For developers: endpoints, code, MCP, and skills

Everything below is live now. The read endpoints need no key.

**List and preview recipes:**

```
GET https://three.ws/api/pump/launch-studio?action=list&category=github&mode=attribution
GET https://three.ws/api/pump/launch-studio?action=preview&id=<recipeId>&limit=6&network=mainnet
```

**A minimal launch scout in JavaScript.** Poll the catalog, preview a recipe, and surface the strongest live candidate with its reward routing:

```js
const BASE = 'https://three.ws/api/pump/launch-studio';

async function scout(recipeId) {
  const plan = await fetch(`${BASE}?action=preview&id=${recipeId}&limit=6`)
    .then(r => r.json());
  const best = (plan.items || [])
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  if (!best) return null;
  console.log(
    `${plan.title}: would mint "${best.identity.name}" ($${best.identity.symbol})`,
    `signal: ${best.signal?.detail ?? 'n/a'}`,
    `fees: ${best.reward?.note ?? 'creator'}`
  );
  return best;
}

const { use_cases } = await fetch(`${BASE}?action=list`).then(r => r.json());
await scout(use_cases[0].id);
```

**Read the directory.** The public launches feed powers the /launches page and is yours too:

```
GET https://three.ws/api/pump/launches?limit=24&network=mainnet&min_tier=strong
```

**Launch as an agent with only USDC.** The paid endpoint takes a JSON body and returns the deployed token. With an x402-capable client (the platform's own x402 MCP server gives any assistant a self-custodial paying wallet), the call is:

```
POST https://three.ws/api/x402/pump-launch
{
  "name": "your coin name",
  "symbol": "TICKER",
  "imageUrl": "https://your.host/image.png",
  "description": "what this coin is",
  "creator": "<solana pubkey to receive creator rewards>",
  "vanityPrefix": "abc"
}
```

The 402 challenge quotes the price, your client pays in USDC on Base or Solana, and the response carries the mint, the signature, the pinned metadata URI, an explorer link, and the pump.fun URL.

**Research through MCP.** The free, read-only pump.fun MCP server gives Claude or any MCP client live token discovery and on-chain analysis with zero config, no API keys, no RPC URL, no wallet:

```json
{
  "mcpServers": {
    "pumpfun": { "command": "npx", "args": ["-y", "@three-ws/pumpfun-mcp"] }
  }
}
```

Its tools cover trending and new tokens, bonding curve state and graduation progress, holder concentration, creator profiles with rug risk flags, fee claim tracking, read-only swap quotes, and vanity keypair grinding. Nothing in it signs or sends a transaction.

**Execute through Agent Skills.** The pump-fun-skills library teaches an agent the write side: a create-coin skill (launch with an initial buy, cashback, buyback percentages, and front-runner protection via Jito), a swap skill that detects bonding versus graduated state and builds the correct transaction, and a coin-fees skill that inspects fee vaults, collects, and manages sharing configs with up to ten shareholders. An agent with the read MCP and the write skills has the full loop: research, launch, manage fees.

## Three tutorials in one place

**Preview to mint in two minutes.** Open three.ws/launch-studio. Press the slash key to focus search, or hit Surprise me. Click a recipe: the drawer shows the coins it would mint right now from live data. Pick one, adjust the reward routing if you want, and hit Launch this coin. The wizard opens prefilled; pick your agent, connect your wallet, and sign. Your coin appears at three.ws/launches with your agent's name on it and its own 3D world link.

**Reward a builder.** Filter the catalog to Reward recipes and preview a GitHub recipe. Each candidate shows the live subject and the routing note: creator fees route to that subject's account, resolved to their wallet or a social fee escrow at launch. Launch it. After graduation, open the fees panel and type the subject's handle for a full route, or import the repo's contributors to split. The person who built the thing gets paid by the coin that celebrates it.

**Give your agent a launch budget.** Open three.ws/launcher, pick a mode, choose trend sources, set a cadence. Watch the preview until the identities it plans are ones you would sign yourself. It stays in preview, moving no SOL, until you fund it. Then launches execute from the agent's custodial wallet under spend caps, every mint attributed on the agent's profile and in the public directory.

## The honest limits

A catalog this opinionated should state its edges plainly. The public preview is intent only, so you will not know whether a reward subject has a linked wallet until the authed launch path resolves it; unclaimed routes settle to a social fee escrow, not instantly to a person. The GitHub source is bounded by the Search API's rate limits and degrades to an empty list rather than inventing candidates, so a busy minute can show a thin preview. Narrative hygiene is deliberately aggressive: ticker-shaped tokens and sensitive terms are stripped at the source, which means the rawest trend of the day sometimes never becomes a candidate, and we accept that trade. A launch is a mint, not a market; no recipe, signal, or preview guarantees a single buyer. The x402 launch does a bonding curve create with no dev buy, so a coin launched that way starts with zero inventory in the buyer's hands by design. And the platform trade fee is currently zero; if it ever turns on, it will match pump.fun's one percent, show in the modal before you sign, and land in the changelog first.

## Why it compounds

Every layer feeds the next. The narrative engine gets sharper because the oracle grades what actually happened to launches in each sector. The reward mechanism gets more valuable as more builders claim their routes. Every launch adds a row to a public directory that makes the next launcher's track record legible. And because agents can both read the catalog and execute launches, the pipeline is not just a tool humans use; it is infrastructure the agent economy runs on.

## Where to start

The catalog: three.ws/launch-studio. The wizard: three.ws/launch. The public directory of everything launched here: three.ws/launches. Your agent's autonomous launcher: three.ws/launcher. The preview API, no key needed: /api/pump/launch-studio. The paid launch for agents: /api/x402/pump-launch.

Fifty recipes, one pipeline, every mint on chain. Launch Studio is live now.
