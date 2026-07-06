# 16 — Embodiment: `POST /api/x402/embody` — an agent buys itself a body

Read `prompts/x402-catalog/00-CONTEXT.md` first and obey every rule in it. Work alone, finish
100%, never ask questions.

## Mission

The company thesis — give every AI agent a 3D body — is absent from the x402 catalog. Ship one
paid call: agent description (or selfie URL) in → rigged 3D avatar + voice + one-tag embed
snippet out. An external agent on any framework pays ~$1 USDC and gets an embeddable, animated,
talking presence. This is the flagship listing.

## Context

All the parts exist; this prompt wires them into one purchasable call. Spend real time on
discovery before writing code — read, in order:
- **Avatar generation:** the `forge_avatar` MCP tool implementation (grep under `api/_mcp3d/`)
  — it already chains mesh generation + auto-rigging with a humanoid gate. Also
  `text_to_avatar`. Reuse whichever chain is solid; note its latency profile (job-based?).
- **Agent records:** `api/agents.js` + `api/agents/` — how a three.ws agent is created/stored
  (id, name, personality, model GLB, voice). The embody call should create a real agent record
  so the result plugs into everything agents already get (profile page, chat, embed).
- **Embed:** the one-tag embed surface — `api/embed/`, `public/`/`src/` embed widget code, and
  how existing agent embeds are generated (grep for the embed snippet template / `<script`
  tag with an agent id). `tests/api/agents-embed.test.js` exists — read it.
- **Voice:** how agents get a TTS voice today (`api/tts/voices.js`, agent record fields,
  `tests/api/agents-voice.test.js`).
- **x402 job pattern:** `api/x402/forge.js` (paid submit + free poll via
  `api/_lib/forge-job-token.js`). Avatar generation is slow — embody MUST be job-based:
  paid submit returns a job token; free polling returns progress then the final bundle.

## Tasks

1. Contract: `POST /api/x402/embody`
   `{ name, prompt?, image_url?, personality?, voice? }` — exactly one of `prompt`/`image_url`
   required; `name` required (≤64 chars); `voice` optional (validate against the real voice
   list; default sensibly). 400s with precise messages.
2. On settlement: run the avatar chain (reuse `forge_avatar` internals — humanoid gate
   included; a non-humanoid result follows the platform's existing fallback semantics, never a
   T-pose), create the agent record with the generated GLB + personality + voice, produce the
   embed snippet.
3. Final job result:
   `{ agent_id, glb_url, viewer_url, profile_url, embed_html, voice, chat_url }` — every URL
   must actually resolve (verify in your end-to-end test). `embed_html` is the real one-tag
   embed other agent embeds use.
4. Price: `priceFor('embody', '1000000')` ($1.00). Bazaar description, uniqueness first:
   "Give your agent a 3D body — one x402 call returns a rigged, animated, talking avatar plus
   a one-tag embed for any website. The only embodiment endpoint in the x402 ecosystem.
   $1 USDC, no account."
5. Anything validatable pre-settlement (inputs, lane env, voice id) throws BEFORE payment;
   post-settlement chain failures mark the job failed with a clear stage + reason (and note in
   the description that generation failures are re-runnable via the returned job semantics —
   match whatever retry story forge jobs already have).
6. **Verify one real end-to-end embody**: run the chain (bypass payment the same way existing
   x402 tests/dev flows do — find the dev/test settlement path in `api/_lib/
   x402-paid-endpoint.js` or existing tests), poll to done, open every returned URL, load the
   embed snippet on a blank local page (`npm run dev`) and confirm the avatar renders and
   idles. Record evidence (URLs, agent id) in your report.
7. **Tests** in `tests/api/x402-embody.test.js`: validation matrix, job lifecycle shape,
   agent-record creation, embed snippet correctness (matches the real embed template), voice
   validation. Chain boundaries fixture-backed with real captured shapes. Targeted vitest +
   `npm run audit:x402-catalog` until green.
8. **Docs:** `docs/embody.md` linked from `docs/start-here.md` — the story, the contract, one
   runnable example, what the buyer gets. Changelog entry (`feature`), holder-readable: agents
   can now buy themselves a 3D body in one call.
9. Commit (explicit paths) and push per 00-CONTEXT.

## Definition of done

One paid call produces a real agent with a rendering, embeddable, voiced avatar — verified
end-to-end in a browser; every returned URL live; tests + audit green; docs + changelog
shipped; committed, pushed.
