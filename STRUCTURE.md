# Repository Structure

Ready Player Me ships their platform across 30 public GitHub repos —
[visage](https://github.com/readyplayerme/visage),
[animation-library](https://github.com/readyplayerme/animation-library),
[rpm-react-avatar-creator](https://github.com/readyplayerme/rpm-react-avatar-creator),
[Example-iframe](https://github.com/readyplayerme/Example-iframe),
[content-validation-schemas](https://github.com/readyplayerme/content-validation-schemas),
several Unity/Unreal SDKs, and so on.

three.ws ships the same surfaces from a **single npm-workspaces monorepo**.
This file maps each RPM-equivalent surface to where it lives in this
repository, so external developers can find what they need without reading 50
top-level directories.

When an internal surface gains an external consumer that needs an independent
release cadence, we promote it to its own published package (and optionally its
own repo via `git subtree split`). See [Promotion path](#promotion-path) at the
bottom.

## RPM → three.ws surface map

| Ready Player Me repo | three.ws equivalent | Status | Notes |
|---|---|---|---|
| [visage](https://github.com/readyplayerme/visage) (web renderer) | [avatar-sdk/](avatar-sdk) `→ /viewer` | Published as `@three-ws/avatar` | Drop-in viewer with `<three-ws-avatar>` web component |
| [rpm-react-avatar-creator](https://github.com/readyplayerme/rpm-react-avatar-creator) | [avatar-sdk/](avatar-sdk) `→ /react` `/creator` | Published as `@three-ws/avatar` | Same package, React subpath |
| Avatar Creator (full app) | [character-studio/](character-studio) | Fork of [m3-org/CharacterStudio](https://github.com/M3-org/CharacterStudio), MIT, see [character-studio/LICENSE](character-studio/LICENSE) | Web-first character creator |
| [Example-iframe](https://github.com/readyplayerme/Example-iframe) | [examples/](examples) | In-repo | `embed-test.html`, `web-component.html`, `two-agents.html`, `minimal.html` |
| [animation-library](https://github.com/readyplayerme/animation-library) | [public/animations/](public/animations) + [scripts/build-animations.mjs](scripts/build-animations.mjs) | In-repo | Mixamo source FBX + GLB retargeting pipeline. **Not** derived from RPM's animation-library, whose license forbids redistribution outside RPM avatars |
| [content-validation-schemas](https://github.com/readyplayerme/content-validation-schemas) | [packages/avatar-schema/](packages/avatar-schema) | Published as `@three-ws/avatar-schema` | JSON Schema for on-chain avatar manifests — three.ws's differentiator |
| [Lyra-Sample](https://github.com/readyplayerme/Lyra-Sample), [VR-Demo](https://github.com/readyplayerme/VR-Demo) | [multiplayer/](multiplayer), [examples/coach-leo/](examples/coach-leo) | In-repo | Integration demos |
| [rpm-unity-sdk-core](https://github.com/readyplayerme/rpm-unity-sdk-core), [rpm-unreal-sdk](https://github.com/readyplayerme/rpm-unreal-sdk) | — | Out of scope | three.ws is browser-native; no Unity/Unreal SDKs planned |
| Avatar service backend | [api/](api) + [workers/](workers) | In-repo | Vercel functions + Cloudflare workers |
| _(no RPM equivalent — our moat)_ | [contracts/](contracts) | In-repo | Foundry-based on-chain agent identity, ERC-8004 |
| _(no RPM equivalent — our moat)_ | [sdk/](sdk), [solana-agent-sdk/](solana-agent-sdk), [agent-payments-sdk/](agent-payments-sdk), [agent-protocol-sdk/](agent-protocol-sdk) | Published | Cross-chain agent SDKs |
| _(no RPM equivalent — our moat)_ | [mcp-server/](mcp-server), [mcp-bridge/](mcp-bridge) | Published as `@three-ws/mcp-server` | Model Context Protocol surface |

## npm workspaces

Declared in [package.json](package.json):

```
agent-payments-sdk/    → @three-ws/agent-payments
avatar-sdk/            → @three-ws/avatar
character-studio/      → @m3-org/characterstudio (fork)
mcp-bridge/            → @three-ws/mcp-bridge
mcp-server/            → @three-ws/mcp-server
multiplayer/           → @three-ws/multiplayer
packages/*             → @three-ws/* (new — for clean publishable spec/schema packages)
```

`packages/` is reserved for spec/schema/protocol packages with no runtime
dependencies on the main app — things that need to be installable by external
consumers (e.g. another team building an avatar viewer that wants to validate
our manifest format).

Runtime SDKs and apps live at the top level for historical compatibility with
the deploy pipeline and existing import paths.

## Where things actually live

- **3D viewer & creator** — [avatar-sdk/](avatar-sdk), [character-studio/](character-studio)
- **Avatar / accessory assets** — [public/avatars/](public/avatars), [public/accessories/](public/accessories)
- **Animations** — [public/animations/](public/animations) (Mixamo FBX → built GLB clips), [scripts/build-animations.mjs](scripts/build-animations.mjs)
- **On-chain identity & contracts** — [contracts/](contracts), [packages/avatar-schema/](packages/avatar-schema)
- **API endpoints** — [api/](api) (Vercel functions), [workers/](workers) (Cloudflare workers)
- **Examples & demos** — [examples/](examples), [multiplayer/](multiplayer)
- **Cross-chain SDKs** — [sdk/](sdk), [solana-agent-sdk/](solana-agent-sdk), [agent-payments-sdk/](agent-payments-sdk), [agent-protocol-sdk/](agent-protocol-sdk)
- **MCP integration** — [mcp-server/](mcp-server), [mcp-bridge/](mcp-bridge)
- **Specs & protocol docs** — [specs/](specs)
- **Frontend pages** — [src/](src), [pages/](pages), [public/](public)
- **Tests** — [tests/](tests)

## Promotion path

A surface graduates to its own repo only when there is a concrete external
need that the monorepo cannot serve:

1. **A third party wants to consume it without pulling our whole tree.**
   Mitigation: publish to npm under `@three-ws/*` first. If the npm package
   is enough, no repo split is needed.
2. **Independent release cadence required.** When the surface needs its own
   semver line decoupled from the app.
3. **External contributors blocked.** When the repo size or unrelated CI cost
   is a real friction for outside PRs.

Promotion procedure (when triggered):

```bash
# Cleanly split a directory's full history into a new repo
git subtree split --prefix=packages/avatar-schema -b avatar-schema-split
cd ../  && mkdir avatar-schema-repo && cd avatar-schema-repo
git init && git pull ../three.ws avatar-schema-split
git remote add origin https://github.com/nirholas/avatar-schema.git
git push -u origin main
# Then in three.ws: replace the workspace dir with a normal npm dep
```

Until the trigger fires, splitting is premature: each new repo adds release
overhead, CI cost, and cross-repo PR coordination tax for zero functional
gain.

## See also

- [README.md](README.md) — product overview, quickstart, full feature list
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to propose changes
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) — attribution for derived code and assets
- [CLAUDE.md](CLAUDE.md) — operating rules for AI agents working in this repo
