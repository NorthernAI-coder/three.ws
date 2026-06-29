# agent-forge — headless Live Avatar Forge caster

Runs a text→3D generation on the **free** NVIDIA NIM (Microsoft TRELLIS) lane and
broadcasts it onto an agent's live screen at `/agent-screen?agentId=…`. Each real
pipeline stage is pushed as a narration line; the final frame carries the
generated GLB url + a three.ws viewer link in its `meta` sidecar, so every viewer
loads, rigs, and animates the freshly-forged avatar live.

This is the headless twin of the in-browser **Forge** button on the agent screen.
Both drive the same free lane and emit the same frames (shared logic in
[`src/shared/forge-frames.js`](../../src/shared/forge-frames.js)) — no payment, no
API key, no wallet.

## Run

```bash
AGENT_ID=<agent-uuid> \
AGENT_JWT=<agents:write key> \
FORGE_PROMPT="a friendly round robot mascot, glossy white plastic" \
npm start
```

Forge several in a row (split on newline or `|`):

```bash
FORGE_PROMPTS="a red origami crane|a tiny brass steampunk owl" npm start
```

## Env

| Var | Required | Default | Notes |
|---|---|---|---|
| `AGENT_ID` | yes | — | Agent whose screen to cast onto |
| `AGENT_JWT` | yes | — | Bearer token (an `agents:write` API key) authorizing pushes |
| `FORGE_PROMPT` | one of these | — | A single prompt |
| `FORGE_PROMPTS` | one of these | — | List split on newline or `\|` |
| `FORGE_TIER` | no | `draft` | `draft` \| `standard` \| `high` — all free; higher tiers only take longer |
| `PUSH_URL` | no | `https://three.ws/api/agent-screen-push` | Frame push endpoint |
| `FORGE_BASE` | no | derived from `PUSH_URL` | three.ws origin for `/api/forge` + viewer links |

The free TRELLIS lane conditions on ~77 characters, so lead with the subject plus
its key materials and colors. Longer prompts are trimmed to fit on a word
boundary. `$THREE` is the only coin three.ws references — avatar forging has no
token surface.
