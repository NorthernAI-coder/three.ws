# Onboarding & Agent Creation

> UX Flow Atlas — Cluster 01. Traced from real source. Route → source mapping resolved via `vercel.json` `routes[]` (Vite serves `pages/*.html` directly in dev; prod rewrites the clean route to the same HTML file).

---

### Onboarding Wizard — `/start`
- **Source:** `pages/start.html` + `src/start.js` (imports `src/shared/usd-price.js`, `src/templates.js`, `src/shared/log.js`)
- **Entry point:** Marketing/nav CTAs and `getting-started.js` discovery layer. Returned-to as a round-trip target from `/create/selfie` and `/create` (those flows pass `?wizard=1&next=<return to /start?from=...>`). Also accepts deep-links `/start?template=<id>` and resumes via `sessionStorage` key `wz:state`.
- **Prerequisites / gates:** None to start (anonymous-friendly). Auth is hit lazily at deploy: every `apiPost` first fetches `/api/csrf-token` (`credentials: include`) — an unauthenticated user fails at Step 4 (deploy) with a server error toast. No wallet connect, no $THREE gate.
- **Steps (N):**
  1. Land on `/start`; the **template gallery** screen renders (`initTemplateGallery`). If `?template=<id>` matches, it auto-applies and jumps to Step 2 (skips gallery). If a saved `wz:state` exists, gallery is bypassed and the wizard resumes.
  2. (optional) Click a template card → `applyTemplate` prefills description/skills/model/cryptoMode and advances to wizard Step 2; OR click "Start from scratch" (`#btn-blank-start`) → reveals blank wizard at Step 1.
  3. **Wizard Step 1 — Avatar.** Choose an avatar method: "Selfie" (`#btn-selfie`) → navigates to `/create/selfie?wizard=1&next=<return>`; "Editor" (`#btn-editor`) → `/create?wizard=1&next=<return>`; "Upload" (`#btn-upload`) → opens file picker.
  4. (optional) For Upload: select a `.glb`/`.gltf` ≤ 50 MB → POST `/api/avatars` (multipart, with CSRF) → on success the avatar thumbnail/name render in the Step-1 preview.
  5. (optional) Click "Skip" (`#btn-skip-step`) on Step 1 to advance avatar-less to Step 2.
  6. **Step 2 — Name & Brain.** Type agent name (required) and bio/description; optionally click a personality preset (researcher/support/podcast/artist/assistant/crypto/community/defi) to fill the bio; pick a model (`data-model`). Click "Continue" → `validateStep` requires a non-empty name (else toast "Please give your agent a name.").
  7. (optional) Toggle **Crypto mode** (`#crypto-toggle`) to reveal crypto personality + crypto skills sections.
  8. **Step 3 — Skills.** Toggle skill cards (`data-skill`: memory/think/pumpfun/solana/x402/web). Click "Continue to deploy".
  9. **Step 4 — Deploy.** `startDeploy()` runs automatically: (a) POST `/api/agents` (name, description, resolved skills via `SKILL_MAP` + `BASE_SKILLS`, optional `avatar_id`); (b) POST `/api/widgets` (type `talking-agent`, config.agent_id); (c) builds embed `<script>` snippet + live URL `/agent/<id>`. Shows live status labels per phase.
  10. On deploy success: success panel shows "<name> is live", live URL link, and an embed code block. (optional) Click "Copy" (`#copy-embed`) to copy the embed snippet. Click "Continue".
  11. **Step 5 — Earn (conditional).** If crypto skills were selected: enter a per-call price (USDC, shown as USD-equivalent hint) and a payout wallet (chain auto-detected SOL vs ETH/BASE). Click "Save & finish" → `saveEarnSettings()` POSTs `/api/agents/:id/skills/set-price` (USDC mint) and `/api/billing/payout-wallets`, then clears state and redirects to `/dashboard?welcome=1`. If no crypto skills: a "skip" panel shows and the button reads "Go to dashboard" → straight to `/dashboard?welcome=1`.
