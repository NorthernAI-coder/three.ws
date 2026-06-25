# Store Submission Prompts — three.ws MCP

Goal: get three.ws listed in **(1) the Claude Connectors Directory** and **(2) the OpenAI ChatGPT App Directory**.

Each file in this folder is a **self-contained prompt** you paste into a fresh Claude Code chat in this repo. Run them in the order below. Each prompt drives one work-stream to a verified, production-complete state and ends by telling you exactly what to hand to the next chat.

---

## Strategic summary (read once)

The two stores are very different problems:

- **Claude Connectors Directory — achievable now.** The server already has remote streamable-HTTP transport, OAuth 2.1, per-tool `title` + annotations, manifests, a privacy policy, and a published npm package. The work is *verify + package + write the reviewer guide*. The directory explicitly permits transactional connectors, so the x402 paid model is allowed — the reviewer just needs a free end-to-end path (`forge_free`) and clean `PaymentRequired` responses.

- **OpenAI ChatGPT App Directory — needs repackaging.** OpenAI's submission policy prohibits "tokens or credits," "embedded third-party payment solutions," and "crypto speculation schemes." The current x402-per-call model and the token/pump.fun tools are disqualifying as-is. The viable route is a **separate, free, non-crypto 3D-avatar app** exposing only the generation tools (`forge_free`, `text_to_avatar`, `mesh_forge`, `rig_mesh`, `forge_avatar`) with an embedded GLB-viewer component — no x402, no token tooling.

Authoritative sources (re-fetch at submission time; requirements move):
- Claude: https://claude.com/docs/connectors/building/submission
- Claude remote-server guide: https://support.claude.com/en/articles/12922490-remote-mcp-server-submission-guide
- OpenAI: https://developers.openai.com/apps-sdk/app-submission-guidelines
- OpenAI submit/maintain: https://developers.openai.com/apps-sdk/deploy/submission

---

## Run order

### Track A — Claude Connectors Directory (do first)
1. `01-claude-tool-annotation-audit.md` — every tool has a correct `title` + annotation set. (Also unblocks OpenAI.)
2. `02-claude-reviewer-access-guide.md` — free verification path, graceful `PaymentRequired`, reviewer setup/test-account doc.
3. `03-claude-submission-package.md` — privacy URL, allowed-links, server metadata, the exact form-fill content + compliance acknowledgments.

### Track B — OpenAI ChatGPT App (do after Track A, or in parallel)
4. `04-openai-free-3d-endpoint.md` — a free, non-crypto, scoped 3D-generation MCP endpoint.
5. `05-openai-apps-sdk-component.md` — the embedded GLB-viewer UI component the Apps SDK expects.
6. `06-openai-submission-package.md` — OpenAI directory metadata, policy-compliance audit, screenshots, developer verification.

---

## Rules every chat must follow (from CLAUDE.md)

- **No mocks, no fake data, no placeholders, no TODOs.** Real APIs, real endpoints, finish what you start.
- **$THREE is the only coin.** Never reference any other token anywhere. The OpenAI track must contain **zero** token/crypto surface.
- **Stage explicit paths only** (never `git add -A`/`.`) — concurrent agents share this worktree. Re-check `git status` before any commit.
- **Commit/push only when the human running the chat explicitly asks.** When they do: push to **both** remotes (`git push threeD main` and `git push threews main`).
- **Changelog:** user-visible changes get an entry in `data/changelog.json`; run `npm run build:pages` to validate.
- **Watch the `npx vercel build` trap** — it overwrites `api/*.js` with esbuild bundles. Check `head -1` of changed `api/` files for `__defProp` before committing.

## Repo orientation
- Remote MCP endpoints: `api/_mcp/` (main), `api/_mcp3d/` (3D Studio), `api/_mcpagent/` (agent), `api/_mcpbazaar/`, `api/_mcpibm/`.
- Per-tool defs (with `title` + `annotations`): the `tools/*.js` files under each `api/_mcp*/` dir.
- Published stdio server: `mcp-server/` (`@three-ws/mcp-server`), tools in `mcp-server/src/tools/`.
- Manifests: `server.json`, `server-3d.json`, `server-agent.json`, `server-bazaar.json`, `server-ibm.json`, `server-pumpfun.json`, `mcp-server/server.json`.
- Legal: `public/legal/privacy.html`, `tos.html`, `content-policy.html`.
- Deploy: `vercel.json`. OAuth: `api/_mcp/auth.js` + `/.well-known/oauth-protected-resource`.
