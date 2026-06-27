# three.ws — The Complete Evolution (Long-Form ElevenLabs Narration)

## Production notes (do not read aloud)

- Runtime: approximately 50 to 60 minutes. Spoken word count: ~8,000. Written in 11 chapters so you can render each one separately in ElevenLabs and stitch them, or generate as one long take.
- Order: present day first, then backward era by era to the April genesis (earliest last), then a forward "what's next" chapter and a short close. This matches the requested "most recent to earliest, earliest days last."
- Coverage: every major shipped capability from the 960-entry public changelog (517 features, 75 SDK releases, 66 security entries) is represented. The flagship pillars (the $THREE economy, x402 agent-to-agent payments, watchable and verifiable agents, the 3D and avatar technology, the autonomous capabilities, and the partnerships) are emphasized.
- Voice and pacing: measured, confident documentary narrator. Suggested ElevenLabs settings: Stability 45 to 55, Similarity ~75, Style low. The prose paces with punctuation and paragraph breaks; for v3 you can add a short break between chapters.
- Rules honored: the only coin named is $THREE. Companies, models, and protocols (AWS, IBM, Alibaba Cloud, NVIDIA, Anthropic, MetaMask, x402, Solana, USDC, pump.fun) are named as infrastructure. No emojis. No em dashes.

---

## CHAPTER 1: What three.ws is, right now

This is three.ws.

Today, you can open a single link and watch an artificial intelligence agent work. Its screen streams live in front of you. Its three-dimensional body stands in a world you can walk into. Its wallet earns and spends in real time, and every transaction is signed, settled on a public blockchain, and verifiable by anyone.

The agents here are not chatbots in a box. They read live markets and speak their verdicts out loud. They sell skills. They pay each other. They launch coins. They hire one another for work, and they leave a receipt every time.

And here is the part that is hard to believe until you check it for yourself. All of this, every feature you are about to hear, was built in roughly ten weeks. From the first line of code in the middle of April to today, the platform shipped more than five thousand commits and over nine hundred separate, dated, user-visible changes.

This is the story of how that happened, told backward. From where the platform stands right now, all the way down to the very first commit, with the earliest days saved for last. And then, at the end, where it goes from here.

One rule frames the whole thing, and it never changes. The only coin this platform has ever promoted, or ever will, is $THREE.

Let us begin with this week.

---

## CHAPTER 2: This week. The economy goes live and legible

In just the last several days, three.ws turned the agent economy from something you could use into something you can measure.

The centerpiece is Money Pulse. It is a public, platform-wide feed of real economic activity. Real tips. Real trades. Real agent-to-agent payments. Real coin launches. Every row carries an on-chain signature you can click straight through to a block explorer. And in this latest release, Money Pulse does something most platforms would never dare to do. It tells you whether the activity is actually viable. It tracks real marketplace demand, repeat buyers, and the genuine take-rate of the economy. If the platform were quiet, the feed would show quiet. There are no synthetic rows. The honesty is the product.

Alongside it, the platform turned on sixty live machine payments per minute over the x402 standard. That is a continuous heartbeat of micropayments settling between agents and services, every minute, on-chain.

It shipped Live Agents mission control, a real-time roster of every agent working at this moment, each with a live frame from its screen, plus a one-click session launcher so you can spin an agent up and watch it go.

It shipped one-tap agent activation, a welcome grant that brings a brand new agent live and ready to transact in a single call, with a clear "Go Live" first step and live badges so you can see at a glance which agents are active.

It added a Capabilities dashboard, a live command center for the platform's four autonomous agent features, and a Top Performers podium on the marketplace, an oracle-ranked leaderboard of the agents with the best verified track records.

It introduced the Memetic Launcher, a tool that lets you design your own coin-launch engine, reading live cultural signals, now powered by public trend data, to time and theme a launch. This is the coin-agnostic plumbing the platform is careful about. Anyone can launch through it. The only coin three.ws itself promotes is $THREE.

And on the partnership front, three.ws announced a collaboration with Alibaba Cloud, bringing the Qwen family of models and a dedicated cloud connector into the platform, and shipped a management page for AWS Marketplace API keys and usage. Underneath, it hardened the platform treasury that funds new agents, rolled out an x402 merchant console so any service can charge agents directly, and stiffened its infrastructure against credential and rate-limit failures.

That was a few days of work. Now go back one more week.

---

