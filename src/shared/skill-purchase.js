/**
 * Shared skill / asset purchase engine (Solana Pay).
 *
 * Extracted so any agent surface — the marketplace SPA and the standalone
 * /agents/:id detail page — drives the exact same on-chain purchase flow
 * instead of forking a second, divergent payment path.
 *
 * One-shot Solana Pay purchase: the server mints a unique reference Pubkey, the
 * buyer's connected wallet (Phantom / Solflare / Backpack) sends USDC + the
 * reference in a single tx, the server verifies on-chain via
 * findReference / validateTransfer, and the (user, agent, skill) tuple lands in
 * skill_purchases as 'confirmed'. A mobile QR path (Solana Pay URL) is offered
 * when no browser wallet is present.
 *
 * Usage:
 *   import { configureSkillPurchase, openPurchaseFlow } from './shared/skill-purchase.js';
 *   configureSkillPurchase({ getAgent: () => currentAgent, onPurchased: (id) => reload(id) });
 *   openPurchaseFlow(agentId, skillName);
 *
 * The payment modal DOM is injected lazily into <body> on first use, so host
 * pages do not need to ship the markup. If a page already contains an element
 * with id="payment-modal-overlay" (e.g. the marketplace), that one is reused.
 */

import { log } from './log.js';

export const USDC_MAINNET_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
	return String(s ?? '').replace(
		/[&<>"']/g,
		(ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
	);
}

// ── Host configuration ──────────────────────────────────────────────────────

let cfg = {
	getAgent: () => null,
	// Called with the agentId after a successful skill purchase / trial so the
	// host can refresh the user's owned-skills state and re-render badges.
	onPurchased: async () => {},
};

export function configureSkillPurchase(next = {}) {
	cfg = { ...cfg, ...next };
	ensureModal();
}

// ── Modal injection ─────────────────────────────────────────────────────────

const MODAL_HTML = `
<div class="market-modal-overlay" id="payment-modal-overlay" hidden aria-modal="true" role="dialog" aria-labelledby="payment-modal-title">
	<div class="market-modal">
		<div class="market-modal-head">
			<h2 id="payment-modal-title">Unlock skill</h2>
			<button class="market-modal-close" id="payment-modal-close" aria-label="Close">×</button>
		</div>
		<div class="payment-modal-body" id="payment-modal-body">
			<div class="payment-modal-badge" id="payment-modal-badge" hidden></div>
			<p id="payment-modal-lede">You are purchasing access to the following skill:</p>
			<div class="payment-item">
				<strong id="payment-skill-name"></strong>
				<span id="payment-item-from">from agent</span>
				<em id="payment-agent-name"></em>
			</div>
			<div class="payment-price">
				<span>Total</span>
				<strong id="payment-price-display"></strong>
			</div>
			<div class="payment-wallet-area" id="payment-wallet-area"></div>
			<button class="btn-primary payment-confirm-btn" id="payment-confirm-btn" disabled>Confirm purchase</button>
			<div class="payment-qr" id="payment-qr" aria-live="polite"></div>
			<div class="payment-status" id="payment-status" role="status" aria-live="polite"></div>
		</div>
		<div class="payment-modal-success" id="payment-modal-success" hidden role="status" aria-live="polite"></div>
	</div>
</div>`;

let modalReady = false;

function ensureModal() {
	if (modalReady) return;
	if (!$('payment-modal-overlay')) {
		const wrap = document.createElement('div');
		wrap.innerHTML = MODAL_HTML.trim();
		document.body.appendChild(wrap.firstChild);
	}
	$('payment-modal-close')?.addEventListener('click', closePaymentModal);
	$('payment-confirm-btn')?.addEventListener('click', handlePurchase);
	$('payment-modal-overlay')?.addEventListener('click', (e) => {
		if (e.target.id === 'payment-modal-overlay') closePaymentModal();
	});
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && !$('payment-modal-overlay')?.hidden) closePaymentModal();
	});
	modalReady = true;
}

// ── Price formatting ────────────────────────────────────────────────────────

