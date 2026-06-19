// x402 Studio — the payments control room.
//
// Loads the merchant's account settings (/api/x402-settings), products
// (/api/x402-skus), and the live platform payer balance
// (/api/agent-wallet-bridge), then renders a configurable console: overview,
// products, a drag-and-drop button builder, agent wallets, payouts, security
// & CORS, and branding. Every change persists to real APIs.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { settings: null, skus: [], bridge: null, savetimer: null };

// ─────────────────────────────────────────────────────────────── utilities ──
function toast(msg) {
	const t = $('#toast');
	t.textContent = msg;
	t.classList.add('show');
	clearTimeout(toast._t);
	toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}
function setSaveState(kind, txt) {
	const el = $('#savestate');
	el.className = 'savestate ' + kind;
	el.querySelector('.txt').textContent = txt;
}
function usdc(atomics) {
	const n = Number(atomics || 0) / 1e6;
	return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}
async function copy(text, label = 'Copied') {
	try { await navigator.clipboard.writeText(text); toast(label); }
	catch { toast('Copy failed'); }
}
function api(path, opts = {}) {
	return fetch(path, { credentials: 'include', headers: { 'content-type': 'application/json' }, ...opts });
}

// ───────────────────────────────────────────────────────────────── loading ──
async function boot() {
	wireNav();
	wireBuilder();
	wireDialogs();
	wireSecurity();
	wireSavers();

	let r;
	try {
		r = await api('/api/x402-settings');
	} catch {
		setSaveState('dirty', 'Offline');
		return;
	}
	if (r.status === 401) {
		$('#gate').style.display = 'block';
		setSaveState('', 'Signed out');
		return;
	}
	const data = await r.json().catch(() => null);
	if (!r.ok || !data) { setSaveState('dirty', 'Load failed'); return; }
	state.settings = data.settings;
	$('#app').style.display = 'block';
	setSaveState('saved', 'Saved');

	hydrateForms();
	await Promise.all([loadProducts(), loadBridge()]);
	renderOverview();
	renderWallets();
	updateBuilderProducts();
	buildSnippet();
}

// PUT the full editable settings object.
async function saveSettings(reason = 'Saved') {
	const s = state.settings;
	const payload = {
		business_name: s.business_name || '',
		support_email: s.support_email || '',
		payout_evm: s.payout_evm || '',
		payout_solana: s.payout_solana || '',
		brand: s.brand || {},
		networks: s.networks || [],
		cors_origins: s.cors_origins || [],
		security: s.security || {},
		agent_wallets: s.agent_wallets || [],
		builder: s.builder || {},
		facilitator: s.facilitator || '',
	};
	setSaveState('saving', 'Saving…');
	let r;
	try { r = await api('/api/x402-settings', { method: 'PUT', body: JSON.stringify(payload) }); }
	catch { setSaveState('dirty', 'Save failed'); toast('Network error'); return false; }
	if (!r.ok) {
		const e = await r.json().catch(() => ({}));
		setSaveState('dirty', 'Save failed');
		toast(e.message || 'Save failed');
		return false;
	}
	const data = await r.json();
	state.settings = data.settings;
	setSaveState('saved', reason);
	renderOverview();
	return true;
}

