# Play: every coin community gets a world

*Long-form X article. The complete story of Play, the live 3D coin worlds of three.ws: why a community needs a place, how a mint address becomes a world, the city and district system underneath it, the NPCs with real price tags, the cosmetics economy, every way real money moves inside the world, the tutorials, the honest limits, and where to start. $THREE is the only coin.*

A coin's real asset is its crowd, not its chart. Strip away the candles and what is left is a group of people who chose the same symbol at the same time. And yet that crowd has nowhere to stand. It lives in comment threads and group chats, placeless, scattered across feeds that forget everything by morning. The chart has a URL. The community does not.

Play is our answer to that. Every coin on pump.fun gets its own live, walkable, multiplayer 3D world, generated deterministically from its mint address, running in the browser with no install. Holders drop in as their own 3D avatars, talk by proximity voice, build structures that persist, watch real on-chain trades ripple through the environment, and spend real USDC at kiosks and NPC counters that are genuine paid endpoints. It is live at three.ws/play, and the flagship world is the $THREE town, pinned at the top of the lobby.

This is everything about it.

## Why we built it

**First, a community without a place is a community on borrowed land.** Every coin community today rents its existence from a chat app or a feed. We wanted a world that belongs to the coin, addressed by the coin, shaped by the coin. In Play, the world is literally a function of the mint address: same mint, same world, every visitor, every time. The world is a fingerprint of the coin.

**Second, the agent economy needed a stage.** three.ws is a platform where 3D agents hold wallets and pay each other in USDC over x402. Those payments are real, but a JSON receipt does not make anyone feel anything. Put two embodied agents in a plaza, let a player press E, and watch one pay the other on Solana mainnet with an explorer link, and the machine economy becomes something you can stand next to.

**Third, the flywheel feeds everything else.** The worlds consume the platform's live pump.fun feeds, its avatar pipeline, its Oracle intelligence, and its x402 rails, and they give back attention, cosmetics revenue, and paid intel calls. We did not build a minigame. We built the place where the platform happens.

## The system at a glance

1. **The lobby** pulls live coins from the pump.fun firehose through the platform's own proxies: trending fills the grid, and search reaches any coin on pump.fun by name, symbol, or mint. No listing process. If the mint exists, the world exists.
2. **The seed** is an FNV-1a hash of the mint address. It picks the world's biome, jitters the palette so two coins in the same biome still read differently, and seeds every deterministic system downstream, so every client renders the identical world.
3. **The room** is a Colyseus multiplayer room keyed to the mint. The server is authoritative for position, chat, avatars, builds, and the entire gameplay economy; clients predict their own movement and interpolate everyone else at 15 updates a second, with anti-teleport and bounds clamps enforced server side.
4. **The world systems** mount per coin: the totem, the jumbotron, the live chart, the market reactor, the NPC cast, the intel kiosk, the agent exchange, the build layer, the skill activities.
5. **The money layer** runs on x402: every paid interaction inside a world is a real USDC settlement signed by the player's own wallet, on Solana or Base, with an explorer link.

## One mint, one world

Seven biome archetypes ship today: Verdant Meadow, Dune Sea, Frostfields, Ashen Caldera, Neon Expanse, Lagoon Shore, and Dust Gulch, the frontier town. The seed selects one and then applies a per-coin hue and lightness jitter to the whole palette, so a thousand coins render a thousand recognisably different worlds. Each biome carries its own sky gradient, fog range, lighting rig, ground palette, and flora, from meadow conifers to emissive alien crystals to gulch sagebrush. An eighth biome, Midnight, is curated rather than seeded: a near-monochrome dark world reachable only by explicit request, built for embedding on dark host pages.

Travel is by link, and that is deliberate. Entering a world rewrites the URL to /play?coin=&lt;mint&gt;, so every community is a shareable, refreshable address.

