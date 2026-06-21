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

let _session = null;
async function getSession() {
	if (_session !== null) return _session;
	try {
		const r = await fetch('/api/auth/me', { credentials: 'include' });
		_session = r.ok ? await r.json() : false;
	} catch { _session = false; }
	return _session;
}

// The signed-in user's linked Solana wallets — the source of truth for whether
// a wallet is *actually* claimed. A claim is a SIWS-verified `user_wallets`
// row (chain_type=solana); we read it back here rather than trusting an
// optimistic "you're signed in, so it's claimed" assumption.
let _linkedWallets = null;
async function getLinkedSolanaWallets({ force = false } = {}) {
	if (_linkedWallets !== null && !force) return _linkedWallets;
	try {
		const r = await fetch('/api/auth/wallets', { credentials: 'include' });
		if (!r.ok) { _linkedWallets = []; return _linkedWallets; }
		const { wallets } = await r.json();
		_linkedWallets = (wallets || [])
			.filter((w) => (w.chain_type || '').toLowerCase() === 'solana')
			.map((w) => w.address);
	} catch { _linkedWallets = []; }
	return _linkedWallets;
}

// Solana base58 is case-sensitive; compare addresses exactly.
async function isWalletClaimed(wallet) {
	const linked = await getLinkedSolanaWallets();
	return linked.includes(wallet);
}

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

	// Warm up auth check in parallel with any pre-fill preview.
	getSession();

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

	const session = await getSession();
	const signedIn = !!session?.user;
	const claimed = signedIn ? await isWalletClaimed(wallet) : false;

	result.innerHTML = cardHtml(data, { signedIn, claimed });
	wireCtaActions(result, data, wallet);
}

// Wire the share + claim buttons for whichever CTA was rendered.
function wireCtaActions(result, data, wallet) {
	const shareBtn = result.querySelector('#cwShare');
	if (shareBtn) {
		const traderUrl = `${location.origin}/trader/${encodeURIComponent(wallet)}`;
		const label = data.profile?.label ? ` (${LABEL_COPY[data.profile.label] || data.profile.label})` : '';
		const wr = data.profile?.win_rate != null ? ` · ${fmtPct(data.profile.win_rate)} WR` : '';
		const shareText = `My verified pump.fun Trader Card${label}${wr} — provable on-chain on @trythreews`;
		shareBtn.addEventListener('click', () => {
			if (navigator.share) {
				navigator.share({ title: 'three.ws Trader Card', text: shareText, url: traderUrl }).catch(() => {});
			} else {
				const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(traderUrl)}`;
				window.open(twitterUrl, '_blank', 'noopener,width=550,height=420');
			}
		});
	}

	const claimBtn = result.querySelector('#cwClaim');
	if (claimBtn) {
		claimBtn.addEventListener('click', () => claimWallet(wallet, result, data));
	}
}

// ── Real claim: link the wallet to the signed-in account via SIWS ───────────────
// Claiming a wallet means proving you control its keypair. We drive the same
// signature-verified link flow the dashboard uses:
//   POST /api/auth/wallets/nonce-solana → sign the message → POST link-solana.
// On success the wallet becomes a `user_wallets` row owned by the session user,
// and /api/auth/wallets reflects it — i.e. the round-trip is real, not optimistic.

function detectSolanaProvider() {
	if (typeof window === 'undefined') return null;
	return window.phantom?.solana || window.solana || window.backpack || window.solflare || null;
}

function setClaimMsg(result, text, tone = '') {
	let el = result.querySelector('#cwClaimMsg');
	if (!el) {
		const cta = result.querySelector('.cw-cta');
		if (!cta) return;
		el = document.createElement('p');
		el.id = 'cwClaimMsg';
		cta.appendChild(el);
	}
	el.className = `cw-claim-msg ${tone}`;
	el.textContent = text;
}

async function performLink({ message, signature, takeover }) {
	const body = { message, signature };
	if (takeover) body.takeover = true;
	const res = await fetch('/api/auth/wallets/link-solana', {
		method: 'POST',
		credentials: 'include',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
	const data = await res.json().catch(() => ({}));
	return { res, data };
}

async function claimWallet(wallet, result, previewData) {
	const btn = result.querySelector('#cwClaim');
	if (!btn) return;

	const provider = detectSolanaProvider();
	if (!provider) {
		setClaimMsg(result, 'No Solana wallet detected. Install Phantom, Backpack, or Solflare to claim — they prove you control this keypair.', 'err');
		return;
	}

	btn.disabled = true;
	const restore = btn.textContent;
	btn.textContent = 'Connect wallet…';
	setClaimMsg(result, '', '');

	try {
		if (!provider.isConnected) await provider.connect();
		const connected = provider.publicKey?.toBase58?.() || provider.publicKey?.toString?.();
		if (!connected) throw new Error('Could not read your wallet public key.');

		// You can only claim the wallet you actually control. If the connected
		// keypair doesn't match the previewed address, say so plainly.
		if (connected !== wallet) {
			setClaimMsg(result, `Your connected wallet (${shortAddr(connected)}) isn't this one. Switch to ${shortAddr(wallet)} in your wallet, then claim again.`, 'err');
			btn.disabled = false;
			btn.textContent = restore;
			return;
		}

		btn.textContent = 'Requesting message…';
		const nonceRes = await fetch('/api/auth/wallets/nonce-solana', {
			method: 'POST',
			credentials: 'include',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ address: wallet, chainId: 'mainnet' }),
		});
		const nonceData = await nonceRes.json().catch(() => ({}));
		if (!nonceRes.ok) throw new Error(nonceData.error_description || nonceData.message || 'Could not start the claim.');

		btn.textContent = 'Sign to claim…';
		let sigBase64;
		try {
			const msgBytes = new TextEncoder().encode(nonceData.message);
			const { signature } = await provider.signMessage(msgBytes, 'utf8');
			sigBase64 = btoa(String.fromCharCode(...signature));
		} catch (err) {
			if (err?.code === 4001 || /reject|cancel/i.test(err?.message || '')) {
				setClaimMsg(result, 'Signature cancelled — claim again whenever you’re ready.', 'err');
			} else {
				setClaimMsg(result, err?.message || 'Could not sign the claim message.', 'err');
			}
			btn.disabled = false;
			btn.textContent = restore;
			return;
		}

		btn.textContent = 'Claiming…';
		let { res, data } = await performLink({ message: nonceData.message, signature: sigBase64 });

		// Already linked to another account. The signature already proved you
		// control the keypair, so offer an explicit takeover.
		if (res.status === 409 && (data.error === 'address_in_use' || data.code === 'address_in_use')) {
			const confirmed = window.confirm('This wallet is currently claimed by another three.ws account. Your signature proves you control it — move it to this account?');
			if (!confirmed) {
				setClaimMsg(result, 'Claim cancelled — this wallet stays on its current account.', 'err');
				btn.disabled = false;
				btn.textContent = restore;
				return;
			}
			btn.textContent = 'Transferring…';
			({ res, data } = await performLink({ message: nonceData.message, signature: sigBase64, takeover: true }));
		}

		if (!res.ok) throw new Error(data.error_description || data.message || `Claim failed (HTTP ${res.status}).`);

		// Real success: re-read linked wallets and re-render in the claimed state.
		await getLinkedSolanaWallets({ force: true });
		result.innerHTML = cardHtml(previewData, { signedIn: true, claimed: true });
		wireCtaActions(result, previewData, wallet);
		setClaimMsg(result, data.transferred ? 'Moved to your account — your Trader Card is live.' : 'Claimed — your Trader Card is live.', 'ok');
	} catch (err) {
		setClaimMsg(result, err?.message || 'Could not claim this wallet. Try again.', 'err');
		btn.disabled = false;
		btn.textContent = restore;
	}
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