export function formatAssetPrice(price) {
	if (!price || price.amount == null) return null;
	const decimals = Number(price.mint_decimals ?? 6);
	const amount = Number(price.amount);
	if (!Number.isFinite(amount) || amount <= 0) return null;
	const value = amount / Math.pow(10, decimals);
	const symbol =
		price.currency_mint === USDC_MAINNET_MINT ? 'USDC' : (price.currency_mint || '').slice(0, 4) + '…';
	const formatted = value >= 100 ? value.toFixed(0) : value >= 1 ? value.toFixed(2) : value.toFixed(3);
	return `${formatted.replace(/\.?0+$/, '')} ${symbol}`;
}

export function shortMintLabel(mint) {
	if (mint === USDC_MAINNET_MINT) return 'USDC';
	if (mint === 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB') return 'USDT';
	return (mint || '').slice(0, 4) + '…';
}

// ── Modal chrome helpers ────────────────────────────────────────────────────

function setStatus(text, kind) {
	const el = $('payment-status');
	if (!el) return;
	el.textContent = text;
	el.className = 'payment-status' + (kind ? ' ' + kind : '');
}
function setPaymentTitle(text) { const el = $('payment-modal-title'); if (el) el.textContent = text; }
function setPaymentLede(text) { const el = $('payment-modal-lede'); if (el) el.textContent = text; }
function setPaymentFromLabel(text) { const el = $('payment-item-from'); if (el) el.textContent = text; }
function setPaymentBadge(html, kind) {
	const el = $('payment-modal-badge');
	if (!el) return;
	if (!html) { el.hidden = true; el.innerHTML = ''; el.className = 'payment-modal-badge'; return; }
	el.hidden = false;
	el.className = 'payment-modal-badge' + (kind ? ' ' + kind : '');
	el.innerHTML = html;
}

function renderPaymentSuccess({ title, message, primaryHref, primaryLabel, secondaryLabel = 'Done' }) {
	const body = $('payment-modal-body');
	const success = $('payment-modal-success');
	if (!body || !success) return;
	body.hidden = true;
	const primary = primaryHref
		? `<a class="btn-primary" href="${escapeHtml(primaryHref)}" data-success-primary>${escapeHtml(primaryLabel || 'View')}</a>`
		: '';
	success.innerHTML = `
		<div class="ps-check" aria-hidden="true">✓</div>
		<h3 class="ps-title">${escapeHtml(title)}</h3>
		${message ? `<p class="ps-sub">${escapeHtml(message)}</p>` : ''}
		<div class="ps-actions">
			${primary}
			<button type="button" class="btn-secondary" data-success-close>${escapeHtml(secondaryLabel)}</button>
		</div>`;
	success.hidden = false;
	success.querySelector('[data-success-close]')?.addEventListener('click', closePaymentModal);
}

function renderPaymentVerifyAgain({ txid, message, retryFn }) {
	const status = $('payment-status');
	const confirmBtn = $('payment-confirm-btn');
	if (confirmBtn) confirmBtn.hidden = true;
	if (!status) return;
	const explorer = txid ? `https://solscan.io/tx/${encodeURIComponent(txid)}` : '';
	status.className = 'payment-status';
	status.innerHTML = `
		<div class="payment-modal-retry">
			<p>${escapeHtml(message || "We couldn't confirm with the server in time. Your payment is safe — re-verify below.")}</p>
			${explorer ? `<div class="retry-tx">Tx: <a href="${escapeHtml(explorer)}" target="_blank" rel="noopener">${escapeHtml(txid.slice(0, 12))}…</a></div>` : ''}
			<div class="retry-actions">
				<button type="button" class="retry-primary" data-retry-verify>Verify again</button>
				<button type="button" class="retry-secondary" data-retry-close>Close</button>
			</div>
		</div>`;
	const retryBtn = status.querySelector('[data-retry-verify]');
	retryBtn?.addEventListener('click', async () => {
		retryBtn.disabled = true;
		retryBtn.textContent = 'Verifying…';
		try {
			await retryFn();
		} catch (err) {
			retryBtn.disabled = false;
			retryBtn.textContent = 'Verify again';
			setStatus(err.message || 'Verification failed', 'err');
		}
	});
	status.querySelector('[data-retry-close]')?.addEventListener('click', closePaymentModal);
}

function closePaymentModal() {
	const overlay = $('payment-modal-overlay');
	if (overlay) overlay.hidden = true;
	const qr = $('payment-qr'); if (qr) qr.innerHTML = '';
	const confirmBtn = $('payment-confirm-btn');
	if (confirmBtn) {
		delete confirmBtn.dataset.durationHours;
		delete confirmBtn.dataset.mode;
		confirmBtn.hidden = false;
		confirmBtn.disabled = true;
	}
	const body = $('payment-modal-body');
	const success = $('payment-modal-success');
	if (body) body.hidden = false;
	if (success) { success.hidden = true; success.innerHTML = ''; }
	setPaymentBadge('');
	setStatus('');
	pendingAssetPurchase = null;
}

// ── Wallet plumbing ─────────────────────────────────────────────────────────

let solanaConnection;
let solanaWeb3Mod;
let splTokenMod;
let connectedWallet = null; // { provider, name, publicKey }

const WALLET_PROVIDERS = [
	{ key: 'phantom', name: 'Phantom', detect: () => window.phantom?.solana || (window.solana?.isPhantom && window.solana) },
	{ key: 'solflare', name: 'Solflare', detect: () => window.solflare },
	{ key: 'backpack', name: 'Backpack', detect: () => window.backpack?.solana || (window.solana?.isBackpack && window.solana) },
];

async function loadSolanaModules() {
	if (!solanaWeb3Mod) solanaWeb3Mod = await import('@solana/web3.js');
	if (!splTokenMod) splTokenMod = await import('@solana/spl-token');
	return { web3: solanaWeb3Mod, spl: splTokenMod };
}

async function getSolanaConnection() {
	if (solanaConnection) return solanaConnection;
	const { web3 } = await loadSolanaModules();
	const rpcOrigin = window.location?.origin || 'https://three.ws';
	solanaConnection = new web3.Connection(`${rpcOrigin}/api/solana-rpc`, 'confirmed');
	return solanaConnection;
}

function listAvailableWallets() {
	return WALLET_PROVIDERS.map((p) => ({ ...p, provider: p.detect() })).filter((p) => p.provider);
}

async function connectWalletProvider(providerKey) {
	const entry = WALLET_PROVIDERS.find((p) => p.key === providerKey);
	if (!entry) throw new Error('unknown wallet');
	const provider = entry.detect();
	if (!provider) throw new Error(`${entry.name} not installed`);
	const { web3 } = await loadSolanaModules();
	const resp = await provider.connect();
	const pubKey = resp?.publicKey ?? provider.publicKey;
	if (!pubKey) throw new Error('wallet did not return a public key');
	connectedWallet = {
		provider,
		name: entry.name,
		publicKey: typeof pubKey === 'string' ? new web3.PublicKey(pubKey) : pubKey,
	};
	updateWalletUI();
}

function disconnectWallet() {
	try { connectedWallet?.provider?.disconnect?.(); } catch {}
	connectedWallet = null;
	updateWalletUI();
}

function updateWalletUI() {
	const walletArea = $('payment-wallet-area');
	const confirmBtn = $('payment-confirm-btn');
	if (!walletArea) return;

	if (connectedWallet) {
		const pk = connectedWallet.publicKey.toBase58();
		walletArea.innerHTML = `
			<p>Connected via <strong>${escapeHtml(connectedWallet.name)}</strong>: ${pk.slice(0, 4)}…${pk.slice(-4)}</p>
			<button class="btn-secondary" id="payment-disconnect-btn">Disconnect</button>`;
		$('payment-disconnect-btn').addEventListener('click', disconnectWallet);
		if (confirmBtn) confirmBtn.disabled = false;
		return;
	}

	const available = listAvailableWallets();
	if (!available.length) {
		walletArea.innerHTML = `
			<p class="muted">No browser wallet detected.</p>
			<button class="btn-primary" id="payment-show-qr">Use a mobile wallet (QR)</button>
			<p class="muted small">Install <a href="https://phantom.app" target="_blank" rel="noopener">Phantom</a>,
			<a href="https://solflare.com" target="_blank" rel="noopener">Solflare</a>, or
			<a href="https://backpack.app" target="_blank" rel="noopener">Backpack</a>.</p>`;
	} else {
		const btns = available
			.map((w) => `<button class="btn-primary wallet-pick" data-wallet="${w.key}">Connect ${escapeHtml(w.name)}</button>`)
			.join('');
		walletArea.innerHTML = `${btns}<button class="btn-secondary" id="payment-show-qr">Use a mobile wallet (QR)</button>`;
		walletArea.querySelectorAll('.wallet-pick').forEach((btn) => {
			btn.addEventListener('click', async () => {
				const key = btn.dataset.wallet;
				btn.textContent = 'Connecting…';
				btn.disabled = true;
				try {
					await connectWalletProvider(key);
				} catch (e) {
					const name = WALLET_PROVIDERS.find((p) => p.key === key)?.name ?? key;
					btn.textContent = `Connect ${name}`;
					btn.disabled = false;
					setStatus(e.message, 'err');
				}
			});
		});
	}
	$('payment-show-qr')?.addEventListener('click', startQrPurchase);
	if (confirmBtn) confirmBtn.disabled = true;
}

// ── CSRF ────────────────────────────────────────────────────────────────────

let _csrf = null;
async function getCsrfToken() {
	if (_csrf && _csrf.expiresAt > Date.now() + 5_000) return _csrf.token;
	const r = await fetch('/api/csrf-token', { credentials: 'include' });
	if (!r.ok) throw new Error('Could not obtain CSRF token; sign in again.');
	const j = await r.json();
	_csrf = { token: j.data.token, expiresAt: Date.now() + (j.data.expires_in - 30) * 1000 };
	return _csrf.token;
}
export async function apiPostWithCsrf(url, body) {
	const token = await getCsrfToken();
	_csrf = null;
	return fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
		credentials: 'include',
		body: body == null ? undefined : JSON.stringify(body),
	});
}

