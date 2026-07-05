/*
 * three.ws Tour Builder
 * =====================
 * A no-code playground for @three-ws/tour. Point and click on a live demo
 * storefront to build a guided tour, preview it exactly as visitors will see
 * it, then export the curriculum + the two theme.liquid snippets.
 *
 * The tour engine is the real published build (vendored at
 * /tour-builder/tour.global.js), so the preview is the product, not a mockup.
 */

const VERSION_TOUR = '0.2.0';
const VERSION_PAGE_AGENT = '0.1.1';
const STORAGE_KEY = 'tws:tour-builder:v1';

// Curated guide roster — ids match the @three-ws/walk roster.
const AVATARS = [
	{ id: 'realistic-female', name: 'Ava', emoji: '💁‍♀️' },
	{ id: 'realistic-male', name: 'Leo', emoji: '🙋‍♂️' },
	{ id: 'selfie-girl', name: 'Mira', emoji: '👩' },
	{ id: 'michelle', name: 'Michelle', emoji: '🧑‍🦱' },
	{ id: 'robot', name: 'Robo', emoji: '🤖' },
	{ id: 'xbot', name: 'X-Bot', emoji: '🦾' },
	{ id: 'fox', name: 'Fox', emoji: '🦊' },
	{ id: 'guide', name: 'Guide', emoji: '🧍' },
];

// When a demo section is picked, also emit the common Shopify/Dawn selectors
// for the equivalent section, so exported tours land on real themes without
// hand-editing. Keyed by the demo element id under the cursor's section.
const SHOPIFY_EQUIVALENTS = {
	hero: ['.banner', '.hero', '#Banner', '[id^="Banner"]', '.slideshow'],
	'hero-cta': ['.banner a.button', '.hero a', '.button--primary', 'a.button'],
	featured: ['#featured-collection', '.featured-collection', '.collection', '[id^="FeaturedCollection"]'],
	story: ['.rich-text', '[id^="RichText"]', '.about', '.our-story'],
	reviews: ['.testimonials', '.reviews', '[id*="review" i]', '.product-reviews'],
	policies: ['.footer-block', '.shipping', '.policies', '.multicolumn'],
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => 's' + Math.random().toString(36).slice(2, 8);

// ── State ────────────────────────────────────────────────────────────────
const seed = () => ({
	title: 'Store tour',
	avatarId: 'realistic-female',
	stops: [
		{ id: uid(), title: 'Welcome', narration: 'Welcome to the store. This button takes you to the full collection.', target: '#hero-cta', targetLabel: '“Shop the collection” button', highlight: true, section: 'hero-cta' },
		{ id: uid(), title: 'Featured products', narration: 'These are the pieces everyone is loving right now.', target: '#featured', targetLabel: 'Featured products', highlight: true, section: 'featured' },
		{ id: uid(), title: 'Reviews', narration: 'Real reviews from real customers — 4.9 stars across thousands.', target: '#reviews', targetLabel: 'What customers say', highlight: false, section: 'reviews' },
	],
});

let state;
try {
	const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
	state = saved && Array.isArray(saved.stops) ? saved : seed();
} catch { state = seed(); }

const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} };

// ── Toast ────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg) {
	const t = $('#toast');
	t.textContent = msg; t.classList.add('show');
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ── Render: avatars ──────────────────────────────────────────────────────
function renderAvatars() {
	const wrap = $('#avatars');
	wrap.innerHTML = '';
	for (const a of AVATARS) {
		const el = document.createElement('button');
		el.className = 'av' + (a.id === state.avatarId ? ' sel' : '');
		el.innerHTML = `<div class="dot">${a.emoji}</div><div class="nm">${a.name}</div>`;
		el.addEventListener('click', () => { state.avatarId = a.id; save(); renderAvatars(); toast(`Guide set to ${a.name}`); });
		wrap.appendChild(el);
	}
}

