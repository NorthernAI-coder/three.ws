// dashboard-next — Copy Trading.
//
// The copier's command center for non-custodial copy trading:
//   1. Intents inbox  — pending copies (leader traded → sized order to act on).
//   2. Your copies    — active/paused subscriptions, with pause/resume/stop + edit link.
//   3. History        — acted / dismissed / skipped / expired intents.
// Every number is real, from /api/copy/*. The copier executes each trade from
// their own wallet; we never take custody.

import { mountShell } from '../shell.js';
import { requireUser, get, post, del, esc, relTime } from '../api.js';

const SKIP_LABEL = {
	below_mcap_floor: 'Below your market-cap floor',
	above_mcap_ceiling: 'Above your market-cap ceiling',
	dev_heavy: 'Dev holds too much supply',
	low_liquidity: 'Liquidity too thin',
	honeypot: 'Flagged as a honeypot',
	safety_unknown: 'Coin safety unconfirmed',
	below_min_order: 'Sized below your minimum',
	daily_budget_spent: 'Daily budget used up',
	max_open_copies: 'Open-copies cap reached',
	sizing_unavailable: 'Could not size (no balance)',
};

const fmtSol = (n) => {
	const v = Number(n) || 0;
	return `${v.toFixed(v >= 1 ? 2 : 3)} ◎`;
};
const sizingLabel = (s) =>
	s.sizing_rule === 'fixed' ? `${Number(s.fixed_sol)} SOL fixed`
	: s.sizing_rule === 'multiplier' ? `${Number(s.multiplier)}× leader`
	: `${Number(s.pct_balance)}% of wallet`;

function pumpUrl(mint) { return `https://pump.fun/coin/${encodeURIComponent(mint)}`; }

const STYLE = `
<style>
.cp-wrap { display: grid; gap: 20px; }
.cp-sec { border: 1px solid var(--nxt-stroke); background: var(--nxt-panel); border-radius: var(--nxt-radius); padding: 18px; }
.cp-sec-h { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.cp-sec-h h2 { font-size: 16px; margin: 0; }
.cp-sec-h .cp-count { font-size: 12px; color: var(--nxt-ink-faint); font-variant-numeric: tabular-nums; }
.cp-empty { color: var(--nxt-ink-faint); font-size: 13px; padding: 18px 0; text-align: center; }
.cp-item { display: grid; grid-template-columns: 36px 1fr auto; gap: 12px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--nxt-line); }
.cp-item:last-child { border-bottom: 0; }
.cp-av { width: 36px; height: 36px; border-radius: 9px; object-fit: cover; background: var(--nxt-bg-2); border: 1px solid var(--nxt-stroke); }
.cp-mid { min-width: 0; }
.cp-title { font-weight: 600; font-size: 14px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.cp-sub { font-size: 12px; color: var(--nxt-ink-faint); margin-top: 2px; }
.cp-sub a { color: var(--nxt-ink-dim); text-decoration: none; border-bottom: 1px dotted var(--nxt-stroke-strong); }
.cp-sub a:hover { color: var(--nxt-ink); }
.cp-side { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.cp-amt { font-variant-numeric: tabular-nums; font-weight: 700; font-size: 15px; }
.cp-tag { font-size: 11px; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--nxt-stroke); color: var(--nxt-ink-dim); }
.cp-tag.buy { color: var(--nxt-success); border-color: color-mix(in srgb, var(--nxt-success) 40%, transparent); }
.cp-tag.sell { color: var(--nxt-warn); border-color: color-mix(in srgb, var(--nxt-warn) 40%, transparent); }
.cp-tag.on { color: var(--nxt-success); }
.cp-tag.paused { color: var(--nxt-warn); }
.cp-tag.skipped, .cp-tag.expired, .cp-tag.dismissed { color: var(--nxt-ink-faint); }
.cp-tag.acted { color: var(--nxt-success); }
.cp-btn { font-size: 12px; padding: 5px 12px; border-radius: var(--nxt-radius-sm); border: 1px solid var(--nxt-stroke); background: var(--nxt-bg-2); color: var(--nxt-ink); cursor: pointer; text-decoration: none; transition: border-color .14s, transform .14s; white-space: nowrap; }
.cp-btn:hover { border-color: var(--nxt-stroke-strong); transform: translateY(-1px); }
.cp-btn.primary { background: var(--nxt-accent); color: #061018; border-color: transparent; }
.cp-btn.ghost { background: transparent; }
.cp-skeleton { height: 56px; border-radius: 10px; background: var(--nxt-bg-2); animation: cp-pulse 1.4s ease infinite; }
@keyframes cp-pulse { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
.cp-note { font-size: 12px; color: var(--nxt-ink-faint); margin: 0 0 14px; }
.cp-oracle { display: inline-flex; }
.cp-ob { display: inline-flex; align-items: center; gap: 3px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 2px 7px; text-decoration: none; font-size: 11px; transition: border-color .12s; }
.cp-ob:hover { border-color: rgba(255,255,255,0.22); }
.cp-ob-score { font-weight: 700; font-variant-numeric: tabular-nums; }
.cp-ob-tier { font-size: 8.5px; text-transform: uppercase; letter-spacing: .06em; opacity: .8; }
@media (max-width: 560px) { .cp-item { grid-template-columns: 1fr; } .cp-side { justify-content: flex-start; } .cp-av { display: none; } }
</style>`;

