// Cosmetics Shop (R21) — in-world panel to browse the cosmetics catalog, filter
// by rarity, and preview any item LIVE on your own avatar before buying.
//
// The shop is pure 2D chrome: it fetches the real catalog and calls back into
// the scene (coincommunities.js) to equip/unequip a preview on the local rig.
// It never mutates the 3D scene directly and never persists a purchase — that's
// R22 (x402) / R23 (inventory). Prices are denominated in $THREE, the only coin.
//
// Catalog source: the real endpoint /api/cosmetics/catalog, with the static CDN
// mirror /cosmetics/catalog.json as a resilient fallback (and the dev source,
// where /api/* proxies to prod and the endpoint isn't deployed yet). Both are
// real network fetches — there is no client-side sample array.

import { log } from '../shared/log.js';

function el(tag, props = {}, kids = []) {
	const n = document.createElement(tag);
	for (const [k, v] of Object.entries(props)) {
		if (k === 'class') n.className = v;
		else if (k === 'text') n.textContent = v;
		else if (k === 'html') n.innerHTML = v;
		else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
		else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v);
	}
	for (const kid of [].concat(kids)) if (kid != null && kid !== false) n.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
	return n;
}

const RARITY_LABEL = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
// Placeholder glyph per slot, shown when an item has no preview image.
const SLOT_GLYPH = { hat: '🎩', glasses: '🕶️', earrings: '💎', outfit: '👕', skin: '🎨', emote: '✨' };

const fmtPrice = (n) => {
	if (!n || !isFinite(n)) return '0';
	if (n >= 1000) return (n / 1000).toFixed(n % 1000 ? 1 : 0) + 'K';
	return String(n);
};

// Fetch the catalog from the real endpoint, falling back to the static mirror.
// Throws only if neither source yields items, so the UI can show its error state.
async function fetchCatalog(rarity) {
	const qs = rarity ? `?rarity=${encodeURIComponent(rarity)}` : '';
	const sources = [`/api/cosmetics/catalog${qs}`, '/cosmetics/catalog.json'];
	for (const url of sources) {
		try {
			const r = await fetch(url, { headers: { accept: 'application/json' } });
			if (!r.ok) continue;
			const data = await r.json();
			if (Array.isArray(data?.items)) return data.items;
		} catch { /* try the next source */ }
	}
	throw new Error('catalog unavailable');
}

export class CosmeticsShop {
	/**
	 * @param {object} h handlers:
	 *   onPreview(item)   — equip the item live on the local avatar.
	 *   onEndPreview()    — revert the active preview.
	 */
	constructor(h = {}) {
		this.h = h;
		this.items = [];
		this.rarity = 'all';       // active rarity filter
		this.previewId = null;     // id of the item currently previewing (toggle)
		this.state = 'idle';       // idle | loading | ready | error
		this._build();
	}

	_build() {
		this.closeBtn = el('button', {
			class: 'cc-shop-close', type: 'button', 'aria-label': 'Close shop',
			onclick: () => this.close(),
		}, [el('span', { 'aria-hidden': 'true', text: '✕' })]);

		this.filters = el('div', { class: 'cc-shop-filters', role: 'tablist', 'aria-label': 'Filter by rarity' });

		this.grid = el('div', { class: 'cc-shop-grid' });
		this.statusEl = el('div', { class: 'cc-shop-status', hidden: true, role: 'status', 'aria-live': 'polite' });

		this.body = el('div', { class: 'cc-shop-body' }, [this.statusEl, this.grid]);

		this.panel = el('div', {
			class: 'cc-shop-panel', role: 'dialog', 'aria-modal': 'false',
			'aria-label': 'Cosmetics shop',
		}, [
			el('div', { class: 'cc-shop-head' }, [
				el('div', { class: 'cc-shop-title' }, [
					el('span', { class: 'cc-shop-title-main', text: 'Cosmetics' }),
					el('span', { class: 'cc-shop-title-sub', text: 'Preview live on your avatar' }),
				]),
				this.closeBtn,
			]),
			this.filters,
			this.body,
		]);

		this.root = el('div', { class: 'cc-shop', id: 'cc-shop', hidden: true }, [this.panel]);
		// Backdrop tap closes; panel taps don't bubble out.
		this.root.addEventListener('click', (e) => { if (e.target === this.root) this.close(); });
		this._onKey = (e) => { if (e.key === 'Escape' && !this.root.hidden) { e.stopPropagation(); this.close(); } };

		document.body.appendChild(this.root);
		this._buildFilters();
	}

