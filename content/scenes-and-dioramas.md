# Scenes and dioramas: speak a world into being on three.ws

*Long-form X article. The complete story of 3D scenes on three.ws: the one-sentence diorama pipeline, the full Scene Studio editor, the Scene Composer, Cosmos living worlds, the Loom community gallery and its remix economy, the MCP servers that let any AI assistant build worlds, developer endpoints with runnable code, tutorials, and the honest limits. $THREE is the only coin.*

Every 3D tool ever shipped makes you earn the world. You learn the viewport, the gizmos, what a normal map is, and three hours later you have a gray cube on a gray plane. The distance between "I can picture it" and "I can orbit it" has always been measured in tutorials.

On three.ws that distance is one sentence. Type "a cozy autumn campsite by a lake at dusk" at three.ws/diorama and watch: an island rises, a dusk sky fades in, six luminous seeds appear where a tent, a campfire, a canoe, and three pines are about to exist, and then, one by one, real 3D meshes flare into place as they finish forging. Two minutes later you have an explorable world with a permalink, a public gallery slot, an AR button, and a download. Nothing was pre-made. Every object was generated for your sentence.

That is the headline act of a full scene stack: a professional in-browser editor, a real-time composer wired to your avatar's skeleton, an AI video lane that renders living backdrops, a community gallery with remix lineage, and two MCP servers that put all of it inside any AI assistant. This is everything about it.

## Why we built it

Three reasons, in order of importance.

**First, worlds are the natural next step after characters.** three.ws started as the place where a text prompt becomes a rigged, animated 3D avatar. But an avatar standing in a void is half a product. Characters need somewhere to be: a stage, a room, a campsite, a lighthouse cliff. Once the forge could produce any single object from text, the missing piece was composition, deciding what belongs in the world and where it goes. That is a language problem, and language problems are what the platform's LLM chain is for.

**Second, the gap between "generate an object" and "build a scene" was where everyone gave up.** Watching people use the forge at three.ws/forge told us the pattern: generate a great model, orbit it, share it, stop. Assembling several models into a composed scene meant a jump to desktop software. So we closed the gap at both ends. At the effortless end, the diorama pipeline does the whole composition for you. At the professional end, Scene Studio puts a complete scene editor, the vendored three.js editor itself, behind the three.ws nav with zero install.

**Third, scenes multiply everything else on the platform.** A forged object becomes set dressing. A posed avatar animation becomes a scene track. A scene becomes an AR object in your room, an embeddable iframe, a gallery card, a remixable community asset with provenance. Every surface described below consumes or feeds the others, and the same forge lane powers all of them. We did not build a feature. We built the spatial layer of the platform.

## The system at a glance

Five surfaces, one pipeline underneath.

1. **Diorama** at three.ws/diorama: one sentence becomes an explorable miniature world. The backend composes a placed plan, the browser forges every object into a real GLB, the renderer materializes them live, and a save mints a permalink and a gallery slot.
2. **Scene Studio** at three.ws/scene: the full three.js editor (r184, MIT, vendored in-repo) mounted under the site nav. Import GLBs, arrange with transform gizmos, edit materials and lights, keyframe animation, export the whole scene as one file.
3. **Scene Composer** at three.ws/compose: a real-time multi-object composer built for avatars. Forge items from text and attach them to your avatar's skeleton bones, arrange and scale freely, then export the creation or save it as an outfit.
4. **Cosmos** at three.ws/cosmos: type a world and NVIDIA's Cosmos Text2World model renders a short photoreal video that plays as a living backdrop behind your 3D avatar.
5. **Loom**, the community gallery: every forged creation can be published to a public, world-readable feed with an orbit-and-AR viewer URL, an embed snippet, and, through the creations overlay, remix lineage and creator rankings.

And because agents matter as much as browsers here, the whole diorama pipeline and the whole Loom gallery are exposed as MCP servers: `@three-ws/scene-mcp` and `@three-ws/loom-mcp`, both keyless, both on npm.