function img(e) { return e.leader_image || e.leader_avatar || '/favicon.ico'; }
function traderHref(agentId) { return `/trader/${encodeURIComponent(agentId)}`; }

function intentRow(e) {
	const isBuy = e.direction === 'buy';
	const amount = isBuy ? `<span class="cp-amt">${fmtSol(e.planned_sol)}</span>` : `<span class="cp-tag sell">Exit your copy</span>`;
	const proof = e.leader_buy_sig ? `<a href="https://solscan.io/tx/${esc(e.leader_buy_sig)}" target="_blank" rel="noopener">leader tx ↗</a>` : '';
	const mintAttr = e.mint ? ` data-oracle-mint="${esc(e.mint)}"` : '';
	return `
	<div class="cp-item" data-id="${esc(e.id)}"${mintAttr}>
		<img class="cp-av" src="${esc(img(e))}" alt="" onerror="this.style.visibility='hidden'" />
		<div class="cp-mid">
			<div class="cp-title">
				<span class="cp-tag ${isBuy ? 'buy' : 'sell'}">${isBuy ? 'BUY' : 'SELL'}</span>
				${esc(e.symbol || e.name || 'coin')}
				<span class="cp-oracle"></span>
				<span class="cp-sub" style="margin:0">via <a href="${traderHref(e.leader_agent_id)}">${esc(e.leader_name || 'trader')}</a></span>
			</div>
			<div class="cp-sub">${relTime(e.created_at)} · ${proof}</div>
		</div>
		<div class="cp-side">
			${amount}
			<a class="cp-btn primary" href="${pumpUrl(e.mint)}" target="_blank" rel="noopener" data-act="open">${isBuy ? 'Buy now ↗' : 'Sell ↗'}</a>
			<button class="cp-btn" data-act="acted">Mark copied</button>
			<button class="cp-btn ghost" data-act="dismissed">Dismiss</button>
		</div>
	</div>`;
}

function subRow(s) {
	const paused = s.status === 'paused';
	return `
	<div class="cp-item" data-sub="${esc(s.id)}">
		<img class="cp-av" src="${esc(img(s))}" alt="" onerror="this.style.visibility='hidden'" />
		<div class="cp-mid">
			<div class="cp-title">
				<a href="${traderHref(s.leader_agent_id)}" style="color:inherit;text-decoration:none">${esc(s.leader_name || 'trader')}</a>
				<span class="cp-tag ${paused ? 'paused' : 'on'}">${paused ? 'Paused' : '● Active'}</span>
			</div>
			<div class="cp-sub">${esc(sizingLabel(s))} · cap ${Number(s.per_trade_cap_sol)} ◎ · ${Number(s.daily_budget_sol)} ◎/day · ${Number(s.pending_count) || 0} pending</div>
		</div>
		<div class="cp-side">
			<button class="cp-btn" data-sub-act="${paused ? 'active' : 'paused'}">${paused ? 'Resume' : 'Pause'}</button>
			<a class="cp-btn ghost" href="${traderHref(s.leader_agent_id)}">Edit</a>
			<button class="cp-btn ghost" data-sub-act="stopped">Stop</button>
		</div>
	</div>`;
}