async function buildSplTransferWithReference({ payer, recipient, mint, amount, reference }) {
	const { web3, spl } = await loadSolanaModules();
	const { PublicKey, Transaction } = web3;
	const { getAssociatedTokenAddress, createTransferInstruction } = spl;

	const recipientKey = new PublicKey(recipient);
	const mintKey = new PublicKey(mint);
	const referenceKey = new PublicKey(reference);

	const fromAta = await getAssociatedTokenAddress(mintKey, payer);
	const toAta = await getAssociatedTokenAddress(mintKey, recipientKey);

	const ix = createTransferInstruction(fromAta, toAta, payer, amount);
	ix.keys.push({ pubkey: referenceKey, isSigner: false, isWritable: false });

	const { blockhash } = await (await getSolanaConnection()).getLatestBlockhash('confirmed');
	const tx = new Transaction({ feePayer: payer, recentBlockhash: blockhash }).add(ix);
	return tx;
}

// ── Server purchase records ─────────────────────────────────────────────────

async function createPendingPurchase(agentId, skill, durationHours = null) {
	const body = { agent_id: agentId, skill };
	if (durationHours) body.duration_hours = durationHours;
	const r = await apiPostWithCsrf('/api/marketplace/purchase', body);
	const j = await r.json();
	if (!r.ok) throw new Error(j.error_description || j.error || 'Failed to create purchase');
	return j.data;
}