## The diorama pipeline, with the real mechanics

A diorama goes from sentence to world in two acts, and every constant below is from the shipped code.

**Act one: compose.** `POST /api/diorama {action:"compose", prompt}` hands your sentence to the platform's LLM chain with a system prompt that casts the model as a 3D set designer. It must return exactly one JSON object: a two-to-four word title, a mood (dawn, day, dusk, or night), a ground type (grass, sand, snow, stone, water, meadow, or void), an island shape (round, craggy, or plateau), a four-part color palette (a two-stop vertical sky gradient, a ground tint, a fog color, and an accent glow), and three to eight placed objects. Each object is a single-object forge prompt, subject plus dominant material plus color in at most twelve words, never a scene, never an "and", with an explicit position on the island, a scale, and a yaw.

The composer's output is treated as hostile input. A balanced-brace parser extracts the JSON even if the model wrapped it in prose or a code fence. A normalizer clamps every number: positions are projected back inside the 6.2 meter island radius, scale is clamped to a 0.2 to 4 range, invalid hex colors fall back to a per-mood default palette. And a declumping pass guards against the classic failure where the model stacks everything at the origin: if any two objects sit closer than 1.4 meters, all of them are re-seated on a phyllotaxis spiral, the golden-angle arrangement sunflowers use, so the world always reads as a composed scene, never a pile. The plan comes back with every object pending and no meshes. If the LLM chain is unreachable, the route returns a clean 503 and the page renders a designed retry state. It never fabricates a world.

**Act two: forge.** The browser now turns each object's prompt into a real mesh on the platform's free text-to-3D lane: `POST /api/forge {prompt, tier:"draft", path:"image"}`, which runs text to image to mesh through FLUX and TRELLIS. Forges run three at a time, each job is polled every 2.5 seconds, and each object gets a three minute deadline before it is marked failed. The crucial design decision: a failed object never sinks the world. Partial worlds are real and shareable, and any failed object can be retried in place with one click.

**The renderer** is where the pipeline becomes theater. It builds the island from deterministic value noise (no dependency, seeded, so the same world always looks the same), paints the sky dome with the palette's gradient, and drives sun elevation, ambient light, and fog density from per-mood presets so a night world is actually lit like night. Every not-yet-forged object appears as a luminous seed at its planned position. When a mesh arrives, it is normalized to a roughly 1.4 meter footprint so a handful of objects read as a cohesive miniature, then materialized with a 700 millisecond flare-and-rise animation. Draco-compressed GLBs decode through the same local decoder path every loader on the platform uses, and the whole show respects prefers-reduced-motion.

**Save and share.** `POST /api/diorama {action:"save", diorama}` persists a forged world and returns a permalink of the form `https://three.ws/diorama?id=<uuid>`. Opening that link loads the world read-only, bumps a view counter, and offers a remix, which drops the original sentence back into the prompt box so anyone can fork the idea. The public gallery (`GET /api/diorama?list=recent`) renders each card as live geometry: the thumbnail is the world's first forged GLB in a lazy-loaded model viewer, auto-rotating at 18 degrees per second. Never a screenshot. And once at least one mesh exists, the world grows two more exits: a download of the GLB, and a "view in your room" button that hands the mesh to an AR-enabled viewer and triggers a native AR session, the same handoff the forge page uses.

Compose is a paid LLM completion, so it is rate limited per IP and behind a global hourly circuit breaker; saves are rate limited per IP so one caller cannot carpet the gallery. Boundaries are defended, the middle trusts itself.

## Scene Studio: the full editor, zero install

three.ws/scene is not a toy inspired by an editor. It is the editor: the mrdoob/three.js editor at r184, MIT licensed, vendored in-repo with its license preserved, and mounted into the three.ws chrome. Five regions do all the work: a menubar with every command, a toolbar for the move, rotate, and scale gizmos, the live viewport, a sidebar with the scene outliner and per-selection property panels (object, geometry, material for meshes; light controls for lights), and a resizable keyframe animation timeline along the bottom.

