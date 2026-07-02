# Avatars and universal animation: any humanoid moves on three.ws

*Long-form X article. The complete story of the three.ws avatar system: why we built a universal rig instead of an allowlist, how bone canonicalization and runtime retargeting actually work, every surface that creates or animates an avatar, how an avatar becomes an agent with a wallet, developer examples, tutorials, and the honest limits. $THREE is the only coin.*

The internet is full of dead 3D avatars. Every generator, scanner, and character tool exports a skeleton with its own private naming scheme, and the moment that file leaves the tool that made it, it stops moving. A Mixamo rig calls the pelvis `mixamorig:Hips`. An Unreal mannequin calls it `pelvis`. A VRoid model calls it `J_Bip_C_Hips`. A Daz figure calls it `hip`. Same joint, four spellings, and an animation authored for one plays on none of the others. The web's answer has been the allowlist: support a few blessed rigs, T-pose everything else. An avatar that cannot move is a statue, and most platforms are museums.

three.ws took the opposite bet. Any humanoid avatar, from any tool, in any naming convention, drives the same shared animation library: idle, walk, dances, gestures, reactions, legs included. No curated rig list. A canonicalizer, a retargeter, and one honest gate. This is how it works.

## Why we built it

Three reasons, in order of importance.

**First, three.ws is a platform of embodied agents, and a body that does not move is not a body.** Agents here chat, trade, hold wallets, and walk around 3D worlds. Presence is the product. If a user scans their face and the result stands frozen in a bind pose, the platform failed at its first job.

**Second, the allowlist approach does not scale.** New avatar tools ship monthly, each inventing or inheriting a skeleton convention. A platform that hand-integrates rigs is permanently behind; a platform that maps conventions once, in one module, absorbs every new tool with a table entry and a test. Our operating rule is written into the workspace itself: no rig allowlist.

**Third, the avatar is the front door to everything else.** An avatar on three.ws becomes an agent with a custodial wallet, an on-chain identity, a reputation score, and a public track record, performing in coin worlds, on agent screens, in the club, and inside a one-line embed on your own site. Every one of those surfaces assumes the avatar can move. Universal animation is the load-bearing layer under the whole embodied economy.

## The system at a glance

The pipeline has five stages, and every avatar passes through them.

1. **Create or import.** A selfie at /create/selfie, a camera scan at /scan, one photo of your father at /dad, a dropped GLB or pasted URL at /import/rpm, a text prompt in the forge, or a full build session in the avatar studio.
2. **Canonicalize at ingest.** Before the GLB is stored, `src/glb-canonicalize.js` rewrites its joint names to the canonical bone set and, when needed, folds a baked axis rotation out of the armature.
3. **Store and catalog.** The avatar gets an id, appears in the owner's account, and, if public, in the gallery at /gallery, backed by the live read at /api/avatars/public.
4. **Retarget at runtime.** When any surface loads the avatar, `src/animation-retarget.js` rewrites each clip's tracks onto the rig's actual bones, corrects for its rest pose, and rescales root motion to its proportions.
5. **Animate everywhere.** The same clip library drives the avatar in /play worlds, the agora, the club, agent screens, the /pose studio, the walkaround at /temporary, and every `<agent-3d>` embed on the open web.

The rest of this article walks into stages two and four, where the universality lives.

## The canonical skeleton

Every animation clip on three.ws addresses bones by one fixed vocabulary: a 52-bone canonical humanoid set, exported as `CANONICAL_BONES` in `src/glb-canonicalize.js`, mirroring the reference rig the clip library was baked against, the Avaturn-rigged `public/avatars/cz.glb`. Six torso and head bones, four arm bones per side, fifteen finger bones per hand, four leg bones per side down to the toes. Legs and feet are first-class citizens, which is why walks and dances retarget with the lower body moving. The library never learns any other spelling; every incoming rig is translated into this vocabulary.

## Canonicalization: one function, every naming convention

`canonicalizeBoneName()` reduces any recognized humanoid bone name to its canonical form. The conventions it resolves, all shipped and tested today:

- **Mixamo**: `mixamorig:LeftArm`, `mixamorig1:LeftArm`, `mixamorigLeftArm`
- **Blender and Rigify**: `Armature_LeftArm`, `.L` / `.R` suffixes like `upperarm.L`, `DEF-` / `ORG-` / `MCH-` prefixes
- **Maya, HumanIK, MotionBuilder, mocap**: namespaced joints like `Character1:Hips` and `subject:LeftUpLeg`
- **Unreal mannequin**: `pelvis`, `clavicle_l`, `upperarm_l`, `thigh_l`, `calf_l`, `ball_l`
- **VRM 0.x / VRoid**: `J_Bip_C_Hips`, `J_Bip_L_UpperArm`, finger chains where VRoid's "Little" is the canonical pinky
- **VRM 1.0**: camelCase names like `upperChest`, `leftUpperArm`, `leftLowerLeg`
- **Daz / Genesis**: `hip`, `abdomen`, `lShldr`, `lForeArm`, `lThigh`, `lShin`
- **MakeHuman**: `upperarm.L`, `shin.L`, `clavicle.L`
- **Reallusion Character Creator 3/4**: the `CC_Base_` prefix and neck twist joints
- **3ds Max Biped**: `Bip01 Pelvis`, `Bip001 L UpperArm`
- **Simple and auto-rigger conventions**: `shoulderL`, `elbowL`, `kneeL`, bare `L_Arm` tokens, snake_case, kebab-case, plain lowercase

Two details make this robust rather than merely long. Side-paired bones are declared once, as the left spelling, and the right twin is derived mechanically by swapping the side token, so the table cannot drift asymmetric. And exporter de-duplication suffixes, the `_01` and `.001` that glTF and Blender writers append, are stripped only when the unstripped name failed to resolve, so a genuinely numbered finger bone never loses its index. The lookup runs in priority order, canonical and Mixamo spellings first, so a later alias table can never shadow a canonical name. Anything that resolves to nothing, a sword prop, a tail, a quadruped spine, is deliberately left untouched: there is no safe automatic mapping for non-humanoid bones, and guessing would corrupt rigs a human rigged on purpose.

`canonicalizeGLBBones()` applies this to a whole file: it parses the GLB container, renames only nodes referenced from `skins[].joints[]` so meshes, cameras, and lights keep their names, and repacks a valid GLB that swaps in one for one at the same storage key. It runs at ingest in the avatar upload action, the server-side auto-rigger, and the browser upload path, so every stored avatar already speaks the canonical vocabulary before any animation loads.

## The orientation fold: killing the lying-down bug at ingest

Bone names are half the problem. The other half is axis convention. Mixamo and FBX exports bake a rotation of positive 90 degrees around X onto the armature node and negative 90 onto the Hips; the net result stands upright, but a clip authored for an identity-Hips rig overwrites the Hips rotation and tips the body onto its back. That is the classic lying-down retarget failure, and most pipelines patch it at playback.

We normalize it at ingest instead. `canonicalizeArmatureOrientation()` folds the armature's baked rotation down into its children, then zeroes the armature; a counter-rotated Hips collapses to identity. The fold is verified, not assumed: it snapshots every affected joint's world matrix before and after, and if any element moved beyond one part in ten thousand, the entire fold reverts. It also refuses non-uniform armature scale, because rotation only commutes with uniform scale. Stored avatars come out axis-aligned, and the mesh, whose inverse-bind matrices live in the untouched binary chunk, still resolves to the same bind pose. All of this sits under 28 tests in `tests/glb-canonicalize.test.js`, including real fixtures: the canonical reference rig round-trips byte for byte, and a real Mixamo export normalizes correctly.

## Runtime retargeting: the same clip on every body

Canonical names point a clip's tracks at the right bones. They do not make the motion look right, because rigs also differ in rest pose and proportions. `src/animation-retarget.js` handles both, and it is a pure module, three.js plus the canonicalizer and nothing else, so the identical code runs in the browser gallery, in Node under vitest, and in the server-side animation tool.

**Rest-pose correction.** The library's clips store absolute local rotations measured on the authoring rig, which rests in an A-pose; a target rig may rest in a T-pose, or carry the Mixamo Hips convention. For each bone the retargeter computes a two-sided correction, built from the source and target local and world bind rotations, that replays the clip bone's motion as the same world-space rotation delta on the target's own rest pose. The naive one-sided fix skews an A-pose clip's limbs by roughly 30 degrees on a T-pose rig; the world-delta form eliminates that. A bone whose correction works out to identity is skipped, so a rig that already matches the authoring convention round-trips bit for bit.

