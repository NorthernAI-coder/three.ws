// /animations — public animation gallery.
//
// Surfaces three sources in one searchable, filterable grid:
//   • Community clips published by three.ws users (GET /api/animations/clips
//     ?include_public=true&visibility=public). Appear first, newest-first.
//   • The built-in three.ws motion library (/animations/manifest.json) — the
//     same curated clips the /pose studio ships with. Always present.
//   • The full motion library (GET /api/animations/library) — the complete
//     Mixamo-sourced catalog (~2,400 clips) hosted on the R2 CDN. Appears
//     only once populated; the endpoint returns an empty list until the
//     library pipeline (scripts/mixamo-all.mjs) has uploaded it.
//
// All are normalized to one card shape, then filtered (search + loop/once) and
// paginated entirely client-side — even the full catalog is just a few hundred
// KB of metadata, so there's no need to round-trip the server on every keystroke.
//
// Card actions:
//   • Preview (hover/click) — inline <iframe> of the embed viewer playing the
//     clip on a live avatar (/embed/avatar).
//   • Open in Studio        — /pose?anim=<id>. A community UUID opens the saved
//     clip in the editor; a library name opens the matching preset.

const PREVIEW_MODEL = '/avatars/cz.glb';
const API_BASE = '/api/animations/clips';
const MANIFEST_URL = '/animations/manifest.json';
const LIBRARY_API = '/api/animations/library';
const PAGE_SIZE = 24;
// Cap community pagination so a large catalog can't stall first paint.
const COMMUNITY_MAX = 300;

const els = {
	loading: document.querySelector('[data-role="loading"]'),
	grid: document.querySelector('[data-role="grid"]'),
	empty: document.querySelector('[data-role="empty"]'),
	emptySearch: document.querySelector('[data-role="empty-search"]'),
	emptySearchMsg: document.querySelector('[data-role="empty-search-msg"]'),
	clearSearch: document.querySelector('[data-role="clear-search"]'),
	error: document.querySelector('[data-role="error"]'),
	retry: document.querySelector('[data-role="retry"]'),
	search: document.querySelector('[data-role="search"]'),
	chips: document.querySelector('[data-role="chips"]'),
	loadMore: document.querySelector('[data-role="load-more"]'),
	loadMoreBtn: document.querySelector('[data-role="load-more-btn"]'),
	sentinel: document.querySelector('[data-role="sentinel"]'),
};

const state = {
	query: new URLSearchParams(location.search).get('q') || '',
	filter: new URLSearchParams(location.search).get('filter') || '',
	all: [], // normalized items from both sources (community first)
	filtered: [], // after search + loop/once filter
	shown: 0, // count currently rendered
	loaded: false,
};

if (state.query) els.search.value = state.query;
syncChips();

// ── URL state ──────────────────────────────────────────────────────────────

function syncUrl() {
	const p = new URLSearchParams();
	if (state.query) p.set('q', state.query);
	if (state.filter) p.set('filter', state.filter);
	const qs = p.toString();
	const next = qs ? `${location.pathname}?${qs}` : location.pathname;
	if (next !== location.pathname + location.search) {
		history.replaceState(null, '', next);
	}
}

function syncChips() {
	els.chips?.querySelectorAll('[data-filter]').forEach((btn) => {
		const active = btn.dataset.filter === state.filter;
		btn.setAttribute('aria-selected', String(active));
	});
}

// ── Fetch + normalize ───────────────────────────────────────────────────────

async function fetchLibrary() {
	const res = await fetch(MANIFEST_URL, { cache: 'force-cache' });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const manifest = await res.json();
	if (!Array.isArray(manifest)) return [];
	return manifest.map(normalizeLibraryClip);
}

async function fetchCommunity() {
	const out = [];
	let cursor = null;
	// Bounded cursor walk — at most COMMUNITY_MAX items.
	while (out.length < COMMUNITY_MAX) {
		const params = new URLSearchParams({ include_public: 'true', visibility: 'public', limit: '50' });
		if (cursor) params.set('cursor', cursor);
		const res = await fetch(`${API_BASE}?${params}`, { credentials: 'include' });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = await res.json();
		const incoming = Array.isArray(data.items) ? data.items : [];
		out.push(...incoming);
		cursor = data.next_cursor || null;
		if (!cursor || incoming.length === 0) break;
	}
	return out.slice(0, COMMUNITY_MAX).map(normalizeCommunityClip);
}

function normalizeLibraryClip(clip) {
	return {
		id: clip.name,
		source: 'library',
		name: clip.label || clip.name,
		loop: clip.loop !== false,
		icon: clip.icon || '🎬',
		tags: [],
		duration_ms: null,
		thumbnail_url: null,
		price: null,
	};
}