async function pollConfirm(reference, windowMs = 60_000) {
	const deadline = Date.now() + windowMs;
	while (Date.now() < deadline) {
		const r = await apiPostWithCsrf(`/api/marketplace/purchase/${reference}/confirm`, null);
		const j = await r.json().catch(() => ({}));
		if (r.ok && j.data?.status === 'confirmed') return true;
		if (j.status === 'tipped') {
			throw new Error('Payment received but amount/mint did not match — seller has been notified.');
		}
		if (r.status === 410) throw new Error('Pending purchase expired. Please try again.');
		if (r.status === 409 && !j.status) throw new Error(j.error_description || 'Transfer did not match.');
		await new Promise((res) => setTimeout(res, 2500));
	}
	return false;
}

// ── Skill purchase flows ────────────────────────────────────────────────────

export async function openPurchaseFlow(agentId, skill) {
	ensureModal();
	const agent = cfg.getAgent();
	if (!agent || agent.id !== agentId) { alert('Agent not loaded; refresh and try again.'); return; }
	const price = agent.skill_prices?.[skill];
	if (!price) { alert('No price set for this skill.'); return; }

	const decimals = Number(price.mint_decimals ?? 6);
	const human = (Number(price.amount) / Math.pow(10, decimals)).toFixed(decimals === 6 ? 2 : 4);

	setPaymentTitle('Unlock skill');
	setPaymentLede('You are purchasing permanent access to this skill:');
	setPaymentFromLabel('on agent');
	setPaymentBadge('');
	$('payment-skill-name').textContent = skill;
	$('payment-agent-name').textContent = agent.name;
	$('payment-price-display').textContent = `${human} ${shortMintLabel(price.currency_mint)}`;
	const confirmBtn = $('payment-confirm-btn');
	if (confirmBtn) confirmBtn.textContent = 'Confirm purchase';
	const qr = $('payment-qr'); if (qr) qr.innerHTML = '';
	setStatus('');
	$('payment-modal-overlay').hidden = false;
	updateWalletUI();
}

