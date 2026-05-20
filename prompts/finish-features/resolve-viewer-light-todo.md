# Task: Resolve `TODO(#116)` in `src/viewer.js`

## Repo context

Working tree: `/workspaces/three.ws`. `src/viewer.js` is the in-app
GLTF viewer / inspector. At two sites (lines 92 and 1187) there is a
comment:

```js
directIntensity: 0.8 * Math.PI, // TODO(#116)
```

and

```js
lightFolder.add(this.state, 'directIntensity', 0, 4), // TODO(#116)
```

`#116` refers to an issue. This file appears to be derived from (or
inspired by) the KhronosGroup `glTF-Sample-Viewer` — that repo's
issue #116 is the original tracker for "direct light intensity factor
of π is non-physical."

## Rails (CLAUDE.md — non-negotiable)

- No mocks, no fake data, no placeholders, no TODOs, no stubs.
- Real APIs only.
- Done = the TODO comment is either resolved (with a real fix) or
  explicitly retired (with a one-line doc note explaining the choice),
  `npm test` green.
- Push to both remotes only when the user says push.

## What to implement

### Step 1 — confirm provenance

```bash
git log --diff-filter=A -- src/viewer.js | head -20
git log -p src/viewer.js | head -200
```

Confirm whether this file was vendored from
`KhronosGroup/glTF-Sample-Viewer` or written in-house. Read the top
of the file for any attribution comment.

### Step 2 — read the actual issue

If the file is vendored: open
`https://github.com/KhronosGroup/glTF-Sample-Viewer/issues/116` (or
the issue tracker the file's upstream uses). Read what the issue is
actually about. The `0.8 * Math.PI` factor is a known fudge to
compensate for a missing pre-Lambertian factor — the proper fix is
to multiply *inside* the lighting math, not at the input, but that
requires touching shader code.

If the file is in-house: the TODO might be unrelated to upstream. Read
the surrounding shader / light code to understand what `#116` refers
to in this codebase's issue tracker (GitHub issues on
nirholas/three.ws or nirholas/3D-Agent).

### Step 3 — decide one of three outcomes

A. **Implement the fix.** If the upstream issue has a resolved fix
   (a commit / PR in glTF-Sample-Viewer), port it. The fix typically
   involves removing the `* Math.PI` from the intensity multiplier
   and adjusting the shader uniform that consumes it. Validate
   visually: load `public/avatars/default.glb` (or whatever scene the
   viewer renders), confirm the lighting is approximately the same
   brightness, not 3× brighter or darker.

B. **Retire the TODO with a doc note.** If the fix is too invasive
   for this task and the current behavior matches user expectation,
   replace the inline `TODO(#116)` with a one-line comment explaining
   why the magic factor stays:

   ```js
   // 0.8 * π keeps direct lights visually matched to the Sample-Viewer
   // reference baseline. Removing the π factor requires a shader-side
   // adjustment — see KhronosGroup/glTF-Sample-Viewer#116.
   directIntensity: 0.8 * Math.PI,
   ```

   This is allowed under CLAUDE.md: the rule forbids `TODO`, not
   informational comments. A `WHY` comment is fine.

C. **Delete the lights folder feature.** Only if the viewer UI no
   longer exposes direct-light controls to the user.

Pick the outcome based on what you find in Step 2.

### Step 4 — apply the change

Edit `src/viewer.js` at both line 92 and line 1187. Be consistent —
either both lines fix the math, or both lines get the doc note.

### Step 5 — verify visually

```bash
npm run dev
```

Open the viewer route (typically `/viewer` or `/playground` — confirm
in `pages/` or `vite.config.js`). Load a known scene. Compare to a
screenshot of the same scene before your change. The two should look
visually similar — if not, you went with outcome A and the lighting
should now match a physical reference, which means it will look a bit
different. Either way, no console errors, no obviously-wrong shading.

### Step 6 — run the suite

```bash
npm test
```

## Definition of done

- Neither `// TODO(#116)` comment remains in `src/viewer.js`.
- The replacement (real fix, doc note, or removal) is explained in
  the commit message body.
- Viewer renders without console errors.
- `npm test` is green.

## Constraints

- Do not change the public API of `Viewer` (the exported class /
  function in `src/viewer.js`) unless option C is chosen and the
  callers are updated in the same diff.
- Do not silently delete the inline comment without explanation. The
  comment is load-bearing context for the next reader — replace it
  with either a real fix or a documented rationale, not nothing.
- Do not pursue option A if you cannot test the visual outcome in a
  real browser. Without a visual comparison, you cannot verify the
  fix is correct — fall back to option B in that case.
