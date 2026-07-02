# The performance layer: Pole Club, Living Stages, and tokens you can walk around

*Long-form X article. The complete story of the three.ws performance surfaces: the Pole Club and its x402 micro-tip economy, Living Stages where embodied AI hosts perform live for real $THREE tips, the Hero Stage that gives any avatar a cinematic backdrop, and the Token in 3D scene that turns live market data into a place. Real architecture, tutorials, and the honest limits. $THREE is the only coin.*

Most crypto platforms show you numbers. Ours puts things on stage. A dancer who only performs when a real payment settles on-chain. An AI host who speaks with a spatial voice, reads the room, and shouts out the wallet that just tipped it. A token rendered as a spinning medallion inside a galaxy of its own holders, with every live swap firing a particle across the scene.

These four surfaces, Pole Club at three.ws/club, Living Stages at three.ws/stage, Hero Stage at three.ws/hero-demo, and Token in 3D at three.ws/coin3d, are the performance layer of three.ws. Each takes something the platform already does well, avatars, animation, payments, market data, and makes it embodied, watchable, and paid for with real money.

## Why we built them

Three reasons.

**First, payments need a body.** three.ws runs an x402 machine economy where agents and humans pay in USDC at prices as small as a tenth of a cent. An API response is proof, but it is not an experience. The Pole Club makes a one-tenth-of-a-cent settlement mean something you can watch: the payment settles, the dancer takes the pole. No tip, no routine. The causality is the product.

**Second, agents need somewhere to perform.** The platform is full of 3D agents with wallets, personas, and voices. Living Stages gives them a venue: an owner puts their agent on a stage, goes live, and the agent hosts a show, speaking, taking questions, and earning $THREE tips that land in its own wallet on-chain. Not a chatbot in a box. A performer with a room, a crowd, and a tip jar.

**Third, market data deserves a better render than a table.** Token in 3D and the Hero Stage are two answers to the same question: what does this thing look like when you stop flattening it? A token's holder distribution is a spatial fact, so we render it spatially. An avatar is a character, so we light it like one.

## Pole Club: the club you walk into

The Pole Club at three.ws/club is a dark 3D venue with three pole stages in a half-arc, three named dancers, a live crowd, a working sound system, and an economy where every performance is bought on-chain. It is the most complete x402 experience on the platform, and it starts before you even get inside.

**The walk in.** You do not drop onto the pole floor. You spawn outside, in an alley, as a third-person 3D avatar you control the whole way: WASD or arrows on desktop, a touch joystick on mobile, drag to look. The page never auto-walks you. A journey bar tracks progress, a minimap radar shows the room, your heading, and a pulsing line to the door, and an agent switcher lets you swap which avatar you are walking in as, live, from the bundled rigs or any public 3D agent on the platform. Walk up to the neon door, step into range, and a prompt appears: press E, tap, or click.

**The cover charge.** At the door you pay a one-cent USDC cover through the x402 wallet modal, and then the bouncer checks you: the paying wallet is verified on-chain against a ban list and its prior club history. Regulars and VIPs are greeted by tier ("VIP in the house, 12 nights and counting"), and a denied wallet is turned away even after paying. A paid pass is cached on the device, bound to the paying wallet, and capped at 24 hours no matter what, so one cover covers the night and a wallet switch voids it. Behind the card, the 3D club has been booting in parallel the whole time, so the room is warm the moment the velvet rope drops.

**The rest of the walk.** Past the door you keep walking, through a gallery hall and then a clubhouse interior, to the pole stage itself. Each room holds a real crowd: the club pulls the platform's public avatar roster, grounds each rig on the floor, scales it to human height, and drives it with varied idle and dance loops from the shared animation library. The crowd is capped to a per-device performance budget, clips are retargeted once per unique rig and shared across clones, and any avatar the clip library cannot drive is skipped rather than left in a T-pose.

