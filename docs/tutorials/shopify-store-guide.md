# Add a 3D Store Guide to Your Shopify Theme

By the end of this tutorial your Shopify store has a **3D guide that walks across your actual storefront** — it strolls from your hero to your bestsellers, spotlights each section, points at it, and narrates a line about it. Visitors can take the guided tour, switch to **free roam** and drag the guide anywhere on the page, or let a docked narrator read the page to them out loud. All of it runs on your live theme — no app install, no iframe, no code beyond two script tags in `theme.liquid`.

**What you'll build:**
- A guided store tour: the avatar physically walks your homepage, spotlighting the hero, the featured collection, reviews, and your shipping policies
- Free roam: visitors click anywhere and the guide walks there
- An optional docked page narrator that reads your headings and product copy aloud
- A "Take the tour" button anywhere in your theme

**Prerequisites:** a Shopify store where you can edit theme code (Online Store → Themes → Edit code), and 20 minutes. No bundler, no npm, no Shopify app — everything loads from a CDN.

---

## Why this can't be an iframe (and why that's fine)

A guide that walks *on your sections* has to know where your sections are. It reads your page's real DOM — `h1`s, product grids, buttons — and measures their positions to walk to them. An iframe is sandboxed away from your page and can see none of that, so this integration is a **script tag in your theme**, not an embed frame. The avatar itself is a small transparent WebGL canvas that never blocks clicks (`pointer-events: none` during the tour), so your store keeps working exactly as before — Add to Cart included.

This runs on your **storefront** pages. Shopify's checkout is locked to custom scripts, and the guide deliberately never mounts there.

---

## Step 1 — Describe your tour (the curriculum)

The tour is driven by a small JSON file listing what the guide visits and what it says at each stop. Write one for your store — here's a complete example for a typical homepage:

```json
{
	"title": "Store tour",
	"tracks": [{ "id": "full", "title": "Full tour" }],
	"sections": [
		{ "id": "store", "title": "The store", "intro": "Welcome — let me show you around." }
	],
	"stops": [
		{
			"path": "/",
			"section": "store",
			"title": "Welcome",
			"highlight": true,
			"narration": "Welcome to the store. This button takes you to the full collection.",
			"targets": ["a.button", ".hero a"]
		},
		{
			"path": "/",
			"section": "store",
			"title": "Featured products",
			"highlight": true,
			"narration": "These are the pieces everyone is loving right now.",
			"targets": ["#featured-collection", ".collection .grid"]
		},
		{
			"path": "/",
			"section": "store",
			"title": "Reviews",
			"narration": "Real reviews from real customers.",
			"targets": ["#reviews", ".testimonials"]
		}
	]
}
```

Each stop:
- **`path`** — the page the stop lives on (`"/"` for the homepage; multi-page tours work too — the tour survives navigation).
- **`narration`** — what the guide says, as spoken captions.
- **`targets`** — CSS selectors for the element to spotlight, in preference order; the first visible match wins. Don't know your theme's selectors? Right-click the section → Inspect, or just add `data-tour-target` to any element in the section's Liquid and leave `targets` out — tagged elements are found automatically. If nothing matches, the guide falls back to the page's main heading.

**Upload it:** in the Shopify admin go to **Content → Files**, upload `curriculum.json`, and copy the CDN URL Shopify gives you (it looks like `https://cdn.shopify.com/s/files/.../curriculum.json`).

---

## Step 2 — Add the tour to `theme.liquid`

Online Store → Themes → **⋯ → Edit code** → `layout/theme.liquid`. Paste this immediately before `</body>`:

```html
<script src="https://unpkg.com/@three-ws/tour@0.2.0/dist/tour.global.js"
        data-tour
        data-curriculum="https://cdn.shopify.com/s/files/YOUR/PATH/curriculum.json"
        defer></script>
```

That's the whole install. The script:
- auto-creates the tour from the tag's `data-*` attributes,
- loads avatar models and animations from the three.ws CDN (override with `data-asset-base` / `data-manifest-url` if you self-host),
- exposes the controller as `window.__featureTour`,
- honours deep links: sharing `yourstore.com/?tour=start` begins the tour on arrival.

Optional attributes:

| Attribute | Default | What it does |
|---|---|---|
| `data-avatar` | `realistic-female` | Which guide walks the store (any `@three-ws/walk` roster id) |
| `data-autostart` | off | `full` or `quick` — start the tour on page load |
| `data-tts-endpoint` | off | POST endpoint returning audio for spoken narration; without it, narration is paced captions |

---

## Step 3 — Add a "Take the tour" button

Any element with `data-tour-start` becomes a start button automatically — including ones added later by theme sections. In any section's Liquid (or a Custom Liquid block in the theme editor):

```html
<button data-tour-start class="button">✨ Take the store tour</button>
```

`data-tour-start="quick"` starts the shorter Quick track (the stops you marked `"highlight": true`).

Save, open your storefront, click the button. The page dims, your hero gets a spotlight ring, and the guide walks over and starts talking. The playback bar at the bottom gives visitors prev/next, speed, mute, and a chapter map. Press **R** (or the bar's roam button) for **free roam** — visitors click anywhere and the guide walks there, or drag it around directly.

---

## Step 4 (optional) — The docked page narrator

If you also want a narrator that reads the page aloud — product descriptions, headings, policies — add the page-agent tag next to the tour tag:

```html
<script src="https://unpkg.com/@three-ws/page-agent@0.1.1/dist/page-agent.global.js"
        data-page-agent data-avatar="sol" defer></script>
```

A rigged avatar docks in the corner with a built-in picker. It auto-discovers your `h1/h2/h3` headings and the copy under them, scrolls to each, highlights it, and speaks it with the browser's Web Speech API — no backend, no API key. To control exactly what gets read (or fix the order), add `data-narrate="What to say instead"` or `data-narrate-order="1"` to elements in your Liquid.

Use the tour for the guided pitch, the narrator for accessibility and browsing — they coexist fine; the tour stands the companion down while it's running.

---

## Step 5 — Verify

1. Open your storefront in a normal browser tab (not the theme-editor preview — its own frame counts as an embed and the guide intentionally never mounts inside frames).
2. Click your tour button. Watch the network tab: avatar GLBs and animation clips load from `three.ws` (CORS is open — `access-control-allow-origin: *`).
3. Confirm clicks still work everywhere while the tour runs — the overlay is `pointer-events: none`.
4. Test on mobile: the playback bar and captions are responsive, and `prefers-reduced-motion` is honoured (no walk glide, instant spotlight).

**If the styles look stripped:** a rare few themes ship a strict `Content-Security-Policy` with a `style-src` that lacks `'unsafe-inline'`. The tour injects its styles at runtime, so that policy blocks them. Either add `'unsafe-inline'` to `style-src`, or add `https://unpkg.com` + `https://three.ws` to `script-src`/`connect-src` while you're in there. Stock Shopify themes (Dawn included) need no CSP changes.

---

## How it works under the hood

The guide's body is a ~170×240 px transparent WebGL canvas positioned in screen space and stepped frame-by-frame, so it reads as walking across your page. Targets are found with `document.querySelector` against your live DOM and measured with `getBoundingClientRect()` — which is why the tour keeps working when your theme changes, as long as the selectors (or `data-tour-target` tags) still match. Tour state lives in `sessionStorage`, so a stop on `/collections/all` after a stop on `/` survives the page navigation and resumes exactly where it left off.

The engine is three published open-source packages — [`@three-ws/tour`](https://www.npmjs.com/package/@three-ws/tour), [`@three-ws/walk`](https://www.npmjs.com/package/@three-ws/walk), and [`@three-ws/page-agent`](https://www.npmjs.com/package/@three-ws/page-agent) (Apache-2.0) — the same engine behind the guided tour on [three.ws](https://three.ws).

---

## Beyond the homepage

- **Multi-page tours:** add stops with `"path": "/collections/bestsellers"` or `/pages/about` — the guide navigates there and picks up where it left off.
- **Product-page narration:** the page narrator already reads product titles and descriptions; tag your buy button's section with `data-narrate` for a spoken pitch.
- **A talking assistant too?** Pair the guide with a [talking agent widget](/tutorials/embed-on-website) trained on your store's FAQ and policies for questions the tour doesn't answer.
- **Not on Shopify?** The same two tags work on any site you can edit — see [Add the Walk Companion to your site](/tutorials/walk-companion) and [Embed on your website](/tutorials/embed-on-website).
