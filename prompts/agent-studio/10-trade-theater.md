# P9 — Trade Theater (every snipe becomes a cinematic your agent performs, and you share)

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/agent-studio/00b-innovation-north-star.md` first. **Prerequisites:**
P0 (`01-foundation.md`) merged; triggered by P4 (trading events), uses P1 (brain narration) + P3
(animations) + P5 (presence). Coordinate via the `studio` contract.

## The invention

This is our growth loop. Today a winning trade is a number you screenshot. We turn it into a **short
cinematic your 3D agent performs** — it reacts to the fill, narrates the thesis (from its real brain +
memory), the camera moves, the win lands — auto-cut into a clean, branded, shareable clip. Crypto is a
culture of flexing PnL; we give the best flex on the internet, and every share is an ad for three.ws
that only we can produce because only we have an embodied agent that was actually *there* for the trade.

Gamechanging test: the clip must be something a trader genuinely *wants* to post, generated from a
**real** trade with **real** numbers — never a fabricated highlight.

## Your mission

### 1. Real-time embodied trade moments
- Subscribe to P4's real trade/market events via `studio.onMarket` (`snipe:filled`, big win, new launch
  matched, dump, etc.). On a notable event, stage a short scene in 3D: the avatar reacts (emotion blend +
  P3 animations), the camera choreographs (reuse `src/viewer/framing.js` + scene-studio camera tools),
  and the agent says a real, grounded line (P1 brain over P2 memory — the actual thesis, not filler).
- This plays live in P5's presence layer when it happens, and is **recorded** for sharing.

### 2. Recording + auto-edit pipeline (real, no fake footage)
- Capture the real 3D scene to video (canvas capture / `MediaRecorder` / the existing screenshot tooling
  in `src/viewer/screenshot.js` extended to motion). Compose: intro card with real trade stats (mint,
  entry, multiple, realized PnL — all from real chain data via P4), the performed reaction, an outro with
  the user's agent + a subtle three.ws mark. Generate vertical (9:16) and square cuts.
- Server-side render path in `api/theater/**` for higher-quality/offline renders where browser capture
  is insufficient; persist clips to real storage; one-tap share/download with correct OG/social metadata.

### 3. Make it personal and tasteful
- Style follows the agent's persona (P1) and current outfit (P3) — a sniper's clip feels different from a
  researcher's. The line the agent speaks is true to its memory and the actual trade. Templates the user
  can pick/customize. Never overstate results; losses can get an honest, classy "took the L" cut too
  (optional, user-controlled) — authenticity shares better than fake hype.

## Definition of done
- Real trade events produce a real performed 3D scene with grounded narration, live in presence + recorded.
- Auto-edit produces share-ready vertical/square clips with **real** stats from chain data; share/download
  works with correct social metadata. No fabricated footage or numbers, ever.
- Server render path works where browser capture falls short; clips persist to real storage.
- Performance: recording never jank the live app; renders are async with real progress. Reduced-motion +
  accessible (captions on narration, non-video summary fallback).
- All states designed (no trades yet → explain; render failed → retry). No console errors; `npm test`
  passes; network tab shows real event + storage calls. Changelog entry added.

## Operating rules (override defaults)
No mocks/fake footage/fabricated stats. $THREE is the only coin promoted; clips reference the runtime mint
the user actually traded — never recommend another token, and never put a non-$THREE ticker in templates/
copy. Design tokens only. Stage explicit paths (never `git add -A`); re-check `git diff --staged` before
commit. Own `src/theater/**`, `api/theater/**`; consume P1/P3/P4/P5 via the `studio` contract; extend
(don't rewrite) `src/viewer/screenshot.js` and framing.

## When finished
Self-review (CLAUDE.md's five checks). Then push it — e.g. a weekly auto-montage of the agent's best real
moments, posting straight to the user's socials via real APIs (with consent), or letting a Theater clip be
forged into a commemorative wearable (P6) or posted to the Alpha Network (P8). Build it. Then **delete this
prompt file** (`prompts/agent-studio/10-trade-theater.md`) and report what you shipped + the event→scene
mapping and clip format.