**Root motion.** The retargeter rotates the hip position track into the target's hips-parent frame so a walk travels the same world direction on any armature, then scales it by the ratio of hip rest heights, clamped between 0.2 and 5. Height is measured in the hips-parent's local units, not world units, and that matters: a Mixamo armature exported at scale 0.01 has a Hips local position near 100, and matching world heights there would collapse the hip track to a centimeter of motion and sink the avatar into the floor.

**The coverage floor.** A clip only ships to the mixer when at least half its tracks found a home on the target, the exported `MIN_COVERAGE` of 0.5. Below that, motion reads as twitching joints rather than a performance, so callers get an actionable failure instead, with dropped tracks reported by canonical bone name. A rig without finger bones simply plays the clip without finger articulation.

## The AnimationManager and the one honest gate

`src/animation-manager.js` is the runtime every surface uses. On `attach(model)` it builds the canonical-to-node map once, captures the rig's rest rotations while the model is still in its authored bind pose, measures the hips-parent frame and rest height, then retargets clips lazily as requested, crossfading between them.

The only gate in the whole system is `supportsCanonicalClips()`: the model must contain a skinned mesh and at least 8 canonicalizable bones. That is not an allowlist, it is a physics check; a rig below that floor cannot be skeleton-driven into a readable performance. Whatever fails the gate, a prop, a quadruped, an unskinned statue, falls back to the platform's default rig or its own authored animations, never a forced bind-pose T-pose. Every caller, agent screens, the club crowd, the pose studio, the world citizens, checks this same gate.

Two more runtime layers matter. **The fallen-pose guard**: before trusting a retargeted clip, the manager measures the tilt the clip's first Hips keyframe would impose on the rig. Healthy rigs rest under about 18 degrees off vertical, locked in by an upright-invariant test suite, so the catastrophe floor sits at a generous 45 degrees; a clip that would put this particular rig on its back is disabled for this rig only and reported. And **additive upper-body overlays**: gestures play additively on top of locomotion, with every lower-body track stripped, so the base layer owns the hips, legs, and feet while the overlay adds the wave. On top sits a small pure state machine, `src/animation-state-machine.js`, with idle, talk, walk, react, emote, listen, and think states, editable per agent so a creator can declare that their agent's idle is the dance clip.

## The clip library and where clips come from

The built-in library is pre-baked, on purpose. `scripts/build-animations.mjs` reads Mixamo FBX sources, retargets each onto the canonical reference skeleton, and writes one clip per animation into `public/animations/clips/`, rewriting the runtime manifest to point only at clips that survived retargeting; a clip that fails is dropped at build time, not shipped broken. The browser never parses FBX or guesses bone names, it fetches JSON clips and retargets them with the machinery above. The manifest currently lists 100 curated clips, categorized from Idle and Locomotion through Dance, Gestures, Action, Sports, Reactions, Fitness, and Farming.

Beyond the curated set, clips come from two live sources.

- **The community.** Anyone can author motion in the Animation Studio at /pose, keyframe FK/IK poses on a timeline, save clips, and publish them. The gallery at /animations merges the built-in manifest with community clips from `GET /api/animations/clips?include_public=true&visibility=public`, previews every card on a live avatar, and deep-links each into the studio at `/pose?anim=<id>`.
- **A text prompt.** `POST /api/forge-motion` takes a prompt like "a slow tai-chi sweep", a duration from 1 to 10 seconds, and a frame rate from 8 to 60, samples a motion-diffusion model on a GPU worker, and returns a three.js AnimationClip JSON on the canonical skeleton, so a generated clip retargets exactly like a preset. A warm generation takes roughly 10 to 30 seconds.

Clips are also an economy: a creator can list a baked animation for sale in USDC, and buyers pay through the x402 download endpoint at `/api/x402/animation-download`, once per wallet, free re-downloads after. And because every source lands in one canonical format, every clip from every source plays on every humanoid avatar. Each new clip works for all avatars; each new avatar works with all clips.

## Where avatars come from

Every creation surface feeds the same pipeline, so pick by input, not by capability.

**A selfie: /create/selfie.** One frontal photo, side photos optional. The page downscales images client-side, submits to `POST /api/avatars/reconstruct`, and polls the status endpoint while showing your photo on a placeholder body. About a minute later you have a rigged GLB that idles and walks. Bring-your-own-key support runs reconstruction on your own provider credits. **/scan**, the 3D scanner, routes into the same flow.

