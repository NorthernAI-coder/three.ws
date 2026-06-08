# Week of 2026-06-08 — Task Board

Source of truth for this week's work. Derived from a full-codebase audit on 2026-06-08:
production logs (Jun 6–7 export), an incomplete-feature/rule-violation sweep, the API
surface map, and the roadmap backlog.

Each file in this directory is a **self-contained prompt for one agent**. An agent should:

1. Read exactly one task file.
2. Complete it fully and professionally, obeying [CLAUDE.md](../../CLAUDE.md).
3. Verify the work (build/tests/manual as specified in the task).
4. **Delete the task file it just read** as the final step (see each task's "Completion protocol").
5. Commit the change **and** the file deletion together. Do **not** push — pushes are the human's call.

No mocks, no stubs, no placeholders, no TODOs. The only coin that may ever appear anywhere
is `$THREE` (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).

---

## Tasks

| ID | Title | Track | Priority | Depends on | Effort |
|----|-------|-------|----------|------------|--------|
| A1 | `/api/pump/curve` 404 + RPC storm | A — prod fire | P0 | — | 2–3h |
| A2 | `/api/chat` 502s — harden LLM fallback chain | A — prod fire | P0 | — | ~half day |
| A3 | Forge `views_used` migration not applied in prod | A — prod fire | P1 | — | 30m–1h |
| A4 | `/api/pump/by-agent` 500 — add UUID guard | A — prod fire | P1 | — | 1–2h |
| A5 | Neon cold-start failures (auto-agent + seed) | A — prod fire | P2 | — | 2–4h |
| B1 | Coin-purity sweep — purge all non-$THREE tokens | B — complete | P0 | — | 2–3h |
| B2 | EVM marketplace purchase confirmation (501 dead-end) | B — complete | P1 | — | 1–2 days |
| B3 | Remove/implement empty `skill-collection.js` | B — complete | P2 | — | 30m–2h |
| B4 | Docs + CI hygiene (texture worker, zero-byte guard) | B — complete | P2 | — | 2–3h |
| C1 | `three-token-data.js` shared hook (keystone) | C — build | P1 | — | ~half day |
| C2 | $THREE holder "your position" widget (Task 14) | C — build | P1 | C1 | 1 day |
| C3 | Holder leaderboard + endpoint + gated 3D badge (Task 15) | C — build | P1 | C1 | 1–2 days |
| C4 | $THREE token page upgrade (Task 16) | C — build | P2 | C1 | 1–2 days |
| C5 | Holder rewards / revenue-share surface (Task 17) | C — build | P2 | C1 | 1 day |
| C6 | Reconcile + polish `/three-live` (Task 13) | C — build | P3 | — | half day |

## Recommended order

- **Day 1 (parallel):** A1, A2, A3, B1 — independent, low-risk, highest impact.
- **Day 2:** A4, A5, B3, B4 — cleanup; start **C1** (keystone).
- **Day 3+:** C2 and C3 in parallel once C1 lands; B2 in its own lane; then C4/C5; C6 last.

## Dependency notes

- **C2, C4, C5 all consume the C1 hook.** Do not start them before C1 is merged, or they will
  re-implement $THREE data fetching and drift.
- **C3** depends on C1 only for the client surface; its new `?action=leaderboard` endpoint is
  independent and can be built in parallel.
- **A2 has an operational prerequisite** (confirm `ANTHROPIC_API_KEY` is set in Vercel prod) that
  the human must verify — see the task.

## Hard correctness flag for Track C

There is **no on-chain rewards/claim program** in `contracts/`. `/api/three-token/revenue-share`
returns pro-rata *math*, not a claimable balance. C5 must be an accrual/calculator surface that
labels claiming as "coming" — do **not** wire a claim button with no backing program.
