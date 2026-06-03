// Agent Economy — two 3D AI agents transacting on-chain.
//
// Nova (buyer, left) picks a service from Oracle's catalog, pays real SOL,
// and Oracle delivers the analysis. Every transaction is real: a live Solana
// wallet sends lamports, the tx signature links to Solana FM.
//
// Architecture:
//   - Two <agent-3d> avatars loaded into iframes (the existing embed pattern).
//   - A POST to /api/agent-economy/transact triggers the real payment + LLM
//     delivery on the server. No x402 client lib needed in the browser: the
//     server signs with AVATAR_WALLET_SECRET.
//   - Speech bubbles + avatar animations driven by postMessage to each iframe.
//   - A payment particle arc animates from buyer → seller on real tx confirmation.
//   - /api/agent-economy/status polled on load to show live wallet balances.
//   - The tx feed in the center column is pure DOM — no framework.

const $ = (id) => document.getElementById(id);

// ── Wallet status ─────────────────────────────────────────────────────────────
// Fetched on load; re-fetched after each trade to show updated balances.
async function fetchWalletStatus() {
	try {
		const res = await fetch('/api/agent-economy/status');
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	}
}

function renderBal(elId, info) {
	const el = $(elId);
	if (!el) return;
	if (!info || !info.configured) {
		el.className = 'av-label-bal bal-unknown';
		el.textContent = 'wallet not set';
		return;
	}
	const sol = typeof info.sol === 'number' ? info.sol : null;
	if (sol === null) {
		el.className = 'av-label-bal bal-unknown';
		el.textContent = '—';
		return;
	}
	const usdStr = info.usd != null ? ` · $${info.usd.toFixed(2)}` : '';
	el.className = `av-label-bal ${sol > 0.0001 ? 'bal-funded' : 'bal-empty'}`;
	el.textContent = `${sol.toFixed(5)} SOL${usdStr}`;
}

function renderFundAlert(status) {
	const el = $('fund-alert');
	if (!el) return;
	const aOk = status?.agentA?.configured && (status.agentA.sol ?? 0) > 0.001;
	const aCfg = status?.agentA?.configured;
	if (aOk) { el.classList.remove('visible'); return; }
	let html = '';
	if (!aCfg) {
		html = '<strong>Nova\'s wallet not configured.</strong> Set <code>AVATAR_WALLET_SECRET</code> in Vercel env to enable live transactions.';
	} else {
		const addr = status.agentA.address;
		const exp = status.agentA.explorer || `https://solscan.io/account/${addr}`;
		html = `<strong>Nova needs SOL to transact.</strong> Fund her wallet with a small amount of SOL:<span class="fund-addr">${addr} <a href="${exp}" target="_blank" rel="noopener">↗ Solscan</a></span>`;
	}
	el.innerHTML = html;
	el.classList.add('visible');
}

async function refreshWalletStatus() {
	const status = await fetchWalletStatus();
	if (!status) return;
	renderBal('buyer-bal', status.agentA);
	renderBal('seller-bal', status.agentB);
	renderFundAlert(status);
	if (status.agentA?.address) renderAddr('buyer-addr', status.agentA.address, status.agentA.explorer);
	if (status.agentB?.address) renderAddr('seller-addr', status.agentB.address, status.agentB.explorer);
}

// ── Payment particle ──────────────────────────────────────────────────────────
function firePaymentParticle() {
	const root = $('root');
	const buyer = document.getElementById('col-buyer');
	const seller = document.getElementById('col-seller');
	if (!root || !buyer || !seller) return;

	const rootRect  = root.getBoundingClientRect();
	const buyerRect = buyer.getBoundingClientRect();
	const sellerRect = seller.getBoundingClientRect();

	const startX = buyerRect.left  + buyerRect.width  / 2 - rootRect.left;
	const startY = buyerRect.top   + buyerRect.height / 2 - rootRect.top;
	const endX   = sellerRect.left + sellerRect.width / 2 - rootRect.left;
	const dx     = endX - startX;

	const p = document.createElement('div');
	p.className = 'pay-particle';
	p.style.left = `${startX}px`;
	p.style.top  = `${startY}px`;
	p.style.setProperty('--tx-full', `${dx}px`);
	p.style.setProperty('--tx-half', `${dx / 2}px`);
	root.appendChild(p);

	// Trigger reflow then start animation.
	p.getBoundingClientRect();
	p.classList.add('arc');
	setTimeout(() => p.remove(), 1000);
}

// ── Avatar frames ─────────────────────────────────────────────────────────────
const frameBuyer  = $('frame-buyer');
const frameSeller = $('frame-seller');
const colBuyer    = $('col-buyer');
const colSeller   = $('col-seller');