// The full R2-hosted catalog. Empty (and therefore absent from the grid)
// until the library pipeline has uploaded it.
async function fetchFullLibrary() {
	const res = await fetch(LIBRARY_API);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const data = await res.json();
	return (Array.isArray(data.clips) ? data.clips : []).map(normalizeFullLibraryClip);
}

function normalizeFullLibraryClip(clip) {
	return {
		id: clip.name,
		source: 'mixamo',
		name: clip.label || clip.name,
		loop: clip.loop !== false,
		icon: clip.icon || '🎬',
		tags: clip.category ? [clip.category] : [],
		duration_ms: clip.duration ? Math.round(clip.duration * 1000) : null,
		thumbnail_url: null,
		price: null,
	};
}

function normalizeCommunityClip(clip) {
	return {
		id: clip.id,
		source: 'community',
		name: clip.name || 'Untitled',
		loop: clip.loop !== false,
		icon: '🎬',
		tags: Array.isArray(clip.tags) ? clip.tags : [],
		duration_ms: clip.duration_ms || null,
		thumbnail_url: clip.thumbnail_url || null,
		price: clip.price || null,
	};
}

async function loadAll() {
	showState('loading');
	const [libRes, comRes, fullRes] = await Promise.allSettled([
		fetchLibrary(),
		fetchCommunity(),
		fetchFullLibrary(),
	]);

	if (libRes.status === 'rejected' && comRes.status === 'rejected' && fullRes.status === 'rejected') {
		showState('error');
		return;
	}

	const library = libRes.status === 'fulfilled' ? libRes.value : [];
	const community = comRes.status === 'fulfilled' ? comRes.value : [];
	const full = fullRes.status === 'fulfilled' ? fullRes.value : [];
	// Community clips lead (fresh, human-authored); the curated library follows;
	// the full catalog trails, minus anything the curated set already surfaces.
	const curatedNames = new Set(library.map((c) => c.id));
	state.all = [...community, ...library, ...full.filter((c) => !curatedNames.has(c.id))];
	state.loaded = true;
	applyFilters();
}

// ── Filter + render ──────────────────────────────────────────────────────────

function applyFilters() {
	const q = state.query.toLowerCase();
	state.filtered = state.all.filter((item) => {
		if (state.filter === 'loop' && !item.loop) return false;
		if (state.filter === 'once' && item.loop) return false;
		if (q) {
			const hay = `${item.name} ${item.tags.join(' ')}`.toLowerCase();
			if (!hay.includes(q)) return false;
		}
		return true;
	});
	state.shown = 0;
	renderGrid();
}

function renderGrid() {
	if (state.filtered.length === 0) {
		if (state.all.length === 0) {
			showState('empty');
		} else {
			showState('empty-search');
			if (els.emptySearchMsg) {
				els.emptySearchMsg.textContent = state.query
					? `No animations match "${state.query}".`
					: 'No animations match this filter.';
			}
		}
		return;
	}

	showState('grid');

	const start = state.shown;
	const end = Math.min(start + PAGE_SIZE, state.filtered.length);
	if (start === 0) els.grid.innerHTML = '';

	const fragment = document.createDocumentFragment();
	for (let i = start; i < end; i++) {
		fragment.appendChild(buildCard(state.filtered[i]));
	}
	els.grid.appendChild(fragment);
	state.shown = end;

	els.loadMore.hidden = state.shown >= state.filtered.length;
}

function showMore() {
	if (state.shown < state.filtered.length) renderGrid();
}

function fmtDuration(ms) {
	const s = ms / 1000;
	if (s < 60) return `${s.toFixed(1)}s`;
	const m = Math.floor(s / 60);
	return `${m}m ${Math.round(s % 60)}s`;
}

