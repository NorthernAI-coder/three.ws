# Task 09 — First-run onboarding clarity and copy quality

**Phase:** 2 (UX / polish) · **Effort:** S · **Files:** `pages/irl.html`, `src/irl.js`, `src/irl/onboarding.js`

## Why
A new user must instantly understand the core loop: **turn on Camera AR → walk/aim
→ Pin here to anchor in real space**. Today the subtitle is vague and several
status strings use abstract jargon ("anchor it", "rotated") or are mildly alarming.
Copy must be professional and literal (per memory `public-copy-tone`): "3D AI
agents", never sci-fi metaphors.

## Read first (verify before fixing)
- Subtitle + hero — `pages/irl.html` `#irl-subtitle` (~1581) "Turn on camera to place in your space"
- Caption input + autofocus — `src/irl.js:1459-1461` (`setTimeout(... captionInput.focus(), 300)`)
- Lock/GPS status strings — `src/irl.js:1003`, `1006`, `1312`, and the warn copy in `anchorGpsPin`
- Onboarding permission copy — `src/irl/onboarding.js`

## Scope — confirm, then fix

1. **First-run guidance.** Make the path obvious for a brand-new user. When the
   camera is off, the subtitle/hint should point to the next concrete step
   ("Turn on Camera AR, then tap Pin here to anchor your agent in real space").
   Once the camera is on but not pinned, nudge toward Pin here. A one-time,
   dismissible coach hint is acceptable; keep it lightweight and non-blocking.

2. **Caption autofocus.** Replace the fragile `setTimeout(…300)` focus with a focus
   tied to the sheet's open transition (or `autofocus`), so the keyboard reliably
   opens on iOS when the caption panel slides up.

3. **Copy rewrite — literal, calm, actionable.** Revise at minimum:
   - "Waiting for location to pin precisely…" → say what to do if it's slow.
   - "Pinned to your view — enable location to anchor it for others" → "Your agent is
     pinned on this device. Turn on location to place it at this real-world spot for
     others." (or similar — plain, concrete).
   - "Compass heading unavailable — others may see this agent rotated" → reassuring +
     accurate, no alarm.
   - Audit ALL user-facing IRL strings for jargon, sci-fi metaphor, and tone. Keep
     it short and professional.

4. **Success feedback.** Confirmations ("Pinned", "Camera off") should read as
   intentional success, paired with the visual treatment from task 08/07.

## Out of scope
The permission *flow* mechanics (shipped); a11y rings (task 07); state shells (task 08).

## Definition of done
- [ ] A first-time user can complete pin-an-agent without external help (validate the
      wording against the actual UI; document the flow).
- [ ] Caption keyboard opens reliably on iOS (manual).
- [ ] No abstract/jargony/alarming/sci-fi copy remains; tone matches platform voice.
- [ ] esbuild clean; `npm test` green; changelog entry ("Clearer IRL onboarding and copy").

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-production/09-onboarding-copy.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
