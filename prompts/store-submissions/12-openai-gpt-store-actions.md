# Prompt 12 — OpenAI GPT Store (Custom GPT + Actions over the free 3D endpoints)

> Paste into a fresh Claude Code chat in the three.ws repo. Follow CLAUDE.md. Use TodoWrite. Reuses the free, non-crypto generation lane from prompt 04 and the creative skill subset from prompt 11.

## Context
The GPT Store is a **separate, lower-effort** OpenAI marketplace from the Apps SDK directory (04–06). A Custom GPT calls external **Actions** defined by an OpenAPI 3.1 schema — no embedded component, no SDK build. This is the fastest way to a live OpenAI listing, and it shares the same policy constraints as the Apps directory: **no crypto, no tokens/credits, no embedded third-party payments, age-appropriate, no PII leakage.** So Actions must hit only the **free, non-crypto 3D-generation REST endpoints**.

Re-fetch the live rules first (they move):
- Custom GPTs + Actions: https://platform.openai.com/docs/actions
- GPT Store policies: https://openai.com/policies/usage-policies + the GPT Store content policy
- Action auth + OpenAPI: https://platform.openai.com/docs/actions/authentication

## Objective
A submittable Custom GPT ("three.ws 3D Studio" or similar) backed by a clean OpenAPI 3.1 Actions schema over free REST endpoints that generate real GLB models, plus the GPT instructions, conversation starters, and a policy-compliance audit.

## Tasks
1. **Confirm a free REST surface exists.** Actions need plain HTTPS REST (not MCP/JSON-RPC). Identify or add thin REST endpoints that wrap the free generation lane: text→3D (`forge_free` → `/api/forge` nvidia backend), and optionally text→avatar / rig. They must:
   - Require **no** API key for the free lane (or a simple optional key documented for the human), return a public GLB URL + a `https://three.ws/viewer?...` link.
   - Return **only** GLB URL + minimal metadata — no internal IDs, no PII, no wallet/x402/token fields.
   - Have a real async/poll or sync contract that completes to a usable GLB. No fake progress.
   If a suitable REST endpoint already exists, reuse it; do not duplicate. If only MCP exists, add the minimal REST wrapper.
2. **Write the OpenAPI 3.1 schema.** Create `prompts/store-submissions/_generated/openai-actions.yaml`:
   - `servers` = production `https://three.ws`.
   - One operation per generation action, with `operationId`, summary/description tuned for the model, typed request/response, and examples.
   - Privacy/data note in the schema description. No crypto fields anywhere.
   - Validate it (swagger/redocly or `npx @redocly/cli lint`). Paste the clean output.
3. **GPT configuration (write it as a doc the human pastes into the GPT builder):** `prompts/store-submissions/_generated/openai-gpt-config.md` with:
   - Name, description, profile-picture spec (reuse the asset kit, prompt 14).
   - **Instructions**: how the GPT should call each action, how to show the viewer link, how to handle generation failures gracefully, and a safety clause refusing disallowed/NSFW generation prompts (must suit ages 13–17).
   - 4 conversation starters that reliably produce a model ("Make me a low-poly fox", etc.).
   - The Actions schema reference + auth setting (None for free lane, or API key as `[HUMAN: ...]`).
4. **Compliance audit (item-by-item, written down with evidence):**
   - grep the REST endpoints, schema, and all GPT copy for any coin/token/wallet/x402/pump/aixbt/$THREE string → must be zero. Paste the command + empty output.
   - Confirm no payment/checkout surface.
   - Run a real generation through the action and paste the actual JSON response showing no internal IDs/PII.
   - Document the NSFW/abuse safety handling on the generation lane (add a filter if absent — same requirement as prompt 06).
5. **Privacy policy URL.** GPT Actions require a privacy policy link. Confirm `public/legal/privacy.html` covers the free 3D action's data handling; add a short section if needed. Provide the stable HTTPS URL.
6. **Changelog.** Add a `data/changelog.json` entry ("three.ws 3D Studio for the GPT Store — generate 3D models in ChatGPT, free", tag `feature`) and run `npm run build:pages`.

## Verification (must actually run)
- The OpenAPI schema lints clean (paste output) and every operation maps to a live endpoint that returns a real GLB.
- A real Action call returns a working GLB URL + viewer link with no crypto/PII/internal-ID fields.
- The compliance grep returns zero crypto hits (paste it).
- Privacy URL loads over HTTPS.
- `npm run build:pages` passes.

## Definition of done
- `openai-actions.yaml` (validated) + `openai-gpt-config.md` are complete; the human can build and submit the GPT from them.
- Free REST generation lane confirmed working with zero crypto surface. Compliance audit written with evidence. Changelog validated.

## Hand-off
Report the REST endpoint(s) used, the schema path + lint result, the GPT-config path, and the real Action response sample. List any `[HUMAN: ...]` steps (profile pic, identity verification, final submit). Commit/push only if asked; stage touched paths; both remotes.