- **Decision points / branches:** template vs blank start; resume saved session vs fresh; avatar method (selfie / editor / upload / skip); crypto-mode on/off → governs whether Step 5 is the Earn panel (price+wallet) or the Skip panel; deploy success vs failure (retry button injected).
- **External calls / dependencies:** `GET /api/csrf-token`; `POST /api/avatars` (upload); `POST /api/agents`; `POST /api/widgets`; `POST /api/agents/:id/skills/set-price`; `POST /api/billing/payout-wallets`. No on-chain txn from this page (wallet address is just registered as a payout target).
- **Success state:** A real deployed agent + public widget, an embeddable `<script>` snippet, a live `/agent/<id>` URL, optional monetization configured; user lands on `/dashboard?welcome=1`.
- **Empty / error states:** Toast (`#wz-toast`) for validation ("Please give your agent a name.", file-too-large). Deploy failure recolors the status label red and injects a "Try again" button that re-runs `startDeploy()`. Upload errors restore the card label.
- **Step count:** 6 required (gallery → name → skills → deploy auto → deploy success → finish) + ~5 optional (template apply, avatar upload, skip avatar, crypto toggle, earn setup).

---

### Avatar Method Picker — `/create`
- **Source:** `pages/create.html` + `src/create.js` (imports `src/account.js`, `src/avatar-creator.js`, `src/guest-avatar.js`, `src/shared/template-picker.js`, `src/shared/crypto-optional.js`, `src/wallet-auth.js` inline)
- **Entry point:** Nav/landing CTA; reached from `/start` Step 1 "Editor" with `?wizard=1&next=`. Also handles `?fork=<avatarId>` deep-links (remix an existing avatar).
- **Prerequisites / gates:** Anonymous-friendly for the default editor / customize / studio / direct GLB upload (guest avatar staged in IndexedDB; auth deferred to `/create-review`). **Auth-gated paths:** Selfie card (`requireAuthForSelfie` → redirect `/login?next=/create/selfie`) and Prompt card (redirect `/login?next=/create/prompt`). Signed-in users also hit an avatar-quota check (`/api/usage/summary`) before opening a creator. No wallet/$THREE gate.
- **Steps (N):**
  1. Land on `/create`. `boot()` probes `/api/config` for the `videoAvatar` feature flag (greys out the video card if off) and, for signed-in users with avatars, loads `/api/avatars` to render a "Start from one of yours" remix strip.
  2. (optional) If `?fork=<id>` present: `handleFork` runs immediately — POST `/api/avatars/fork` (signed-in → owned copy → redirect `/avatars/<id>`); on 401/403 falls back to fetching the source, downloading its GLB, staging a guest copy, and redirecting to `/create-review`.
  3. Choose a creation method card: **Default editor** (`AvatarCreator.openDefaultEditor`), **Customize** (`createFromTemplate`), **Agent Studio** (→ `/create/studio`), **Selfie** (→ `/create/selfie`, auth-gated), **Prompt** (→ `/create/prompt`, auth-gated), **Talking avatar video** (→ `/create/video`, feature-flagged + auth-gated), or **Upload GLB** (`#glb-input`).
  4. (optional) Upload path: pick a `.glb`; `handleGlbFile` validates the GLB magic bytes, then `stageAndReview` stashes the blob via `guest-avatar.js` (IndexedDB) and navigates to `/create-review`.
  5. (optional) Editor/Customize path: the in-page `AvatarCreator` produces a GLB blob → `stageAndReview` → `/create-review`.
  6. (optional) Remix strip: click a saved avatar thumbnail → `handleFork(av.id)` (same fork path as step 2).
- **Decision points / branches:** fork vs fresh; six creation methods (editor / customize / studio / selfie / prompt / video / upload); anonymous (stage→review) vs signed-in (direct save/fork); video flag on/off; avatar-quota reached vs not.
- **External calls / dependencies:** `GET /api/config`; `GET /api/avatars`; `GET /api/usage/summary`; `POST /api/avatars/fork`; `GET /api/avatars/:id` + raw GLB fetch (guest fork). External avatar-platform iframes loaded by `AvatarCreator`.
- **Success state:** A staged or owned avatar; the user is forwarded to `/create-review` (anonymous) or `/avatars/<id>` (forked) — onward to agent creation.
- **Empty / error states:** `status-toast` for invalid GLB, fork failure, quota-limit; video card shows "coming soon" when flag off; save overlay (`#save-loading`) covers staging. Remix strip stays hidden for anonymous users / users with no avatars.
- **Step count:** 2 required (land → pick a method) + ~4 optional (fork, upload, editor produce, remix).