// ── Render: stops ────────────────────────────────────────────────────────
function renderStops() {
	const wrap = $('#stops');
	wrap.innerHTML = '';
	if (!state.stops.length) {
		wrap.innerHTML = `<div class="empty-stops">No stops yet.<br>Hit <b>+ Add a stop</b>, then click a section of the store to point the guide at it.</div>`;
		return;
	}
	state.stops.forEach((stop, i) => {
		const el = document.createElement('div');
		el.className = 'stop';
		el.innerHTML = `
			<div class="stop-top">
				<span class="stop-num">${i + 1}</span>
				<input type="text" class="stop-title" value="${esc(stop.title)}" placeholder="Stop title" data-f="title" />
				<button class="mini star ${stop.highlight ? 'on' : ''}" title="Include in the short Quick tour" data-a="star">★</button>
				<button class="mini up" title="Move up" data-a="up" ${i === 0 ? 'disabled style="opacity:.3"' : ''}>↑</button>
				<button class="mini down" title="Move down" data-a="down" ${i === state.stops.length - 1 ? 'disabled style="opacity:.3"' : ''}>↓</button>
				<button class="mini del" title="Delete stop" data-a="del">✕</button>
			</div>
			<div class="stop-body">
				<div class="target-row">
					<span class="target-chip ${stop.target ? '' : 'empty'}" title="${esc(stop.target || '')}">${stop.target ? esc(stop.targetLabel || stop.target) : 'No section picked'}</span>
					<button class="pick-btn" data-a="pick">📍 ${stop.target ? 'Re-pick' : 'Pick'}</button>
				</div>
				<textarea data-f="narration" placeholder="What should the guide say here?">${esc(stop.narration)}</textarea>
			</div>`;

		el.querySelector('[data-f="title"]').addEventListener('input', (e) => { stop.title = e.target.value; save(); });
		el.querySelector('[data-f="narration"]').addEventListener('input', (e) => { stop.narration = e.target.value; save(); });
		el.querySelector('[data-a="star"]').addEventListener('click', (e) => { stop.highlight = !stop.highlight; save(); e.currentTarget.classList.toggle('on'); });
		el.querySelector('[data-a="del"]').addEventListener('click', () => { state.stops.splice(i, 1); save(); renderStops(); });
		el.querySelector('[data-a="up"]').addEventListener('click', () => { if (i > 0) { [state.stops[i - 1], state.stops[i]] = [state.stops[i], state.stops[i - 1]]; save(); renderStops(); } });
		el.querySelector('[data-a="down"]').addEventListener('click', () => { if (i < state.stops.length - 1) { [state.stops[i + 1], state.stops[i]] = [state.stops[i], state.stops[i + 1]]; save(); renderStops(); } });
		el.querySelector('[data-a="pick"]').addEventListener('click', () => startPick(stop.id));
		wrap.appendChild(el);
	});
}