	_buildFilters() {
		this.filters.textContent = '';
		const make = (key, label) => el('button', {
			class: 'cc-shop-chip' + (this.rarity === key ? ' cc-active' : ''),
			type: 'button', role: 'tab', 'aria-selected': this.rarity === key ? 'true' : 'false',
			'data-rarity': key,
			onclick: () => this._setRarity(key),
		}, label);
		this.filters.appendChild(make('all', 'All'));
		for (const r of ['common', 'rare', 'epic', 'legendary']) this.filters.appendChild(make(r, RARITY_LABEL[r]));
	}

	_setRarity(key) {
		if (this.rarity === key) return;
		this.rarity = key;
		this._buildFilters();
		this._render();
	}

	// ── open / close ──────────────────────────────────────────────────────────

	isOpen() { return !this.root.hidden; }
	toggle() { this.isOpen() ? this.close() : this.open(); }

	async open() {
		if (this.isOpen()) return;
		this.root.hidden = false;
		requestAnimationFrame(() => this.root.classList.add('cc-shop-in'));
		document.addEventListener('keydown', this._onKey, true);
		this.closeBtn.focus();
		// Load once; re-open reuses the catalog (cheap, and avoids a flash).
		if (this.state !== 'ready') await this._load();
		else this._render();
	}

	close() {
		if (!this.isOpen()) return;
		this.root.classList.remove('cc-shop-in');
		document.removeEventListener('keydown', this._onKey, true);
		// Reverting any live preview is the whole point — don't leave a tried-on
		// item stuck on the avatar after the shop closes.
		this._clearPreview();
		// Match the CSS transition before hiding so the exit animates.
		setTimeout(() => { this.root.hidden = true; }, 180);
	}

	dispose() {
		document.removeEventListener('keydown', this._onKey, true);
		this.root.remove();
	}

	// ── data ──────────────────────────────────────────────────────────────────

	async _load() {
		this.state = 'loading';
		this._renderSkeleton();
		try {
			// Always fetch the full catalog; rarity filtering is client-side so
			// switching tabs is instant and needs no refetch.
			this.items = await fetchCatalog();
			this.state = 'ready';
			this._render();
		} catch (err) {
			log.warn('[shop] catalog load failed:', err?.message);
			this.state = 'error';
			this._renderError();
		}
	}

	// ── rendering ───────────────────────────────────────────────────────────────

	_status(text) {
		this.statusEl.textContent = text || '';
		this.statusEl.hidden = !text;
	}

	_renderSkeleton() {
		this._status('');
		this.grid.textContent = '';
		this.grid.classList.remove('cc-shop-empty-grid');
		for (let i = 0; i < 8; i++) {
			this.grid.appendChild(el('div', { class: 'cc-shop-card cc-shop-skel', 'aria-hidden': 'true' }, [
				el('div', { class: 'cc-shop-thumb cc-skel-box' }),
				el('div', { class: 'cc-shop-meta' }, [
					el('div', { class: 'cc-skel-line' }),
					el('div', { class: 'cc-skel-line cc-skel-short' }),
				]),
			]));
		}
	}

	_renderError() {
		this._status('');
		this.grid.textContent = '';
		this.grid.classList.add('cc-shop-empty-grid');
		this.grid.appendChild(el('div', { class: 'cc-shop-empty' }, [
			el('div', { class: 'cc-shop-empty-ico', 'aria-hidden': 'true', text: '⚠' }),
			el('div', { class: 'cc-shop-empty-title', text: 'Couldn’t load the shop' }),
			el('div', { class: 'cc-shop-empty-sub', text: 'The catalog didn’t load. Check your connection and try again.' }),
			el('button', { class: 'cc-shop-retry', type: 'button', text: 'Retry', onclick: () => this._load() }),
		]));
	}

