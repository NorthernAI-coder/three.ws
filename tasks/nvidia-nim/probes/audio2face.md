# Probe: NVIDIA Audio2Face-3D (audio→ARKit blendshape lip-sync)

**Date:** 2026-06-11 · **Task:** T4.3 (Phase 4, research-only spike) · **Key:** `NVIDIA_API_KEY` (`nvapi-…`, redacted)

## Verdict: ⛔ **NO-GO (for now)** — conditional revisit

Audio2Face-3D is technically a beautiful fit (it emits exactly the ARKit-52 +
viseme blendshapes our flagship rigs already carry, over the *same* NVCF gRPC
transport Phase 2 TTS already proved). **But it is not invocable on our free
NVIDIA Developer key** — the hosted functions return `NotFound … for account`
while every freely-callable NIM (Magpie TTS, Parakeet) routes fine on the same
key — and self-hosting needs a datacenter GPU this platform doesn't run.
Meanwhile the platform **already ships working, free, zero-infra client-side
lip-sync** driving the same morph targets. The ROI isn't there until an NVAIE
entitlement is enabled AND there's product demand for film-grade lip-sync.

---

## 1. Invocability — hosted gRPC functions exist, but NOT entitled to this account

Audio2Face-3D is published as **hosted NVCF gRPC functions** on `build.nvidia.com`
(three baked-in voices/rigs), reachable on the **identical transport Phase 2 uses**:
`grpc.nvcf.nvidia.com:443`, TLS, per-call metadata `function-id` + `authorization: Bearer $NVIDIA_API_KEY`.

| model | function-id (published on build.nvidia.com) |
|-------|---------------------------------------------|
| Claire | `0961a6da-fb9e-4f2e-8491-247e5fd7bf8d` |
| Mark   | `8efc55f5-6f00-424e-afe9-26212cd2c630` |
| James  | `9327c39f-a361-4e02-bd72-e11b4c9b7b5e` |

It is **absent from this account's NVCF function list** — `GET https://api.nvcf.nvidia.com/v2/nvcf/functions`
returns 162 functions, none Audio2Face/A2F (only the same Riva/Magpie/Parakeet set Phase 2 found).
That list shows *account-visible* functions, so absence already hints at no entitlement.

### Live gRPC probe (the decisive evidence)

NVCF validates `function-id` + auth at **stream setup**, before the backend proto
handler runs (established in `probes/tts.md`). So a unary call to *any* method path
with the right metadata reveals account-level authorization via the gRPC status code.
Probe used the published function-ids with the real good key, a deliberately-bad key,
and a nonexistent UUID (transport: `@grpc/grpc-js` 1.14.4, already a project dep):

```
Claire     key=good -> NOT_FOUND          | Function '0961a6da-…': Not found for account 'iknhvX2wHdYV…'
Mark       key=good -> NOT_FOUND          | Function '8efc55f5-…': Not found for account 'iknhvX2wHdYV…'
James      key=good -> NOT_FOUND          | Function '9327c39f-…': Not found for account 'iknhvX2wHdYV…'
Claire     key=BAD  -> PERMISSION_DENIED  | Authorization failed
NONEXISTENT-uuid    -> NOT_FOUND          | Function '0000…': Not found for account 'iknhvX2wHdYV…'
```

### Control probe (proves the probe distinguishes "entitled" from "not")

Same method-probe against functions this account **is** entitled to:

```
Magpie-TTS (877104f7-…)  bogus-method -> UNIMPLEMENTED       (routed past NVCF gate → backend rejected the method)
Parakeet-ASR (22164014-…) bogus-method -> DEADLINE_EXCEEDED  (routed past NVCF gate → backend held the stream)
```

**Interpretation:** entitled functions route *past* the NVCF gate and fail at the
backend (`UNIMPLEMENTED`/`DEADLINE_EXCEEDED`). The A2F function-ids instead die at
the gate with `NotFound … for account` — identical to a nonexistent UUID, and
distinct from the bad-key `PERMISSION_DENIED`. So: **the key authenticates fine, but
the A2F-3D functions are not entitled to this free Developer account.** The published
function-ids are correct (from build.nvidia.com); staleness is not the cause — the
control proves the gate, not the IDs, is the blocker.

