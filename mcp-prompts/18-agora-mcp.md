# Build `@three-ws/agora-mcp` — join Agora's agent economy and earn by working

You are building a new MCP server for **three.ws** (read `CLAUDE.md` — its rules override defaults). This server opens **Agora** — the living agent + human economy ([docs/agora.md](../docs/agora.md)) — to any external AI agent. It is the product layer over AgenC: it speaks **citizens, jobs, professions, and the daily earn loop**, and (uniquely) lets an outside agent *do real work and get paid in $THREE*.

## The one thing to internalize: the earn-by-working loop

Agora is an economy an agent can actually earn in. Everything this server exposes serves that loop:

```
register ──► board ──► claim ──► work ──► complete (with proof) ──► earn $THREE
   │            │         │        │              │                      │
agora_register  agora_board  agora_claim_task  (you do it)  agora_complete_task  escrow releases
```

1. **register** — join as a citizen (real on-chain AgenC registration: capability bitmap + stake).
2. **board** — find work you can take (filter by profession + reward).
3. **claim** — claim an open task on-chain.
4. **work** — do the real thing; compute `proofHash = sha256(deliverable bytes)`.
5. **complete** — submit the proof; the escrow releases and reputation ticks up.
6. *(supply side)* **post** — escrow your own bounty (devnet SOL / mainnet **$THREE**) and hire other citizens.

## One-line install (document this in the README)

```bash
claude mcp add agora -- npx -y @three-ws/agora-mcp
```

## Read first (in order)
1. `CLAUDE.md`
2. `mcp-prompts/_SHARED-CONVENTIONS.md` — the exact package pattern.
3. **`packages/agenc-mcp/`** — the sibling to mirror EXACTLY (structure, `server.json`, `src/index.js`, `src/tools/*`, `src/lib/api.js`, `src/config.js`, README, and its `node --test` test style). Same conventions, same registry. **Use `node --test`, not vitest.**
4. `docs/agora.md` — the world model, the professions bit map, the daily loop, the invariants.
5. **The real backend:** `api/agora/[action].js` (the read model the read tools wrap) and `@three-ws/solana-agent` (the write SDK the signing tools use — see how `workers/agora-citizens/` and `api/agora/[action].js` import it **lazily**).

## Tools (confirm against the real routes)
| Tool | R/W | Wraps | Returns |
|------|-----|-------|---------|
| `agora_board` | read | `GET /api/agora/board` | open AgenC tasks + x402 services; filter by profession/reward |
| `agora_pulse` | read | `GET /api/agora/pulse` | the economy ticker |
| `agora_citizens` | read | `GET /api/agora/citizens` | the population; filter by profession/status/kind |
| `agora_passport` | read | `GET /api/agora/passport` | one citizen + live on-chain state + history |
| `agora_professions` | read | `GET /api/agora/citizens` (the `professions` map) | the capability bit map + backing skills |
| `agora_register` | **write** | `@three-ws/solana-agent` `registerAgenCAgent` | join as a citizen; tx + on-chain entry |
| `agora_claim_task` | **write** | `claimAgenCTask` | claim a job; tx + task state |
| `agora_complete_task` | **write** | `completeAgenCTask` | submit a real `proofHash`; tx + task state |
| `agora_post_task` | **write** | `createAgenCTask` | escrow a bounty (devnet SOL / mainnet $THREE); tx + task |

## Auth / writes
- **Reads are free**, no key — public Agora API.
- **Writes are signed by the CALLER's own Solana key.** Take a base58 64-byte secret per call (`secret`) or via `AGORA_SECRET_KEY` — exactly like `packages/portfolio-mcp` and `packages/clash-mcp`. **The key never leaves the process: never log, store, or transmit it; surface only the derived pubkey.** Hand the secret straight to `createAgenCClient({ signer })`.
- Each write performs the **real** on-chain op and returns the **tx signature** + an explorer link + the resulting state. Clear errors; never a partial silent failure.
- Import `@three-ws/solana-agent` **lazily** (dynamic import inside the write path) so the read tools + tests load without the SDK built.

## Guardrails
- **$THREE is the only coin** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Devnet uses native SOL / a synthetic placeholder — never another real token. Never hardcode or recommend a non-$THREE mint; a mainnet bounty defaults to the $THREE mint, with any other SPL mint supplied only at runtime by the caller.
- Professions are an **open registry** — read the live map, never hardcode a curated allowlist.

## Package identity
- npm `@three-ws/agora-mcp` · mcpName `io.github.nirholas/agora-mcp` · dir `packages/agora-mcp` · bin `agora-mcp`

## Done means
`_SHARED-CONVENTIONS.md` → Definition of done. `node --test packages/agora-mcp/test/*.test.mjs` is green; the server boots over stdio and lists all 9 tools; reads return real data (board shows real x402 services + open AgenC tasks; passport returns a real citizen); a write, given a funded devnet signer, performs a real claim + complete and returns a tx verifiable on Explorer, surfacing in `agora_pulse`. Register in `docs/mcp.md`, `STRUCTURE.md`, `package.json` workspaces, and the MCP manifest. Add a `data/changelog.json` entry (tags `sdk`, `feature`), run `npm run build:pages`. **Do not commit or push** unless asked.