	_render() {
		if (this.state === 'loading') return this._renderSkeleton();
		if (this.state === 'error') return this._renderError();

		const list = this.rarity === 'all' ? this.items : this.items.filter((i) => i.rarity === this.rarity);
		this.grid.textContent = '';

		if (!list.length) {
			this.grid.classList.add('cc-shop-empty-grid');
			this.grid.appendChild(el('div', { class: 'cc-shop-empty' }, [
				el('div', { class: 'cc-shop-empty-ico', 'aria-hidden': 'true', text: '🔍' }),
				el('div', { class: 'cc-shop-empty-title', text: 'Nothing in this tier yet' }),
				el('div', { class: 'cc-shop-empty-sub', text: 'No cosmetics match this rarity. Try another filter.' }),
				el('button', { class: 'cc-shop-retry', type: 'button', text: 'Show all', onclick: () => this._setRarity('all') }),
			]));
			this._status('');
			return;
		}

		this.grid.classList.remove('cc-shop-empty-grid');
		const ownedCount = list.filter((i) => i.owned).length;
		this._status(`${list.length} item${list.length === 1 ? '' : 's'} · ${ownedCount} owned`);
		for (const item of list) this.grid.appendChild(this._card(item));
	}

	_card(item) {
		const active = this.previewId === item.id;

		const thumb = item.previewImage
			? el('img', {
				class: 'cc-shop-thumb-img', src: item.previewImage, alt: '', loading: 'lazy',
				// Missing/404 art degrades to the slot glyph instead of a broken icon.
				onerror: (e) => { e.target.replaceWith(this._glyph(item)); },
			})
			: this._glyph(item);

		const badge = item.owned
			? el('span', { class: 'cc-shop-badge cc-owned', text: 'Owned' })
			: el('span', { class: 'cc-shop-badge cc-locked' }, [
				el('span', { class: 'cc-lock-ico', 'aria-hidden': 'true', text: '🔒' }),
				el('span', { text: `${fmtPrice(item.price)} $THREE` }),
			]);

		const card = el('button', {
			class: 'cc-shop-card'
				+ ` cc-rarity-${item.rarity}`
				+ (item.owned ? ' cc-is-owned' : ' cc-is-locked')
				+ (active ? ' cc-active' : ''),
			type: 'button',
			'aria-pressed': active ? 'true' : 'false',
			'aria-label': `${item.name} — ${RARITY_LABEL[item.rarity]}, ${item.owned ? 'owned' : `locked, ${item.price} $THREE`}. ${active ? 'Stop preview' : 'Preview on your avatar'}`,
			title: active ? 'Click to stop preview' : 'Click to preview on your avatar',
			onclick: () => this._toggleItem(item),
		}, [
			el('div', { class: 'cc-shop-thumb' }, [
				thumb,
				el('span', { class: 'cc-shop-rarity', 'data-rarity': item.rarity, text: RARITY_LABEL[item.rarity] }),
				el('span', { class: 'cc-shop-preview-tag', 'aria-hidden': 'true', text: active ? 'Previewing' : 'Preview' }),
			]),
			el('div', { class: 'cc-shop-meta' }, [
				el('span', { class: 'cc-shop-name', text: item.name }),
				badge,
			]),
		]);
		return card;
	}

	_glyph(item) {
		return el('div', { class: 'cc-shop-glyph', 'aria-hidden': 'true', text: SLOT_GLYPH[item.slot] || '✦' });
	}

	// ── preview toggle ────────────────────────────────────────────────────────

	async _toggleItem(item) {
		// Re-selecting the active item ends the preview.
		if (this.previewId === item.id) { this._clearPreview(); this._render(); return; }
		this.previewId = item.id;
		this._render();
		try {
			await this.h.onPreview?.(item);
		} catch (err) {
			log.warn('[shop] preview failed:', err?.message);
		}
	}

	_clearPreview() {
		if (!this.previewId) return;
		this.previewId = null;
		try { this.h.onEndPreview?.(); } catch { /* ignore */ }
	}
}
