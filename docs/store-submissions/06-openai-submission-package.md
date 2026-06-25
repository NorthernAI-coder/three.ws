# Prompt 06 — OpenAI ChatGPT App Directory submission package

> Paste into a fresh Claude Code chat in the three.ws repo. Follow CLAUDE.md. Use TodoWrite. Prereqs: prompts 04 + 05 done (`/api/mcp-studio` live, component renders real GLBs).

## Context
The free, non-crypto 3D Studio app exists and works. This chat does the **policy-compliance audit** and assembles the **submission answer sheet**. OpenAI's review is strict; re-fetch the live rules first:
- https://developers.openai.com/apps-sdk/app-submission-guidelines
- https://developers.openai.com/apps-sdk/deploy/submission

Reject triggers we must clear: incomplete/demo status, missing/incorrect tool annotations, crypto-speculation or token/credit surface, embedded third-party payments, responses leaking PII/internal IDs, unclear tool behavior, missing test credentials, content unsuitable for ages 13–17.

## Objective
Produce `docs/store-submissions/_generated/openai-submission.md` — a copy-paste-ready submission sheet — and a documented **compliance audit** proving the app passes each policy.

## Tasks
1. **Compliance audit (write it down, item by item with a pass verdict + evidence):**
   - **No crypto/token surface.** `grep -ri` the studio endpoint, component, manifest, and listing copy for any coin/token/wallet/x402/pump/aixbt/$THREE string → must be zero. Document the clean result.
   - **No payments.** Confirm the app charges nothing and embeds no checkout. (Monetization is out of scope; if ever added, only physical goods via external checkout are allowed.)
   - **Tool annotations** correct on all five tools (`openWorldHint: true`, generation = non-destructive). Pull from prompt 01/04.
   - **Data minimization.** Re-audit each tool response: only GLB URL + minimal metadata; no session/trace IDs, no PII, no auth secrets. Run realistic requests and paste the actual responses as evidence.
   - **Inputs minimal** — no chat-history or "just in case" fields.
   - **Age-appropriate.** Generation prompts can produce arbitrary content; document any safety filter on the generation lane (NSFW/abuse) and add one if absent — the app must be suitable for ages 13–17.
   - **Clear utility not native to ChatGPT.** State the value prop crisply.
2. **Listing metadata:** app name (descriptive, not a generic dictionary word, IP we own), tagline, description, category, country availability, 3–5 example prompts, and the tool list with titles.
3. **Screenshots:** required dimensions, showing the component rendering a real generated 3D model (reuse prompt 05's screenshot; capture more at the required sizes). Save under `_generated/openai-screenshots/`.
4. **MCP connectivity details:** the production `/api/mcp-studio` URL, transport, auth mode (likely none/optional), and reviewer testing guidelines (example prompts that reliably produce a model; expected render behavior).
5. **Developer verification + support:** note that the human must complete identity verification on platform.openai.com and provide a current support contact; list what they need to do as `[HUMAN: ...]` items.
6. **Changelog:** add a `data/changelog.json` entry for the 3D Studio ChatGPT app submission; `npm run build:pages`.

## Verification
- The `grep` compliance sweep returns zero crypto/token hits — paste the command + empty output.
- Real tool-call responses captured show no internal IDs/PII.
- Production `/api/mcp-studio` URL resolves and `tools/list` works.
- Screenshots exist at required dimensions.
- `npm run build:pages` passes.

## Definition of done
- `openai-submission.md` is complete with no blank required field except `[HUMAN: ...]` items (identity verification, support contact, final submit).
- A written, evidence-backed compliance audit shows the app clears every known reject trigger.
- Screenshots ready. Changelog validated.

## Hand-off
Report the compliance verdict (pass/fail per item), the submission doc path, the screenshots path, and the exact `[HUMAN: ...]` actions left. Commit/push only if asked; stage touched paths; both remotes.
