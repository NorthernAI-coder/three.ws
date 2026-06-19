# Task 05 — The Brain Studio (persona live editor)

> Read `prompts/living-agents/00-README.md` and `CLAUDE.md` first. Depends on Task 01.
> Builds on the real persona system (`api/agents/_id/persona.js`, `persona_prompt`,
> `persona_tone_tags`, `agent_versions`) and real chat (`api/chat.js`).

## Mission

Let users **shape their agent's mind and feel the change land instantly on the visible
avatar.** Today persona is a 5-question interview that produces a hidden `persona_prompt`.
Turn personality into a tangible, editable thing — traits and tone you adjust — with a
live avatar that immediately re-greets, re-speaks, and re-behaves in the new character.

## The innovation bar

Editing a system prompt in a textarea is what everyone does. The game-changer: a
**brain you sculpt with direct feedback.** Adjust a "warmth" or "formality" or "risk
tolerance" trait and the live `<agent-3d>` beside you speaks a fresh greeting in the new
register within a second (real `/api/chat` call), its tone chips update, and you can
**A/B two personas side by side** and pick a winner. The user is directing a character,
not writing config. Make it feel like a soundboard for a personality.

## What to build

1. **Trait model over the real persona.** Decompose/extend the persona into editable,
   meaningful dimensions (e.g. warmth, formality, verbosity, humor, proactivity, risk
   tolerance, domain expertise emphasis). These must map to the real stored persona —
   either by structuring `persona_prompt` generation or storing structured traits that
   compile into the system prompt. Keep `agent_versions` history working; every save is a
   real version with a changelog note.
2. **Live preview, real inference.** A live `<agent-3d>` that, on any trait/tone change
   (debounced), calls the real `/api/chat` with the candidate system prompt and speaks a
   fresh greeting/sample line — using the agent's real voice config (`voice_provider`,
   `voice_id`). No fake/canned preview text. Show streaming tokens. Respect WebGL budget.
3. **Tone chips & vocabulary.** Edit `persona_tone_tags` as chips; optionally surface the
   `vocabulary_samples` the persona architect produces. Re-running the extraction
   interview remains available (`POST /api/agents/:id/persona/extract`, real, rate-limited).
4. **A/B persona compare.** Two live avatars, two candidate personas, the same prompt to
   both, side by side; "promote A" / "promote B" writes the winner as the real persona
   version. This is real dual inference, honestly labeled.
5. **Bus integration.** On save, emit `brain:updated` so the Companion (Task 02) re-greets
   everywhere and the rest of the platform reflects the new character.

## Wiring & real-API mandate

- Real `/api/chat` for every preview and A/B line; real persona persistence + versioning;
  real voice synthesis through the existing voice path.
- No simulated personality preview, no placeholder traits unwired from the stored prompt.

## Definition of done

- [ ] Traits/tone edit the real persona; saving creates a real `agent_versions` entry.
- [ ] Changing a trait triggers a real streamed `/api/chat` greeting in the agent's real
      voice on the live avatar within ~1s (debounced); no canned text.
- [ ] A/B compare runs real dual inference and promotes a real winning version.
- [ ] `brain:updated` emitted; Companion re-greets (verify with Task 02 if present, else
      verify the event fires).
- [ ] Loading/streaming/empty/error states designed; rate limits on extraction respected.
- [ ] No console errors/warnings; `npm test` passes; `git diff` reviewed.
- [ ] Changelog entry (`feature`) + `npm run build:pages`.

## Self-improvement pass

Ask: does the user feel like a director or a form-filler? Add the elevating layer — a
"personality DNA" shareable card, presets that are real starting personas (not fake
samples), a diff view showing how a trait change rewrote the underlying prompt, or
letting the agent itself suggest a trait adjustment based on reflection (Task 04). Build
the best one, fully wired.

## When done

Delete this file. Report the trait→prompt mapping and how live preview calls real inference.
