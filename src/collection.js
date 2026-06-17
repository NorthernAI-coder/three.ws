/**
 * My Collection page — shows all purchased skills and active subscriptions.
 */

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const THREE_MINT = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';

function fmtDate(iso) {
	if (!iso) return '';
	return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtAmount(amount, mint) {
	if (!amount) return '';
	const symbol = mint === THREE_MINT ? '$THREE' : mint === USDC_MINT ? 'USDC' : '';
	const val = (Number(amount) / 1_000_000).toFixed(2);
	return symbol ? `${val} ${symbol}` : val;
}

function explorerUrl(mint, network) {
	const base = network === 'devnet'
		? 'https://explorer.solana.com/address/'
		: 'https://solscan.io/token/';
	const suffix = network === 'devnet' ? '?cluster=devnet' : '';
	return `${base}${mint}${suffix}`;
}

function skillCard(p) {
	const thumb = p.agent_thumbnail
		? `<img class="col-card-avatar" src="${p.agent_thumbnail}" alt="${p.agent_name || ''}" loading="lazy">`
		: `<div class="col-card-avatar placeholder">⚡</div>`;

	const kindBadge = p.kind === 'trial'
		? '<span class="badge badge-amber">Trial</span>'
		: '<span class="badge badge-green">Owned</span>';

	const nftLine = p.skill_nft_mint
		? `<div class="col-card-nft">NFT: <a href="${explorerUrl(p.skill_nft_mint, p.skill_nft_network)}" target="_blank" rel="noopener">${p.skill_nft_mint.slice(0,6)}…${p.skill_nft_mint.slice(-4)}</a></div>`
		: '';

	const priceLine = p.amount ? `<span class="badge badge-muted">${fmtAmount(p.amount, p.currency_mint)}</span>` : '';

	return `
		<article class="col-card">
			<div class="col-card-header">
				${thumb}
				<div class="col-card-meta">
					<div class="col-card-skill">${p.skill}</div>
					<div class="col-card-agent">${p.agent_name || 'Unknown agent'}</div>
				</div>
			</div>
			<div class="col-card-badges">${kindBadge}${priceLine}</div>
			${nftLine}
			<div class="col-card-footer">
				<span class="col-card-date">Purchased ${fmtDate(p.confirmed_at || p.created_at)}</span>
				<a href="/marketplace/agents/${p.agent_id}" class="col-cta">View agent</a>
			</div>
		</article>`;
}

function subCard(s) {
	const now = Date.now();
	const expiresAt = s.next_charge_at ? new Date(s.next_charge_at) : null;
	const isActive = s.status === 'active' && (!expiresAt || expiresAt > now);
	const expiryClass = isActive ? 'active' : 'expired';
	const expiryText = expiresAt
		? (isActive ? `Renews ${fmtDate(s.next_charge_at)}` : `Expired ${fmtDate(s.next_charge_at)}`)
		: '';

	const statusBadge = isActive
		? '<span class="badge badge-green">Active</span>'
		: '<span class="badge badge-amber">Expired</span>';

	const amountLine = s.amount_per_period
		? `<span class="badge badge-muted">${fmtAmount(s.amount_per_period, null)}/period</span>`
		: '';

	return `
		<article class="col-card">
			<div class="col-card-header">
				<div class="col-card-avatar placeholder">🔄</div>
				<div class="col-card-meta">
					<div class="col-card-skill">Agent Subscription</div>
					<div class="col-card-agent">ID: ${s.agent_id?.slice(0, 8)}…</div>
				</div>
			</div>
			<div class="col-card-badges">${statusBadge}${amountLine}</div>
			<div class="col-card-footer">
				<span class="col-sub-expiry ${expiryClass}">${expiryText}</span>
				<a href="/marketplace/agents/${s.agent_id}" class="col-cta">View agent</a>
			</div>
		</article>`;
}

function skeletonGrid(n = 6) {
	return Array.from({ length: n }, () => `
		<div class="skeleton-card">
			<div class="col-card-header">
				<div class="col-card-avatar skeleton"></div>
				<div class="col-card-meta">
					<div class="skeleton-row skeleton" style="width:70%;margin-bottom:6px;"></div>
					<div class="skeleton-row skeleton" style="width:45%;"></div>
				</div>
			</div>
			<div class="skeleton-row skeleton" style="width:40%;"></div>
			<div style="display:flex;justify-content:space-between;margin-top:4px;">
				<div class="skeleton-row skeleton" style="width:40%;"></div>
				<div class="skeleton-row skeleton" style="width:25%;"></div>
			</div>
		</div>`).join('');
}

function emptyState(panel) {
	if (panel === 'skills') {
		return `
			<div class="col-empty">
				<svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
				<h3>No skills yet</h3>
				<p>Browse the <a href="/marketplace">marketplace</a> and unlock premium agent skills.</p>
			</div>`;
	}
	return `
		<div class="col-empty">
			<svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
			<h3>No subscriptions</h3>
			<p>Active agent subscriptions appear here once you subscribe.</p>
		</div>`;
}

async function load() {
	const authWall = document.getElementById('col-auth-wall');
	const errorEl = document.getElementById('col-error');
	const colMain = document.getElementById('col-main');
	const colStats = document.getElementById('col-stats');
	const skillsGrid = document.getElementById('skills-grid');
	const subsGrid = document.getElementById('subs-grid');

	// Show skeleton while loading
	skillsGrid.innerHTML = skeletonGrid(6);
	subsGrid.innerHTML = skeletonGrid(3);

	const [skillsRes, subsRes] = await Promise.all([
		fetch('/api/users/me/purchased-skills', { credentials: 'include' }),
		fetch('/api/subscriptions', { credentials: 'include' }),
	]);

	if (skillsRes.status === 401 || subsRes.status === 401) {
		authWall.hidden = false;
		skillsGrid.innerHTML = '';
		subsGrid.innerHTML = '';
		return;
	}

	if (!skillsRes.ok || !subsRes.ok) {
		const msg = 'Failed to load collection. Please refresh and try again.';
		errorEl.textContent = msg;
		errorEl.hidden = false;
		skillsGrid.innerHTML = '';
		subsGrid.innerHTML = '';
		return;
	}

	const { data: skillsData } = await skillsRes.json();
	const { data: subsData } = await subsRes.json();

	const purchases = skillsData?.purchases ?? [];
	const subs = subsData ?? [];
	const nftCount = purchases.filter(p => p.skill_nft_mint).length;
	const activeSubs = subs.filter(s => s.status === 'active').length;

	// Update stats
	document.getElementById('stat-skills').textContent = purchases.length;
	document.getElementById('stat-subs').textContent = activeSubs;
	document.getElementById('stat-nfts').textContent = nftCount;

	colStats.hidden = false;
	colMain.hidden = false;

	skillsGrid.innerHTML = purchases.length
		? purchases.map(skillCard).join('')
		: emptyState('skills');

	subsGrid.innerHTML = subs.length
		? subs.map(subCard).join('')
		: emptyState('subscriptions');

	// Update tab labels with counts
	const tabs = document.querySelectorAll('.col-tab');
	tabs[0].textContent = `Skills (${purchases.length})`;
	tabs[1].textContent = `Subscriptions (${subs.length})`;
}

// Tab switching
document.querySelectorAll('.col-tab').forEach(tab => {
	tab.addEventListener('click', () => {
		document.querySelectorAll('.col-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
		document.querySelectorAll('.col-panel').forEach(p => p.classList.remove('active'));
		tab.classList.add('active');
		tab.setAttribute('aria-selected', 'true');
		document.getElementById(`panel-${tab.dataset.panel}`).classList.add('active');
	});
});

load();
