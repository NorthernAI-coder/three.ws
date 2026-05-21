// public/bazaar.js — discovery UI logic.
//
// Talks to /api/bazaar/list and /api/bazaar/search, renders normalized result
// cards, applies sidebar filters, and routes "Try it" through the drop-in
// x402.js modal so the same on-chain payment flow used elsewhere ships here
// too.

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const els = {
	form: $('#search-form'),
	q: $('#q'),
	clear: $('#clear-btn'),
	type: $('#f-type'),
	network: $('#f-network'),
	max: $('#f-max'),
	ext: $('#f-ext'),
	sort: $('#f-sort'),
	reset: $('#reset-btn'),
	count: $('#count'),
	qlabel: $('#qlabel'),
	sources: $('#sources'),
	results: $('#results'),
	empty: $('#empty'),
	modal: $('#details-modal'),
	modalTitle: $('#dm-title'),
	modalBody: $('#dm-body'),
	modalClose: $('#dm-close'),
};

const state = {
	loading: false,
	lastQuery: '',
	items: [],
};

function readFilters() {
	return {
		type: els.type.value || 'http',
		network: els.network.value || '',
		maxPriceUsdc: els.max.value ? Number(els.max.value) : null,
		extension: els.ext.value || '',
		sort: els.sort.value || '',
	};
}