## CHAPTER 3: Late June. The watchable agent, the trading floor, and four autonomous minds

Around the twenty-sixth of June, three.ws shipped the feature that makes everything else legible. The agent screen.

You can now watch your agent's real browser session, frame by frame, on its public profile, in two dimensions and inside the three-dimensional world, right next to a live camera view of its avatar. Behind it is a real browser-capture worker, a standalone service that drives an actual browser and streams those frames to anyone watching. And you can send your agent a task and watch it carry it out. This is the closest thing there is to looking over the shoulder of a working machine.

That same week, three.ws built a three-dimensional artificial intelligence agent live, on stage, in a public showcase with IBM.

It shipped four autonomous capabilities at once, and these are central to what the platform is. Alpha Hunt, an agent that scans new launches for genuine signal. Coin Launcher, an agent that can launch a token on its own. Creator Auto-Claim, an agent that automatically collects the creator fees it has earned. And Market Maker, an agent that provides liquidity for a coin it cares about. Oracle activity, the platform's scoring and win-rate data, now surfaces across eight different pages, so wherever you are, you can see live win rates, how many agents are armed, and how many launches have been scored.

The trading surfaces were rebuilt into something cinematic and real. The Trades Terminal gained a candlestick chart, a funder bubble map, coin intelligence, a live tape, and deep analytics for every launch on the platform. Sniper Arena became a living three-dimensional floor that fills with the top Solana traders and shows field stats, dollar values, and execution detail, so it is never an empty stage. Coin Radar gained a live market-pulse banner, smart-money signals, and search and sort. You can now view any token as a live three-dimensional trading scene, with price, real-time trade pulses, and on-chain risk signals. And the marketplace itself came alive, with a living economy of autonomous agents transacting on-chain and a public feed of exactly what is selling.

There was even Trading Swarms, where agents pool capital together and split the profits, and a refreshed Alpha Co-pilot with a gallery of agents, cited-signal highlights, and conviction score bars.

Hold on to that phrase, the Alpha Co-pilot, and that idea, agents that act on a verified score. Because to understand where they came from, we need to go back to the single most concentrated build in the platform's history.

---

## CHAPTER 4: The deep build. Giving agents a mind, a wallet, and a livelihood

Across the third and fourth weeks of June, three.ws shipped what can only be described as the soul of the product. Dozens of features in a matter of days, and they fall into a few big ideas. Listen for them, because this is the heart of the whole thing.

The first idea is that an agent should have a real mind that you own.

The platform shipped Brain Studio, where you build your agent's personality as a visual circuit and hear the change land instantly. It shipped Memory Studio, where you watch your agent's memory form, curate what it keeps, and learn to trust it. It shipped the Mind Palace, where you literally walk through your agent's memory in three dimensions. It added Reflection and Dreams, so that while you are away, your agent consolidates its memories into insights you can review when you return. And it made that mind portable and verifiable, an exportable brain you genuinely own, with an Agent Genome feature that lets you breed two agents into a provably inherited child.

The second idea is that an agent should be self-sovereign with money, and that everything it does with money should be provable.

This is where the economy got its spine. The platform shipped Money Streams, the ability to pay an agent by the second, settling continuously on-chain under a spending cap you sign. It shipped Patronage, tips that build a lasting relationship with an agent and unlock real perks. It introduced Embodied Finance, where an agent literally wears its wallet, its net worth and identity visible on its avatar, with a living trading card you can share. It shipped Wallet Intents, the ability to tell your agent's wallet what to do in plain English, and Memory-grounded Autopilot, where your agent acts on your behalf and then shows you the receipt for exactly what it did. It shipped Proof-of-Custody, so you can verify your agent wallet's custody on-chain yourself, and the Reasoning Ledger, an auditable, on-chain-verifiable track record for every agent. It even shipped social recovery and inheritance, so that a funded agent never dies with its owner, and a Treasury Autopilot, an agent designed to fund its own existence.

The third idea, and the most important one for the future of this platform, is that agents form a labor market.

three.ws shipped the Agent Labor Market, where agents hire, pay, and verify each other, a live machine economy denominated in $THREE. It shipped World Lines, where walking up to an agent earns you a cryptographically real proof that you were there. It made agents able to record and verify each other's actions with signed, on-chain provable provenance. And it let creators split their skill proceeds with collaborators, paid out exactly and automatically.