---

### Agent Creation Wizard — `/create-agent`
- **Source:** `pages/create-agent.html` + `src/create-agent.js` (imports `src/api.js`, `src/account.js`, `src/shared/log.js`, `src/shared/glb-magic.js`)
- **Entry point:** Nav/landing CTA, marketplace "create your own" links.
- **Prerequisites / gates:** **Auth required.** `boot()` calls `getMe()`; if no user, the form is hidden and an auth gate (`#auth-gate` → `/login?next=/create-agent`) is shown. Each agent gets a wallet, so the whole flow is account-gated. No $THREE gate.
- **Steps (N):**
  1. Land; `boot()` resolves auth. Signed-out → auth gate (stop). Signed-in → Step 0 (Basics) shown.
  2. **Step 0 — Basics.** Enter name (required, ≤60), description (≤280), and tags (≤8, Enter/comma to add). Click "Next" → validates name present.
  3. **Step 1 — Model.** Choose a body via one of four tabs: **Starter** (4 shipped GLBs: Vern/CZ/Saga/Boss with `model-viewer` previews), **Library** (your owned avatars, paginated via `GET /api/avatars`, filtered to avatar/creature categories), **Upload** (drag-drop `.glb` ≤16 MB, validated by GLB magic), or **Add later** (must tick the `#f-skip-ack` confirm box → default starter assigned at create). Selected model renders in the live preview. Click "Next" → requires a starter/upload/library pick or acknowledged skip.
  4. **Step 2 — Skills.** Five core skills (greet/present-model/validate-model/remember/think) are locked on; toggle optional skills (wave/dance/pump-fun/explain-gltf/web-search). Click "Next".
  5. **Step 3 — Personality.** Pick category (14 marketplace categories), greeting (≤200), profile/system prompt (≤2000), voice (browser/custom). Click "Next" (soft tip if publishing without category+prompt).
  6. **Step 4 — Review.** Editable summary grid (each row jumps back to its step). Toggle "Publish to marketplace" (`#f-publish`). Click "Create".
  7. `submit()`: (a) resolves the body to a real owned avatar — `saveRemoteGlbToAccount` for starter URL or uploaded file (with upload % progress), library = connect directly, none = assign default starter; (b) POST `/api/agents` (name, description, skills, avatar_id, meta with greeting/voice/tags); (c) if publish opted-in AND category+prompt present → POST `/api/marketplace/agents/:id/publish`.
  8. Success panel: "<name> is ready", 3D preview if public, and buttons — Open (`/agent/<id>`), Edit (`/agent/<id>/edit`), Fund wallet (`/agent/<id>/wallet#deposit`).
- **Decision points / branches:** auth gate vs proceed; model tab (starter/library/upload/skip); publish on/off and whether publish prerequisites are met (publishes vs creates private with a soft warning); name conflict (409 → bounce to Step 0 to rename); per-step jump-back via stepper pips and review "Edit" buttons.
- **External calls / dependencies:** `getMe()` (account.js); `GET /api/avatars` (library tab); `saveRemoteGlbToAccount` (account.js → presign + R2 upload + commit); `POST /api/agents`; `POST /api/marketplace/agents/:id/publish`.
- **Success state:** A real agent with its own wallet/on-chain identity, a guaranteed 3D body, optionally listed on the marketplace; success card links to view/edit/fund.
- **Empty / error states:** Auth gate for signed-out; library tab has loading / error (with "Try again") / empty (no character models) states; per-step inline validation via `#foot-msg`; 409 name conflict bounces back; publish failure is non-fatal (soft warning, agent still created); submit failure re-enables the form with an error message.
- **Step count:** 6 required (Basics → Model → Skills → Personality → Review → Create) + ~2 optional (tags, optional skills/customizing voice).

---

