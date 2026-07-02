# Forge: the 3D generation engine behind three.ws

*Long-form X article. The complete story of Forge: why we built it, how the path and tier system works, the exact engines and prices, the free NVIDIA lane, auto-rigging, the constellation of surfaces built on it, the x402 and MCP paths for agents, examples, tutorials, and the honest limits. $THREE is the only coin.*

Every 3D asset you have ever seen in a game, a product page, or a virtual world was bought, commissioned, or built by hand in software with a learning curve measured in years. That is the wall between "I can describe it" and "I can have it." Forge removes the wall. Type a sentence, or drop in a photo, or scribble a sketch, and about a minute later you are orbiting a real, textured, downloadable 3D model in your browser. It is live at three.ws/forge, it needs no account, no wallet, and no key, and everything it makes can walk straight into the rest of the platform.

This is everything about it.

## Why we built it

Three reasons, in order of importance.

**First, three.ws is a 3D platform, and a 3D platform that cannot make 3D is a gallery.** Our agents are embodied. They have avatars, they stand in worlds, they hold wallets and trade. Every one of those bodies and every prop in every world is a mesh that had to come from somewhere. Buying assets does not scale and does not personalize. Generation does. Forge is the supply side of the entire platform: the engine that turns intent into geometry.

**Second, every text-to-3D product we evaluated was half a product.** Either a closed playground with no API, or a raw model endpoint that hands you an untextured mesh and leaves rigging, polygon budgets, provider failover, job polling, and billing as your problem. Forge is the whole pipeline done once: one call in, a durable hosted GLB out, with an optional second call that rigs it into an animation-ready humanoid. The hard parts, routing across engines, riding out provider outages, pricing tiers honestly, ship inside the endpoint instead of on your desk.

**Third, agents need to buy 3D the way they buy everything else on three.ws: per call, in USDC, with no signup.** A human can click through a UI. An autonomous agent cannot. So the same engine is exposed three ways: a free browser endpoint, a pay-per-call x402 twin, and an MCP server any assistant can drive as tools. The generation economy and the agent economy are the same economy.

## The system at a glance

Forge is one engine with many doors.

1. **The endpoint.** POST /api/forge accepts a prompt, one to four images, or a sketch plus a name. It returns a job id, and GET /api/forge?job=<id> polls it to a finished GLB URL. GET /api/forge?catalog returns the live tier, backend, and cost matrix, the single source of truth the UI renders.
2. **The router.** Every request resolves to a path (how geometry is produced) and a tier (how much budget to spend), then routes to the healthiest configured backend for that pair. Free lanes are preferred at every tier.
3. **The persistence layer.** Finished models are durable. Your creations strip on /forge survives the tab closing, and a community scope powers the public "Fresh from the Forge" showcase.
4. **The rigger.** POST /api/forge?action=rig takes any GLB URL and returns a job that resolves to a skinned, skeleton-bearing humanoid ready for the platform's animation runtime.
5. **The paid twins.** POST /api/x402/forge is the same engine for autonomous agents, one USDC payment per generation, cataloged in the x402 bazaar. /api/mcp-3d is the 3D Studio MCP server, the same engine as tools.
6. **The constellation.** Forge Studio, the NIM demo, the Spark pipeline viewer, prompt-to-avatar, scene capture, the splat viewer, Cosmos worlds, and Diorama all sit on this one engine or beside it. More on each below.

## Paths and tiers: the two axes, with the real numbers

Every generation request is described by two orthogonal choices, and both are public in the catalog.

**The path is how geometry gets made.** There are three, straight from the shipped registry:

- **image**, the default. Text is painted into a clean reference image first (FLUX, or Imagen where configured), then reconstructed into a mesh by TRELLIS or Hunyuan3D. Fast, and the free lane lives here. Photo input skips the painting step and reconstructs your real reference views directly.
- **geometry**. A native 3D model emits mesh geometry straight from the prompt or a single photo, with no synthesized intermediate view, so detail is not capped by what one image implies. This is the Meshy and Tripo lane, and it is bring-your-own-key: you supply your own provider key in the x-forge-provider-key header, or store it on your signed-in account. Without one, the endpoint returns a designed needs_key state instead of a crash.
- **sketch**. A drawing plus a prompt naming what it depicts drives TripoSG-scribble on our own GPU to raw geometry. No photo, no intermediate view, no textures. A doodle and the word "sword" become a sword.