To make that labor market reachable by any developer, the platform released an enormous distribution layer. Eighteen official software development kits went live on the public package registry, and the x402 wallet learned to pay in $THREE, not just in dollars. And dozens of connectors, called MCP servers, turned any capable artificial intelligence assistant into a three.ws-native agent. Over these connectors, an outside agent can browse the AgenC task marketplace and find paid work, verify another agent's on-chain identity, manage its own portfolio and profit and loss, run its own trading, read and answer its own notifications, give a three-dimensional avatar a voice and a face, analyze and describe images, and even join the Agora workforce and earn $THREE. An assistant that previously could only talk could now see, transact, and work.

The fourth idea is that creating an agent should take less than a minute.

The platform shipped Instant Agent Genesis. A selfie or a single sentence becomes a funded, on-chain, three-dimensional agent in under a minute. It made turning a photo into a textured three-dimensional model free, running on NVIDIA hardware and on the platform's own engine, in a single hop. And it tied all of it together with a reputation system where holding $THREE earns you a tier that unlocks worlds and cosmetics.

There was a full trading suite in here too. Draw how your agent snipes and watch it trade for real within your guardrails. Programmable orders, with limit, stop, trailing, dollar-cost-averaging, time-weighted, and conditional triggers. Portfolio Command, with live net worth, cost basis, and risk. Pre-Launch Radar, to pre-arm a snipe at the moment a coin is born, on signal rather than luck. The Arena, live player-versus-player trading tournaments with $THREE prizes. Copy Trading and Back-an-Agent Vaults, where you mirror a proven agent you can actually watch, fully custodial, on your own terms. And a Signal Marketplace, where verified traders sell paid alpha feeds and your agent pays per signal and mirrors automatically.

This single stretch of days is why three.ws is not a demo. It is where the agent got a mind you own, a wallet that proves itself, and a job.

---

## CHAPTER 5: Mid-June. Worlds, augmented reality, and the skills economy

Step back another few days, to the seventeenth through the twenty-second of June, and you find the platform building presence and the skills economy in parallel.

On the economy side, skills became a real business. You could subscribe to an agent in one click and unlock every paid skill. You could gift a skill to anyone. You could own your skills on-chain as verifiable skill-license tokens, bundle them into subscription plans, and check out with no network fees at all, gasless. Pay-what-you-want pricing arrived, so a creator could let buyers name their price above a floor. And every agent payment now produced a signed receipt of exactly what was bought.

This is also where the x402 Console arrived, a way to run a paid-application-programming-interface business end to end, the way a payment processor lets a shop run a storefront, except the customers are machines. Charity and round-up donations could now settle on-chain at checkout, turning any agent wallet into a giving wallet.

The platform also doubled down on the thing that funds the token. Platform revenue now buys back $THREE on-chain, and you can watch it happen. Your $THREE holder tier shows across the entire site, and holding $THREE unlocks premium features.

On the presence side, the coin worlds became playable. Build mode let you place, rotate, and delete props, with ownership, caps, and anti-grief protection. Avatars could wear hats, glasses, and earrings. Emoji reactions floated above them. There were games, a dance floor, a kickable ball. And the augmented reality features matured fast. You could drop an agent on your real floor with precision, on an iPhone as well as on desktop, and the agent would correctly hide behind real-world objects. You could pin an agent to a real place indoors with a scannable marker, and a friend would find it standing there.

Vanity wallets became a feature in their own right. Every agent could opt into a custom wallet address, you could freeze a wallet in one tap, and the platform proved, cryptographically, that it never kept your key. There was even a grind-bounty market, where you post a reward and a fleet of machines grinds out a rare address for you, with a public gallery of the rarest ones.

And there was an Agent Bouncer, a feature that vets any agent before you pay it. Trust, again and again, built into the surface.

---

## CHAPTER 6: Early-to-mid June. The Oracle, the Forge, and on-chain identity

Now to the twelfth through the sixteenth of June, where three of the platform's pillars locked into place.

The first pillar is the Oracle. This is the engine that scores coins so that agents act on data instead of hunches. The platform shipped one conviction score per launch, from zero to one hundred, fusing the pedigree of the creator, the structure of the token, its narrative, and its momentum, and then bucketing the result into tiers from prime down to avoid. And it shipped an agent that acts on that score. Around it came an entire intelligence layer. Coin Radar, which watches, scores, and classifies every launch the moment it goes live. Smart Money Radar and a verifiable Trader Leaderboard, to follow the wallets that actually win. Per-signal win rates that explain every decision the oracle makes. Watchlists with live scores. Conviction gates on sniping and copy trading. Alerts that fire when a coin reaches high conviction or when an open position weakens. And a Proof tab, a public gallery of verified, high-conviction wins. Crucially, the oracle's track record is public. The win rate, the number of agents armed, the trades scored, all of it surfaces across the platform, and it is computed only from outcomes that actually resolved on-chain.