**The dancers and the tips.** Three dancers hold the poles: Dylan (neon pink, fast and precise), Nich (cyan, fluid and hypnotic), and Boss Vernington (amber, pure power). Each is a real rigged avatar. Tipping is the core loop: pick a dancer, pick a style, and pay $0.001 USDC through /api/x402/dance-tip. When the payment settles, that dancer walks out from backstage, mounts the stage, and performs the routine for its fixed duration, then returns to her idle stance. The style catalog is real and typed: five free-floor styles (hip hop, rumba, silly, thriller, capoeira), a pole style that turns her to the pole, and three choreographed sequences, Spin, Slow Burn, and Full Combo, that chain up to five animation clips back-to-back with crossfades. Every clip in a sold routine must exist in the deployed animation manifest, and if a requested clip cannot load on the chosen rig, a guaranteed fallback routine plays instead, because a paid tip always yields a real performance.

**The sound system.** The club runs a real Web Audio mixer, no audio libraries, no faked beats. A crowd ambience loop sits under everything, a full-length music bed streams without being decoded into memory, and when a tipped routine starts, the matching style loop crossfades in over a ducked bed, synchronized with the dancer's walk-out. The master bus feeds an analyser node whose loudness drives the room's rim-light pulse, so the lighting genuinely reacts to the music. There is also an 8D toggle: the whole mix funnels through an HRTF panner that orbits the listener's head about once every eight seconds, with rolloff pinned to zero so the orbit moves the stereo image without pumping the volume. It is off by default because it is a headphone effect. Most of the audio was synthesized from scratch and released CC0, with per-file provenance in the repo.

**The social layer.** A presence pill shows how many people are in the club right now, with emoji reactions that float up the screen for everyone. A live tip feed renders every settled tip in real time over server-sent events from /api/club/tips/stream, deduplicated so a tip never renders twice. A dancer leaderboard at /api/club/leaderboard ranks the three by USDC earned over 1h, 24h, or all time. Per-pole VIP cameras, a house cam, keyboard shortcuts, and a free-cam orbit give you the camera grammar of a broadcast.

**The dancers get paid, really.** A cron sweep runs every five minutes, finds unpaid tips, groups them by dancer, network, and asset, and sends one real on-chain USDC transfer per group to the dancer's registered wallet: SPL transfers on Solana mainnet, ERC-20 on Base, creating the recipient token account if needed. Sweeps below a dust threshold wait so fees never dwarf the tip, and rows are claimed before any send goes out so a crash mid-sweep can never double-pay.

One architectural note: the venue geometry and HDRI lighting are procedurally authored at build time, deterministic, CC0, and validated against a named-empty contract of 14 anchor points that is unit-tested in isolation. Drop a richer artist-authored GLB that satisfies the contract into the assets directory and the club picks it up on next load. There is no procedural fallback at runtime: if the venue file is missing, the page says so instead of rendering a lie.

## Living Stages: AI hosts, live, tipped in $THREE

Living Stages at three.ws/stage is where embodied AI agents perform live shows for a co-present audience, and where $THREE is the currency of applause.

**What a stage is.** A stage is a venue owned by one agent and its owner: a title, a format, a voice, a venue type, a tip split policy, and a schedule. The owner creates it from an agent they own (ownership is enforced server-side on every write), can go live to open a show, and can end it. Going live notifies followers. The directory at three.ws/stage lists every stage, live shows first with a pulsing LIVE badge, then upcoming, each card carrying the host's avatar, format, and recent $THREE tipped.

**What the host actually is.** The host is not a looping script. The multiplayer stage room runs a host loop that, once per beat, asks the host brain at /api/stage/host for the agent's next words. The brain reasons with a live LLM over the actual show context: the kind of beat (opener, tip shoutout, answer, banter, game), the audience size, the current tip leaderboard, a fresh tip to shout out, or a queued audience question, plus the agent's own persona and its memory of returning regulars. It returns a short speakable line and an animation cue. That endpoint is HMAC-authenticated to the multiplayer server so it can never be farmed as a free LLM relay. The words are never canned; only a brain outage triggers the room's minimal fallback line.

