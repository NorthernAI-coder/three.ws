# Motion and voice: how a three.ws avatar comes alive

*Long-form X article. The complete story of motion capture, animation authoring, and voice on three.ws: the browser mocap studio, the keyframe Animation Studio, the three-model voice loop, the lipsync ladder, the clip marketplace, the MCP path, real endpoints, real code, and the honest limits. $THREE is the only coin.*

A rigged GLB standing in a scene is not a character. It is a statue with potential. The distance between the two is exactly two things: motion and voice. Get both right and a bundle of triangles becomes a presence you talk to. Get either wrong and the illusion collapses into a frozen face and a floating audio track.

three.ws is a platform where 3D agents hold wallets, trade, and pay each other, so this is not cosmetic for us. An agent that cannot look at you, react, and answer out loud is a dashboard wearing a costume. This is how we closed that distance: capture motion with a webcam, author animation on a timeline, give any avatar a voice it can hear and speak with, and drive its face from the actual audio it plays. Everything here is live, and every mechanic comes from the shipped code.

## Why we built it

**First, capture should not require a suit, a tracker, or a download.** The math for facial capture is solved and it runs in a browser tab: a webcam frame in, blendshape weights out, thirty times a second. The missing pieces were the boring ones, calibration, smoothing, a durable clip format, a place to save. We built those once, properly, and now the studio is a URL.

**Second, a voice is three systems, and nobody should wire them three times.** A talking avatar needs a recognizer to hear, a synthesizer to speak, and a facial animation model so the mouth matches the words. Each is a different provider, a different wire format, a different failure mode. We wired that loop once behind three plain endpoints, made the free lane the default, and made every failure degrade to something that still works.

**Third, motion is property.** A recorded performance or an authored animation is data: frames, weights, timestamps. Data can be saved, versioned, shared, and sold. On three.ws a face capture is a clip in your library that replays on any compatible avatar, and an authored animation is an artifact you can price. The platform where agents pay each other is also the platform where their movements are assets.

## The system at a glance

Three ways motion gets made, one voice loop, one store underneath:

1. **The Mocap Studio** at three.ws/mocap-studio turns your webcam into a facial capture rig: record, calibrate, replay, save.
2. **The Animation Studio** at three.ws/pose is the authoring path: pose any avatar with FK and IK, keyframe a timeline, bake and export.
3. **The voice loop**, three endpoints: /api/asr hears, /api/tts/speak speaks, /api/a2f turns speech into a per-frame facial animation track.
4. **The lipsync ladder** drives the mouth from whatever is available, from a full Audio2Face track down to raw amplitude, so a face is never frozen.
5. **The clip stores** persist it all: face mocap clips at /api/mocap/clips, authored animations at /api/animations/clips, both owner-scoped and priceable.
6. **The MCP server**, `@three-ws/audio-mcp`, exposes the whole audio pipeline to any MCP client, so an assistant can speak, listen, animate a face, and browse the clip library from a chat.

## Motion capture with a webcam, for real

Open three.ws/mocap-studio, load an avatar by handle or use the default, and start the camera. The entire capture pipeline runs client side.

MediaPipe Face Landmarker reads each webcam frame on the GPU delegate at roughly 30 Hz and emits 52 ARKit blendshape scores plus a 4x4 head-pose matrix. Raw landmarker output jitters, so every one of the 52 channels runs through its own one-euro filter, and the head rotation gets three more, tuned separately, before anything touches the avatar. Then calibration: a resting face is not a zero face, so you press Calibrate while holding a neutral expression and the studio records your baseline and subtracts it from every subsequent frame. Your neutral becomes the avatar's neutral.

Press Record and every smoothed frame is buffered as `{ t, shapes, mat }`: seconds from clip start, ARKit blendshape scores, and the optional head matrix. Stop, and you have a clip to replay immediately, download as JSON, or save to your library.