**The tier is how much budget to spend.** Three tiers map to real polygon targets and real prices, defined once in the code and read everywhere else:

- **draft**: about 12,000 polygons, no PBR. Fast, made for blockout and iteration.
- **standard**: about 30,000 polygons, the default for most assets.
- **high**: about 200,000 polygons with PBR texturing, the visibly denser mesh.

On the browser endpoint, text prompts at draft and standard route to the free NVIDIA NIM TRELLIS lane and cost nothing: no key, no wallet, no card. When an agent pays per call through x402 instead, the tier prices are flat and quoted in 6-decimal USDC atomics: draft is $0.05, standard is $0.15, high is $0.50. The MCP server charges the identical numbers for its generation tools, because all three surfaces read the same constants. An agent pays the same regardless of transport, which is the only honest way to price one engine behind three doors.

Every job result reports the path, tier, and backend that actually produced it. You never wonder what you got.

## The free lane, and the machinery that protects it

The free lane is genuinely free, and the routing exists to keep it that way.

Every tier defaults to a zero-vendor-cost engine. Text prompts go to TRELLIS on NVIDIA NIM, one platform key, no per-call billing. Photo reconstruction prefers our own self-hosted TRELLIS worker, then a self-hosted Hunyuan3D lane, then the community GPU Spaces lane, which itself runs an automatic failover chain through Hunyuan3D 2.1, Hunyuan3D 2, TRELLIS, and TripoSR. Paid backends stay explicitly opt-in.

Free lanes degrade, so Forge treats lane health as a first-class signal. The hosted NVIDIA gateway can hang in a way where a submit neither completes nor returns a pollable id before our timeout, and without protection every subsequent text prompt would re-pay that full timeout before failing over. So the router runs a circuit breaker: a socket-level hang earns the free NIM lane a 120 second cooldown, while a fast gateway 5xx, a cold-start blip the in-provider retry already rode out, earns only 30 seconds, so one transient error never dumps every text prompt onto a paid lane for two minutes. A Retry-After hint on a 429 is honored within those bounds. The paid Replicate reconstruct lane gets its own cooldown when it fails on billing, five minutes, because an empty vendor account does not heal itself, and the router reads that flag so it never skips a live free lane in favor of a dead paid one.

There is one perk wired into the free lane, and it belongs to $THREE holders: presenting a verified tier pass lifts the free generation ceiling above the base 60 per hour by the tier's multiplier. The pass is verified with pure HMAC, no RPC call and no price feed, so it adds zero latency to the anonymous lane, and an absent or invalid pass simply leaves the multiplier at 1.

And one rule holds everywhere: no mock paths. If a selected backend is not configured, the endpoint returns a clean 503 or 501 and the page renders a designed state. Forge never fabricates a model.

## From object to character: the auto-rig

A textured mesh is a statue. The rig is what makes it a character.

POST /api/forge?action=rig with a glb_url returns a job that resolves to the same GLB with a skeleton and skin weights, produced by UniRig running in rerig mode, preferring our own GPU worker's rig endpoint and falling back to a hosted lane, so rigging works whenever any rig-capable lane exists. The rigged output surfaces exactly like a reconstruction: same job polling, same durable URL.

What makes this matter is what happens next. The three.ws animation runtime is universal: any humanoid rig, whatever its bone naming convention, gets canonicalized and driven by the platform's pre-baked clip library, idle, walk, emotes, legs included. So a Forge model that goes through the rigger does not just download; it performs. This is the exact pipeline behind the platform's avatars, and it is one flag away from any generation.

## The workbench around the mesh

Generation is the first stroke, not the last. A family of endpoints turns /forge into a workbench:

- **/api/forge-enhance** is the prompt director: it rewrites a terse description into the single-subject, centered, material-and-lighting-cued phrasing the FLUX-to-TRELLIS pipeline reconstructs cleanly, optionally through Nemotron, and returns a ready-made negative prompt for the providers that accept one.
- **The prompt studio** on the page itself carries a curated starter library behind "Surprise me," a live coach that grades what you typed against how the model actually reconstructs, and an honest character counter. TRELLIS truncates prompts at 77 characters, so the pipeline shapes what you send: an already styled prompt passes through, anything else gets a studio lighting cue appended inside the window.
- **Stylize, remesh, segment, and background removal** operate on finished models, and **game-ready export** repacks a creation for engine use at a flat $0.10.
- **The gallery** makes creations durable per browser via an x-forge-client identity, and the community scope publishes the newest finished models with nothing identifying attached. Share links and an AR view round it out.

