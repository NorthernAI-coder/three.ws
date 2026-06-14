# 05 — Launchpad Studio: wire the avatar picker to real platform avatars

## Problem

[src/editor/launchpad-studio.js](../../src/editor/launchpad-studio.js) is the no-code builder for white-label launchpads. Step 2 of the wizard ("Identity") asks the user to provide an avatar for their launchpad page. The current picker accepts a URL field as free-form text input. This puts the burden on the user to know and copy a valid GLB URL. 

Professional result: the picker should show the user's own three.ws avatars and the platform's gallery — with URL entry as a fallback for power users. This is the same pattern already implemented in the agent-edit and character-studio flows.

## Target files

- [src/editor/launchpad-studio.js](../../src/editor/launchpad-studio.js) — the wizard's identity step
- [pages/launchpad.html](../../pages/launchpad.html) — the host page (no changes expected, but verify the module is correctly imported)

## Data sources

**User's own avatars** (if logged in):
```
GET /api/agents?owner=me&limit=20
```
Returns `{ agents: [{ id, name, avatar_url, meta: { avatar: { url } } }] }`.
Use `agent.meta?.avatar?.url || agent.avatar_url` for the GLB URL.

**Platform gallery avatars**:
```
GET /api/avatars?limit=24&sort=popular
```
Returns `{ avatars: [{ id, name, thumbnail_url, glb_url }] }`.

Both endpoints already exist. Use `credentials: 'include'` on the fetch. If the user is not logged in, the `/api/agents?owner=me` call returns 401 or an empty list — skip it gracefully.

## Outcome

Replace the bare URL `<input>` in the identity step with a three-section picker:

### Section 1 — My Agents (shown only when logged in, hidden if empty)
A horizontal scroll strip of avatar thumbnails. Each card shows:
- Thumbnail image (use `agent.meta?.avatar?.thumbnail_url` if available, else the GLB URL rendered via `<img>` with the platform viewer as a fallback icon)
- Agent name

On click: select this avatar, populate the hidden `avatar_url` field, highlight the selected card.

### Section 2 — Platform Gallery
Same card strip but from `/api/avatars`. Show 8 cards, with a "Show more" button that loads the next page.

### Section 3 — Custom URL (collapsed by default, expandable with "Or enter a URL →")
The existing URL `<input>`. Keep this for power users but de-emphasize it visually.

## Implementation notes

1. In `launchpad-studio.js`, find where the identity form is rendered (search for `avatar` or `url` field in the wizard step). Wrap the new picker in a `div.lsp-avatar-picker` container.
2. Fetch both data sources in parallel (`Promise.allSettled`) when the identity step renders. Show a skeleton row while loading.
3. Store the selected avatar URL in the same `formData.avatar_url` field the rest of the studio already uses. No new state shape.
4. Selected state: `lsp-avatar-card.is-selected` CSS class + `aria-pressed="true"`. Only one card can be selected at a time. Clicking a different card deselects the previous.
5. Thumbnail images: use `loading="lazy"`. Gracefully handle broken images with an `onerror` that shows a generic avatar icon (use `/public/avatars/default.png` or the site's existing fallback).
6. Mobile: cards are `64px × 64px` with a `4px` selection ring. The strip is `overflow-x: auto` with `-webkit-overflow-scrolling: touch`.

## Definition of done

- `npm run dev`. Visit `/launchpad`. Proceed to the identity step.
- If logged in: "My Agents" section appears with real agent thumbnails. Clicking one selects it and the preview renders that avatar.
- "Platform Gallery" section shows real avatars from `/api/avatars`.
- Clicking any gallery card selects it; the preview updates.
- "Or enter a URL" expands and accepts a custom GLB URL as before.
- If not logged in: "My Agents" section is hidden; Gallery and URL fallback still work.
- The published launchpad config (`POST /api/launchpad/publish`) includes the selected `avatar_url`.
- No console errors.
- `npm test` green.
- Completionist subagent run on changed files.
