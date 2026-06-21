# 25 · Search & Command Palette

## Mission
Global search (top-nav ⌘K) returns fast, relevant results across pages, agents, skills, avatars,
docs, and launches — and routes the user straight to what they want.

## Context
- Top-nav search + `dashboard-next` command palette (`data-action="open-palette"`, ⌘K).
- Catalog: `data/pages.json`; entity APIs for agents/skills/avatars/launches.

## Tasks
1. **Coverage:** index/search pages, agents, skills, avatars, docs, changelog, launches. Define what's
   searchable and ensure each result type routes correctly.
2. **Relevance + speed:** debounced input; ranked results (name > tags > description); keyboard
   navigation (arrows + Enter); recent/suggested when empty.
3. **States:** empty query (suggestions), no results (helpful message + nearest actions), loading,
   error. Never a blank dropdown.
4. **Command palette:** quick actions (create agent, open forge, go to dashboard, toggle theme, etc.)
   alongside entity results; consistent with top-nav search.
5. **Accessibility:** full keyboard operation, ARIA combobox/listbox semantics, focus management.
6. **Performance:** results render < 100ms after debounce on a warm index; no main-thread jank.

## Acceptance
- ⌘K opens instantly; queries return ranked, routable results across all entity types.
- All states designed; fully keyboard-operable with correct ARIA; no blank dropdowns.
- Clean console; responsive; changelog for visible changes.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.