export async function openTimePassFlow(agentId, skill, durationHours, btn) {
	ensureModal();
	const agent = cfg.getAgent();
	if (!agent || agent.id !== agentId) { alert('Agent not loaded; refresh and try again.'); return; }
	const price = agent.skill_prices?.[skill];
	if (!price) { alert('No price set for this skill.'); return; }

	if (btn) { btn.disabled = true; btn.textContent = 'Preparing…'; }

	setPaymentTitle(`Get ${durationHours}h access`);
	setPaymentLede('You are renting temporary access to this skill:');
	setPaymentFromLabel('on agent');
	setPaymentBadge(
		`<span class="payment-modal-badge-icon" aria-hidden="true">⏱</span><span>Access expires ${durationHours} hour${durationHours === 1 ? '' : 's'} after purchase. Not a permanent unlock.</span>`,
		'warn',
	);
	$('payment-skill-name').textContent = skill;
	$('payment-agent-name').textContent = agent.name;
	const tpAmount = price.time_pass_amount || price.amount;
	const decimals = Number(price.mint_decimals ?? 6);
	const human = (Number(tpAmount) / Math.pow(10, decimals)).toFixed(decimals === 6 ? 2 : 4);
	$('payment-price-display').textContent = `${human} ${shortMintLabel(price.currency_mint)}`;
	const qr = $('payment-qr'); if (qr) qr.innerHTML = '';
	setStatus('');
	$('payment-modal-overlay').hidden = false;
	updateWalletUI();

	const confirmBtn = $('payment-confirm-btn');
	confirmBtn.dataset.durationHours = String(durationHours);
	confirmBtn.textContent = `Pay & unlock ${durationHours}h access`;

	if (btn) { btn.disabled = false; btn.textContent = `Get ${durationHours}h access`; }
}

export async function openTrialFlow(agentId, skill, btn) {
	const agent = cfg.getAgent();
	if (!agent || agent.id !== agentId) { alert('Agent not loaded; refresh and try again.'); return; }
	if (btn) { btn.disabled = true; btn.textContent = 'Starting trial…'; }
	try {
		const r = await apiPostWithCsrf('/api/marketplace/start-trial', { agent_id: agentId, skill });
		const j = await r.json().catch(() => ({}));
		if (!r.ok) {
			if (j.error === 'already_owned') alert('You already own this skill.');
			else if (j.error === 'trial_used') alert('You have already used the trial for this skill.');
			else if (r.status === 401) { location.href = `/login?next=${encodeURIComponent(location.pathname)}`; return; }
			else alert(j.error_description || j.error || 'Failed to start trial');
			return;
		}
		await cfg.onPurchased(agentId);
	} catch (err) {
		alert(err.message || 'Failed to start trial');
	} finally {
		if (btn) { btn.disabled = false; btn.textContent = 'Try free'; }
	}
}

// ── Asset purchase (agent / avatar / plugin) ────────────────────────────────

let pendingAssetPurchase = null;

