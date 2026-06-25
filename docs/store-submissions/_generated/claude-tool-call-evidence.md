# Claude Connectors — tool-call evidence (`@three-ws/mcp-server`)

**Connector:** `io.github.nirholas/3d-agent-mcp` — npm `@three-ws/mcp-server@1.2.0`, stdio transport.
**Captured:** 2026-06-25 (UTC), against production `https://three.ws` for the free lane; payment challenges captured from the shipped tool surface with the built-in default payout.
**Surface:** 17 tools — **1 free** (`forge_free`) + **16 paid** (x402 USDC on Solana mainnet, `exact` scheme).

Methodology: every tool was driven once. Free tool → real generation. Paid tools were
called with **no x402 payment and no review entitlement** — each must return a clean
`PaymentRequired` (v2 MCP transport: `structuredContent` x402 envelope + `isError: true`),
never a crash or stack trace. The review entitlement was then enabled to confirm paid
tools run for real.

---

## 1. Free end-to-end smoke test — `forge_free` (no auth, no payment)

Real call through the production `/api/forge` free NVIDIA NIM (Microsoft TRELLIS) lane:

```json
{
  "ok": true, "free": true, "cost": "$0.00", "mode": "text_to_3d",
  "glbUrl": "https://pub-2534e921bf9c4314addcd4d8a6e98b7b.r2.dev/forge/anon/a620d14f-a83d-43fe-8c0f-c87a46042933.glb",
  "preview": "https://three.ws/viewer?src=https%3A%2F%2Fpub-2534e921bf9c4314addcd4d8a6e98b7b.r2.dev%2Fforge%2Fanon%2Fa620d14f-a83d-43fe-8c0f-c87a46042933.glb",
  "prompt": "a friendly round robot mascot, glossy white plastic",
  "tier": "draft", "backend": "nvidia", "durable": true, "attempts": 1,
  "creationId": "a620d14f-a83d-43fe-8c0f-c87a46042933", "durationMs": 57314
}
```

- **GLB URL (durable R2):** https://pub-2534e921bf9c4314addcd4d8a6e98b7b.r2.dev/forge/anon/a620d14f-a83d-43fe-8c0f-c87a46042933.glb — verified reachable (HTTP `206` to a ranged GET).
- **Viewer:** https://three.ws/viewer?src=https%3A%2F%2Fpub-2534e921bf9c4314addcd4d8a6e98b7b.r2.dev%2Fforge%2Fanon%2Fa620d14f-a83d-43fe-8c0f-c87a46042933.glb

**Reliability hardening verified.** When the NVIDIA NIM lane is cold it degrades to a
HuggingFace Space whose gradio `/tmp` URL can expire within seconds (`durable:false`). The
hardened `runForgeFree` (a) prefers a durable result via a bounded retry and (b) verifies any
non-durable URL is actually reachable before returning it — so a reviewer never receives a
dead link as "success". A second run reproduced the retry upgrading a degraded attempt to a
durable one:

```
ok=true backend=nvidia durable=true attempts=2   # attempt 1 degraded → attempt 2 landed the durable NVIDIA lane
glbUrl=https://pub-2534e921bf9c4314addcd4d8a6e98b7b.r2.dev/forge/anon/14f67185-efcc-45f6-8ab6-f9ca75637902.glb
```

When every attempt is non-durable **and** unreachable, the tool returns a clear
`lane_degraded` error ("…try again shortly"), not a broken success.

---

## 2. Unpaid audit — every paid tool returns a clean `PaymentRequired`

Each row: one call, no payment, no review mode. **Result: 16/16 paid tools returned a clean
`PaymentRequired`. Zero crashes, zero stack traces.**

