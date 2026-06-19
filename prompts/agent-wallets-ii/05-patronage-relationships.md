# Task 05 — Patronage, Relationships & Tip-to-Unlock

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. This task
> assumes all of it (ownership model, hard rules, design tokens, real APIs, concurrency
> traps, definition of done, self-improve-then-delete).

## The idea (why it's gamechanging)

A tip today is a dead-end transaction. We make money **build relationships.** Because
every agent has **persona + memory**, tipping/streaming/paying an agent should *mean*
something: the agent **remembers its patrons**, greets its top supporters by name, and
**unlocks things** for them — exclusive replies, hidden memories, special skills, a place
on its patron wall, early access to its launches. Support becomes a relationship with a
character, not a one-off.

This fuses three.ws's two unique assets — **wallets** and **agent memory/persona** — into
something no wallet and no creator platform has: a living, on-chain patron relationship
with an autonomous character. It's Patreon × an AI you actually talk to × real crypto,
and it makes tipping *sticky* and emotionally resonant.

## How to build it for real (relationships backed by real on-chain support)

1. **Patron ledger from real money.** Aggregate each supporter's **real** lifetime
   support to an agent from the custody ledger (tips from task task-tip, streams from
   task 01, x402 pays) — `listCustodyEvents` filtered by `to = agent`, grouped by `from`.
   Derive `patronLevel` from real cumulative support with **documented thresholds**
   (e.g. supporter → patron → champion → benefactor). No fake counts ever.
2. **Memory integration (the magic).** When support crosses a threshold, write a **real**
   agent memory via the existing memory pipeline (`/api/agent-memory`, the memory UI in
   [src/agent-detail.js]) — e.g. "Patron `vibedotsol` has supported me with 1.2 SOL; greet
   warmly, thank them." The agent's chat/persona then naturally references it (the chat
   already reads memory). Identity of the patron = their connected wallet (and SNS/.sol
   name where resolvable via the existing SNS lookup) — never spoofable; verify the
   connected wallet matches the on-chain `from`.
3. **Unlocks, enforced server-side.** "Tip-to-unlock" perks are **real, gated
   capabilities**, not cosmetic claims:
   - perk types map to things that exist: an exclusive chat mode/greeting, a hidden
     memory/lore entry, a gated skill ([api/agents/.../skills], skill access patterns
     already in the repo), early/priority access to the agent's launches, a patron badge.
   - the owner defines perks + thresholds for **their** agent (owner-only config). Access
     is checked server-side against the supporter's verified on-chain support level on
     every gated request — never trust the client.
4. **Patron wall + reciprocity.** A public patron wall on the agent (top supporters, real
   amounts, real links), and optional auto-reciprocity via the Intents engine (task 02):
   "tip back champions," "shout out new patrons." Seasons/epochs (e.g. monthly) so there's
   always something live to compete for — computed from real timestamped events.

## The UI

- **On the agent (visitor view):** a "Support" surface showing the perk ladder ("Tip 0.5
  SOL to unlock X"), the patron wall, and the visitor's own current level + progress.
  Tipping/streaming (reuse task-tip + task 01) updates level live after on-chain confirm.
- **Owner view:** perk/threshold editor, patron CRM (who supports me, how much, last
  active — real data), and a one-tap "thank top patrons" (via intents). Owner-only.
- **In chat:** when a recognized patron opens the agent's chat, the agent greets them per
  the real memory (e.g. "good to see you again, vibe — thanks for the support"). Never
  fabricate a relationship that isn't backed by real support.
- States: not-yet-a-patron (clear ladder + CTA), progressing, unlocked (celebratory, real
  receipt), owner-empty (suggest starter perks), error. Skeletons, a11y, reduced-motion.

## Ownership / viewer states

- **Owner**: configures perks/thresholds, sees the patron CRM, arms reciprocity.
- **Visitor/patron**: supports, sees their level + unlocked perks, appears on the wall
  (with an opt-out for privacy). Perks enforced server-side by verified support.
- **Logged-out**: sees the ladder + wall read-only; connect to support/unlock.

## Definition of done (in addition to 00's list)

- Patron levels + unlocks derive from **real** on-chain support (custody ledger), with
  documented thresholds and server-enforced gating (no client-trusted perks).
- Real memory entries are written on threshold crossings and actually influence the
  agent's chat greeting/behavior.
- Patron identity verified (connected wallet == on-chain `from`); SNS names resolved where
  available; privacy opt-out honored.
- Wired into the agent profile/character, chat, and owner dashboard; ties into tipping +
  streams (01) + intents (02).
- Edge cases: anonymous/un-resolvable supporters, a patron who withdraws support context
  (levels are cumulative + documented), 1000 patrons (paginate the wall), season rollover,
  expired session, very long names.

## Then improve, then delete

After done, run the self-review protocol. Pick the biggest weakness and fix it — e.g. a
shareable "I'm now a champion patron of <agent>" card, patron-only group moments, or
surfacing top patron relationships as edges in the Money Constellation (task 04). Then
**delete this file**.
