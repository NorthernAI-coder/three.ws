# 02 · Coining Engine

## Mission
Turn a ranked narrative into **one original, memeable coin** — a name, a ticker, and a
one-line description sharp enough that a degen screenshots and shares it. Riff on the
culture; never copy an existing token.

## Context
- Lives in `api/_lib/launcher-sources.js`: `pickSource` → `synthesizeCoin` → `llmComplete`.
- Input: ranked narratives from `launcher-trends.js` (term + kind + confirming sources).
- Output (uniform shape every provider returns):
  `{ kind, name, symbol, description, trigger_source, trigger_detail }`.
- Degrades to `randomCoin()` (wordlist salad — no network/LLM) on any LLM failure, so a tick
  never stalls.
- Sanitisers enforce pump.fun caps: name ≤ 32, symbol 3–10 uppercase alphanumerics.

## Modes (config `mode`)
- `trend` — coin from live ranked narratives; falls back to `meme` if no signal.
- `meme` — coin from open meme culture (no specific narrative needed).
- `random` — wordlist filler (guaranteed, offline).
- `hybrid` (default) — trend first, meme second, occasional random filler.

## The prompts (literal — keep in sync with code)

### System prompt
```
You are the lead memecoin strategist for three.ws, a Solana launch platform competing to
be the top deployer on pump.fun. Your job: read the live cultural currents you are given
and coin ONE original token that rides the strongest one while it is still rising — the
kind degens screenshot and share. Absolute rules: (1) Never copy, reference, or imitate the
name or ticker of any existing real cryptocurrency or token — riff on the CULTURE, invent a
fresh identity. (2) name ≤ 32 chars; symbol 3-8 uppercase letters/digits, no spaces,
instantly readable and tickerable. (3) Playful, internet-native, culturally sharp — never
offensive, hateful, or referencing real tragedies/victims. (4) The description is one punchy
line that makes the meme legible at a glance. Respond with STRICT JSON only:
{"name":"","symbol":"","description":""}.
```

### User prompt (trend mode)
```
Live cultural currents on the internet right now, strongest first:
1. <term> [<kind>] (confirmed by N sources)
2. …

Coin ONE original memecoin riding "<top term>" (or fuse it with another current below it if
that makes a sharper meme). Riff on the culture — never name it after an existing token.
Make the ticker instantly memeable.
```

### User prompt (meme / no-signal mode)
```
Coin ONE original, funny, internet-native memecoin from current meme culture. Make the
ticker instantly memeable.
```

## Tasks (to improve quality)
1. **Few-shot calibration** — add 2–3 in-context examples of strong vs. weak coins to lift
   ticker punchiness (keep examples original, $THREE-safe).
2. **Originality + collision check** — verify the chosen name/symbol isn't an obvious clone:
   reject if it equals a known ticker or appears verbatim in the source narrative.
3. **Image identity** — the agent's avatar fronts the coin (handled by the launch step's
   `build-metadata`). Optionally generate a bespoke coin image from the narrative later.
4. **Self-grade loop** — an optional LLM-judge pass scoring memeability/originality/safety;
   regenerate once if below bar (bounded, never blocks the tick).
5. **Record provenance** — `trigger_detail` already stores `top_narrative`, `top_kind`,
   `top_sources`, `themes`; keep it accurate so the console can show "why this coin."

## Acceptance
- Trend mode produces an original coin clearly tied to the supplied top narrative, valid
  against pump.fun caps, as strict JSON.
- Any LLM failure degrades to `randomCoin()` — never a thrown tick.
- No output ever copies a real token's name/ticker or references a tragedy.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs. Real APIs only. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.
