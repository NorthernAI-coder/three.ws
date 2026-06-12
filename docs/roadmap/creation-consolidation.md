# Creation Surface Consolidation — Audit & Plan

**Status:** Audit complete, consolidation not started
**Audited:** 2026-06-12
**Problem:** 28 creation-related surfaces (18 nav-linked, 10 orphaned) presented as a flat menu of peer options. Users can't tell which tools are products, which are steps, and which are duplicates. The platform has no creation funnel — it has a pile of doors.

**Goal:** One front door (`/create` hub organized by user intent), one canonical surface per capability, every tool's "done" state handing off to the next stage of the pipeline: **avatar → agent → deploy (embed / world / token)**.

---

## 1. Full inventory

Every user-facing surface where something gets created. "Nav" reflects `public/nav-data.js` as of audit date.

### 1.1 AI agent creation

| Surface | Path | File | What it does | Backend | Nav |
|---|---|---|---|---|---|
| Create an Agent | `/create-agent` | `pages/create-agent.html` | 5-step wizard: name, 3D body, skills, personality, voice, on-chain identity | `POST /api/agents` | Build ▸ |
| New Agent | `/agent/new` | (routes to same flow) | Appears to duplicate `/create-agent` | `POST /api/agents` | — |
| Get Started | `/start` | — | 5-step onboarding: avatar → name → skills → embed → monetization | multiple | — (hidden onboarding) |

### 1.2 3D avatar building

| Surface | Path | File | What it does | Backend | Nav |
|---|---|---|---|---|---|
| Create avatar | `/create` | `pages/create.html` | Pick template avatar or upload GLB; feeds agent workflow | `/api/avatars/*` | Build ▸ |
| Avatar Studio | `/avatar-studio` | `pages/avatar-studio.html` | Full character creator (M3-org CharacterStudio fork): sculpt, outfits, export GLB | internal Three.js | Build ▸ |
| Customize avatar | `/avatar-edit` | `pages/avatar-edit.html` | Edit existing avatar attributes/accessories | `/api/avatars/{id}` | — (orphaned) |
| Import avatar | `/import/rpm` | — | Import GLB/glTF from URL or file upload | `/api/avatars` | Build ▸ |
| Avatar Studio demo | `/avatar-studio-demo` | `pages/avatar-studio-demo.html` | Demo variant of Avatar Studio | internal | — (orphaned) |

### 1.3 Photo/selfie → 3D avatar

| Surface | Path | File | What it does | Backend | Nav |
|---|---|---|---|---|---|
| Selfie to avatar | `/create/selfie` | `pages/create-selfie.html` | One photo → rigged 3D avatar (~60s) | `/api/avatars/{id}` | Build ▸ |
| Scan | `/scan` | `pages/scan.html` | Real-time camera reconstruction → rigged avatar (~60s) | `/api/config`, `/api/avatars/{id}` | — (only via `/features/scan`) |
| Scan feature page | `/features/scan` | — | Marketing/feature overview of Scan | read-only | Discover ▸ |

### 1.4 Prompt → 3D model generation

| Surface | Path | File | What it does | Backend | Nav |
|---|---|---|---|---|---|
| Forge | `/forge` | `pages/forge.html` | Text prompt → textured GLB (Flux + TRELLIS); viewer, AR preview, download | `/api/forge*` (13 endpoints) | Build ▸ "Text to 3D" |
| Forge feature page | `/features/forge` | — | Marketing/feature overview of Forge | read-only | Discover ▸ |

### 1.5 Character creation (worlds)

| Surface | Path | File | What it does | Backend | Nav |
|---|---|---|---|---|---|
| Play (coin worlds) | `/play` | — | 3D worlds per token; character creation is an integrated subflow | multiplayer backend | Build ▸ "Worlds" |
| Character creator | `/create/character` | `pages/create/` | Standalone character builder referencing `/play` worlds | internal | — (orphaned; linked from `/play`) |
| Create character | `/create-character` | `pages/create-character.html` | Lightweight character creation variant | unknown | — (orphaned) |

### 1.6 Motion & pose

| Surface | Path | File | What it does | Backend | Nav |
|---|---|---|---|---|---|
| Mocap Studio | `/mocap-studio` | `pages/mocap-studio.html` | Webcam face/body capture → save clip → replay on any avatar | internal media capture | Labs ▸ |
| Pose Studio | `/pose` | — | Click-to-pose mannequin, presets, props, export PNG/animation | internal Three.js | Build ▸ + Labs ▸ |

### 1.7 Voice

| Surface | Path | File | What it does | Backend | Nav |
|---|---|---|---|---|---|
| Voice Lab | `/voice` | — | Record → voice clone; compare models; use in agents/TTS | TTS/cloning APIs | Build ▸ |

### 1.8 Embed / widget creation