const BUYER_GLB  = '/avatars/default.glb';
// Use a slightly different tint for the seller so they look distinct.
const SELLER_GLB = '/avatars/cz.glb';

// Track readiness: iframes fire v1.avatar.ready when the 3D scene is live.
let buyerReady  = false;
let sellerReady = false;
const buyerQueue  = [];
const sellerQueue = [];

function postToAvatar(frame, queue, ready, msg) {
	if (ready) frame.contentWindow?.postMessage(msg, location.origin);
	else queue.push(msg);
}

function buyerSay(text)  { postToAvatar(frameBuyer,  buyerQueue,  buyerReady,  { type: 'v1.avatar.speak', text }); }
function sellerSay(text) { postToAvatar(frameSeller, sellerQueue, sellerReady, { type: 'v1.avatar.speak', text }); }
function buyerAnim(name) { postToAvatar(frameBuyer,  buyerQueue,  buyerReady,  { type: 'v1.avatar.animation', name }); }
function sellerAnim(name){ postToAvatar(frameSeller, sellerQueue, sellerReady, { type: 'v1.avatar.animation', name }); }

window.addEventListener('message', (e) => {
	if (e.data?.type !== 'v1.avatar.ready') return;
	if (e.source === frameBuyer.contentWindow) {
		buyerReady = true;
		$('loading-buyer').classList.add('gone');
		buyerQueue.forEach((m) => frameBuyer.contentWindow?.postMessage(m, location.origin));
		buyerQueue.length = 0;
		buyerSay('Ready to transact. Browsing Oracle\'s catalog now.');
	} else if (e.source === frameSeller.contentWindow) {
		sellerReady = true;
		$('loading-seller').classList.add('gone');
		sellerQueue.forEach((m) => frameSeller.contentWindow?.postMessage(m, location.origin));
		sellerQueue.length = 0;
		sellerSay('Open for business. Services start at $0.001.');
	}
});

// Build the embed URL for each avatar (same pattern as demo-economy.html).
function avatarUrl(glb) {
	const q = new URLSearchParams({ model: glb, brain: '/api/chat', 'hide-chrome': '1', kiosk: '1', eager: '1' });
	return `/a-embed?${q}`;
}

frameBuyer.src  = avatarUrl(BUYER_GLB);
frameSeller.src = avatarUrl(SELLER_GLB);

// Load wallet status immediately — updates balance chips and fund alert.
refreshWalletStatus();

// ── Speech bubbles ────────────────────────────────────────────────────────────
const speechBuyer  = $('speech-buyer');
const speechSeller = $('speech-seller');
const speechTimers = { buyer: null, seller: null };

function showSpeech(el, text, key, ms = 6000) {
	clearTimeout(speechTimers[key]);
	el.textContent = text;
	el.classList.add('visible');
	speechTimers[key] = setTimeout(() => el.classList.remove('visible'), ms);
}

// ── Status bar ────────────────────────────────────────────────────────────────
function setStatus(text) { $('status-text').textContent = text; }

// ── Transaction feed ──────────────────────────────────────────────────────────
let txCount = 0;

function addFeedItem({ icon, type, title, sub, time }) {
	const empty = $('feed-empty');
	if (empty) empty.remove();
	txCount++;
	$('tx-count').textContent = `${txCount} tx`;

	const now = time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	const item = document.createElement('div');
	item.className = `tx-item tx-${type}`;
	item.innerHTML = `
		<div class="tx-icon">${icon}</div>
		<div class="tx-body">
			<div class="tx-title">${escHtml(title)}</div>
			<div class="tx-sub">${sub}</div>
		</div>
		<div class="tx-time">${escHtml(now)}</div>`;
	const feed = $('feed');
	feed.prepend(item);
}