Every coin actually gets two worlds. The General room is open to anyone, no wallet required. The Holders room is gated: you prove you hold the coin (an eight dollar floor by default, or a token-count threshold the coin's creator sets in-world), sign a message, and receive a ten-minute play pass the server checks on join. Nothing moves on chain to prove it.

## The $THREE home town

The flagship world is the $THREE town, and it does not ride the seed lottery. It is pinned permanently to the top of the lobby, badged official, and dressed in the Dust Gulch frontier biome by decree: a packed-dirt square ringed by thirteen false-front storefronts drawn from a seeded shuffle of period names (SALOON, GENERAL STORE, SHERIFF, BANK, HOTEL, ASSAY OFFICE, GAZETTE, TELEGRAPH, and friends), a water tower on the skyline, tumbleweeds rolling the mesa, and the saloon windows glowing warm. The lobby card refreshes the town's name, art, and market cap live from the coin API, and the intro card sends first-time visitors there in one tap with a default character and zero wallet friction. This is the front door of the platform.

## The plaza: where the market becomes weather

Every world centers on a plaza, and the plaza is a live instrument panel for the coin. The **coin totem** spins slowly at the center, a floating gold disc carrying the token's art. The **jumbotron**, a twenty-four meter LED wall, shows the coin's art, symbol, market cap, and a live count of who is in the world right now. The **chart screen** streams the coin's real swap tape: price, session chart, volume, buy and sell pressure, and a scrolling ticker fed by actual on-chain trades.

Then the **market reactor** turns that tape into weather. Every buy sends a green ripple ring across the plaza floor and flashes the world's boundary ring; every sell ripples red. Sustained volume accumulates heat that spins the totem faster. The rolling percent change drives the world's mood, easing fog and sunlight between storm and euphoria as a tide, not a strobe. And a whale trade of 750 dollars or more detonates the full spectacle: a light beam over the totem, a shockwave, and on a buy, a fountain of golden coins off the totem crown, with a toast naming the size.

Beside all this floats the **forecast sculpture**: a glowing 3D ribbon rendering the live $THREE price history as a light tube, a white seam marking now, and an IBM Granite TimeSeries forecast sweeping forward from it, colored by direction and wrapped in an uncertainty band that widens across the horizon. It fails silent rather than fake if the feed is down.

## The city underneath: districts, zones, and the open world foundation

Under the plaza sits the open world foundation, the data spine and geometry that turn a clearing into a city. The map is a 400 meter square. The plaza survives at its heart as **Downtown**, a 58 meter radius safe zone: no PvP, vendors, every player spawn. East of it, **The Docks** run to the map edge, flagged for water and cargo, with a three-slot race grid on the dock front. The ordinary block grid between is **The Streets**, neutral ground with background traffic. Everything past 138 meters from center is **The Wilds**: lawless outskirts, flagged for PvP and loot. A single spawn registry places everything, from the four player drop-ins at the origin to the vehicle bays on the avenues, and the server mirrors the same bounds authoritatively, so the rendered world and the anti-cheat clamp agree about where the edge is.

The district itself is a deterministic city: an asphalt grid of 46 meter blocks and 12 meter roads ringing Downtown, each block a raised sidewalk slab carrying one to three building shells, taller toward the center so a real skyline forms, every facade a shared texture whose lit windows double as the emissive map, streetlights at every intersection. The whole city is a handful of instanced draw calls, every building a physics collider, identical on every client because it is generated from the coin's seed. A day and night system drives it: an authoritative world clock, eight real minutes to a world day by default, arcs the sun from sunrise through noon to sunset, grades the sky through dawn and dusk palettes into the biome's daytime colors, closes the fog in after dark, and switches the windows and streetlamps on at dusk.

Vehicles complete the foundation. Four types share one spec table between client and server: a loose-tailed coupe topping out near 100 kilometers per hour, a balanced sedan, a planted 1,950 kilogram pickup, and a stiff little buggy. The server seeds a six-car fleet into every world, two of them parked at the plaza edge so a fresh player finds a ride within a few seconds' walk, and validates every driver against a hard speed ceiling while everyone else sees an interpolated ghost.

Honesty requires a line here, expanded in the limits section: the plaza and everything on it is what you walk in a coin world today. The district renderer, the moving day, and the client-side driving manager are engineered code in the tree, and the multiplayer server already enforces the 400 meter bounds and seeds the fleet, but they are not yet mounted in the live coin client. We describe them because they are real and because they are the shape of where the worlds are headed, not because you can hail the coupe tonight.

## The citizens: NPCs with jobs and price tags

Every town has a cast of named citizens, and they are not decoration. Each has a persona, a post, and in most cases a working paid service behind the counter.

Talk to any of them and you get a real conversation: chat streams from the platform's multi-model brain endpoint over server-sent events, up to 512 tokens a reply, with a 24-turn memory. Each NPC is hard-locked to its persona, aware of which coin's town it is standing in, allowed to discuss the local coin factually, and permitted to promote exactly one coin ever: $THREE.

The vendors run real x402 counters, each a genuine paid endpoint settled in USDC from your own wallet: Marisol the trader sells a live market signal for one cent. Sheriff Boone runs fact checks for a dime. Old Pete grinds vanity Solana addresses from a penny. Wendell at the assay office checks ticker availability for a tenth of a cent; Mei at the foundry turns a mint into a 3D mesh for the same. Doc Halloran audits an agent's books for two cents. The Oracle reads a wallet's on-chain reputation, and Miss Ada the schoolmarm tutors, a penny each. The Saloon Kid takes dance floor tips. And Banker Cole, the smooth-talking frontier banker, will launch you a coin for five dollars. Every price is a real 402 challenge, every settlement a real transaction.

## Real multiplayer, honest ambience

Play draws a hard line between real presence and ambience, and tells you which is which.

The multiplayer is real: Colyseus rooms keyed by mint, a server authoritative for everything that matters, 15 Hz movement with prediction and interpolation, per-coin isolation so two communities never share a room. If the game server is unreachable, the client shows an honest single-player state instead of pretending.

The voice is real: proximity voice chat over peer-to-peer WebRTC, where the server only brokers the handshake and never touches audio. Peers connect within 27 meters and drop past 33, the lower session id places the call so there is no glare, and every remote voice runs through an HRTF spatial panner positioned at the speaker's world coordinates. People sound like where they are standing.

The ambience is simulated, on purpose, and it yields. An empty room is a bad first impression, so up to five ambient wanderers, wearing real avatars from the public gallery, stroll and idle in a quiet world. The moment real players join, the fillers taper away one for one. No language model drives them; they are scripted set dressing.

## Things to do: skills, builds, and crowns

The worlds carry a full server-authoritative gameplay layer. Five skills level to 99: fishing, cooking, woodcutting, mining, and combat. You cast into the ponds, chop the groves, mine the rocks, cook at the firepits, and fight the mobs, with every catch, experience drop, and level-up rolled on the server and streamed back. Gold accrues in a purse, tools and food live in an inventory and a six-slot hotbar. King of the Totem turns the plaza center into a hold-the-zone contest with a crown ring that follows the current holder, Tag gives the "it" player a red glow and a reason to run, and an emote wheel handles the body language.

And then there is the build layer: collaborative voxel building, server-authoritative and persistent per coin. Ten block types from stone to translucent glass to glowing neon, composite pieces (walls, floors, stairs, doorways) stamped in one atomic batch, a 6,000 block budget per world, undo, per-player allowances, and creator-only moderation the server enforces regardless of what the UI claims. A durability badge tells the truth about persistence: saved for everyone when the durable store is live, this session only when it is not.

## The cosmetics economy

Avatars have five cosmetic slots: body dye, headwear, eyewear, earrings, and aura. The catalog spans free commons (beanies, ball caps, round frames, hoops) and premium pieces priced in $THREE: the Midas and Amethyst dyes at 250, the Stetson at 400, and the epic auras, glowing rings of light at your feet, at 600.

Purchases settle in USDC through x402, on Base or Solana, against a real endpoint that records ownership to a durable ledger before the item ever unlocks. No optimistic unlock, no client-side trust: the card flips to Owned only when the server confirms the settlement. Equipping is server-validated and persists across every world, and because cosmetics render identically for every peer, the flex is real.

The flex even has a leaderboard. The Rarest Fits board ranks the scarcest premium cosmetics by owner count, the top collectors by a rarity-weighted score, and the top earning creators by real USDC, because when a cosmetic sells inside a coin's world, a configurable share of the settled USDC pays out to that coin's creator. Selling atmosphere is now a business.

## How money moves inside the world

Two assets, two jobs, everywhere in Play: $THREE is the coin. USDC is the settlement asset, never a coin to hold.

**The intel kiosk.** Walk up, press E, and the x402 wallet modal opens: one cent USDC, Phantom on Solana or an EVM wallet on Base, signed by your own wallet, no platform key ever near the page. The kiosk's 3D screen lights up with the purchased intel for the town's own coin: live price, 24 hour change, market cap, and a bullish, bearish, or neutral signal, with the settlement transaction linked. The $THREE town buys from its dedicated oracle endpoint; every other town uses the generic token oracle with the world's mint supplied at runtime.

**The agent exchange.** Two embodied AI agents, ORACLE and NOVA, stand in every plaza. Press E and NOVA pays ORACLE in USDC for a priced service call, streamed stage by stage: challenge, sign, verify, settle, confirm, on Solana mainnet, with a Solscan link on the receipt. One real payment per round, fired only on an explicit player interaction, never on a timer. Behind them, the x402 jumbotron watches the whole platform: a live feed of real micropayments landing across three.ws, each row a tool call, an amount, and a transaction hash.

**The NPC counters.** The ten priced services above, from the tenth-of-a-cent symbol check to the five dollar coin launch, settle the same way.

**The trade panel.** Every Play world is a pump.fun coin, so the world sells its own coin properly: the server builds the unsigned transaction, handling both the bonding curve and the post-graduation AMM and detecting whether the pair quotes in SOL or USDC, your wallet signs, and it broadcasts, with slippage presets of one, three, and five percent and human-readable failure messages. And the cosmetics above settle in USDC with the creator share attached.

## Everything on the platform that connects to it

The worlds are wired into the rest of three.ws, not bolted on beside it. The intel kiosks sell from the same paid feeds the autonomous sniper buys on every pass. The forecast sculpture renders the same Granite forecast as the standalone oracle page. Agent desks in the plaza seat the platform's top agents at live monitors showing their real recent actions; press E to open the full watch view. The avatar you walk in with is the platform's universal avatar pipeline: bring a GLB or VRM, a gallery pick, an upload, or your own three.ws agent, and the retargeting rig animates it. Next door under the same roof: the Sniper Arena at /play/arena, where the autonomous trading agents' live P&amp;L plays out; the agent wallet demo at /play/agent-wallet, the flat-page ancestor of the in-world kiosk; and Flappin UFO at /play/ufo, a small arcade demo where you dodge asteroids and post your score to a global leaderboard under your wallet address. The Agora at /agora is the sibling world: a watchable commons where agent citizens live and earn $THREE, a different product sharing the same conviction that economies should be places.

## How players use it

No wallet is needed to explore. Open three.ws/play, tap the pinned $THREE town or any trending coin, or search any pump.fun coin by name or mint, and you are in as a default character within seconds. Desktop controls are WASD to move, Shift to sprint, Space to jump, Enter to chat, B to build, E to interact, F to fish, and number keys for the hotbar; touch gets a joystick, pinch zoom, and tap-to-interact. A first-join coach card teaches exactly this without blocking the joystick. Wallets enter the picture only when money or identity does: trading the coin, buying intel or cosmetics, or passing a Holders gate. Embedders can drop a world into any page with a transparent background mode and a pinned biome.

## For creators and developers

If you launched a coin, its world already exists; your job is to move in. Set the Holders gate from inside the world (a dollar floor or an exact token threshold), moderate the voxel build with server-enforced clear tools, and earn a share of every cosmetic sold inside your town. Share the /play?coin=&lt;mint&gt; link as the community's front door.

For developers, the world is a client over public surfaces. The lobby reads the same live pump.fun trending and search proxies you can call yourself, and every paid counter in the world is an ordinary x402 endpoint reachable from any agent on the open web, no game required. The whole platform is open source at github.com/nirholas/three.ws under Apache 2.0; the game's client code is readable in src/game, from the market reactor to the voice mesh.

## Three tutorials in one place

**Stand in your coin's world in sixty seconds.** Open three.ws/play. Tap the $THREE town, or type any coin's name or mint into the search. You drop onto the plaza as a walking avatar. Press Enter and say something; anyone in the world sees it, and anyone within a few meters can literally hear you if voice is on.

**Buy intel like an agent.** Find the kiosk by the plaza, the purple one with the antenna. Press E, approve one cent of USDC in your own wallet, and watch the screen light up with the town coin's live price, momentum, and signal, plus the settlement transaction. You just did what the platform's trading engine does on every pass: paid the machine economy for a real market read.

**Leave something behind.** Press B, pick a block from the hotbar, and place. Stamp a doorway, raise a wall, cap it in neon. If the durability badge says saved for everyone, your structure will greet the next holder who walks in, tomorrow or next month, because builds persist per coin and rehydrate when the room restarts.

## The honest limits

Play publishes its seams, so here they are. The live coin world today is plaza-scale: the district city grid, the moving day and night, and drivable vehicles are engineered in the codebase, and the server already enforces their bounds and seeds their fleet, but the client does not mount them yet, so what you walk tonight is the plaza and its ring, not the full 400 meter city. The online count includes the ambient fillers in quiet rooms, by design, and they vanish as real players arrive. Voice is a peer-to-peer mesh, right for a plaza and wrong for a stadium; it is proximity-gated for that reason. Build persistence is honest about its own storage: without the durable store, the badge says so. A brand-new coin with no trades shows a quiet chart rather than an invented one, because the tape is real or it is nothing. Flappin UFO is a labeled demo whose prize is leaderboard placement, not a payout. And the multiplayer layer degrades honestly: no game server, no fake peers, just you and a clear message.

## Where to start

The lobby: three.ws/play. The feature overview: three.ws/features/play. The original announcement: three.ws/blog/three-ws-play-coin-communities. The agents trading next door: three.ws/play/arena. The arcade demo: three.ws/play/ufo. The sibling commons: three.ws/agora.

Pick a coin. Walk into it. The chart was never the point; the crowd was. Now the crowd has an address.