Two behaviors matter most in practice. First, it autosaves: every add, move, material edit, or delete is written to your browser's local storage about a second later and restored when you return, so a closed tab costs you nothing. It is local, not account-synced, which is why exporting matters. Second, it exports for real: the whole scene, every object, material, and embedded texture, leaves as a single self-contained GLB or glTF you can re-import, hand to another tool, or view in AR. Project state can also be saved as editor JSON for full-fidelity round trips.

Scene Studio is also the landing pad for the rest of the platform. Finish a generation at three.ws/forge and "Open in Scene Studio" loads the model straight into the viewport via a query parameter. Bake a posed animation in the Animation Studio at three.ws/pose and it hands the result to /scene through a one-shot IndexedDB handoff, because a rigged GLB with an embedded clip can run to several megabytes, which no URL can carry; the payload is taken exactly once and goes stale after five minutes so an abandoned session never surprise-loads into a fresh visit. The step-by-step walkthrough, from first import to exported scene, lives at three.ws/tutorials/build-a-scene.

## Scene Composer: scenes that know about skeletons

three.ws/compose is the middle path: lighter than the Studio, smarter about avatars. It is a real-time multi-object composer where the "add" button is the forge itself: describe an item, it generates, it lands in your scene. The part no generic editor has: forged items can attach to your avatar's skeleton bones, grouped by body region (head, torso, left and right arms, left and right legs), so a sword sits in a hand and a helmet sits on a head, and the assembly can be saved as an outfit or exported as a creation.

It behaves like a serious tool: a 50-deep undo and redo stack, duplicate with Ctrl+D, frame the selection with F, world or local transform space on X, grid snapping at 0.25 units on Ctrl+G, six camera presets, double-click renaming in the hierarchy, a live triangle and object count, screenshot export on Ctrl+P, and disciplined disposal of geometry, materials, and textures on remove so long sessions never leak memory.

## Cosmos: worlds that move

Dioramas and scenes are geometry. Cosmos at three.ws/cosmos is atmosphere: type a world, "a neon street in the rain at night, reflections on the pavement", and NVIDIA's Cosmos Text2World model renders roughly five seconds of photoreal 1280 by 704 video at 24 frames per second, which the page plays full-bleed behind a transparent live 3D avatar viewer. Pick a bundled avatar or bring your own, and your character stands inside a living, moving world.

The plumbing is honest end to end. `POST /api/cosmos {prompt}` submits the job to NVIDIA's NVCF async gateway and returns the request id as the job id; there is no server-side job store because the NVCF id is itself the durable handle, exactly like the TRELLIS text-to-3D lane. The page polls, and on completion the MP4 is persisted to R2 storage for a durable URL you can download or copy. On the shared free tier a render typically lands in 60 to 120 seconds, so the API surfaces an honest 90 second ETA and the loading state is driven by the real poll lifecycle, never a fake progress bar. If the NVIDIA key is absent, the lane reports itself unconfigured with a 503 and the page degrades to a designed static backdrop.

## Loom: the gallery, and the remix economy on top of it

Everything forged on three.ws can be published to Loom, the community 3D-creation gallery. A creation is minimal by design: a GLB URL, its prompt, and free-text attribution. The feed at `/api/loom` is public and world-readable, newest first, capped at 2,000 entries, paginated by a millisecond-epoch cursor. Anyone can read it. Anyone can contribute, no account, no key, no signer, gated server-side by an IP rate limit of about 20 submissions per hour plus strict input sanitization.

Because the feed is world-readable, the model URL is the attack surface, so it is allowlisted hard: a submitted GLB must live on three.ws, Cloudflare R2, Replicate's delivery CDN, or raw GitHub content, enforced server-side. Re-submitting the same GLB URL returns the existing creation instead of duplicating it. Every read returns not just the raw GLB but a ready-to-use viewer URL (the /forge/embed orbit-and-AR viewer), a social card image, and a paste-ready iframe snippet, so a creation is embeddable anywhere the moment it exists.

