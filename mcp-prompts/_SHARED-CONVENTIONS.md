# three.ws MCP server — shared build conventions

> Every prompt in this folder references this file. Read it once at the start of each build. It is the single source of truth for how a three.ws MCP server is structured, so the new server is indistinguishable from the 14 already shipped.

## Ground rules (from CLAUDE.md — non-negotiable)

- **No mocks, no fake data, no placeholders.** Every tool wraps a **real** three.ws API endpoint over live HTTP. If the endpoint needs a key/signer, wire it for real.
- **No TODOs, no stubs, no `throw new Error("not implemented")`, no commented-out code.** Finish everything you write.
- **The only coin is `$THREE`** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never name, hardcode, or reference any other coin anywhere — code, comments, tests, README, copy. Runtime-supplied mints (user passes a mint as input) are the only exception; never hardcode a non-`$THREE` mint.
- **Stage explicit paths only** when committing (never `git add -A`). Other agents share this worktree.
- This is a buildout task, not a commit task — **do not commit or push** unless the user explicitly says so.

## Canonical reference

Read these before writing a line:

1. `packages/intel-mcp/` — the gold-standard **read-only** template. Copy its shape exactly.
2. `packages/avatar-agent-mcp/` — the reference for **authenticated / write** tools (wallet, signer, on-chain actions). Study how it authenticates and how it marks write tools' annotations.
3. The **real API route(s)** your server wraps (named in your prompt). Read the handler, confirm the request/response shape, query params, auth, and error format. Build tools against what the code actually does — not what the prompt guesses.

## Package layout (match exactly)

```
packages/<name>-mcp/
  package.json        # @three-ws/<name>-mcp, mcpName io.github.nirholas/<name>-mcp
  server.json         # MCP Registry manifest (2025-12-11 schema)
  README.md           # same structure/badges as intel-mcp's README
  LICENSE             # copy Apache-2.0 LICENSE from intel-mcp verbatim
  src/
    index.js          # entry point — buildServer() + stdio main(), copy intel-mcp's exactly
    config.js         # THREE_WS_BASE, HTTP_TIMEOUT_MS, USER_AGENT from env
    lib/api.js        # apiRequest() — copy intel-mcp's verbatim (normalized errors, AbortController timeout)
    tools/<tool>.js   # one file per tool, each `export const def = { name, title, annotations, description, inputSchema, handler }`
  test/
    registration.test.mjs   # offline tool-surface invariants — copy intel-mcp's and update EXPECTED_NAMES
```

### package.json

Clone `packages/intel-mcp/package.json` and change: `name`, `mcpName`, `description`, `keywords`, `bin` key. Keep `type: module`, `engines.node >=20`, the `start`/`test`/`inspect` scripts, and deps `@modelcontextprotocol/sdk ^1.29.0` + `zod ^3.23.8` (add a signer dep like `@solana/web3.js` only if the server actually signs).

### server.json

Clone `packages/intel-mcp/server.json`. Update `name`, `title`, `description`, `packages[0].identifier`, `subfolder`. Keep the icon (`https://three.ws/three-ws-mcp-icon.svg`), `websiteUrl`, the `THREE_WS_BASE` + `THREE_WS_TIMEOUT_MS` env vars. **Add any new env var your server needs** (e.g. an API key or signer key) with `isRequired` set correctly and a clear `description`.

### src/index.js

Copy intel-mcp's `index.js` structure verbatim — the only changes are: the header comment, the tool imports, the `TOOLS` array, the server `name`/`title`, and the `instructions` string. Keep `buildServer()` exported (tests import it), keep the try/catch tool wrapper, keep the `isProcessEntryPoint()` stdio guard.

### lib/api.js & config.js

Copy both **verbatim** from intel-mcp. `apiRequest(path, { method, query, body })` already handles GET/POST, timeouts, and normalized errors (`.code` = `timeout`|`network_error`|`upstream_error`, `.status`, `.body`). Reuse it for every tool. If your server authenticates, add the auth header inside `apiRequest` (read from config) — do not invent a second HTTP client.

## Tool definition shape

Each `src/tools/<tool>.js`:

```js
import { z } from 'zod';
import { apiRequest } from '../lib/api.js';

export const def = {
  name: 'snake_case_name',
  title: 'Human Title',
  annotations: { readOnlyHint: <bool>, idempotentHint: <bool>, openWorldHint: true },
  description: 'Precise, agent-facing. What it returns, what each field means, when to use it.',
  inputSchema: { /* zod fields with .describe() on every one */ },
  async handler(args) {
    const data = await apiRequest('/api/<real-path>', { query: { /* ... */ } });
    return { ok: true, /* shaped, documented fields */ };
  },
};
```

### Annotation rules

- **Read-only tool:** `readOnlyHint: true`, `openWorldHint: true`, `idempotentHint: false` (live data moves between calls). **Omit `destructiveHint`** when read-only.
- **Write tool:** `readOnlyHint: false`. Set `idempotentHint` honestly (e.g. "set config" is idempotent; "execute trade" / "append action" is not). Set `destructiveHint: true` only for irreversible/funds-moving actions. Spend-money or on-chain tools must say so loudly in the `description`.

## Tests

Copy `packages/intel-mcp/test/registration.test.mjs`. Update `EXPECTED_NAMES` and the count. These are **offline** invariants (no network): every tool has title/description/inputSchema/handler + complete annotations, and `buildServer()` registers them all. Add a small assertion that write tools set `readOnlyHint:false`. Run `node --test "packages/<name>-mcp/test/**/*.test.mjs"` — it must pass before you call the server done.

## README

Mirror intel-mcp's README: centered logo + badges (npm, license, node, MCP Registry, built-by), a one-line pitch, **Install** (`npm install` + `npx`), **Quick start** (`claude mcp add <name> -- npx -y @three-ws/<name>-mcp`), a **Tools** table (name → what it does), env-var table, and a note on auth/payment if any. No other coin, ever.

## Changelog (required — these are user-visible)

Append an entry to `data/changelog.json`: today's date, a holder-readable title + summary (plain language — "AI agents can now manage their copy-trade follows over MCP", not commit jargon), tags including `sdk` (+ `feature`). Then run `npm run build:pages` — it validates the entry and regenerates the changelog artifacts; the build fails on a malformed entry. Do **not** run `changelog:push` (that posts to Telegram; only after deploy).

## Definition of done

- [ ] `packages/<name>-mcp/` matches the layout above; no stubs, no TODOs, no other coin.
- [ ] Every tool wraps a **real** endpoint and returns real data (verify with `npm run inspect` against `THREE_WS_BASE=https://three.ws`, or a local dev server).
- [ ] Write/auth tools actually authenticate and are annotated honestly.
- [ ] `node --test "packages/<name>-mcp/test/**/*.test.mjs"` passes.
- [ ] README + server.json + package.json identity all agree on the name/version.
- [ ] `data/changelog.json` entry added and `npm run build:pages` passes.
- [ ] `git diff` reviewed; every changed line justified. Report what you built, what's wired, and how you verified — do not claim done for anything you couldn't verify.