function cardHtml({ wallet, profile, coins, summary }, state = {}) {
	const { signedIn = false, claimed = false } = state;
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
		const img  = c.image_uri ? `<img loading="lazy" decoding="async" src="${esc(c.image_uri)}" alt="" class="cw-coin-img" style="width:32px;height:32px;border-radius:8px;object-fit:cover" onerror="this.outerHTML='<div class=cw-coin-img>${sym.slice(0,2)}</div>'" loading="lazy" />` : `<div class="cw-coin-img">${sym.slice(0, 2)}</div>`;
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
	const traderUrl = `/trader/${encodeURIComponent(wallet)}`;

	let ctaHtml;
	if (claimed) {
		// Verified-claimed: the wallet is a SIWS-linked row on this account.
		ctaHtml = `<div class="cw-cta cw-cta-claimed">
			<h3>Your Trader Card is live</h3>
			<p>This wallet is verified and linked to your account. Share your track record publicly —
			   anyone can follow your trades and copy your entries from their own wallet, and you earn
			   a performance fee when they profit.</p>
			<div class="cw-cta-btns">
				<a href="${esc(traderUrl)}" class="cw-cta-btn primary">View your Trader Card →</a>
				<button type="button" class="cw-cta-btn secondary" id="cwShare">Share ↗</button>
			</div>
		   </div>`;
	} else if (signedIn) {
		// Signed in but not yet linked — offer the real, signature-verified claim.
		ctaHtml = `<div class="cw-cta">
			<h3>This is your track record — claim it</h3>
			<p>Sign a message with this wallet to prove you control it and publish it as your official
			   three.ws Trader Card. Your history becomes provable, shareable, and open for followers
			   to copy — and you earn a performance fee on their profits.</p>
			<div class="cw-cta-btns">
				<button type="button" class="cw-cta-btn primary" id="cwClaim">Claim this wallet →</button>
				<a href="${esc(traderUrl)}" class="cw-cta-btn secondary">Preview the public card</a>
			</div>
			<p class="cw-claim-hint">You’ll sign a free, gasless message in Phantom, Backpack, or Solflare — no transaction, no approval to spend.</p>
		   </div>`;
	} else {
		ctaHtml = `<div class="cw-cta">
			<h3>This is your track record — own it</h3>
			<p>Sign in to publish this as your official three.ws Trader Card. Your history becomes provable,
			   shareable, and open for followers to copy — and you earn a performance fee on their profits.</p>
			<div class="cw-cta-btns">
				<a href="${esc(loginUrl)}" class="cw-cta-btn primary">Sign in to claim →</a>
				<a href="/leaderboard" class="cw-cta-btn secondary">See the leaderboard</a>
			</div>
		   </div>`;
	}

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

		${ctaHtml}
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