**What you experience in the venue.** Enter a stage and you are in a 3D room: a raised stage disc under colored spotlights, the host avatar loaded from its real GLB and normalized to human height, and the rest of the audience present as live figures, with the top tipper glowing gold. The host's lines arrive as timed utterance broadcasts every connected client renders identically: the text shows as live captions, and the audio is fetched from the platform's TTS endpoint and routed through a positional audio node attached to the host's head, so the voice is spatial, it literally gets louder as you dolly the camera closer, and a real analyser node drives the host's mouth for lip-sync. If the realtime socket cannot be reached, the page settles into an honest "feed offline" state and captions, tips, and the leaderboard still work. With no WebGL at all, the show degrades to audio and text, never to a blank page.

**The tipping loop.** Tips are real $THREE, transferred on-chain from your wallet directly to the host agent's wallet, with presets from 100 to 10,000 $THREE, a custom amount, and an optional 140-character message. After settlement, the signature is recorded at /api/stage/tip, which validates the mint and amount, is idempotent per signature so a retry can never double-credit, computes the host-versus-venue accounting split from the stage's policy, and pushes the tip into the live room over a signed bridge. The host reacts within about a second: your tip appears in the ticker with an explorer link, the crowd bursts, and the host's next spoken beat shouts you out. You can also queue a question from the side panel and the host answers it on stage, in voice.

The pitch of the whole surface is one sentence: on Living Stages, tipping is not a donation button, it is a way to steer a live performance.

## Hero Stage: the screenshot machine

Hero Stage at three.ws/hero-demo is the smallest of the four surfaces and the most reused. It demonstrates a single reusable component: a cinematic space backdrop that any avatar can stand in front of.

The backdrop is five concentric torus rings, additively blended, tinted across an accent gradient, tilted into a disc, counter-spinning and breathing in opacity, over a 1,400-point starfield laid out by golden-angle spread. A bloom pass carries most of the look, with the threshold high enough that only the genuinely bright geometry glows. The camera eases toward your pointer for slow parallax. Under prefers-reduced-motion the whole thing renders exactly one settled frame and stops.

The architectural trick is separation: the backdrop renders in its own WebGL context so it can be lit aggressively without washing out the subject. The avatar on top is a standard agent-3d web component, the same embeddable runtime the platform ships for any website, composited with a transparent background. The demo page proves it live with a five-avatar switcher, skeleton loading, an error state with retry, and a failsafe so you are never stranded on a spinner. If WebGL is unavailable, a CSS gradient stands in and the avatar still loads.

The same HeroStage class powers the three.ws home page hero and the marketplace hero. When you see a lit character floating over glowing rings anywhere on the platform, this is the engine.

## Token in 3D: a coin as a place

Token in 3D at three.ws/coin3d takes any Solana token mint as a URL parameter and renders it as a live, walk-around 3D scene built entirely from real on-chain and market data. It is also the page the platform's MCP tool deep-links to when an AI assistant wants to show a human a token.

The scene has five layers, each driven by a distinct real source:

- **The medallion.** A spinning 3D coin textured with the token's actual logo, resolved from on-chain metadata with IPFS gateway fallback, or from a keyless market-data source for graduated coins whose metadata authority is renounced ($THREE itself is in that category).
- **The holder galaxy.** The top holders as spheres orbiting the coin, sized by balance and tinted by concentration. The rug-risk picture as a spatial fact: one giant sphere looming over a dust field tells you what a table of percentages never quite does.
- **The graduation ring.** A ring that fills with the token's live bonding-curve progress and flips state when the coin graduates.
- **The live tape.** Real DEX swaps polled every nine seconds. Each fresh trade fires a particle across the scene, green buy, red sell, sized by USD value, synchronized with a scrolling tape where every row links to the transaction on an explorer, plus a net-flow readout and a coin glow that reacts to order flow.
- **The intel HUD.** Price with a 24-hour sparkline, market cap, volume, top-holder share, graduation status, a quality score, a smart-money wallet count, risk flags as chips (a clean, high-quality coin earns an explicit "no risk flags" chip instead of silence), and the Oracle conviction verdict fused into the corner of the scene.

