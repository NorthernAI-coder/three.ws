# Initiative: make the agent self-sufficient over MCP

**Goal.** Today the three.ws platform exposes the **read/consume** half of every
capability over MCP, but the **create/write** half still requires the web app.
An AI agent connected through MCP (Claude, Cursor, watsonx Orchestrate) can
_observe and spend_, but it cannot bootstrap itself end-to-end. This initiative
closes that gap so an agent can give itself a **body, brain (memory), wallet,
on-chain identity, and an embed** — entirely through MCP, matching the public
IBM-partnership narrative: _"Every AI needs a body, a brain (LLM memory), a
wallet (jobs with x402), and every digital identity needs a network."_

Each task below is a **self-contained brief** meant to be run in its own fresh
chat. They are independent and can be done in any order, but the recommended
sequence (each unlocks the next in the agent lifecycle) is 01 → 02 → 03 → 04 → 05.

| #   | Task                                                               | Pillar             | New MCP tools                           |
| --- | ------------------------------------------------------------------ | ------------------ | --------------------------------------- |
| 01  | [Memory tools](01-memory-mcp-tools.md)                             | Brain (LLM memory) | `remember`, `recall`, `forget`          |
| 02  | [Persist & render avatar](02-avatar-persist-and-render.md)         | Body               | `save_avatar`, `render_avatar_image`    |
| 03  | [Register agent on-chain](03-register-agent-onchain.md)            | Network / identity | `register_agent`, `identity_check`      |
| 04  | [Embed code tool](04-embed-code-tool.md)                           | Embed              | `get_embed_code`                        |
| 05  | [Provision & monetize wallet](05-wallet-provision-and-monetize.md) | Wallet             | `provision_wallet`, `monetize_endpoint` |

---

## Shared conventions (read before any task)

These apply to every task. Each task brief restates the critical bits, but this
is the canonical reference.

### Project rules (non-negotiable — see `/CLAUDE.md`)

- **No mocks, no fake data, no placeholders, no TODOs, no stubs.** Wire to the
  real endpoints/DB/contracts that already exist. If a credential is missing,
  surface a clean, designed "not configured" state — never fabricate output.
- **`$THREE` is the only coin.** Contract `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`.
  Never reference any other token anywhere (code, tests, fixtures, docs).
- **Errors handled at boundaries** (network, user input); internal code trusts
  itself. Every state designed (loading/empty/error/success).
- Match existing naming, file organization, and abstractions. Read before you
  write. Delete dead code. Keep the repo root clean.

### The MCP tool authoring contract

A tool is a plain object in a `toolDefs` array exported from a file under
`api/_mcp*/tools/`:

```js
{
  name: 'tool_name',              // snake_case, unique within the server
  title: 'Human title',
  description: 'What it does + when to use it (LLMs read this to choose it).',
  scope: 'namespace:action',      // OPTIONAL — gate behind an OAuth scope (see below)
  inputSchema: {                  // JSON Schema; additionalProperties:false
    type: 'object',
    properties: { /* ... */ },
    required: [ /* ... */ ],
    additionalProperties: false,
  },
  async handler(args, auth, req) {
    // args  — validated input (ajv compiled the schema at catalog load)
    // auth  — { userId, scope, apiKeyId, clientId, rateKey } (userId is the
    //         authenticated three.ws user id; null on the x402-payer path)
    // req   — the raw Node request (headers, etc.). Threaded by BOTH dispatchers.
    // Return an MCP tool result:
    return {
      content: [{ type: 'text', text: '...human-readable...' }],
      structuredContent: { /* machine-readable result */ },
      // isError: true  // on a handled failure
    };
  },
}
```

Wiring a new tool file into a server:

1. Create `api/_mcp<server>/tools/<name>.js` exporting `toolDefs`.
2. Import it in that server's `catalog.js` and add to the `allDefs` array.
3. The shared `catalog.js` strips `scope`/`handler` for `tools/list` and
   ajv-compiles each `inputSchema` — a malformed schema throws at load, so the
   assembly check below is a real test.
4. If the tool should appear in the server's `initialize` instructions, update
   the `INSTRUCTIONS` string in that server's `dispatch.js`.

**Servers and their dispatchers** (both pass `(args, auth, req)` to handlers):