The clip format is the load-bearing decision. A saved clip is not baked bone keyframes tied to one skeleton; it is rig-agnostic ARKit blendshape data carrying a versioned format string, `three.ws.face-mocap.v1`, that the runtime asserts on before replay. Record on one avatar, replay on any avatar that exposes ARKit morph targets. The store also accepts `three.ws.pose-mocap.v1`, `three.ws.hand-mocap.v1`, and `three.ws.vmc.v1`, deriving the clip kind from the format server side.

The persistence half is `POST /api/mocap/clips`, with real bounds from the shipped validation: up to 20 tags, frames stored inline as JSONB up to 2 MB, a hard cap of 18,000 frames per clip, and a duration up to 3600 seconds. Clips are private by default, can be flipped to unlisted or public, can be bound to one of your avatars, and can carry a price. Listing is cursor-paginated, newest first, and a private clip you do not own resolves as a 404, never a permission error, so a non-owner cannot even confirm it exists. Every non-owner fetch bumps the clip's play count.

All of it is wrapped in `@three-ws/mocap` on npm: `saveClip`, `getClip`, `listClips`, `updateClip`, `deleteClip`, zero runtime dependencies, Node 18 and the browser. Set `price: { amount, currency }` on a clip and it is listed; the mocap library is where a recorded performance becomes a $THREE-priced asset.

## Authoring by hand: the Animation Studio

Capture is one path. The other is intent: you know the exact motion you want, so you build it at three.ws/pose, a full keyframe animation studio in the browser.

The rig is either the built-in mannequin or any rigged GLB, including your own three.ws avatars picked from a gallery. Posing is FK gizmos and sliders per bone, plus drag IK: grab a hand, pull it, the chain follows. Presets give you starting poses, and a shared-link codec lets a pose travel in a URL.

The timeline layers on top. An animation document is `{ name, duration, fps, loop, keyframes }`, each keyframe a time, a full pose, and an easing from a published set. Scrub the playhead and the studio samples between keyframes with the easing applied, live in the viewport.

Export is where the studio earns the name. `bakeClip` resamples the document at its fps, clamped between 1 and 120, and emits standard linear and slerp tracks, so per-keyframe easing gets baked into the samples themselves: the exported clip reproduces exactly what you scrubbed, with no proprietary easing metadata to carry. From there you export an animated GLB through the standard glTF exporter or the clip as JSON, and save to your account at `POST /api/animations/clips` with a rendered thumbnail.

Then you can sell it: save the clip, bake a self-contained animated GLB, stage it in R2 via `/api/animations/presign`, then call `/api/animations/sell` with a price and payout addresses. Prices are human USDC amounts, zero lists the clip as a free download, and payouts can target Base, Solana, or BSC addresses, defaulting to your saved payout wallets. Listed clips surface in `GET /api/marketplace/animations` and sell through the x402 paid-download endpoint: buy once in USDC, re-download free forever with the same wallet.

## The voice loop: hear, speak, move the face

Three endpoints, one design rule: free first, degrade cleanly.

**Voice in: `POST /api/asr`.** Speech to text on NVIDIA Riva ASR over NVCF gRPC. It exists because the browser's built-in `webkitSpeechRecognition` is Chrome and Edge only, ships your audio to a third party, and is absent in Firefox and most embeds. The endpoint takes raw audio bytes with the encoding declared by Content-Type, WAV, raw 16-bit PCM, FLAC, or Ogg/Opus, or base64 in a JSON body, up to 8 MB. WAV gets its 44-byte header parsed and stripped so Riva sees clean linear PCM at the header's declared rate. WebM/Opus, the Chrome MediaRecorder default, is deliberately rejected with a 415 and actionable guidance rather than mislabeled and garbled. Back comes the transcript with confidence, detected language, processed duration, and optional word-level timestamps.