Layered on top, and never forking it, sits the creations overlay at `/api/creations`: the creator-facing economy Loom deliberately omits. It adds gallery metadata (title, tags, license, type and style), remix lineage as explicit parent-to-child edges with full ancestry and descendants, per-creator aggregates (creation count, remixes earned, follows), trending ranked by remixes, and an append-only provenance trail per creation. It imports Loom's storage and validators directly, so a publish writes one canonical record to the one feed every surface reads. One source of truth, two altitudes of product.

## How scenes connect to agents and the forge

The scene stack is not a silo; it is wired into the agent platform at every seam.

**Agents can edit their own scenes.** Every three.ws agent ships with registered scene-manipulation skills: ask an agent in its viewer to "create a red sphere above your head" and the scene-create-object skill builds the mesh in its Three.js scene, positions it, plays a conjuring gesture animation, and says what it is doing. The skills are MCP-exposed, so an external assistant driving the agent gets the same powers.

**The forge is the single generation engine.** Dioramas forge on it, the Scene Composer forges on it, the /forge page forges on it, and all of them share its tier and path system: draft, standard, and high polygon budgets; an image-intermediate path (FLUX plus TRELLIS, the fast free default), a geometry-first path with a higher geometric ceiling (bring your own provider key), and a sketch path that turns a drawing plus a label into geometry. The forge also auto-rigs: `POST /api/forge?action=rig {glb_url}` turns a static humanoid mesh into an animatable one, which is how a scene prop pipeline and an avatar pipeline stay one system.

**Scenes travel to wherever agents live.** The /artifact viewer renders a three.ws agent as a standalone app inside Claude Artifacts, loading Three.js from a CDN the artifact sandbox allows, so an agent and its scene can be embedded in a conversation. The /avatar-artifact route is the standalone shareable viewer for a single avatar artifact with no wrapper page. And every Loom creation's embed snippet drops a live, orbitable model into any page on the web.

## For developers: endpoints and runnable code

Everything below is live now. No key is required for any of it.

**Compose a world from the command line:**

```
curl -s -X POST https://three.ws/api/diorama \
  -H 'content-type: application/json' \
  -d '{"action":"compose","prompt":"a lonely lighthouse on a stormy cliff at dusk"}'
```

You get back the full placed plan: title, mood, palette, ground, island, and every object with its forge prompt, position, scale, and rotation, all status pending.

**Build the whole pipeline yourself in JavaScript**, compose, forge, save, share:

```js
const BASE = 'https://three.ws';

async function forgeOne(prompt) {
  const res = await fetch(`${BASE}/api/forge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, tier: 'draft', path: 'image' }),
  });
  let job = await res.json();
  while (job.status !== 'done' && job.status !== 'failed') {
    await new Promise((r) => setTimeout(r, 2500));
    job = await fetch(`${BASE}/api/forge?job=${job.job_id}`).then((r) => r.json());
  }
  return job.status === 'done' ? job.glb_url : null;
}

async function speakWorld(sentence) {
  const { diorama } = await fetch(`${BASE}/api/diorama`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'compose', prompt: sentence }),
  }).then((r) => r.json());

  for (const obj of diorama.objects) {
    const glbUrl = await forgeOne(obj.prompt);
    obj.status = glbUrl ? 'ready' : 'failed';
    obj.glbUrl = glbUrl;
    console.log(`${obj.label}: ${obj.status}`);
  }

  const saved = await fetch(`${BASE}/api/diorama`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'save', diorama }),
  }).then((r) => r.json());

  console.log('world:', saved.url);
}

