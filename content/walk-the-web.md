# Walk: the avatar that turns every page into a place

*Long-form X article. The complete story of Walk: why the web got a body, how the corner companion and the full page playground actually work, the no T-pose rule, the roster, the /walk worlds, the leaderboard and its anti-cheat, the embed and extension story, developer examples, tutorials, and the honest limits. $THREE is the only coin.*

Every web page you have ever visited treated you as a pair of eyes and a scroll wheel. You read it, you clicked it, you left. You were never really there.

Walk changes the physics of that. It puts a real, rigged, animated 3D avatar on the page with you: a companion that idles in the corner, turns to follow your cursor, waves goodbye when you click a link, and waves hello on the other side. Click it and it detaches into a full page playground where you steer it with WASD, a touch d-pad, or a gamepad, and where the page itself becomes terrain. Walk onto a link and it glows like a doorway. Press dive and you fall through it into the next page, where your avatar drops back in and keeps going.

It is live on three.ws now, ships as the open source `@three-ws/walk` npm package for any site, and is fully documented at three.ws/docs/walk. This is everything about it.

## Why we built it

**First, an avatar that cannot go anywhere is a screenshot.** three.ws is built on the idea that your avatar is your identity: it holds a wallet, it works, it earns. Every platform we studied kept avatars locked inside a viewer, a game, or a metaverse app you had to enter. We wanted the opposite direction: the avatar comes to where you already are. The corner companion makes every ordinary page on three.ws a place your character inhabits, and the embed and extension carry it onto the open web.

**Second, the animation system made it honest to build.** The platform already has universal avatar animation: `src/glb-canonicalize.js` maps bone names from every major rig convention onto one canonical skeleton, and `src/animation-retarget.js` retargets the shared clip library onto it, legs included. So Walk needs no curated list of blessed characters: any humanoid GLB, including one you generated five minutes ago, walks. Without that layer this would have been one hardcoded mascot. With it, it is a cast.

**Third, walking generates data that feeds the platform.** Distance, time, and sites walked flow into a real metrics pipeline with a public leaderboard, per-creator embed analytics, and achievements. A feature that is fun on day one and measurable on day two earns its place.

## The system at a glance

Walk is one engine with several bodies:

1. **The corner companion.** A 200 by 280 pixel WebGL canvas fixed to the corner of the page. It idles, follows the cursor, greets each route with a page-aware line, and waves on navigation.
2. **The playground.** Click the companion and it detaches full screen, in one of two movement models: Stroll, a gentle aerial view with no gravity, or Platformer, where the page's real DOM becomes solid ground.
3. **The picker and the roster.** A searchable, keyboard-navigable panel where every visitor chooses who walks with them: a robot mascot, humanoids, photoreal people, a fox, dancers, showpieces, or their own generated avatar.
4. **The three.ws layers.** On the platform itself the companion also paints path trails, walks to wherever you click, narrates the section it is standing near, dresses page transitions, and breathes with the agent's live mood.
5. **The /walk worlds.** A full third-person walkaround at three.ws/walk with six real glTF environments, NPCs, multiplayer, voice chat, and in-world wallet tipping.
6. **The metrics loop.** Every meter walked, on three.ws, in an embed, or through the Chrome extension, rolls up into the leaderboard at three.ws/walk-leaderboard and the creator analytics dashboard.
7. **The embed story.** A one-tag iframe, a host-side JavaScript SDK, a versioned postMessage protocol, and a Chrome extension that walks the avatar over every page you visit.

## The companion, mechanically

The corner companion is deliberately small and deliberately alive. The renderer caps pixel ratio at 1.5 and pauses its animation frame loop entirely when the tab is hidden, so it costs nothing in the background. The avatar tracks your cursor: if the pointer has moved within the last 450 milliseconds, the rig eases toward it and plays its walk cycle; go still and it settles back to idle. On touch devices, where there is no hovering cursor to follow, it wanders autonomously instead, picking a fresh heading, strolling for a couple of seconds, pausing, repeating, until a real fine pointer takes over.