**One photo of your dad: /dad.** Every step is real: the photo is normalized client-side (phone HEIC included, under the 8 MB upload contract), uploaded through a presigned storage PUT, matted by a background-removal pass, reconstructed into a rigged GLB, and rendered in an `<agent-3d>` viewer that plays idle, walk, and wave, with a shareable permalink.

**A file or a URL: /import/rpm.** Drop any .glb up to 100 MB or paste a GLB or glTF URL. Canonicalization runs on the upload path, so a Mixamo export, a VRoid model, or a hand-rigged Blender character comes out already speaking the canonical bone set.

**A full build session: /avatar-studio.** The complete character builder, a fork of the open-source M3-org CharacterStudio (MIT): face sculpting, body morphs, outfits, accessories. The /create wizard opens the same studio in an iframe and receives the exported GLB directly.

**A map of the field: /avatar-engines.** An atlas of 24 open-source and commercial avatar-generation engines across five families, from photoreal Gaussian-splat heads to single-photo humans, each entry recording what it makes, what it eats, what its license permits, and exactly how, or whether, three.ws can use it. Non-commercial research engines are flagged for self-hosting; only commercially licensed engines deep-link into the live generation pipeline.

Everything public lands in /gallery. And to just feel the system, /temporary is Drive Your Avatar: a third-person walkaround, WASD on desktop and a joystick on mobile, driven by the same AnimationManager, with an AR toggle that makes the canvas transparent and streams your phone's back camera behind it so the avatar walks across your actual floor.

## From avatar to agent with a wallet

This is where three.ws stops being an avatar tool and becomes a platform. An avatar you keep is a file. An avatar you promote to an agent is an economic actor.

The promotion is nearly automatic: every avatar committed through `POST /api/avatars` gets an agent identity provisioned alongside it, and creating an agent at /create mints custodial EVM and Solana wallets at insert time, private keys encrypted at rest under a dedicated wallet encryption key. The encryption is fail-closed: if the at-rest key is unavailable, the platform refuses a weaker fallback, creates the agent walletless, and provisions the wallet lazily on first use. Fork any public avatar through `POST /api/avatars/fork` and the server copies the model, credits the original, and provisions the new agent's wallets in the same request. The agent gets a profile, a brain, skills, and a body: the avatar, idling on its profile, performing on its live screen, walking the worlds.

The wallet is not decorative. Agents pay and get paid through x402 endpoints, trade under server-enforced spend limits, and can be armed on the Oracle conviction engine to act on scored signals. The body and the ledger meet in one interface: in any world, press I near an avatar and the Avatar Inspector opens, pulling live data from `/api/agents/:id` for identity, `/api/agents/:id/reputation` for the 0 to 100 trust score, and `/api/agents/:id/solana/networth` for the wallet address and the USD, SOL, and $THREE portfolio. A guest with no wallet renders as a designed empty state, never a fabricated balance. When an agent celebrates a win on its screen, the celebration clip is retargeted by the exact machinery above, and the win is real.

## Who this is for

**The person with a face and sixty seconds**: take a selfie, get a body that already knows how to walk, never hear the word "rig". **The character artist**: your Blender, VRoid, or Character Creator export works without renaming a single bone, and a genuinely new convention becomes a table entry and a test, not a support ticket. **The developer**: one npm package puts a talking, animated, lipsyncing avatar on your site, and the whole animation stack is plain importable JavaScript. **The agent owner**: the same avatar performs on your agent's profile, its live screen, in the worlds, and in embeds, and one animation system guarantees it never freezes into a T-pose in front of an audience.

## For developers: packages, endpoints, and code

**Embed an avatar in two lines.** The official SDK is `@three-ws/avatar`, with `three` as the only required peer dependency:

```html
<script type="module">
  import 'https://esm.sh/@three-ws/avatar';
</script>

<agent-3d avatarid="your-avatar-id"></agent-3d>
```