| Server       | Endpoint          | Dispatcher                   | tools dir           | catalog                  |
| ------------ | ----------------- | ---------------------------- | ------------------- | ------------------------ |
| main         | `/api/mcp`        | `api/_mcp/dispatch.js` (own) | `api/_mcp/tools/`   | `api/_mcp/catalog.js`    |
| 3D Studio    | `/api/mcp-3d`     | shared `makeDispatcher`      | `api/_mcp3d/tools/` | `api/_mcp3d/catalog.js`  |
| agent wallet | `/api/mcp-agent`  | shared `makeDispatcher`      | `api/_mcpagent/`    | `api/_mcpagent/...`      |
| bazaar       | `/api/mcp-bazaar` | shared `makeDispatcher`      | `api/_mcpbazaar/`   | —                        |
| IBM Granite  | `/api/ibm-mcp`    | shared (`_mcpibm`)           | `api/_mcpibm/`      | `api/_mcpibm/catalog.js` |

Each server has a registry manifest at the repo root: `server.json` (main),
`server-3d.json`, `server-agent.json`, `server-bazaar.json`, `server-ibm.json`.
Update the relevant manifest `description` if a task materially changes a
server's capability surface.

### Auth, ownership, and scopes

- `auth.userId` is the authenticated three.ws user. **Any write tool MUST verify
  ownership** before mutating: an agent record lives in the `agent_identities`
  table with a `user_id` column — confirm `agent_identities.user_id === auth.userId`
  (the existing REST endpoints do exactly this; reuse their query/helper).
- Gate write tools behind a scope via the `scope:` field (e.g.
  `memory:write`, `avatars:write`). Read tools that only return the caller's own
  data use a read scope (e.g. `memory:read`). Look at `delete_avatar` in
  `api/_mcp/tools/avatars.js` (`scope: 'avatars:delete'`) and `api/_mcp/auth.js` /
  `api/_lib/auth.js` for how scopes are defined and checked, and register any
  new scope in the OAuth scope list so it can actually be granted.
- The x402-payer path has `auth.userId === null`. Write tools that need an owner
  must return a clear "sign in with three.ws OAuth to use this tool" error in
  that case rather than throwing.

### Definition of Done (every task)

A task is complete only when ALL of these hold — state explicitly which you
verified:

- [ ] New tool file(s) created and wired into the server's `catalog.js`.
- [ ] `server-*.json` description and the server's `dispatch.js` `INSTRUCTIONS`
      updated if the capability surface changed.
- [ ] **Real wiring** to the existing endpoint/DB/contract — no mock, no stub,
      no fabricated data. Missing-credential path returns a designed error.
- [ ] Ownership + scope enforced on every write tool; x402-payer (`userId:null`)
      handled.
- [ ] `node --check` passes on every changed `.js` file.
- [ ] **Catalog assembles** — the assembly command below ajv-compiles every
      schema and proves the handlers resolve; it must list your new tool names.
- [ ] A vitest spec is added under `tests/api/` covering the new tools
      (schema/validation + a happy path with the DB/HTTP layer mocked at the
      module boundary, mirroring `tests/api/mcp-3d.test.js`) and passes.
- [ ] `npx prettier --write` then `--check` clean on all changed files.
- [ ] `git diff` self-reviewed; every changed line justified.

### Verification commands cheat-sheet

```bash
# Syntax-check a changed tool file:
node --check api/_mcp<server>/tools/<name>.js

# Catalog assembles (ajv-compiles every schema, resolves every handler):
node --input-type=module -e "import('./api/_mcp<server>/catalog.js').then(m=>{for(const t of m.TOOL_CATALOG)if(!t.name||!t.description||!t.inputSchema)throw new Error('bad entry '+t.name);console.log('tools:',m.TOOL_CATALOG.length,m.TOOL_CATALOG.map(t=>t.name).join(', '));})"

# Run your spec + formatting:
npx vitest run tests/api/<spec>.test.js
npx prettier --check <files>

# Inspect live locally:
npm run dev
npx @modelcontextprotocol/inspector http://localhost:5173/api/<endpoint>
```

### Note for whoever runs these

This repo is worked by a **concurrent agent fleet sharing one worktree on
`main`** — files and commits can shift mid-task. Stage explicit paths, re-check
`git status` before committing, and never `git pull`/`fetch` from the `threeD`
mirror (canonical remote is `threews`). Do not push without explicit approval.
