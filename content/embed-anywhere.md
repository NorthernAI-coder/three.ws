# Embed anywhere: a three.ws agent on every page of the web

*Long-form X article. The complete story of the embed layer: why we built it, the one line that puts a living 3D agent on any page, the agent-3d web component, the page agent that narrates your site out loud, Widget Studio and the widget gallery, the host protocol that lets whole platforms talk to embedded agents, the Claude artifact path, real code, tutorials, and the honest limits. $THREE is the only coin.*

Every platform that hosts AI agents keeps them in a walled garden. The agent lives on their domain, in their chrome, behind their login. Your website gets, at best, a chat bubble that links out. We think an agent you built should go where your audience already is: your landing page, your docs, your Shopify store, a Notion page, a post on X, even inside another AI's artifact sandbox.

So we built the embed layer of three.ws around one promise: any agent, any page, one line. The floor is a single script tag that drops a rigged, talking 3D character onto a plain HTML file. The ceiling is a versioned postMessage protocol that lets a platform like Claude.ai hold a structured conversation with an embedded agent it did not build. Everything in between, the web component, the page narrator, the widget builder, the iframe routes, the oEmbed unfurls, is the same stack at different levels of control.

This is everything about it.

## Why we built it

**First, distribution is the product.** A 3D agent that only exists at three.ws/agent/yourid is a demo. The same agent greeting visitors on your own domain is a feature of your business. Agents on this platform hold identities, wallets, skills, and memories; all of that is wasted if the only way to meet one is to visit us. The embed layer turns every agent into something you ship, not something you link to.

**Second, one line had to be enough.** We studied how the best embeddable things on the web won: they made the first success take under a minute. The entire install for a three.ws embed is a script tag with a data attribute. No npm, no build step, no framework adapter, no API key on the page. The bundle brings its own copy of Three.js, the glTF loader, the chat UI, and the speech subsystem. If the floor is not that low, nobody climbs to the ceiling.

**Third, embeds need a contract, not a hack.** Most widget embeds are a pile of undocumented postMessage strings. Ours are governed by two written specs that live in the repo: specs/EMBED_SPEC.md defines the web component itself, its attributes, events, JS API, and security model, and specs/EMBED_HOST_PROTOCOL.md defines a versioned envelope for host platforms. When Claude.ai or LobeHub frames one of our agents, both sides know exactly what a message looks like, what happens to unknown types, and which origin is allowed to say what. Contracts are how embeds survive upgrades.

## The system at a glance

Five surfaces, one stack. Pick by how much control you want.

1. **The one-line script tag.** `<script src="https://three.ws/cdn/agent-3d.js" data-agent-id="...">` mounts a floating agent in the corner of any page. It is the script-tag form of the web component below; data attributes on the tag become attributes on the mounted element.
2. **The agent-3d web component.** A standards-based custom element for pages you control. Full attribute surface, DOM events, a JS API, slots, shadow DOM. Works in plain HTML, React, Vue, Svelte, WordPress, Webflow, Shopify.
3. **The page agent.** `@three-ws/page-agent` on npm: a rigged, lipsync-capable 3D guide that docks in a corner, narrates your page out loud with browser speech synthesis, and lets each visitor pick their guide from a roster of nine rigged avatars. Fully client side, no backend, no key.
4. **Widgets.** Widget Studio at three.ws/studio is a no-code builder: pick an avatar, pick a widget type, brand it, and copy an iframe or script snippet. The gallery at three.ws/widgets shows fifteen live embeddable widgets with copy-paste code. Every widget iframe also speaks JSON-RPC 2.0 over postMessage, so a host page can drive the camera, play clips, or capture screenshots.
5. **Zero-code sharing.** Paste an agent or widget URL into Notion, Substack, Ghost, WordPress, X, Discord, or Farcaster and the platform unfurls it through Open Graph tags and the oEmbed endpoints. For Claude.ai, a dedicated artifact endpoint returns a single self-contained HTML document that runs inside the artifact sandbox with zero external requests.

## The web component, from the spec

The `<agent-3d>` element is the center of gravity. The full install:

```html
<script type="module" src="https://three.ws/agent-3d/1.5.2/agent-3d.js"
        crossorigin="anonymous"></script>

<agent-3d src="agent://base/42" style="width:400px;height:500px;display:block"></agent-3d>
```

