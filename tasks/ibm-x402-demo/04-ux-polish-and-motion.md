# Task 04 — UX polish, microinteractions & motion

## Context

three.ws workspace at `/workspaces/three.ws`. Deliverable + verified facts:
[00-PLAN.md](00-PLAN.md). The page is [`pages/ibm/x402-demo.html`](../../pages/ibm/x402-demo.html).

The page already follows IBM Carbon (Plex, `#0f62fe`, restrained borders). This task raises it
to "screenshot-worthy" without betraying Carbon's restraint. The bar: a senior designer at IBM
would approve it, and a developer would screenshot the success state. Run **after** task 03 so
the states you're polishing are final.

## Do this

1. **Skeleton, not "resolving…".** Replace the plain-text loading line in the 402 preview with a
   tasteful shimmer/skeleton of the rows it will fill, so first paint feels intentional.
2. **Success reveal.** When a payment settles, animate the result panel in (fade + slight rise),
   and draw/scale-in the green check. Make it feel like a confirmation, not a DOM swap.
3. **Button states.** The pay button needs distinct, polished hover / active / focus-visible /
   disabled / in-flight (inline spinner + "Waiting for wallet…") states. Same care for the
   ticker input (focus underline is started — refine) and the copy button.
4. **Live 402 preview as a feature, not a footnote.** It is the "aha" of the demo — the server
   literally quoting a price. Give it subtle emphasis (the green status dot is there; consider a
   one-time pulse when it first resolves) and make the price tag and preview update feel linked
   when the ticker changes (debounced re-fetch already exists — animate the value change).
5. **Motion discipline.** All transitions on `opacity`/`transform` only, 120–220ms, ease-out.
   Honor `@media (prefers-reduced-motion: reduce)` — disable non-essential motion entirely.
6. **Dark mode.** The widget modal already supports `prefers-color-scheme: dark`. Add a matching
   dark theme to the page so it looks deliberate when embedded in a dark IBM context. Keep the
   transparent-background behavior (the page sits on a host background) working in both schemes.
7. **Spacing & rhythm.** Audit vertical rhythm, consistent use of the CSS custom properties
   already defined, and the hierarchy of the three sections (hero → demo → embed). Tighten any
   spacing that feels arbitrary.
8. **Empty/idle copy.** The idle result panel should invite action, and the "how it works" strip
   should read as a 10-second explainer. Refine wording with task 08, but get the layout/visual
   weight right here.

## Method

- `npx http-server pages/ibm -p 8088`, exercise idle → preview → loading → success → error in
  both light and dark, with and without reduced-motion.
- Test at desktop width here; task 05 owns the responsive pass — don't regress it.

## Definition of done

- Loading uses a skeleton; success animates in; the check is satisfying.
- Every interactive element has polished hover / active / focus-visible / disabled states.
- Full light + dark theming; transparent host background preserved in both.
- All motion is transform/opacity, reduced-motion-aware, never janky.
- Looks like something a senior IBM designer signs off on. No console errors. Run the
  **completionist** subagent.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

```bash
git rm "tasks/ibm-x402-demo/04-ux-polish-and-motion.md"
```

Stage the deletion in the same commit as the implementation. A file that still exists is
unfinished work; a file that is gone has shipped. Do not delete early.
