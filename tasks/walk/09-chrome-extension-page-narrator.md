# Task 09 — Chrome Extension: Walking Avatar Reads the Page Aloud

## Priority: HIGH

## Objective
Make the walking avatar a true browsing companion: as the user scrolls, the avatar narrates page sections via TTS, with a speech bubble showing what's being read. Pair this with simple page-aware walking — avatar appears to walk toward the section currently in view.

## Scope
- File: `extensions/walk-avatar/content-narrator.js` (new module loaded by `content.js`)
- Content extraction:
  - Walk the DOM and identify "readable sections" — `<article>`, `<section>`, `<h1>`–`<h3>` with following sibling paragraphs, `<main>` blocks
  - Strip nav, footer, scripts, ads (use `Readability.js` from Mozilla — vendored into `extensions/walk-avatar/vendor/readability.js`, real BSD-licensed copy)
- Section tracking:
  - `IntersectionObserver` on each section; when ≥60% in viewport, mark as "active"
  - On active section change: post `{ type: 'walk:narrate', text: <section.innerText slice 0..400> }` to iframe
- iframe walk-embed page receives the message and:
  - Plays gesture animation ("reading" — use idle variant)
  - Calls real `/api/tts/speak?text=<encoded>&voice=<setting>` — uses existing TTS API (see `api/tts/speak.js`)
  - Streams audio via MediaSource or plays returned audio blob
  - Renders a speech bubble overlay above the avatar with the text (auto-wraps, 3 lines max, fades after audio ends)
- Mute toggle in the avatar container (hover-revealed icon top-right)
- Respect `prefers-reduced-motion` and a setting to disable narration

## Definition of Done
- Open any article (e.g., a Wikipedia page) with extension enabled
- Scroll → avatar narrates the section in view with real TTS audio
- Speech bubble shows the text being read
- Mute toggle silences immediately and cancels in-flight audio
- No double-narration on rapid scroll (debounce active-section changes by 600 ms)
- No console errors

## Rules
Complete 100%. No stubs. No fake data. Use the real TTS endpoint. Wire every step end-to-end and verify in a real browser.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/walk/09-chrome-extension-page-narrator.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
