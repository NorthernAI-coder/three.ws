// Launch Studio — the catalog of coin-launch use cases and a LIVE preview of
// what each would mint right now. Reads /api/pump/launch-studio (list + preview)
// and hands each previewed coin to the existing /launch wizard via a deep-link,
// so discovery → preview → mint runs end to end on the real launch path.
//
// Entry: mountLaunchStudio(root) → { teardown }

const API = '/api/pump/launch-studio';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
	({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const CATEGORY_META = {
	github: { label: 'GitHub', icon: '⌥', blurb: 'Reward coins for trending repos & creators' },
	onchain: { label: 'Onchain', icon: '◎', blurb: 'pump.fun venue signals & hot sectors' },
	news: { label: 'News', icon: '◈', blurb: 'Tech zeitgeist & real-time attention' },
	culture: { label: 'Culture', icon: '✦', blurb: 'Memes & community pulse' },
	events: { label: 'Events', icon: '★', blurb: 'What the world is looking up' },
	community: { label: 'Community', icon: '⬡', blurb: 'Builders, ecosystems & blends' },
};

const CSS = `
.ls{--g:rgba(255,255,255,.07);--g2:rgba(255,255,255,.12);color:#fff}
.ls-bar{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;margin-bottom:1.2rem}
.ls-chip{display:inline-flex;align-items:center;gap:.4rem;font-size:.76rem;font-weight:600;padding:.4rem .7rem;border-radius:999px;cursor:pointer;
  background:rgba(255,255,255,.04);border:1px solid var(--g);color:rgba(255,255,255,.62);transition:all .15s;white-space:nowrap}
.ls-chip:hover{color:#fff;border-color:var(--g2)}
.ls-chip.on{background:rgba(164,240,188,.1);border-color:rgba(164,240,188,.4);color:#c8f0d8}
.ls-chip .ls-chip-n{font-size:.66rem;opacity:.6;font-weight:500}
.ls-count{margin-left:auto;font-size:.72rem;color:rgba(255,255,255,.36)}
.ls-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:.7rem}
.ls-card{display:flex;flex-direction:column;gap:.5rem;padding:.85rem .9rem;border-radius:13px;cursor:pointer;text-align:left;
  background:rgba(255,255,255,.025);border:1px solid var(--g);transition:all .15s;position:relative;overflow:hidden}
.ls-card:hover{background:rgba(255,255,255,.05);border-color:var(--g2);transform:translateY(-1px)}
.ls-card:focus-visible{outline:2px solid rgba(164,240,188,.6);outline-offset:2px}
.ls-card.on{border-color:rgba(164,240,188,.5);background:rgba(164,240,188,.05)}
.ls-card-top{display:flex;align-items:center;gap:.5rem}
.ls-card-ic{font-size:.85rem;color:rgba(255,255,255,.5)}
.ls-card-t{font-size:.86rem;font-weight:650;letter-spacing:-.01em;line-height:1.25;flex:1;min-width:0}
.ls-mode{font-size:.58rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:.16rem .42rem;border-radius:999px;flex-shrink:0}
.ls-mode.attribution{color:#a8c4f0;background:rgba(120,160,240,.12);border:1px solid rgba(120,160,240,.3)}
.ls-mode.narrative{color:#d8c8a8;background:rgba(240,210,140,.1);border:1px solid rgba(240,210,140,.28)}
.ls-card-d{font-size:.72rem;color:rgba(255,255,255,.5);line-height:1.5}
.ls-card-r{font-size:.66rem;color:#9fdcb4;display:flex;align-items:center;gap:.35rem;margin-top:auto}
.ls-card-r.creator{color:rgba(255,255,255,.42)}

.ls-prev{margin-top:1.5rem;border-top:1px solid var(--g);padding-top:1.3rem}
.ls-prev-h{display:flex;align-items:center;gap:.6rem;margin-bottom:.3rem;flex-wrap:wrap}
.ls-prev-h h3{font-size:1rem;font-weight:700;letter-spacing:-.02em;margin:0}
.ls-prev-sub{font-size:.76rem;color:rgba(255,255,255,.45);margin:0 0 1rem;line-height:1.5}
.ls-prev-sub b{color:rgba(255,255,255,.7)}
.ls-refresh{margin-left:auto;font-size:.72rem;font-weight:600;padding:.34rem .7rem;border-radius:8px;cursor:pointer;
  background:rgba(255,255,255,.05);border:1px solid var(--g2);color:rgba(255,255,255,.75)}
.ls-refresh:hover{background:rgba(255,255,255,.1);color:#fff}
.ls-coins{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:.6rem}
.ls-coin{display:flex;flex-direction:column;gap:.55rem;padding:.8rem;border-radius:12px;
  background:rgba(255,255,255,.03);border:1px solid var(--g)}
.ls-coin-top{display:flex;align-items:center;gap:.6rem}
.ls-coin-img{width:38px;height:38px;border-radius:9px;object-fit:cover;background:rgba(255,255,255,.06);flex-shrink:0}
.ls-coin-id{flex:1;min-width:0}
.ls-coin-n{font-size:.88rem;font-weight:700;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ls-coin-s{font-size:.68rem;color:rgba(255,255,255,.45);font-family:ui-monospace,monospace}
.ls-coin-d{font-size:.71rem;color:rgba(255,255,255,.55);line-height:1.5;min-height:2.1em}
.ls-coin-meta{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;font-size:.66rem}
.ls-tag{color:rgba(255,255,255,.4);background:rgba(255,255,255,.04);border:1px solid var(--g);padding:.16rem .42rem;border-radius:6px}
.ls-tag.reward{color:#9fdcb4;background:rgba(164,240,188,.07);border-color:rgba(164,240,188,.2)}
.ls-tag.reward.pending{color:#c8b78a;background:rgba(240,210,140,.07);border-color:rgba(240,210,140,.2)}
.ls-coin-go{margin-top:.15rem;display:flex;align-items:center;justify-content:center;gap:.4rem;font-size:.76rem;font-weight:650;
  padding:.5rem;border-radius:9px;cursor:pointer;text-decoration:none;
  background:linear-gradient(135deg,rgba(120,200,140,.22),rgba(60,140,100,.14));border:1px solid rgba(120,200,140,.42);color:#d2f3df;transition:all .15s}
.ls-coin-go:hover{background:linear-gradient(135deg,rgba(120,200,140,.34),rgba(60,140,100,.22));border-color:rgba(120,200,140,.65)}

.ls-skel{border-radius:13px;background:linear-gradient(100deg,rgba(255,255,255,.03) 30%,rgba(255,255,255,.07) 50%,rgba(255,255,255,.03) 70%);
  background-size:200% 100%;animation:ls-sh 1.3s linear infinite;height:118px}
@keyframes ls-sh{to{background-position:-200% 0}}
.ls-msg{padding:1.4rem;text-align:center;font-size:.82rem;color:rgba(255,255,255,.5);border:1px dashed var(--g2);border-radius:12px;line-height:1.6}
.ls-msg b{color:#fff;display:block;margin-bottom:.3rem;font-size:.9rem}
.ls-err{color:#f6b3b3;border-color:rgba(246,179,179,.25)}
.ls-spin{display:inline-block;width:13px;height:13px;border:2px solid rgba(255,255,255,.15);border-top-color:#a4f0bc;border-radius:50%;animation:ls-r .8s linear infinite;vertical-align:-2px}
@keyframes ls-r{to{transform:rotate(360deg)}}
@media(max-width:560px){.ls-grid,.ls-coins{grid-template-columns:1fr}}
`;

export function mountLaunchStudio(root) {
	if (!document.getElementById('ls-css')) {
		const st = document.createElement('style'); st.id = 'ls-css'; st.textContent = CSS; document.head.appendChild(st);
	}
	const s = {
		cats: [], useCases: [], total: 0, activeCat: 'all',
		listLoading: true, listError: '',
		activeId: null, preview: null, previewLoading: false, previewError: '',
	};
	let alive = true;

	async function loadList() {
		s.listLoading = true; s.listError = ''; render();
		try {
			const r = await fetch(`${API}?action=list`, { headers: { accept: 'application/json' } });
			const d = await r.json();
			if (!r.ok) throw new Error(d.error_description || d.error || `HTTP ${r.status}`);
			s.cats = d.categories || []; s.useCases = d.use_cases || []; s.total = d.count || s.useCases.length;
		} catch (e) { s.listError = e.message || String(e); }
		s.listLoading = false; render();
	}

	async function preview(id) {
		s.activeId = id; s.preview = null; s.previewError = ''; s.previewLoading = true; render();
		try {
			const r = await fetch(`${API}?action=preview&id=${encodeURIComponent(id)}&limit=6`, { headers: { accept: 'application/json' } });
			const d = await r.json();
			if (!r.ok) throw new Error(d.error_description || d.error || `HTTP ${r.status}`);
			if (!alive) return;
			s.preview = d;
		} catch (e) { s.previewError = e.message || String(e); }
		s.previewLoading = false; render();
	}

	function launchHref(item) {
		const p = new URLSearchParams();
		p.set('name', item.identity.name);
		if (item.identity.symbol) p.set('symbol', item.identity.symbol);
		if (item.identity.description) p.set('description', item.identity.description);
		if (item.identity.image) p.set('image', item.identity.image);
		return `/launch?${p.toString()}`;
	}

	function rewardChip(reward) {
		if (reward.kind === 'github-owner' && reward.github_username) {
			return `<span class="ls-tag reward pending" title="${esc(reward.note || '')}">→ @${esc(reward.github_username)}</span>`;
		}
		if (reward.kind === 'split') return `<span class="ls-tag reward pending" title="${esc(reward.note || '')}">→ split</span>`;
		if (reward.kind === 'address') return `<span class="ls-tag reward">→ wallet</span>`;
		return `<span class="ls-tag">creator fees</span>`;
	}

	function visibleUseCases() {
		return s.activeCat === 'all' ? s.useCases : s.useCases.filter((u) => u.category === s.activeCat);
	}

	function render() {
		if (!alive) return;
		root.innerHTML = `<div class="ls">${renderBar()}${renderCatalog()}${renderPreview()}</div>`;
		wire();
	}

	function renderBar() {
		if (s.listLoading || s.listError) return '';
		const chip = (id, label, n) =>
			`<button class="ls-chip${s.activeCat === id ? ' on' : ''}" data-cat="${esc(id)}">${esc(label)}${n != null ? ` <span class="ls-chip-n">${n}</span>` : ''}</button>`;
		const cats = s.cats.map((c) => {
			const meta = CATEGORY_META[c] || { label: c, icon: '' };
			const n = s.useCases.filter((u) => u.category === c).length;
			return chip(c, `${meta.icon} ${meta.label}`.trim(), n);
		}).join('');
		return `<div class="ls-bar">${chip('all', 'All', s.total)}${cats}<span class="ls-count">${s.total} use cases</span></div>`;
	}

	function renderCatalog() {
		if (s.listLoading) return `<div class="ls-grid">${Array.from({ length: 9 }, () => '<div class="ls-skel"></div>').join('')}</div>`;
		if (s.listError) return `<div class="ls-msg ls-err"><b>Couldn't load the catalog</b>${esc(s.listError)} — <button class="ls-refresh" id="ls-retry">Retry</button></div>`;
		const items = visibleUseCases();
		if (!items.length) return `<div class="ls-msg"><b>Nothing here yet</b>No use cases in this category.</div>`;
		return `<div class="ls-grid">${items.map(renderCard).join('')}</div>`;
	}

	function renderCard(u) {
		const meta = CATEGORY_META[u.category] || { icon: '' };
		const attribution = u.mode === 'attribution';
		return `<button class="ls-card${s.activeId === u.id ? ' on' : ''}" data-id="${esc(u.id)}">
			<div class="ls-card-top">
				<span class="ls-card-ic">${esc(meta.icon)}</span>
				<span class="ls-card-t">${esc(u.title)}</span>
				<span class="ls-mode ${attribution ? 'attribution' : 'narrative'}">${attribution ? 'reward' : 'theme'}</span>
			</div>
			<div class="ls-card-d">${esc(u.description)}</div>
			<div class="ls-card-r${attribution ? '' : ' creator'}">${attribution ? '🎁 ' : ''}${esc(u.reward_label || (attribution ? 'Routes fees to the subject' : 'Creator fees'))}</div>
		</button>`;
	}

	function renderPreview() {
		if (!s.activeId) return '';
		const uc = s.useCases.find((u) => u.id === s.activeId);
		const title = uc ? uc.title : s.activeId;
		let body;
		if (s.previewLoading) body = `<div class="ls-coins">${Array.from({ length: 3 }, () => '<div class="ls-skel" style="height:150px"></div>').join('')}</div>`;
		else if (s.previewError) body = `<div class="ls-msg ls-err"><b>Preview failed</b>${esc(s.previewError)} — <button class="ls-refresh" id="ls-reload">Retry</button></div>`;
		else if (!s.preview || !s.preview.items.length) body = `<div class="ls-msg"><b>No live candidates right now</b>This source is quiet at the moment — try another use case or refresh in a bit.</div>`;
		else body = `<div class="ls-coins">${s.preview.items.map(renderCoin).join('')}</div>`;
		const live = s.preview && s.preview.items.length ? `<span class="ls-prev-sub" style="margin:0"><b>${s.preview.items.length}</b> live candidate${s.preview.items.length === 1 ? '' : 's'}</span>` : '';
		return `<div class="ls-prev">
			<div class="ls-prev-h"><h3>${esc(title)}</h3>${live}<button class="ls-refresh" id="ls-reload">↻ Refresh</button></div>
			<p class="ls-prev-sub">Coins this use case would mint <b>right now</b>, from live data. Each is a real launch — hit <b>Launch</b> to open the wizard prefilled.</p>
			${body}
		</div>`;
	}

	function renderCoin(it) {
		const img = it.identity.image
			? `<img class="ls-coin-img" src="${esc(it.identity.image)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />`
			: `<div class="ls-coin-img"></div>`;
		const signal = it.signal && it.signal.detail ? `<span class="ls-tag">${esc(it.signal.detail)}</span>` : '';
		return `<div class="ls-coin">
			<div class="ls-coin-top">
				${img}
				<div class="ls-coin-id">
					<div class="ls-coin-n">${esc(it.identity.name)}</div>
					<div class="ls-coin-s">$${esc(it.identity.symbol)}</div>
				</div>
			</div>
			<div class="ls-coin-d">${esc(it.identity.description || '')}</div>
			<div class="ls-coin-meta">${rewardChip(it.reward)}${signal}</div>
			<a class="ls-coin-go" href="${esc(launchHref(it))}">Launch this coin →</a>
		</div>`;
	}

	function wire() {
		root.querySelector('#ls-retry')?.addEventListener('click', loadList);
		root.querySelector('#ls-reload')?.addEventListener('click', () => preview(s.activeId));
		root.querySelectorAll('.ls-chip').forEach((el) => el.addEventListener('click', () => { s.activeCat = el.dataset.cat; render(); }));
		root.querySelectorAll('.ls-card').forEach((el) => el.addEventListener('click', () => preview(el.dataset.id)));
	}

	render();
	loadList();
	return { teardown() { alive = false; root.innerHTML = ''; } };
}
