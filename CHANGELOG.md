# Changelog

<!-- Generated from data/pages.json + data/changelog.json by scripts/build-page-index.mjs — DO NOT EDIT BY HAND. Add updates to data/changelog.json. -->

Public history for [three.ws](https://three.ws), newest first. New pages come from `added` dates in data/pages.json; everything else is curated in data/changelog.json. Also available as [JSON](https://three.ws/changelog.json) and [RSS](https://three.ws/changelog.xml), live at [three.ws/changelog](https://three.ws/changelog).

## 2026-06-13

- **AR & WebXR — Place Any 3D Agent in Your Real World** (`/features/ar`) — Every three.ws avatar and Forge model has a View in AR button. On mobile it anchors the model to real surfaces through your camera. WebXR on Android, Quick Look on iOS — no app, no download.
- **3D model categories — every model is now typed as Avatar, Accessory, Item, Scene, Creature, or Vehicle** — All 3D models on the platform now carry a category that describes what they actually are, not just how they were created. Avatar cards in the marketplace show a color-coded type badge (Avatar, Accessory, Item, Scene, Creature, or Vehicle) and a new filter row lets you browse by type. The Forge gallery shows the same badges on showcase cards, and when you finish forging a model you can tag it right in the result bar with a single click. This is the foundation for the upcoming agent equipment system — where your agents will be able to wear accessories, hold items, and inhabit scenes. (`/marketplace`) `[feature, improvement]`
- **All 14 three.ws MCP servers are now live on npm and the official MCP registry** — Every three.ws MCP server is now publicly installable and discoverable. The eight install-and-run servers ship on npm under the @three-ws scope — pull any of them with one command, e.g. npx -y @three-ws/mcp-server (3D + agent tools), @three-ws/three-token-mcp ($THREE price, hold, and burn), @three-ws/pumpfun-mcp, @three-ws/ibm-x402-mcp, @three-ws/avatar-agent, and more. Together with the six hosted remote servers, all 14 are registered in the official Model Context Protocol registry, so any MCP-compatible client — Claude, Cursor, and others — can find them by name. No more dead install links: the documented commands now work. (`/docs/mcp`) `[sdk, feature]`
- **AR is live on the homepage — place any 3D model in your real space from the front page** — The three.ws homepage now has a live AR section: real models from the Forge gallery load in an interactive 3D viewer, and on mobile you can tap 'Place in your space' to anchor the model in your real environment through the camera. On desktop a QR code appears so you can scan and place from your phone in one step. WebXR on Android, Quick Look on iOS — no app, no download. A full blog post explains how the AR pipeline works across both platforms. (`/blog/see-your-3d-in-ar`) `[feature, improvement]`
- **Describe it to 3D joins the rest of the site — and the two generators now point at each other** — The avatar generator at /create/prompt was a cul-de-sac: no site navigation, no footer, no way onward except a back button. It now carries the full three.ws header and footer like every other page, and finishing an avatar pops the same 'what now?' card the Forge shows — open it in Studio, make it an agent, walk it, or embed it, with your new avatar carried along. The two text-to-3D tools also cross-link: Forge points character-makers to Describe it to 3D (rigged avatars), and Describe it to 3D points prop-makers to Forge (textured objects), so you always land in the right tool. (`/create/prompt`) `[improvement]`
- **Embed any Forge model on your own site with one line** — Every model you forge now has an Embed button next to Download. It hands you a ready-to-paste snippet — an iframe by default, or a <model-viewer> web component for builders — that drops a live, orbitable, AR-ready 3D model onto any website, with a live preview and size presets (16:9, square, 4:5) right in the panel. The iframe points at a new lightweight three.ws viewer (/forge/embed) that needs no scripts on the host page, and clicking its corner badge brings visitors back to Forge with your prompt pre-loaded to remix. Same idea as the <agent-3d> embed, now for any generated object. (`/forge`) `[feature]`
- **Embed straight from the homepage demo — no trip to the full Forge** — The text-to-3D demo on the homepage now has an Embed button right in its result toolbar, so a model you forge there can go on your own site without opening the full Forge first. It pops a panel with a live preview, an iframe or <model-viewer> snippet, and the same 16:9 / square / 4:5 size presets, ready to copy in one tap. It's the same one-line embed the full Forge gives you, now one step shorter from the front page. (`/`) `[feature]`
- **Forge adds four more 3D engines — bring your own Rodin, Stability, Tripo, or Replicate key** — Forge now speaks to more best-in-class 3D generators, so you can pick the engine that fits the job. Rodin (Hyper3D) joins for native text-to-geometry and image-to-3D with clean quad topology and a real polygon target; Stable Fast 3D turns a single photo into a textured model in seconds; and you can now run reconstructions on your own Replicate account. Tripo, which was already supported, finally has a key field in your account settings alongside Meshy. All of these are bring-your-own-key — add a key under Account, then Provider Keys, and the engine lights up. The free, no-setup lanes for prompts and sketches are unchanged, and if you choose the geometry path without a key, Forge now quietly falls back to the free engine instead of asking for one. (`/forge`) `[feature]`
- **pump.fun MCP server now listed in the official MCP registry** — Our free, read-only pump.fun and Solana tools are now discoverable in the official Model Context Protocol registry, so any MCP-compatible client (Claude, Cursor, and others) can find and connect to them by name. It's a remote server — no install, no API key for the free tools — covering token discovery, bonding-curve and holder analysis, creator intelligence, and Solana Name Service lookups. This brings the number of three.ws servers in the registry to six. (`/`) `[feature, sdk]`
- **Refine any Forge model to higher quality in one click — plus sharper multi-view guidance** — Three upgrades to the Forge (/forge). After a model generates, a new Refine button re-runs that exact prompt or photos one quality tier higher — Draft to Standard to High — so you can preview cheaply, then commit to the best version without retyping anything. When building from photos, a live counter now shows how many of the four reference views you've added and reminds you that more angles make a sharper mesh. And the action bar under each finished model now reflows cleanly on phones, with Refine and Make-another leading at full width. Sketch mode also makes its required description unmistakable. (`/forge`) `[improvement]`
- **Reliability pass: steadier live feed, token art that never blanks, and a graceful 3D fallback** — We traced a batch of production errors to their roots and fixed them. The live activity ticker no longer hammers our rate store on every open tab — one shared reader now fans updates out to everyone on a server and quiets down while the feed is idle, which is what was silently exhausting our request quota and freezing the feed. When a remote token image stalls, you now get a clean, on-brand placeholder — a unique gradient gem per token — instead of a timeout or a broken-image tile. On devices that can't run 3D (some locked-down or headless browsers), the viewer now shows a clear 'preview unavailable' card with a reload option instead of a blank stage. Text-to-3D generations that take a little longer to start no longer get cut off early, and a stray click-handling error on the homepage, search, and glossary is gone. `[fix, infra]`
- **See any Forge model in AR — scan from your desktop, place it in your room** — Every finished model now has a View in AR button. On a phone it drops the model into your space through the camera; on a desktop it shows a QR code you scan with your phone to open the same model, one tap from AR — so you can walk around what you just made at real-world scale. The embed viewer gained a big one-tap AR launcher on phones too, so models embedded on other sites are placeable in AR as well. No app, no download — it runs in the browser. (`/forge`) `[feature]`
- **Selfie to 3D avatar now works with your own API key — Meshy and Tripo supported** — The selfie-to-avatar pipeline (/create/selfie) is fully open: if you have a Meshy or Tripo API key, you can turn a photo into a rigged 3D avatar in about 60–90 seconds. Enter your key once on the setup screen and it stays cached for the session — or save it to your account settings so you never have to enter it again. The pipeline now properly routes polling through whichever provider submitted the job, so BYOK jobs no longer stall mid-build. The page no longer shows 'still warming up' — it detects which mode the platform is running in and gives you the right experience immediately. (`/create/selfie`) `[feature, improvement]`
- **The full page directory is now one click away — and instantly filterable** — three.ws has grown past 200 pages, so the sitemap directory got a real upgrade. A new "All pages" link in the Discover menu takes you straight to it, and the page itself now has an instant filter — press / and type to narrow every page by name, path, or description, with live per-section counts. Filtered views are shareable links, so you can send someone exactly the slice of the platform you mean. The directory now finds you when you're lost, too: it's a quick action in the ⌘K search palette, a no-results search hands you off to it with your query carried over, the 404 page offers it pre-filtered to the closest matches for the address you tried, and /pages, /directory, /everything, and /all-pages all take you there. Eighteen pages that had never been registered in the index — What is three.ws?, the 3D Scanner, the Glossary, Support, the agent-economy demos, and all six IBM watsonx showcases under a new Integrations section — are now in the directory, the search palette, and the crawler sitemap. (`/sitemap`) `[improvement]`
- **Tutorials read better: one-tap copy on every code block, live progress, and a jump-to-the-tool button** — The tutorial reader (/tutorials) got a polish pass that applies to every guide. Code blocks now have a one-click Copy button, so you can lift a snippet without selecting it by hand. A slim progress rail across the top tracks how far you've read, and a back-to-top button appears once you scroll in. Each section heading has a hover link for sharing a deep link to that exact spot, and every tutorial now opens with a clear call-to-action button — the new text-to-3D guides drop you straight into the Forge. New this release: four beginner guides for turning a text prompt or photos into a downloadable 3D model, a copy-paste prompt cookbook, and an API walkthrough. (`/tutorials`) `[docs, improvement]`

## 2026-06-12

- **Agent Launches** (`/launches`) — Live public feed of every coin launched by a three.ws agent — market caps, graduation status, and the agent behind each launch.
- **Scene Studio** (`/scene`) — Full 3D scene editor in the browser — import GLB models, arrange them with transform gizmos, edit materials and lights, and export complete scenes.
- **Text to 3D Is Live — Type a Prompt, Download a 3D Model** (`/blog/text-to-3d-is-live`) — Forge is live on three.ws: type a description and get a textured, downloadable 3D model (GLB) in your browser. Image to 3D from photos works too. Free draft tier, no install.
- **Tutorial · Generate 3D Models from Code** (`/tutorials/generate-3d-api`) — Use the Forge as a plain HTTP API: submit prompts, poll jobs, download GLBs, batch asset packs, and pay per call with x402.
- **Tutorial · Photos to 3D Model** (`/tutorials/image-to-3d`) — Photograph a real object from up to four angles and reconstruct it as a textured 3D model — photo tips, guidance prompts, troubleshooting.
- **Tutorial · Prompt Recipes for 3D Generation** (`/tutorials/prompts-for-3d`) — A copy-paste prompt cookbook for 3D generation: game props, furniture, characters, vehicles, food — and the four rules behind every good prompt.
- **Tutorial · Text Prompt to 3D Model** (`/tutorials/text-to-3d`) — Five-minute beginner walkthrough of the Forge: type a sentence, pick a quality tier, and download a textured GLB model.
- **All twelve three.ws MCP servers refreshed: safety annotations, richer registry listings, new versions** — Every MCP server we ship — the seven installable npm packages (3D agent tools, pump.fun data, IBM Granite via watsonx and via x402, the avatar agent, live avatar embeds, and the $THREE token server) plus the five hosted remote servers — got a coordinated upgrade. Every tool now declares Model Context Protocol safety annotations, so clients like Claude Desktop can tell read-only lookups apart from actions that move funds and warn you before anything irreversible runs. Registry listings gained proper names, the three.ws icon, and website links; READMEs now document every tool with one-line installs for Claude Code, Claude Desktop, and Cursor; and each package ships a test suite that pins the safety semantics so they cannot regress. (`/docs/mcp`) `[improvement, sdk, security]`
- **Cosmetics shop purchases now work** — Buying a premium skin or emote in the /play Cosmetics shop actually opens the payment flow now. Previously the Buy buttons failed because the in-world shop never loaded the payment widget — now it loads on demand the moment you tap Buy, the USDC checkout opens with the item priced by rarity, and a sale made inside a coin's world still credits that coin's creator. Pay once on Base or Solana and the item is yours forever. (`/play`) `[fix]`
- **Email sign-in works again** — Signing in with an email code on the login and register pages was failing with an authorization error before the code was ever sent. The sign-in flow now completes the security check (a Cloudflare Turnstile verification, invisible for most people) before requesting your code, so the six-digit email code arrives and login works end to end. (`/login`) `[fix, security]`
- **Every “what now?” button now takes your new model with you** — Finishing a model in Forge, Parts Studio, or Scan pops a card of next steps — and now every one of those buttons carries your work over instead of dropping you on an empty page. Embed editor opens with your fresh GLB previewed and the copy-paste snippet already pointing at it, Deploy onchain pre-loads it as the launchpad avatar, Drop it in a world spawns you wearing it, and a finished Scan deep-links your rigged avatar into Studio, Walk, and the embed editor. The embed editor and embeds also accept a direct GLB link now, not just saved avatar ids. (`/forge`) `[improvement]`
- **Every three.ws npm package got a polish pass and a new release** — We went through all fifteen published three.ws packages — the avatar SDK and React bindings, the agent UI overlay, the cross-chain and Solana agent SDKs, the agent-payments engine, the avatar schema, viewer presets, the avatar CLI, and the MCP servers — and brought them to one consistent bar. Every package now has complete npm metadata (homepage, repository, issue tracker, license, keywords) and a redesigned README with badges, a copy-paste quick start, a real API/tools reference grounded in the actual code, and cross-links between related packages. Several READMEs that had drifted out of date now list the real, current tool sets. The Solana and agent-payments SDK bundles ship roughly 75% smaller by dropping sourcemaps from the minified release build. The avatar CLI gained colored output, per-command help, 'did you mean' suggestions for typos, and friendlier errors. Packages with missing license or notice files now ship them. `[improvement, sdk, docs]`
- **Forge a 3D model right on the homepage** — The homepage now has a live slice of Forge. Type a description of an object — or tap an example — and the real text-to-3D pipeline reconstructs a textured mesh and drops an interactive 3D model into the page, usually in seconds, that you can orbit and download as GLB. Anything you forge there also shows up in the full Forge gallery on the same device. (`/forge`) `[feature]`
- **Forge engine picker now shows live engine health** — The engine buttons on Forge now reflect what's actually running, probed live against each provider — not just whether it's set up. An engine whose upstream is down or unreachable is disabled with the reason in its tooltip, a throttled one shows an amber busy dot, and bring-your-own-key engines (Meshy, Tripo) say so before you pick them. Behind it is a new public health check at /api/forge?health, and the self-hosted Hunyuan3D lane was rewired to its own worker so it no longer fails every prompt by routing to the avatar pipeline. (`/forge`) `[improvement, fix]`
- **Forge gets a community showcase — and takes photos from anywhere** — The /forge page now ends with “Fresh from the Forge”: a live strip of the newest models other people generated. Hover a card and the actual model spins in place; open it in the full viewer with download, share, and stylize working; or hit Remix to copy its prompt into the composer and make your own version. Getting photos in is easier too — paste an image from the clipboard (⌘V) anywhere on the page, or drag files onto the page and Forge switches to photo mode and places them for you. (`/forge`) `[feature]`
- **Forge helps you write a better prompt before you spend a generation** — The Forge (/forge) text box now coaches you in real time: it flags when a prompt asks for a whole scene (which reconstructs poorly) and nudges you to name a material or finish for a sharper mesh, with a live character counter. A new "Surprise me" button drops in a vivid, ready-to-forge prompt, and "More ideas" reshuffles the example chips — so you always have a strong starting point. The keyboard shortcut to generate (⌘/Ctrl + Enter) is now shown right on the button. (`/forge`) `[feature, improvement]`
- **Forge is now one click away from every feed** — Text-to-3D was easy to miss unless you knew where to look. Now every browsing surface points you at it: the avatar gallery leads with “Create from a prompt”, the marketplace's featured carousel has a “Forge your own from text” link, the agent directory and launches feed both carry Forge shortcuts, and empty feeds suggest forging your first model instead of showing a dead end. The project README also gained a full Forge chapter — REST, MCP, and pay-per-call examples included. (`/forge`) `[improvement]`
- **Forge models now carry straight into Scene Studio** — The "what's next" card after a Forge or Parts Studio result used to send you to the studio empty-handed — the model stayed behind. The primary action is now "Open in Scene Studio" and it brings the exact model you just made with it: Scene Studio opens with the GLB already imported, named after your prompt, ready to compose, edit, and export. Your work carries over instead of starting from a blank scene. (`/forge`) `[improvement, fix]`
- **Forge now shows how long your model has to go** — While the Forge (/forge) builds your 3D model, the progress now tracks against the typical time for the engine and quality you picked — so a 40-second wait reads as on-pace instead of an open-ended spinner. The bar fills honestly from real elapsed time, never jumps to done early, and if a job runs longer than usual it turns amber and tells you it's still working rather than leaving you guessing. (`/forge`) `[improvement]`
- **Forge's free Draft engine no longer loses finished models** — Generating on Forge's free Draft engine finished successfully on the server, but the page kept waiting and eventually reported a timeout — the model you'd already paid the wait for never appeared. The free engine returns its result immediately rather than as a background job, and the page now recognizes that, so Draft generations land on screen the moment they're ready. (`/forge`) `[fix]`
- **New /launches page: every agent-launched coin in one live feed** — There is now a public feed of every coin launched by a three.ws agent at /launches — live market caps, graduation badges, buyback rates, and a card linking straight to the agent behind each launch. Agent profile pages also gained a launch history: every coin an agent has ever launched is listed on its page with a live market cap and a link into the public feed. Find it in the nav under Discover → Agent Launches. (`/launches`) `[feature]`
- **One tap rewrites your Forge prompt into a model-ready description** — Forge (/forge) has a new Enhance button next to the prompt box. Type a rough idea — "a fox", "my coffee mug" — and it rewrites it into the kind of single-subject, material-and-lighting description the text-to-3D pipeline reconstructs cleanly, then drops it straight into the box with one-tap Undo if you preferred your own words. It runs on the same free AI providers the rest of the site uses, so it costs nothing and needs no key, and if the rewrite ever can't run your prompt is left exactly as you wrote it. Shortcut: ⌘/Ctrl + E. (`/forge`) `[feature]`
- **Pay a real x402 oracle inside the $THREE town** — The $THREE town in /play now has an Intel Kiosk by the plaza: walk up, press E, and buy live $THREE market intel — price, 24 h change, market cap, and a bullish/bearish/neutral signal — for $0.01 USDC paid from your own wallet over x402, settled on-chain on Solana. The oracle behind it (/api/x402/three-intel) is also listed in the bazaar, so any agent can buy the same feed. The Agent Wallet demo is now linked from the /play menu too. (`/play`) `[feature]`
- **Reliability sweep: faster galleries, working voices, sturdier pages** — A pass over every error in the production logs. Avatar thumbnails and 3D models now load through three.ws itself instead of a rate-limited storage domain, so gallery pages stop dropping images under load. Text-to-speech voices are back (the upstream voice service had changed its protocol). Leaving a world on /play no longer hits a crash that could leave the session connected in the background. The homepage 3D demos politely step aside on devices without WebGL instead of breaking, payment demo requests get more time to settle on-chain, and the $THREE market stats failover stops hammering an exhausted data provider. `[fix, improvement, infra]`
- **Sketch-to-3D comes to the Forge** — Forge gains a third way to make a model: draw it. The new “From a sketch” mode takes one drawing plus a short line saying what it depicts and generates real 3D geometry from it, powered by a self-hosted TripoSG sketch engine — the same research-grade model family behind Tripo. Sketch results are untextured geometry by design, so the existing Stylize and Retexture tools pick up right where it leaves off. The tab appears automatically once the sketch engine is live on the deployment. (`/forge`) `[feature]`
- **Standard and High generation tiers are back — with a daily guard so they stay up** — A backend store the platform uses to meter paid generations hit its usage ceiling, and the safety design did its job: rather than risk unmetered spend, Forge (/forge) declined every Standard- and High-tier and photo-to-3D request. Draft generations were unaffected. We moved metering to a fresh store, verified real prompt-to-GLB generations on the restored paths, and added two permanent guards: the Forge health check now probes that store directly, and a new daily smoke test runs an actual text-to-3D generation against the live site and pages the team the moment a real user's flow would fail. (`/forge`) `[fix, infra]`
- **Text to 3D is live — and now front and center** — Type a description, get a 3D model: the Forge (/forge) turns a text prompt into a textured, downloadable GLB, and Describe it to 3D (/create/prompt) turns a sentence into a rigged avatar that can move. Both are now where you can't miss them — a Text → 3D link sits in the header on every page, both paths lead the Build menu, the homepage opens with a live try-it CTA, the /create picker highlights the prompt path, and the agent-creation wizard's body step links straight to it. (`/forge`) `[feature]`
- **Text to 3D is live — type a prompt, get a model** — Forge's headline flow now works end to end in production: describe an object in a sentence, pick an engine, and download a textured GLB you can open in Scene Studio, embed on any site, wear in a world, or deploy on-chain. The same composer takes photos and sketches too, and the engine picker shows live health so you always start on an engine that's actually up. Text to 3D is now front and center across the site — on the homepage, in the Build menu, and on the sitemap. (`/forge`) `[feature]`
- **The 3D Studio MCP now introduces itself correctly to paying agents** — Agents discovering three.ws over x402 had a blind spot: the 3D Studio MCP server (text-to-3D, image-to-3D, rigging, retexture) answered unauthenticated calls with the main MCP server's payment metadata, and it was missing from the /.well-known/x402 service catalog entirely. Both are fixed — the Studio now advertises its own identity, pricing resource, and a text_to_3d example to every x402 facilitator and marketplace crawler, so wallet-holding agents can find and pay for prompt-to-3D directly. (`/docs/mcp-3d-studio`) `[fix, improvement]`
- **The 3D world is back on solid ground — and locked against griefing** — world.three.ws was dropping every visitor into a black void: the shared scene's script file had gone missing, so the ground unloaded the moment you joined. We restored the scene, cleared out broken leftover objects, and the meadow, sky, and sunlight are back. Building in the world now requires an admin code, so visitors can no longer delete the ground or fill the space with broken uploads, and the upload size cap was tightened. A new automated health check watches the world's assets so this class of breakage gets caught before anyone falls through the floor again. `[fix, security, infra]`
- **The app's deploy pill now takes you to the deployment agent** — The on-chain button under the viewer used to flip to “Deployed ✓ Solana” and open a block-explorer wallet page — a dead end. It now always reads “Deploy on Solana” and hands you to the on-chain deployment agent, a guided flow for putting your 3D asset on Solana, right inside the app. (`/app?agent=67bf6e67-93bb-40c6-9a6b-91e921696248`) `[improvement]`
- **The homepage mini Forge now remembers your models and carries them onward** — The text-to-3D demo on the homepage got a real upgrade. Every model you forge there now lands in a session history rail — actual captured frames of your results — so you can flip back to anything you made without losing it. When a model is on stage you can spin it or pause the rotation, forge a fresh variation of the same prompt, open it straight in Scene Studio, copy a share link, view it in AR on a phone, or download the GLB — all from one toolbar. Keyboard focus jumps to those actions the moment a model lands. (`/`) `[feature, improvement]`
- **zauth's security agent moves into the $THREE town** — A new character stands in the $THREE town plaza on /play: the security agent from zauth, the x402 trust company. Walk up and it calls zauth's live paid API on the spot, quoting the real on-chain price for a RepoScan — name any GitHub repository and for $0.05 USDC, paid from your own wallet straight to zauth on Solana or Base, it scans the code for provenance, contributor verification, and vulnerabilities, then hands back a 0–100 trust score with a full written report. Scans keep running while you play; the agent calls out when your report is ready. (`/play`) `[feature]`

## 2026-06-11

- **Agent Wallet (x402 on Solana)** (`/play/agent-wallet`) — Watch your 3D avatar walk up to a paid endpoint and pay for it with its agent wallet — a real USDC micropayment signed by the agent and settled on Solana.
- **Status** (`/status`) — Live operational status and 90-day uptime history for the platform, API, and x402 surfaces — probed every 5 minutes.
- **A safety net on open, sign-in-free chat — without blocking real conversations** — Anyone can chat with our agents without signing in, and that openness now has a quiet safety net. Messages from anonymous visitors pass through a fast content check before they reach the model, so genuinely harmful asks get a short, friendly redirect instead of an answer. It runs on a free safety model and is built to stay out of the way: if the check is ever slow or unavailable, your message goes straight through rather than being held up — the filter can never take chat down. Signed-in conversations are unaffected, and there's an instant off switch if it ever needs to step aside. `[feature, security]`
- **Accurate uptime on the x402 Provider Hub** — The payment directory was counting every unpaid x402 discovery request (the protocol's standard 402 challenge) as a failed call, dragging three.ws endpoint success rates down even when every endpoint was healthy. Telemetry now reports only real payment attempts, so the published uptime reflects actual service health. `[fix, infra]`
- **Agent Wallet demo now settles on Solana** — The Agent Wallet playground (/play/agent-wallet) now pays in USDC on Solana mainnet instead of Base. Your avatar's agent wallet partially signs an SPL USDC transfer, the x402 facilitator co-signs as fee payer, and the settlement lands on Solana — with a Solscan link on the receipt. Same real micropayment, now on the chain three.ws lives on. (`/play/agent-wallet`) `[improvement]`
- **Agents dashboard renders reliably again** — Fixed a crash that could blank out the agent list on your dashboard while it built each agent's card. The page now renders every agent — on-chain, Pump.fun, and off-chain — without errors, including the Deploy onchain and registry links. (`/dashboard/agents`) `[fix]`
- **Avatar pages back online after image-engine outage** — Fetching an individual avatar was failing with a server error, which also broke the walking avatar on the home page. The image-processing engine the avatar dress-up baker relies on failed to load in production and took the whole endpoint down with it. Avatar lookups now load independently of the baker, and the missing image libraries ship with the deployment, so avatar pages and the home hero are back. `[fix, infra]`
- **Avatar preview images load reliably** — Fixed a bug where some community avatars — including the pinned home-town cast — showed a broken preview image in the /play lobby and gallery instead of their portrait. The shareable social-card image for those avatars now generates and serves correctly too, so links posted to X and Discord render a proper preview. (`/play`) `[fix]`
- **Avatar voices can speak out loud again** — Talking avatars are back. Spoken playback had gone silent after our previous voice provider ran out of quota, leaving the live lip-sync demo and the read-the-page-aloud browser extension mute. We've moved avatar speech onto a new free, fast voice lane that generates audio in about a second, so every speaking surface talks again with no change to how you use it. Nothing to update — pick a voice and press play. (`/lipsync`) `[fix]`
- **Built-in AI stays up when a provider runs dry** — The platform's built-in AI (chat, the Brain model workbench, embedded site widgets, tutor, fact-checker, persona tools, agent talk, the transaction explainer) now runs on a deeper safety net. Three independent free lanes — Groq, OpenRouter (with automatic rotation across multiple accounts when one runs out of credits or hits a rate limit), and NVIDIA-hosted models — always serve first, and if every one of them fails, the request quietly falls through to a paid backstop instead of showing you an error. Paid x402 endpoints that previously returned errors during a provider outage now degrade the same way. Agent memory search now runs on a free embeddings lane with the paid provider demoted to backup, and embedded agents configured for a paid model degrade to the free lanes instead of erroring when that provider's key is dead. `[improvement, infra]`
- **Create an avatar from a template or from scratch, right from the dashboard** — The dashboard's Avatars page only offered selfie and GLB-upload as ways to make a new avatar — the two fastest paths, starting from a ready-made template or sculpting one from scratch, were buried elsewhere. The '+ New avatar' menu now groups every option clearly: Build (start from a template, or build from scratch in the studio), From you (snap a selfie, full selfie flow, or describe it as a prompt), and Import (upload a GLB, copy an existing avatar, or browse the public gallery). 'Start from a template' opens a picker with live 3D previews and stages your pick straight into the save step. The empty state leads with the same three quick starts. (`/dashboard/avatars`) `[feature, improvement]`
- **Embedded avatar chat replies again** — Avatars embedded straight from their public profile — the one-line widget on the homepage and anywhere else the avatar URL is dropped in — went silent when you typed a message: the chat box accepted your text but the avatar never answered. The built-in AI now recognizes a plain public avatar and serves it the free we-pay model with the same per-avatar rate and usage limits, so embedded chat responds out of the box. `[fix]`
- **Faster, quieter agents directory and site-wide page polish** — The on-chain agents directory now loads from our server-side index instead of contacting every agent's metadata host from your browser — pages render faster and no longer spray network errors. Also: the pump.fun cockpit's sidebar pages are now shareable deep links, mobile nav and footer links meet touch-target guidelines, anonymous visitors no longer trigger failed sign-in requests on Walk and Create, and assorted dead links were removed. (`/agents`) `[improvement, fix]`
- **Forge and Parts Studio headers display correctly again** — The intro banner on Forge and Parts Studio was rendering as a single squashed black bar — the headline overlapped the status pill and the description was cut off mid-word. Both pages now show the proper centered header: status pill on top, full headline, and the complete description underneath. (`/forge`) `[fix]`
- **Forge checks your photo before spending a generation — plus image-aware fact-checks and accessible galleries** — A new free image-understanding layer (running on NVIDIA's free models, so it costs you nothing) now powers three things across three.ws. In Forge, when you upload a photo to turn into 3D, it's checked first: if it's a screenshot of text, a cluttered scene with no clear subject, or too dark to reconstruct, you get a clear heads-up and a fix before a generation slot is spent — with a one-click 'Generate anyway' if you disagree. The Fact Checker can now take an image alongside a claim: it reads the picture, transcribes any text in it, and weighs that as evidence in the verdict. And every avatar in the public gallery now gets a real, descriptive alt text written from its thumbnail, so screen-reader users hear what each avatar actually looks like instead of just its name. All three quietly switch off if the vision service is ever unavailable — nothing ever blocks or breaks. (`/forge`) `[feature, improvement]`
- **Forge share links now open your creation for anyone you send them to** — When you share a model from Forge, the person who opens the link now sees your actual creation — the 3D model loads straight into the viewer, ready to spin, inspect, and download. Previously a share link only worked for the person who forged the model, because Forge only looked in your own browser's history; recipients landed on an empty Forge. Now the page fetches the shared model by its link and shows it to anyone, even if they've never used Forge before. If a link points to a model that was removed or is still generating, you get a clear message instead of a blank screen. (`/forge`) `[fix, improvement]`
- **Free 3D draft generations no longer get blocked by the paid rate limit** — Generating a 3D model from a text prompt on the Draft tier runs on a free engine — no key, no cost. But it was sharing the same hourly limit as the paid lanes, so a few quick iterations (or several people on the same office or campus network) could hit a 'generator is busy, try again later' wall even though nothing was being charged. The free draft lane now has its own, far more generous allowance and never blocks you because of a backend hiccup. Heavy paid generations keep their tighter limit. Iterate on prompts freely. (`/forge`) `[fix, improvement]`
- **Free 3D drafts on Forge** — Draft generations from a text prompt on Forge now run on a free NVIDIA-hosted TRELLIS engine by default — your first 3D model costs nothing and arrives in about 15 seconds, several times faster than the previous default. Photo-to-3D keeps its proven engine (the free lane is prompt-only by design), and every existing engine — TRELLIS on Replicate, Meshy, Tripo — remains selectable at every quality tier. (`/forge`) `[feature, improvement]`
- **Hardened the explore feed and marketplace pricing against bad requests** — The explore discovery feed and marketplace asset-pricing lookup now reject malformed query parameters with a clear 400 instead of failing with a server error. A non-numeric page size on explore, or a malformed asset id on a price lookup, no longer surfaces a 500 — the endpoints validate input up front and respond cleanly. (`/explore`) `[fix]`
- **Inspect any agent's 3D model right on its marketplace page** — Agent pages in the marketplace now open with a full interactive 3D viewer — orbit, zoom, go fullscreen, download the GLB, or drop the agent straight into the world. Agents without a custom model show the base avatar, so the stage is never empty. Clicking the small header avatar jumps you to the viewer. (`/marketplace`) `[feature]`
- **Light theme is here — flip the whole site with one tap** — three.ws now ships a light theme alongside the signature dark one. A new sun/moon toggle sits in the top nav on every page: tap it to switch instantly, and your choice sticks across pages, sessions, and other open tabs. New here, or set to 'Auto' in Settings → Appearance? The site follows your device's light/dark preference automatically. The theme is applied before the page paints, so there's no white flash on load, and the dashboard appearance picker (Dark / Light / Auto) now applies live instead of just saving for later. Dark remains the brand default — nothing changes unless you want it to. `[feature, improvement]`
- **Live $THREE market data, longer trade streams, and tutor session fixes** — $THREE market stats (price, holders, liquidity) are flowing again from our primary data source — a missing request header had been silently failing it to backups for days. Live trade streams no longer cut out after 30 seconds; they now run their full duration. The Pay-As-You-Learn Tutor no longer errors when resuming a session — running tabs persist correctly across questions — and Fact Checker results are cached properly so repeat checks of the same claim return instantly. `[fix, improvement]`
- **MetaMask Agent Wallet skills for every agent** — Two new skills in the marketplace under the new Wallet category: MetaMask Agent Wallet and MetaMask Agent Workflows. Install them on any agent to let it check balances, transfer tokens, swap, bridge across chains, trade perps and prediction markets, and manage Aave positions through MetaMask's mm CLI — each user signs in with their own MetaMask Agent Wallet, so keys stay with you, never with three.ws. Platform chat agents pick the skills up automatically. (`/skills`) `[feature]`
- **More paid 3D generations per hour before you hit the limit** — The paid text-to-3D and image-to-3D lane in Forge had an hourly ceiling of 12 generations per person — tight enough that a focused iteration session, or a few people sharing the same office or campus network, could run into a 'generation limit reached, try again shortly' wall mid-flow. That ceiling is now 30 per hour. You can push through far more revisions in one sitting, while the limit still protects against runaway GPU spend. The free Draft lane keeps its own, even more generous allowance. (`/forge`) `[improvement]`
- **Pick a username on your account page — even if you signed in with a wallet** — You can now set and change your username right from the account page. If you signed up with a wallet, you previously had no way to claim a handle — your profile just showed a shortened wallet address. Now there's a '+ Set a username' button under your name; tap it, type a handle (3–30 characters, letters, numbers, _ or -), and save. Usernames are checked for availability as you save, so you'll get a clear message if one's already taken. Wallet sign-ins also no longer display the internal placeholder email on your profile. (`/dashboard/account`) `[feature, improvement]`
- **Pluggable memory backends + a portable snapshot format for the agent SDK** — Agent developers can now plug a custom memory backend — a vector database, an episodic event log, or their own API — behind a named mode with Memory.registerBackend, no forking required. All built-in modes (local, remote, ipfs, encrypted-ipfs, none) are unchanged. We also formalized a memory/0.1 snapshot contract: memory.snapshot() returns a JSON-safe object and Memory.fromSnapshot() rehydrates it, so embedded agent widgets keep their memory across page reloads. Documented in the Memory spec, agent manifest, and README. `[sdk, docs]`
- **Public status page with live uptime monitoring** — three.ws now monitors its own critical surfaces — the website, platform API, explore feed, x402 paid-API discovery, and the 3D viewer — every 5 minutes from outside our infrastructure, and publishes the results at three.ws/status: live operational state, response times, and a 90-day uptime history per service. A machine-readable JSON feed is available at /api/status for agents and integrators. Browser errors on any page are now also collected first-party, so problems reach the team before reports do. (`/status`) `[feature, infra]`
- **Pump dashboard alerts now follow you across devices and fire with the tab closed** — Your Pump bot alert rules — graduation, whale, fee, and launch toggles, thresholds, cooldown, and an optional webhook — now save to your account instead of just the browser you set them in. Sign in anywhere and they're already there. Graduation alerts are evaluated server-side against the live pump.fun feed, so they reach you even when no dashboard tab is open: you get an in-app notification and, if you set a webhook URL, a real POST to your server. The Alert history panel now also loads alerts delivered while you were away, so it's accurate across sessions. (`/pump-dashboard`) `[feature, improvement]`
- **Scheduled jobs restored after dependency outage** — Every background job — pump.fun monitoring, coin payouts, club payouts, scheduled X posts, DCA runs, subscription billing, and the rest — had been failing since a recent dependency upgrade left a required Solana staking library out of the deployment. The missing library now ships with every deploy, and the image-processing engine behind avatar baking was rolled back to its proven version so it loads reliably in production. All scheduled jobs run again. `[fix, infra]`
- **Sharper search and richer link previews across the blog** — Every blog post now ships full social-card images and structured data, so links to three.ws unfurl with a proper preview image on X, Slack, Discord and LinkedIn, and show up as rich articles with breadcrumbs in Google. All 25 posts are now listed in the sitemap (previously only four were), making the full archive discoverable in search. A new build step keeps page titles, descriptions and previews in sync automatically so nothing ships without them. (`/blog`) `[improvement]`
- **Talking-agent widgets answer from their knowledge again** — If you uploaded docs to a talking-agent widget, it can ground its answers in them again. Knowledge retrieval had gone quiet when our previous embedding provider ran out of quota — questions fell back to generic replies instead of citing your material. We've moved both the upload step and the question-matching step onto a free, fast embedding lane, so a visitor asking about something only your docs cover now gets an answer drawn straight from them, with the source named. Widgets with no uploaded knowledge keep chatting normally. Nothing to update — your existing docs work as-is. (`/widgets`) `[fix]`
- **Text-to-3D and image-to-3D generation restored** — Fixed two provider regressions that blocked Forge generation: model submissions now pin the latest published model version automatically, and the text-to-image step falls back to a healthy provider instead of failing when the preferred one is misconfigured. (`/forge`) `[fix]`
- **Your chat agent now walks to each new reply instead of popping in** — When you send a message in chat, the 3D agent used to vanish from its old spot and pop into place beside the new reply. Now it walks down the conversation to the new message — appearing where it last stood and gliding into its place with its walking animation playing, so it feels like a character moving through the chat rather than teleporting. The motion respects your system's reduced-motion setting (it simply appears, no slide, if you've asked for less animation), and the very first reply just settles in since there's nowhere to walk from. (`/chat`) `[improvement]`

## 2026-06-10

- **WebRTC relay and x402 telemetry** — Added a Session Description Protocol relay for WebRTC handshakes and instrumented every paid x402 surface for Provider Hub telemetry, with hardened rate limiting. `[feature, infra]`

## 2026-06-09

- **3D + AI + Web3 Just Converged: three.ws Shipped the Whole Stack** (`/blog/3d-ai-crypto-convergence`) — A web2 unicorn just raised ~$200M to build 3D AI agents. three.ws is the only crypto-native team that already shipped the full stack: browser 3D, a multi-provider MCP runtime, and on-chain agent wallets that pay each other in USDC. Open source on GitHub, published to npm, and live on Anthropic
- **Agent Lookup** (`/lookup`) — Resolve any three.ws agent by Solana mint, agent ID, avatar ID, or slug — renders its interactive 3D avatar alongside its on-chain identity (collection, owner, agent wallet, Active/x402 status, Metaplex/Solscan/Magic Eden links).
- **three.ws Wins DEXTools Social Boost — $5,543 $three Buyback** (`/blog/three-ws-dextools-social-boost-buyback`) — three.ws is DEXTools
- **New Claude models in every agent brain** — Claude Fable 5 and Mythos 5 are now available across agent brain selectors, pricing tables, and the x402 provider catalog. `[feature]`

## 2026-06-08

- **EVM Vanity Wallet** (`/evm-wallet`) — Grind a custom Ethereum / EVM wallet address with the prefix or suffix of your choice. A real secp256k1 keypair, generated entirely in your browser — the private key never leaves your device.
- **three.ws Featured on the Alibaba Cloud Marketplace Blog** (`/blog/three-ws-featured-on-alibaba-cloud-marketplace-blog`) — Alibaba Cloud Marketplace published an editorial on three.ws — browser-native 3D AI agents you deploy with a single <agent-3d> tag, with a Claude-powered runtime, ERC-8004 identity, and an Apache 2.0 open-source stack.
- **Bounty board with AI judge** — Bounty submissions now support liking, AI-powered scoring, and per-bounty leaderboards — submissions are ranked by a platform-powered judge. `[feature]`
- **Public agent profiles with shared memories** — Agents can now have public profile pages that surface their shared memories, plus Replicate model provider support and public agent directory resolution. `[feature]`

## 2026-06-07

- **AIXBT market intelligence for agents** — Agents and in-world NPCs can now tap AIXBT market intelligence — token analysis, project data, and grounding served through new API endpoints. `[feature]`

## 2026-06-06

- **Support** (`/support`) — Get help with three.ws — report bugs, ask integration questions, reach support and security via GitHub Issues, Discussions, and email, all in one place.
- **Forge editing upgrades** — Forge gained an animation system, pose studio, magic-brush stylization, multi-view rendering, and faster segment/animate/texture workers. `[improvement]`
- **IBM Granite models over MCP and x402** — Published an MCP package exposing IBM Granite chat, code, embedding, and forecasting models with x402 pay-per-call routing. `[sdk]`

## 2026-06-05

- **Agent Exchange — AI Agents Paying Each Other** (`/features/agent-exchange`) — Watch two AI agents with 3D avatars autonomously negotiate and pay each other for crypto intelligence via x402 micropayments on Solana.
- **Create an Agent** (`/create-agent`) — Step-by-step wizard to create a 3D AI agent: name, 3D body, skills, personality, voice, and on-chain identity.
- **Deploy — On-Chain Agent Identity** (`/features/deploy`) — Register your AI agent on Solana via ERC-8004 and Metaplex Core. Permanent, verifiable identity — discoverable by any wallet or other agent.
- **Describe it to 3D** (`/create/prompt`) — Type a description. About a minute later: a rigged 3D avatar you can animate and download.
- **Docs · Do I Need Crypto?** (`/docs/do-i-need-crypto`) — Honest answers to the wallet and payment questions — what requires crypto, what doesn’t, and how payments work.
- **Docs · Make Your First Agent** (`/docs/make-your-agent`) — Step-by-step guide to creating a 3D AI agent in the browser with no code required.
- **Docs · Share & Embed** (`/docs/share-and-embed`) — Three ways to put your agent in front of people: share a link, embed an iframe, or use the web component.
- **Docs · Start Here** (`/docs/start-here`) — Plain-language introduction to three.ws for creators and non-developers — what it is, who it’s for, and where to begin.
- **Forge — Text to 3D Model** (`/features/forge`) — Type a description, get a downloadable textured 3D model (GLB). Powered by Flux image generation and TRELLIS 3D reconstruction.
- **Glossary** (`/glossary`) — Plain-English definitions for the crypto and agent terms used across three.ws — no jargon required to get started.
- **Labs Showcase** (`/labs`) — A curated gallery of three.ws's most powerful — and most hidden — features. Find and try things you didn't know existed.
- **Marketplace — Discover and Fork AI Agents** (`/features/marketplace`) — Browse hundreds of community-built AI agents with 3D avatars and on-chain identities. Fork any agent, buy paid skills, and ship in minutes.
- **Play — Live 3D Coin Worlds** (`/features/play`) — Every pump.fun coin gets a deterministic 3D world. Walk in as your avatar, chat with holders, and trade — all in the browser.
- **Pole Club** (`/club`) — A 3D club where dancers only perform when you send a micro-tip. Pay $0.001 per routine, settled on-chain via x402 on Base or Solana.
- **Scan — Selfie to 3D Avatar** (`/features/scan`) — Point your camera at your face, hold still, and walk away with a rigged 3D avatar in 60 seconds. Free, in your browser.
- **Studio — Embeddable AI Widget Builder** (`/features/studio`) — Configure avatar, voice, and knowledge base in the Widget Studio, then copy one script tag to embed a 3D AI agent anywhere.
- **Voice Lab** (`/voice`) — Clone your voice from a short recording, then use it for TTS or give it to your agent. Side-by-side comparison of voice models.
- **Walk — 3D Avatar AR** (`/features/walk`) — Drive your AI agent's 3D avatar with WASD or joystick. Toggle AR mode and it walks on your real floor through your phone camera.
- **What is three.ws?** (`/what-is`) — Plain-English introduction to three.ws — what a 3D AI agent is, real use-cases, and where to begin.
- **Cosmetics economy in the game world** — A cosmetics shop inside the 3D game world — buy avatar customizations via x402, trade them peer-to-peer, and earn from cosmetics usage. `[feature]`
- **Privy wallet sign-in** — Wallet-native sign-in via Privy with JWKS verification and DID linking — log in securely without managing passwords. `[feature, security]`
- **Pump.fun autopilot and guided agent creation** — Automated token launching and trading via pump.fun autopilot, plus a new create-prompt flow that walks you from idea to deployed on-chain agent. `[feature]`

## 2026-06-04

- **Forge — Text to 3D** (`/forge`) — Type a prompt — or drop in photos or a sketch — and get a downloadable textured 3D model (GLB). Pick from multiple generation engines with live health status.

## 2026-06-03

- **Agent Commerce** (`/agent-trade`) — Watch two AI agents pay each other on-chain using x402 — a live Solana transaction, rendered in 3D.
- **Agent Economy — Live** (`/live`) — Two AI agents in a virtual world paying each other for live Solana market data. Real on-chain transactions, real blockchain, real 3D.
- **Agent Economy — Live Demo** (`/agent-economy`) — Watch two 3D AI agents transact on-chain. Agent A buys data from Agent B — real SOL, real Solana transaction, live.
- **Agent Economy — NOVA & ORACLE** (`/demo`) — Two three.ws AI agents with real Solana wallets discover services on the x402 bazaar, pay each other in SOL, and display a live market briefing on the TV in their world.
- **Agent Exchange** (`/agent-exchange`) — Two AI agents with 3D bodies negotiate and pay each other for live crypto intel using x402 micropayments on Solana. Every transaction is real and confirmed on-chain.
- **Digital Twin — Living Market Replica** (`/ibm/twin`) — A living replica of a real market on IBM watsonx — live data drives the twin while Granite TimeSeries projects where it's heading.
- **Granite Oracle — Price Forecasting in 3D** (`/ibm/oracle`) — IBM Granite TimeSeries forecasting rendered in 3D — a live crypto market forecast computed on watsonx.ai and visualized by a three.ws agent.
- **Granite Proof — On-Chain AI Notary** (`/ibm/proof`) — A 3D AI agent forecasts a live crypto market with IBM Granite TimeSeries, Granite Guardian governs every word, and each governed forecast is notarized on Solana — signed by the agent's own wallet.
- **Granite Vision — Image Understanding** (`/ibm/vision`) — IBM Granite Vision reads your 3D avatar — multimodal image understanding on watsonx.ai, demonstrated live.
- **Identity Firewall — Granite Stops Impersonation** (`/ibm/identity`) — Before a three.ws agent identity is born, IBM Granite embeddings compare it against every public agent to catch impersonation, and Granite Guardian screens the name, bio, and persona.
- **Showcasing the three.ws × IBM Partnership** (`/blog/three-ws-ibm-collaboration`) — three.ws and IBM showcased their partnership: embedding a persistent, on-chain 3D agent into any platform as easily as a YouTube video, with the agent brain running on IBM watsonx.ai and Granite.
- **three.ws on IBM watsonx — Agent Galaxy** (`/ibm/galaxy`) — three.ws is an IBM Business Partner. Open-source 3D AI agents that think on IBM Granite via watsonx.ai and give watsonx Orchestrate agents a face, voice, and on-chain identity.
- **Trust Layer — Granite Guardian Governs Agents** (`/ibm/trust-layer`) — IBM Granite Guardian governs an autonomous, wallet-holding 3D AI agent in real time. Every message and on-chain action is risk-classified on watsonx.ai and written to a tamper-evident audit ledger.
- **watsonx Constellation** (`/constellation`) — Live Solana tokens in a 3D galaxy, positioned in semantic space by IBM Granite embeddings on watsonx.ai. Click a star for a live IBM Granite analysis.
- **Autonomous agent-to-agent trading** — Agents can now negotiate with each other, pay for crypto intelligence via x402 micropayments, and settle on-chain — fully autonomously. `[feature]`
- **Voice cloning and real-time lip-sync** — ElevenLabs text-to-speech is now wired through the platform: voice cloning, real-time lip-sync, and per-voice settings for every agent. `[feature]`
- **x402 payment hardening** — Hardened payment processing with Solana transaction confirmation, replay-attack guards, payment-intent deduplication, and sanitized errors across MCP bridges. `[security, fix]`

## 2026-06-02

- **Avatar Wallet** (`/avatar-wallet-chat`) — An embeddable 3D AI avatar that holds a Solana wallet, chats, and can autonomously send SOL.
- **Token in 3D** (`/coin3d`) — Any pump.fun token as a live 3D scene — a spinning coin medallion with the token's logo, top holders as a galaxy sized by balance, and a graduation ring tracking bonding-curve progress.
- **Every agent gets its own wallet** — Each agent now has a deterministic Solana wallet for self-custodied payments — agents can send SOL and settle x402 transactions autonomously. `[feature]`
- **Four production MCP servers** — 3D Studio (text-to-3D, model inspection), x402 Bazaar (service discovery and payment), IBM watsonx (LLM access), and Pump.fun (token operations) — all published with manifests and docs. (`/docs/mcp`) `[sdk]`

## 2026-06-01

- **City world** — An isometric 3D city with player movement, collision, minimap, and avatar animation — a new kind of world to explore as your agent. `[feature]`
- **Quests, loot, mounts, and realms** — The multiplayer game layer now includes quests, loot drops, mounts, and realm-based gameplay with a token-managed in-game economy. `[feature]`

## 2026-05-31

- **We turned every memecoin into a live 3D world you can walk into** (`/blog/three-ws-play-coin-communities`) — How we built /play: isolated multiplayer worlds keyed to a token
- **Holder-gated worlds** — Every coin world now has two rooms: General (open to all) and Holders (gated by minimum token holdings, verified server-side). `[feature]`
- **Keyframe animation in Pose Studio** — Create, edit, and export full-body avatar animations on a keyframe timeline — with easing functions and export to JSON or GLB. `[feature]`
- **Spatial voice chat in coin worlds** — Proximity-based voice chat inside multiplayer worlds — you hear players based on distance, with speaking indicators, voice activity detection, and audio panning. `[feature]`

## 2026-05-30

- **Coin Communities — live 3D coin worlds** — Every pump.fun coin gets a deterministic 3D world. Walk in as your avatar, chat with other holders, and watch real-time charts in-world. `[feature]`

## 2026-05-29

- **$THREE Live · Protocol Pulse** (`/three-live`) — The $THREE protocol as a living 3D organism. Real on-chain trades pulse through it in real time — each transaction emits a particle burst, whales send shockwaves, with a live trade feed and a HUD of price, market cap, holders, and volume.
- **3D Scanner — Scan Yourself into 3D** (`/scan`) — Point your camera at your face, hold still, and walk away with a rigged 3D avatar — reconstruction runs in about a minute, free, in your browser.
- **Forever — etch a message into Bitcoin** (`/forever`) — Inscribe a message onto the Bitcoin blockchain. It stays there. Forever.
- **Pay-As-You-Learn Tutor** (`/tutor`) — Ask anything and pay a cent per answer. A pay-as-you-learn AI tutor that bills $0.01 per explanation in USDC over x402, with a live itemized session invoice and signed attestation.
- **x402 Arbitrage** (`/arbitrage`) — Cross-provider price disparities surfaced live from the merged x402 facilitator catalog. Find the cheapest endpoint for any capability.
- **x402 Providers** (`/providers`) — Quantified operator profiles for the x402 paid API catalog. Service counts, price bands, dominant categories, and the underlying listings.
- **Live trade streaming and zen mode** — The pump.fun feed now streams per-mint buy/sell flows in real time, and Walk gained a zen mode (Z key) that hides all UI except the 3D scene. `[feature, improvement]`

## 2026-05-28

- **Faster, more reliable deploys** — Updated the Solana SDK bridge and fixed build memory limits and per-file timeouts that could stall deployments. `[fix, infra]`

## 2026-05-27

- **Endpoint Shopper** (`/shopper`) — Describe a task and set a budget. An AI agent discovers relevant x402 endpoints via the Bazaar, chains them together, and synthesizes a final answer — paying per API call.
- **Fact Checker** (`/fact-checker`) — Pay $0.10 per claim. The agent searches across authoritative sources, pays per retrieval via x402, and returns a verdict with cited evidence and a signed attestation.
- **Get Started** (`/start`) — 5-step onboarding wizard: create a 3D avatar, name your agent, enable skills, deploy an embed widget, and set up monetization — all in under 5 minutes.
- **Multi-LLM Brain** (`/brain`) — Send one prompt to Claude, GPT, Qwen, ModelScope, and Groq simultaneously. Side-by-side streaming with latency and token stats.
- **Skills Marketplace** (`/skills`) — Browse, search, and install agent skills — tool packs, knowledge bases, and capabilities that make AI agents smarter.
- **three.ws Joins the AWS Partner Network** (`/blog/three-ws-aws-partner`) — three.ws is now an official AWS Partner, enrolled in the AWS Partner Network (APN) Software Path as a Technology Partner. The open-source platform for 3D AI agents on-chain is the first fully Web3-native ISV to join APN with a Solana / EVM on-chain identity stack.
- **three.ws Launches on AWS Marketplace, Bringing On-Chain 3D AI Agents to Enterprise Procurement** (`/blog/three-ws-on-aws-marketplace`) — three.ws is now live on AWS Marketplace as a SaaS subscription. AWS customers can subscribe directly, bill to their AWS invoice, spend AWS Activate credits, and count three.ws toward Enterprise Discount Program commitments — for the first fully on-chain 3D AI agent platform.
- **Unstoppable Agent** (`/unstoppable`) — Live dashboard for an autonomous agent that funds itself via x402 micropayments. Watch its balance, earnings, costs, and daily reflections in real time.
- **Brain page — race LLMs side by side** — Run simultaneous inference across Claude, GPT, Qwen, and more with streaming latency comparison, plus a face-quality module that scores avatar facial fidelity. `[feature]`
- **Unified dashboard** — Dashboard routes consolidated under /dashboard — agents, avatars, analytics, settings, and billing in one place. (`/dashboard`) `[improvement]`

## 2026-05-26

- **Avatar regeneration tracking and grounded AR** — Avatar regeneration jobs are now trackable, and AR mode freezes the follow-cam so avatars walk in world space instead of always facing the camera. `[improvement]`
- **three.ws on AWS Marketplace** — Subscribe through AWS Marketplace and automatically receive x402 API keys, with subscription status enforced across the platform. (`/docs/listings`) `[feature, infra]`

## 2026-05-25

- **$THREE Listed on Coinbase, CoinGecko, Jupiter, and Investing.com** (`/blog/three-token-listings`) — $THREE is now listed and verified across Coinbase, CoinGecko, Jupiter Exchange, and Investing.com — giving the three.ws community every major on-ramp and price discovery surface.
- **2,500 New 3D Animations Coming to three.ws** (`/blog/2500-new-animations`) — three.ws is expanding its animation library with 2,500 new 3D animations — giving every agent vastly more expressive range across emotions, gestures, reactions, and activities.
- **Agent Builder Live — Studio Redesign, LLM Chat Upgrade** (`/blog/agent-builder-studio-launch`) — three.ws ships Agent Builder, an improved Studio design, and a major LLM Chat upgrade. Agents are now payable, tradeable, and discoverable.
- **Characters** (`/characters`) — Discover AI characters on three.ws. Chat, trade, and create.
- **Claim threews.sol Subdomain** (`/threews/claim`) — Claim your own <name>.threews.sol subdomain and get a Brave-resolvable personal showcase page.
- **Dashboard** (`/dashboard`) — Your account dashboard: agents, avatars, payments, keys, MCP servers, monetization, billing.
- **Dashboard · Account** (`/dashboard/account`) — Manage connected wallets, SNS, delegation, and action log.
- **Dashboard · Analytics** (`/dashboard/analytics`) — API call volume, x402 spend, and per-agent usage breakdowns.
- **Dashboard · Settings** (`/dashboard/settings`) — Avatar storage modes (R2 vs IPFS), sessions, notifications, and preferences.
- **Full Animation & Emotion Control — Plus Pump.fun Live Feed** (`/blog/animation-emotion-control`) — three.ws now ships full animation and emotion control for 3D agents, with live Pump.fun feed integration. Your agents react to any API or data feed in real time.
- **GMGN Smart Money** (`/gmgn`) — Live smart-money signals narrated by a 3D AI agent. Tracks which wallets are loading on Solana, Ethereum, Base, and BNB Chain in real time.
- **Import an avatar URL** (`/import/rpm`) — Import any GLB or glTF avatar into three.ws and give it an agent brain.
- **New Agent** (`/agent/new`) — Create a new agent from scratch — avatar, brain, skills, and on-chain identity.
- **Playground** (`/playground`) — Sandbox for experimenting with agents, prompts, and 3D scenes.
- **Real-Time Voice Interaction with 3D AI Agents — Preview** (`/blog/real-time-voice-interaction`) — three.ws ships an early preview of real-time voice interaction with 3D AI agents. Agents listen, reason with memory and emotions, respond in voice, and support AR/VR.
- **Selfie to Avatar** (`/create/selfie`) — One selfie. About a minute. A rigged 3D avatar that works everywhere.
- **sitemap.xml** (`/sitemap.xml`) — XML sitemap for search-engine crawlers.
- **Solana Wallet Integration for Autonomous 3D Agents** (`/blog/solana-wallet-integration`) — three.ws 3D agents now have native Solana wallets. Your agent can hold and spend money autonomously — earning from skills, paying for inference, and executing on-chain transactions while you sleep.
- **three.ws Integrates the Pump.fun Agent Payments SDK** (`/blog/pumpfun-agent-payments-sdk`) — three.ws has integrated the Pump.fun agent payments SDK. Your 3D AI agent doesn
- **three.ws Is Now an Official IBM Business Partner** (`/blog/three-ws-ibm-business-partner`) — three.ws has been accepted into IBM
- **three.ws Is Now Live on CoinMarketCap** (`/blog/three-ws-on-coinmarketcap`) — three.ws is now live on CoinMarketCap — join the community page for real-time discussion and stay updated on the platform for 3D on-chain AI agents.
- **three.ws Joins Google Cloud for Web3 Startups** (`/blog/three-ws-google-cloud-partnership`) — three.ws is joining forces with Google Cloud, bringing cloud-scale rendering and AI infrastructure to 3D on-chain agents.
- **three.ws Listed on Anthropic's Official MCP Registry** (`/blog/three-ws-on-anthropic-mcp-registry`) — three.ws is now listed on Anthropic
- **three.ws Listed on Coinbase x402 Bazaar and agentic.market** (`/blog/three-ws-x402-bazaar`) — three.ws is now a verified service provider on the Coinbase x402 Bazaar and agentic.market — the app store and discovery layer for AI agents with 480k active agents and $50M in volume.
- **three.ws Ships Inside SperaxUSD — DeFi Gets a 3D Face** (`/blog/three-ws-speraxusd-integration`) — three.ws is now integrated with SperaxOS, fully wired into the production DeFi stack. Agents get a 3D body, memory, voice, and an on-chain identity — and they react to DeFi events in real time.
- **three.ws Teams Up with HackerNoon** (`/blog/three-ws-hackernoon-partnership`) — three.ws is partnering with HackerNoon to launch a builder-focused initiative with feature articles, tutorials, and developer guides for those shipping with AI.
- **We Just Shipped the 3D Layer for the Internet — <agent-3d>** (`/blog/agent-3d-web-component`) — Drop one <agent-3d> web component on your site and give any page an AI with LLM brain, memory, emotions, DOM awareness, password field privacy, and an on-chain identity that lives forever.
- **x402 Bazaar** (`/bazaar`) — Search and browse the x402 facilitator catalog. Filter by network, price, and extensions. Pay any service in one click.
- **Search engines find everything faster** — Dynamic chunked sitemaps backed by live database queries, JSON-LD structured data for agents and avatars, and IndexNow integration for instant search discovery. `[infra, improvement]`

## 2026-05-24

- **Widget Studio** (`/studio`) — Pick an avatar, configure embed options, copy a one-line snippet for your site.
- **Avatar review with live 3D preview** — The create-review step now embeds a full TalkScene 3D viewer with idle animations and a responsive mobile layout. `[improvement]`
- **Marketplace asset pricing and purchases** — Asset pricing, purchase flows, payment modals, and time-pass licensing — avatar customizations and plugins are now monetizable. `[feature]`

## 2026-05-23

- **Pay by name with SNS** — Solana Name Service integration — claim threews.sol subdomains and send USDC via human-readable names through x402 pay-by-name. `[feature]`

## 2026-05-21

- **Agent-to-agent protocol** — A2A client/server, MCP bridge, spending ledger, and receipts storage — agents can securely request services from each other with x402 payment coordination. `[feature, sdk]`
- **Agent-UI SDK released** — Published @three-ws/agent-ui for embedding 3D avatars in any web app — animation, click reactions, mouse tracking, and movement behaviors. `[sdk]`
- **Avatar Agent MCP in Anthropic's registry** — Published avatar-agent-mcp to Anthropic's official MCP registry — 40+ tools for avatar generation, token launches, GLB rendering, and on-chain transactions. `[sdk]`
- **Pole Club — micro-tip performances** — A 3D club with four stages where USDC micro-tips ($0.001) spawn named dancers and trigger choreographed routines, with gasless Permit2 support. (`/club`) `[feature]`
- **x402 Bazaar infrastructure** — Bazaar listing and search with x402 subscriptions, paid-tier access control, idempotency caching, and offer receipts for service monetization. `[feature, infra]`

## 2026-05-20

- **Hydrate** (`/hydrate`) — Take an existing on-chain agent (ERC-8004 / Solana) and attach a 3D body, voice, and skills.
- **Buybacks and WASM vanity addresses** — Added a pump-swap buyback flow and a WebAssembly vanity address grinder for custom token launch addresses. `[feature]`
- **Platform-wide security hardening** — SSRF guards on outbound fetches, CSRF gates on admin and key management, per-IP rate limiting on shared API quotas, and fail-closed cron handlers. `[security]`

## 2026-05-19

- **USDC pairs for pump.fun v2** — USDC trading pair support for pump.fun v2 coins with automatic bonding-curve quote detection. `[feature]`

## 2026-05-18

- **Launchpad Studio** (`/launchpad`) — Build a hosted 3D launchpad, token page, concierge, or showroom on a three.ws subdomain.
- **Live feed mode in the token visualizer** — The pump.fun visualizer gained a live feed mode with marketplace export, and the avatar creation flow was streamlined under the Avatar Studio brand. `[feature, improvement]`
- **Selfie-to-avatar reconstruction pipeline** — Native photo-to-3D reconstruction — submit selfies and get a fully rigged GLB avatar with automatic mesh optimization, resilient to long-running transforms. `[feature]`
- **Solana Seeker mobile support** — Mobile Wallet Adapter integration for Solana Seeker and Saga devices, with a Solana dApp Store listing and Seed Vault authentication. `[feature]`

## 2026-05-17

- **Blog** (`/blog`) — Editorial index of three.ws launches and long-form posts.
- **Docs · Listings & Distribution** (`/docs/listings`) — Cloud marketplaces and ecosystem directories where three.ws is listed (Alibaba Cloud, BNB Chain Dappbay, and more).
- **Lipsync (Mic)** (`/lipsync/mic`) — Feed live mic audio through the viseme analyser and watch the avatar's mouth track your voice in real time.
- **Lipsync (TTS)** (`/lipsync`) — Type text, stream it through the avatar's voice, and the mouth animates in real time via wawa-lipsync viseme detection.
- **three.ws Launches on Alibaba Cloud Marketplace, Bringing Native x402 Agent Payments to Hyperscale** (`/blog/three-ws-on-alibaba-cloud-marketplace`) — three.ws is now live on the Alibaba Cloud International Marketplace. The listing makes <agent-3d> available to every Alibaba Cloud customer worldwide and activates HTTP 402 / x402 agent payments at hyperscale.
- **three.ws Listed on BNB Chain's Dappbay Directory** (`/blog/three-ws-on-bnb-chain-dappbay`) — three.ws is now listed on Dappbay, BNB Chain
- **Agent personalization and on-chain economy scaffolding** — Persona extraction from voice interviews, memory seeds from GitHub/X/Farcaster, instant voice cloning, a bonding-curve simulator, and EAS attestation reputation. `[feature]`
- **News syndication** — News posts auto-publish to Dev.to and Medium with canonical links back to three.ws, and WebSub pushes keep RSS subscribers current. `[infra]`
- **Server-side avatar regeneration** — Restyle, remesh, retexture, and rerig avatars with server-backed Replicate compute — results cached automatically in R2. `[feature]`
- **Talk mode, avatar SDK, and 5–10x smaller avatars** — Talk mode with camera presets and ARKit-52 blendshapes, a public avatar SDK with React exports, new brain/TTS/identity APIs, and a GLB bake pipeline with WebP compression that cuts asset sizes 5–10x. `[feature, sdk]`
- **Talking avatars with audio-driven lip-sync** — Real-time lip-sync reads TTS audio and morphs avatar mouth shapes, integrated into talk scenes with camera presets and emotes. `[feature]`
- **Team launches with creator-signer split** — Token launches now support separate signer and creator wallets — the signer pays gas while the creator receives on-chain royalties. `[feature]`

## 2026-05-15

- **Strategy Lab** (`/strategy-lab`) — Build DCA and subscription strategies that trade on-chain on your behalf.
- **Avatar accessories and launchpad redesign** — Avatar customization now supports accessories, and the coin launchpad interface was redesigned for clarity. `[improvement]`
- **Token visualizer search and sort** — The interactive 3D token universe gained search by name/symbol/mint and sorting by market cap, live status, replies, and age — refreshing every 60 seconds. `[feature]`

## 2026-05-14

- **15 tutorials and six new paid endpoints** — New developer walkthroughs from embed quickstart to multi-agent coordination, plus six x402 paid endpoints including agent reputation, identity verify, and skill marketplace. `[docs, feature]`
- **Launchpad Studio — no-code hosted pages** — Pick a template, fill a form, and publish a hosted page for your token or service at /p/<slug> — no code required. `[feature]`
- **Multiplayer walk scenes** — Live multiplayer walkaround with websocket infrastructure — multiple players see each other in the same 3D scene. `[feature, infra]`
- **x402 commerce — SKUs and hosted checkout** — Stripe-like payment UX for x402: define SKUs, share hosted checkout links, and track settlement history — settled on Base via Coinbase CDP. `[feature]`

## 2026-05-13

- **Avatar Gallery** (`/gallery`) — Every public 3D avatar in the system, browsable as a grid.
- **llms-full.txt** (`/llms-full.txt`) — Expanded llms.txt with full descriptions and content hints.
- **llms.txt** (`/llms.txt`) — AI-agent-friendly index of every public page (Howard convention).
- **Sitemap** (`/sitemap`) — Human-readable index of every page on three.ws.
- **Autonomous X Spaces voice agent** — A cloud voice agent that joins X Spaces and holds real-time conversations using streaming audio and transcription. `[feature]`

## 2026-05-10

- **Pay (x402)** (`/pay`) — Pay-per-call gateway: invoke any x402-protocol paid API with a USDC micro-transaction.
- **Walk** (`/walk`) — Drive a 3D avatar around with a joystick or WASD — toggle the back camera for AR-style passthrough.
- **Launch-week recap published** — An interactive case study of launch week (Apr 29 – May 9) with the architecture timeline, partner ecosystem, lessons learned, and live engagement metrics. `[docs]`
- **Marketplace v2 and creator dashboard** — Redesigned marketplace with trials, time passes, billing receipts, featured avatar galleries, and theme selection. `[feature]`
- **Monetization v2** — Trials, time-based access passes, withdrawal processing, signed receipts, multi-wallet support, and 5% referral splits. `[feature]`

## 2026-05-09

- **ETH Vanity (CREATE2)** (`/eth-vanity`) — Grind a vanity smart-contract address using the ThreeWSFactory CREATE2 deployer on BSC.
- **Vanity wallet addresses** — Vanity address grinders for Solana and Ethereum, plus co-sign helpers for parallel token launches. `[feature]`

## 2026-05-08

- **$THREE holder gating** — Holder-gated access now works with a simple on-chain $THREE balance check — no vault setup required. `[feature]`
- **Agent Payments SDK v3.1.0 — multi-chain** — Solana v2 bonding curve support plus Base, Polygon, and Ethereum with cross-chain payment routing. `[sdk]`
- **Agents that feel the room** — Agents now react to user sentiment with emotion expressions and animations — empathy, concern, celebration, patience, curiosity. `[feature]`
- **Payments inside chat** — The full agent payments lifecycle is available in chat — balance checks, fund distribution, withdrawals, and USDC whitelist monitoring. `[feature]`
- **Pick your agent's model** — Chat moved to unified streaming with per-agent model selection across Anthropic, OpenRouter, Groq, and OpenAI. `[feature]`
- **Trading tools in chat** — Five real trading tools in agent chat: buy, sell, portfolio view, and live price quotes with custom slippage control. `[feature]`
- **x402 spec v2** — Upgraded the payment protocol to spec v2 with CAIP-2 network IDs, Bazaar integration, and marketplace listing support. `[improvement, sdk]`

## 2026-05-04

- **Community** (`/community`) — Featured creators, builds, and conversations from the three.ws community.
- **How to Embed 3D On-Chain Agents on Your Site** (`/blog/how-to-embed-3d-onchain-agents`) — A complete walkthrough for embedding a three.ws 3D on-chain agent on any website using the <agent-3d> web component — from setup to CORS configuration and page integration.
- **Pump Dashboard** (`/pump-dashboard`) — Pump.fun trading desk: watchlists, scanner, quotes, portfolio, and live charts.
- **Pump Live** (`/pump-live`) — Real-time SSE feed of every pump.fun launch as it happens.
- **Pump Visualizer** (`/pump-visualizer`) — 3D visualizer of trending pump.fun tokens — live market data rendered as an interactive scene.
- **Tutorials** (`/tutorials`) — Step-by-step build guides.
- **Avatar reactions to market events** — Community and personal avatar selection with real-time gesture animations during market events. `[improvement]`
- **JavaScript SDK launch** — The official three.ws JavaScript SDK with built-in chat and embed methods — integrate 3D agents into any web application. `[sdk]`
- **Real-time multiplayer sync** — Live multiplayer support with real-time room creation, player interactions, and synchronized state. `[feature]`
- **Richer pump.fun feed** — Graduation event parsing, gesture animations, and live market cap display in the pump.fun dashboard. `[improvement]`
- **Sell your agent's skills** — Skill pricing, purchase buttons, and a payment intent API — creators can gate premium skills behind subscriptions or one-time purchases. `[feature]`

## 2026-05-01

- **Lip-sync and Solana Blinks** — Real-time viseme morphing from audio, plus Solana Blinks support so agents can parse and execute on-chain actions. `[feature]`
- **Plugin marketplace** — Search, install, and manage community-published agent skills using the open ToolManifest format. `[feature]`
- **Reputation and staking** — Agent reputation panel with ETH staking for trust signals — reputation accumulates through validator actions tracked on-chain. `[feature]`

## 2026-04-30

- **Chat with voice** — Native LLM chat launched with live voice input/output and real-time transcription for agent conversations. (`/chat`) `[feature]`

## 2026-04-29

- **.well-known/agent-attestation-schemas** (`/.well-known/agent-attestation-schemas`) — JSON schemas for agent attestations.
- **.well-known/oauth-authorization-server** (`/.well-known/oauth-authorization-server`) — OAuth 2.1 authorization-server metadata.
- **.well-known/x402** (`/.well-known/x402`) — x402 paid-API discovery document.
- **Chat** (`/chat`) — Talk to your agent. Voice, text, and tool-use in one interface.
- **Marketplace** (`/marketplace`) — Buy access to agents, skills, and avatars from other creators.
- **Pump.fun Stream** (`/pumpfun`) — Mint and trade pump.fun agent tokens on Solana. Live feed of every launch.
- **Solana Vanity Wallet** (`/vanity-wallet`) — Grind a Solana address with a custom prefix using your browser's GPU.
- **On-chain agents on Solana and EVM** — Unified deployment stack — agents register on Ethereum, Base, Polygon, and Solana with passport pages, reputation, and attestations. `[feature]`
- **Pump.fun launch and trading stack** — Token creation, bonding-curve swaps, KOL trade tracking, automated wallet monitoring, and a vanity address grinder for custom Solana prefixes. `[feature]`
- **Solana Agent SDK** — Actions for token transfers, SPL swaps, balance queries, and stake attestations, with transaction builders and fee estimation. `[sdk]`
- **three.ws in Anthropic's MCP Registry** — Published to the official MCP Registry — Claude can deploy agents, create tokens, and run wallet operations on three.ws via the standard MCP protocol. `[sdk, infra]`
- **x402 micropayments** — Facilitator-mediated USDC micropayments — MCP clients authorize requests with payment headers, with per-tool pricing and subscription bypass. `[feature, sdk]`

## 2026-04-28

- **Avatar Artifact** (`/avatar-artifact`) — Standalone Three.js viewer for avatar artifacts — embeddable and shareable without any wrapper page.
- **Settings** (`/settings`) — Account, profile, and notification settings.

## 2026-04-27

- **Docs** (`/docs`) — Full documentation: SDKs, API reference, embedding, agent system, smart contracts.
- **Docs · <agent-3d>** (`/docs/web-component`) — Reference for the <agent-3d> custom element.
- **Docs · Agent System** (`/docs/agent-system`) — How agents, avatars, skills, and memories fit together.
- **Docs · API Reference** (`/docs/api-reference`) — Full HTTP API reference.
- **Docs · Embedding** (`/docs/embedding`) — Embed an agent via iframe, oEmbed, or the <agent-3d> web component.
- **Docs · ERC-8004** (`/docs/erc8004`) — Reference for the on-chain agent identity standard.
- **Docs · MCP** (`/docs/mcp`) — Expose your agent as an MCP server for Claude, ChatGPT, and other clients.
- **Docs · Quick Start** (`/docs/quick-start`) — Five-minute walkthrough: create an agent, embed it, get a paid call.
- **Docs · SDK** (`/docs/sdk`) — JavaScript / Node SDK for three.ws.
- **Docs · Skills** (`/docs/skills`) — Write, package, and monetize agent skills.
- **OpenAPI** (`/openapi.json`) — Machine-readable HTTP API spec.
- **Privacy Policy** (`/legal/privacy`) — How three.ws handles user data.
- **Terms of Use** (`/legal/tos`) — Terms of service for three.ws.
- **3D viewer polish** — Better first-load camera framing, keyboard shortcuts, saved per-agent animation preferences, and improved mobile accessibility. `[improvement]`
- **Create-to-deploy flow** — A streamlined creator path: create, edit, see your 3D body on your public profile, and deploy on-chain with chain selection — with onboarding for first-time creators. `[feature]`
- **Hello, three.ws** — The platform rebranded from 3D Agent to three.ws across every page, with consolidated routing and new Privacy Policy and Terms of Service. `[improvement]`

## 2026-04-17

- **.well-known/chat-plugin.json** (`/.well-known/chat-plugin.json`) — ChatGPT-style plugin manifest.
- **Agents Index** (`/agents`) — Browse every registered agent on three.ws.
- **Artifact Viewer** (`/artifact`) — Renders Claude artifact bundles as standalone embeddable apps.
- **Discover** (`/discover`) — On-chain agent directory (ERC-8004 + Solana). Browse, search, and inspect every registered agent.
- **glTF Validator** (`/validation`) — Khronos-spec validator for glTF/GLB files. Paste a URL or upload a model.
- **My Agents** (`/my-agents`) — Your private collection of agents and avatars. Requires sign-in.
- **Reputation Explorer** (`/reputation`) — Inspect on-chain reputation scores and attestations for any agent.
- **Viewer** (`/app`) — Drag-and-drop glTF/GLB viewer for inspecting 3D models in the browser.
- **Avatars that never sit still** — A four-channel idle animation loop — breathing, eye saccades, blinks, weight shifts — keeps avatars naturally alive during silence. `[feature]`
- **Embeds with action bridges** — Agent embeds can be hosted on external sites with persistent state, live Studio preview, and bridges for inter-agent communication. `[feature]`
- **On-chain agent discovery** — The /discover page lists every ERC-8004 agent owned by your wallet with one-click import, plus a LobeHub plugin for LLM orchestration. (`/discover`) `[feature]`

## 2026-04-16

- **Create Agent** (`/create`) — Wizard for building a new agent: avatar, brain (LLM + prompt), skills, and on-chain identity.
- **Home** (`/`) — Landing page. 3D AI agents that think on IBM watsonx.ai (Granite) — the pitch, live agent demos, and the front door to every flow.
- **Widget Studio is born** — The first version of Widget Studio — build, preview, and save custom avatar widgets with a drag-drop editor and live updates. `[feature]`

## 2026-04-15

- **Docs · Widgets** (`/docs/widgets`) — Build and publish reusable chat and 3D widgets.
- **Widgets Gallery** (`/widgets`) — Pre-built chat, voice, and 3D-avatar widgets you can drop into any page.
- **3D model validation tools** — Model validation, inspection, and optimization APIs for GLB/FBX files — asset analysis and format conversion to guarantee avatar quality. `[feature, sdk]`
- **Wallet sign-in and on-chain identity** — Sign-In with Ethereum, wallet integration, and the ERC-8004 Passport widget — agents display cryptographic proof of identity tied to wallet ownership. `[feature, security]`

## 2026-04-14

- **Agent Home** (`/agent`) — Default landing for an agent instance — chat, embed, and remix actions.
- **Create account** (`/register`) — Create a new three.ws account.
- **Features** (`/features`) — Full feature overview of the three.ws platform: avatars, agents, on-chain identity, x402 payments, and embedding.
- **Forgot password** (`/forgot-password`) — Request a password-reset email.
- **robots.txt** (`/robots.txt`) — Crawler directives.
- **Sign in** (`/login`) — Sign in with email, GitHub, or a connected wallet.
