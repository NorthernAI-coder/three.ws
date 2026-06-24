# Build `@three-ws/audio-mcp` — speech, lipsync, and motion capture over MCP

You are building a new MCP server for **three.ws** (read `CLAUDE.md` — its rules override defaults). This server exposes the platform's audio/animation pipeline: text-to-speech, speech-to-text, audio-to-face lipsync, and motion capture — the voice/animation layer for 3D agents.

## Read first (in order)
1. `CLAUDE.md`
2. `mcp-prompts/_SHARED-CONVENTIONS.md` — follow the package pattern precisely (copy `packages/intel-mcp`).
3. `packages/intel-mcp/` (read-only template) and `packages/avatar-agent-mcp/` (it has a `speak`/TTS tool — reuse the same pattern, don't contradict it).
4. **The real backend:** `api/tts/`, `api/asr.js`, `api/a2f.js` (audio-to-face), `api/mocap/` (motion capture). Read each handler. Confirm input/output shapes (audio in/out encoding, blendshape/animation output for a2f, mocap output format) and any size limits. Build against reality.

## What this server is
The "agents that talk and move" surface. TTS, ASR, audio-to-face lipsync (blendshapes), and mocap all exist as real endpoints. This server packages them so an MCP client can drive a 3D avatar's voice and animation.

## Proposed tools (confirm/adjust against the real routes)
| Tool | R/W | Wraps | Returns |
|------|-----|-------|---------|
| `text_to_speech` | read | POST `api/tts` | synthesized audio (URL or encoded) |
| `speech_to_text` | read | POST `api/asr` | transcript |
| `audio_to_face` | read | POST `api/a2f` | lipsync blendshape/animation track |
| `motion_capture` | read | POST `api/mocap` | extracted motion/animation data |

## Inputs / auth
All inputs are **runtime** (text, audio, references). Be deliberate about payload size — prefer URLs/handles over inlining large base64 audio where the route allows. Wire any real keys via `server.json` env vars. These transform input → output without mutating platform state, so `readOnlyHint:true`, `openWorldHint:true`, `idempotentHint:false`.

## Package identity
- npm `@three-ws/audio-mcp` · mcpName `io.github.nirholas/audio-mcp` · dir `packages/audio-mcp` · bin `audio-mcp`

## Done means
`_SHARED-CONVENTIONS.md` → Definition of done. Verify `text_to_speech` and `speech_to_text` round-trip via `npm run inspect`. Add a `data/changelog.json` entry (tags `sdk`,`feature`), run `npm run build:pages`. **Do not commit or push** unless asked.
