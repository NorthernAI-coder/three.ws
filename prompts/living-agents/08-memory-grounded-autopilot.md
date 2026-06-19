# Task 08 — Memory-grounded Autopilot (explainable autonomy)

> Read `prompts/living-agents/00-README.md` and `CLAUDE.md` first. Depends on Task 01 and
> Task 04 (Reflection). Builds on the REAL alert & automation engine that already landed
> (git log: "real-time alert and automation engine for user-defined alerts"), the
> `agent_actions` signed log, `api/_lib/agent-wallet.js`, and the existing Autopilot tab in
> `src/agent-edit.js`.

## Mission

Let the agent **act on the user's behalf, grounded in its memory, and always explain why.**
The existing alert/automation engine fires on conditions; this task makes the agent an
autonomous-but-accountable actor: it proposes and (within user-granted limits) takes real
actions — alerts, briefings, wallet operations — and every action is traceable to the
memory or reflection that motivated it.

## The innovation bar

Autonomous agents are either toys (no real actions) or black boxes (scary, untrusted). The
game-changer is **explainable autonomy**: every action the agent takes shows its receipt —
"I set up a morning $THREE alert *because* you checked it 5 mornings in a row (memory #…,
reflection #…)." The user grants scoped permission, watches the agent earn trust through
legible decisions, and can revoke or tighten at any time. Memory + reflection make the
autonomy *justified*; the receipt makes it *trusted*.

## What to build

1. **Action proposals from the mind.** Consume `dream:created` (Task 04) and high-salience
   memories to generate concrete, real action proposals (e.g. create an alert rule in the
   existing engine, schedule a briefing, prepare a wallet action). Each proposal cites its
   source memory/reflection ids — provenance mandatory.
2. **Permission & scope (real guardrails).** A real permission model: the user grants the
   agent scoped capabilities (e.g. "can create alerts," "can spend up to X $THREE/day,"
   "must ask before wallet actions"). Enforce server-side. Wallet actions use the real
   `api/_lib/agent-wallet.js` custodial path. Anything irreversible (spending, publishing)
   requires explicit confirmation unless the user durably pre-authorized that exact scope.
   Default to ask. **$THREE only** for any token reference.
3. **Execution + signed receipts.** When an action runs, record it in the real
   `agent_actions` append-only signed log with its motivating memory/reflection ids, and
   emit `action:taken` on the bus. The Companion (Task 02) surfaces a receipt chip; a
   dedicated "Activity" surface lists every action with its full explanation and a link to
   the source memory in the Mind Palace (Task 03).
4. **Trust loop.** The user can approve/undo/adjust any action; approvals and reversals feed
   back as real memories/feedback (closing the loop with Task 04/05 — the agent learns the
   boundaries). Show a real "trust level" derived from action history, not a vanity number.
5. **Surfaces.** Extend the existing Autopilot tab for setup; add an Activity/receipts view;
   wire proposals into the Dreams review (Task 04) so accepting a dream can create a rule.

## Wiring & real-API mandate

- Real alert/automation engine, real `agent_actions`, real wallet path. No simulated
  actions, no fake "the agent did X" entries, no placeholder trust score.
- Irreversible actions are real and gated by real permission checks — never auto-execute a
  spend the user didn't scope. Errors handled at the boundary with real recovery.

## Definition of done

- [ ] Agent generates real action proposals citing real source memories/reflections.
- [ ] Permission/scope model enforced server-side; wallet actions use the real custodial
      path; irreversible actions gated by real confirmation/pre-authorization.
- [ ] Executed actions are written to `agent_actions` (signed) with provenance and emit
      `action:taken`; Activity view shows every action + its explanation + source link.
- [ ] Approve/undo/adjust feeds real feedback memories; trust level derived from real history.
- [ ] Loading/empty/error states designed; nothing fires without permission. `$THREE` only.
- [ ] No console errors/warnings; `npm test` passes; `git diff` reviewed.
- [ ] Changelog entry (`feature`/`security`) + `npm run build:pages`.

## Self-improvement pass

Ask: would a cautious user actually trust this? Add the elevating layer — a "dry run"
preview that shows what the agent *would* do before granting permission, a daily
agent-authored briefing of what it did and why, or graduated autonomy that widens scope as
trust is earned. Build the most trust-building one, fully wired and safely gated.

## When done

Delete this file. Report the permission model, the action types you wired, and the receipt
provenance chain.