function esc(s = '') { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// ── Add stop ─────────────────────────────────────────────────────────────
$('#add-stop').addEventListener('click', () => {
	const stop = { id: uid(), title: `Stop ${state.stops.length + 1}`, narration: '', target: '', targetLabel: '', highlight: false, section: '' };
	state.stops.push(stop); save(); renderStops();
	startPick(stop.id);
});

// ── Pick mode ────────────────────────────────────────────────────────────
let pickingId = null;
const outline = $('#pick-outline');

function startPick(stopId) {
	pickingId = stopId;
	document.body.classList.add('picking');
	// make sure the store is visible while picking on narrow screens
}
function endPick() {
	pickingId = null;
	document.body.classList.remove('picking');
	outline.classList.remove('show');
}

// The section an element belongs to (nearest ancestor with an id we know).
function sectionOf(el) {
	let n = el;
	while (n && n !== document.body) {
		if (n.id && (n.id in SHOPIFY_EQUIVALENTS || $$('#' + CSS.escape(n.id)).length === 1)) return n.id;
		n = n.parentElement;
	}
	return '';
}

// Build a robust, readable selector anchored on the nearest id.
function buildSelector(el) {
	if (el.id) return '#' + CSS.escape(el.id);
	const parts = [];
	let node = el;
	while (node && node.nodeType === 1 && node !== document.body) {
		if (node.id) { parts.unshift('#' + CSS.escape(node.id)); break; }
		let sel = node.tagName.toLowerCase();
		const cls = [...node.classList].find(
			(c) => /^[a-z][a-z0-9-]{2,}$/i.test(c) && document.querySelectorAll('.' + CSS.escape(c)).length <= 10,
		);
		if (cls) sel += '.' + CSS.escape(cls);
		else if (node.parentElement) {
			const sibs = [...node.parentElement.children].filter((n) => n.tagName === node.tagName);
			if (sibs.length > 1) sel += `:nth-of-type(${sibs.indexOf(node) + 1})`;
		}
		parts.unshift(sel);
		node = node.parentElement;
	}
	return parts.join(' ');
}

function labelFor(el) {
	const h = el.matches('h1,h2,h3') ? el : el.querySelector('h1,h2,h3');
	if (h && h.textContent.trim()) return `“${h.textContent.trim().slice(0, 40)}”`;
	const txt = (el.textContent || '').trim();
	if (el.matches('a,button') && txt) return `“${txt.slice(0, 30)}” button`;
	return el.id ? `#${el.id}` : el.tagName.toLowerCase();
}

const stage = $('#stage');
stage.addEventListener('mousemove', (e) => {
	if (!pickingId) return;
	const el = pickTarget(e.target);
	if (!el) { outline.classList.remove('show'); return; }
	const r = el.getBoundingClientRect();
	outline.style.left = r.left + 'px'; outline.style.top = r.top + 'px';
	outline.style.width = r.width + 'px'; outline.style.height = r.height + 'px';
	outline.classList.add('show');
});

// Prefer a meaningful block (a section, product, card, cta) over raw leaf text.
function pickTarget(el) {
	if (!el || el === stage || el.closest('.store') == null) return null;
	// climb to a "nice" pickable block
	const nice = el.closest('#hero, #featured, #story, #reviews, #policies, .product, .review, .policy, .cta, .hero-art, a, button, h1, h2, h3');
	return nice || el;
}

stage.addEventListener('click', (e) => {
	if (!pickingId) return;
	e.preventDefault(); e.stopPropagation();
	const el = pickTarget(e.target);
	if (!el) return;
	const stop = state.stops.find((s) => s.id === pickingId);
	if (stop) {
		stop.target = buildSelector(el);
		stop.targetLabel = labelFor(el);
		stop.section = sectionOf(el) || (el.id || '');
		if (!stop.title || /^Stop \d+$/.test(stop.title)) stop.title = stop.targetLabel.replace(/[“”]/g, '').replace(/ button$/, '');
		save(); renderStops();
		toast(`Stop points at ${stop.targetLabel}`);
	}
	endPick();
}, true);

document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape') { if (pickingId) endPick(); else if (document.body.classList.contains('previewing')) exitPreview(); }
});

// ── Drawer collapse ──────────────────────────────────────────────────────
document.body.classList.remove('drawer-collapsed-none');
$('#collapse').addEventListener('click', () => document.body.classList.add('drawer-collapsed'));
$('#reopen').addEventListener('click', () => document.body.classList.remove('drawer-collapsed'));

// ── Build a curriculum from state ────────────────────────────────────────
function curriculum({ forExport } = {}) {
	const path = forExport ? '/' : location.pathname;
	return {
		title: state.title || 'Store tour',
		tracks: [{ id: 'full', title: 'Full tour' }, { id: 'quick', title: 'Quick tour' }],
		sections: [{ id: 'store', title: 'The store', intro: `Welcome — let me show you around.` }],
		stops: state.stops
			.filter((s) => s.target || s.narration)
			.map((s) => {
				const targets = [s.target, ...(SHOPIFY_EQUIVALENTS[s.section] || [])].filter(Boolean);
				return {
					path, section: 'store', title: s.title || 'Stop',
					narration: s.narration || '', highlight: !!s.highlight,
					...(targets.length ? { targets: [...new Set(targets)] } : {}),
				};
			}),
	};
}