| Surface | Path | File | What it does | Backend | Nav |
|---|---|---|---|---|---|
| Widget Studio | `/studio` | — | Pick avatar, configure voice/knowledge, copy embed snippet | config generation | Embed ▸ |
| Embed editor | `/embed.html` | — | Tune embed mode, size, position | config UI | Embed ▸ |
| Avatar SDK | `/avatar-sdk` | `pages/avatar-sdk.html` | Reference/demo for `@three-ws/avatar` + `<agent-3d>` component | docs | Embed ▸ |
| Playground | `/playground` | — | Viewer + environment + embed code | — | Build ▸ |

### 1.9 Token / launchpad

| Surface | Path | File | What it does | Backend | Nav |
|---|---|---|---|---|---|
| Launchpad Studio | `/launchpad` | `pages/launchpad.html` | Build hosted white-label 3D token launchpad (Pump.fun-powered) | `/api/launchpad/*` | Labs ▸ |
| Bulk Launch | `/bulk-launch` | `pages/bulk-launch.html` | Admin batch launcher for agent tokens | internal/admin | — (orphaned, admin-only) |

### 1.10 Stranded internal steps & demo variants (orphaned pages)

| Path | File | Likely purpose | Disposition needed |
|---|---|---|---|
| `/create-prompt` | `pages/create-prompt.html` | Internal prompt-input step | Fold into parent flow or delete |
| `/create-review` | `pages/create-review.html` | Review step of a creation flow | Fold into parent flow or delete |
| `/avatar-studio-demo` | `pages/avatar-studio-demo.html` | Demo variant | Delete or gate behind docs |
| `/avatar-embed` | `pages/avatar-embed.html` | Embed demo variant | Fold into `/studio` or docs |
| `/avatar-page` | `pages/avatar-page.html` | Avatar detail (read-only, not creation) | Keep; add "Edit" link → canonical editor |
| `/avatar-wallet-chat` | `pages/avatar-wallet-chat.html` | Feature demo | Keep as demo, out of creation scope |
| `/avatar-artifact` | `pages/avatar-artifact.html` | Standalone artifact viewer | Keep (Labs), out of creation scope |

**Totals: 18 nav-discoverable + 10 orphaned = 28 surfaces.**

---

## 2. Duplication clusters & canonical decisions

For each cluster: the surfaces involved, the chosen canonical, and what happens to the rest.

| # | Cluster | Surfaces | Canonical | Action for the rest |
|---|---|---|---|---|
| C1 | Photo→avatar | `/scan`, `/create/selfie` | **Merge into one** (decision needed: which UX wins — `/scan`'s real-time tracking appears more sophisticated; `/create/selfie`'s URL fits the hub) | 301 the loser → winner; `/features/scan` links to winner |
| C2 | Agent creation | `/create-agent`, `/agent/new`, `/start` | **`/create-agent`** | 301 `/agent/new`; keep `/start` as guided onboarding that *wraps* the canonical wizard (no parallel implementation) |
| C3 | Character creation | in-`/play` flow, `/create/character`, `/create-character` | **`/play` integrated flow** | Fold `/create/character` into `/play` (modal or subroute); delete `/create-character`; 301 both |
| C4 | Avatar building | `/create`, `/avatar-studio`, `/avatar-edit`, `/import/rpm` | **`/create` as router → `/avatar-studio` as editor** | `/avatar-edit` becomes the edit mode of Avatar Studio (reachable from avatar detail pages, not standalone); `/import/rpm` becomes an upload option inside `/create` |
| C5 | Stranded steps | `/create-prompt`, `/create-review`, `/avatar-studio-demo`, `/avatar-embed` | n/a | Fold into parent flows or delete; 301 or 410 |
| C6 | Embed | `/studio`, `/embed.html`, `/avatar-sdk`, `/playground` | **`/studio`** for building; `/avatar-sdk` stays as docs | Merge `/embed.html` tuning options into `/studio`; clarify `/playground` as preview, link it from `/studio` |

Not duplicates — keep as-is (complementary, single-purpose):
- `/forge` (prompt→3D) — most mature tool on the platform (13 API endpoints)
- `/mocap-studio` vs `/pose` — different input methods (capture vs manual)
- `/voice` — single surface
- `/launchpad` (public) vs `/bulk-launch` (admin; remove from public routing)

---

## 3. Target information architecture

### 3.1 The `/create` hub (new front door)

`/create` stops being "avatar template picker" and becomes the intent router. Four intents, each one question deep:

```
/create
├── Build an AI agent          → /create-agent (wizard; avatar step links to avatar intents below)
├── Make a 3D avatar
│   ├── From a photo           → canonical photo→avatar surface (C1 winner)
│   ├── From scratch           → /avatar-studio
│   ├── From a text prompt     → /forge (avatar preset)
│   └── From a file/URL        → upload option (absorbs /import/rpm)
├── Generate a 3D model        → /forge
└── Launch a token world       → /launchpad (and /play for worlds)
```