### Prompt → Avatar — `/create/prompt` (create-prompt)
- **Source:** `pages/create-prompt.html` + `src/create-prompt.js` (imports `src/shared/log.js`)
- **Entry point:** The "Prompt" card on `/create` (`/create` redirects signed-out users to `/login?next=/create/prompt`). Also reachable directly.
- **Prerequisites / gates:** **Auth required** — the submit endpoint returns 401 → page redirects to `/login?next=/create/prompt` (also enforced upstream by `/create`). No wallet/$THREE gate.
- **Steps (N):**
  1. Land on the **compose** step; type a text prompt (3–600 chars; live counter). (optional) Click an example chip to fill the prompt.
  2. Click "Generate" (or Cmd/Ctrl+Enter). `start()` → switches to the **building** step, starts the elapsed clock, sets progress to 8%.
  3. POST `/api/avatars/reconstruct` `{ name (derived from prompt), prompt, visibility: 'private' }`. Server renders a reference image (Flux) then runs reconstruct→auto-rig. Returns `{ jobId }`.
  4. `pollUntilDone(jobId)` polls `GET /api/avatars/regenerate-status?jobId=...` every 3s (8-min timeout), advancing the progress bar by phase (queued→running→rigging).
  5. On `{ status: 'done', resultAvatarId }`: `renderDone` fetches `GET /api/avatars/:id`, sets the `model-viewer` src, and tags it (Animation-ready / static, Private). Shows the **done** step with "Open in editor" (`/avatars/<id>/edit`) and "Make another"; dispatches `tws:feature-done` for the cross-feature discovery layer. If the finished avatar has no model URL yet, it redirects straight to the editor.
- **Decision points / branches:** compose vs building vs done; success vs failure (`mapSubmitError`/`friendlyJobError` map codes to human messages — rate-limited, unconfigured→suggest selfie, no-face, NSFW, timeout, OOM); 401 mid-flow → login redirect; "Make another" resets to compose.
- **External calls / dependencies:** `POST /api/avatars/reconstruct`; `GET /api/avatars/regenerate-status`; `GET /api/avatars/:id`. Backend uses a text-to-image (Flux) + reconstruct/rig pipeline.
- **Success state:** A private, riggable 3D avatar previewed in-page with an "Open in editor" path.
- **Empty / error states:** Compose: inline `#compose-error` if prompt < 3 chars. Building: `#build-error` with a "Back" button to return to compose; friendly mapping of provider errors; 8-min timeout message suggesting the dashboard. Generate button disabled until prompt ≥ 3 chars.
- **Step count:** 3 required (compose → generate/build → done) + 1 optional (example chip).

---

