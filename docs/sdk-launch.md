# `@three-ws/*` SDK suite — launch runbook

18 zero-dependency, pure-ESM SDKs that wrap already-live three.ws platform
capabilities. Each ships `src/` directly (no build step), hand-written `.d.ts`
types, and a `node --test` suite. They share one byte-identical HTTP core
(`src/http.js`) so error handling, base-URL resolution, and x402 `402` handling
are uniform across the suite.

## The 18

| Package | One-liner | Headline API |
|---|---|---|
| `@three-ws/forge` | text/image/sketch → rig-ready GLB | `forge()`, `rig()`, `catalog()` |
| `@three-ws/names` | ENS/SNS resolve + `*.threews.sol` + pay-by-name | `resolve()`, `mintSubdomain()`, `payByName()` |
| `@three-ws/intel` | token sentiment + market intel | `sentiment()`, `intel()`, `projects()`, `snapshot()` |
| `@three-ws/vanity` | local Solana vanity address mining | `grind()`, `expectedAttempts()` |
| `@three-ws/reputation` | ERC-8004 agent reputation read/attest | `reputation()`, `leaderboard()`, `attest()` |
| `@three-ws/voice` | ASR + TTS + audio2face lipsync | `transcribe()`, `speak()`, `lipsync()`, `say()` |
| `@three-ws/x402-server` | merchant side of x402 | `paid()`, `buildChallenge()`, `verifyPayment()` |
| `@three-ws/agent-memory` | embeddings-backed agent memory | `new AgentMemory()`, `remember()`, `recall()` |
| `@three-ws/agenc` | AgenC coordination protocol client | `listTasks()`, `getTask()`, `getAgent()` |
| `@three-ws/guardian` | content safety / moderation | `check()`, `govern()`, `moderate()` |
| `@three-ws/glb-tools` | inspect / theme / bake GLBs | `inspect()`, `theme()`, `bake()` |
| `@three-ws/agent-guards` | spend + trade guardrails | `policy()`, `guard()` |
| `@three-ws/skill-license` | on-chain skill licenses | `verifyLicense()`, `getLicense()`, `mintLicense()` |
| `@three-ws/mocap` | motion-capture clips → animation | `saveClip()`, `getClip()`, `listClips()` |
| `@three-ws/strategies` | DCA / copy / mirror trading | `dca()`, `copy()`, `mirror()` |
| `@three-ws/pumpfun-skills` | pump.fun create/swap/fees skills | `createCoin()`, `swap()`, `coinFees()` |
| `@three-ws/irl` | geofenced real-world presence | `checkIn()`, `nearby()`, `placePin()` |
| `@three-ws/pose` | pose-seed generation for avatars | `poseSeed()`, `presetPose()` |

## Conventions (all 18, uniform)

- **Pure ESM, ship `src/` directly — no build.** `main`/`module` → `./src/index.js`, `types` → `./src/index.d.ts`.
- **Zero runtime dependencies.** Node 18+ global fetch; works in the browser too.
- **Shared core** `src/http.js` is byte-identical across all 18: `createHttp()`, `ThreeWsError`, `PaymentRequiredError` (402 carries the x402 `accepts` challenge), `resolveBaseUrl()` (option → `THREE_WS_BASE_URL` → `https://three.ws`), `delay()`.
- **Ergonomics:** a `createX(options)` client factory **and** zero-config default functions over a lazy shared client. Responses are camelCased with a `.raw` escape hatch. Inputs validated before any network call.
- **Paid lanes:** pass a payment-aware `fetch` (e.g. `@three-ws/x402-fetch`) to auto-settle `402`s, or catch `PaymentRequiredError` and pay from `err.accepts`.

## Verify the whole suite

```bash
for p in forge names intel vanity reputation voice x402-server agent-memory \
         agenc guardian glb-tools agent-guards skill-license mocap strategies \
         pumpfun-skills irl pose; do
  ( cd packages/$p && node --test test/*.test.js ) || echo "FAIL: $p"
done
```

All green at launch: **216 tests across 18 packages.**

## Pre-publish checklist

1. **Wire workspaces.** Add each `packages/<name>` to the `workspaces` array in
   the root [package.json](../package.json). (Deferred from the build commit to
   avoid racing concurrent edits to that file — do it when the tree is quiescent.)
2. **Run the suite** (command above) — confirm 18/18 green.
3. **Coin scan.** `grep -rniE '\b(bonk|wif|pepe|shib|usdt)\b' packages/*/src packages/*/test` must be empty. The only coin is `$THREE`.
4. **Smoke import** each: `node --input-type=module -e "import('./packages/<name>/src/index.js')"`.
5. **Dry-run publish** per package: `npm publish --dry-run -w packages/<name>` (or from the dir). Confirm `files` ships only `src`, `README.md`, `LICENSE`.

## Publish order

Publish leaves first; nothing in the suite depends on another at runtime (all
zero-dep), so order is for narrative, not resolution. Suggested:

1. `forge` — the flagship.
2. `names`, `voice`, `pose`, `glb-tools`, `mocap` — the avatar/3D cluster (compose with `@three-ws/avatar`).
3. `intel`, `vanity`, `reputation`, `agenc`, `agent-memory`, `guardian`, `agent-guards` — the agent cluster.
4. `x402-server`, `skill-license`, `strategies`, `pumpfun-skills`, `irl` — the payments/onchain cluster.

```bash
cd packages/forge && npm publish --access public
# …repeat per package, or: npm publish -w packages/<name> --access public
```

## On publish

- Add one `sdk`-tagged entry to [data/changelog.json](../data/changelog.json)
  announcing the suite (holder-readable, `$THREE` only), then
  `npm run build:pages` and `npm run changelog:push`.
- Flip the STRUCTURE.md surface-map rows for any promoted package from
  "implemented, pending publish" to `Published as @three-ws/<name>`.
