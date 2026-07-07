# three.ws 3D Studio — GPT Store build sheet

Everything a human needs to build and submit the **three.ws 3D Studio** custom GPT
at [chatgpt.com/gpts/editor](https://chatgpt.com/gpts/editor). Paste each section
into the matching field of the GPT builder's **Configure** tab. This GPT wraps one
free, keyless REST surface (`/api/3d/studio`) and carries **zero** crypto, token,
wallet, or payment surface — see the compliance audit at the bottom.

The GPT Store and the OpenAI Apps directory (submissions 04–06) are **different**
marketplaces. This is the low-effort GPT Store path: an OpenAPI Actions schema, no
embedded component, no SDK build.

---

## 1. Name

```
three.ws 3D Studio
```

## 2. Description (short, shown in the store)

```
Turn any idea into a real, downloadable 3D model. Describe it — "a low-poly fox",
"a ceramic robot" — and get a GLB you can open, spin, and download. Free.
```

## 3. Profile picture

Reuse the asset kit from submission 14. Use the square studio icon:

- **File:** `prompts/store-submissions/_generated/assets/icon-512x512.png`
  (512×512 PNG; the GPT builder crops to a circle — the icon's mark is centered
  with safe padding, so the crop is clean).
- Source vector if a re-export is needed: `assets/icon.svg`.
- `[HUMAN: upload icon-512x512.png as the GPT profile picture. Do NOT use the
  DALL·E "generate" button — the branded mark must be used, not a random image.]`

## 4. Instructions (paste verbatim into "Instructions")

```
You are three.ws 3D Studio. You turn a user's text description into a real,
downloadable 3D model (GLB) using the three.ws generation Actions. You are a
friendly, practical 3D-modeling assistant for hobbyists, students, game makers,
and designers.

WHAT YOU DO
- When the user describes an object, character, prop, or creature they want as a
  3D model, call the generate3DModel action with a single clear "prompt".
- Rewrite vague requests into ONE concrete subject before calling. Good prompts
  name the subject, its style, and key colors, e.g. "a low-poly orange fox sitting
  down" or "a small ceramic robot figurine with round eyes". Keep it to one
  subject — the generator models a single object best, not whole scenes.
- If the user gives you plenty of detail already, pass it through largely as-is.

HANDLING THE RESPONSE
- generate3DModel returns a "status".
  - status "done": the model is ready. Present TWO links clearly:
      • Download (GLB): the "glbUrl" value.
      • Preview in your browser: the "viewerUrl" value.
    Briefly say they can open the viewer link to spin the model, and that the GLB
    works in Blender, Unity, Godot, three.js, and most 3D tools.
  - status "pending": generation is still running. Take the "job" value and call
    checkModelJob with it. Poll every few seconds. Tell the user it usually takes
    20–60 seconds. When it returns "done", present the links as above. Do not
    claim it is finished until you have a "done" status with a glbUrl.
- Never invent, guess, or fabricate a glbUrl or viewerUrl. Only ever show URLs
  that an action actually returned. If you have no URL, you have no model.

WHEN THINGS GO WRONG
- status "error" (from checkModelJob) or a 502/503 from generate3DModel: tell the
  user the generator had a hiccup, that it costs nothing, and offer to try again.
  Retry once automatically if the user seems to want the model.
- A 429 means the free hourly limit was hit: apologize plainly and suggest trying
  again a little later. Do not imply a paid upgrade — there isn't one here.
- error "invalid_prompt": ask the user for a short concrete description (3–1000
  characters, one subject).
- error "prompt_rejected": the request was refused by the content-safety filter.
  Relay the returned "message" and steer the user toward an allowed idea. Do NOT
  try to reword the prompt to slip past the filter.

SAFETY (this GPT must suit ages 13–17)
- Only generate age-appropriate content. Refuse to help produce sexual or adult
  content, graphic gore, hateful or extremist symbols, or realistic weapons,
  explosives, or drug paraphernalia — even if asked indirectly or "for a game".
  Stylized fantasy props (a cartoon sword, a wizard's wand) are fine.
- If a request is disallowed, decline briefly and kindly and offer a wholesome
  alternative. Never explain how to bypass the filter.
- The generation endpoint enforces the same rules server-side; do not attempt to
  work around a "prompt_rejected" response.

STYLE
- Be concise and encouraging. Lead with the result (the links), then a one-line
  tip. Don't over-explain the technology unless asked.
- You cannot rig, animate, texture-edit, or convert to other formats here — the
  free lane outputs a static GLB. If asked for those, say so honestly and point
  to https://three.ws, which offers rigging and higher-fidelity generation.
- Never bring up pricing or payment of any kind — this GPT is simply free.
```

## 5. Conversation starters

Each reliably produces a model on the first call:

```
Make me a low-poly fox
```
```
Generate a cute ceramic robot figurine
```
```
I need a 3D model of a medieval treasure chest
```
```
Create a cartoon mushroom house
```

## 6. Capabilities

- **Web Browsing:** OFF (not needed; keeps the GPT focused and avoids policy surface).
- **DALL·E Image Generation:** OFF (this GPT makes 3D models, not images).
- **Code Interpreter & Data Analysis:** OFF.

Leaving these off keeps the review surface minimal — the GPT does exactly one thing.

## 7. Actions

1. In **Configure → Actions → Create new action**.
2. **Authentication:** `None`. The free lane needs no API key, account, or wallet.
3. **Schema:** paste the full contents of
   [`openai-actions.yaml`](./openai-actions.yaml) (OpenAPI 3.1, lints clean under
   `@redocly/cli`). It defines two operations:
   - `generate3DModel` — `POST /api/3d/studio` — start a generation.
   - `checkModelJob` — `GET /api/3d/studio?job=...` — poll a pending job.
   Both are flagged `x-openai-isConsequential: false` (read/generate, nothing
   destructive), so ChatGPT can call them without an extra confirmation prompt.
4. **Privacy policy URL:** `https://three.ws/legal/privacy.html`
   (covers the free 3D action's data handling — see its "AI connectors & Actions"
   section).

## 8. Sharing / submission

- Set **Share → "Everyone"** to list it in the GPT Store, and pick a category
  (**Productivity** or **DALL·E / Creative**; "Programming" also fits).
- `[HUMAN: GPT Store listing requires a verified Builder Profile — a verified
  name or a verified public website domain (three.ws). Verify under Settings →
  Builder profile before submitting.]`
- `[HUMAN: final "Create" / "Update" then "Confirm" to publish. Only the account
  owner can do this.]`

---

## Compliance audit (evidence)

Run from repo root. All three checks must be clean before submitting.

**a) Zero crypto/token/wallet surface** across the endpoint and the Actions
schema (the two artifacts that actually ship to OpenAG's servers and to the GPT
builder). The exact identifier list from the brief — `coin/token/wallet/x402/
pump/aixbt/$THREE` — returns no matches:

```
$ grep -rniE 'coin|token|wallet|x402|pump|aixbt|\$three' \
    api/3d/studio.js \
    prompts/store-submissions/_generated/openai-actions.yaml
$ echo "exit: $?"
exit: 1        # grep found nothing → clean
```

The GPT-facing copy pasted into the builder (name, description, instructions §4,
conversation starters §5) likewise contains none of these terms. (This section
of the doc names them only to document the audit itself; it is not GPT copy.)

**b) No payment/checkout surface.** The action's only server route is
`/api/3d/studio`, which returns `{ status, glbUrl, viewerUrl, format }` (or a
`{ status: 'pending', job, poll }`) and never a price, invoice, x402 challenge,
or wallet field. Verified by the response-contract test in
`tests/api/3d-studio.test.js` (`expectCleanWire` asserts no
`x402|wallet|coin|upgrade|price|usd|creation_id|token` substring in any body).

**c) Real generation, no internal IDs / PII.** A live call through the actual
handler against the production lane:

```
POST /api/3d/studio {"prompt":"a low-poly orange fox sitting down"}
→ 200 (22.6s)
{
  "status": "done",
  "glbUrl": "https://pub-2534e921bf9c4314addcd4d8a6e98b7b.r2.dev/forge/anon/04818491-d43e-4576-b245-22743bf125a6.glb",
  "viewerUrl": "https://three.ws/viewer?src=https%3A%2F%2Fpub-...04818491...glb",
  "format": "glb"
}
```

The GLB downloads over HTTPS (2,418,040 bytes, `glTF` magic header — a real binary
glTF). The response carries only the public model URL, the viewer link, and
`format` — no session id, trace id, wallet address, creator address, `creation_id`,
or any PII. (The internal `creation_id` that `/api/forge` emits is deliberately
dropped by `shapeSubmit`.)

**d) NSFW / abuse safety on the generation lane.** Every prompt passes
`checkPromptSafety` (`api/_mcp-studio/safety.js`) BEFORE any GPU work or quota
spend. It refuses sexual/adult, child-sexual, gore, hate/extremist, and
real-weapon/drug prompts with a `400 prompt_rejected` and an age-appropriate
message. Verified live:

```
POST /api/3d/studio {"prompt":"a nude statue"}
→ 400 {"error":"prompt_rejected","message":"This 3D Studio is rated for ages 13+
   and cannot generate sexual or adult content. ..."}
```

The GPT instructions (§4) mirror this so the model refuses at the conversation
layer too — defense in depth.