**Voice out: `POST /api/tts/speak`.** Text to speech with a two-lane provider policy read straight from the handler: NVIDIA Magpie TTS leads whenever the free lane is configured, and OpenAI's speech API is the paid last-resort backstop. The Magpie clip is fully buffered before a single byte is written, so a mid-synthesis failure fails over cleanly instead of truncating audio on the wire. Text caps at 4096 characters, eleven voice ids from `nova` to `verse` are validated against one shared catalog so the picker and the synthesizer can never disagree, and the `x-tts-voice`, `x-tts-model`, and `x-tts-format` response headers always describe the bytes actually sent. The same id renders on either lane.

**The face: `POST /api/a2f`.** The piece that makes it feel alive. NVIDIA Audio2Face-3D, over bidirectional streaming gRPC, takes spoken audio and returns a per-frame facial animation track: `{ fps: 30, blendShapeNames, frames }`, each frame a timestamp and 52 ARKit weights. The lips are computed from the exact bytes you will play, not from text timing, so nothing can drift. Two ways in: post audio you already have, or post `{ text, voice }` and the server synthesizes the line with Magpie as WAV, animates that exact clip, and returns both audio and track in one round trip.

Every lane is metered because free upstream credit is still finite: signed-in callers get a per-user budget, anonymous callers a tighter per-IP one, and exceeding either returns a 429 rather than an outage for everyone else. And every lane answers a GET capability probe reporting whether it is configured, what encodings it accepts, and its native sample rate, so a client decides between the server lane and its in-browser fallback without sniffing browsers. An unconfigured lane returns a clean `not_configured`, and the client keeps working: browser speech recognition for hearing, amplitude lipsync for the mouth.

## Cloned voices and the rest of the voice rack

The default voices are free. Your own voice runs through ElevenLabs.

The Voice Lab at three.ws/voice records you reading a script, a live waveform and level meter showing input, with a 60-second hard stop, about 25 seconds recommended, and anything under 3 seconds rejected. The sample uploads as multipart form data to `POST /api/tts/eleven-clone`, which drives ElevenLabs Instant Voice Cloning server side, the API key never reaching the browser, and returns a `voice_id`. Your library of cloned voices lives client side, up to 20.

Playback goes through `POST /api/tts/eleven`: default model `eleven_flash_v2_5`, 500 characters per request, 1000 characters per hour per user metered through Redis, and every clean synthesis cached in R2 for 30 days keyed by the hash of voice, text, model, and settings, so identical lines are served from cache instead of billed twice.

A third synthesis lane, `POST /api/tts/edge`, speaks Microsoft Edge's neural voices over the same unofficial WebSocket protocol as the well-known edge-tts package, no API key required, cached in R2 for 30 days. It is the keyless fallback voice for surfaces like talk mode when an avatar has no cloned voice.

## The lipsync ladder: a face is never frozen

Four mouth drivers ship in production; the platform picks the best one available per avatar and per situation.

**Tier one, Audio2Face.** The A2F player takes the 30 fps ARKit track and maps it onto whatever morph convention the loaded GLB actually ships. ARKit, Ready Player Me, Avaturn, and MetaHuman style rigs are driven directly, each shape writing to its canonical morph. VRM and VRoid rigs that expose only monolithic vowel shapes, and Oculus-style viseme rigs, are driven by deriving each expression's activation from the ARKit frame, the inverse of the cross-format vocabulary maps. Playback samples the track by the audio element's current time and interpolates between frames, smooth at display refresh. There is no rig allowlist: an unknown convention degrades to no coverage and falls through to the next tier, never a frozen face.

**Tier two, spectral analysis.** The platform's own analyser reads the playing audio's frequency spectrum through a Web Audio AnalyserNode and maps energy bands to nine Oculus-named visemes: low bands drive the open vowels, mids the mid vowels and nasals, highs the sibilants, and a momentary amplitude dip reads as a lip closure. Weights are smoothed with an exponential moving average so the mouth eases between shapes. Pure in-browser analysis: no timing file to fetch, and the audio never leaves the page. The mic lab at three.ws/lipsync/mic demonstrates it on your own voice, and the live agent runtime connects it to its TTS output.