Common to every challenge: `isError: true` (required by the @x402/mcp client to
auto-detect-and-pay — it is the x402 contract, **not** a failure), `x402Version: 2`,
`asset` = `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (USDC), `network` =
`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` (Solana mainnet), `payTo` =
`BUrwd1nK6tFeeJMyzRHDo6AuVbnSfUULfvwq21X93nSN` (platform default — the unsubstituted
`${MCP_SVM_PAYMENT_ADDRESS}` placeholder bug is fixed), plus an appended plain-language line:
*"Payment required — this is the EXPECTED response for a paid tool, not an error…"*.

| Tool | Price | `amount` (atomic USDC) | Clean 402 |
|---|---|---|---|
| `ens_sns_resolve` | $0.0005 | 500 | ✓ |
| `get_pose_seed` | $0.001 | 1000 | ✓ |
| `agenc_list_tasks` | $0.001 | 1000 | ✓ |
| `agenc_get_task` | $0.001 | 1000 | ✓ |
| `agenc_get_agent` | $0.001 | 1000 | ✓ |
| `sentiment_pulse` | $0.003 | 3000 | ✓ |
| `pump_snapshot` | $0.005 | 5000 | ✓ |
| `agent_delegate_action` | $0.01 | 10000 | ✓ |
| `agent_reputation` | $0.01 | 10000 | ✓ |
| `aixbt_intel` | $0.01 | 10000 | ✓ |
| `aixbt_projects` | $0.01 | 10000 | ✓ |
| `vanity_grinder` | $0.05 | 50000 | ✓ |
| `text_to_avatar` | $0.15 | 150000 | ✓ |
| `rig_mesh` | $0.20 | 200000 | ✓ |
| `mesh_forge` | $0.25 | 250000 | ✓ |
| `forge_avatar` | $0.45 | 450000 | ✓ |

Representative raw challenge (`text_to_avatar`):

```json
{
  "isError": true,
  "structuredContent": {
    "x402Version": 2,
    "error": "Payment required to access this tool",
    "accepts": [{
      "scheme": "exact",
      "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      "amount": "150000",
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "payTo": "BUrwd1nK6tFeeJMyzRHDo6AuVbnSfUULfvwq21X93nSN",
      "maxTimeoutSeconds": 60,
      "extra": { "name": "USDC", "decimals": 6, "feePayer": "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4" }
    }]
  },
  "content": [
    { "type": "text", "text": "{…the x402 envelope as JSON…}" },
    { "type": "text", "text": "Payment required — this is the EXPECTED response for a paid tool, not an error. Calling \"text_to_avatar\" costs $0.15 in USDC on Solana (paid to BUrwd1nK6tFeeJMyzRHDo6AuVbnSfUULfvwq21X93nSN). To execute it, supply an x402 \"exact\" payment in _meta[\"x402/payment\"] and call again, or set the reviewer entitlement (MCP_REVIEW_MODE) to run it without payment. Full machine-readable requirements are in structuredContent.accepts." }
  ]
}
```

---

## 3. Funded review path — paid tools run for real (no mock)

With the server-side review entitlement enabled
(`MCP_REVIEW_SECRET=<token>` on the server **and** matching `MCP_REVIEW_MODE=<token>` in the
client env), `reviewModeActive()` → `true` and paid tools run their **real handler** with no
USDC charge.

**Read tool — `get_pose_seed` (real result, no upstream creds needed):**

```json
{ "isError": false,
  "structuredContent": {
    "presetId": "fighting-stance",
    "seed": "6153fce51ebdb477",
    "previewUrl": "https://three.ws/pose?seed=6153fce51ebdb477&preset=fighting-stance"
} }
```

**Generation tool — `text_to_avatar`** runs its real handler too; in this local capture no
Replicate credentials were configured, so it returns a **clean, structured** error (not a
crash) — exactly the designed contract:

```json
{ "ok": false, "error": "not_configured",
  "message": "REPLICATE_TEXT_TO_AVATAR_MODEL is not set on the server. Pin a commercial-OK image/text-to-3D version (e.g. tencent/hunyuan-3d-3.1 latest)." }
```

On the operator-funded instance you point the reviewer at (which carries
`REPLICATE_API_TOKEN` + `REPLICATE_TEXT_TO_AVATAR_MODEL`), the same review-mode call returns a
real generated GLB URL + viewer link. See `claude-reviewer-guide.md` §"Funded review path".

---

## Verdict

- No paid tool returns a crash-shaped error when unpaid — **16/16 clean `PaymentRequired`**.
- Free path (`forge_free`) produces a viewable, durable GLB end-to-end with no auth/payment.
- Review entitlement returns real results (demonstrated on `get_pose_seed`); generation
  tools return real GLBs on a credentialed instance and clean structured errors otherwise.