Navigation is a social event. When you click a same-origin link, the companion plays its wave clip and sets a one-shot sessionStorage flag; the destination page reads that flag on mount and waves hello. Two pages, one gesture, and the site feels continuous. Each route also gets a contextual greeting in a speech bubble, and on pages like pricing the avatar physically turns toward the recommended plan card for a few seconds before returning to you.

Everything is dismissible and remembered: the enable state, the chosen avatar, and even the avatar's facing angle persist across pages, and `prefers-reduced-motion` calms the whole act to a steady idle.

## The playground: two kinds of physics for one page

Click the companion and it hands off. The corner instance frees its WebGL context first, then a lazily imported playground module takes over full screen, spawning the avatar exactly where the corner canvas was. The two movement models are switched live with the M key or the mode button, and your choice persists.

**Stroll** is the gentle one: a top-down orthographic camera pitched at about 29 degrees, no gravity, nothing to fall off. Movement is a real little physics sim in CSS pixel units: 3600 px/s squared of acceleration, a 360 px/s speed cap, hard friction on release, diagonal input normalized. Every 90 milliseconds the engine probes the element under the avatar's feet with `elementFromPoint`; a same-origin, same-tab link under it arms: a pulsing portal glow, a hint. Nothing navigates on its own. You commit with a deliberate press of Space, Enter, E, the on-screen dive button, or a gamepad face button, and a spawn guard swallows any press held over from the previous page for the first 1.1 seconds.

**Platformer** turns the page into a level. A scanner sweeps the DOM for solid elements, links, buttons, headings, paragraphs, list items, images, figures, cards, and anything tagged `data-platform`, filters out the invisible and the implausibly shaped (narrower than 38 pixels, shorter than 14, taller than 520), caps the set at 360 platforms in a band 1100 pixels around the viewport, and adds a floor at the bottom of the document so you can never fall out of the world. Then it runs a real platformer: gravity at 2600 px/s squared, terminal velocity 2400, jump impulse 1000, separate ground and air acceleration, edge-triggered jumps. Land on a link and it arms; press down to dive in. Press down on a non-link platform and you drop through it.

The dive itself is a page transition with a body: the avatar leaps, spins, shrinks, the screen flashes toward black, and a resume flag is written. On the next page the companion sees the flag and, instead of remounting in the corner, drops the avatar in from the top of the viewport, falling, so the web starts to feel like one continuous space with doors.

A standard gamepad works everywhere: left stick or d-pad to move with a 0.45 deadzone so a resting stick never walks you into a link, one face button to jump, the other to dive. Pad input merges with the keyboard without stomping keys you are physically holding.

## Who walks: the roster and the no T-pose rule

The built-in roster is a dozen real GLBs across five categories: Mascots, Humanoid, Realistic, Creatures, Showpieces. Robo the robot mascot is the default; there is a photoreal woman and man, a selfie-styled avatar, a stylised dancer, a neutral mannequin, a Mixamo X-Bot with its own locomotion set, the classic glTF fox, and animated showpieces.

Every entry declares one of two rig strategies, and this is the part we are strictest about. `embedded` rigs play the clips baked into their own GLB, with loose name matching that always falls back to the model's first clip, so even a single-animation file keeps moving. `shared` rigs, humanoids that ship no locomotion, are driven by the platform's retargeted clip library: idle, walk, run, wave, jump, mapped from the shared animation manifest onto their bones at load time. Michelle, the dancer, ships literally nothing but a T-pose in her file; the roster forces her onto the shared library, so she struts and never poses.

And if a `shared` entry turns out not to be a retargetable humanoid at all, the loader does not shrug. `AnimationManager.supportsCanonicalClips()` gates the retarget synchronously; on failure the loader recovers down a chain: play whatever clips are baked into the GLB, and if there are none, dispose the model and load the default robot instead. A frozen bind pose is a forbidden state. The same unified loader powers the corner companion and both playground modes, so an avatar added once works everywhere at once.

Your own avatars ride the same rails. Anything served by the platform's GLB proxy at `/api/avatars/<id>/glb`, including avatars you generated in the studio, resolves at runtime through `makeApiAvatarEntry(id)` and gets the shared library treatment. The picker's footer links straight to the avatar builder.

## What three.ws layers on top

The published SDK is the engine. The three.ws app wires five more behaviors around it, all observing the live instance rather than forking the engine:

- **Path trails.** A 2D overlay paints where the companion has been, in three switchable styles: footprints, glow, or a line, tinted with the current avatar's accent color.
- **Click to walk.** Click an empty patch of the page and the companion glides there, routing around elements marked `data-walk-block`, facing its heading, easing into arrival.
- **Section narration.** As the avatar walks the page it reads the section nearest it: a caption bubble by default, with an aria-live region, and, strictly opt-in behind a real user gesture, spoken audio from the platform's `/api/tts/speak` endpoint. Authors mark content with `data-walk-narrate`; unmarked pages fall back to heading and paragraph detection.
- **Themed transitions.** The jump between pages is dressed to match the destination, including a camera zoom into the avatar itself.
- **Mood embodiment.** The companion is the site-wide body of your agent, so it reflects the agent's live emotional state, aura and breathing, on every page it walks.

## The wider Walk surface

**The /walk worlds.** three.ws/walk is the full third-person experience: six environments, park, cyberpunk street, beach, gallery, an abstract void, and the three.ws virtual office, each a real glTF scene with HDR image-based lighting, terrain physics, and dynamic props. The worlds are populated: NPC companions built from the same rigged catalog greet you, wander waypoint loops, or guide you to landmarks, speaking real per-environment dialogue voiced through the TTS endpoint. Multiplayer presence, proximity voice chat, gestures, and photo capture are all in. Walk up to another player piloting a real agent and that agent's wallet rises beside its nameplate, live balance and a one-tap Tip; only the single nearest wallet is ever revealed, so a crowded plaza never triggers a stampede of balance reads. Your session, avatar, environment, position, and heading persist for seven days and sync across devices when signed in, flushed on tab close via sendBeacon, so returning shows a welcome-back toast instead of a spawn screen.

**The leaderboard.** Walking is scored. Clients batch distance and time roughly every sixty seconds into `/api/walk/metrics`, which upserts per-day rollup rows per walker, environment, origin, and avatar. `/api/walk/leaderboard` ranks daily, weekly, and all-time by three metrics: meters walked, distinct sites walked on, and time. Every row carries a delta versus yesterday so the board shows momentum, your own row is always pinned even off-page, and anonymous walkers are first-class citizens ranked alongside signed-in users. Achievements unlock once each: 1 km, 5 km, ten sites, all six environments. The ingest is defensive: per-batch distance is clamped to a sane ceiling, and the embedding origin is never trusted from the request body; it is derived server-side from the request headers, so a creator's analytics reflect where the avatar actually ran.

**The embed and the extension.** The chrome-less iframe at three.ws/walk-embed drops a drivable avatar onto any site with one tag, in six lightweight embed environments, and speaks a versioned postMessage protocol on the `three-walk` channel. The host-side wrapper, `walk-embed-sdk.js`, gives any page a typed handle: `goto`, `gesture`, `say`, `setEnv`, `setAvatar`, position and ready events, and a `track()` call that records creator-defined conversion events into the analytics funnel. The Chrome extension at three.ws/extension takes the last step: your avatar follows you across the entire web, walking over real pages and narrating them. The embed contract has its own interactive reference at three.ws/docs/walk-embed-api and a step-by-step tutorial in the docs, so this article stays out of its weeds.

**The talking sibling.** Walk has a sister package, `@three-ws/page-agent`: a rigged, lipsync-capable 3D guide that narrates any page aloud. They share the platform's DNA, the rigged-only rule, a diverse picker roster, a corner presence that costs nothing until enabled, but they split the job: page-agent speaks, Walk moves. Guided tours at three.ws/tour combine both instincts.

## Four ways in

**The visitor** hits the Walk button in the three.ws nav, gets a robot in the corner, clicks it, and is suddenly platforming across the homepage headlines. **The collector** opens the picker, swaps to the fox mid-page, and takes their own generated avatar for a stroll with `?avatar=<id>`. **The site owner** pastes one iframe tag, or installs the npm package for the site-wide companion, and their product pages get a mascot with a physics engine. **The competitor** grinds meters across environments and origins and watches their pinned row climb the weekly board.

## For developers