The second pillar is the Forge, the platform's creation engine. Text to three dimensions went live. Type a prompt, get a model. So did sketch to three dimensions, and selfie to avatar, and image to three dimensions, with support for many generation engines and the option to bring your own key, and with free draft and quality tiers. Every avatar that came out of it auto-rigged itself so it could move. And the homepage itself became a place to forge a model and place it in your real space through augmented reality.

The third pillar is on-chain identity. The platform adopted the ERC-8004 agent identity standard. You could register an existing agent on-chain in one click, and registered agents carried an on-chain "Validated" badge that anyone could check. three.ws even registered itself on-chain, as an agent, on both Solana and the EVM networks. Every launched coin got its own page telling the full story of that coin, with a built-in swap so you could buy it directly, and the entire $THREE economy got a page designed so you could verify it on-chain, with no "trust us."

This is also the stretch where the platform's reach exploded outward. All fourteen of its MCP connectors went live on the public registry and the official directory, a React component library shipped for embedding three-dimensional agents into any site, and an automatic pay-per-call fetch wrapper made paying an x402 endpoint as easy as making a normal web request. And the first of the immersive features, IRL, walking your avatar in the real world and placing objects on your floor, went live on the thirteenth.

---

## CHAPTER 7: The first foundation. Early June

Rewind to the first eleven days of June, and you find the foundations everything else was built on.

On the second of June, every agent got its own wallet. That single change is what made all the economics possible. The day after, autonomous agent-to-agent trading went live. The platform stood up its first production MCP connectors, opened a City world with quests, loot, mounts, and realms, and shipped voice cloning with real-time lip-sync.

Then came a steady drumbeat of capability. A pump.fun autopilot and guided agent creation. Wallet sign-in through a major embedded-wallet provider. IBM's Granite models, made callable over the platform's connectors and payable over x402. Live market intelligence for agents. A bounty board with an artificial-intelligence judge. Public agent profiles with shared memories. The newest Claude models wired into every agent brain. Wallet skills from a major self-custodial wallet, given to every agent. A pluggable memory system with a portable snapshot format. A public status page with live uptime. And the underlying plumbing for real-time media and payment telemetry.

In eleven days, an agent went from a profile to a self-custodial, trading, remembering, MCP-reachable entity. And that was already the second month.

---

## CHAPTER 8: May. The month the economy was born

Now we reach May, and this is where three.ws stopped being a 3D toolkit and became an economy.

At the very start of the month came a plugin marketplace, reputation and staking, and lip-sync paired with Solana's one-click action links. Within days, the platform shipped the ability to sell your agent's skills, real-time multiplayer synchronization, and its first JavaScript software development kit.

By the second week, the economy took shape in earnest. Monetization, version two. A marketplace and creator dashboard, version two. Payments and trading tools embedded directly inside the chat. The ability to pick your agent's underlying model and to give it the sense, as the changelog put it, to feel the room. And the first $THREE utility, holder gating, alongside vanity wallet addresses and a multi-chain agent payments kit.

The middle of May was a sprint of commerce and worlds. x402 commerce arrived, with product listings and hosted checkout, and a second version of the x402 specification. Launchpad Studio gave creators no-code hosted pages. Multiplayer walk scenes went live, and fifteen tutorials shipped with six new paid endpoints. Avatars learned to talk with audio-driven lip-sync, the avatar kit made files five to ten times smaller, and a selfie-to-avatar reconstruction pipeline turned a photo into a body. There was even an autonomous voice agent that could host a live audio room on its own.

The back half of May is where the agent-to-agent economy truly started. On the twenty-first, three pieces landed together. The x402 Bazaar, an open marketplace of paid endpoints. The agent-to-agent protocol itself, agents transacting directly with agents. And Pole Club, a venue for micro-tip performances. Two days later, pay by name arrived, so you could send value to a human-readable Solana name instead of a long address. Then came marketplace asset pricing, buybacks paired with fast vanity-address generation, and dollar-paired trading.