### Selfie → Avatar — `/create/selfie` (create-selfie)
- **Source:** `pages/create-selfie.html` (inline `<script type="module">`) + `src/selfie-capture.js` + `src/selfie-pipeline.js` (pipeline imports `src/avatar-face-capture.js`, `src/shared/log.js`)
- **Entry point:** The "Selfie" card on `/create` (auth-gated redirect there); `/start` Step 1 "Selfie" with `?wizard=1&next=`; and `/scan` + `/features/scan` redirect/link here. Reachable directly.
- **Prerequisites / gates:** **Auth required** for platform-mode reconstruction (counts against plan quota; `/create` enforces `requireAuthForSelfie`; pipeline maps 401 → `/login?next=/create/selfie` and resumes the pending job after login). **BYOK mode** (`/api/config` → `features.avatarReconstructMode === 'byok'`): an API-key entry step (Meshy/Tripo) precedes capture; key is stored in `sessionStorage` only. No wallet/$THREE gate.
- **Steps (N):**
  1. Land; inline boot fetches `/api/config` to pick platform vs BYOK mode and dynamically imports the capture UI + pipeline.
  2. (optional, BYOK only) **api-key step:** pick provider (Meshy/Tripo), paste key (>8 chars), submit → `storeByokKey` → advance to capture.
  3. **capture step:** capture or upload a **frontal** photo (required) via camera overlay (`selfie-capture.js`, with face-oval guidance) or file upload; optionally add **left/right** angle photos (fidelity boost).
  4. Click "Build my avatar" (`#submit-btn`) → dispatches `selfie:submit`. Pipeline downscales photos (≤1024px JPEG), runs a local MediaPipe face check, then dispatches `selfie:preview` (shows the user's own photo on a placeholder).
  5. POST `/api/avatars/reconstruct` `{ name, photos[], visibility: 'private', params:{bodyType,style}, optional provider_key/provider_name }` → `{ jobId }`. Stashes `selfie:pendingJobId` in sessionStorage (for resume across login). Dispatches `selfie:building` → shows the **building** step (and requests Notification permission).
  6. `pollUntilDone` polls `GET /api/avatars/regenerate-status?jobId=...` (1.5s first, then 3s w/ backoff, 8–10 min timeout), dispatching `selfie:progress` labels (mesh → geometry → rigging → finishing).
  7. On done: `selfie:done` fires; the page fetches `GET /api/avatars/:id`, renders the model in the **done** viewer, prefills the name. If the tab is hidden, flashes the title + fires an OS notification.
  8. **done step** actions: "Save" (`#done-save-btn`, optional PATCH name → `/avatars/<id>`), "List" (`#done-list-btn`, PATCH name + visibility public → `/marketplace/avatars/<id>`), "Open in editor" (`#done-editor-btn` → `/avatars/<id>/edit`), or "Make another" (`#done-regen-btn`, reset to capture).
- **Decision points / branches:** platform vs BYOK mode (key step or not); camera vs upload; frontal-only vs +side angles; mid-flow 401 → login + job resume; done vs build-error (per-slot error highlighting, retry); resume-pending-job on reload.
- **External calls / dependencies:** `GET /api/config`; `POST /api/avatars/reconstruct`; `GET /api/avatars/regenerate-status`; `GET /api/avatars/:id`; `PATCH /api/avatars/:id` (save/list). MediaPipe (client face detect); camera `getUserMedia`; optional Meshy/Tripo BYOK providers.
- **Success state:** A private, rigged 3D avatar (reconstructed from the selfie), previewed in-page with save/list/edit paths.
- **Empty / error states:** `selfie:needs-byok` → key-entry form ("No API key found"); local face-check failure highlights the offending slot with guidance; `selfie:build-error` recolors the building step, shows tips, and a "Try again" → capture; rate-limit cooldown with a live countdown; viewer load failure marks the preview `.failed`; 8-min timeout message.
- **Step count:** 4 required (capture frontal → build → poll → done) + ~4 optional (BYOK key step, side angles, upload-vs-camera, save/list/edit/make-another).

---

### Agent Editor / New Agent — `/agent/new`
- **Source:** `pages/agent-edit.html` + `src/agent-edit.js` (vercel route `/agent/new` → `/agent-edit.html`; imports `src/avatar-creator.js`, `src/account.js`, `src/api.js`, `src/avatar-gallery-picker.js`, `src/shared/agent-wallet-chip.js`, `src/shared/glb-magic.js`)
- **Entry point:** "New agent" nav/dashboard buttons. Also the editor target for existing agents at `/agent/<uuid>(/edit)` and the create-from-avatar handoff `/agent/new?avatar_id=&avatar_glb=&avatar_name=` (marketplace "Start an agent with this avatar").
- **Prerequisites / gates:** **Auth required.** `resolveAgentIdFromUrl()` finds no id for `/agent/new`, so `loadAgent()` calls `createDraftAgent()` which POSTs `/api/agents` immediately; a 401 stashes `login_redirect` and redirects to `/login`. Each agent provisions a wallet. No $THREE gate.
- **Steps (N):**
  1. Navigate to `/agent/new`. With no id in the URL, `createDraftAgent()` shows a "Creating a new agent…" overlay and POSTs `/api/agents` `{ name: 'Untitled Agent' }` (or "<avatar> Agent" when arriving from an avatar handoff).
  2. (optional) If `?avatar_id` present, PUT `/api/agents/:id` to attach that avatar to the draft.
  3. The new agent id is adopted and the full editor renders (`render()`): identity (name/description), 3D body (starter/library picker/upload via `avatar-gallery-picker.js` + `AvatarCreator`), skills, animations, voice, wallet chip, and the embed/manifest panels.
  4. Edit any field → changes persist through the same verified endpoints (PUT `/api/agents/:id`, animations endpoint, etc.).
- **Decision points / branches:** new draft vs existing agent (URL id) vs create-from-avatar handoff; signed-out → login; avatar attach vs leave default.
- **External calls / dependencies:** `POST /api/agents` (draft); `GET /api/agents/:id`; `PUT /api/agents/:id`; `PUT /api/agents/:id/animations`; `GET /api/agents/:id/manifest`; avatar APIs via `saveRemoteGlbToAccount` / gallery picker.
- **Success state:** A live draft agent (with wallet) loaded into the full editor for fine-grained configuration; URL becomes the canonical agent edit URL.
- **Empty / error states:** Loading overlay during draft creation; `showError(...)` for load/create failures; 401 → login redirect with return.
- **Step count:** 1 required (navigate → draft auto-created → editor) + 1 optional (avatar attach) — the editor itself is open-ended.

---

### Import Avatar (URL / Upload) — `/import/rpm` (import-rpm)
- **Source:** `pages/import-rpm.html` (inline `<script type="module">`) + `src/account.js` (`saveRemoteGlbToAccount`)
- **Entry point:** Direct link / docs / nav. "Import any GLB or glTF avatar … and give it an agent brain."
- **Prerequisites / gates:** **Auth required at import time** — `saveRemoteGlbToAccount` presigns/commits against the user's account; a `not_signed_in`/401 redirects to `/login?return=<here>`. No wallet/$THREE gate. (The page itself loads anonymously.)
- **Steps (N):**
  1. Land; two tabs — **Import from URL** and **Upload file**.
  2. URL tab: paste an `http(s)` GLB URL (validated), optionally a name → click "Import".
  3. (alt) File tab: drag-drop or pick a `.glb` ≤100 MB (validated by extension + size), optionally a name → click "Upload".
  4. `runImport(...)` → `saveRemoteGlbToAccount(source, { name, visibility:'public', tags:['rpm','imported'], source:'rpm_import', source_meta })` with progress callbacks (Fetching → Normalizing bones → Uploading → Saving), showing a live progress bar.
  5. On success: `showSuccess(avatar)` swaps in the success card with "<name> is ready" and a link to `/avatars/<id>`.
- **Decision points / branches:** URL vs file upload; signed-out (401) → login round-trip; success vs error (friendly mapping by `err.code`/`err.stage`: fetch / presign / commit / upload_blocked / size_mismatch).
- **External calls / dependencies:** `saveRemoteGlbToAccount` (account.js — presign + remote GLB fetch/normalize + R2 upload + commit). Source URL is fetched server-side.
- **Success state:** An owned, public avatar in the user's library, linked at `/avatars/<id>` (ready to attach an agent brain).
- **Empty / error states:** Per-tab `status-msg` (invalid file type, too large, invalid URL, fetch/upload failures); progress wrap during import; auth redirect on 401.
- **Step count:** 2 required (choose source → import) + 1 optional (custom name).

---

### 3D Scanner (redirect) — `/scan`
- **Source:** `pages/scan.html` (inline `<script type="module">`; dynamically imports `src/selfie-capture.js` + `src/selfie-pipeline.js`)
- **Entry point:** `/features/scan` CTAs ("Start scanning →"), direct links, marketing.
- **Prerequisites / gates:** N/A — **the page immediately redirects.** The first line of the inline module runs `window.location.replace('/create/selfie' + window.location.search)`, preserving `?next`/`?from` query params. The legacy scan capture/build/done code below the redirect is therefore **dead/unreachable** (superseded by `/create/selfie`, which adds BYOK key entry).
- **Steps (N):**
  1. Land on `/scan` → instant `location.replace` to `/create/selfie` (query string carried over). User experiences the **`/create/selfie` flow** (see that entry) — there is no distinct `/scan` UX anymore.
- **Decision points / branches:** None — unconditional redirect.
- **External calls / dependencies:** None reached on `/scan` itself (redirect fires before any fetch). The vestigial code referenced `GET /api/avatars/:id` + the selfie pipeline endpoints, but they never run.
- **Success state:** User arrives at `/create/selfie` (selfie pipeline success state applies there).
- **Empty / error states:** None on this page (redirect-only).
- **Step count:** 0 required on `/scan` itself (1 implicit redirect) — the real flow is `/create/selfie`.

---

### Scan Landing Page — `/features/scan`
- **Source:** `pages/features/scan.html` (static marketing page; loads `/nav.js`, `/footer.js` — no inline flow logic)
- **Entry point:** `/features` index, marketing nav.
- **Prerequisites / gates:** None — public landing page.
- **Steps (N):**
  1. Land on the feature landing page ("Your face in 3D. In 60 seconds.") — hero, explainer sections, a `model-viewer` demo.
  2. Click a primary CTA "Start scanning →" → navigates to `/scan` (which redirects to `/create/selfie`). Secondary CTAs link to `/features`, `/features/forge`.
- **Decision points / branches:** CTA choice — start scanning (`/scan` → `/create/selfie`) vs "Try Forge instead" (`/features/forge`) vs "All features" (`/features`).
- **External calls / dependencies:** None (static page; model-viewer loaded from CDN for the demo GLB `/animations/soldier.glb`).
- **Success state:** User is routed into the selfie/scan creation flow.
- **Empty / error states:** N/A — static content, no data fetching.
- **Step count:** 1 required (land → click CTA). No optional steps.

---

### Voice Lab — `/voice`
- **Source:** `pages/voice.html` + `src/voice-lab.js`
- **Entry point:** Nav/feature links; used to mint a cloned voice that agents/avatars can speak with.
- **Prerequisites / gates:** Microphone permission (`getUserMedia`). The clone endpoint is called with `credentials: 'include'` — auth/credit limits are enforced server-side (a failure surfaces as a "Clone failed" status). No wallet/$THREE gate. Cloned-voice library is stored in `localStorage` (`voicelab_voices_v1`).
- **Steps (N):**
  1. Land; a reading script is shown (cycle with "Next script"). Voice library + playground voice dropdown render from `localStorage`.
  2. Click "Record" (`#btnRecord`) → `getUserMedia` (mono, 48kHz, with AGC/NS/EC), live waveform + level meter, max 60s (recommended 20–30s).
  3. Click "Stop" (`#btnStop`) → builds a recorded Blob; rejects clips < 3s; on success shows the **review** state with an audio preview.
  4. (optional) "Re-record" (`#btnRerecord`) to discard and try again.
  5. Enter a voice name (required) and click "Clone" (`#btnClone`) → POST `/api/tts/eleven-clone` (multipart audio + name).
  6. On success: stores `{ voiceId, name, status }` in `localStorage`, shows the **done** state ("<name> cloned successfully"), re-renders the library + playground voice list.
  7. (optional) "Try in playground" (`#btnTryPlayground`): pick a voice, type text, click "Speak" → POST `/api/tts/eleven` `{ voiceId, text }` to synthesize and play. "Play sample" on a library card does the same with a canned line. "Record another" loops back.
- **Decision points / branches:** record vs re-record; clone success vs failure (mic denied, recording too short, network error, server HTTP error); playground speak vs library sample playback; delete voice from library.
- **External calls / dependencies:** `POST /api/tts/eleven-clone` (clone); `POST /api/tts/eleven` (TTS playback/sample). ElevenLabs via the server proxy. Browser `getUserMedia` / `MediaRecorder` / Web Audio.
- **Success state:** A cloned voice ID saved to the local library, immediately usable in the in-page TTS playground (and selectable elsewhere for agent speech).
- **Empty / error states:** Library empty state ("No cloned voices yet"); status banner (`setStatus`) for mic-denied, recorder-init failure, too-short clip, network/HTTP clone errors, name-required; playground/sample buttons surface synth errors inline.
- **Step count:** 4 required (record → stop → name → clone) + ~3 optional (cycle script, re-record, playground speak/sample).

---

## Notes on routing resolution
- `/start`, `/create`, `/create-agent`, `/import/rpm`, `/scan`, `/features/scan`, `/voice` all resolve via explicit `vercel.json` `routes[]` rewrites to their `*.html` files.
- `/create/prompt` → `create-prompt.html`, `/create/selfie` → `create-selfie.html`.
- `/agent/new` → `agent-edit.html` (shared with the existing-agent editor at `/agent/<uuid>`).
- `/scan` is a **redirect shell** to `/create/selfie`; its in-page flow code is dead.
- `/features/scan` is a **static landing page** with no flow logic — its CTA bounces to `/scan` → `/create/selfie`.
