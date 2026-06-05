/**
 * Marketplace-feature enrichment for the canonical /agents/:id detail page.
 *
 * The lean page (agent-detail.js) renders on-chain identity, wallet, memory,
 * actions, reputation and reviews. This module layers the discovery + commerce
 * features that previously only lived on the marketplace SPA's detail view, so
 * a single canonical agent page is the superset of both:
 *
 *   - 3D avatar viewer (model-viewer) in the hero
 *   - author / published / category / views / forks metadata
 *   - fork · bookmark · export-JSON hero actions
 *   - live "try it now" chat preview (reused from marketplace-detail.js)
 *   - creator profile modal (reused from marketplace-detail.js)
 *   - per-skill pricing (purchase · trial · time-pass) via the shared engine
 *   - whole-agent sale / buy panel (asset-price + payout wallet)
 *   - embed snippets (web component · iframe · direct link)
 *   - similar agents + version history
 *
 * Data comes from /api/marketplace/agents/:id (the same aggregate the SPA used).
 * If that endpoint 404s — agent not published to the marketplace — enrichment is
 * silently skipped and the base page is unaffected.
 */

import {
	startPreviewSession,
	bindDetailExtras,
} from './marketplace-detail.js';
import {
	configureSkillPurchase,
	openPurchaseFlow,
	openTrialFlow,
	openTimePassFlow,
	openAssetPurchaseFlow,
	formatAssetPrice,
	apiPostWithCsrf,
	USDC_MAINNET_MINT,
} from './shared/skill-purchase.js';
import { log } from './shared/log.js';

const API = '/api';
const $ = (id) => document.getElementById(id);

const CATEGORY_LABELS = {
	academic: 'Academic', career: 'Career', copywriting: 'Copywriting', design: 'Design',
	education: 'Education', emotions: 'Emotions', entertainment: 'Entertainment', games: 'Games',
	general: 'General', life: 'Life', marketing: 'Marketing', office: 'Office',
	programming: 'Programming', translation: 'Translation', blockchain: 'Blockchain',
};

