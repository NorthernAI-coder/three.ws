# Task 18 — Compliance & trust: cookie consent, a11y statement, disclosure, incident history

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. **Track F —
> Credibility.** Independent. These are the trust surfaces enterprise/partners and EU users
> check for — present individually small, collectively the difference between "credible" and
> "hobby."

## The thesis

three.ws already has real legal, security, and status surfaces — better than most startups.
The remaining gaps are the specific trust artifacts buyers and regulators look for: a GDPR
cookie-consent path, a published accessibility commitment, a responsible-disclosure/bug-bounty
policy, and a persistent incident history. Each is small; together they signal a platform that
takes trust seriously enough to scale.

## What exists today (read first)

- **Privacy/ToS/EULA are real** — `public/legal/{privacy,tos,eula,aws-marketplace-eula}.html`
  (privacy already documents cookies + GDPR rights, but there's **no consent UI** and **no
  standalone cookie policy**).
- **Security is real** — `public/.well-known/security.txt` (RFC 9116),
  [docs/security.md](../../docs/security.md) — but there's **no public responsible-disclosure /
  bug-bounty page** linked for users, and **no compliance posture** (SOC2 status/roadmap).
- **Status is real-time** — [pages/status.html](../../pages/status.html) (live, 90-day uptime)
  — but there's **no persistent incident history / postmortem archive**.
- **A11y is strong in code** (per the changelog) but there's **no public accessibility
  statement** (`/accessibility`) and no a11y feedback channel.

## What to build

1. **Cookie consent (GDPR).** A real, accessible consent banner/preference UI for non-essential
   cookies/analytics, honoring the choice (don't load non-essential tracking before consent in
   relevant regions). Plus a standalone `/legal/cookies` page (or a clearly-linked section)
   listing the real cookies the privacy policy already documents. Consent state persists and is
   revocable.
2. **Accessibility statement** (`/accessibility`) — the real WCAG target (state the level
   honestly given the code's current state — don't over-claim), the commitment, known
   limitations, and a dedicated feedback channel ([pages/support.html](../../pages/support.html)
   emails). Link from footer.
3. **Responsible disclosure / security policy page** — a public page describing how to report a
   vulnerability, scope, safe-harbor language, and response SLA, consistent with
   `security.txt`. If the user wants a bug bounty, structure it; otherwise a clear coordinated-
   disclosure policy. Link from `security.txt`, `/security` (if present), and footer.
4. **Incident history / status archive.** Persist past incidents (date, impact, resolution,
   postmortem link) and surface them on [pages/status.html](../../pages/status.html) so the
   status page has memory, not just a live light. Real incidents only — start the log; don't
   invent past ones. Coordinate with `12`/`13` (they produce the real signal).

## Hard rules specific to this task

- **Honest claims only.** Don't claim SOC2 you don't have, a WCAG level you don't meet, or
  incidents that didn't happen. State the real posture and the roadmap. False compliance claims
  are worse than absent ones.
- Accessible and responsive themselves (a cookie banner that traps keyboard focus or fails
  contrast is self-defeating).

## Definition of done

README DoD, plus: a working, accessible, revocable cookie-consent flow + cookies page;
`/accessibility` live with an honest WCAG claim + feedback channel; a public disclosure/security
policy linked from `security.txt` and footer; an incident-history section on the status page
backed by real data. All pass `npm run audit:pages` and are linked from footer. Changelog
(`security`/`docs`). Self-review, then strengthen the weakest claim's accuracy/clarity.

Delete this file when done.