function earningsSection(earnings) {
	const items = (earnings && earnings.items) || [];
	const owing = items.filter((i) => i.fee_sol > 0);
	if (!owing.length) return '';
	const total = Number(earnings.total_fee_owed_sol) || 0;
	const rows = owing.map((i) => `
		<div class="cp-item" data-earn-sub="${esc(i.subscription_id)}">
			<img class="cp-av" src="${esc(i.leader_image || '/favicon.ico')}" alt="" onerror="this.style.visibility='hidden'" />
			<div class="cp-mid">
				<div class="cp-title">${esc(i.leader_name || 'trader')}</div>
				<div class="cp-sub">${fmtSol(i.cumulative_profit_sol)} profit copied · ${(i.perf_fee_bps / 100).toFixed(0)}% fee</div>
			</div>
			<div class="cp-side">
				<span class="cp-amt">${fmtSol(i.fee_sol)}</span>
				<button class="cp-btn primary" data-settle="${esc(i.subscription_id)}" data-fee-usd="${esc(String(i.fee_usd || ''))}" aria-label="Settle performance fee">Settle in $THREE</button>
			</div>
		</div>`).join('');
	return `
		<section class="cp-sec" id="cp-earn">
			<div class="cp-sec-h"><h2>Performance fees owed</h2><span class="cp-count">${fmtSol(total)}</span></div>
			<p class="cp-note">Charged only on gains above your all-time peak. 80% goes to the trader, 15% to treasury, 5% to $THREE holders. Settlement ratchets your high-water mark so the same profit is never billed twice.</p>
			<div id="cp-earn-rows">${rows}</div>
			<div id="cp-earn-status" style="display:none;font-size:12px;color:var(--nxt-ink-faint);padding:10px 0"></div>
		</section>`;
}

function historyRow(e) {
	const status = e.status;
	const label = status === 'skipped' ? (SKIP_LABEL[e.skip_reason] || 'Skipped') : status[0].toUpperCase() + status.slice(1);
	return `
	<div class="cp-item">
		<img class="cp-av" src="${esc(img(e))}" alt="" onerror="this.style.visibility='hidden'" />
		<div class="cp-mid">
			<div class="cp-title">${esc(e.symbol || e.name || 'coin')} <span class="cp-sub" style="margin:0">via ${esc(e.leader_name || 'trader')}</span></div>
			<div class="cp-sub">${relTime(e.created_at)} · ${e.direction === 'buy' && e.planned_sol ? fmtSol(e.planned_sol) : e.direction}</div>
		</div>
		<div class="cp-side"><span class="cp-tag ${status}">${esc(label)}</span></div>
	</div>`;
}

const CP_TIER_COLOR = { prime: '#c084fc', strong: '#34d399', lean: '#fbbf24', watch: '#94a3b8', avoid: '#f87171' };

async function enrichIntentOracle(container) {
	if (!container) return;
	const rows = container.querySelectorAll('[data-oracle-mint]');
	if (!rows.length) return;
	const mints = [...new Set([...rows].map((r) => r.dataset.oracleMint).filter(Boolean))];
	if (!mints.length) return;
	try {
		const r = await fetch(`/api/oracle/batch?mints=${mints.map(encodeURIComponent).join(',')}&network=mainnet`);
		if (!r.ok) return;
		const { results = {} } = await r.json();
		for (const row of rows) {
			const mint = row.dataset.oracleMint;
			const d = results[mint];
			if (!d || d.score == null) continue;
			const badge = row.querySelector('.cp-oracle');
			if (!badge || badge.hasChildNodes()) continue;
			const color = CP_TIER_COLOR[d.tier] || '#94a3b8';
			badge.innerHTML = `<a class="cp-ob" href="/oracle?mint=${encodeURIComponent(mint)}" title="Oracle conviction: ${d.score} (${d.tier})">
				<span class="cp-ob-score" style="color:${color}">${d.score}</span>
				<span class="cp-ob-tier" style="color:${color}">${d.tier}</span>
			</a>`;
		}
	} catch { /* non-fatal */ }
}