function escapeHtml(s) {
	return String(s ?? '').replace(
		/[&<>"']/g,
		(ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
	);
}
function initial(name) {
	const s = String(name || '?').trim();
	return s ? s[0].toUpperCase() : '?';
}
function formatDate(iso) {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtNumber(n) {
	const v = Number(n) || 0;
	if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
	if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
	return String(v);
}

// Module-scoped current agent — the shared purchase engine reads it via getAgent.
let marketAgent = null;
let isOwner = false;
const purchasedSkills = new Set();

// ── Entry ────────────────────────────────────────────────────────────────────

export async function enrichAgentDetail(baseAgent) {
	if (!baseAgent?.id) return;
	isOwner = !!baseAgent.isOwner;

	let market;
	try {
		const r = await fetch(`${API}/marketplace/agents/${encodeURIComponent(baseAgent.id)}`, {
			credentials: 'include',
		});
		if (!r.ok) return; // not published to marketplace — base page stands alone
		const j = await r.json();
		market = j?.data?.agent;
	} catch (e) {
		log.warn('[agent-detail-market] enrich fetch failed:', e.message);
		return;
	}
	if (!market) return;
	marketAgent = market;
	(market.purchased_skills || []).forEach((s) => purchasedSkills.add(s));

	configureSkillPurchase({
		getAgent: () => marketAgent,
		onPurchased: reloadPurchases,
	});

	render3DAvatar(market);
	renderMeta(market);
	renderHeroActions(baseAgent, market);
	renderSalePanel(baseAgent, market);
	renderPricing(market);
	renderEmbed(market);
	startPreviewSession(market);
	const preview = $('ad-preview-card');
	if (preview) preview.hidden = false;

	// Reuse the marketplace module's preview-form + creator-modal wiring. navTo
	// routes the creator's mini-cards to the canonical /agents/:id page directly
	// (skipping the legacy /marketplace redirect hop).
	bindDetailExtras({
		navTo: (path) => {
			location.href = path.replace(/^\/marketplace\/agents\//, '/agents/');
		},
	});

	loadSimilar(baseAgent.id);
	loadVersions(baseAgent.id);
	bindPurchaseDelegation();
}

// Re-fetch owned-skills after a purchase / trial and re-render the pricing card.
async function reloadPurchases(agentId) {
	try {
		const r = await fetch(`${API}/marketplace/agents/${encodeURIComponent(agentId)}`, {
			credentials: 'include',
		});
		if (!r.ok) return;
		const j = await r.json();
		const fresh = j?.data?.agent;
		if (!fresh) return;
		marketAgent = fresh;
		purchasedSkills.clear();
		(fresh.purchased_skills || []).forEach((s) => purchasedSkills.add(s));
		renderPricing(fresh);
	} catch (e) {
		log.warn('[agent-detail-market] reloadPurchases failed:', e.message);
	}
}

// ── 3D avatar ────────────────────────────────────────────────────────────────

function render3DAvatar(a) {
	if (!a.avatar_glb_url) return;
	const img = $('ad-avatar');
	if (!img || img.dataset.mv === '1') return;

	const mv = document.createElement('model-viewer');
	mv.id = 'ad-avatar-3d';
	mv.className = 'ad-hero-avatar ad-hero-avatar-3d';
	mv.setAttribute('src', a.avatar_glb_url);
	mv.setAttribute('alt', a.name || 'Agent avatar');
	mv.setAttribute('auto-rotate', '');
	mv.setAttribute('rotation-per-second', '20deg');
	mv.setAttribute('interaction-prompt', 'none');
	mv.setAttribute('camera-controls', '');
	mv.setAttribute('disable-zoom', '');
	mv.setAttribute('disable-pan', '');
	mv.setAttribute('exposure', '1');
	mv.setAttribute('shadow-intensity', '0.4');
	mv.setAttribute('tone-mapping', 'aces');
	mv.setAttribute('loading', 'eager');
	if (a.thumbnail_url) mv.setAttribute('poster', a.thumbnail_url);
	img.dataset.mv = '1';
	img.replaceWith(mv);
}

// ── Hero metadata ─────────────────────────────────────────────────────────────

function renderMeta(a) {
	const row = $('ad-market-meta');
	if (!row) return;
	const author = a.author_name || 'Anonymous';
	const published = a.published_at || a.created_at;
	const views = a.views_count ?? 0;
	const forks = a.forks_count ?? 0;

	const authorBtn = $('d-author');
	if (authorBtn) {
		authorBtn.textContent = author;
		if (a.author_id) {
			authorBtn.dataset.creatorId = a.author_id;
			authorBtn.disabled = false;
		} else {
			delete authorBtn.dataset.creatorId;
			authorBtn.disabled = true;
		}
	}
	$('ad-published').textContent = published ? formatDate(published) : '';
	const cat = $('ad-category');
	cat.textContent = CATEGORY_LABELS[a.category] || a.category || 'General';
	$('ad-views').textContent = `⊙ ${fmtNumber(views)}`;
	const forksPill = $('ad-forks-pill');
	if (forks > 0) {
		forksPill.textContent = `⑂ ${fmtNumber(forks)} forks`;
		forksPill.hidden = false;
	} else {
		forksPill.hidden = true;
	}
	row.hidden = false;
}

// ── Hero actions: fork · bookmark · export ────────────────────────────────────

function renderHeroActions(baseAgent, market) {
	const wrap = $('ad-market-actions');
	if (!wrap) return;
	wrap.hidden = false;

	const bookmarkBtn = $('ad-bookmark');
	if (bookmarkBtn) {
		setBookmark(bookmarkBtn, !!market.bookmarked);
		bookmarkBtn.onclick = () => toggleBookmark(baseAgent.id, bookmarkBtn);
	}
	const forkBtn = $('ad-fork');
	if (forkBtn) forkBtn.onclick = () => forkAgent(baseAgent.id);
	const exportBtn = $('ad-export-json');
	if (exportBtn) exportBtn.onclick = () => exportAgentJson(market);
}

function setBookmark(btn, on) {
	btn.classList.toggle('on', on);
	btn.textContent = on ? '★ Saved' : '☆ Save';
	btn.dataset.on = on ? '1' : '0';
	btn.setAttribute('aria-pressed', on ? 'true' : 'false');
}

async function toggleBookmark(agentId, btn) {
	const cur = btn.dataset.on === '1';
	try {
		const r = await fetch(`${API}/marketplace/agents/${agentId}/bookmark`, {
			method: cur ? 'DELETE' : 'POST',
			credentials: 'include',
		});
		if (r.status === 401) {
			location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
			return;
		}
		const j = await r.json();
		setBookmark(btn, !!j?.data?.bookmarked);
	} catch (err) {
		log.error('[agent-detail-market] bookmark', err);
	}
}

async function forkAgent(agentId) {
	const btn = $('ad-fork');
	if (btn) { btn.disabled = true; btn.textContent = 'Forking…'; }
	try {
		const r = await fetch(`${API}/marketplace/agents/${agentId}/fork`, {
			method: 'POST',
			credentials: 'include',
		});
		if (r.status === 401) {
			location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
			return;
		}
		const j = await r.json();
		if (!r.ok) throw new Error(j?.error_description || 'Fork failed');
		const newId = j?.data?.agent?.id;
		if (newId) location.href = `/agents/${newId}`;
	} catch (err) {
		alert(err.message || 'Fork failed');
		if (btn) { btn.disabled = false; btn.textContent = '⑂ Fork & Chat'; }
	}
}

function exportAgentJson(a) {
	const exportable = {
		id: a.id,
		name: a.name,
		description: a.description,
		category: a.category,
		tags: a.tags || [],
		greeting: a.greeting || '',
		system_prompt: a.system_prompt || '',
		capabilities: a.capabilities || {},
		skills: a.skills || a.capabilities?.skills || [],
		fork_of: a.fork_of || null,
		exported_at: new Date().toISOString(),
		source: `https://three.ws/agents/${encodeURIComponent(a.id)}`,
	};
	const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	const slug = (a.name || a.id || 'agent').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	link.download = `${slug || 'agent'}.three-ws.json`;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Agent sale / buy panel ────────────────────────────────────────────────────

function setSaleStatus(el, text, kind) {
	if (!el) return;
	el.textContent = text;
	el.className = 'ad-sale-status' + (kind ? ' ' + kind : '');
}

function renderSalePanel(baseAgent, agent) {
	const card = $('ad-sale-card');
	const panel = $('ad-sale-panel');
	if (!card || !panel) return;
	const price = agent.price || null;

	if (isOwner) {
		card.hidden = false;
		const decimals = Number(price?.mint_decimals ?? 6);
		const currentUsd = price ? String(Number(price.amount) / Math.pow(10, decimals)) : '';
		panel.innerHTML = `
			<div class="ad-sale-eyebrow">Sell this agent</div>
			${price
				? `<div class="ad-sale-price">${escapeHtml(formatAssetPrice(price) || 'Free')}</div>`
				: `<div class="ad-sale-price free">Free</div>`}
			<label class="ad-sale-field">Price
				<span class="ad-sale-input-wrap">
					<input type="number" id="ad-sale-price" min="0" step="0.01" placeholder="0.00" value="${escapeHtml(currentUsd)}" />
					<span class="ad-sale-currency">USDC</span>
				</span>
			</label>
			<label class="ad-sale-field">Solana payout wallet
				<input type="text" id="ad-sale-payout" placeholder="Your Solana address" />
			</label>
			<div class="ad-sale-actions">
				<button class="ad-btn ad-btn-primary" type="button" id="ad-sale-save">${price ? 'Update price' : 'List for sale'}</button>
				${price ? '<button class="ad-btn" type="button" id="ad-sale-clear">Make free</button>' : ''}
			</div>
			<p class="ad-sale-status" id="ad-sale-status"></p>
			<p class="ad-sale-hint">Per-skill prices are set below — this is a single one-time price to fork the whole agent.</p>`;

		fetch(`${API}/billing/payout-wallets`, { credentials: 'include' })
			.then((r) => (r.ok ? r.json() : null))
			.then((j) => {
				const ws = j?.wallets || [];
				const solana = ws.find((w) => w.chain === 'solana' && w.is_default) || ws.find((w) => w.chain === 'solana');
				if (solana?.address) {
					const inp = $('ad-sale-payout');
					if (inp && !inp.value) inp.value = solana.address;
				}
			})
			.catch(() => {});

		$('ad-sale-save')?.addEventListener('click', () => saveAgentPrice(agent.id));
		$('ad-sale-clear')?.addEventListener('click', () => clearAgentPrice(agent.id));
		return;
	}

	if (price) {
		card.hidden = false;
		panel.innerHTML = `
			<div class="ad-sale-eyebrow">For sale</div>
			<div class="ad-sale-price">${escapeHtml(formatAssetPrice(price))}</div>
			<button class="ad-btn ad-btn-primary" type="button" id="ad-sale-buy">Buy agent with USDC</button>
			<p class="ad-sale-status" id="ad-sale-status"></p>
			<p class="ad-sale-hint">One-time purchase grants ownership to fork the whole agent. Per-skill prices below are separate.</p>`;
		$('ad-sale-buy')?.addEventListener('click', () => openAssetPurchaseFlow({
			item_type: 'agent',
			item_id: agent.id,
			label: agent.name || 'Agent',
			price,
		}));
		return;
	}

	card.hidden = true;
}

async function saveAgentPrice(agentId) {
	const priceInput = $('ad-sale-price');
	const payoutInput = $('ad-sale-payout');
	const status = $('ad-sale-status');
	if (!priceInput || !payoutInput) return;
	const usd = Number(priceInput.value || 0);
	const payout = (payoutInput.value || '').trim();
	if (!Number.isFinite(usd) || usd < 0) { setSaleStatus(status, 'Enter a valid price.', 'err'); return; }
	if (usd > 0 && !payout) { setSaleStatus(status, 'A payout wallet is required to charge.', 'err'); return; }

	setSaleStatus(status, 'Saving…');
	try {
		if (payout) {
			const r = await fetch(`${API}/billing/payout-wallets`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ address: payout, chain: 'solana', is_default: true }),
			});
			if (!r.ok && r.status !== 409) {
				const j = await r.json().catch(() => ({}));
				throw new Error(j.error_description || j.error || 'Failed to save payout wallet');
			}
		}
		const amount = Math.round(usd * 1_000_000);
		const r = await apiPostWithCsrf('/api/marketplace/asset-price', {
			item_type: 'agent',
			item_id: agentId,
			amount,
			currency_mint: USDC_MAINNET_MINT,
			chain: 'solana',
			mint_decimals: 6,
		});
		const j = await r.json();
		if (!r.ok) throw new Error(j.error_description || j.error || 'Failed to save price');
		setSaleStatus(status, amount === 0 ? '✓ Agent is now free.' : `✓ Listed for ${usd} USDC.`, 'ok');
		if (marketAgent?.id === agentId) {
			marketAgent.price = j.data.price;
			renderSalePanel(null, marketAgent);
		}
	} catch (err) {
		setSaleStatus(status, err.message || 'Save failed', 'err');
	}
}

async function clearAgentPrice(agentId) {
	const status = $('ad-sale-status');
	setSaleStatus(status, 'Clearing…');
	try {
		const r = await apiPostWithCsrf('/api/marketplace/asset-price', {
			item_type: 'agent',
			item_id: agentId,
			amount: 0,
			currency_mint: USDC_MAINNET_MINT,
			chain: 'solana',
			mint_decimals: 6,
		});
		if (!r.ok) {
			const j = await r.json().catch(() => ({}));
			throw new Error(j.error_description || j.error || 'Failed to clear price');
		}
		setSaleStatus(status, '✓ Agent is now free.', 'ok');
		if (marketAgent?.id === agentId) {
			marketAgent.price = null;
			renderSalePanel(null, marketAgent);
		}
	} catch (err) {
		setSaleStatus(status, err.message || 'Failed', 'err');
	}
}

// ── Per-skill pricing ─────────────────────────────────────────────────────────

function renderPricing(a) {
	const card = $('ad-pricing-card');
	const body = $('ad-pricing-body');
	if (!card || !body) return;

	const caps = a.capabilities || {};
	const skillsArr = Array.isArray(caps.skills) ? caps.skills : a.skills || [];
	const libraryArr = Array.isArray(caps.library) ? caps.library : [];
	const skillPrices = a.skill_prices || {};

	if (!skillsArr.length) { card.hidden = true; return; }
	card.hidden = false;

	// "From $X/call" summary when any skill is priced.
	const priced = Object.values(skillPrices).filter((p) => p && Number(p.amount) > 0);
	const summary = $('ad-pricing-summary');
	if (priced.length) {
		const minAmount = Math.min(...priced.map((p) => Number(p.amount)));
		const decimals = Number(priced[0]?.mint_decimals ?? 6);
		const minUsd = minAmount / Math.pow(10, decimals);
		const formatted = minUsd >= 1 ? minUsd.toFixed(2) : minUsd >= 0.01 ? minUsd.toFixed(3) : minUsd.toFixed(6).replace(/0+$/, '');
		summary.innerHTML = `<span class="ad-pricing-icon">$</span> ${priced.length} paid skill${priced.length === 1 ? '' : 's'} · from <strong>$${escapeHtml(formatted)}/call</strong>`;
		summary.hidden = false;
	} else {
		summary.hidden = true;
	}

	body.innerHTML = skillsArr
		.map((s) => {
			const name = typeof s === 'string' ? s : s.name || '';
			const price = skillPrices[name];
			let badge;
			if (purchasedSkills.has(name)) {
				badge = `<span class="ad-price-badge owned">✓ Owned</span>`;
			} else if (price && Number(price.amount) > 0) {
				const priceInUSDC = (Number(price.amount) / 1e6).toFixed(2);
				const trialUses = price.trial_uses || 0;
				const trialBtn = trialUses > 0
					? `<button class="ad-skill-btn trial-btn" data-skill-name="${escapeHtml(name)}" data-agent-id="${escapeHtml(a.id)}">Try free (${trialUses} left)</button>`
					: '';
				const hasTimePass = price.time_pass_hours && price.time_pass_amount;
				const timePassBtn = hasTimePass
					? (() => {
							const tpHuman = (Number(price.time_pass_amount) / 1e6).toFixed(2);
							return `<button class="ad-skill-btn time-pass-btn" data-skill-name="${escapeHtml(name)}" data-agent-id="${escapeHtml(a.id)}" data-duration="${price.time_pass_hours}">Get ${price.time_pass_hours}h (${tpHuman} USDC)</button>`;
						})()
					: '';
				badge =
					`<span class="ad-price-badge paid">${priceInUSDC} USDC</span>` +
					`<button class="ad-skill-btn purchase-btn" data-skill-name="${escapeHtml(name)}" data-agent-id="${escapeHtml(a.id)}">Purchase</button>` +
					trialBtn + timePassBtn;
			} else {
				badge = `<span class="ad-price-badge free">Free</span>`;
			}
			return `<div class="ad-skill-row"><span class="ad-skill-name">${escapeHtml(name)}</span><span class="ad-skill-actions">${badge}</span></div>`;
		})
		.join('');

	const lib = $('ad-pricing-library');
	if (libraryArr.length) {
		lib.innerHTML =
			`<div class="ad-sub">LIBRARY</div>` +
			libraryArr
				.map((l) => `<span class="ad-chip">${escapeHtml(typeof l === 'string' ? l : l.name || '')}</span>`)
				.join(' ');
		lib.hidden = false;
	} else {
		lib.hidden = true;
	}
}

let purchaseDelegationBound = false;
function bindPurchaseDelegation() {
	if (purchaseDelegationBound) return;
	purchaseDelegationBound = true;
	const body = $('ad-pricing-body');
	if (!body) return;
	body.addEventListener('click', (e) => {
		const target = e.target;
		const skillName = target.dataset?.skillName;
		const agentId = target.dataset?.agentId;
		if (!skillName || !agentId) return;
		if (target.classList.contains('purchase-btn')) {
			openPurchaseFlow(agentId, skillName).catch((err) => log.error('[agent-detail-market] purchase', err));
		} else if (target.classList.contains('trial-btn')) {
			openTrialFlow(agentId, skillName, target).catch((err) => log.error('[agent-detail-market] trial', err));
		} else if (target.classList.contains('time-pass-btn')) {
			const duration = Number(target.dataset.duration);
			if (duration) openTimePassFlow(agentId, skillName, duration, target).catch((err) => log.error('[agent-detail-market] time-pass', err));
		}
	});
}

// ── Embed snippets ────────────────────────────────────────────────────────────

function renderEmbed(a) {
	const card = $('ad-embed-card');
	if (!card) return;
	card.hidden = false;
	const agentId = a.id;
	const glbUrl = a.avatar_glb_url || '';
	const embedPageUrl = `${location.origin}/agents/${agentId}`;
	const iframeSrc = `/agent/${agentId}/embed`;

	const wcSnippet = glbUrl
		? `<script type="module" src="https://three.ws/dist-lib/agent-3d.js"><\/script>\n<agent-3d\n  src="${glbUrl}"\n  agent-id="${agentId}"\n  style="width:480px;height:480px"\n></agent-3d>`
		: `<!-- No 3D avatar attached yet -->`;
	const iframeSnippet = `<iframe\n  src="${iframeSrc}"\n  width="480"\n  height="640"\n  style="border:0;border-radius:14px"\n  allow="autoplay; xr-spatial-tracking"\n></iframe>`;

	$('ad-embed-wc').textContent = wcSnippet;
	$('ad-embed-iframe').textContent = iframeSnippet;
	$('ad-embed-link').textContent = embedPageUrl;

	card.querySelectorAll('.ad-embed-copy').forEach((btn) => {
		btn.onclick = async () => {
			const map = { wc: 'ad-embed-wc', iframe: 'ad-embed-iframe', link: 'ad-embed-link' };
			const src = $(map[btn.dataset.embed]);
			if (!src) return;
			try {
				await navigator.clipboard.writeText(src.textContent);
				btn.textContent = 'Copied ✓';
				btn.classList.add('copied');
				setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1800);
			} catch (_) { /* clipboard unavailable */ }
		};
	});
}

// ── Similar agents ────────────────────────────────────────────────────────────

async function loadSimilar(agentId) {
	const card = $('ad-similar-card');
	const grid = $('ad-similar-grid');
	if (!card || !grid) return;
	try {
		const r = await fetch(`${API}/marketplace/agents/${agentId}/similar`, { credentials: 'include' });
		if (!r.ok) return;
		const j = await r.json();
		const items = j?.data?.agents || j?.data || [];
		if (!Array.isArray(items) || !items.length) return;
		card.hidden = false;
		grid.innerHTML = items
			.slice(0, 8)
			.map((a) => {
				const thumb = a.thumbnail_url
					? `<div class="ad-similar-thumb" style="background-image:url('${escapeHtml(a.thumbnail_url)}')"></div>`
					: `<div class="ad-similar-thumb">${escapeHtml(initial(a.name))}</div>`;
				return `<a class="ad-similar-item" href="/agents/${escapeHtml(a.id)}">
					${thumb}
					<div class="ad-similar-name">${escapeHtml(a.name || 'Untitled')}</div>
					<div class="ad-similar-meta">⊙ ${fmtNumber(a.views_count)} · ⑂ ${fmtNumber(a.forks_count)}</div>
				</a>`;
			})
			.join('');
	} catch (e) {
		log.warn('[agent-detail-market] similar failed:', e.message);
	}
}

// ── Version history ───────────────────────────────────────────────────────────

async function loadVersions(agentId) {
	const card = $('ad-versions-card');
	const list = $('ad-versions-list');
	if (!card || !list) return;
	try {
		const r = await fetch(`${API}/marketplace/agents/${agentId}/versions`, { credentials: 'include' });
		if (!r.ok) return;
		const j = await r.json();
		const versions = j?.data?.versions || j?.data || [];
		if (!Array.isArray(versions) || !versions.length) return;
		card.hidden = false;
		list.innerHTML = versions
			.map(
				(v) => `<li class="ad-version-row">
					<span class="ad-version-tag">v${escapeHtml(String(v.version ?? '?'))}</span>
					<span class="ad-version-log">${escapeHtml(v.changelog || '(no changelog)')}</span>
					<span class="ad-version-when">${escapeHtml(formatDate(v.created_at))}</span>
				</li>`,
			)
			.join('');
	} catch (e) {
		log.warn('[agent-detail-market] versions failed:', e.message);
	}
}