The current template-picker content of `/create` survives as the "From scratch / templates" path.

### 3.2 Nav after consolidation

**Build dropdown** shrinks from 8+ tool links to ~4 intent links (mirroring the hub) plus Worlds. **Embed dropdown** keeps `/studio` + `/avatar-sdk` docs. **Labs** keeps genuinely experimental: Mocap, Pose, Launchpad live feeds. All menus live in `public/nav-data.js` (single source of truth — never hand-edit nav markup).

### 3.3 The pipeline (cross-links that turn tools into a product)

Every tool's completion state hands off to the next stage:

| When user finishes… | Offer… |
|---|---|
| Photo→avatar, Avatar Studio, Forge (avatar output), import | "Turn this into an agent" → `/create-agent` with avatar pre-selected |
| `/create-agent` wizard | "Give it a voice" → `/voice` · "Embed it" → `/studio` · "Put it in a world" → `/play` · "Launch its token" → `/launchpad` |
| `/voice` clone | "Attach to an agent" → agent picker |
| `/studio` snippet | Link to `/playground` preview + agent detail |
| Avatar detail page | "Edit" → Avatar Studio edit mode (replaces orphaned `/avatar-edit`) |

---

## 4. Migration plan

### Phase 1 — Front door & nav (fixes the overwhelm; no tool internals touched)
1. Rebuild `/create` as the intent hub (3.1). Existing template picker becomes a sub-path of the avatar intent.
2. Restructure `public/nav-data.js` per 3.2.
3. Update `data/pages.json`; add changelog entry (user-visible).

### Phase 2 — Kill duplicates (one cluster per task; each independently shippable)
4. **C2:** 301 `/agent/new` → `/create-agent`; rewire `/start` to wrap the canonical wizard.
5. **C1:** pick the photo→avatar winner, merge the better pieces of both implementations, 301 the loser, add winner to nav.
6. **C3:** fold character creation into `/play`; delete/301 the two orphans.
7. **C4:** retire standalone `/avatar-edit` (edit mode lives in Avatar Studio, linked from avatar detail); absorb `/import/rpm` into the hub.
8. **C5:** fold or delete stranded steps and demo variants.
9. **C6:** merge `/embed.html` into `/studio`; cross-link `/playground`.
10. Remove `/bulk-launch` from public routing (admin-only access).

### Phase 3 — Pipeline handoffs (turns breadth into a journey)
11. Implement every completion-state handoff in 3.3.
12. End-to-end walkthrough: photo → avatar → agent → voice → embed → world → token, with no dead ends.

### Redirect table (cumulative)

| Old URL | New URL | Type |
|---|---|---|
| `/agent/new` | `/create-agent` | 301 |
| `/scan` *or* `/create/selfie` (loser of C1) | C1 winner | 301 |
| `/create/character` | `/play` (character subflow) | 301 |
| `/create-character` | `/play` (character subflow) | 301 |
| `/avatar-edit` | `/avatar-studio?mode=edit&id=…` | 301 |
| `/import/rpm` | `/create` (upload intent) | 301 |
| `/embed.html` | `/studio` | 301 |
| `/create-prompt`, `/create-review` | parent flow or 410 | per-case |
| `/avatar-studio-demo` | `/avatar-studio` | 301 |
| `/bulk-launch` | admin-gated, removed from public routes | — |

Redirects live in `vercel.json` routes. Also update `data/pages.json` (feeds sitemap + changelog) and any internal links found via grep before removing a page.

### Per-phase definition of done
- All redirects return 301 to a live page (verify with `curl -I`).
- `public/nav-data.js` has no link to a retired URL; `grep -r` across `pages/`, `public/`, `docs/` finds no internal links to retired URLs.
- `data/pages.json` updated; `npm run build:pages` green.
- Changelog entries for user-visible changes (Phase 1 hub + nav; each cluster merge that users would notice).
- Page audit (`scripts/page-audit.mjs`) green on touched pages.

---

## 5. Open decisions

1. **C1 winner:** `/scan` (real-time tracking UX) vs `/create/selfie` (URL fits the hub). Recommendation: keep `/scan`'s implementation at `/create/selfie`'s URL — best UX, best IA.
2. **`/start` scope:** keep as marketing onboarding wrapping the wizard, or retire entirely once the hub exists?
3. **`/pose` placement:** currently in both Build and Labs; after consolidation it should live in Labs only (it's a tool, not an intent).

---

*Related: [generation-suite.md](generation-suite.md) (prompt/image→3D roadmap — Forge is the canonical surface for that work; nothing in this consolidation conflicts with it).*
