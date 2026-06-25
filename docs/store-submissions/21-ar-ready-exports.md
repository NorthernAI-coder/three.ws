# Prompt 21 — AR-ready exports: place any generated model in your room

> Paste into a fresh Claude Code chat in the three.ws repo. Follow CLAUDE.md. Use TodoWrite. Prereqs: 04/05 (studio + viewer), 20 (spatial artifact) helpful. **Pure consumer value, zero crypto — ships in BOTH the Claude and OpenAI free tracks.**

## The thesis
A generated GLB is great in a viewer; it's *unforgettable* when the user taps "View in your space" and the model appears on their desk through their phone. three.ws can convert generated GLBs to AR-ready formats (USDZ for iOS Quick Look, GLB for Android Scene Viewer) and return a one-tap AR link. This is the consumer screenshot moment for the free app — no wallet, no token, no friction.

## Objective
`export_ar(asset_id | glb_url)` → AR-ready asset URLs + a device-aware "View in AR" launch link (USDZ on iOS, Scene Viewer intent on Android, WebGL viewer fallback elsewhere), plus an AR button in the embedded viewer.

## What to build (all real — a working GLB→USDZ pipeline, no fake conversion)
1. **Conversion.** A real GLB→USDZ pipeline (USD tooling / a real converter lane — not a stub). Validate the output actually opens in Quick Look. Store outputs via `api/_lib/r2.js` `publicUrl`. Reject bad inputs at the boundary using the existing model `validate`/`inspect` path.
2. **Device-aware launch page.** A hosted AR launch page that serves USDZ to iOS (`<a rel="ar">`), a Scene Viewer intent to Android, and the WebGL viewer everywhere else — branched on User-Agent, with designed states for each.
3. **Tool response.** Return the AR asset URLs + launch link + viewer link with minimal metadata. **Strip internal identifiers** (session/trace IDs, any auth/coin fields) so the response is OpenAI-clean. Shape it as a conformant spatial artifact (prompt 20) with the AR handoff populated.
4. **Component AR button.** Add a "View in AR" affordance to the viewer (prompts 05/07) using the launch page, with hover/active/focus states and an `aria-label`.
5. **No crypto/coin surface anywhere** (both tracks) — grep to prove it. **Changelog** + `npm run build:pages`.

## Why only three.ws
You generate the model *and* control the viewer and storage, so the path from "text prompt" to "AR on my desk" is one continuous pipeline — competitors stitching third-party generators can't offer one-tap AR from a chat.

## Verification (must actually run)
- Convert a real generated GLB → a USDZ that opens in iOS Quick Look (capture/describe it) and renders via Scene Viewer on Android.
- The launch link routes correctly per User-Agent (iOS → USDZ, Android → Scene Viewer, desktop → WebGL).
- Bad input is rejected cleanly at the boundary (not a crash).
- The tool response is OpenAI-clean — no internal/auth/coin fields — grep to prove it.
- `npm test` green; add tests for conversion-output validity and device routing. Evidence to `docs/store-submissions/_generated/ar/`.

## Definition of done
- Any generated model exports to AR-ready formats with a one-tap, device-aware "View in AR" link and an in-viewer AR button — real conversion, OpenAI-clean responses, designed states, zero crypto surface, reusable across both stores.

## Hand-off
Report the conversion pipeline, the launch-page routing, the AR-button surface, and the evidence path. A consumer headline for the OpenAI listing and a polish win for Claude. Commit/push only if asked; stage touched paths; both remotes.