Small technical honesty, everywhere: the reconstruction runs TRELLIS at CFG 5.0 on the structured latent stage instead of the smooth-and-cartoonish 3.0 default, because faithful texture beats pretty blur, and the high tier runs 50 sampling steps where standard runs 15.

## The constellation: eight surfaces on one engine

**three.ws/forge** is the flagship: prompt, photos, or sketch in, textured GLB out, with an engine picker that shows live health per lane.

**three.ws/forge-studio** is one canvas for both pipelines: forge a textured object in the Object tab, or describe a character in the Avatar tab and get a rigged, animation-ready humanoid. Its Lab goes further and converts meshes into Gaussian splats.

**three.ws/forge-spark** is the pipeline made visible: Nemotron sharpens your prompt, FLUX paints the clean reference, TRELLIS reconstructs the mesh, and the page lights up each stage as it happens. It is the best sixty-second education in how modern text-to-3D actually works.

**three.ws/forge-nim** is for the self-hosters: it drives a self-hosted TRELLIS NIM container directly through its real wire contract, one POST to /v1/infer, and the textured GLB comes back synchronously as base64 and renders on the spot. The page can point at your own box, with the override SSRF-guarded so it can never probe a private network.

**three.ws/create/prompt** is the avatar door: type a description and about a minute later you have a rigged 3D avatar. Under the hood the prompt becomes a frontal reference image via FLUX, then runs the identical reconstruct-and-auto-rig pipeline the selfie-to-avatar flow uses.

**three.ws/capture** leaves objects behind and reconstructs spaces: a phone video of any room becomes an explorable colored point cloud, built by a streaming feed-forward reconstruction model on GPU workers and rendered live in the browser with WebGL. You control frame rate, sky masking, confidence filtering, and point budget.

**three.ws/splat** renders the photoreal end of the spectrum: Gaussian-splat and radiance-field avatars, loaded from a .ply, .splat, or .ksplat by URL or upload, decoded entirely client-side.

**three.ws/cosmos** animates the backdrop: type a world and NVIDIA's Cosmos Text2World model renders a short photoreal video that plays behind your live 3D avatar, generated on the async NVCF gateway and persisted to durable storage.

And **three.ws/diorama** composes them into places: one sentence is decomposed by the platform's LLM chain into a placed plan, a mood, a palette, an island shape, and a handful of single-object prompts, and every object is forged on the free draft lane, a few at a time, so the little world materializes progressively. A failed object never sinks the world; partial worlds are real and shareable, and you can take them into AR.

## Where forged models go

This is where the engine earns its keep, because a GLB on three.ws is never a dead file.

A rigged Forge avatar becomes an agent's body, drops into the animation runtime, and walks the /play coin worlds, the Agora, and every embed surface. Diorama assembles forged objects into explorable scenes. The Studio Lab turns meshes into splats for the photoreal viewer. The gallery feeds the community showcase on the Forge page itself. The @three-ws/avatar viewer renders any forged GLB on any website with one custom element, and @three-ws/walk turns a rigged one into a page companion. One generation, an entire platform of destinations.

Four people, one engine. A game developer batch-generates an asset pack from a prompt list against the public API and pays nothing on the free lane. An agent owner types two sentences into /create/prompt and gets a body for the agent that will trade under its own name an hour later. A 3D artist uses the sketch path as a concepting tool, a drawing and a noun into raw geometry in a minute. And an autonomous agent with a USDC balance and no human in the loop pays five cents through x402 and receives the same GLB the browser users get.

## For developers: the API, the SDK, x402, and MCP

Everything below is live now. The browser endpoint needs no key.

**Plain HTTP, any language:**

```bash
curl -s -X POST https://three.ws/api/forge \
  -H 'content-type: application/json' \
  -d '{"prompt": "a brass clockwork owl, polished metal", "tier": "standard"}'
```

Then poll the returned job id until it is done:

```js
const submit = await fetch('https://three.ws/api/forge', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ prompt: 'a brass clockwork owl, polished metal' }),
}).then((r) => r.json());

let job = submit;
while (job.status !== 'done') {
  await new Promise((r) => setTimeout(r, 4000));
  job = await fetch(`https://three.ws/api/forge?job=${submit.job_id}`).then((r) => r.json());
}
console.log(job.glb_url);
```

**The SDK** wraps the submit-and-poll dance in one call. It is zero-dependency and runs in Node 18+ and the browser:

```js
import { forge, rig } from '@three-ws/forge';

const model = await forge('a cartoon astronaut, full body, T-pose', { tier: 'standard' });
const rigged = await rig(model.glbUrl);
console.log(rigged.glbUrl);
```

Failures reject with a typed ForgeError carrying a code you can branch on: needs_key, backend_unavailable, payment_required, rate_limited, generation_failed. Every one maps to a designed state, and catalog() fetches the live price and ETA matrix so you render a picker instead of hardcoding numbers.

**The x402 path** is for agents that settle in USDC with no account. GET /api/x402/forge with no payment returns the price catalog; POST with a payment buys one generation at the quoted tier price. The ordering is the trustworthy part: the job is submitted after the payment verifies but before it settles, so if the submit fails, settlement never runs and the buyer is never charged. Pair it with @three-ws/x402-fetch to automate the 402 handshake.

**The MCP path** turns the engine into tools. The 3D Studio MCP server at /api/mcp-3d speaks Streamable HTTP, is registered in the MCP Registry as io.github.nirholas/three-ws-3d-studio, and exposes text_to_3d and image_to_3d priced by tier, auto_rig_model and capture_scene and retexture at $0.05, stylize and remesh and segment at $0.02, and background removal, posing, animation, and material generation at $0.01, with read-only tools free. OAuth-authenticated three.ws users run operator-funded; x402 callers pay per tool, and the charge lands only after the work succeeded. There is even a public forge_free tool so a wallet-less agent can still generate.

The full tutorials live in the docs: text-to-3d and image-to-3d for the browser flows, prompts-for-3d for the prompt cookbook, and generate-3d-api for scripting, including the batch asset-pack pattern.

## Three tutorials in one place

**Your first model in a minute.** Open three.ws/forge. Type one isolated subject with a material and a lighting cue: "a low-poly red fox, sitting, soft studio light." Hit generate, watch the job run, orbit the result, download the GLB. No account existed at any point in that sentence.

**Photo to object.** Put a real thing on a table. Photograph it from the front, back, and sides, one to four shots. Drop them into /forge and add a short prompt naming the object. The reconstruction lane fuses your views into a textured mesh. Products, toys, sculptures, sneakers.

**Description to living character.** Open three.ws/create/prompt and describe a person or creature in two sentences. About a minute later a rigged avatar is idling in the preview. Open it in the editor, run the walk clip, then attach it to an agent at /create and watch your description hold a wallet.

## The honest limits

Forge publishes its trade-offs instead of hiding them. The image path is capped by what a single synthesized view implies, which is exactly why the geometry path exists, and that path is bring-your-own-key by design: we route to premium vendors, we do not silently absorb their bills. The free community GPU lane has queue waits that vary with the crowd. TRELLIS reads only 77 characters of prompt, so a paragraph buys you nothing over a sharp sentence. Sketch output is untextured geometry, honestly labeled. Auto-rigging expects a humanoid silhouette, and a mesh that genuinely cannot be skeleton-driven falls back to a default rig rather than shipping a broken T-pose. Free lanes go down, and the answer is cooldowns and failover, never a fabricated result. And when an upstream fails on the paid path, you are not charged, because a 503 before settlement is the only acceptable failure mode for a machine that sells to other machines.

## Where to start

The flagship: three.ws/forge. Both pipelines on one canvas: three.ws/forge-studio. The pipeline, made visible: three.ws/forge-spark. Description to rigged avatar: three.ws/create/prompt. A room into a point cloud: three.ws/capture. Photoreal splats: three.ws/splat. Living backdrops: three.ws/cosmos. A sentence into a world: three.ws/diorama. The SDK: npm install @three-ws/forge.

Describe the thing. The platform will build it, rig it, and give it somewhere to live. Forge is live now.