export function openAssetPurchaseFlow(asset) {
	ensureModal();
	const confirmBtn = $('payment-confirm-btn');
	const skillName = $('payment-skill-name');
	const agentName = $('payment-agent-name');
	const priceDisplay = $('payment-price-display');
	if (!confirmBtn || !skillName || !priceDisplay) { alert('Payment UI not available on this page.'); return; }

	pendingAssetPurchase = asset;
	confirmBtn.dataset.mode = 'asset';
	confirmBtn.disabled = false;
	confirmBtn.hidden = false;
	delete confirmBtn.dataset.durationHours;

	const typeLabel = asset.item_type ? asset.item_type.charAt(0).toUpperCase() + asset.item_type.slice(1) : 'Asset';
	setPaymentTitle(`Buy ${typeLabel}`);
	setPaymentLede(`You are buying this ${asset.item_type || 'asset'}:`);
	setPaymentFromLabel(typeLabel);
	setPaymentBadge('');
	confirmBtn.textContent = 'Confirm purchase';

	skillName.textContent = asset.label || 'Asset';
	if (agentName) agentName.textContent = '';

	const decimals = Number(asset.price?.mint_decimals ?? 6);
	const human = (Number(asset.price?.amount || 0) / Math.pow(10, decimals)).toFixed(decimals === 6 ? 2 : 4);
	priceDisplay.textContent = `${human} ${shortMintLabel(asset.price?.currency_mint || '')}`;

	const qr = $('payment-qr'); if (qr) qr.innerHTML = '';
	setStatus('');
	$('payment-modal-overlay').hidden = false;
	updateWalletUI();
}

async function createPendingAssetPurchase(itemType, itemId) {
	const r = await apiPostWithCsrf('/api/marketplace/buy-asset', { item_type: itemType, item_id: itemId });
	const j = await r.json();
	if (!r.ok) throw new Error(j.error_description || j.error || 'Failed to create purchase');
	return j.data;
}

async function pollAssetConfirm(reference, windowMs = 60_000) {
	const deadline = Date.now() + windowMs;
	while (Date.now() < deadline) {
		const r = await apiPostWithCsrf(`/api/marketplace/buy-asset/${reference}/confirm`, null);
		const j = await r.json().catch(() => ({}));
		if (r.ok && j.data?.status === 'confirmed') return true;
		if (r.status === 410) throw new Error('Pending purchase expired. Please try again.');
		if (r.status === 409) throw new Error(j.error_description || 'Transfer did not match expected amount.');
		await new Promise((res) => setTimeout(res, 2500));
	}
	return false;
}

function assetViewTarget(asset) {
	const type = asset?.item_type;
	if (type === 'avatar') return { href: '/dashboard/avatars', label: 'View avatar' };
	if (type === 'agent') return { href: '/dashboard/agents', label: 'View agent' };
	if (type === 'plugin') return { href: '/dashboard', label: 'View plugin' };
	return { href: '/dashboard', label: 'View in dashboard' };
}

// ── Confirm handlers ────────────────────────────────────────────────────────