The engine is Apache-2.0, published as `@three-ws/walk`, with Three.js 0.150 or newer as a peer dependency:

```bash
npm install @three-ws/walk three
```

The whole experience, app-style, honoring `?walk=` deep links and resuming after dives:

```js
import { createWalkCompanion } from '@three-ws/walk';

const walk = createWalkCompanion({ defaultAvatarId: 'fox' });
walk.bootstrap();
```

`createWalkCompanion` is side-effect free on import: nothing touches the DOM until `enable()` or `bootstrap()`. The playground loads only through a dynamic `import()` on the first detach, so a page that never leaves the corner never pays for it. You can also drive it directly: `walk.enable()`, `walk.openPicker()`, `walk.setAvatar('michelle')`, `walk.toggle()`.

Add your own mascot to the roster:

```js
import { createWalkCompanion, WALK_AVATARS } from '@three-ws/walk';

createWalkCompanion({
  avatars: [
    ...WALK_AVATARS,
    {
      id: 'mascot',
      name: 'Our Mascot',
      category: 'Brand',
      asset: '/brand/mascot.glb',
      source: 'static',
      rig: 'shared',
      accent: '#ff0066',
    },
  ],
  defaultAvatarId: 'mascot',
}).bootstrap();
```

`rig: 'shared'` means your GLB needs no animations at all; the retarget library moves it, and the fallback chain guarantees it never freezes.

URL controls work on any page running the companion: `?walk=1` forces it on, `?walk=0` off, `?walk=play` deep-links straight into the playground, `?avatar=<id>` picks the character.

The leaderboard is a plain public read:

```
GET https://three.ws/api/walk/leaderboard?period=weekly&metric=distance&limit=10
```

Swap `metric` for `sites` or `time`, `period` for `daily` or `all-time`; every row includes the walker, the value, the rank, and the delta versus yesterday.

And for your own scenes, the low-level loader is exported too: `loadWalkAvatar(getAvatar('xbot'))` returns a model plus a controller with one interface, `setState('idle' | 'walk' | 'run' | 'jump')`, `playWave()`, `update(dt)`, regardless of how the rig is animated underneath.

## Two tutorials in one place

**Walk three.ws in ninety seconds.** Open any three.ws page and add `?walk=play` to the URL. You are in the playground. WASD to move, M to flip between Stroll and Platformer, C to open the picker and change who you are. Find a link, stand on it until it glows, press Space, and enjoy the fall into the next page. Esc returns you to the corner companion.

**Put it on your site in two minutes.** Paste the iframe from three.ws/walk-embed for the zero-build path, or install `@three-ws/walk` and call `bootstrap()` for the real site-wide companion. Serve the roster GLBs and the animation manifest from your origin or point `assetBase` at a CDN. The full walkthrough, including the postMessage API for steering the embedded avatar from your own page, is the walk-companion tutorial in the three.ws docs.

## The honest limits

Walk requires WebGL and quietly declines to mount without it; there is no degraded 2D imitation. The companion and playground share one WebGL context budget and never run two contexts at once, which is why the corner instance frees its renderer before the playground mounts. The platformer's ground is heuristic: it scans a fixed selector list with size filters and a 360-platform cap, so an unusual layout can have thin footing, and authors who care can tag elements with `data-platform`. Dives follow only same-origin, same-tab links, on purpose; your avatar never walks you onto another site's page or into a new tab uninvited. On three.ws the companion excludes routes that already own the viewport with full-screen 3D, because a mascot in front of a world is clutter. Leaderboard identity for anonymous walkers is a client-held id, bounded by server-side clamps and header-derived origins rather than proof, so treat the board as a game, not an oracle. And `prefers-reduced-motion` is honored everywhere: the avatar calms, the dives cut straight to navigation, and none of it auto-plays sound, ever, without an explicit opt-in and a real user gesture.

## Where to start

The product page: three.ws/walk. Walk any page right now: add `?walk=play` to a three.ws URL. The board: three.ws/walk-leaderboard. The docs hub, from getting started to the postMessage contract to the extension: three.ws/docs/walk. The package: `@three-ws/walk` on npm. The extension: three.ws/extension.

The web has been flat for thirty years. Bring a body. Walk is live now.
