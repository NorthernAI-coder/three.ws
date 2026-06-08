# Tripo-gap build set

Four self-contained agent prompts. Each closes a specific gap against Tripo AI
(tripo3d.ai) or extends a strength they cannot match. Run each in its own fresh
chat — they are independent and do not share context.

## The strategic picture

We are **not** behind Tripo overall. We lead on the avatar / animation / video
axis (audio-driven talking-avatar video, ARKit-52 blendshape rigs, in-browser
pose studio + retargetable animation library, multi-model generation ensemble,
x402 agent-payments). Tripo leads on the **general 3D-asset production pipeline**
axis (clean game-ready topology generation, engine/DCC plugins, a mature paid
API, hero-detail high-poly). These prompts attack the four highest-leverage
items.

## The prompts (run in this priority order)

| # | File | Closes | Effort | Why |
|---|------|--------|--------|-----|
| 01 | `01-text-to-animation.md` | Tripo has **no** text-to-animation | Large | Strongest differentiator. Reuses our rig + retarget + pose studio. Compounds into the video generator. |
| 02 | `02-game-ready-export-tier.md` | Tripo's Smart-Mesh / clean topology | Small | Cheapest visible win. The pieces (QuadriFlow quad-remesh, smart low-poly, FBX export) already exist in `workers/remesh/` — they just aren't surfaced. |
| 03 | `03-blender-comfyui-plugins.md` | Tripo's plugin ecosystem (Blender, Unity, Unreal, ComfyUI) | Medium | Pure distribution. We have zero plugin coverage; this is how Tripo reaches game/film devs. |
| 04 | `04-monetized-3d-api-mcp.md` | Tripo's paid API + official MCP gen tools | Medium | Turns our forge pipeline into a documented, x402-gated paid API + MCP tools. A moat Tripo structurally can't copy. |

## Run order rationale

- **01 first** if you want the biggest moat — it is the one capability Tripo
  cannot ship without rebuilding their whole animation stack.
- **02 first** if you want a fast, shippable win this week.
- **03 and 04 reinforce each other**: the plugins (03) are far more valuable once
  the API is publicly documented and authenticated (04). If you run both, do 04
  before 03 so the plugins target the finished public surface — but 03 can also
  ship against the existing internal `api/forge.js` with an API key.

## Rails that apply to every prompt

Each file restates these, but they are non-negotiable and come from
`/workspaces/three.ws/CLAUDE.md` — read that file in full before starting any of
these tasks:

- No mocks, no fake data, no placeholders, no fallback sample arrays. Real
  models, real APIs, real endpoints.
- No TODOs, no stubs, no commented-out code, no `throw new Error("not implemented")`.
- The only coin is `$three` (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).
  Never reference any other coin anywhere.
- Done = wired 100% into the UI, reachable, exercised for real, `npm test` green,
  `git diff` self-reviewed. Run the **completionist** subagent before stopping.
- Push only when the user says so, then to BOTH remotes (`threeD` and `threews`).