// ──────────────────────────────────────────────────────────────────── nav ──
function wireNav() {
	$$('nav.side a').forEach((a) => {
		a.addEventListener('click', () => showView(a.dataset.view));
	});
	// deep-link via hash
	const h = location.hash.replace('#', '');
	if (h && $(`nav.side a[data-view="${h}"]`)) showView(h);
}
function showView(name) {
	$$('nav.side a').forEach((a) => a.classList.toggle('active', a.dataset.view === name));
	$$('#app .view').forEach((v) => v.classList.toggle('active', v.dataset.view === name));
	location.hash = name;
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ───────────────────────────────────────────────────────────── form hydrate ──
function hydrateForms() {
	const s = state.settings;
	// payouts
	$('#p-evm').value = s.payout_evm || '';
	$('#p-sol').value = s.payout_solana || '';
	$('#p-facilitator').value = s.facilitator || '';
	$('#net-base').checked = s.networks.includes('base');
	$('#net-solana').checked = s.networks.includes('solana');
	// security
	$('#s-percap').value = s.security.per_payment_cap_usdc ?? '';
	$('#s-daycap').value = s.security.daily_cap_usdc ?? '';
	$('#s-siwx').checked = !!s.security.require_siwx;
	renderCors();
	renderApiKey();
	// branding
	$('#br-business').value = s.business_name || '';
	$('#br-email').value = s.support_email || '';
	$('#br-merchant').value = s.brand.merchant || '';
	$('#br-logo').value = s.brand.logo_url || '';
	const acc = s.brand.accent || '#0a84ff';
	$('#br-accent').value = acc; $('#br-accentHex').value = acc;
	$('#br-footer').value = s.brand.footer_note || '';
	// builder preset
	if (s.builder && Object.keys(s.builder).length) applyBuilderPreset(s.builder);
}

// ─────────────────────────────────────────────────────────────── overview ──
function renderOverview() {
	const s = state.settings;
	$('#ov-products').textContent = state.skus.length;
	$('#nav-products').textContent = state.skus.length;
	$('#nav-wallets').textContent = (s.agent_wallets || []).length;
	const calls = state.skus.reduce((a, k) => a + (k.paid_calls || 0), 0);
	const gross = state.skus.reduce((a, k) => a + Number(k.gross_atomics || 0), 0);
	$('#ov-calls').textContent = calls.toLocaleString();
	$('#ov-revenue').innerHTML = `${usdc(gross)}<span class="u"> USDC</span>`;
	$('#ov-wallets').textContent = (s.agent_wallets || []).length;

	const items = [
		{ done: !!(s.payout_evm || s.payout_solana), label: 'Add a payout address', view: 'payouts' },
		{ done: state.skus.length > 0, label: 'Create a product', view: 'products' },
		{ done: (s.agent_wallets || []).length > 0, label: 'Authorize an agent wallet', view: 'wallets' },
		{ done: !!(s.builder && Object.keys(s.builder).length), label: 'Design & copy your pay button', view: 'builder' },
	];
	$('#ov-checklist').innerHTML = items.map((i) => `
		<div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--border)">
			<span style="width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:13px;flex:none;${i.done ? 'background:color-mix(in srgb,var(--green) 22%,transparent);color:var(--green)' : 'background:var(--panel-3);color:var(--muted)'}">${i.done ? '✓' : '○'}</span>
			<span style="flex:1;font-size:13.5px;${i.done ? 'color:var(--muted);text-decoration:line-through' : ''}">${esc(i.label)}</span>
			<button class="btn ghost sm" data-go="${i.view}">${i.done ? 'Review' : 'Set up'}</button>
		</div>`).join('');
	$$('#ov-checklist [data-go]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.go)));
}

// ───────────────────────────────────────────────────────── platform payer ──
async function loadBridge() {
	try {
		const r = await fetch('/api/agent-wallet-bridge?status=1');
		state.bridge = r.ok ? await r.json() : null;
	} catch { state.bridge = null; }
	renderBridge();
}
function renderBridge() {
	const html = bridgeHtml();
	const a = $('#bridge-card'); if (a) a.innerHTML = html;
	const b = $('#ov-bridge'); if (b) b.innerHTML = html;
}
function bridgeHtml() {
	const w = state.bridge;
	if (!w || !w.ok) {
		return `<div class="banner warn" style="margin:0">The hosted payer bridge is offline right now. Your own agent wallets still settle independently.</div>`;
	}
	const chain = w.balance?.chains?.[0] || {};
	return `
		<div style="display:flex;flex-wrap:wrap;gap:18px;align-items:center">
			<div style="flex:1;min-width:200px">
				<div class="muted" style="font-size:12px;margin-bottom:5px">Payer address · Solana mainnet</div>
				<div class="kv">${esc(w.wallet.address)}<button class="copy" data-copy="${esc(w.wallet.address)}">copy</button></div>
			</div>
			<div><div class="muted" style="font-size:12px">USDC</div><div style="font-size:22px;font-weight:700">${esc(chain.usdc ?? '0')}</div></div>
			<div><div class="muted" style="font-size:12px">SOL</div><div style="font-size:22px;font-weight:700">${chain.sol != null ? Number(chain.sol).toFixed(4) : '—'}</div></div>
		</div>`;
}

// ─────────────────────────────────────────────────────────────── products ──
async function loadProducts() {
	try {
		const r = await api('/api/x402-skus');
		const d = r.ok ? await r.json() : { skus: [] };
		state.skus = d.skus || [];
	} catch { state.skus = []; }
	renderProducts();
}
function renderProducts() {
	const el = $('#products-list');
	if (!state.skus.length) {
		el.innerHTML = `<div class="empty"><div class="em">▣</div><h3>No products yet</h3><p>Create a product to turn any 402-enabled endpoint into a hosted checkout link you can share or embed.</p><button class="btn" id="emptyNew">+ New product</button></div>`;
		$('#emptyNew').addEventListener('click', () => openProduct());
		return;
	}
	el.innerHTML = `<div class="plist">${state.skus.map(prowHtml).join('')}</div>`;
	$$('#products-list .prow').forEach((row) => {
		const id = row.dataset.id;
		const sku = state.skus.find((s) => s.id === id);
		row.querySelector('[data-act=customize]').addEventListener('click', () => { prefillBuilderFromSku(sku); showView('builder'); });
		row.querySelector('[data-act=edit]').addEventListener('click', () => openProduct(sku));
		row.querySelector('[data-act=archive]').addEventListener('click', () => archiveProduct(sku));
	});
}
function prowHtml(s) {
	const accent = s.accent_color || '#0a84ff';
	const letter = (s.merchant_name || '?').trim().charAt(0).toUpperCase();
	const price = s.price_atomics ? `$${usdc(s.price_atomics)}` : 'per endpoint';
	return `
	<div class="prow" data-id="${esc(s.id)}">
		<div class="swatch" style="background:${esc(accent)}">${esc(letter)}</div>
		<div class="pi">
			<div class="nm">${esc(s.action_name)} <span class="tag ${s.active === false ? '' : 'live'}">${s.active === false ? 'paused' : 'live'}</span></div>
			<div class="sub">${esc(s.merchant_name)} · ${esc(s.target_method)} ${esc(s.target_endpoint)}</div>
		</div>
		<div class="pm"><b>${esc(price)}</b>${s.paid_calls || 0} calls · ${usdc(s.gross_atomics)} USDC</div>
		<div class="pacts">
			<a class="btn ghost sm" href="/pay/c/${esc(s.slug)}" target="_blank" rel="noopener" title="Open hosted checkout">↗</a>
			<button class="btn ghost sm" data-act="customize">Customize</button>
			<button class="btn ghost sm" data-act="edit">Edit</button>
			<button class="btn ghost sm" data-act="archive" title="Archive">✕</button>
		</div>
	</div>`;
}
async function archiveProduct(sku) {
	if (!confirm(`Archive "${sku.action_name}"? Its hosted link will stop working.`)) return;
	const r = await api(`/api/x402-skus?id=${encodeURIComponent(sku.id)}`, { method: 'DELETE' });
	if (r.ok) { toast('Product archived'); await loadProducts(); renderOverview(); updateBuilderProducts(); }
	else toast('Archive failed');
}

// ──────────────────────────────────────────────────────── product dialog ──
let editingSku = null;
function wireDialogs() {
	$('#newProductBtn').addEventListener('click', () => openProduct());
	$('#prodClose').addEventListener('click', closeProduct);
	$('#prodCancel').addEventListener('click', closeProduct);
	$('#prodOverlay').addEventListener('click', (e) => { if (e.target === $('#prodOverlay')) closeProduct(); });
	const form = $('#prodForm');
	form.elements.target_method.addEventListener('change', () => {
		$('#prodBodyWrap').style.display = form.elements.target_method.value === 'POST' ? 'block' : 'none';
	});
	form.addEventListener('submit', submitProduct);

	// wallet dialog
	$('#addWalletBtn').addEventListener('click', () => openWallet());
	$('#walletClose').addEventListener('click', closeWallet);
	$('#walletCancel').addEventListener('click', closeWallet);
	$('#walletOverlay').addEventListener('click', (e) => { if (e.target === $('#walletOverlay')) closeWallet(); });
	$('#walletForm').addEventListener('submit', submitWallet);
}
function openProduct(sku) {
	editingSku = sku || null;
	const f = $('#prodForm');
	f.reset();
	$('#prodErr').style.display = 'none';
	$('#prodTitle').textContent = sku ? 'Edit product' : 'New product';
	$('#prodSave').textContent = sku ? 'Save changes' : 'Create product';
	f.elements.slug.readOnly = !!sku;
	if (sku) {
		f.elements.slug.value = sku.slug;
		f.elements.merchant_name.value = sku.merchant_name || '';
		f.elements.action_name.value = sku.action_name || '';
		f.elements.target_endpoint.value = sku.target_endpoint || '';
		f.elements.target_method.value = sku.target_method || 'GET';
		f.elements.accent_color.value = sku.accent_color || '#0a84ff';
		f.elements.description.value = sku.description || '';
		f.elements.success_url.value = sku.success_url || '';
	} else {
		f.elements.merchant_name.value = state.settings.brand.merchant || state.settings.business_name || '';
		f.elements.accent_color.value = state.settings.brand.accent || '#0a84ff';
	}
	$('#prodBodyWrap').style.display = f.elements.target_method.value === 'POST' ? 'block' : 'none';
	$('#prodOverlay').classList.add('open');
}
function closeProduct() { $('#prodOverlay').classList.remove('open'); }
async function submitProduct(e) {
	e.preventDefault();
	const f = e.target;
	const errBox = $('#prodErr');
	const body = {
		slug: f.elements.slug.value.trim(),
		merchant_name: f.elements.merchant_name.value.trim(),
		action_name: f.elements.action_name.value.trim(),
		target_endpoint: f.elements.target_endpoint.value.trim(),
		target_method: f.elements.target_method.value,
		accent_color: f.elements.accent_color.value,
	};
	const desc = f.elements.description.value.trim(); if (desc) body.description = desc;
	const succ = f.elements.success_url.value.trim(); if (succ) body.success_url = succ;
	if (body.target_method === 'POST') {
		const raw = f.elements.target_body.value.trim();
		if (raw) {
			try { body.target_body = JSON.parse(raw); }
			catch { errBox.textContent = 'POST body must be valid JSON.'; errBox.style.display = 'flex'; return; }
		}
	}
	$('#prodSave').disabled = true;
	const url = editingSku ? `/api/x402-skus?id=${encodeURIComponent(editingSku.id)}` : '/api/x402-skus';
	const r = await api(url, { method: editingSku ? 'PATCH' : 'POST', body: JSON.stringify(body) });
	$('#prodSave').disabled = false;
	if (!r.ok) {
		const er = await r.json().catch(() => ({}));
		errBox.textContent = er.message || 'Could not save product.';
		errBox.style.display = 'flex';
		return;
	}
	closeProduct();
	toast(editingSku ? 'Product updated' : 'Product created');
	await loadProducts();
	renderOverview();
	updateBuilderProducts();
}

// ──────────────────────────────────────────────────────────── agent wallets ──
function renderWallets() {
	const wallets = state.settings.agent_wallets || [];
	const body = $('#wallets-body');
	if (!wallets.length) {
		body.innerHTML = `<div class="empty"><div class="em">◈</div><h3>No agent wallets yet</h3><p>Authorize a payer wallet so your agents can settle x402 calls automatically — or a payout wallet to receive revenue.</p><button class="btn" id="emptyWallet">+ Add wallet</button></div>`;
		$('#emptyWallet').addEventListener('click', () => openWallet());
		return;
	}
	body.innerHTML = `
		<table class="wtable"><thead><tr><th>Wallet</th><th>Role</th><th>Address</th><th>Caps (USDC)</th><th></th></tr></thead>
		<tbody>${wallets.map((w) => `
			<tr data-id="${esc(w.id)}" style="${w.enabled === false ? 'opacity:.5' : ''}">
				<td><b>${esc(w.label)}</b><div class="chainflag">${w.chain === 'base' ? 'Base · EVM' : 'Solana'}</div></td>
				<td><span class="role-pill ${esc(w.role)}">${w.role === 'payer' ? 'Payer' : 'Payout'}</span></td>
				<td class="addr">${esc(w.address.slice(0, 10))}…${esc(w.address.slice(-6))} <button class="copy" data-copy="${esc(w.address)}">copy</button></td>
				<td>${Number(w.per_payment_cap_usdc).toFixed(2)} / call · ${Number(w.daily_cap_usdc).toFixed(2)} / day</td>
				<td style="text-align:right;white-space:nowrap">
					${w.role === 'payout' ? `<button class="btn ghost sm" data-act="default">Set payout</button>` : ''}
					<button class="btn ghost sm" data-act="edit">Edit</button>
					<button class="btn ghost sm" data-act="del">✕</button>
				</td>
			</tr>`).join('')}</tbody></table>`;
	$$('#wallets-body tr[data-id]').forEach((tr) => {
		const w = wallets.find((x) => x.id === tr.dataset.id);
		tr.querySelector('[data-act=edit]').addEventListener('click', () => openWallet(w));
		tr.querySelector('[data-act=del]').addEventListener('click', () => removeWallet(w));
		const def = tr.querySelector('[data-act=default]');
		if (def) def.addEventListener('click', () => setPayoutFromWallet(w));
	});
}
let editingWallet = null;
function openWallet(w) {
	editingWallet = w || null;
	const f = $('#walletForm');
	f.reset();
	$('#walletErr').style.display = 'none';
	$('#walletTitle').textContent = w ? 'Edit agent wallet' : 'Add agent wallet';
	if (w) {
		f.elements.label.value = w.label;
		f.elements.chain.value = w.chain;
		f.elements.role.value = w.role;
		f.elements.address.value = w.address;
		f.elements.per_payment_cap_usdc.value = w.per_payment_cap_usdc;
		f.elements.daily_cap_usdc.value = w.daily_cap_usdc;
		f.elements.enabled.checked = w.enabled !== false;
	}
	$('#walletOverlay').classList.add('open');
}
function closeWallet() { $('#walletOverlay').classList.remove('open'); }
async function submitWallet(e) {
	e.preventDefault();
	const f = e.target;
	const errBox = $('#walletErr');
	const chain = f.elements.chain.value;
	const address = f.elements.address.value.trim();
	const valid = chain === 'base' ? /^0x[0-9a-fA-F]{40}$/.test(address) : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
	if (!valid) { errBox.textContent = `That doesn't look like a valid ${chain === 'base' ? 'Base (0x…)' : 'Solana (base58)'} address.`; errBox.style.display = 'flex'; return; }
	const w = {
		id: editingWallet ? editingWallet.id : 'w_' + Math.random().toString(36).slice(2, 10),
		label: f.elements.label.value.trim(),
		chain, role: f.elements.role.value, address,
		enabled: f.elements.enabled.checked,
		per_payment_cap_usdc: Math.max(0, Number(f.elements.per_payment_cap_usdc.value) || 0),
		daily_cap_usdc: Math.max(0, Number(f.elements.daily_cap_usdc.value) || 0),
	};
	const list = (state.settings.agent_wallets || []).slice();
	const idx = list.findIndex((x) => x.id === w.id);
	if (idx >= 0) list[idx] = w; else list.push(w);
	state.settings.agent_wallets = list;
	const ok = await saveSettings('Wallet saved');
	if (ok) { closeWallet(); renderWallets(); }
}
async function removeWallet(w) {
	if (!confirm(`Remove "${w.label}"?`)) return;
	state.settings.agent_wallets = (state.settings.agent_wallets || []).filter((x) => x.id !== w.id);
	if (await saveSettings('Wallet removed')) renderWallets();
}
async function setPayoutFromWallet(w) {
	if (w.chain === 'base') state.settings.payout_evm = w.address;
	else state.settings.payout_solana = w.address;
	$('#p-evm').value = state.settings.payout_evm || '';
	$('#p-sol').value = state.settings.payout_solana || '';
	if (await saveSettings('Payout set')) toast(`Payout set to ${w.label}`);
}

// ─────────────────────────────────────────────────────────────── security ──
function renderCors() {
	const list = state.settings.cors_origins || [];
	const el = $('#cors-list');
	if (!list.length) { el.innerHTML = `<span class="muted" style="font-size:13px">No origins — same-origin embeds only.</span>`; return; }
	el.innerHTML = list.map((o) => `<span class="chip">${esc(o)}<button data-rm="${esc(o)}" aria-label="Remove">✕</button></span>`).join('');
	$$('#cors-list [data-rm]').forEach((b) => b.addEventListener('click', async () => {
		state.settings.cors_origins = list.filter((o) => o !== b.dataset.rm);
		if (await saveSettings('Origin removed')) renderCors();
	}));
}
function renderApiKey() {
	const hint = state.settings.api_bypass_key_hint;
	const el = $('#apikey-body');
	if (hint) {
		el.innerHTML = `
			<div class="kv" style="margin-bottom:12px">•••• •••• •••• ${esc(hint)}<span style="margin-left:auto;color:var(--green);font-size:12px">active</span></div>
			<button class="btn ghost sm" id="rotateKey">Rotate</button>
			<button class="btn danger sm" id="removeKey">Remove</button>`;
	} else {
		el.innerHTML = `<p class="muted" style="font-size:13px;margin:0 0 12px">No bypass key set. Endpoints charge every caller.</p><button class="btn" id="rotateKey">Generate key</button>`;
	}
	const rot = $('#rotateKey');
	if (rot) rot.addEventListener('click', rotateKey);
	const rm = $('#removeKey');
	if (rm) rm.addEventListener('click', removeKey);
}
async function rotateKey() {
	const r = await api('/api/x402-settings?key=rotate', { method: 'POST' });
	if (!r.ok) { toast('Could not rotate key'); return; }
	const d = await r.json();
	state.settings.api_bypass_key_hint = d.hint;
	$('#apikey-body').innerHTML = `
		<div class="banner ok" style="flex-direction:column;align-items:stretch">
			<b>Your new key — shown once. Store it now.</b>
			<div class="kv" style="margin-top:8px;background:rgba(0,0,0,.25)">${esc(d.key)}<button class="copy" data-copy="${esc(d.key)}">copy</button></div>
		</div>
		<button class="btn ghost sm" id="ackKey">Done</button>`;
	$('#ackKey').addEventListener('click', renderApiKey);
	wireCopies();
}
async function removeKey() {
	if (!confirm('Remove the bypass key? Subscribers using it will start being charged.')) return;
	const r = await api('/api/x402-settings?key=1', { method: 'DELETE' });
	if (r.ok) { state.settings.api_bypass_key_hint = null; renderApiKey(); toast('Key removed'); }
}
function wireSecurity() {
	$('#corsForm').addEventListener('submit', async (e) => {
		e.preventDefault();
		const v = $('#cors-input').value.trim();
		if (!/^https?:\/\/[^/\s]+$/.test(v) || !(v.startsWith('https://') || v.startsWith('http://localhost'))) { toast('Enter an https origin'); return; }
		const list = state.settings.cors_origins || [];
		if (list.includes(v)) { toast('Already added'); return; }
		state.settings.cors_origins = [...list, v];
		if (await saveSettings('Origin added')) { $('#cors-input').value = ''; renderCors(); }
	});
}

// ──────────────────────────────────────────────────────────────── savers ──
function wireSavers() {
	$('#savePayouts').addEventListener('click', async () => {
		const evm = $('#p-evm').value.trim();
		const sol = $('#p-sol').value.trim();
		if (evm && !/^0x[0-9a-fA-F]{40}$/.test(evm)) { toast('Base address must be 0x…'); return; }
		if (sol && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(sol)) { toast('Invalid Solana address'); return; }
		state.settings.payout_evm = evm;
		state.settings.payout_solana = sol;
		state.settings.facilitator = $('#p-facilitator').value.trim();
		const nets = [];
		if ($('#net-base').checked) nets.push('base');
		if ($('#net-solana').checked) nets.push('solana');
		state.settings.networks = nets.length ? nets : ['base', 'solana'];
		await saveSettings('Payouts saved');
	});

	$('#saveSecurity').addEventListener('click', async () => {
		state.settings.security = {
			require_siwx: $('#s-siwx').checked,
			per_payment_cap_usdc: Math.max(0, Number($('#s-percap').value) || 0),
			daily_cap_usdc: Math.max(0, Number($('#s-daycap').value) || 0),
		};
		await saveSettings('Security saved');
	});

	$('#saveBrand').addEventListener('click', async () => {
		state.settings.business_name = $('#br-business').value.trim();
		state.settings.support_email = $('#br-email').value.trim();
		state.settings.brand = {
			...state.settings.brand,
			merchant: $('#br-merchant').value.trim(),
			logo_url: $('#br-logo').value.trim(),
			accent: $('#br-accentHex').value.trim() || '#0a84ff',
			footer_note: $('#br-footer').value.trim(),
			theme: state.settings.brand.theme || 'auto',
		};
		await saveSettings('Branding saved');
	});

	// keep color + hex inputs in sync
	syncColor('#br-accent', '#br-accentHex');
	syncColor('#b-accent', '#b-accentHex', (v) => { builder.accent = v; buildSnippet(); });
	$('#wallets-refresh').addEventListener('click', loadBridge);
}
function syncColor(colorSel, hexSel, after) {
	const c = $(colorSel), h = $(hexSel);
	c.addEventListener('input', () => { h.value = c.value; after && after(c.value); });
	h.addEventListener('input', () => { if (/^#[0-9a-fA-F]{6}$/.test(h.value)) { c.value = h.value; after && after(h.value); } });
}

// global copy delegation
function wireCopies() {
	$$('[data-copy]').forEach((b) => {
		if (b._wired) return; b._wired = true;
		b.addEventListener('click', () => copy(b.dataset.copy));
	});
}
document.addEventListener('click', (e) => {
	const t = e.target.closest('[data-copy]');
	if (t) copy(t.dataset.copy);
});

// ─────────────────────────────────────────────────────────────── builder ──
const builder = { size: 'md', shape: 'pill', accent: '#0a84ff', text: 'light', zap: true, full: false, layout: 'inline', bg: 'dark', label: 'Pay & run', corner: 'br' };

function wireBuilder() {
	seg('#b-size', (v) => { builder.size = v; buildSnippet(); });
	seg('#b-shape', (v) => { builder.shape = v; buildSnippet(); });
	seg('#b-text', (v) => { builder.text = v; buildSnippet(); });
	seg('#b-layout', (v) => {
		builder.layout = v;
		$('#b-canvas').dataset.layout = v;
		$('.drag-hint').style.display = v === 'floating' ? 'block' : 'none';
		if (v === 'floating') positionFloating();
		else { $('#b-canvas').style.alignItems = ''; $('#b-canvas').style.justifyContent = ''; }
		buildSnippet();
	});
	seg('#b-bg', (v) => { builder.bg = v; $('#b-canvas').classList.toggle('light-bg', v === 'light'); });
	$('#b-zap').addEventListener('change', (e) => { builder.zap = e.target.checked; buildSnippet(); });
	$('#b-full').addEventListener('change', (e) => { builder.full = e.target.checked; buildSnippet(); });
	$('#b-label').addEventListener('input', (e) => { builder.label = e.target.value || 'Pay'; buildSnippet(); });
	$('#b-method').addEventListener('change', (e) => { $('#b-bodyWrap').style.display = e.target.value === 'POST' ? 'block' : 'none'; buildSnippet(); });
	['#b-endpoint', '#b-merchant', '#b-body'].forEach((s) => $(s).addEventListener('input', buildSnippet));
	$('#b-product').addEventListener('change', onBuilderProduct);
	$('#b-copy').addEventListener('click', () => copy($('#b-snippet').textContent, 'Snippet copied'));
	$('#b-savePreset').addEventListener('click', saveBuilderPreset);
	$('#b-preview').addEventListener('click', previewPay);
	enableDrag();
	$('.drag-hint').style.display = 'none';
	buildSnippet();
}
function seg(sel, cb) {
	$$(sel + ' button').forEach((b) => b.addEventListener('click', () => {
		$$(sel + ' button').forEach((x) => x.classList.toggle('on', x === b));
		cb(b.dataset.v);
	}));
}
function updateBuilderProducts() {
	const sel = $('#b-product');
	const cur = sel.value;
	sel.innerHTML = `<option value="">Custom endpoint…</option>` + state.skus.map((s) => `<option value="${esc(s.id)}">${esc(s.action_name)} — ${esc(s.merchant_name)}</option>`).join('');
	if (state.skus.find((s) => s.id === cur)) sel.value = cur;
}
function onBuilderProduct() {
	const id = $('#b-product').value;
	const sku = state.skus.find((s) => s.id === id);
	$('#b-custom').style.display = id ? 'none' : 'block';
	if (sku) prefillBuilderFromSku(sku, true);
	buildSnippet();
}
function prefillBuilderFromSku(sku, silent) {
	$('#b-product').value = sku.id;
	$('#b-custom').style.display = 'none';
	$('#b-endpoint').value = sku.target_endpoint;
	$('#b-method').value = sku.target_method;
	$('#b-merchant').value = sku.merchant_name;
	builder.accent = sku.accent_color || builder.accent;
	$('#b-accent').value = builder.accent; $('#b-accentHex').value = builder.accent;
	builder.label = sku.action_name;
	$('#b-label').value = sku.action_name;
	if (!silent) buildSnippet();
}
function builderOpts() {
	const id = $('#b-product').value;
	const sku = state.skus.find((s) => s.id === id);
	const endpoint = sku ? sku.target_endpoint : $('#b-endpoint').value.trim();
	const method = sku ? sku.target_method : $('#b-method').value;
	const merchant = sku ? sku.merchant_name : ($('#b-merchant').value.trim() || state.settings.brand.merchant || 'Payment');
	let body = null;
	if (method === 'POST') {
		if (sku) body = sku.target_body || null;
		else { const raw = $('#b-body').value.trim(); if (raw) { try { body = JSON.parse(raw); } catch { body = '__INVALID__'; } } }
	}
	return { endpoint, method, merchant, action: builder.label, body, slug: sku ? sku.slug : null };
}
function btnStyle() {
	const sizes = { sm: ['8px 14px', '13px', '1em'], md: ['11px 20px', '14.5px', '1.05em'], lg: ['14px 26px', '16px', '1.1em'] };
	const radii = { pill: '999px', rounded: '12px', square: '6px' };
	const [pad, fs] = sizes[builder.size];
	const color = builder.text === 'light' ? '#ffffff' : '#0b0b0b';
	return `background:${builder.accent};color:${color};border:0;font:600 ${fs}/1 -apple-system,BlinkMacSystemFont,Inter,'Segoe UI',sans-serif;padding:${pad};border-radius:${radii[builder.shape]};cursor:pointer;display:inline-flex;align-items:center;gap:8px;${builder.full ? 'width:100%;justify-content:center;' : ''}`;
}
function renderPreviewButton() {
	const btn = $('#b-preview');
	btn.style.cssText = btnStyle() + 'box-shadow:0 4px 16px -4px ' + builder.accent + '99;';
	btn.innerHTML = (builder.zap ? '<span class="zap">⚡</span> ' : '') + esc(builder.label);
}
function buildSnippet() {
	renderPreviewButton();
	const o = builderOpts();
	const attrs = [];
	const ep = o.endpoint || 'https://your-api.com/paid/endpoint';
	attrs.push(`data-x402-endpoint="${esc(ep)}"`);
	if (o.method && o.method !== 'GET') attrs.push(`data-x402-method="${esc(o.method)}"`);
	if (o.body && o.body !== '__INVALID__') attrs.push(`data-x402-body='${esc(JSON.stringify(o.body))}'`);
	if (o.merchant) attrs.push(`data-x402-merchant="${esc(o.merchant)}"`);
	attrs.push(`data-x402-action="${esc(builder.label)}"`);
	const label = (builder.zap ? '⚡ ' : '') + builder.label;
	const button = `<button\n  ${attrs.join('\n  ')}\n  style="${btnStyle()}">${esc(label)}</button>`;

	let inner = button;
	if (builder.layout === 'center') inner = `<div style="text-align:center">\n  ${button.replace(/\n/g, '\n  ')}\n</div>`;
	else if (builder.layout === 'floating') {
		const pos = { br: 'right:20px;bottom:20px', bl: 'left:20px;bottom:20px', tr: 'right:20px;top:20px', tl: 'left:20px;top:20px' }[builder.corner];
		inner = `<div style="position:fixed;${pos};z-index:9999">\n  ${button.replace(/\n/g, '\n  ')}\n</div>`;
	}
	const snippet = `<!-- three.ws · x402 pay button -->\n<script type="module" src="https://three.ws/x402.js"><\/script>\n${inner}`;
	$('#b-snippet').textContent = snippet;
}
async function previewPay() {
	if (suppressPreviewClick) return;
	const o = builderOpts();
	if (!o.endpoint) { toast('Pick a product or enter an endpoint first'); showView('builder'); return; }
	if (o.body === '__INVALID__') { toast('POST body is not valid JSON'); return; }
	try {
		const mod = await import('/x402.js');
		await mod.pay({ endpoint: o.endpoint, method: o.method, body: o.body || undefined, merchant: o.merchant, action: o.action });
	} catch (err) {
		if (err && err.code === 'cancelled') return;
		toast(err?.message || 'Checkout error');
	}
}
async function saveBuilderPreset() {
	state.settings.builder = {
		size: builder.size, shape: builder.shape, accent: builder.accent, text: builder.text,
		zap: builder.zap, full: builder.full, layout: builder.layout, label: builder.label, corner: builder.corner,
	};
	if (await saveSettings('Button saved')) toast('Saved as your default button');
}
function applyBuilderPreset(p) {
	Object.assign(builder, p);
	$('#b-label').value = builder.label || 'Pay & run';
	$('#b-accent').value = builder.accent; $('#b-accentHex').value = builder.accent;
	$('#b-zap').checked = builder.zap !== false;
	$('#b-full').checked = !!builder.full;
	setSeg('#b-size', builder.size); setSeg('#b-shape', builder.shape);
	setSeg('#b-text', builder.text); setSeg('#b-layout', builder.layout);
	$('#b-canvas').dataset.layout = builder.layout;
	buildSnippet();
}
function setSeg(sel, v) { $$(sel + ' button').forEach((b) => b.classList.toggle('on', b.dataset.v === v)); }

// drag the preview button — corner-snaps in floating layout
let suppressPreviewClick = false;
function enableDrag() {
	const btn = $('#b-preview');
	const canvas = $('#b-canvas');
	let drag = null;
	btn.addEventListener('pointerdown', (e) => {
		if (builder.layout !== 'floating') return;
		drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
		btn.setPointerCapture(e.pointerId);
		e.preventDefault();
	});
	btn.addEventListener('pointerup', (e) => {
		if (!drag) return;
		const moved = Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6;
		drag = null;
		if (!moved) return; // treat as a click → previewPay
		suppressPreviewClick = true;
		setTimeout(() => { suppressPreviewClick = false; }, 50);
		const r = canvas.getBoundingClientRect();
		const x = e.clientX - r.left, y = e.clientY - r.top;
		builder.corner = (y < r.height / 2 ? 't' : 'b') + (x < r.width / 2 ? 'l' : 'r');
		positionFloating();
		buildSnippet();
	});
}
function positionFloating() {
	const canvas = $('#b-canvas');
	canvas.style.alignItems = builder.corner[0] === 't' ? 'flex-start' : 'flex-end';
	canvas.style.justifyContent = builder.corner[1] === 'l' ? 'flex-start' : 'flex-end';
}

boot();
