# Task 20 — Brand the free lanes (the seed task) + design-system & a11y polish sweep

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. **Track F —
> Polish.** This is where the program started. Independent of the others; great as a final
> consistency pass once other surfaces have landed (or anytime — the relabel is standalone).

## The thesis

A $1B product is consistent and accessible to the pixel. three.ws is close — there's a real
token system and broad ARIA coverage — but vendor names leak into the UI, stray hex/px bypass
the tokens, 3D viewers aren't keyboard-navigable, and some modals don't manage focus. This task
is the craftsmanship sweep: small fixes, large cumulative effect. **It begins with the literal
request that kicked off this whole program.**

## Part 1 — Relabel the free Forge lanes (the seed task; do this first)

Today the Forge engine picker labels its two free lanes by **vendor**:
[src/forge.js](../../src/forge.js) `ENGINE_LABELS` (~line 180) maps `nvidia: 'NVIDIA'` and
`huggingface: 'Hunyuan3D'`, each rendered with a `FREE` pill → the buttons read "NVIDIA FREE"
and "Hunyuan3D FREE". These are three.ws's own house free engines (one is the text→3D lane, the
default for draft/standard; the other is the photo→3D / high-tier lane) — they should read as
**three.ws's**, not a vendor billboard.

- **Rename both to three.ws-native labels** that (a) are distinct from each other (the code
  deliberately avoids two lanes both reading "Free" — see the `ENGINE_FREE_PILL` comment around
  [src/forge.js:173](../../src/forge.js#L173)), and (b) communicate the lane's role. The
  natural differentiator is input modality: the `nvidia` lane is text→3D, the `huggingface`
  lane is photo→3D. Pick clean house names (e.g. by input — "Prompt" / "Photo" — or a house
  brand pairing); keep them short enough for the picker button. Use your product judgment;
  match the existing label tone (`'Fast'`, `'Meshy'`, etc.).
- **Keep the underlying engine truth in the tooltip/`title`/`aria-label`**, not the button face
  — the picker already builds `title`/`aria-label` from the backend `label`/`blurb`
  ([src/forge.js:466-472](../../src/forge.js#L466-L472)). The honest "free TRELLIS on NVIDIA
  NIM / Hunyuan3D on community GPUs" detail can stay in the hover text; the **button** shows the
  three.ws name + FREE pill.
- **Sweep the sibling surfaces** so they agree: the showcase map in
  [src/forge-showcase.js](../../src/forge-showcase.js) (line ~18, where `nvidia: 'Free'`), and
  the user-facing copy in [pages/forge.html](../../pages/forge.html) (~line 3304: "Free uses
  NVIDIA-hosted generation…"). Don't touch the backend ids/keys in
  [api/_lib/forge-tiers.js](../../api/_lib/forge-tiers.js) (`nvidia`/`huggingface` are routing
  ids) — only the **user-facing labels**. Vendor names may remain in code comments and backend
  blurbs; the goal is the **UI** reads as three.ws.

## Part 2 — Design-system polish sweep

Replace stray hardcoded values with tokens from [public/tokens.css](../../public/tokens.css):
- Inline px/hex in [src/forge-pay.js](../../src/forge-pay.js) (`.fpay-modal width:min(420px…)`,
  `.fpay-x`), [src/walk.js](../../src/walk.js) (inline `max-width:420px` etc.),
  [src/avatar-page.js](../../src/avatar-page.js) (`width:480px;height:480px`),
  [src/trades.js](../../src/trades.js) (48px chips), [src/first-meet.js](../../src/first-meet.js).
- JS breakpoints hardcoded in px — [src/marketplace-detail.js](../../src/marketplace-detail.js)
  (`max-width: 880px`) and [src/walk.js](../../src/walk.js) (`max-width: 640px`): route through a
  shared breakpoint constant/token so they can't drift from CSS.
- Custom skeleton vars in [src/agent-detail.css](../../src/agent-detail.css) that duplicate
  `--surface-*` — fold onto the tokens.
Don't churn working code for its own sake; fix the genuine inconsistencies, keep diffs tight.

## Part 3 — Accessibility polish

- **Keyboard-navigable 3D viewers.** The Three.js scenes (viewer, [pages/pose.html](../../pages/pose.html),
  [pages/scene.html](../../pages/scene.html), avatar studio) require a mouse to rotate/pan/zoom.
  Add documented keyboard controls + visible focus + an accessible-name for the canvas region.
- **Modal focus management.** Audit modals (Brain multi-LLM, others) for focus trap + restore on
  close; [src/share-panel.js](../../src/share-panel.js) already does this well — match it.
- **Icon-only buttons** in Brain/Scene/Pose studios need `aria-label`s.
- **Color-only state** (e.g. activity win/loss/open pills) needs a text/icon companion for
  non-color perception and contrast.

## Hard rules specific to this task

- **$THREE only** anywhere copy changes touch tokens.
- The free-lane relabel must not change routing/behavior — labels only. Verify both free lanes
  still select, still show the FREE pill, still gate text-vs-photo input exactly as before.
- Keep the design-system sweep additive and consistent; don't introduce new ad-hoc values while
  removing old ones.

## Definition of done

README DoD, plus: the two free Forge lanes read as three.ws house engines (distinct names, FREE
pill, vendor truth only in tooltip) across forge.js, forge-showcase.js, and forge.html, with no
behavior change; the listed hardcoded px/hex are tokenized and JS breakpoints centralized; 3D
viewers are keyboard-operable with focus; audited modals trap/restore focus; icon buttons
labelled; color-only states fixed. Exercise the Forge picker and a 3D viewer in a real browser.
Update [tests/glb-canonicalize.test.js] only if relevant; add/extend tests where you changed
logic. Changelog (`improvement`). Self-review, then fix the next inconsistency you spot.

Delete this file when done.