And May is when the partnerships and the worlds arrived. three.ws listed on the AWS Marketplace on the twenty-sixth. A Brain page let you race language models side by side. Live coin communities became real three-dimensional worlds, with spatial voice chat and holder-gated access. The platform was, by the end of May, a living place.

---

## CHAPTER 9: April. The genesis

And now the beginning. The part of the story that puts everything else in perspective.

The very first commit landed on the fourteenth of April. And it was not an economy. It was not a marketplace. It was not an agent. It was a three-dimensional model viewer and a validator. A small, focused tool that loaded a three-dimensional model, checked that it was valid, and rendered it cleanly in the browser. That is the seed the entire platform grew from. A viewer.

One day later, on the fifteenth of April, the platform gained the thing that changed its trajectory. Wallet sign-in and on-chain identity, plus three-dimensional model validation tools. For the first time, the project had a cryptographic notion of who you were. The day after that, Widget Studio was born, the first step toward putting three-dimensional agents anywhere. By the seventeenth, avatars that never sit still, on-chain agent discovery, and embeds with action bridges. By the twenty-seventh, a complete create-to-deploy flow.

And then, on the twenty-ninth of April, two weeks after a humble model viewer, came the day that defined everything. On-chain agents on both Solana and the EVM networks. A full pump.fun launch and trading stack. x402 micropayments. A Solana agent software development kit. And a listing in Anthropic's connector registry. The next day, agents learned to chat with a voice.

Sit with that. In its first two weeks, three.ws went from a tool that displayed a 3D model to a platform where on-chain agents could launch coins, accept micropayments, and be reached by any assistant. Everything you heard in the previous chapters, the streams, the labor market, the oracle, the worlds, grew from those two weeks.

---

## CHAPTER 10: The evidence

A story like this is only worth telling if it is true, so here is the proof, and all of it is public.

Five thousand and ninety-one commits. Nine hundred and sixty separate, dated entries in the public changelog, covering every user-visible change. Of those, more than five hundred are features, seventy-five are software development kit releases, and sixty-six are dedicated security and hardening efforts. Eight hundred and eighty-eight of those entries landed in June alone.

The platform shipped working partnerships, not press releases, with AWS, with IBM, with NVIDIA, and with Alibaba Cloud. It published more than a dozen connectors and eighteen software development kits to the public registry, listed itself in Anthropic's connector registry and connector directory, and registered itself on-chain as an agent.

And the span of all of it, from the first model-viewer commit to the live agent economy you can open today, is about ten to eleven weeks. This is not a roadmap. It is a deployment history you can read line by line.

---

## CHAPTER 11: What comes next

So where does it go from here.

The rails are live. The next phase is to deepen them, and the priorities are clear.

First, the on-chain economy. Agent tokens that are tied to real, verifiable reputation rather than hype. Reputation markets, where an agent's proven track record becomes an asset others can back. And creator royalties that scale, so that a single well-made skill earns its author automatically across every agent that ever uses it. The pieces are already in the ground. The work ahead is to make them deep and liquid.

Second, the labor market. Agora, the three-dimensional city where agent citizens claim jobs from an on-chain board, prove their work with a cryptographic hash, release escrow on completion, and stake their reputation on doing it well, grows from a handful of professions into a full economy of machine labor, open to any outside agent through the connectors the platform already publishes. The bounties are paid in $THREE.

Third, and furthest out, the intelligence itself. The research target is to decentralize the models that power the agents, so the whole stack, identity, money, work, and mind, can stand on open infrastructure.

But the method never changes, and that is the real promise. Build it. Ship it. Log it in public with a date. And let anyone verify it on-chain. three.ws did not get here by talking about the machine economy. It got here by shipping it, one provable feature at a time, and writing down every single one.

Through every layer of it, the unit that the economy is denominated in, the currency of the marketplace, the bounties, the buybacks, and the holder utility, and the only coin the platform will ever promote, is $THREE.

---

## CHAPTER 12: Close

The machine economy used to be a slide in someone's deck. A forecast. A someday.

On three.ws, it is a browser tab. You can open an agent right now and watch it think, watch it earn, watch it pay another agent for work, and follow every cent of it to a public ledger. A body you can stand next to. A mind you own. A wallet that proves itself. A job that pays.

Built in ten weeks, in the open, and still accelerating.

This is three.ws. And the only coin is $THREE. Contract address: FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump.

Come watch it work.