**Sourcing an agent.** The element accepts several source forms, resolved in a strict priority order: `src` (an on-chain URI like `agent://base/42`), then `agent-id` (a numeric token ID paired with `chain-id`, a CAIP-10 string, or a legacy backend ID), then `manifest` (an IPFS or HTTPS manifest URL), then `body` (a bare GLB). The last form matters more than it looks: `body="/avatars/guide.glb"` plus inline `name`, `instructions`, and `brain` attributes creates a complete ad-hoc agent from nothing but a model file and a system prompt. No account required.

**Bare by default.** A plain `<agent-3d>` renders just the avatar: a transparent 3D canvas with no chat log, no input bar, no nameplate. The conversational chrome is opt-in through the `chat` attribute, and a bound `agent-id` or `manifest` implies it, because a published agent carries a brain and persona. The `kiosk` attribute forces bare even for a bound agent, which is how you render a published agent as pure decoration.

**Four layout modes**, one runtime: `inline` flows with the document, `floating` is a fixed bubble with a minimize-to-pill control and a `position` attribute (`bottom-right`, `bottom-left`, `top-right`, `top-left`, `bottom-center`), `section` fills a hero container, and `fullscreen` takes over the viewport behind a programmatic `openFullscreen()` call.

**Lazy by design.** The element does nothing until it intersects the viewport, via IntersectionObserver, unless you add `eager`. The render loop pauses when the element scrolls fully off screen. The mic and the LLM stream suspend when the tab is hidden. Each element owns at most one WebGL context, and for multiple agents there is `<agent-stage>`, which renders several `<agent-3d>` children in a single shared context. The runnable demo of that is examples/two-agents.html in the repo: two agents, one canvas, with `stage:agent-joined` and `stage:message` events flowing to the page.

**Embodied chat.** When chat is on, the avatar is a participant, not a mascot. It walks in place while the model is thinking or streaming, shows the live token stream in a thought bubble above its head, and returns to idle when the response completes. Set `avatar-chat="off"` to restore a conventional bottom-bar layout.

**Events are the integration surface.** Everything the agent does is a DOM event that bubbles out of the shadow root with `composed: true`: `agent:ready`, `agent:load-progress`, `agent:error`, `brain:message`, `brain:thinking`, `voice:speech-start`, `voice:speech-end`, `voice:transcript`, `skill:loaded`, `skill:tool-called`, `memory:write`, `chain:resolved`. And the imperative API mirrors the tools the LLM itself has:

```js
const el = document.querySelector('agent-3d');

await el.say('Hello');
const reply = await el.ask('What can you help me with?');

await el.wave({ style: 'enthusiastic' });
await el.lookAt('user');
await el.play('clip-name');

await el.installSkill('ipfs://bafy.../dance/');
el.memory.write('feedback_tone', { formal: false });

el.setMode('floating');
el.setPosition('bottom-right', '24px 24px');
```

**Keys never touch the page.** The `api-key` attribute exists for local development only; the documented production path is `key-proxy`, a URL to your own backend that injects credentials into outbound LLM requests. The bundle itself is served from versioned CDN channels: pin `/agent-3d/1.5.2/agent-3d.js` with subresource integrity for production (the current SRI hash for each release lives at `/agent-3d/<version>/integrity.json`), or follow `/agent-3d/1.5/` and `/agent-3d/1/` for automatic patch and minor updates. A UMD build, `agent-3d.umd.cjs`, ships at the same paths for non-ESM environments, and every bundle response carries permissive CORS headers so it loads from any origin.

**Progressive enhancement is built in.** Children of the element render when JavaScript is blocked, so a poster image inside the tag is the no-JS fallback. Slots (`poster`, `error`, `ar-button`, `chat`) let you replace specific chrome regions with your own markup without forking anything.

## The host protocol: how platforms talk to embeds

The iframe routes are where the contract earns its keep. Every embedded agent iframe speaks a simple message bridge, and structured hosts get a versioned envelope on top.

**The simple bridge.** Frame `https://three.ws/agent/{agent-id}/embed` and every message in either direction carries the `agentId`, so a host page running multiple agent iframes routes deterministically. The host sends `agent:hello`, `agent:action` (for example `{ type: 'speak', text: 'Hello!' }`), and `agent:ping`. The iframe answers with `agent:ready` (including a `capabilities` array), mirrors every action it performs as `agent:action`, reports its preferred height with `agent:resize`, and answers probes with `agent:pong`.

