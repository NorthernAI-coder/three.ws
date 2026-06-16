/**
 * Claim Wallet controller.
 *
 * Lets any pump.fun trader paste their Solana wallet and see their verified
 * track record — win rate, smart-money score, reputation label, recent coins,
 * and a PnL summary — before signing in to publish it as their official
 * three.ws Trader Card.
 */

const WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const $ = (sel, root = document) => root.querySelector(sel);

function esc(s) {
	return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtSol(n) {
	if (n == null) return '—';
	const v = Number(n);
	const sign = v >= 0 ? '+' : '';
	return `${sign}${v.toFixed(v >= 1 || v <= -1 ? 2 : 3)} ◎`;
}

function fmtPct(n) {
	if (n == null) return '—';
	return `${Math.round(Number(n) * 100)}%`;
}

function shortAddr(a) {
	if (!a || a.length < 12) return a || '';
	return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
	const input = $('#cwInput');
	const btn   = $('#cwBtn');
	const errEl = $('#cwErr');

	// Pre-fill from URL param ?wallet=...
	const qs = new URL(location.href).searchParams;
	const preWallet = qs.get('wallet');
	if (preWallet && WALLET_RE.test(preWallet)) {
		input.value = preWallet;
		preview(preWallet);
	}

	btn.addEventListener('click', () => {
		const wallet = input.value.trim();
		if (!WALLET_RE.test(wallet)) { showErr('Paste a valid Solana base-58 wallet address.'); return; }
		hideErr();
		const url = new URL(location.href);
		url.searchParams.set('wallet', wallet);
		history.replaceState(null, '', url.toString());
		preview(wallet);
	});

	input.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
});

function showErr(msg) { const e = $('#cwErr'); e.textContent = msg; e.hidden = false; }
function hideErr() { $('#cwErr').hidden = true; }

// ── Fetch + render ────────────────────────────────────────────────────────────

async function preview(wallet) {
	const result = $('#cwResult');
	const btn = $('#cwBtn');

	btn.disabled = true;
	btn.textContent = 'Loading…';
	result.innerHTML = '<div class="cw-skel" aria-hidden="true"></div>';

	let data;
	try {
		const r = await fetch(`/api/traders/preview?wallet=${encodeURIComponent(wallet)}`);
		if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.message || `HTTP ${r.status}`); }
		data = await r.json();
	} catch (e) {
		result.innerHTML = '';
		showErr(e.message || 'Could not load wallet data.');
		btn.disabled = false;
		btn.textContent = 'Preview';
		return;
	}

	btn.disabled = false;
	btn.textContent = 'Preview';

	if (!data.claimable && !data.known) {
		result.innerHTML = notFoundHtml(wallet);
		return;
	}

	result.innerHTML = cardHtml(data);
}

// ── Card HTML ─────────────────────────────────────────────────────────────────

const LABEL_COPY = {
	smart_money: 'Smart Money',
	sniper:      'Sniper',
	dumper:      'Dumper',
	rugger:      'Rugger',
	fresh:       'Fresh',
	neutral:     'Neutral',
	unproven:    'Unproven',
};

