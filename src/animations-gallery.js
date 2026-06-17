// /animations — public animation gallery.
//
// Lists public animation clips via GET /api/animations/clips?include_public=true
// filtered to public visibility. Supports search, loop/once filter, infinite
// scroll via cursor pagination, and live preview iframes on hover/click.
//
// Card actions:
//   • Preview (hover)  — inline iframe with CZ avatar + the clip playing
//   • Open in Studio   — /pose?anim=<id>  (open in editor for remixing)
//   • Use on my avatar — /pose?anim=<id>  (same, user loads their own avatar)

const PREVIEW_MODEL = '/avatars/cz.glb';
const API_BASE = '/api/animations/clips';

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
	cursor: null,
	loading: false,
	items: [],
	hasMore: false,
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

// ── Fetch ──────────────────────────────────────────────────────────────────

async function load(reset = false) {
	if (state.loading) return;
	if (reset) {
		state.cursor = null;
		state.items = [];
		state.hasMore = false;
		showState('loading');
	}
	state.loading = true;

	const params = new URLSearchParams({ include_public: 'true', visibility: 'public', limit: '24' });
	if (state.cursor) params.set('cursor', state.cursor);
	if (state.query) params.set('q', state.query);
	// loop filter maps to kind: 'loop' or 'animation'
	if (state.filter === 'loop') params.set('kind', 'loop');
	if (state.filter === 'once') params.set('kind', 'animation');

	try {
		const res = await fetch(`${API_BASE}?${params}`, { credentials: 'include' });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = await res.json();
		const incoming = Array.isArray(data.items) ? data.items : [];
		state.items = reset ? incoming : [...state.items, ...incoming];
		state.cursor = data.next_cursor || null;
		state.hasMore = !!data.next_cursor;
		renderGrid(reset);
	} catch {
		showState('error');
	} finally {
		state.loading = false;
	}
}

// ── Render ─────────────────────────────────────────────────────────────────

function renderGrid(reset) {
	if (state.items.length === 0) {
		showState(state.query || state.filter ? 'empty-search' : 'empty');
		if (state.query && els.emptySearchMsg) {
			els.emptySearchMsg.textContent = `No animations match "${state.query}".`;
		}
		return;
	}

	showState('grid');

	if (reset) els.grid.innerHTML = '';

	const startIdx = reset ? 0 : els.grid.children.length;
	const fragment = document.createDocumentFragment();
	for (let i = startIdx; i < state.items.length; i++) {
		fragment.appendChild(buildCard(state.items[i]));
	}
	els.grid.appendChild(fragment);

	if (state.hasMore) {
		els.loadMore.hidden = false;
	} else {
		els.loadMore.hidden = true;
	}
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

	const previewId = `ag-preview-${clip.id}`;
	const studioUrl = `/pose?anim=${encodeURIComponent(clip.id)}`;
	const loopBadge = clip.loop !== false;
	const hasThumb = !!clip.thumbnail_url;

	card.innerHTML = `
		<div class="ag-card-preview" role="button" tabindex="0"
			aria-label="Preview ${clip.name || 'animation'}"
			data-clip-id="${clip.id}">
			${hasThumb
				? `<img class="ag-card-thumb" src="${escHtml(clip.thumbnail_url)}" alt="" loading="lazy" />`
				: `<div class="ag-card-thumb-placeholder" aria-hidden="true">🎬</div>`
			}
			<div class="ag-card-preview-overlay" id="${previewId}"></div>
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
				${clip.duration_ms ? `<span class="ag-badge">${fmtDuration(clip.duration_ms)}</span>` : ''}
				${clip.price ? `<span class="ag-badge ag-badge--price">$${(Number(clip.price.amount) / 1_000_000).toFixed(2)}</span>` : ''}
			</div>
			${clip.tags?.length ? `<div class="ag-card-tags">${clip.tags.slice(0, 5).map((t) => `<span class="ag-tag">${escHtml(t)}</span>`).join('')}</div>` : ''}
			<div class="ag-card-actions">
				<a href="${escHtml(studioUrl)}" class="ag-card-btn ag-card-btn--primary"
					title="Open this animation in the Studio to remix or apply to your avatar">
					Open in Studio
				</a>
				<button class="ag-card-btn" data-preview="${clip.id}"
					title="Preview this animation on a live avatar"
					aria-label="Preview ${clip.name || 'animation'}">
					Preview
				</button>
			</div>
		</div>
	`;

	// Preview on hover (desktop) — lazy-load the iframe
	const previewZone = card.querySelector('.ag-card-preview');
	const overlay = card.querySelector('.ag-card-preview-overlay');
	let iframeLoaded = false;

	const launchPreview = () => {
		if (!iframeLoaded) {
			iframeLoaded = true;
			const iframe = document.createElement('iframe');
			iframe.src = `/avatar-embed?model=${encodeURIComponent(PREVIEW_MODEL)}&anim=${encodeURIComponent(clip.id)}&animPicker=0&idle=off&bg=transparent&name=0`;
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

	// "Preview" button — same behavior as hover
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
		load(true);
	}, 280);
});

els.chips?.addEventListener('click', (e) => {
	const btn = e.target.closest('[data-filter]');
	if (!btn) return;
	state.filter = btn.dataset.filter;
	syncUrl();
	syncChips();
	load(true);
});

els.clearSearch?.addEventListener('click', () => {
	state.query = '';
	els.search.value = '';
	syncUrl();
	load(true);
});

els.retry?.addEventListener('click', () => load(true));

els.loadMoreBtn?.addEventListener('click', () => load(false));

// Infinite scroll sentinel
if ('IntersectionObserver' in window && els.sentinel) {
	const observer = new IntersectionObserver(
		(entries) => {
			if (entries[0].isIntersecting && state.hasMore && !state.loading) {
				load(false);
			}
		},
		{ rootMargin: '200px' },
	);
	observer.observe(els.sentinel);
}

// ── Boot ───────────────────────────────────────────────────────────────────

load(true);
