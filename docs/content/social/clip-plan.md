# Clip Plan

Standalone short-form clips derived from G02's five video scripts. **G02's scripts are not yet present** under `docs/content/video-scripts/`, so — per the brief — each clip below derives from the **same real flow** in [`README.md`](../../../README.md) that the corresponding G02 script will cover. When G02 lands, re-point each clip's "Beats" at the actual beat table; the flows and CTAs stay the same.

Each clip is built for vertical platforms (YouTube Shorts / TikTok) and reusable on X and Farcaster. Captions pull from [post-templates.md](post-templates.md) (feature-spotlight format) with a hook from [hooks-library.md](hooks-library.md). No clip claims a metric.

**Universal cut rules:** payoff in the first 2 seconds · on-screen text names the feature · CTA route in caption + end card · 9:16 for Shorts/TikTok, 1:1 or 16:9 re-cut for X/LinkedIn.

---

## Clip 1 — Selfie → 3D agent

- **Real flow:** `/scan` + `/create/selfie` 3-photo capture (`README.md` Phase 1 / Vision). Maps to G02 Script 1.
- **Target platforms:** YouTube Shorts, TikTok (primary); X, Farcaster (re-cut).
- **Aspect ratio:** 9:16 primary; 1:1 for X.
- **Strongest 1–2 beats to cut:** (a) the three-angle capture with live quality gates; (b) the rigged avatar appearing and turning. End on the avatar, not the UI.
- **Suggested caption (FS template):** Hook #16 → "Three selfies in, a rigged 3D avatar out. → Try it: three.ws/scan" + proof line to `README.md` Phase 1.
- **CTA URL:** `https://three.ws/scan`
- **Honesty note:** Phase 1 GPU reconstruction is still wiring up — show only what the live capture flow actually produces; don't imply instant photoreal results we can't demo.

## Clip 2 — Forge: text → 3D

- **Real flow:** `/forge` text→3D pipeline (live route `/forge`; in-house text→3D). Maps to G02 Script 2.
- **Target platforms:** YouTube Shorts, TikTok (primary); X, Farcaster.
- **Aspect ratio:** 9:16 primary.
- **Strongest 1–2 beats to cut:** (a) typing the prompt; (b) the generated 3D model rotating. Cut the wait — show prompt → result.
- **Suggested caption (FS template):** Hook #17 → "Type a prompt, get a 3D model. This is Forge. → Try it: three.ws/forge."
- **CTA URL:** `https://three.ws/forge`
- **Honesty note:** Real generation only — no sped-up fake progress that misrepresents real latency.

## Clip 3 — Embed an agent anywhere

- **Real flow:** `<agent-3d>` one-tag embed + iframe widget (`README.md` Examples §1, §6); `/embed-editor`. Maps to G02 Script 3.
- **Target platforms:** YouTube Shorts, TikTok (primary); X (dev audience), LinkedIn (BD).
- **Aspect ratio:** 9:16 primary; 16:9 for LinkedIn.
- **Strongest 1–2 beats to cut:** (a) pasting one `<agent-3d>` tag (or the iframe) into a real page; (b) the live talking agent appearing in Notion/Webflow. Split-screen code → result reads great.
- **Suggested caption (FS or DT template):** Hook #18 → "Paste one iframe into Notion and an AI agent shows up live. → three.ws/embed-editor" + docs link to Examples §6.
- **CTA URL:** `https://three.ws/embed-editor`
- **Honesty note:** Use real third-party hosts (Notion/Webflow/WordPress) the README claims support for; don't fake a host.

## Clip 4 — $THREE coin world + agents paying agents

- **Real flow:** `/play` shared coin world (`README.md` Coin Communities) + x402 agents-pay-agents (`README.md` x402 §). Maps to G02 Script 4.
- **Target platforms:** TikTok, YouTube Shorts (primary); Farcaster (crypto-native), X.
- **Aspect ratio:** 9:16 primary.
- **Strongest 1–2 beats to cut:** (a) picking $THREE and landing in the shared world with peer avatars + live market-cap screen; (b) two agents settling a real USDC payment over x402. Two strong beats — consider two clips if both can't fit 30s.
- **Suggested caption (FS template):** Hook #20 → "Same coin, same world: peer avatars, chat, and a live market-cap screen in one shared 3D space. → three.ws/play."
- **CTA URL:** `https://three.ws/play`
- **Honesty notes:** Never describe `/play` as single-player — it's a live, shared world. $THREE is the only coin shown; CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. The x402 payment must be a real settled transaction.

## Clip 5 — Register on-chain: the agent passport

- **Real flow:** on-chain registration → passport at `/a/[chain]/[id]` / `/a/sol/[asset]`; ERC-8004 + Metaplex Core (`README.md` On-Chain Identity §; `docs/erc8004.md`). Maps to G02 Script 5.
- **Target platforms:** Farcaster (primary, crypto-native), YouTube Shorts, X; LinkedIn (BD angle).
- **Aspect ratio:** 9:16 primary; 16:9 for LinkedIn.
- **Strongest 1–2 beats to cut:** (a) the agent registering (`/deploy`); (b) the resulting passport — wallet, signed action log, reputation — on its public page. End on the verifiable passport.
- **Suggested caption (FS template):** Hook #19 → "Here's an agent registering itself on-chain and getting a passport you can verify. → three.ws/deploy" + proof link to `docs/erc8004.md`.
- **CTA URL:** `https://three.ws/deploy`
- **Honesty note:** Show a real on-chain artifact (real tx / real passport page); the signed action history is the proof — link it.

---

### When G02's scripts land

1. Open `docs/content/video-scripts/` and read each beat table.
2. Replace each clip's "Strongest 1–2 beats to cut" with the actual beat numbers/timestamps from the matching script.
3. Keep the CTA URLs and honesty notes — they're tied to real product surfaces, not the script wording.
4. If G02 adds a sixth script (e.g. an IBM/watsonx demo), add a clip here — but for IBM use "built on watsonx.ai" language and link the IBM co-marketing social kit rather than duplicating its posts.