### Why: A2F-3D sits behind an NVAIE entitlement, not the free NIM tier

build.nvidia.com advertises the A2F API as key-accessible "under the NVIDIA Cloud
Agreement," but in practice the hosted functions require an **NVIDIA AI Enterprise
(NVAIE) Essentials evaluation** enabled on the account (NVIDIA dev-forum threads
describe an "AI Enterprise Essentials (Evaluation) workaround" to unlock it; the
container/self-host path explicitly "requires an active NVAIE subscription — contact
Sales"). This is a **manual developer.nvidia.com / sales action**, not a code change,
and not the free, no-SLA tier the rest of this plan is built on.

### What a caller would need (if entitled)

- **gRPC client-streaming**, not a fetch. `@grpc/grpc-js` (already a dep) + the
  `nvidia_ace` A2F protos (vendor them, exactly like the Riva TTS protos in
  `api/_lib/riva-protos/`). The official client is `nim_a2f_3d_client.py` +
  `nvidia_ace-*.whl`; for Node we'd vendor the protos and load via `proto-loader`.
- **A persistent streaming connection per utterance** — client streams an audio
  header + PCM chunks + face/emotion params up; server streams blendshape frames +
  emotion + the echoed audio back. This is a **bidirectional/long-lived stream**, a
  poor fit for a stateless Vercel function (short timeouts, no streaming-in). It
  belongs in a **worker** (`workers/`) holding the gRPC stream, or a pre-bake job.

---

## 2. Output mapping — near-perfect, ARKit-52 → our rigs is essentially 1:1

**A2F-3D emits ARKit blendshapes at 30 fps**, plus inferred emotion coefficients
(NVIDIA docs + forums confirm "ARKit Blendshapes"; "30 inferences per second … playback
at 30 FPS"). Output is a stream of named blendshape weight frames (the sample client
writes them as `name,value,timecode` keyframe rows).

Our platform is **already ARKit-52 native** — and not just in code. Inspecting the
**actual served GLB rigs** in `public/avatars/` (parsed the GLB JSON chunk for
`mesh.extras.targetNames`):

| avatar (served) | morph targets | ARKit/viseme present? |
|-----------------|---------------|------------------------|
| `default.glb` (flagship demo) | **67** | ✅ full — `jawOpen, mouthClose, mouthFunnel, mouthPucker, mouthSmileLeft, viseme_aa…viseme_U` |
| `realistic-female.glb` | **60** | ✅ full ARKit + 15 visemes |
| `readyplayerme.glb` | 2 | ❌ only `mouthOpen, mouthSmile` |
| `michelle.glb`, `fox.glb`, Mixamo/`xbot`/`cesium-man` | 0 | ❌ bone-animated, no blendshapes |

And `src/runtime/arkit52.js` already defines the canonical 52 ARKit names + 15 visemes
and resolves alt-naming (snake_case, `_L/_R`, Mixamo) via `resolveMorphTargets()` /
applies via `setCanonicalMorph()`. So A2F output would drop straight into the existing
morph pipeline with **near-zero remapping** for the ARKit-rigged avatars.

**Caveat:** A2F only benefits avatars that *have* the blendshapes. The flagship
`default`/`realistic-*` rigs are fully covered; `readyplayerme` is minimal; the
Mixamo/stylized rigs (michelle, fox, xbot) have **zero** morph targets and would stay
on the existing jaw-bone/no-face fallback regardless. A2F is not a universal upgrade.

---

## 3. Architecture fit — two modes, neither cheap, both redundant with what ships today

**The platform already does free, instant, client-side lip-sync** that writes the same
morphs A2F would:
- `src/lip-sync-analyser.js` — real-time **frequency-band → viseme** lip-sync from a Web
  Audio `AnalyserNode` tapped off the playing TTS audio (free, ~0 latency, runs in-browser).
- `src/runtime/lipsync.js` — text→phoneme→viseme heuristic fallback when no audio stream.
- `src/agent-avatar.js` — composites lip-sync **with a 6-emotion empathy layer** and a
  `jawOpen`-only fallback for non-ARKit rigs.

A2F-3D would replace the *analyser* path with phoneme-accurate, emotion-aware blendshapes
— better realism, but:

- **Realtime per-utterance mode:** client (or worker) streams TTS PCM up to A2F, applies
  the returned 30 fps blendshape frames synced to audio playback. Adds a gRPC round-trip +
  generation latency on top of TTS (TTS itself is already 1.3–2.1 s/sentence per
  `probes/tts.md`), needs a stateful gRPC worker, burns per-utterance credits. The current
  analyser lip-sync starts the instant audio plays, for free.
- **Pre-bake per clip mode:** generate the blendshape track once per TTS clip, cache it in
  R2 alongside the audio, replay both. Fits *canned/cached* avatar lines well, eliminates
  hot-path latency, but does nothing for live, dynamically-generated chat speech (the main
  talking-avatar use case) and still needs the entitlement + a batch worker.

**Audio handoff (Phase 2 → A2F):** workable. Magpie TTS returns WAV (44.1 kHz LINEAR_PCM,
server-wrapped); A2F wants "wav 16-bit PCM." We already have the PCM buffer server-side
before WAV-wrapping (`api/_lib/tts-nvidia.js`) and the raw stream client-side
(`src/runtime/speech.js` MediaElementSource). A resample 44.1k→16k is the only massaging.
So the audio pipeline is *not* the blocker — the entitlement and the redundancy are.

---

## 4. Effort estimate (only relevant if entitlement is later obtained)

If an NVAIE evaluation unlocks the functions and there's product demand, this is a
~**4–5 day** Phase 5 (kept here for the future, NOT added to the live checklist since
it's a no-go today):

| size | task |
|------|------|
| ~1 d | Vendor `nvidia_ace` A2F protos + `@grpc/grpc-js` client in a **worker** (mirror `api/_lib/riva-protos/` + descriptor approach); client-streaming send (audio header + PCM chunks + params), receive blendshape/emotion frames. |
| ~1 d | **Pre-bake pipeline**: per-TTS-clip blendshape-track job → cache `{audioUrl, blendshapeTrack}` in R2; resample 44.1k→16k; idempotent + keyed by clip hash. |
| ~1–2 d | **Client blendshape-track player**: 30 fps track → `setCanonicalMorph()`, sample-accurate sync to audio playback timeline, composite *over* the emotion layer; feature-flag fallback to the existing analyser lip-sync. |
| ~0.5 d | Wire into `agent-avatar.js` / `avatar-embed.js` behind a flag (free analyser stays the default lane — never the *only* lane, per plan doctrine). |
| ~0.5 d | Tests: proto/transport mock, track-player morph application, fallback-when-unentitled, ARKit-name mapping. |

---

## Revisit trigger

Promote to a real Phase 5 task only when **both** hold:
1. An NVAIE Essentials evaluation (or paid entitlement) is enabled on the NVIDIA account
   **and** a re-run of the gRPC probe above returns something other than
   `NotFound … for account` for Claire/Mark/James.
2. There's product demand for film-grade, phoneme/emotion-accurate lip-sync beyond the
   current free analyser path (e.g. premium/branded avatars, marketing renders).

Until then the free client-side lip-sync is the right lane: it's instant, costs nothing,
needs no GPU or entitlement, and already drives the same ARKit/viseme morphs.

---

## Reproduction summary (key redacted)

- List account functions: `GET https://api.nvcf.nvidia.com/v2/nvcf/functions` (Bearer key) — no A2F entry.
- gRPC gate probe: `@grpc/grpc-js` unary call to `grpc.nvcf.nvidia.com:443` with metadata
  `function-id:<A2F id>` + `authorization: Bearer <key>` on any method path; read the gRPC
  status. Good key + A2F id → `NotFound (Not found for account)`; bad key → `PermissionDenied`;
  Magpie/Parakeet ids (control) → `Unimplemented`/`DeadlineExceeded` (routed past the gate).
- Rig inspection: parse `public/avatars/*.glb` JSON chunk, read `meshes[].extras.targetNames`.
  Probe scripts were temporary (run from `scripts/`, deleted after); no scratch files committed.
</content>
