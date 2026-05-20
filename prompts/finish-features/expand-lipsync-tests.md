# Task: Expand lip-sync analyser test coverage

## Repo context

Working tree: `/workspaces/three.ws`. The lip-sync analyser drives the
avatar's mouth shapes from an audio stream. Pieces involved:

- `src/lip-sync-analyser.js` — reads `AnalyserNode` FFT bins, computes
  open/wide/round channel intensities.
- `src/agent-avatar.js` — consumes the analyser output and applies it
  to the avatar's mouth morph targets.
- `tests/agent-avatar-lipsync.test.js` — current test file. New; not
  exhaustive.

## Rails (CLAUDE.md — non-negotiable)

- No mocks of the production code under test. Stub only the host
  environment (Web Audio API), not the analyser itself.
- No fake data — feed the analyser real PCM samples shaped to exercise
  each branch.
- Done = `npm test` green and the new cases visibly exercise the
  branches they claim to cover.
- Push to both remotes only when the user says push.

## Problem

The existing test file covers the happy path. The following behaviors
are likely uncovered and matter in production:

1. **Very short audio** (< 200 ms). The analyser may not have enough
   samples to settle; output should be defined and bounded, not NaN.
2. **Silence** (audio playing but all samples ≈ 0). Mouth channels
   should report ~0, not random noise from the FFT floor.
3. **Multiple back-to-back utterances**. State from utterance N must
   not bleed into utterance N+1. Tear-down and re-attach must work.
4. **Browser without `AnalyserNode`**. Older / restricted browsers
   (Safari iOS pre-15 lock-screen contexts, some embedded WebViews).
   The driver should degrade to a no-op without throwing, and the
   avatar's mouth should sit at rest, not freeze in an odd shape.

## What to implement

### Step 1 — read the existing tests + source

```
src/lip-sync-analyser.js
src/agent-avatar.js
tests/agent-avatar-lipsync.test.js
```

Note which of the four behaviors above are already tested and which
are missing. Skip cases that are already covered — do not duplicate.

### Step 2 — add the missing tests

For each uncovered behavior, add one or more tests in
`tests/agent-avatar-lipsync.test.js`. Use the same setup pattern as
the existing tests (vitest, jsdom). Where the test needs a fake audio
source, construct one against the real Web Audio spec:

- For the silence test: an `AnalyserNode` whose `getByteFrequencyData`
  fills the buffer with zeros. Assert all three mouth channels are
  ≤ 0.05 (small epsilon for FFT floor).
- For the short-audio test: drive the analyser for ~5 frames
  (`requestAnimationFrame` equivalents) and assert outputs are finite
  numbers in `[0, 1]`.
- For the back-to-back test: attach analyser A to source A, detach,
  attach analyser B to source B, assert output reflects only B.
  Inspect any module-scoped state (smoothing buffers, etc.) and
  confirm it resets cleanly on detach.
- For the no-`AnalyserNode` test: temporarily delete `AnalyserNode`
  from the global (or replace `window.AnalyserNode` with undefined).
  Construct the driver, drive a frame, assert it returned zeros and
  did not throw. Restore the global in `afterEach`.

Keep each test focused. One assertion per behavior, plus the
"doesn't throw" guard.

### Step 3 — run the suite

```bash
npm test -- tests/agent-avatar-lipsync.test.js
npm test
```

Both must be green. The first call confirms your new tests pass in
isolation; the second confirms nothing else regressed.

### Step 4 — verify in a real browser

```bash
npm run dev
```

Open the Talk overlay (the route documented in
`src/voice/talk-mode.js` — typically `/talk` or similar). Speak one
utterance, then another. Open devtools, confirm:

- No console errors.
- The avatar's mouth animates during each utterance.
- The mouth returns to rest between utterances (not stuck in the
  shape of the last frame of N when N+1 begins).

If you can test in Safari iOS or a restricted WebView, do so. If you
cannot (most likely case), say so explicitly in your final summary
rather than claiming it works there.

## Definition of done

- `tests/agent-avatar-lipsync.test.js` covers all four behaviors that
  were not already covered.
- `npm test` is green.
- Manual verification in `npm run dev` showed no regression for the
  happy path.
- The summary explicitly notes which environments were and were not
  manually tested.

## Constraints

- Do not change `src/lip-sync-analyser.js` or `src/agent-avatar.js`
  unless the new tests reveal a real bug. If they do, fix it — but
  call it out clearly in the summary.
- Do not add a real audio fixture binary to the repo. Generate audio
  programmatically inside the test (zeros for silence; a sine for
  signal).
- If the existing test setup already covers a behavior, **delete that
  case from this prompt's scope** rather than adding a duplicate.