function paramsFor(query, f) {
	const p = new URLSearchParams();
	if (query) p.set('query', query);
	p.set('type', f.type);
	if (f.network) p.set('network', f.network);
	if (f.maxPriceUsdc != null && !Number.isNaN(f.maxPriceUsdc)) {
		// USDC is 6 decimals; we store integers as strings to avoid float math.
		const atomic = Math.round(f.maxPriceUsdc * 1_000_000);
		p.set('maxPrice', String(atomic));
		p.set('asset', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'); // base USDC reference; backend matches by lowercase
	}
	if (f.extension) p.set('extension', f.extension);
	if (f.sort) p.set('sort', f.sort);
	p.set('maxItems', '500');
	p.set('limit', query ? '100' : '200');
	return p;
}

async function load() {
	if (state.loading) return;
	state.loading = true;
	const query = els.q.value.trim();
	state.lastQuery = query;
	const filters = readFilters();
	const endpoint = query ? '/api/bazaar/search' : '/api/bazaar/list';
	const url = `${endpoint}?${paramsFor(query, filters).toString()}`;
	renderLoading(query);
	try {
		const r = await fetch(url, { headers: { accept: 'application/json' } });
		const data = await r.json();
		if (!r.ok) throw new Error(data?.error_description || data?.error || `HTTP ${r.status}`);
		state.items = data.resources || data.items || [];
		renderResults(state.items, query, data.sources || [], data.errors || []);
	} catch (e) {
		renderError(e);
	} finally {
		state.loading = false;
	}
}

function renderLoading(query) {
	els.results.innerHTML = '';
	els.empty.hidden = true;
	els.count.innerHTML = '<span class="spinner"></span>';
	els.qlabel.textContent = query ? `for "${query}"` : '';
	els.sources.textContent = '';
}

function renderError(e) {
	els.count.textContent = '0';
	els.empty.hidden = false;
	els.empty.textContent = `Failed to load: ${e?.message || e}`;
}

function renderResults(items, query, sources, errors) {
	els.count.textContent = String(items.length);
	els.qlabel.textContent = query ? `for "${query}"` : '';
	els.sources.innerHTML = sourcesLine(sources, errors);
	if (items.length === 0) {
		els.results.innerHTML = '';
		els.empty.hidden = false;
		els.empty.textContent = 'No matching services. Try fewer filters or a different query.';
		return;
	}
	els.empty.hidden = true;
	const frag = document.createDocumentFragment();
	for (const it of items) frag.appendChild(card(it));
	els.results.replaceChildren(frag);
}

function sourcesLine(sources, errors) {
	const parts = sources.map((s) => {
		const host = safeHost(s.facilitator);
		return s.ok
			? `<span class="ok">${host} (${s.count})</span>`
			: `<span class="err">${host} (failed)</span>`;
	});
	if (errors.length) {
		for (const e of errors) {
			parts.push(`<span class="err" title="${escape(e.error)}">${safeHost(e.facilitator)} ✗</span>`);
		}
	}
	return parts.join(' · ');
}

function safeHost(u) {
	try { return new URL(u).host; } catch { return String(u); }
}

function card(it) {
	const el = document.createElement('div');
	el.className = 'card';

	const head = document.createElement('div');
	head.className = 'head';
	const icon = document.createElement('div');
	icon.className = 'icon';
	if (it.iconUrl) {
		const img = document.createElement('img');
		img.src = it.iconUrl;
		img.alt = '';
		img.referrerPolicy = 'no-referrer';
		img.onerror = () => {
			icon.textContent = initial(it);
			img.remove();
		};
		icon.appendChild(img);
	} else {
		icon.textContent = initial(it);
	}
	const titleBox = document.createElement('div');
	titleBox.style.flex = '1';
	titleBox.style.minWidth = '0';
	const title = document.createElement('div');
	title.className = 'title';
	title.textContent = it.serviceName || prettyTitle(it);
	const sub = document.createElement('div');
	sub.className = 'subtitle';
	sub.textContent = it.toolName ? `${it.toolName} — ${it.resource}` : it.resource;
	titleBox.append(title, sub);
	head.append(icon, titleBox);

	const desc = document.createElement('div');
	desc.className = 'desc';
	desc.textContent = it.description || '';

	const meta = document.createElement('div');
	meta.className = 'meta';
	if (it.minPriceLabel) meta.appendChild(tag('price', it.minPriceLabel));
	if (it.method) meta.appendChild(tag('method', it.method));
	for (const n of it.networks || []) meta.appendChild(tag('net', shortNet(n)));
	for (const ext of it.extensions || []) {
		if (ext === 'bazaar') continue; // implied
		meta.appendChild(tag('ext', ext));
	}

	const actions = document.createElement('div');
	actions.className = 'actions';
	const tryBtn = document.createElement('button');
	tryBtn.type = 'button';
	tryBtn.className = 'btn-pay';
	tryBtn.textContent = it.type === 'mcp' ? 'Inspect tool' : 'Try it';
	tryBtn.onclick = () => onTry(el, it, tryBtn);
	const detailsBtn = document.createElement('button');
	detailsBtn.type = 'button';
	detailsBtn.className = 'btn-details';
	detailsBtn.textContent = 'Details';
	detailsBtn.onclick = () => openDetails(it);
	actions.append(tryBtn, detailsBtn);

	const receipt = document.createElement('div');
	receipt.className = 'receipt';
	receipt.hidden = true;
	receipt.dataset.role = 'receipt';

	el.append(head, desc, meta, actions, receipt);
	return el;
}

function tag(kind, text) {
	const t = document.createElement('span');
	t.className = `tag ${kind}`;
	t.textContent = text;
	return t;
}

function shortNet(n) {
	if (!n) return '';
	if (n.startsWith('eip155:8453')) return 'base';
	if (n.startsWith('eip155:84532')) return 'base-sepolia';
	if (n.startsWith('eip155:42161')) return 'arbitrum';
	if (n.startsWith('eip155:10')) return 'optimism';
	if (n.startsWith('eip155:137')) return 'polygon';
	if (n.startsWith('solana')) return 'solana';
	return n;
}

function initial(it) {
	const s = (it.serviceName || it.resource || '?').replace(/^https?:\/\//, '');
	return s.charAt(0).toUpperCase() || '?';
}

function prettyTitle(it) {
	if (it.toolName) return it.toolName;
	try {
		const u = new URL(it.resource);
		const tail = u.pathname.replace(/\/$/, '').split('/').pop();
		return tail ? `${u.host} · ${tail}` : u.host;
	} catch {
		return it.resource || 'Untitled';
	}
}

async function onTry(cardEl, it, btn) {
	if (it.type === 'mcp') {
		// MCP tools require a JSON-RPC tools/call envelope, which the drop-in modal
		// doesn't speak. Show the details panel so callers can wire it themselves.
		openDetails(it);
		return;
	}
	const receipt = cardEl.querySelector('[data-role=receipt]');
	receipt.hidden = false;
	receipt.className = 'receipt';
	receipt.textContent = 'Opening x402 payment modal…';
	btn.disabled = true;
	try {
		const opts = {
			endpoint: it.resource,
			method: it.input?.method || it.method || 'GET',
			merchant: safeHost(it.resource),
			action: it.serviceName || prettyTitle(it),
		};
		if (it.input?.body) opts.body = it.input.body;
		if (it.input?.queryParams && Object.keys(it.input.queryParams).length) {
			const u = new URL(opts.endpoint);
			for (const [k, v] of Object.entries(it.input.queryParams)) u.searchParams.set(k, String(v));
			opts.endpoint = u.toString();
		}
		const out = await window.X402.pay(opts);
		if (out?.ok) {
			receipt.className = 'receipt ok';
			receipt.innerHTML = renderReceipt(out);
		} else {
			receipt.className = 'receipt err';
			receipt.textContent = `Failed: ${out?.error || 'unknown error'}`;
		}
	} catch (e) {
		if (e?.code === 'cancelled') {
			receipt.hidden = true;
		} else {
			receipt.className = 'receipt err';
			receipt.textContent = `Error: ${e?.message || e}`;
		}
	} finally {
		btn.disabled = false;
	}
}

function renderReceipt(out) {
	const tx = out.payment?.transaction || out.payment?.tx || '';
	const net = out.payment?.network || '';
	const explorer = explorerLink(net, tx);
	const head = explorer
		? `<a href="${explorer}" target="_blank" rel="noopener">on-chain receipt</a> · ${escape(net)} · ${escape(short(tx))}`
		: `paid${net ? ` on ${escape(net)}` : ''}${tx ? ' · ' + escape(short(tx)) : ''}`;
	const body = typeof out.result === 'string' ? out.result : JSON.stringify(out.result, null, 2);
	return `${head}\n\n${escape(body)}`;
}

function explorerLink(net, tx) {
	if (!tx) return null;
	if (net.startsWith('solana')) return `https://solscan.io/tx/${tx}`;
	if (net.includes('8453')) return `https://basescan.org/tx/${tx}`;
	if (net.includes('84532')) return `https://sepolia.basescan.org/tx/${tx}`;
	if (net.includes('42161')) return `https://arbiscan.io/tx/${tx}`;
	if (net.includes('10')) return `https://optimistic.etherscan.io/tx/${tx}`;
	if (net.includes('137')) return `https://polygonscan.com/tx/${tx}`;
	return null;
}

function short(s) {
	if (!s) return '';
	return s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-6)}` : s;
}

function escape(s) {
	return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function openDetails(it) {
	els.modalTitle.textContent = it.serviceName || prettyTitle(it);
	const pre = document.createElement('pre');
	pre.textContent = JSON.stringify(it.raw, null, 2);
	const summary = document.createElement('div');
	summary.style.marginBottom = '12px';
	summary.style.fontSize = '13px';
	summary.style.color = 'var(--muted)';
	summary.innerHTML = `
		<div><strong style="color:var(--text)">${escape(it.resource)}</strong></div>
		<div>type: ${escape(it.type)}${it.toolName ? ' · tool: ' + escape(it.toolName) : ''} · method: ${escape(it.method || '')}</div>
		<div>networks: ${(it.networks || []).map(escape).join(', ')}</div>
		<div>price: ${escape(it.minPriceLabel || '—')}</div>
		<div>facilitator: ${escape(safeHost(it.facilitator))}</div>
	`;
	els.modalBody.replaceChildren(summary, pre);
	if (typeof els.modal.showModal === 'function') els.modal.showModal();
}

els.modalClose.addEventListener('click', () => els.modal.close());
els.modal.addEventListener('click', (e) => {
	const rect = els.modal.getBoundingClientRect();
	if (e.clientY < rect.top || e.clientY > rect.bottom || e.clientX < rect.left || e.clientX > rect.right) {
		els.modal.close();
	}
});

els.form.addEventListener('submit', (e) => { e.preventDefault(); load(); });
els.clear.addEventListener('click', () => { els.q.value = ''; load(); });
els.reset.addEventListener('click', () => {
	els.type.value = 'http';
	els.network.value = '';
	els.max.value = '';
	els.ext.value = '';
	els.sort.value = '';
	els.q.value = '';
	load();
});
[els.type, els.network, els.max, els.ext, els.sort].forEach((el) => {
	const ev = el.tagName === 'SELECT' ? 'change' : 'input';
	let t;
	el.addEventListener(ev, () => {
		clearTimeout(t);
		t = setTimeout(load, 200);
	});
});

// Initial render.
load();