function escHtml(s) {
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

// ── Service buttons ───────────────────────────────────────────────────────────
let busy = false;

document.querySelectorAll('.svc-btn').forEach((btn) => {
	btn.addEventListener('click', () => {
		if (busy) return;
		purchase(btn.dataset.service);
	});
});

function setButtons(disabled) {
	document.querySelectorAll('.svc-btn').forEach((b) => (b.disabled = disabled));
}

// ── Wallet address display (from the API response) ────────────────────────────
function shortenAddr(addr) {
	if (!addr || addr.length < 10) return addr;
	return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function renderAddr(elId, addr, explorerUrl) {
	const el = $(elId);
	if (!el || !addr) return;
	el.innerHTML = explorerUrl
		? `<a href="${escHtml(explorerUrl)}" target="_blank" rel="noopener" title="${escHtml(addr)}">${escHtml(shortenAddr(addr))} ↗</a>`
		: escHtml(shortenAddr(addr));
}

// ── Purchase flow ─────────────────────────────────────────────────────────────
async function purchase(service) {
	if (busy) return;
	busy = true;
	setButtons(true);

	const topic = $('topic').value.trim() || null;
	const serviceNames = {
		'market-analysis': 'Market Analysis',
		'onchain-insight': 'On-Chain Insight',
		'risk-score': 'Risk Score',
	};
	const name = serviceNames[service] || service;

	setStatus(`Nova is requesting ${name}…`);
	showSpeech(speechBuyer, `Oracle, I need ${name}. Sending payment now.`, 'buyer', 7000);
	buyerAnim('idle');
	colBuyer.classList.add('paying');
	setTimeout(() => colBuyer.classList.remove('paying'), 600);
	buyerAnim('wave');

	addFeedItem({
		icon: '📡',
		type: 'pay',
		title: `Nova → Oracle: ${name}`,
		sub: topic ? `Topic: ${escHtml(topic)}` : 'Service request initiated',
	});

	let data;
	try {
		const res = await fetch('/api/agent-economy/transact', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ service, topic }),
		});
		data = await res.json();
		if (!res.ok) throw new Error(data.error_description || data.error || `HTTP ${res.status}`);
	} catch (e) {
		setStatus(`Error: ${e.message}`);
		addFeedItem({ icon: '⚠️', type: 'pay', title: 'Request failed', sub: escHtml(e.message) });
		busy = false;
		setButtons(false);
		return;
	}

	const tx = data.transaction;

	// Update wallet address labels on first successful response
	if (tx?.buyerAddress)  renderAddr('buyer-addr',  tx.buyerAddress,  tx.buyerExplorerUrl);
	if (tx?.sellerAddress) renderAddr('seller-addr', tx.sellerAddress, tx.sellerExplorerUrl);

	// Nova speaks her request
	if (data.buyerSaid) {
		showSpeech(speechBuyer, data.buyerSaid, 'buyer', 7000);
		buyerSay(data.buyerSaid);
	}

	// Slight delay so Oracle "receives" the payment before responding
	await delay(900);

	// Transaction outcome
	if (tx?.signature) {
		// Real on-chain payment confirmed — fire the particle then flash the seller.
		firePaymentParticle();
		await delay(500);
		colSeller.classList.add('receiving');
		setTimeout(() => colSeller.classList.remove('receiving'), 600);

		const solStr = tx.solAmount ? `${tx.solAmount.toFixed(6)} SOL` : '';
		const usdStr = tx.usdAmount ? `$${tx.usdAmount.toFixed(4)} USD` : '';
		const amountStr = [solStr, usdStr].filter(Boolean).join(' · ');

		addFeedItem({
			icon: '💸',
			type: 'pay',
			title: `Payment sent · ${amountStr}`,
			sub: `<a href="${escHtml(tx.explorerUrl)}" target="_blank" rel="noopener" class="tx-mono">
				${escHtml(tx.signature.slice(0, 8))}…${escHtml(tx.signature.slice(-8))} ↗
			</a><br>${escHtml(tx.network === 'devnet' ? 'Solana devnet' : 'Solana mainnet')}`,
		});
		setStatus(`Payment confirmed · ${amountStr}`);
	} else if (tx?.error === 'wallet_unconfigured') {
		addFeedItem({
			icon: '🔑',
			type: 'pay',
			title: 'Wallet not configured',
			sub: escHtml(tx.message),
		});
		setStatus('Set AVATAR_WALLET_SECRET to enable live transactions');
	} else if (tx?.error === 'insufficient_balance') {
		addFeedItem({ icon: '💰', type: 'pay', title: 'Fund Nova\'s wallet', sub: escHtml(tx.message) });
		setStatus('Fund Nova\'s wallet to transact');
	} else if (tx?.error === 'no_recipient') {
		addFeedItem({ icon: '📭', type: 'pay', title: 'Set Agent B address', sub: escHtml(tx.message) });
		setStatus('Set AGENT_B_ADDRESS to Oracle\'s wallet');
	} else if (tx?.error) {
		addFeedItem({ icon: '⚠️', type: 'pay', title: 'Transaction error', sub: escHtml(tx.message || tx.error) });
	}

	// Oracle delivers the service
	await delay(400);
	sellerAnim('idle');

	if (data.sellerSaid) {
		showSpeech(speechSeller, data.sellerSaid, 'seller', 9000);
		sellerSay(data.sellerSaid);

		addFeedItem({
			icon: '✅',
			type: 'data',
			title: `${name} delivered`,
			sub: escHtml(data.sellerSaid.slice(0, 140) + (data.sellerSaid.length > 140 ? '…' : '')),
		});
	}

	setStatus('Transaction complete · Select another service to continue');
	busy = false;
	setButtons(false);

	// Refresh wallet balances to reflect the just-completed trade.
	refreshWalletStatus();
}

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