async function handlePurchase() {
	const confirmBtn = $('payment-confirm-btn');
	if (confirmBtn?.dataset.mode === 'asset') return handleAssetPurchase();
	if (!connectedWallet) { setStatus('Connect a wallet first.', 'err'); return; }
	const agent = cfg.getAgent();
	if (!agent) return;

	confirmBtn.disabled = true;
	setStatus('Creating purchase…');

	const agentId = agent.id;
	const skill = $('payment-skill-name').textContent;
	const durationHours = confirmBtn.dataset.durationHours ? Number(confirmBtn.dataset.durationHours) : null;

	const onUnlocked = async () => {
		await cfg.onPurchased(agentId);
		renderPaymentSuccess({
			title: durationHours ? `${durationHours}h access unlocked` : 'Skill unlocked',
			message: durationHours
				? `${skill} is now usable. Access ends ${durationHours} hour${durationHours === 1 ? '' : 's'} from now.`
				: `${skill} is now part of your library on ${agent.name}.`,
			primaryHref: null,
			secondaryLabel: 'Done',
		});
	};

	let purchase;
	try {
		purchase = await createPendingPurchase(agentId, skill, durationHours);
		if (purchase.already_owned) {
			await cfg.onPurchased(agentId);
			renderPaymentSuccess({
				title: 'Already unlocked',
				message: `You already have access to ${skill}.`,
				primaryHref: null,
				secondaryLabel: 'Continue',
			});
			return;
		}
	} catch (e) {
		setStatus(e.message, 'err');
		confirmBtn.disabled = false;
		return;
	}

	let txid;
	try {
		setStatus('Building transfer…');
		const tx = await buildSplTransferWithReference({
			payer: connectedWallet.publicKey,
			recipient: purchase.recipient,
			mint: purchase.currency_mint,
			amount: BigInt(purchase.amount),
			reference: purchase.reference,
		});

		setStatus('Approve in wallet…');
		if (typeof connectedWallet.provider.signAndSendTransaction === 'function') {
			const result = await connectedWallet.provider.signAndSendTransaction(tx);
			txid = result?.signature ?? result;
		} else {
			txid = await connectedWallet.provider.sendTransaction(tx, await getSolanaConnection());
		}

		setStatus('Waiting for on-chain confirmation…');
		await (await getSolanaConnection()).confirmTransaction(txid, 'confirmed');

		setStatus('Verifying with server…');
		const ok = await pollConfirm(purchase.reference, 60_000);
		if (!ok) {
			renderPaymentVerifyAgain({
				txid,
				message: "Payment is on-chain but the server hasn't seen it yet. Re-verify below.",
				retryFn: async () => {
					const ok2 = await pollConfirm(purchase.reference, 60_000);
					if (!ok2) throw new Error('Still not confirmed — wait a few seconds and try again.');
					await onUnlocked();
				},
			});
			return;
		}
		await onUnlocked();
	} catch (e) {
		log.error('[skill-purchase] purchase failed', e);
		if (txid) {
			renderPaymentVerifyAgain({
				txid,
				message: e.message || 'Payment sent but verification failed — re-verify below.',
				retryFn: async () => {
					const ok2 = await pollConfirm(purchase.reference, 60_000);
					if (!ok2) throw new Error('Still not confirmed — wait a few seconds and try again.');
					await onUnlocked();
				},
			});
			return;
		}
		setStatus(e.message || 'Purchase failed', 'err');
		confirmBtn.disabled = false;
	}
}

async function handleAssetPurchase() {
	const confirmBtn = $('payment-confirm-btn');
	const asset = pendingAssetPurchase;
	if (!asset) { setStatus('No asset selected.', 'err'); return; }
	if (!connectedWallet) { setStatus('Connect a wallet first.', 'err'); return; }

	confirmBtn.disabled = true;
	setStatus('Creating purchase…');

	let purchase;
	try {
		purchase = await createPendingAssetPurchase(asset.item_type, asset.item_id);
		if (purchase.already_owned) {
			const target = assetViewTarget(asset);
			renderPaymentSuccess({
				title: 'Already owned',
				message: `You already purchased ${asset.label}.`,
				primaryHref: target.href,
				primaryLabel: target.label,
			});
			return;
		}
	} catch (e) {
		setStatus(e.message, 'err');
		confirmBtn.disabled = false;
		return;
	}

	let txid;
	try {
		setStatus('Building transfer…');
		const tx = await buildSplTransferWithReference({
			payer: connectedWallet.publicKey,
			recipient: purchase.recipient,
			mint: purchase.currency_mint,
			amount: BigInt(purchase.amount),
			reference: purchase.reference,
		});

		setStatus('Approve in wallet…');
		if (typeof connectedWallet.provider.signAndSendTransaction === 'function') {
			const result = await connectedWallet.provider.signAndSendTransaction(tx);
			txid = result?.signature ?? result;
		} else {
			txid = await connectedWallet.provider.sendTransaction(tx, await getSolanaConnection());
		}

		setStatus('Waiting for on-chain confirmation…');
		await (await getSolanaConnection()).confirmTransaction(txid, 'confirmed');

		setStatus('Verifying with server…');
		const ok = await pollAssetConfirm(purchase.reference, 60_000);
		const succeed = () => {
			const target = assetViewTarget(asset);
			renderPaymentSuccess({
				title: `${asset.label} purchased`,
				message: `${asset.item_type === 'avatar' ? 'Your new avatar' : asset.item_type === 'agent' ? 'Your new agent' : 'Your purchase'} is in your dashboard.`,
				primaryHref: target.href,
				primaryLabel: target.label,
			});
			cfg.onPurchased(asset.item_id).catch(() => {});
		};
		if (!ok) {
			renderPaymentVerifyAgain({
				txid,
				message: "We couldn't verify the transfer with the server in 60s. The on-chain transaction is safe — re-verify below.",
				retryFn: async () => {
					const ok2 = await pollAssetConfirm(purchase.reference, 60_000);
					if (!ok2) throw new Error('Still not confirmed — wait a few seconds and try again.');
					succeed();
				},
			});
			return;
		}
		succeed();
	} catch (e) {
		log.error('[skill-purchase] asset purchase failed', e);
		if (txid) {
			renderPaymentVerifyAgain({
				txid,
				message: e.message || 'Payment sent but verification failed — re-verify below.',
				retryFn: async () => {
					const ok2 = await pollAssetConfirm(purchase.reference, 60_000);
					if (!ok2) throw new Error('Still not confirmed — wait a few seconds and try again.');
					const target = assetViewTarget(asset);
					renderPaymentSuccess({
						title: `${asset.label} purchased`,
						message: `${asset.item_type === 'avatar' ? 'Your new avatar' : 'Your purchase'} is in your dashboard.`,
						primaryHref: target.href,
						primaryLabel: target.label,
					});
				},
			});
			return;
		}
		setStatus(e.message || 'Purchase failed', 'err');
		confirmBtn.disabled = false;
	}
}