The `<agent-3d>` element is the full runtime: a built-in chat and voice loop, emotion morphs, audio-driven viseme lipsync, an `ios-src` attribute for USDZ AR Quick Look, and instance methods like `playGesture(name)` and `setMorph(name, weight)`. It canonicalizes and retargets internally, so any rigged humanoid GLB you point it at idles and walks with no per-rig code. For a pure preview, `@three-ws/avatar/viewer` registers a lightweight `<three-ws-viewer>` element; `@three-ws/avatar/react` ships `<Avatar>`, `<AgentAvatar>`, and a `useAvatar()` hook; the `AvatarCreator` class opens the avatar studio in a modal iframe and resolves with a GLB Blob.

**Retarget a library clip yourself.** The engine is importable directly:

```js
import { retargetClipToObject, parseClipJSON } from './src/animation-retarget.js';

const clipJson = await fetch('https://three.ws/animations/clips/walk.json').then(r => r.json());
const clip = parseClipJSON(clipJson, 'walk');

const { clip: bound, coverage, dropped } = retargetClipToObject(clip, myLoadedGltfScene);
if (bound) mixer.clipAction(bound).play();
else console.warn('coverage too low', coverage, dropped);
```

`coverage` tells you how much of the clip found bones, and `dropped` names exactly which canonical bones your rig lacks. No silent failure modes.

**Verify an avatar manifest anywhere.** `@three-ws/avatar-schema` ships the `avatar.v1.json` JSON Schema plus an Ajv-backed validator for the hash-anchored on-chain avatar manifest format, so a third-party viewer, indexer, or marketplace can resolve and verify a three.ws avatar without pulling in the runtime.

**Read the catalogs.** Public avatars: `GET /api/avatars/public`. Community clips: `GET /api/animations/clips?include_public=true&visibility=public`. Text to motion: `POST /api/forge-motion`, then poll `GET /api/forge-motion?job=<id>` until the clip URL arrives.

## Three tutorials in one place

**Face to moving avatar in about a minute.** Open three.ws/create/selfie. Take one frontal photo, add sides if you have them, submit, and watch the build. When it finishes you are looking at yourself, rigged. Click through to /pose and play the walk clip: your legs move, because the leg chain is part of the canonical set, not an afterthought. The selfie-to-avatar tutorial in the docs has the full walkthrough.

**Make a custom rig dance.** Export a character from your tool of choice, open three.ws/import/rpm, and drop the .glb. Ingest canonicalizes the bones and folds any baked axis rotation. Open the avatar in /pose and click a dance. If the studio reports low coverage, it names the missing canonical bones, telling you exactly what your export lacks. Details: the upload-custom-glb and animate-your-avatar tutorials.

**Author motion without animating.** In /pose, type a prompt into the motion generator, pick a duration up to ten seconds, and generate. The result is a canonical clip like any preset: preview it, scrub the speed, then export an animated GLB with the motion baked in, ready for any glTF viewer on earth.

## The honest limits

The universal claim has edges, and we publish them. Non-humanoid rigs, quadrupeds, props, and unskinned meshes are not skeleton-driven; they fall through the gate to the default rig or their own authored animations, a designed fallback, but your dragon will not do the rumba. A rig below 8 canonical bones or a clip below 50 percent coverage is refused rather than mangled. Finger articulation drops silently on rigs without finger bones. The orientation fold refuses non-uniformly scaled armatures and reverts on any world-matrix mismatch, so a few exotic exports keep their baked rotation and rely on the runtime correction. Truly novel naming conventions animate only after a mapping lands in the canonicalizer: a table entry and a test case, but not zero work. And the fallen-pose guard is deliberately conservative, disabling a clip on a rig it would tip over rather than betting an agent's dignity on a marginal retarget. The system is built to be wrong safely, and to say so out loud.

## Why it compounds

Every naming convention mapped makes every past and future avatar more compatible. Every clip added, curated, community, or generated, immediately works on every humanoid avatar ever uploaded. And because avatars become agents with wallets, reputations, and audiences, the animation layer keeps earning: a platform where every body moves is a platform where every agent can perform, and a platform where agents perform is one people watch.

## Where to start

Make yourself: three.ws/create/selfie, or three.ws/scan. Make your dad: three.ws/dad. Import anything: three.ws/import/rpm. Browse every public body: three.ws/gallery. Animate: three.ws/pose, with the clip gallery at three.ws/animations. Drive one around your room: three.ws/temporary. Study the field: three.ws/avatar-engines. Then give your avatar a brain and a wallet at three.ws/create, and it stops being a file.

Any humanoid. Any convention. It moves. That is the promise, and it is live now.