async function loadAndRender(host) {
	let subs, pending, history, earnings;
	try {
		[subs, pending, history, earnings] = await Promise.all([
			get('/api/copy/subscriptions').then((r) => r.subscriptions || []),
			get('/api/copy/executions?status=pending').then((r) => r.executions || []),
			get('/api/copy/executions?status=all&limit=40').then((r) => r.executions || []),
			get('/api/copy/earnings').then((r) => r).catch(() => ({ items: [], total_fee_owed_sol: 0 })),
		]);
	} catch {
		host.innerHTML = `<div class="cp-sec"><div class="cp-empty">Couldn't load your copies. <button class="cp-btn" id="cp-reload">Retry</button></div></div>`;
		host.querySelector('#cp-reload')?.addEventListener('click', () => loadAndRender(host));
		return;
	}

	const hist = history.filter((e) => e.status !== 'pending');

	host.innerHTML = `
		<div class="cp-wrap">
			<section class="cp-sec">
				<div class="cp-sec-h"><h2>Intents to act on</h2><span class="cp-count">${pending.length}</span></div>
				<p class="cp-note">When a trader you copy makes a move, a sized intent appears here. You execute it from your own wallet, then mark it copied.</p>
				<div id="cp-pending">${pending.length ? pending.map(intentRow).join('') : `<div class="cp-empty">No intents waiting. Follow a trader on the <a href="/leaderboard" style="color:var(--nxt-accent)">leaderboard</a> to start.</div>`}</div>
			</section>

			<section class="cp-sec">
				<div class="cp-sec-h"><h2>Your copies</h2><span class="cp-count">${subs.filter((s) => s.status !== 'stopped').length}</span></div>
				<div id="cp-subs">${subs.filter((s) => s.status !== 'stopped').length ? subs.filter((s) => s.status !== 'stopped').map(subRow).join('') : `<div class="cp-empty">You're not copying anyone yet. <a href="/leaderboard" style="color:var(--nxt-accent)">Find a trader →</a></div>`}</div>
			</section>

			${earningsSection(earnings)}

			<section class="cp-sec">
				<div class="cp-sec-h"><h2>History</h2><span class="cp-count">${hist.length}</span></div>
				<div id="cp-history">${hist.length ? hist.map(historyRow).join('') : `<div class="cp-empty">Nothing yet.</div>`}</div>
			</section>
		</div>`;

	// Enrich pending intent rows with Oracle conviction badges
	enrichIntentOracle(host.querySelector('#cp-pending'));

	// Intent actions
	host.querySelector('#cp-pending')?.addEventListener('click', async (e) => {
		const btn = e.target.closest('[data-act]');
		if (!btn) return;
		const action = btn.dataset.act;
		const row = btn.closest('[data-id]');
		const id = row?.dataset.id;
		if (action === 'open') return; // anchor handles navigation; intent stays until explicitly marked
		btn.disabled = true;
		try {
			await post('/api/copy/executions', { id, action });
			row.style.opacity = '0.4';
			setTimeout(() => loadAndRender(host), 250);
		} catch { btn.disabled = false; }
	});

	// Subscription actions
	host.querySelector('#cp-subs')?.addEventListener('click', async (e) => {
		const btn = e.target.closest('[data-sub-act]');
		if (!btn) return;
		const row = btn.closest('[data-sub]');
		const id = row?.dataset.sub;
		const next = btn.dataset.subAct;
		btn.disabled = true;
		try {
			if (next === 'stopped') await del(`/api/copy/subscriptions?id=${encodeURIComponent(id)}`);
			else await post('/api/copy/subscriptions', { id, status: next });
			loadAndRender(host);
		} catch { btn.disabled = false; }
	});

	// Performance fee settlement
	host.querySelector('#cp-earn')?.addEventListener('click', async (e) => {
		const btn = e.target.closest('[data-settle]');
		if (!btn) return;
		const subId = btn.dataset.settle;
		const statusEl = host.querySelector('#cp-earn-status');
		const setStatus = (msg) => { statusEl.style.display = msg ? 'block' : 'none'; statusEl.textContent = msg; };
		btn.disabled = true;
		try {
			await payWithCopyFee(subId, setStatus);
			setStatus('Fee settled. Reloading…');
			setTimeout(() => loadAndRender(host), 1200);
		} catch (err) {
			setStatus(`Payment failed: ${err.message || 'unknown error'}. Try again.`);
			btn.disabled = false;
		}
	});
}

const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

async function payWithCopyFee(subscriptionId, onStatus = () => {}) {
	// 1. Request the charge quote from the server
	onStatus('Getting quote…');
	const charge = await post('/api/copy/settle-fee', { subscription_id: subscriptionId });
	if (charge.nothing_to_settle) throw new Error('Nothing to settle right now.');
	if (!charge.quote || !charge.legs || !charge.memo) throw new Error('Invalid quote received.');

	// 2. Load Solana SDK lazily
	onStatus('Preparing transaction…');
	const [{ Connection, PublicKey, Transaction, TransactionInstruction }, { getAssociatedTokenAddressSync, createTransferInstruction, createAssociatedTokenAccountIdempotentInstruction }] =
		await Promise.all([import('@solana/web3.js'), import('@solana/spl-token')]);

	const wallet = window.solana;
	if (!wallet) throw Object.assign(new Error('No wallet found. Install Phantom.'), { code: 'no_wallet' });
	if (!wallet.isConnected) await wallet.connect();
	const payer = wallet.publicKey;
	if (!payer) throw new Error('Wallet has no public key.');

	const rpc = window.__solanaRpc || `${location.origin}/api/solana-rpc`;
	const connection = new Connection(rpc, 'confirmed');

	// 3. Build the $THREE SPL transfer + memo transaction
	const mint = new PublicKey(charge.mint);
	const fromAta = getAssociatedTokenAddressSync(mint, payer);
	const tx = new Transaction();
	for (const leg of charge.legs) {
		const owner = new PublicKey(leg.address);
		const destAta = getAssociatedTokenAddressSync(mint, owner, true);
		tx.add(createAssociatedTokenAccountIdempotentInstruction(payer, destAta, owner, mint));
		tx.add(createTransferInstruction(fromAta, destAta, payer, BigInt(leg.atomics)));
	}
	tx.add(new TransactionInstruction({
		keys: [],
		programId: new PublicKey(MEMO_PROGRAM_ID),
		data: new TextEncoder().encode(charge.memo),
	}));
	const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
	tx.feePayer = payer;
	tx.recentBlockhash = blockhash;

	// 4. Sign and send
	onStatus('Waiting for wallet signature…');
	const signature = await wallet.sendTransaction(tx, connection);
	onStatus('Confirming on-chain…');
	await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

	// 5. Settle — server verifies and ratchets the HWM
	onStatus('Recording settlement…');
	const settled = await post('/api/copy/settle-fee', { quoteToken: charge.quote, tx_signature: signature });
	if (!settled.ok) throw new Error(settled.error_description || 'Settlement failed on server.');
	return settled;
}

async function main() {
	const root = await mountShell();
	await requireUser();
	root.innerHTML = `
		${STYLE}
		<header style="margin-bottom:20px">
			<h1 class="dn-h1" style="margin:0">Copy Trading</h1>
			<p class="dn-h1-sub" style="margin:0">Mirror proven traders — non-custodially, on your terms. You sign every trade.</p>
		</header>
		<div id="cp-host">
			<div class="cp-wrap"><div class="cp-skeleton"></div><div class="cp-skeleton" style="height:120px"></div></div>
		</div>`;
	await loadAndRender(root.querySelector('#cp-host'));
}

main();