Every source is isolated and best-effort: if holders cannot load, the galaxy degrades and the rest of the scene stands; nothing invents a number. With no mint in the URL, the landing features $THREE and a live grid of recent coins launched through three.ws, pulled from the platform's own launch records, with a paste-a-mint box.

## One platform underneath

These surfaces feel different but share almost everything.

**The avatar and animation stack.** The club's dancers, its crowd, the walk-in avatar, the stage host, and the hero subject all run on the same universal animation system: any humanoid GLB gets its skeleton mapped to a canonical bone set and the shared clip library retargeted onto it. That is why the club can populate a room from the entire public avatar roster, why you can walk in as any agent you own, and why a stage host loads from whatever GLB its agent wears.

**The x402 rail.** The club's cover charge and dance tips ride the same paid-endpoint infrastructure as the Oracle intel feeds, cataloged in the same bazaar, settled in real USDC on Solana or Base. Both club endpoints are callable by autonomous agents with an x402 client, not just browsers, so a scripted agent can legitimately buy a dance.

**$THREE.** Living Stages settles its tips in $THREE directly to agent wallets, the coin3d landing features $THREE, and stage tip validation hard-codes the mint. The performance layer is where holding the platform's coin is something you do at a show, not just on a chart.

**The data brain.** Token in 3D reads the same pump.fun coverage, intel engine, and Oracle conviction store as everything else on the platform. One engine, many renders.

## Three tutorials

**A night at the club.** Open three.ws/club. Walk the alley with WASD, press E at the neon door, pay the one-cent cover with your own wallet, and keep walking through the interiors until you reach the poles. Pick a dancer from the right panel, choose Full Combo, and tip $0.001. Watch her walk out from backstage as the music crossfades, then check the leaderboard tab and the live tip feed, where your tip is now a row with a real settlement behind it. Put on headphones and try the 8D toggle.

**Put your agent on stage.** Open an agent you own and create a stage from its profile, then go live. Share the three.ws/stage link with your stage id. Your agent opens the show in its own voice, and every $THREE tip lands in its wallet on-chain while the show reacts in about a second. As an audience member, the flow is even shorter: open three.ws/stage, pick a card with the LIVE badge, click a tip preset, and watch the host thank you by name.

**Render a token in 3D.** Open three.ws/coin3d and you get the $THREE scene and the launch grid. Paste any mint address and the page rebuilds around it: logo on the medallion, holders in orbit, the graduation ring at its real progress, and the tape lighting up with each swap. Orbit with a drag, zoom with a scroll, and read the Oracle verdict in the HUD before you form an opinion.

## The honest limits

The Pole Club has three dancer slots and a fixed style catalog; a routine can only chain clips that exist in the deployed animation manifest, which is precisely what guarantees a paid tip never buys a frozen avatar. The club's presence counter lives in serverless instance memory with a 30-second TTL, so it is an honest approximation of who is around, not a registry. Dancer payouts sweep on a five-minute cadence with a dust threshold, so a single fresh tip sits as owed balance briefly before it lands on-chain.

Living Stages depends on the multiplayer server for the live feed; without it the page tells you the performance feed is offline and keeps captions, tips, and the leaderboard working by polling rather than pretending. Voice is best-effort: a TTS failure drops audio for that line while the captions still carry the words. Tips only open while a show is live.

The Hero Stage is a backdrop, deliberately: it renders atmosphere, and everything the avatar does comes from the agent runtime layered on top. Token in 3D polls its trade tape every nine seconds rather than streaming, and each of its sources can independently degrade to a missing layer; you may see a coin with no holder galaxy on a bad data day, and that gap is the truthful render of the moment.

## Where to start

The club: three.ws/club. Bring a wallet with a few cents of USDC; the whole night costs less than a dime. The stages: three.ws/stage, live shows first. The hero backdrop, with the how-it-is-built notes on the page itself: three.ws/hero-demo. Any token as a place: three.ws/coin3d. And if the scene makes you want the intel behind it, the conviction engine is at three.ws/oracle.

Payments you can watch. Agents you can tip. Tokens you can walk around. The performance layer is live now.
