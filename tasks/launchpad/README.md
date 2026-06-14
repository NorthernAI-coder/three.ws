# Token Launchpad — completeness tasks

Every task in this folder targets the token launchpad for 3D AI Agents as a unified product surface. The goal is a launch experience that is complete, wired, and professional — no mocks, no dead links, no missing states.

Each file is independent. Pick any one and ship it end-to-end.

**Operating rules (same as all tasks in this repo):**
- No mocks. No fake data. No placeholders. No `Math.random()` standing in for real cryptography.
- If credentials are missing, locate them in `.env`, `vercel env ls`, or ask once — then proceed.
- Start `npm run dev`, exercise the feature in a real browser, no console errors, network tab shows real calls.
- Run the **completionist** subagent on changed files before claiming done.

## Task list

| # | File | Surface | Status |
|---|------|---------|--------|
| 01 | [01-launch-modal-post-launch-cta.md](01-launch-modal-post-launch-cta.md) | Launch modal success state | Open |
| 02 | [02-launches-feed-coin3d-action.md](02-launches-feed-coin3d-action.md) | /launches card actions | Open |
| 03 | [03-pump-live-e2e-verify.md](03-pump-live-e2e-verify.md) | /pump-live WS + rendering | Open |
| 04 | [04-pump-visualizer-data-wire.md](04-pump-visualizer-data-wire.md) | /pump-visualizer Three.js + data | Open |
| 05 | [05-launchpad-builder-avatar-picker.md](05-launchpad-builder-avatar-picker.md) | Launchpad studio avatar picker | Open |
| 06 | [06-agent-coin-shared-widget.md](06-agent-coin-shared-widget.md) | Shared coin-status widget | Open |
| 07 | [07-tokenized-agents-skill-gate.md](07-tokenized-agents-skill-gate.md) | $THREE holder gate on skills | Open |
| 08 | [08-nav-and-crosslinks.md](08-nav-and-crosslinks.md) | Cross-links between all launchpad surfaces | Open |

## Already tracked elsewhere

The 12 pump-dashboard panel tasks are in [../pump-dashboard-real-apis/](../pump-dashboard-real-apis/). Those are independent of this folder — ship either set in any order.