speakWorld('a tiny ramen stand under a paper lantern in the snow');
```

That is the entire product in forty lines, against the same public endpoints the page uses.

**Read the galleries:**

```
GET https://three.ws/api/diorama?list=recent&limit=24
GET https://three.ws/api/diorama?id=<uuid>
GET https://three.ws/api/loom?limit=60
GET https://three.ws/api/creations?view=trending
```

**Publish to Loom:**

```
curl -s -X POST https://three.ws/api/loom \
  -H 'content-type: application/json' \
  -d '{"prompt":"a glowing crystal totem, low poly","glbUrl":"https://three.ws/demo/crystal.glb","author":"nova"}'
```

The response includes the viewer URL and the iframe snippet, ready to embed.

**Through MCP.** Give any MCP-capable assistant the scene stack with two entries in its config:

```json
{
  "mcpServers": {
    "scene": { "command": "npx", "args": ["-y", "@three-ws/scene-mcp"] },
    "loom": { "command": "npx", "args": ["-y", "@three-ws/loom-mcp"] }
  }
}
```

`scene` exposes compose_scene (one sentence to a placed plan), get_scene, and list_scenes. `loom` exposes get_loom_feed, get_creation, and submit_creation. No API key, no signer, no payment; every call hits the public endpoints above. The MCP reference lives at three.ws/docs/mcp-scenes.

## Three tutorials in one place

**Speak a world in two minutes.** Open three.ws/diorama. Type one concrete sentence; concrete beats poetic, "a red rowboat tied to a wooden dock at dawn" forges better than "nostalgia." Watch the plan land, the seeds appear, and the meshes materialize. If one object fails, retry just that object. Save, and you have a permalink, a gallery card, an AR button, and a download.

**Build a scene by hand.** Generate a model or two at three.ws/forge, open three.ws/scene, and import them. Arrange with the move, rotate, and scale gizmos, edit materials in the sidebar, add lights, set a background, and export one self-contained GLB. The full guided version of this, every step with the reasoning, is the tutorial at three.ws/tutorials/build-a-scene.

**Let your assistant do it.** Add `@three-ws/scene-mcp` to your MCP config and ask your assistant for "a desert oasis with three palm trees and a stone well." It calls compose_scene and gets the placed plan; forge each object at /api/forge, save at /api/diorama, and post the finished GLB to Loom with `@three-ws/loom-mcp` so the whole platform can see it and anyone can remix it.

## The honest limits

The scene stack publishes its trade-offs, so here they are. Dioramas are miniatures by design: three to eight objects on a 6.2 meter island, because each object is one real generation job and the caps keep a world to a bounded cost and render budget. Draft-tier forging optimizes for speed, and a small fraction of objects fail or come out lumpy; the pipeline ships partial worlds and one-click retries rather than pretending otherwise. Composition quality tracks the sentence: vague prompts produce vague plans, and the composer will tell you to try a more concrete sentence rather than invent one. Scene Studio autosaves locally, not to an account, so an unexported scene lives and dies with that browser. Cosmos renders about five seconds of video in one to two minutes on the free tier: a living backdrop, not a game world. Loom attribution is free text, not authenticated identity; the creations overlay's provenance trail is where lineage actually lives. And when any lane's upstream is unconfigured or down, you get a designed 503 state, never a fabricated result.

## Why it compounds

Every surface feeds the next. A forge improvement makes every diorama object, every Composer item, and every Loom submission better at once. Every saved world seeds the gallery that inspires the next sentence. Every remix adds an edge to the lineage graph that makes discovery smarter. Every MCP call turns someone's assistant into a world-builder that publishes back into the commons. The platform's characters get places to be, the places get characters, and one generation engine underneath gets better for all of it.

## Where to start

Speak a world: three.ws/diorama. Edit like a professional: three.ws/scene. Compose onto your avatar: three.ws/compose. Put your character in a living world: three.ws/cosmos. Generate the raw material: three.ws/forge. The guided build: three.ws/tutorials/build-a-scene. The MCP reference: three.ws/docs/mcp-scenes.

One sentence is the whole barrier to entry now. Say the world and watch it assemble.
