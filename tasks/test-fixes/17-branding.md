# Fix failing tests — `tests/branding.test.js`

> 4 of 4 tests in this file are failing. Make it green without weakening coverage.

## Reproduce
```bash
npx vitest run tests/branding.test.js
```

## Failing tests (4)

### three.ws branding lock › no "Avaturn" in user-facing files
```
Error: Forbidden brand "Avaturn" found in 29 user-facing location(s):
  public/internal/avaturn-forge.html:6
    <title>three.ws · avaturn forge harness</title>
  public/internal/avaturn-forge.html:15
    Headless harness for the avaturn-seed cron. NOT a user-facing page.
  public/internal/avaturn-forge.html:17
    api/_lib/avaturn-headless.js loads this in headless chromium with a fresh
  public/internal/avaturn-forge.html:18
    Avaturn catalog session URL, lets the official SDK randomize a body + assets
  public/internal/avaturn-forge.html:20
    result back off window.__avaturnResult. Everything is driven through the
  public/internal/avaturn-forge.html:25
    import { AvaturnSDK } from '/dashboard/avaturn-sdk.js';
  public/internal/avaturn-forge.html:28
    window.__avaturnDone = false;
```

### three.ws branding lock › no "Character Studio" in user-facing files
```
Error: Forbidden brand "Character Studio" found in 3 user-facing location(s):
  public/docs/index.html:131
    ['character-studio', 'Character studio', 'Author and pose characters.'],
  docs/internal/ISSUES-ARCHIVE-2026-06.md:11
    vendored CharacterStudio fork that all predated the upgrade.
  docs/launch/go-no-go-2026-06-24.md:150
    brands **"Avaturn" (×4), "Ready Player Me" (×7), "Character Studio" (×2), "RPM"** in user-facing

Replace with three.ws-branded language, or add a documented exemption to tests/branding-allowlist.json.
    at /workspaces/three.ws/tests/branding.test.js:370:11
```

### three.ws branding lock › no "Ready Player Me" in user-facing files
```
Error: Forbidden brand "Ready Player Me" found in 8 user-facing location(s):
  public/demos/audio2face.html:95
    (ARKit, Ready Player Me, VRM, Oculus visemes). If Audio2Face is unavailable, the
  docs/launch/go-no-go-2026-06-24.md:150
    brands **"Avaturn" (×4), "Ready Player Me" (×7), "Character Studio" (×2), "RPM"** in user-facing
  docs/tutorials/import-avatar-url.md:3
    You already have an avatar living somewhere else — a Ready Player Me model on a CloudFront link, a GLB on Arweave, an export sitting in your own storage. You don't need to download it, convert it, or re-host it. Paste the URL into [three.ws/import/rpm](/import/rpm) and the platform fetches it server-side, normalizes its skeleton, auto-rigs it so it can move, and saves it to your account as an avatar an agent can wear.
  docs/tutorials/import-avatar-url.md:14
    You:    paste  https://models.readyplayer.me/64c3….glb   into /import/rpm
  docs/tutorials/import-avatar-url.md:31
    Most avatar hosts (Ready Player Me's CloudFront CDN, Arweave gateways, arbitrary object storage) serve their GLBs **without CORS headers**. A browser `fetch()` to those URLs is blocked before a single byte arrives. So the importer d
```

### three.ws branding lock › no "RPM" referring to Ready Player Me (heuristic: near avatar/selfie)
```
Error: Found "RPM" near avatar/selfie context in 4 location(s) — assume Ready Player Me:
  docs/roadmap/REUSE-MAP.md:36
    | Turnkey talking-avatar | met4citizen/TalkingHead (+HeadTTS) | ✅ MIT | Full Oculus OVR + ARKit viseme pipeline on RPM/Mixamo GLB. |
  docs/tutorials/animate-your-avatar.md:170
    **Facial expression** ([src/runtime/arkit52.js](../../src/runtime/arkit52.js)) — independent of the skeleton. If your avatar carries ARKit-52 blendshapes (most modern exports do — RPM, Avaturn, VRoid), the runtime resolves those morph targets and drives expression and lip-sync directly on the face. A skeletal clip plays the body; the blendshape layer plays the eyes, brows, and mouth on top.
  docs/tutorials/import-avatar-url.md:50
    **Ready Player Me.** RPM gives you a model URL of the form `https://models.readyplayer.me/<id>.glb`. If you only have the avatar's web page, append `.glb` to the avatar ID, or open the page, then DevTools → **Network**, filter by `.glb`, and copy the request URL. RPM serves these from a CloudFront CDN with no CORS headers — exactly the case the server-side fetch is built for.
  docs/ux-flows/04-embed-widget-studio.md:167
    - **avatar-embed runtime** 
```

## What to do
1. Read the test and the module(s) it exercises. Decide whether the **source** is wrong (a real bug) or the **test** is stale (asserts old behavior). Fix the side that is actually wrong — do not loosen an assertion just to make it pass.
2. Fix the **root cause**, not the symptom. No `.skip`, no `it.todo`, no deleting tests, no widening matchers to swallow a real defect.
3. If the failure is from a missing live dependency (DB, Redis, network, an LLM/MCP endpoint), make the test **hermetic** at its boundary the same way sibling green tests in `tests/` do — never introduce mocks/fakes into product code, and never weaken a real integration.
4. Follow `CLAUDE.md`: no mocks/fake data in source, no TODOs/stubs, real implementations only. **$THREE is the only coin** that may be referenced anywhere.
5. Stage only the explicit paths you touch (never `git add -A`) — other agents are working in this same worktree.

## Done when
- [ ] `npx vitest run tests/branding.test.js` is fully green.
- [ ] You ran the broader suite and your change introduced **no new** failures elsewhere.
- [ ] `git diff` self-reviewed; every changed line justified.
- [ ] No console errors/warnings from your code; no coin other than $THREE referenced.