function cardHtml({ wallet, profile, coins, summary }) {
	const label   = profile?.label || 'unproven';
	const labelTxt = LABEL_COPY[label] || label;
	const shortW   = shortAddr(wallet);

	const winRate = profile?.win_rate   != null ? fmtPct(profile.win_rate)   : null;
	const ewRate  = profile?.early_win_rate != null ? fmtPct(profile.early_win_rate) : null;
	const smScore = profile?.smart_money_score != null ? Math.round(Number(profile.smart_money_score)) : null;
	const traded  = profile?.coins_traded || summary?.total_coins || 0;
	const wins    = profile?.wins || summary?.wins_in_window || 0;
	const duds    = profile?.duds || 0;
	const net     = summary?.net_pnl_sol || 0;
	const netPosNeg = net > 0 ? 'green' : net < 0 ? 'red' : 'neu';

	const statsHtml = [
		{ val: traded,                           cls: '', lbl: 'Coins traded' },
		{ val: winRate || '—',                    cls: Number(profile?.win_rate || 0) >= 0.5 ? 'green' : '', lbl: 'Win rate' },
		{ val: ewRate  || '—',                    cls: '', lbl: 'Early win rate' },
		{ val: smScore != null ? smScore : '—',   cls: smScore != null && smScore >= 70 ? 'green' : '', lbl: 'SM score' },
		{ val: fmtSol(net),                       cls: netPosNeg, lbl: 'Net PnL (window)' },
		{ val: profile?.dumps || 0,               cls: profile?.dumps > 0 ? 'red' : '', lbl: 'Dumps' },
	].map((s) => `<div class="cw-stat">
		<div class="cw-stat-val ${esc(s.cls)}">${esc(String(s.val))}</div>
		<div class="cw-stat-lbl">${esc(s.lbl)}</div>
	</div>`).join('');

	const coinsHtml = coins.slice(0, 15).map((c) => {
		const sym  = esc((c.symbol || c.mint?.slice(0, 6) || '?').toUpperCase());
		const img  = c.image_uri ? `<img src="${esc(c.image_uri)}" alt="" class="cw-coin-img" style="width:32px;height:32px;border-radius:8px;object-fit:cover" onerror="this.outerHTML='<div class=cw-coin-img>${sym.slice(0,2)}</div>'" loading="lazy" />` : `<div class="cw-coin-img">${sym.slice(0, 2)}</div>`;
		const pnl  = c.pnl_sol != null ? fmtSol(c.pnl_sol) : '—';
		const pnlCls = c.pnl_sol != null && c.pnl_sol > 0 ? 'pos' : c.pnl_sol != null && c.pnl_sol < 0 ? 'neg' : 'neu';
		const creator = c.is_creator ? '<span class="cw-creator-badge">creator</span>' : '';
		return `<div class="cw-coin-row">
			${img}
			<div>
				<div class="cw-coin-sym">$${sym} ${creator}</div>
				${c.name ? `<div class="cw-coin-name">${esc(c.name)}</div>` : ''}
			</div>
			<div class="cw-coin-pnl ${pnlCls}">${esc(pnl)}</div>
		</div>`;
	}).join('');

	const loginUrl = `/login?next=${encodeURIComponent(`/claim-wallet?wallet=${encodeURIComponent(wallet)}`)}`;

	return `<div class="cw-card">
		<div class="cw-card-head">
			<div class="cw-wallet-icon">${shortW.slice(0, 2).toUpperCase()}</div>
			<div>
				<div class="cw-wallet-addr">${shortW} <span>(${esc(wallet.slice(0, 12))}…)</span></div>
				<div class="cw-label-badge ${esc(label)}">${esc(labelTxt)}</div>
			</div>
		</div>

		<div class="cw-stats">${statsHtml}</div>

		${coins.length > 0 ? `
			<div class="cw-coins-head">Recent pump.fun coins (${coins.length})</div>
			<div class="cw-coins-list">${coinsHtml}</div>
		` : ''}

		<div class="cw-cta">
			<h3>This is your track record — own it</h3>
			<p>Sign in to publish this as your official three.ws Trader Card. Your history becomes provable,
			   shareable, and open for followers to copy — and you earn a performance fee on their profits.</p>
			<div class="cw-cta-btns">
				<a href="${esc(loginUrl)}" class="cw-cta-btn primary">Sign in to claim →</a>
				<a href="/leaderboard" class="cw-cta-btn secondary">See the leaderboard</a>
			</div>
		</div>
	</div>`;
}

function notFoundHtml(wallet) {
	return `<div class="cw-notfound">
		<h2>Wallet not yet indexed</h2>
		<p>
			<code style="word-break:break-all;font-size:11px">${esc(wallet)}</code><br><br>
			This wallet hasn't been scored by the intelligence brain yet — it only covers wallets
			that have appeared in pump.fun order books the platform has observed.
			If you've traded on pump.fun recently, check back in a few hours or try another wallet.
		</p>
		<div style="margin-top:20px">
			<a href="/leaderboard" class="cw-cta-btn secondary" style="display:inline-flex;padding:10px 20px;border-radius:8px;border:1px solid var(--line);color:var(--muted);text-decoration:none;font:600 13px/1 var(--mono)">Browse the leaderboard →</a>
		</div>
	</div>`;
}