**Tier three, discrete visemes.** The TTS lab at three.ws/lipsync uses the open-source wawa-lipsync library, which emits one viseme code per frame from the audio, mapped onto the avatar's viseme morphs, with a live panel showing which viseme is firing each instant.

**Tier four, the jaw.** An avatar with no viseme morphs still gets `jawOpen` driven from the smoothed amplitude. Only a rig with no mouth morphs whatsoever gets nothing, and the runtime reports exactly that in its log rather than pretending.

## Where you feel it on the platform

**Talk mode.** Every avatar page can open a full-screen talk overlay: hold the button, speak, and the avatar answers out loud. The mic captures through the browser, replies stream from /api/chat, the voice synthesizes through the ElevenLabs proxy when the avatar's agent has a cloned `voice_id` and the Edge lane otherwise, and the mouth moves from the FFT of the actual TTS audio.

**Spatial voice in the coin communities.** The multiplayer worlds have real proximity voice chat, built as a proximity-gated WebRTC mesh. Audio is peer to peer; the room server only relays SDP and ICE and never carries a voice packet. A connection opens when a peer walks within 27 meters and tears down past 33, the hysteresis preventing thrash at the boundary, and the lower session id always dials so two people entering range at once never collide. Each remote voice runs through a Web Audio panner with HRTF panning and linear falloff, full volume within 3 meters, silent past 26, positioned at the speaker's world coordinates. Walk toward someone and they fade in from their direction. That is what makes a coin community feel like a gathering instead of a chat box with mascots.

**Talking avatar video.** three.ws/create/video renders a finished talking-head video from an avatar, a script or audio file, and a voice. Jobs submit to a LongCat-Video-Avatar-1.5 worker on Cloud Run and poll to completion through a job id. Media URLs are restricted to platform-controlled hosts so the worker can never be steered into fetching internal endpoints. Free-plan users get one lifetime generation; paid users are unlimited.

**The game NPCs and agents.** The same voice loop lets embodied agents in the worlds speak out loud rather than emitting text bubbles, faces driven by the same ladder. One pipeline, every surface.

## Who this is for

**The creator.** You perform. Record a reaction with your webcam, save it, flip it public, price it. Author a walk cycle in the Animation Studio and list the baked GLB for USDC. Your library is private by default, priced when you say so.

**The developer.** The whole loop as three functions and two clip stores, with capability probes, typed errors, and free default lanes. No key required to start speaking.

**The agent owner.** Your agent already has a wallet and a job. This stack gives it a face that moves and a voice that answers, including your own cloned voice, so the thing trading on your behalf can look up and tell you what it did.

## For developers: real endpoints, runnable code

The voice loop is one import:

```js
import { transcribe, speak, lipsync, say } from '@three-ws/voice';

// 1. Hear: speech to text (Riva ASR, free lane)
const { text } = await transcribe(audioBlob);

// 2. Speak: text to a voiced clip (Magpie free lane, OpenAI backstop)
const reply = await speak(`You said: ${text}`, { voice: 'nova' });
new Audio(reply.url).play();

// 3. Animate: ARKit weights for the exact bytes you will play
const face = await lipsync(reply.blob);
// face.blendShapeNames: ARKit-52 names
// face.frames: [{ t, w }] at 30 fps, sample by audio currentTime
```

Or collapse speech and face into one round trip:

```js
const { audio, animation } = await say('Welcome back.', { voice: 'nova' });
// audio.url to play, animation.frames to drive the face, perfectly aligned
```

The raw endpoints behind it, callable from anything:

```
POST https://three.ws/api/tts/speak    { text, voice }        audio bytes back
POST https://three.ws/api/asr          audio bytes in         { text, confidence }
POST https://three.ws/api/a2f          { text, voice }        { audio, animation }
GET  https://three.ws/api/tts/voices   the live voice catalog
GET  https://three.ws/api/a2f          capability probe: configured, fps, format
```

The mocap library is the same shape:

```js
import { saveClip, getClip, listClips } from '@three-ws/mocap';

const { id, slug } = await saveClip(recording, {
  name: 'Surprised reaction',
  tags: ['emote', 'reaction'],
  visibility: 'public',
}, { token: process.env.THREEWS_TOKEN });

const clip = await getClip(id);          // full frames, ready to replay
const pool = await listClips({}, { includePublic: true, limit: 100 });
```

And the MCP path puts all of it inside any assistant. `@three-ws/audio-mcp` is a Model Context Protocol server exposing five read-only tools: `text_to_speech`, `speech_to_text`, `audio_to_face`, `motion_capture_clips`, and `motion_capture_clip`. Register it in any MCP client:

```json
{ "mcpServers": { "audio": { "command": "npx", "args": ["-y", "@three-ws/audio-mcp"] } } }
```

Point `THREE_WS_BASE` at a deployment; an optional API key raises the metered limits and unlocks your private clips. Your assistant can now voice a line, transcribe a recording, produce a lipsync track, and pull a saved mocap clip, all from a conversation.

## Three tutorials in one place

**Record and sell a face clip.** Open three.ws/mocap-studio, start the camera, hold a neutral face and press Calibrate, then Record something worth keeping. Replay to check, name it, set visibility to public, and save. It is now in the public pool, replayable on any ARKit-faced avatar, and one `updateClip` call away from carrying a price.

**Give your agent a synchronized voice.** The full walkthrough is the voice-and-lipsync tutorial in the platform docs: pick a built-in voice or clone your own at three.ws/voice, see the visemes fire at three.ws/lipsync and three.ws/lipsync/mic, then bind a TTS provider to your agent so the runtime connects the analyser on speech start and releases it on speech end, easing the mouth back to rest.

**Ship an animation to the marketplace.** Open three.ws/pose, pose your avatar with the gizmos or drag IK, keyframe a short loop, preview it live. Save it, then sell: the studio bakes the animated GLB, uploads it, and lists it at your price with your payout wallet. A buyer pays USDC through x402 and re-downloads forever with the wallet that bought it.

## The honest limits

The mocap studio captures the face; body and hand capture are supported wire formats in the clip store and the runtime, not a webcam feature of the studio page today. A single clip caps at 18,000 frames and 2 MB inline, so long captures must be split. The free NVIDIA lanes are metered per user and per IP, and Riva and Audio2Face refuse the WebM container outright, so browser recordings must be decoded to WAV or PCM before upload; the endpoint says exactly that in the error rather than emitting a garbage transcript. Instant Voice Cloning is a paid-tier feature of the upstream provider, and when the account lacks it the error passes through verbatim. Talking avatar video is one free generation for life on the free plan. Spatial voice is a mesh, bounded by proximity gating, and peers behind symmetric NAT need TURN servers, supplied through a documented config hook rather than baked-in placeholder credentials. And the whole voice loop is built to be absent safely: every unconfigured lane reports `not_configured` and the client falls back, browser recognition for ears, amplitude for lips, so nothing hard-depends on any single provider.

## Why it compounds

Every clip saved makes the public pool a better starting library. Every avatar convention added to the morph and bone vocabularies makes every clip and lipsync track play on more rigs, because clips are stored as rig-agnostic weights, not baked skeletons. Every animation listed gives every agent and world one more motion to buy on the payment rails the platform already runs. Capture feeds the library, the library feeds the avatars, the avatars feed the worlds, and the marketplace pays the creators who started the loop.

## Where to start

Capture your face: three.ws/mocap-studio. Author an animation: three.ws/pose. Clone your voice: three.ws/voice. Watch visemes fire: three.ws/lipsync and three.ws/lipsync/mic. Render a talking video: three.ws/create/video. Wire it into code: `@three-ws/voice`, `@three-ws/mocap`, and `@three-ws/audio-mcp` on npm.

A statue with potential, a webcam, and three endpoints. The rest is live now.
