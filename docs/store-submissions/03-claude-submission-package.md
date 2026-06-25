# Prompt 03 — Claude Connectors Directory submission package

> Paste into a fresh Claude Code chat in the three.ws repo. Follow CLAUDE.md. Use TodoWrite. Prereqs: prompts 01 + 02 done.

## Context
Everything technical is in place. This chat assembles the **exact submission artifacts** and closes the non-code gaps the directory checks. Re-fetch the live checklist first — requirements change:
- https://claude.com/docs/connectors/building/submission
- https://support.claude.com/en/articles/12922490-remote-mcp-server-submission-guide

Known hard requirements:
- Team or Enterprise org + Owner/Directory-management role to use the in-app portal; otherwise the public MCP directory submission form.
- **Missing/incomplete privacy policy = immediate rejection.** Need a stable HTTPS privacy URL covering data collection, usage/storage, third-party sharing, retention, and contact.
- Every tool needs `title` + annotations (done in prompt 01).
- Test-account + step-by-step reviewer access (done in prompt 02).
- Declared allowed link URIs (every HTTPS origin / custom scheme the connector opens) — and you must own them.
- Seven compliance acknowledgments (directory guidelines, API usage, transactions, media generation, prompt injection, data collection, documentation).

## Objective
Produce a single `docs/store-submissions/_generated/claude-submission.md` that is a **copy-paste-ready answer sheet** for the submission form, plus fix any gaps it surfaces.

## Tasks
1. **Pick the primary server to submit.** Recommend the main server (`/api/mcp`) as the flagship; optionally also `/api/mcp-3d`. Decide and state why. Confirm its production URL resolves and `tools/list` works over streamable HTTP.
2. **Privacy policy.** Open `public/legal/privacy.html`. Verify it covers all required topics for an MCP connector (what tool inputs are collected, x402 payment data, wallet addresses, third-party model APIs used, retention, contact email). If anything's missing, add it. Confirm it's served at a stable HTTPS URL and linked from the server's public docs.
3. **Allowed links.** Enumerate every external origin/scheme any tool response can open (viewer links `https://three.ws/...`, GLB asset hosts, explorer links, etc.). List them; confirm we own/control them or they're reputable asset hosts. Put the declared list in the submission doc.
4. **Server metadata.** Write the submission fields: server name, URL, tagline (≤1 line), description, 3–5 concrete use cases, auth type (OAuth 2.1 + x402), transport (streamable HTTP), read/write capabilities summary, and the full tool list with titles (pull from `tool-inventory.md`).
5. **Reviewer instructions.** Embed/reference the `claude-reviewer-guide.md` from prompt 02 (free smoke path + funded path + test credentials placeholder for the human to fill privately).
6. **Compliance acknowledgments.** Draft a truthful answer to each of the seven statements; flag anything that needs the human's confirmation (e.g. legal entity for transactions).
7. **Manifest sanity.** Verify `server.json` (and `server-3d.json`) match the live server: schema URL current, name, description, URL, `$THREE` is the only coin referenced anywhere, no other token in any field.
8. **Changelog.** Add a `data/changelog.json` entry ("Submitted three.ws to the Claude Connectors Directory" — tag `feature` or `infra`, holder-readable) and run `npm run build:pages` to validate.

## Verification
- The production server URL returns a valid OAuth challenge and a working `tools/list`.
- Privacy URL loads over HTTPS and covers every required topic.
- `npm run build:pages` passes with the new changelog entry.
- The submission doc has **no blank required field** except clearly-marked `[HUMAN: fill in]` placeholders (test credentials, org plan confirmation).

## Definition of done
- `claude-submission.md` is a complete answer sheet; the human can paste it into the portal/form and submit.
- Privacy, allowed-links, metadata, reviewer guide, and acknowledgments all present and truthful.
- Manifests verified clean. Changelog validated.

## Hand-off
Report the chosen server, any privacy/manifest edits, and the submission doc path. Tell the human exactly which fields need their input and whether they need a Team/Enterprise org or the public form. Commit/push only if asked; stage touched paths; both remotes.
