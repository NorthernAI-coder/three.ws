<div align="center">

# @three-ws/page-agent

**A rigged 3D AI agent that talks your visitors through any web page.**

One tag. A skeleton-rigged, lipsync-capable avatar docks in the corner, greets
visitors, narrates your page out loud, and lets each visitor pick the guide they
want — from a diverse roster of rigged agents.

[![npm](https://img.shields.io/npm/v/@three-ws/page-agent?logo=npm&color=cb3837)](https://www.npmjs.com/package/@three-ws/page-agent)
[![downloads](https://img.shields.io/npm/dm/@three-ws/page-agent?color=cb3837)](https://www.npmjs.com/package/@three-ws/page-agent)
![license](https://img.shields.io/npm/l/@three-ws/page-agent?color=3b82f6)
![node](https://img.shields.io/node/v/@three-ws/page-agent?color=339933&logo=node.js)

[Quick start](#quick-start) · [Docs](#documentation) · [The catalog](#the-rigged-catalog) · [API](#api) · [How it works](#how-it-works) · [FAQ](#faq)

</div>

---

## Why

Most "AI widget" embeds are a text bubble. This is a **3D presence**: a rigged
character that looks at the visitor, breathes, blinks, and moves its mouth to the
words it speaks — synthesized in the browser, no backend, no API key, no audio
files.

**Only rigged agents, by design.** Every avatar in the catalog ships a verified
skinned mesh + armature. That's a hard rule, not a preference: the runtime drives
skeletal idle motion and viseme lipsync, so an unrigged mesh would render a
frozen, dead-faced statue. Those are excluded.

## Quick start

### 1 — One script tag (zero JS)

```html
<script src="https://unpkg.com/@three-ws/page-agent/dist/page-agent.global.js"
        data-page-agent
        data-avatar="nova"
        data-auto-narrate
        defer></script>
```

That's it. `Nova` appears bottom-right and tours the page. The visitor can change
guides from the control bar.

### 2 — HTML element

```html
<script type="module">import '@three-ws/page-agent';</script>

<page-agent avatar="sol" position="bottom-right" auto-narrate></page-agent>
```

### 3 — Imperative (full control)

```js
import { PageAgent } from '@three-ws/page-agent';

const guide = new PageAgent({ agent: 'atlas', autoNarrate: true });

guide.narrate('Welcome — let me show you the new dashboard.');
guide.on('segment', ({ text, el }) => highlight(el));
```

> **Peer dependency:** `three` (>= 0.150). Bundler users get tree-shaking and a
> small ESM build with `three` left external. The `/global` build inlines three
> for a plain CDN `<script>`.

## Documentation

Full guides live in [`docs/`](./docs/README.md), tiered by experience:

- 🟢 **Basic** — [Getting started](./docs/getting-started.md) ·
  [Narrating your page](./docs/guide-narration.md) ·
  [Troubleshooting & FAQ](./docs/troubleshooting.md)
- 🟡 **Medium** — [Framework integration](./docs/guide-frameworks.md) (React, Next, Vue, Svelte, Astro, no-code) ·
  [Recipes](./docs/recipes.md) · [API reference](./docs/api-reference.md)
- 🔴 **Advanced** — [Custom avatars](./docs/guide-custom-avatars.md) ·
  [Building blocks](./docs/guide-building-blocks.md) (compose the engine yourself)
- 🛠️ **Contribute** — [CONTRIBUTING](./CONTRIBUTING.md) (add an agent, improve
  lipsync, ship an adapter) · [runnable examples](./examples/)

## The rigged catalog

A deliberately diverse roster — realistic, stylized, and robot guides, with
different presentations and lipsync capabilities. Every one is rigged.

| id      | name  | style      | presents | lipsync   |
|---------|-------|------------|----------|-----------|
| `sol`   | Sol   | realistic  | neutral  | viseme    |
| `nova`  | Nova  | stylized   | female   | viseme    |
| `vera`  | Vera  | realistic  | female   | viseme    |
| `atlas` | Atlas | realistic  | male     | viseme    |
| `echo`  | Echo  | stylized   | neutral  | viseme    |
| `lumen` | Lumen | stylized   | neutral  | jaw       |
| `kai`   | Kai   | robot      | robot    | full-body |
| `mira`  | Mira  | stylized   | female   | full-body |
| `pax`   | Pax   | stylized   | neutral  | full-body |

- **viseme** — full Oculus/ARKit viseme morphs; phoneme-accurate mouth shapes.
- **jaw** — a single jaw/mouthOpen morph driven on a speech envelope.
- **full-body** — no face morphs; the agent carries speech with a talk body
  animation + head motion (Mixamo rigs).

```js
import { AGENTS, filterAgents } from '@three-ws/page-agent';

filterAgents({ style: 'realistic' });   // just the realistic guides
filterAgents({ lipsync: 'viseme' });     // best-in-class mouth sync
```

Self-host the GLBs by pointing `assetBase` (or any agent's `url`) at your own CDN.

## API

### `new PageAgent(config)`

| option         | type                                   | default        | notes |
|----------------|----------------------------------------|----------------|-------|
| `agent`        | `string`                               | saved / `sol`  | initial rigged agent id |
| `agents`       | `string[]`                             | all            | allow-list shown in the picker |
| `position`     | `bottom-right \| bottom-left \| top-right \| top-left` | `bottom-right` | dock corner |
| `assetBase`    | `string`                               | three.ws CDN   | GLB host |
| `autoNarrate`  | `boolean \| string`                    | `false`        | `true` tours the page; a string is a CSS selector of segments |
| `greeting`     | `string`                               | —              | spoken on load (ignored if `autoNarrate`) |
| `muted`        | `boolean`                              | `false`        | start muted (visual lipsync only) |
| `collapsed`    | `boolean`                              | `false`        | start as the launcher pill |
| `picker`       | `boolean`                              | `true`         | show the "change agent" affordance |
| `controls`     | `boolean`                              | `true`         | show the control bar |
| `persistAgent` | `boolean`                              | `true`         | remember the visitor's choice |

### Methods

```ts
guide.narrate(text, { interrupt? })   // speak one line → Promise
guide.narratePage({ selector?, greet? }) // walk + narrate the page → Promise
guide.stop()                          // cancel narration
guide.setAgent('vera')                // swap rigged avatar live → Promise
guide.mute(true) / guide.collapse(true)
guide.openPicker() / guide.closePicker()
guide.on(event, cb) / guide.off(event, cb)
guide.dispose()
```

### Events

`ready` · `agentchange` · `state` (`idle`/`speaking`) · `caption` · `segment` ·
`error`. On the `<page-agent>` element these are DOM `CustomEvent`s prefixed
`page-agent:` (e.g. `page-agent:agentchange`).

### Marking up a guided page

The page walk reads, in order of preference:

1. elements matching your `selector`,
2. `[data-narrate]` elements (optionally ordered with `data-narrate-order`),
3. a heading + lead-paragraph fallback.

```html
<h1 data-narrate="Welcome — here's what's new this week.">Changelog</h1>
<section data-narrate data-narrate-order="2">…read verbatim…</section>
```

## How it works

```
PageAgent  ─┬─  AvatarStage     three.js scene · loads the rigged GLB · frames
            │                    bust/upper/full · idle clip or procedural
            │                    breathing+blink · talk animation
            ├─  SpeechNarrator   Web Speech TTS queue · picks a voice per agent ·
            │                    drives the lipsync timeline on the render loop
            ├─  AvatarPicker     accessible modal grid · persists the choice
            └─  lipsync          text → timed visemes → morph influences
```

No microphone, no network calls for speech, no API keys. Speech is `SpeechSynthesis`;
lipsync is a deterministic text-to-viseme heuristic advanced on three.js's frame
loop so mouth shapes track the spoken words. Where TTS is unavailable or muted,
the avatar still "talks" visually and captions render — narration never silently
stalls.

Accessibility: keyboard-navigable picker with focus trap and `Esc`, `aria-live`
captions, focus-visible rings, and full `prefers-reduced-motion` /
`prefers-color-scheme` support.

## FAQ

**Can I use my own avatar?** Yes — give an agent an absolute `url` to your rigged
GLB, or override `assetBase`. It must be skeleton-rigged; for lipsync include
Oculus visemes (`viseme_aa` …) or at least a `jawOpen` / `mouthOpen` morph.

**Does it need a server?** No. It's fully client-side. Bring your own copy/text;
narrate it with `narrate()` / `[data-narrate]`.

**Bundle size?** The ESM build leaves `three` external and tree-shakes. The
`/global` CDN build inlines three for a single-tag drop-in.

## License

[Apache-2.0](./LICENSE) © three.ws. Part of the [three.ws](https://three.ws)
platform for building, animating, rigging, and monetizing 3D AI agents.