// Mobile-wallet path: render a Solana Pay QR. Buyer scans + signs on phone.
async function startQrPurchase() {
	const agent = cfg.getAgent();
	if (!agent) return;
	const agentId = agent.id;
	const skill = $('payment-skill-name').textContent;

	setStatus('Creating purchase…');
	let purchase;
	try {
		purchase = await createPendingPurchase(agentId, skill);
		if (purchase.already_owned) {
			await cfg.onPurchased(agentId);
			renderPaymentSuccess({
				title: 'Already unlocked',
				message: `You already have access to ${skill}.`,
				primaryHref: null,
				secondaryLabel: 'Continue',
			});
			return;
		}
	} catch (e) {
		setStatus(e.message, 'err');
		return;
	}

	const decimals = Number(purchase.mint_decimals ?? 6);
	const human = (Number(purchase.amount) / Math.pow(10, decimals)).toString();
	const url = new URL(`solana:${purchase.recipient}`);
	url.searchParams.set('amount', human);
	url.searchParams.set('spl-token', purchase.currency_mint);
	url.searchParams.set('reference', purchase.reference);
	url.searchParams.set('label', purchase.label || `Skill: ${skill}`);
	url.searchParams.set('message', purchase.message || `Unlock '${skill}'`);

	const qrEl = $('payment-qr');
	if (qrEl) {
		qrEl.innerHTML = `<canvas id="payment-qr-canvas" width="240" height="240"></canvas>
			<p class="muted small">Scan with a Solana Pay wallet (Phantom mobile, Solflare mobile, etc.)</p>`;
		const QRCode = await import('qrcode');
		await (QRCode.default ?? QRCode).toCanvas(document.getElementById('payment-qr-canvas'), url.toString(), { width: 240 });
	}

	setStatus('Waiting for payment on your phone…');
	const ok = await pollConfirm(purchase.reference, 300_000);
	if (ok) {
		await cfg.onPurchased(agentId);
		renderPaymentSuccess({
			title: 'Skill unlocked',
			message: `${skill} is now part of your library on ${agent.name}.`,
			primaryHref: null,
			secondaryLabel: 'Done',
		});
	} else {
		renderPaymentVerifyAgain({
			txid: null,
			message: 'No confirmation in 5 minutes. If you paid, re-verify below; otherwise the pending purchase will expire automatically.',
			retryFn: async () => {
				const ok2 = await pollConfirm(purchase.reference, 60_000);
				if (!ok2) throw new Error('Still no confirmation — give it another minute.');
				await cfg.onPurchased(agentId);
				renderPaymentSuccess({
					title: 'Skill unlocked',
					message: `${skill} is now part of your library on ${agent.name}.`,
					primaryHref: null,
					secondaryLabel: 'Done',
				});
			},
		});
	}
}