// ── Preview ──────────────────────────────────────────────────────────────
let tour = null;
function preview() {
	if (!state.stops.length) { toast('Add a stop first'); return; }
	document.body.classList.add('previewing');
	// tear down any prior instance so avatar/curriculum changes take effect
	try { tour?.exit?.(); } catch {}
	const make = window.createFeatureTour || window.ThreeWsTour?.createFeatureTour;
	if (!make) { toast('Tour engine still loading — try again in a second'); document.body.classList.remove('previewing'); return; }
	tour = make({
		curriculum: curriculum(),
		guideAvatarId: state.avatarId,
		assetBase: '',                          // same-origin: three.ws serves /avatars + /animations
		manifestUrl: '/animations/manifest.json',
		deepLinkParam: '__nolink_builder',      // never auto-bootstrap here
	});
	// scroll store to top so the first stop is on-screen
	stage.scrollTo({ top: 0, behavior: 'instant' in stage.scrollTo ? 'instant' : 'auto' });
	requestAnimationFrame(() => tour.start('full'));
}
function exitPreview() {
	try { tour?.exit?.(); } catch {}
	tour = null;
	document.body.classList.remove('previewing');
}
$('#preview').addEventListener('click', preview);
$('#exit-preview').addEventListener('click', exitPreview);

// ── Export ───────────────────────────────────────────────────────────────
function snippetEmbed() {
	const avatar = state.avatarId !== 'realistic-female' ? `\n        data-avatar="${state.avatarId}"` : '';
	return `<script src="https://unpkg.com/@three-ws/tour@${VERSION_TOUR}/dist/tour.global.js"
        data-tour${avatar}
        data-curriculum="https://cdn.shopify.com/s/files/YOUR/PATH/curriculum.json"
        defer><\/script>`;
}
function snippetButton() {
	return `<button data-tour-start class="button">✨ ${esc(state.title || 'Take the store tour')}<\/button>`;
}

function highlight(code) {
	return esc(code)
		.replace(/(&lt;\/?[a-z][\w-]*)/g, '<span class="tok-tag">$1</span>')
		.replace(/([a-z-]+)=(&quot;.*?&quot;)/g, '<span class="tok-attr">$1</span>=<span class="tok-str">$2</span>')
		.replace(/\b(data-tour|data-tour-start|defer)\b/g, '<span class="tok-attr">$1</span>');
}

function openExport() {
	const embed = snippetEmbed(), button = snippetButton();
	const eEl = $('#snippet-embed'), bEl = $('#snippet-button');
	eEl.innerHTML = `<button class="copy" data-copy="snippet-embed">Copy</button>` + highlight(embed);
	bEl.innerHTML = `<button class="copy" data-copy="snippet-button">Copy</button>` + highlight(button);
	eEl._raw = embed; bEl._raw = button;
	$('#modal-scrim').classList.add('open');
	save();
}
$('#export').addEventListener('click', openExport);
$('#modal-close').addEventListener('click', () => $('#modal-scrim').classList.remove('open'));
$('#modal-done').addEventListener('click', () => $('#modal-scrim').classList.remove('open'));
$('#modal-scrim').addEventListener('click', (e) => { if (e.target === $('#modal-scrim')) $('#modal-scrim').classList.remove('open'); });

document.addEventListener('click', async (e) => {
	const btn = e.target.closest('.copy');
	if (!btn) return;
	const raw = $('#' + btn.dataset.copy)._raw || '';
	try { await navigator.clipboard.writeText(raw); btn.textContent = 'Copied!'; btn.classList.add('done'); setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('done'); }, 1600); }
	catch { toast('Copy failed — select and copy manually'); }
});

$('#dl-json').addEventListener('click', () => {
	const blob = new Blob([JSON.stringify(curriculum({ forExport: true }), null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url; a.download = 'curriculum.json'; a.click();
	URL.revokeObjectURL(url);
	toast('curriculum.json downloaded');
});

// ── Boot ─────────────────────────────────────────────────────────────────
$('#tour-title').value = state.title;
$('#tour-title').addEventListener('input', (e) => { state.title = e.target.value; save(); });
renderAvatars();
renderStops();
