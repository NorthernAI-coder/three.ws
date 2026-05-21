# Task: Background music, per-style tracks, crowd ambience for /club

## Repo context

Working tree: `/workspaces/three.ws`. Today `/club` is silent — no
`<audio>` element in [pages/club.html](../../pages/club.html), no
Web Audio code in [src/club.js](../../src/club.js). A pole-dance club
without music isn't a pole-dance club.

The `STYLES` map in
[api/x402/dance-tip.js](../../api/x402/dance-tip.js) lists clips by
name. Adding a `track` field per style lets the client play the
matching music while the clip runs.

## Rails (CLAUDE.md — non-negotiable)

- Real licensed audio files committed under `public/club/audio/`.
  Provenance recorded in `public/club/audio/LICENSES.md`.
- No `setTimeout`-faked beat detection. Real `AnalyserNode` from the
  Web Audio API.
- Autoplay policies: never play audio until the user has interacted
  with the page. The first tip click is the gesture.
- Errors handled at boundaries — `AudioContext` may be suspended;
  surface the resume to the user.

## What to implement

### Step 1 — author / source audio cuts

Six tracks under `public/club/audio/`:

| File | Style | Length | License |
|---|---|---|---|
| `ambience.ogg` + `.mp3` | crowd/room | ~60s loop | CC0 ambient |
| `rumba.ogg` + `.mp3` | rumba | ~30s loop | CC-BY licensed |
| `thriller.ogg` + `.mp3` | thriller | ~30s loop | CC-BY |
| `hiphop.ogg` + `.mp3` | hip hop | ~30s loop | CC-BY |
| `capoeira.ogg` + `.mp3` | capoeira | ~30s loop | CC-BY |
| `silly.ogg` + `.mp3` | silly | ~30s loop | CC-BY |
| `pole.ogg` + `.mp3` | pole choreography (spin/climb/combo) | ~30s loop | CC-BY |

Both formats so `<audio>` picks the supported one. Targets:

- Mono 192k MP3 for size; stereo q4 OGG Vorbis for quality.
- Loud enough to mix above ambience but not clip after bloom-era
  postprocessing audio sidechain — peaks at –6 dBFS.
- Loop points authored cleanly (no clicks at the seam).

License provenance + attribution in
`public/club/audio/LICENSES.md` (extend if file exists; create if
not).

### Step 2 — `src/club-audio.js`

A small audio mixer:

```js
export class ClubAudio {
  constructor() {
    this.ctx = null;          // AudioContext, lazy-created
    this.master = null;       // GainNode → ctx.destination
    this.ambience = null;     // { source, gain }
    this.style = null;        // { name, source, gain }
    this.analyser = null;     // AnalyserNode wired to master
    this._buffers = new Map();// styleName → AudioBuffer
    this.muted = false;
  }

  async ensureContext() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.75;
    this.master.connect(this.ctx.destination);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.master.connect(this.analyser);
  }

  async loadBuffer(name, url) { /* fetch + decodeAudioData */ }

  async startAmbience() { /* loop ambience.ogg at 0.35 gain */ }

  async fadeToStyle(name, durationMs = 800) {
    // Crossfade ambience down to 0.1, style track up to 0.75.
  }

  async fadeOutStyle(durationMs = 800) {
    // Style back to 0, ambience back to 0.35.
  }

  getPeak() {
    // Sample analyser frequency bin, return 0..1 normalized peak.
  }

  setMuted(v) { this.master.gain.linearRampToValueAtTime(v ? 0 : 0.75, this.ctx.currentTime + 0.15); this.muted = v; }
}
```

No global side-effects on import — instantiated lazily in
`bootstrap()`.

### Step 3 — wire to tip flow

In [src/club.js](../../src/club.js) `tipDancer()`:

- Before opening the wallet modal:
  `await audio.ensureContext()` — this is the user gesture.
- After successful settlement and `station.startPerformance(ticket)`:
  `audio.fadeToStyle(styleAudioFor(ticket.dance))`.
- After `_endPerformance` resolves in `PoleStation.tick`: emit a
  custom event the page listens for and calls
  `audio.fadeOutStyle()`.

`styleAudioFor()` maps:

| Dance | Track |
|---|---|
| `rumba` | `rumba` |
| `silly` | `silly` |
| `thriller` | `thriller` |
| `capoeira` | `capoeira` |
| `hiphop` | `hiphop` |
| `spin` / `climb` / `combo` | `pole` |

The `STYLES` map in
[api/x402/dance-tip.js](../../api/x402/dance-tip.js) gains a `track`
field so the ticket carries the audio name back to the client. Add
it to `OUTPUT_SCHEMA`.

### Step 4 — ambience starts on first interaction

If the audio context creates successfully, `startAmbience()` runs
once and loops for the session. Add a small "audio off / on" pill
to the top bar in [pages/club.html](../../pages/club.html) bound to
`audio.setMuted()`. Persist preference to
`localStorage.club.audio.muted`.

### Step 5 — beat → light bridge (handoff to prompt 04)

Expose `window.__clubAudio = audio` (or pass via a small event bus)
so prompt 04's rim-light pulse code can call `audio.getPeak()` each
frame. If no audio context yet, the rim-light fallback sine kicks in
(prompt 04 already handles that case).

### Step 6 — accessibility

- Captions / status: when a track plays, the existing
  `setStatus(...)` helper announces it ("Now playing: Rumba mix")
  for screen readers (`role="status"` on `#club-status`).
- Respect `prefers-reduced-motion` for the bloom flicker, not the
  audio.

### Step 7 — manual end-to-end

```bash
npm run dev
```

Visit `/club`. The page is silent until you click a Tip button —
that's the user gesture. After settlement:

- Ambience fades down.
- Style track plays in sync with the dance clip.
- Rim lights pulse to the audio beat (if prompt 04 already
  shipped).
- Audio fades back to ambience when the dance ends.
- Mute toggle silences everything.

### Step 8 — tests

`tests/club-audio.test.js`:

- Stub `AudioContext` with a fake context exposing
  `decodeAudioData`, `createGain`, etc.
- Assert `fadeToStyle` schedules the right `linearRampToValueAtTime`
  calls.
- Assert mute toggle ramps master gain to 0 and back.

## Definition of done

- Six tracks committed under `public/club/audio/` with attribution.
- `src/club-audio.js` mixer wired into the tip flow.
- Mute pill in the top bar with persisted preference.
- Real browser smoke: settle a tip, hear the matching track, see
  beat-synced rim lights (if prompt 04 is in).
- Tests green.

## Constraints

- Do not autoplay any audio before a user gesture. Browsers will
  silently block and the page will look broken.
- Do not ship audio files >2 MB each. Cut them shorter or re-encode.
- Do not pre-decode all six tracks on page load. Decode lazily on
  first request per style.
- Do not introduce a heavyweight audio library (Howler, Tone.js).
  Web Audio API directly.
