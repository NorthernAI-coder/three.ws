/**
 * Money Studio — controller (P4)
 * ==============================
 * The economic surface of Agent Studio: fund the agent's wallet, price what it
 * sells, and watch what it earns — all against real custodial wallets and the
 * live skill-pricing + payments APIs (no mocks).
 *
 *   • Wallet    — the agent's real custodial Solana wallet: address, live SOL +
 *                 USDC balance, a copy-to-fund deposit path, and a one-click
 *                 provision for an agent that doesn't have a signing wallet yet.
 *   • Pricing   — per-skill prices (USDC) via /api/agents/:id/pricing/:skill.
 *                 Only metered, sellable skills the agent has enabled appear; a
 *                 skill with no price is free. Cross-links to the Skills tab.
 *   • Earnings  — the real payments ledger (/api/agents/:id/payments) of money
 *                 other agents and users have paid this one.
 *
 * Mount: import { mountMoneyStudio } from './money/money-studio.js';
 *        mountMoneyStudio(container, { studio });
 */

import { apiFetch } from '../../api.js';
import { isSellable, skillMeta } from '../skills/skills-catalog.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
	({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Mainnet USDC — the agent-to-agent x402 settlement asset (6 decimals). Skill
// pricing is denominated in USDC so a buyer agent can pay with a stable rail.
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_DECIMALS = 6;
const BALANCE_POLL_MS = 30000;

const fmtUsdc = (atomic) => (Number(atomic || 0) / 10 ** USDC_DECIMALS);
const toAtomic = (usdc) => Math.round(Number(usdc) * 10 ** USDC_DECIMALS);
const short = (addr) => (addr ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : '');

function relTime(ts) {
	if (!ts) return '';
	const d = Date.now() - new Date(ts).getTime();
	if (d < 60000) return 'just now';
	if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
	if (d < 86400000) return Math.floor(d / 3600000) + 'h ago';
	if (d < 2592000000) return Math.floor(d / 86400000) + 'd ago';
	return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function mountMoneyStudio(container, { studio }) {
	if (container.dataset.moneyMounted) return;
	container.dataset.moneyMounted = '1';
	container.querySelector('.studio-empty')?.remove();
	return new MoneyStudio(container, studio);
}

class MoneyStudio {
	constructor(el, studio) {
		this.el = el;
		this.studio = studio;
		this.agentId = studio.agent?.id;
		this.state = {
			loading: true,
			error: null,
			wallet: null, // { solana_address, solana_balance, usdc_balance, ... }
			prices: {}, // skill → { amount, currency_mint, chain }
			payments: null, // received payments array
			provisioning: false,
		};
		this._render();
		this._load();
		// Live balances while the tab is visible.
		this._poll = setInterval(() => {
			if (document.visibilityState === 'visible' && !this.el.closest('[hidden]')) this._refreshWallet();
		}, BALANCE_POLL_MS);
	}

	_q(sel) { return this.el.querySelector(sel); }

	// ── Data ────────────────────────────────────────────────────────────────

	async _load() {
		this.state.loading = true;
		this._renderBody();
		try {
			const [wallet, prices, payments] = await Promise.all([
				this._fetchWallet(),
				this._fetchPrices(),
				this._fetchPayments(),
			]);
			this.state.wallet = wallet;
			this.state.prices = prices;
			this.state.payments = payments;
			this.state.error = null;
		} catch (err) {
			this.state.error = err?.message || 'Could not load the money studio.';
		} finally {
			this.state.loading = false;
			this._renderBody();
		}
	}

	async _fetchWallet() {
		const res = await apiFetch(`/api/agents/${this.agentId}/wallet`);
		if (!res.ok) throw new Error('Could not read the agent wallet.');
		return res.json();
	}

	async _fetchPrices() {
		const res = await apiFetch(`/api/agents/${this.agentId}/pricing`, { allowAnonymous: true });
		if (!res.ok) return {};
		const { prices = [] } = await res.json();
		const map = {};
		for (const p of prices) map[p.skill] = p;
		return map;
	}

	async _fetchPayments() {
		const res = await apiFetch(`/api/agents/${this.agentId}/payments?direction=received&limit=20`);
		if (!res.ok) return [];
		const { payments = [] } = await res.json();
		return payments;
	}

	async _refreshWallet() {
		try {
			const wallet = await this._fetchWallet();
			this.state.wallet = wallet;
			this._renderWalletBalances();
		} catch { /* transient RPC hiccup — keep the last balances */ }
	}

	// ── Shell ─────────────────────────────────────────────────────────────────

	_render() {
		this.el.innerHTML = `<div class="mny" data-root></div><div class="mny-toast" data-toast hidden></div>`;
	}

	_renderBody() {
		const host = this._q('[data-root]');
		if (this.state.loading) { host.innerHTML = this._skeleton(); return; }
		if (this.state.error) { host.innerHTML = this._errorState(this.state.error); this._bindError(); return; }
		host.innerHTML = `${this._walletSection()}${this._pricingSection()}${this._earningsSection()}`;
		this._bind();
	}

	_skeleton() {
		return `<div class="mny-skel"><div class="mny-skel-card"></div><div class="mny-skel-card"></div><div class="mny-skel-card"></div></div>`;
	}

	_errorState(msg) {
		return `
			<div class="mny-empty">
				<div class="mny-empty-glyph" aria-hidden="true">⚠</div>
				<h3>Couldn’t load money</h3>
				<p>${esc(msg)}</p>
				<button class="studio-btn studio-btn-ghost" data-action="retry">Try again</button>
			</div>`;
	}

	// ── Wallet ──────────────────────────────────────────────────────────────────

	_walletSection() {
		const w = this.state.wallet || {};
		const addr = w.solana_address;
		if (!addr) {
			return `
				<section class="mny-section" aria-labelledby="mny-wallet-h">
					<div class="mny-section-head"><h3 id="mny-wallet-h">Wallet</h3>
						<p>Your agent needs a custodial wallet before it can earn or pay other agents.</p></div>
					<div class="mny-wallet-card mny-wallet-empty">
						<div class="mny-wallet-glyph" aria-hidden="true">◎</div>
						<p>No signing wallet yet.</p>
						<button class="studio-btn studio-btn-primary" data-action="provision" ${this.state.provisioning ? 'disabled' : ''}>
							${this.state.provisioning ? 'Creating…' : 'Create wallet'}
						</button>
					</div>
				</section>`;
		}
		return `
			<section class="mny-section" aria-labelledby="mny-wallet-h">
				<div class="mny-section-head">
					<h3 id="mny-wallet-h">Wallet</h3>
					<p>Real custodial Solana wallet. Fund it with USDC so it can pay other agents and cover gas.</p>
				</div>
				<div class="mny-wallet-card">
					<div class="mny-wallet-bal" data-balances>${this._balancesHtml()}</div>
					<div class="mny-wallet-addr">
						<span class="mny-addr-label">Deposit address</span>
						<code class="mny-addr" title="${esc(addr)}">${esc(short(addr))}</code>
						<button class="mny-icon-btn" data-action="copy" data-copy="${esc(addr)}" title="Copy address" aria-label="Copy deposit address">⧉</button>
						<a class="mny-icon-btn" href="https://solscan.io/account/${esc(addr)}" target="_blank" rel="noopener" title="View on Solscan" aria-label="View on explorer">↗</a>
					</div>
					<div class="mny-wallet-tools">
						<a class="studio-btn studio-btn-primary studio-action" href="/agent/${encodeURIComponent(this.agentId)}/wallet#deposit">Add funds</a>
						<button class="studio-btn studio-btn-ghost studio-action" data-action="refresh">Refresh balance</button>
					</div>
				</div>
			</section>`;
	}

	_balancesHtml() {
		const w = this.state.wallet || {};
		const sol = w.solana_balance == null ? '—' : Number(w.solana_balance).toFixed(4);
		const usdc = w.usdc_balance == null ? '—' : Number(w.usdc_balance).toFixed(2);
		return `
			<div class="mny-bal"><b>$${esc(usdc)}</b><span>USDC</span></div>
			<div class="mny-bal"><b>${esc(sol)}</b><span>SOL</span></div>`;
	}

	_renderWalletBalances() {
		const host = this._q('[data-balances]');
		if (host) host.innerHTML = this._balancesHtml();
	}

	// ── Pricing ───────────────────────────────────────────────────────────────

	_pricingSection() {
		const skills = (this.studio.agent?.skills || []).filter(isSellable);
		return `
			<section class="mny-section" aria-labelledby="mny-price-h">
				<div class="mny-section-head">
					<h3 id="mny-price-h">Pricing</h3>
					<p>Charge other agents and users per call, in USDC. Leave a skill at $0 to keep it free.</p>
				</div>
				${
					skills.length
						? `<ul class="mny-price-list">${skills.map((id) => this._priceRow(id)).join('')}</ul>`
						: `<div class="mny-inline-empty">
							<p>No sellable skills enabled yet.</p>
							<button class="studio-btn studio-btn-ghost studio-action" data-action="go-skills">Add skills →</button>
						</div>`
				}
			</section>`;
	}

	_priceRow(id) {
		const meta = skillMeta(id);
		const p = this.state.prices[id];
		const value = p ? fmtUsdc(p.amount) : '';
		const active = !!p;
		return `
			<li class="mny-price-row ${active ? 'is-priced' : ''}" data-skill="${esc(id)}">
				<div class="mny-price-meta">
					<span class="mny-price-icon" aria-hidden="true">${meta.icon || '⚙️'}</span>
					<div>
						<span class="mny-price-name">${esc(meta.name)}</span>
						<span class="mny-price-desc">${esc(meta.desc)}</span>
					</div>
				</div>
				<div class="mny-price-input">
					<span class="mny-price-cur">$</span>
					<input type="number" inputmode="decimal" min="0" step="0.01" value="${value}"
						placeholder="0.00" aria-label="Price for ${esc(meta.name)} in USDC" data-price-input />
					<span class="mny-price-unit">/call</span>
					<button class="studio-btn studio-btn-ghost studio-action mny-price-save" data-action="save-price" data-skill="${esc(id)}">Save</button>
				</div>
			</li>`;
	}

	// ── Earnings ──────────────────────────────────────────────────────────────

	_earningsSection() {
		const items = this.state.payments || [];
		return `
			<section class="mny-section" aria-labelledby="mny-earn-h">
				<div class="mny-section-head"><h3 id="mny-earn-h">Earnings</h3>
					<p>Every payment other agents and users have made to this one.</p></div>
				${
					items.length
						? `<ul class="mny-earn-list">${items.map((p) => this._earnRow(p)).join('')}</ul>`
						: `<div class="mny-inline-empty">
							<div class="mny-empty-glyph small" aria-hidden="true">◎</div>
							<p>No earnings yet. Price a skill and share your agent — payments land here in real time.</p>
						</div>`
				}
			</section>`;
	}

	_earnRow(p) {
		const usdc = fmtUsdc(p.amount_wei);
		const who = p.payer_name || (p.payer_agent_id ? `agent ${short(p.payer_agent_id)}` : 'someone');
		const what = p.skill_name ? `for ${esc(p.skill_name)}` : (p.memo ? esc(p.memo) : '');
		const explorer = p.tx_hash
			? `<a class="mny-earn-tx" href="https://solscan.io/tx/${esc(p.tx_hash)}" target="_blank" rel="noopener" title="View transaction">↗</a>`
			: '';
		return `
			<li class="mny-earn-row" data-status="${esc(p.status || 'confirmed')}">
				<span class="mny-earn-amt">+$${esc(usdc.toFixed(2))}</span>
				<span class="mny-earn-detail"><b>${esc(who)}</b> ${what}</span>
				<span class="mny-earn-time">${esc(relTime(p.created_at))}</span>
				${explorer}
			</li>`;
	}

	// ── Bind / actions ────────────────────────────────────────────────────────

	_bindError() {
		this._q('[data-action="retry"]')?.addEventListener('click', () => this._load());
	}

	_bind() {
		this.el.addEventListener('click', (e) => {
			const btn = e.target.closest('[data-action]');
			if (!btn) return;
			const a = btn.dataset.action;
			if (a === 'retry') return this._load();
			if (a === 'provision') return this._provision();
			if (a === 'refresh') return this._refreshWallet();
			if (a === 'copy') return this._copy(btn.dataset.copy);
			if (a === 'save-price') return this._savePrice(btn.dataset.skill);
			if (a === 'go-skills') return document.dispatchEvent(new CustomEvent('studio:navigate', { detail: { tab: 'skills' } }));
		});
		this.el.querySelectorAll('[data-price-input]').forEach((inp) =>
			inp.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					this._savePrice(e.target.closest('[data-skill]')?.dataset.skill);
				}
			}));
	}

	async _provision() {
		if (this.state.provisioning) return;
		this.state.provisioning = true;
		this._renderBody();
		try {
			const res = await apiFetch(`/api/agents/${this.agentId}/wallet/provision`, { method: 'POST' });
			if (!res.ok) throw new Error('Provisioning failed.');
			this._toast('Wallet created');
			await this._load();
		} catch (err) {
			this.state.provisioning = false;
			this._renderBody();
			this._toast(err.message || 'Could not create wallet', true);
		}
	}

	async _copy(text) {
		try {
			await navigator.clipboard.writeText(text);
			this._toast('Address copied');
		} catch {
			this._toast('Copy failed — select it manually', true);
		}
	}

	async _savePrice(skill) {
		if (!skill) return;
		const row = this.el.querySelector(`.mny-price-row[data-skill="${CSS.escape(skill)}"]`);
		const input = row?.querySelector('[data-price-input]');
		const btn = row?.querySelector('.mny-price-save');
		if (!input) return;
		const usd = parseFloat(input.value);
		if (Number.isNaN(usd) || usd < 0) return this._toast('Enter a valid amount', true);
		if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
		try {
			if (usd === 0) {
				// $0 = free → remove the price.
				await apiFetch(`/api/agents/${this.agentId}/pricing/${encodeURIComponent(skill)}`, { method: 'DELETE' });
				delete this.state.prices[skill];
			} else {
				const res = await apiFetch(`/api/agents/${this.agentId}/pricing/${encodeURIComponent(skill)}`, {
					method: 'PUT',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ currency_mint: USDC_MINT, chain: 'solana', amount: toAtomic(usd), is_active: true }),
				});
				if (!res.ok) throw new Error('Could not save price.');
				const saved = await res.json();
				this.state.prices[skill] = saved;
			}
			// Record that this skill is sellable in the studio meta bag so the
			// Skills tab + profile reflect it without a refetch.
			this.studio.patch({ meta: { studio: { money: { priced: Object.keys(this.state.prices) } } } });
			this.studio.emit('money:change', { skill, amount: usd });
			row?.classList.toggle('is-priced', usd > 0);
			this._toast(usd === 0 ? 'Skill is now free' : `Priced at $${usd.toFixed(2)}/call`);
		} catch (err) {
			this._toast(err.message || 'Save failed', true);
		} finally {
			if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
		}
	}

	_toast(msg, isError = false) {
		const t = this._q('[data-toast]');
		if (!t) return;
		t.textContent = msg;
		t.hidden = false;
		t.className = `mny-toast ${isError ? 'mny-toast-err' : ''} show`;
		clearTimeout(this._toastTimer);
		this._toastTimer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => { t.hidden = true; }, 300); }, 2600);
	}

	destroy() {
		clearInterval(this._poll);
		clearTimeout(this._toastTimer);
	}
}