function buildCard(clip) {
	const card = document.createElement('article');
	card.className = 'ag-card';
	card.setAttribute('aria-label', clip.name || 'Animation');

	const previewId = `ag-preview-${clip.source}-${clip.id}`;
	const studioUrl = `/pose?anim=${encodeURIComponent(clip.id)}`;
	const loopBadge = clip.loop;
	const hasThumb = !!clip.thumbnail_url;
	const sourceLabel =
		clip.source === 'community' ? 'Community' : clip.source === 'mixamo' ? 'Library' : 'Built-in';

	card.innerHTML = `
		<div class="ag-card-preview" role="button" tabindex="0"
			aria-label="Preview ${escHtml(clip.name || 'animation')}"
			data-clip-id="${escHtml(clip.id)}">
			${hasThumb
				? `<img class="ag-card-thumb" src="${escHtml(clip.thumbnail_url)}" alt="" loading="lazy" />`
				: `<div class="ag-card-thumb-placeholder" aria-hidden="true">${escHtml(clip.icon || '🎬')}</div>`
			}
			<div class="ag-card-preview-overlay" id="${escHtml(previewId)}"></div>
			<div class="ag-play-hint" aria-hidden="true">
				<div class="ag-play-icon">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
				</div>
			</div>
		</div>
		<div class="ag-card-meta">
			<h3 class="ag-card-title" title="${escHtml(clip.name || '')}">${escHtml(clip.name || 'Untitled')}</h3>
			<div class="ag-card-badges">
				<span class="ag-badge ${loopBadge ? 'ag-badge--loop' : 'ag-badge--once'}">${loopBadge ? 'loop' : 'once'}</span>
				<span class="ag-badge ag-badge--source">${sourceLabel}</span>
				${clip.duration_ms ? `<span class="ag-badge">${fmtDuration(clip.duration_ms)}</span>` : ''}
				${clip.price ? `<span class="ag-badge ag-badge--price">$${(Number(clip.price.amount) / 1_000_000).toFixed(2)}</span>` : ''}
			</div>
			${clip.tags?.length ? `<div class="ag-card-tags">${clip.tags.slice(0, 5).map((t) => `<span class="ag-tag">${escHtml(t)}</span>`).join('')}</div>` : ''}
			<div class="ag-card-actions">
				<a href="${escHtml(studioUrl)}" class="ag-card-btn ag-card-btn--primary"
					title="Open this animation in the Studio to remix or apply to your avatar">
					Open in Studio
				</a>
				<button class="ag-card-btn" data-preview="${escHtml(clip.id)}"
					title="Preview this animation on a live avatar"
					aria-label="Preview ${escHtml(clip.name || 'animation')}">
					Preview
				</button>
			</div>
		</div>
	`;

	// Preview on hover (desktop) — lazy-load the embed iframe once.
	const previewZone = card.querySelector('.ag-card-preview');
	const overlay = card.querySelector('.ag-card-preview-overlay');
	let iframeLoaded = false;

	const launchPreview = () => {
		if (!iframeLoaded) {
			iframeLoaded = true;
			const iframe = document.createElement('iframe');
			iframe.src = `/embed/avatar?model=${encodeURIComponent(PREVIEW_MODEL)}&anim=${encodeURIComponent(clip.id)}&hide-chrome=1&idle=off&bg=transparent`;
			iframe.title = `Preview: ${clip.name || 'animation'}`;
			iframe.setAttribute('loading', 'lazy');
			iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
			overlay.appendChild(iframe);
		}
		overlay.classList.add('is-active');
	};

	previewZone.addEventListener('mouseenter', launchPreview);
	previewZone.addEventListener('click', launchPreview);
	previewZone.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			launchPreview();
		}
	});
	previewZone.addEventListener('mouseleave', () => {
		overlay.classList.remove('is-active');
	});

	// "Preview" button — same behavior as hover.
	card.querySelector('[data-preview]')?.addEventListener('click', (e) => {
		e.preventDefault();
		launchPreview();
	});

	return card;
}

function escHtml(s) {
	return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── State display ──────────────────────────────────────────────────────────

function showState(which) {
	els.loading.hidden = which !== 'loading';
	els.grid.hidden = which !== 'grid';
	els.empty.hidden = which !== 'empty';
	els.emptySearch.hidden = which !== 'empty-search';
	els.error.hidden = which !== 'error';
	if (which !== 'grid') els.loadMore.hidden = true;
}

// ── Controls ───────────────────────────────────────────────────────────────

let searchDebounce;
els.search?.addEventListener('input', () => {
	clearTimeout(searchDebounce);
	searchDebounce = setTimeout(() => {
		state.query = els.search.value.trim();
		syncUrl();
		if (state.loaded) applyFilters();
	}, 200);
});

els.chips?.addEventListener('click', (e) => {
	const btn = e.target.closest('[data-filter]');
	if (!btn) return;
	state.filter = btn.dataset.filter;
	syncUrl();
	syncChips();
	if (state.loaded) applyFilters();
});

els.clearSearch?.addEventListener('click', () => {
	state.query = '';
	state.filter = '';
	els.search.value = '';
	syncUrl();
	syncChips();
	if (state.loaded) applyFilters();
});

els.retry?.addEventListener('click', () => loadAll());

els.loadMoreBtn?.addEventListener('click', showMore);

// Infinite scroll sentinel.
if ('IntersectionObserver' in window && els.sentinel) {
	const observer = new IntersectionObserver(
		(entries) => {
			if (entries[0].isIntersecting) showMore();
		},
		{ rootMargin: '300px' },
	);
	observer.observe(els.sentinel);
}

// ── Boot ───────────────────────────────────────────────────────────────────

loadAll();
