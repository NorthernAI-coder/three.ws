# 23 — MCP servers (production-ready)

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/production-1b/00-README.md`
> for shared context.

## Why this matters for $1B

MCP is how agents — Claude, Cursor, every autonomous buyer — actually reach
three.ws. If a manifest drifts, a remote endpoint stops answering its payment
challenge, or the one free lane (`forge_free`) silently breaks, the entire
agent-to-agent distribution channel goes dark and we lose the buyers who never
touch a browser. A registry-clean, smoke-passing, correctly-priced MCP surface
is the difference between "an app" and "a protocol other agents build on."

## Mission

Make every three.ws MCP server publishable and reliable: valid registry
manifests, passing smokes, correct per-tool x402 pricing, a working free
`forge_free` lane, and spec-compliant `PaymentRequired` transport — so a fresh
agent can discover and call our tools with zero hand-holding.

## Map (trust but verify — files move)

- **Hosted 3D-Agent MCP (remote)** — [api/mcp-3d.js](../../api/mcp-3d.js), backed by
  [api/_mcp3d/catalog.js](../../api/_mcp3d/catalog.js) (tool list + discovery copy),
  [api/_mcp3d/dispatch.js](../../api/_mcp3d/dispatch.js), [api/_mcp3d/pricing.js](../../api/_mcp3d/pricing.js)
  (per-tool USDC), [api/_mcp3d/discovery.js](../../api/_mcp3d/discovery.js), and the
  tool implementations in [api/_mcp3d/tools/studio.js](../../api/_mcp3d/tools/studio.js)
  (`forge_free` lives here — the ONE free tool: NVIDIA NIM / Microsoft TRELLIS text→3D).
- **Other remote endpoints** — [api/mcp.js](../../api/mcp.js), [api/mcp-agent.js](../../api/mcp-agent.js),
  [api/mcp-bazaar.js](../../api/mcp-bazaar.js), [api/pump-fun-mcp.js](../../api/pump-fun-mcp.js)
  (free, $THREE-only probe), [api/ibm-mcp.js](../../api/ibm-mcp.js).
- **stdio MCP packages** — [mcp-server/](../../mcp-server), [mcp-bridge/](../../mcp-bridge),
  [packages/pumpfun-mcp/](../../packages/pumpfun-mcp), [packages/avatar-agent-mcp/](../../packages/avatar-agent-mcp),
  [packages/threews-avatar-mcp/](../../packages/threews-avatar-mcp), [packages/three-token-mcp/](../../packages/three-token-mcp),
  [packages/ibm-watsonx-mcp/](../../packages/ibm-watsonx-mcp), [packages/ibm-x402-mcp/](../../packages/ibm-x402-mcp).
- **x402 spec helper** — [api/_lib/x402-spec.js](../../api/_lib/x402-spec.js) (builds the
  `PaymentRequired` / `accepts[]` challenge as `structuredContent`).
- **Manifests** — each package's `server.json` + root `server*.json` (remote manifests).
- **Tooling** — `npm run audit:mcp` ([scripts/audit-mcp-manifests.mjs](../../scripts/audit-mcp-manifests.mjs)),
  `smoke:mcp` ([scripts/smoke-mcp-remotes.mjs](../../scripts/smoke-mcp-remotes.mjs)),
  `test:mcp` ([scripts/test-mcp-all.mjs](../../scripts/test-mcp-all.mjs)),
  `publish:mcp:dry` ([scripts/publish-mcp-servers.mjs](../../scripts/publish-mcp-servers.mjs)).

## Do this

1. **Audit manifests:** run `npm run audit:mcp`. Fix every violation — description
   ≤ 100 chars, `name` in `io.github.<owner>/<server>` form, https icons/URLs, and
   for stdio packages the `server.json` version MUST equal the package's `package.json`
   version (and `packages[0].identifier/version` + `mcpName` must match). Do not bump
   a version to dodge a real mismatch — align them.
2. **Smoke the remotes:** run `npm run smoke:mcp http://localhost:3000` against
   `npm run dev`, then against `https://three.ws`. Free endpoints must answer
   `initialize` + `tools/list` and run a read-only tool; paid endpoints must return
   a well-formed 401/402 with a valid `accepts[]` challenge. Fix any unhealthy one.
3. **Verify the free lane:** call `forge_free` end-to-end (no wallet, no key) and
   confirm it returns a real GLB URL + a three.ws viewer link via the NVIDIA NIM /
   TRELLIS path. It must NEVER demand payment. Confirm it is the only free generation
   tool in `catalog.js`.
4. **Price every paid tool correctly:** in `api/_mcp3d/pricing.js`, confirm generation
   tools price by tier from `forge-tiers.js` (same numbers as `POST /api/x402/forge`),
   mesh edits carry their flat per-call USDC, and read-only tools (status/preview/
   inspection) stay free. No tool may settle for the env minimum when it costs more.
5. **Spec compliance:** confirm an un-paid call to a paid tool returns a
   `PaymentRequired` result whose `structuredContent.accepts[]` carries valid
   requirements (asset = USDC, correct `payTo`, atomic amount) — built via
   `api/_lib/x402-spec.js`, not hand-rolled. Verify on both Base and Solana rails.
6. **Run the full MCP suite:** `npm run test:mcp -- --no-remote` (offline: manifests +
   each stdio package's `node --test`), then `npm run test:mcp http://localhost:3000`
   (with the live layer). All green.
7. **Dry-run the publish:** `npm run publish:mcp:dry`. It must validate every manifest
   and report cleanly with no auth/version errors.
8. **Docs + versioning:** each stdio package README must list its tools, install/run
   command, and a real call example. Bump versions only for genuine changes (semver),
   keeping `server.json` and `package.json` in lockstep. Add a `data/changelog.json`
   entry (tag `sdk` or `infra`) for any user-visible MCP change, then `npm run build:pages`.

## Must-not

- Do not gate `forge_free` behind payment, a wallet, or an API key — it is the free lane.
- Do not hardcode any mint other than `$THREE` (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`)
  in probes, fixtures, or docs; the pump-fun probe must stay $THREE-only.
- Do not hand-roll the `PaymentRequired` challenge — use `api/_lib/x402-spec.js`.
- Do not let a generation tool settle for the env-minimum price; price it by tier.
- Do not commit a `server.json`/`package.json` version mismatch or a >100-char description.
- Do not weaken or skip a smoke/manifest check to make the suite pass.

## Acceptance (all true before claiming done)

- [ ] `npm run audit:mcp` passes with zero violations.
- [ ] `npm run smoke:mcp` passes against both `localhost:3000` and `https://three.ws`.
- [ ] `forge_free` returns a real GLB URL + viewer link with no payment, wallet, or key.
- [ ] Every paid tool prices correctly (generation by tier, mesh edits flat, read-only free);
      paid tools return a valid `PaymentRequired` `structuredContent.accepts[]` on Base + Solana.
- [ ] `npm run test:mcp -- --no-remote` and `npm run test:mcp http://localhost:3000` both pass.
- [ ] `npm run publish:mcp:dry` reports clean for every server.
- [ ] Every stdio package README documents tools + a real call example; versions are in lockstep.
- [ ] Changelog updated (if user-visible) and `npm run build:pages` is clean.