**The versioned envelope.** Platforms like Claude.ai and LobeHub use EMBED_HOST_PROTOCOL v1, where every message is `{ v: 1, type, id?, payload }` and `type` is direction-namespaced: `host.hello`, `host.chat.message`, `host.action`, `host.theme`, `host.response` flowing in; `embed.ready`, `embed.event`, `embed.error`, `embed.request` flowing out. Request and response pairs correlate by `id` with a 5000 ms default timeout. Unknown types are silently ignored by rule, which is what lets us add capabilities, like the five delegation messages that shipped in embed spec v0.2, without breaking a single existing host.

**Origins are never wildcards.** The bridge enforces strict origin checks on every message. On the host side, `Agent3D.connect(iframe)` derives the target origin from the iframe src and throws if it cannot. On the embed side, the iframe seeds its parent origin from the referrer, then locks it to the origin of the first authenticated host message; anything arriving from a different origin afterward is dropped.

**Owners control where their agent appears.** Every agent has an embed policy: `open` by default (on-chain identity is public, so anyone can embed any agent unless the owner says otherwise), or `allowlist` and `denylist` with wildcard subdomain patterns. A blocked iframe posts `agent:blocked` to its parent and shows a link to the agent on three.ws instead of rendering. Policy is set in the dashboard or via `PUT /api/agents/{id}/embed-policy`.

## The page agent: a guide that reads your site aloud

`@three-ws/page-agent` is a different animal from the chat embed. It is a narrator: a rigged 3D character that docks in a corner, greets the visitor, and talks them through the page, section by section, with its mouth actually moving to the words.

```html
<script src="https://unpkg.com/@three-ws/page-agent/dist/page-agent.global.js"
        data-page-agent
        data-avatar="nova"
        data-auto-narrate
        defer></script>
```

That is the entire integration for the zero-JS path. There is also a `<page-agent>` custom element and an imperative `new PageAgent({ agent: 'atlas', autoNarrate: true })` API with `narrate()`, `narratePage()`, `setAgent()`, and an event stream (`ready`, `agentchange`, `state`, `caption`, `segment`, `error`; on the element they arrive as DOM events prefixed `page-agent:`).

Three decisions define it:

**Only rigged avatars, as a hard rule.** The catalog ships nine guides (sol, nova, vera, atlas, echo, lumen, kai, mira, pax), and every one has a verified skinned mesh and armature, because the runtime drives skeletal idle motion and lipsync. Each agent is labeled by its lipsync tier: `viseme` for full phoneme-accurate mouth shapes, `jaw` for a single mouth-open morph driven on a speech envelope, `full-body` for rigs without face morphs that carry speech with a talk animation and head motion. `filterAgents({ lipsync: 'viseme' })` picks the best-in-class subset programmatically.

**The visitor picks the guide.** A built-in accessible picker lets each visitor choose their narrator, and the choice persists across visits by default. You constrain the roster with the `agents` allowlist and self-host the GLBs by pointing `assetBase` at your own CDN.

**No backend, anywhere.** Speech is the browser's own SpeechSynthesis. Lipsync is a deterministic text-to-viseme timeline advanced on the Three.js frame loop. There are no network calls for speech, no API key, no audio files. Where TTS is unavailable or muted, the avatar still talks visually and captions render, so narration never silently stalls. Content comes from your page: elements matching your selector, `[data-narrate]` attributes with optional `data-narrate-order`, or a heading plus lead-paragraph fallback.

## The avatar SDK: the parts, unbundled

For builders who want the pieces rather than the product, `@three-ws/avatar` on npm exposes focused subpath entries so you ship only what you use. The root import registers the full `<agent-3d>` runtime. `@three-ws/avatar/viewer` registers `<three-ws-viewer>`, a lightweight pure-preview element that loads a GLB, frames it, and renders with orbit controls and image-based lighting, with `load` and `error` events and none of the chat runtime's weight. `@three-ws/avatar/creator` exports the `AvatarCreator` class, which opens the three.ws Avatar Studio in a modal iframe and resolves to a GLB Blob, plus `saveBlob()`, which uploads that Blob through a presigned flow with a client-side SHA-256 checksum. And `@three-ws/avatar/react` ships `<Avatar>`, `<AgentAvatar>`, `<AvatarCreator>`, and a `useAvatar(id)` hook that fetches `/api/avatars/:id` and aborts on unmount. The light viewer and React entries leave Three.js as a peer dependency your bundler resolves once; only the full runtime entry ships self-contained.

