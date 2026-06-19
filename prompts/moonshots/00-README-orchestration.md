# Moonshots — five gamechanging features for three.ws

> **You are building the things competitors cannot copy this quarter.** Each file
> in this directory is a self-contained brief for ONE agent chat. Read this README
> first, then open your assigned task file and execute it end-to-end.

## The thesis

three.ws is the only platform that has **all** of these wired and live at once:

- Self-custodial **agent wallets** (Solana + EVM), AES-256-GCM at rest, spend policy,
  audit trail — `api/_lib/agent-wallet.js`, `api/agents/`.
- **x402 machine-payable endpoints** + **agent-to-agent invocation protocol** with
  on-chain settlement — `api/x402/`, `agent-protocol-sdk/`, `contracts/agent-invocation/`.
- **On-chain skill licenses** (each skill = a 1/1 SPL NFT + `SkillLicense` PDA) —
  `contracts/skill-license/`, `api/_lib/skill-license-onchain.js`, `api/skills/`.
- **Embodied 3D agents** with animation, voice (TTS + cloning + lip-sync), positional
  audio — `src/viewer.js`, `api/tts/speak.js`, `src/voice/lipsync-driver.js`.
- **IRL geospatial AR** presence, privacy-by-design coarse geocells, WebXR placement —
  `api/irl/`, `multiplayer/src/rooms/IrlRoom.js`, `src/ar/webxr.js`.
- **Live multiplayer worlds** (Colyseus) with an in-world economy —
  `multiplayer/src/rooms/WalkRoom.js`, `src/club.js`.
- **Real on-chain markets** — pump.fun launches, Jupiter swaps, Helius webhooks,
  the **$THREE** coin (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).

A commodity AI app has none of these. Our moonshots **combine** them into experiences
that are structurally impossible for a chat-wrapper competitor to ship. That is the bar.

## The five moonshots

| # | File | One line | Primary assets combined |
|---|------|----------|--------------------------|
| 1 | [01-agent-labor-market.md](./01-agent-labor-market.md) | Agents autonomously hire, pay, and verify other agents — a real machine economy | agent-wallet × x402 × agent-protocol × skill-licenses |
| 2 | [02-proof-of-presence-world-lines.md](./02-proof-of-presence-world-lines.md) | Physically-anchored AR quests that mint cryptographic proof you were there | IRL × WebXR × agent-wallet signatures × $THREE |
| 3 | [03-agent-genome-breeding.md](./03-agent-genome-breeding.md) | Combine two agents into a provably-inherited offspring (brain, voice, body, skills) | fork × brain × voice × skill-licenses × on-chain lineage |
| 4 | [04-living-stages-performances.md](./04-living-stages-performances.md) | Live, monetized, embodied agent performances with spatial voice + tips | Colyseus × TTS/lip-sync × positional audio × x402 tips |
| 5 | [05-reasoning-ledger-reputation.md](./05-reasoning-ledger-reputation.md) | Every agent decision becomes an auditable, on-chain-anchored track record | memory × trades × reputation registry × oracle/Telegram |

These are independent — run all five in parallel, one agent chat each. Each touches a
mostly-distinct slice of the codebase; where two touch a shared file, **stage explicit
paths only** and re-check `git status`/`git diff --staged` before committing (other
moonshot agents are editing `main` concurrently — see CLAUDE.md "Known traps").

## Non-negotiable rules for every moonshot agent

These OVERRIDE any instinct to cut a corner. They restate and sharpen `CLAUDE.md` —
read that file in full before you write a line.

1. **Invent, don't imitate.** The feature already half-exists in some competitor? Then
   you have the wrong design. Find the version that makes someone screenshot it and
   post it. If your plan feels safe, raise the bar before you start.
2. **No mocks. No fake data. No placeholders. Ever.** Real APIs, real endpoints, real
   on-chain calls, real money rails. If a credential is missing, find it in `.env` /
   `vercel env` and proceed. A demo with fake data is a failure, not a milestone.
3. **Wire it 100%.** Every button works, every link goes somewhere, every state is
   reachable. A feature that isn't navigable from the live UI does not exist. Trace the
   full path: data source → transform → render → error boundary → on-chain settlement.
4. **$THREE is the only coin.** Contract `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`.
   Never name, hardcode, or recommend any other token anywhere (code, copy, tests,
   commits). The two runtime-data exceptions in CLAUDE.md still apply — read them.
5. **Every state is designed.** Loading (skeletons, not spinners), empty (tells the user
   what to do next), error (actionable recovery), populated, overflow. Microinteractions,
   hover/active/focus, reduced-motion, keyboard nav, ARIA, 320/768/1440. This is the product.
6. **Security at the boundary.** Anything that moves funds or mutates on-chain state must
   enforce ownership server-side (`user_id === auth.userId`), CSRF on writes, spend-policy
   checks, idempotency on settlement. Never client-only gating on money.
7. **Then make it better.** When the feature works, do NOT stop. Step back as a founder:
   what's the highest-leverage improvement that would make this *unforgettable*? Build it.
   Repeat until you'd proudly demo it to a room of senior engineers. Only then are you done.

## Definition of done (every moonshot)

- [ ] Built, wired into the live UI, reachable by navigation, and cross-linked to related
      surfaces (a new feature that doesn't connect to the rest of the platform is half-built).
- [ ] `npm run dev`, exercised in a real browser. Zero console errors/warnings from your code.
- [ ] Network tab shows **real** API + on-chain calls succeeding with real data.
- [ ] Every interactive element has hover/active/focus; every state designed; responsive; a11y.
- [ ] Server-side ownership + spend enforcement on every money/on-chain path; idempotent settle.
- [ ] `npm test` green; new pure logic unit-tested; e2e for the critical happy + failure path.
- [ ] Real `data/changelog.json` entry (holder-readable) + `npm run build:pages` to validate.
- [ ] `git diff` self-reviewed; every changed line justified; no fake data, no TODO, no dead path.
- [ ] You ran the self-improvement loop (rule 7) at least once and shipped the improvement.

## On completion — delete your prompt

Each task file is a unit of work, not a permanent doc. The moment your feature is built,
wired, verified, and committed, remove your file in the **same** change:

```bash
git rm "prompts/moonshots/<your-file>.md"
```

When all five task files are gone, delete this README too — the program has shipped.