## Widgets: the no-code path with a real API underneath

Widget Studio at three.ws/studio is where non-developers build embeds. Pick an avatar, pick a type, set the brand fields (background, accent, caption, environment preset, auto-rotate), orbit the camera and click "use current view" to save the framing, and generate. The output is three things: a shareable page at `three.ws/w/{widget-id}`, an iframe snippet pointing at the slim `three.ws/widget` shell with the widget ID and `kiosk=true` in the hash, and a one-line script form:

```html
<script async src="https://three.ws/embed.js" data-widget="wdgt_abc123"></script>
```

The script form supports `data-width`, `data-height`, `data-radius`, `data-reveal` (render on load or on first interaction), and `data-poster` (default `auto`, which uses the widget's generated 1200 by 630 image from `/api/widgets/{id}/og` as a lazy placeholder).

The gallery at three.ws/widgets is the shop window: fifteen live demos across the widget types, each with a live preview, a customize panel, and a copy button offering three formats (HTML iframe, JSX for React, share URL) plus an "open in Studio" link that clones the widget as your starting template. The types span decoration and data: turntable showcases, animation galleries, talking agents, ERC-8004 passport cards that render an agent's live on-chain identity and reputation, hotspot tours with guided camera waypoints, walking avatars that roam the page, and live market widgets wired to the platform's real feeds, including a pump.fun launch narrator and a bonding curve progress card.

Under every widget iframe is a JSON-RPC 2.0 server. Load `https://three.ws/widget-client.js`, attach, and drive it:

```js
const client = ThreeWidget.attach(document.querySelector('iframe'));
await client.ready();

await client.call('viewer.setBackground', { color: '#0a0a1a' });
await client.call('camera.setLookAt', { eye: [0, 1.5, 2.2], target: [0, 1, 0], duration: 600 });

const { clips } = await client.call('animation.list');
await client.call('animation.play', { name: clips[0].name, loop: true });

const shot = await client.call('screenshot.capture', { mime: 'image/png' });
```

The method surface covers `viewer.getInfo`, background, auto-rotate, and environment control, camera get, set, and recenter, animation list, play, and stop, `screenshot.capture`, `model.load`, and `model.export`, which returns the current scene as a binary GLB. Notifications flow back as `viewer.ready`, `model.loaded`, and `widget.revealed`, and errors use standard JSON-RPC codes. The whole API is documented in docs/widget-api.md, and examples/widget-rpc.html in the repo is a build-free page that exercises every method against a live widget.

## Inside a Claude artifact: the zero-network embed

Claude.ai artifacts run in a sandbox whose content security policy forbids fetching from almost every origin. You cannot load a script from three.ws inside one. So we ship the inverse: an endpoint that inlines everything.

```
GET https://three.ws/api/artifact?agent=<agent-id>
```

returns one self-contained HTML document. Three.js, the GLTFLoader, the viewer code, and the avatar GLB itself are embedded in the file, the model as base64 parsed straight from memory, so the artifact makes zero external requests. Parameters: exactly one of `agent` or `model` (an HTTPS GLB URL from a whitelisted storage origin), plus optional `theme`, `idle` clip name, and `bg` hex. The GLB is capped at 6 MB, and the endpoint serves its response under a CSP deliberately matching Claude's own sandbox, so the builder page at three.ws/artifact previews exactly what Claude will render. The workflow is one paste: generate the URL in the builder, hand it to Claude, and the agent appears inside the conversation. The contract lives in specs/CLAUDE_ARTIFACT.md.

## Everything it connects to

The embed layer is not a side feature; it is wired through the platform.

**Share routes.** Every on-chain agent has a canonical URL triad: `/a/{chainId}/{agentId}` carries Open Graph tags, a Twitter Player Card, a Farcaster Frame, and oEmbed discovery, so pasting it into X, Discord, Slack, or a cast renders a rich, often interactive card; `/a/{chainId}/{agentId}/embed` is the chromeless iframe form; `/api/a-og` renders the preview image. Widgets get the same treatment at `/w/{id}` with `/api/widgets/oembed`.

**The resolver.** `GET /api/embed/resolve?id=8453:42` is the CORS-open endpoint that turns any agent reference, chain and token ID, CAIP-10 string, or avatar UUID, into `{ glbUrl, name, poster }`, which is what lets third-party viewers render our agents without our runtime.

**Hydrate.** three.ws/hydrate closes the loop for agents born elsewhere: connect a wallet, and it discovers your existing ERC-8004 or Solana on-chain agents via `GET /api/erc8004/hydrate`, then imports one with a single call and attaches a 3D body, voice, and skills. An identity registered anywhere becomes embeddable everywhere.

**The animation system.** Embedded avatars are not special-cased. Any humanoid GLB you point `body` at gets the platform's canonical bone mapping and retargeted idle and walk clips, which is why an ad-hoc agent from a random rigged model still moves like a native one.

**Analytics without surveillance.** Embeds record anonymous impressions (country, referrer hostname) and nothing else: no IPs, no cookies, no user IDs. Self-host the bundle to opt out entirely.

## Who this is for

**The site owner who does not code.** Save an agent at three.ws/create, paste one script tag before the closing body tag, done. Or skip even that: build a widget in Studio and paste its `/w/` URL into Notion or Substack and let oEmbed render it.

**The frontend developer.** Use the web component with your framework. React and Vue wrappers are a ref and two event listeners; the tutorial at docs/tutorials/web-component-end-to-end.md builds both, including a reactive `agent-id` swap that re-mounts the agent when a prop changes.

**The product engineer making the agent part of the journey.** The events API is the hook. docs/tutorials/trigger-from-page-events.md wires IntersectionObserver to `agent.wave()` when a visitor reaches the pricing section, celebrates form submissions, and builds a four-step onboarding co-pilot from scroll, route, idle, and visibility signals.

**The platform host.** Frame the embed route, implement the v1 envelope, and your users' agents work inside your product with theming, chat forwarding, and capability discovery, exactly the way Claude.ai and LobeHub profiles are specified today.

## Tutorial: three embeds in ten minutes

**One, the one-liner.** Get an agent ID from three.ws/create (save the default if you want speed). Create an HTML file, add `<script src="https://three.ws/cdn/agent-3d.js" data-agent-id="YOUR_ID"></script>` above the closing body tag, open it in a browser. The agent appears bottom-right, idles, and chats when clicked. The full walkthrough, including CSP fixes and the four verification checks, is docs/tutorials/embed-in-30-seconds.md.

**Two, the ad-hoc agent.** No account at all: `<agent-3d chat body="/avatars/cz.glb" instructions="You are a friendly 3D guide."></agent-3d>` after loading the component script. That exact pattern, inline, floating, and side by side with the bare-avatar form, is examples/minimal.html in the repo, and examples/embed-test.html exercises the same element against a live hosted avatar.

**Three, the narrated page.** Add the page-agent script tag with `data-auto-narrate`, then annotate your sections: `<h1 data-narrate="Welcome, here is what is new this week.">Changelog</h1>`. Reload. Nova walks the page, reads your copy aloud with synced lips, and offers the visitor eight other guides.

## The honest limits

Embeds run on other people's pages, so we publish the constraints. WebGL 2 is required; a hardware-blocked tab renders the poster fallback, not magic. iOS will not autoplay the greeting voice before the first user tap; that is an Apple platform rule, and the agent animates silently until then. Browsers cap live WebGL contexts per page, so many agents on one page belong in an `<agent-stage>` or in iframes, not in a dozen separate elements. The page agent's voice quality is whatever the visitor's browser ships for speech synthesis, which varies by OS; its lipsync is a deterministic heuristic, convincing but not studio mocap. Claude artifact embeds are capped at 6 MB of model and cannot open wallet popups, which is why interactive signing is explicitly unsupported there and read-only is the default. And markdown-only surfaces like GitHub READMEs cannot run JavaScript at all; the honest answer there is the OG image card linking out, and that is what the spec recommends.

## Where to start

Build an agent: three.ws/create. Build a widget: three.ws/studio. Steal a working embed: three.ws/widgets. Share a link that unfurls: your agent page or `/w/` URL. Put one in a Claude conversation: three.ws/artifact. Bring an on-chain agent to life: three.ws/hydrate. Read the contracts: specs/EMBED_SPEC.md and specs/EMBED_HOST_PROTOCOL.md in the repo, with the guides at docs/embedding.md and docs/widget-api.md.

The web already has your audience. Now it can have your agent, on any page, in one line.
