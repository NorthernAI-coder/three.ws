// Privy headless auth for login and register pages.
// Handles email-OTP and EVM wallet (SIWE via Privy).
// On success POSTs the Privy identity_token to /api/auth/privy/verify
// which issues our standard session cookie, then redirects.

import Privy, { LocalStorage } from '@privy-io/js-sdk-core';

const next =
	window.__loginNext ||
	new URLSearchParams(location.search).get('next') ||
	sessionStorage.getItem('login_redirect') ||
	'/dashboard';
sessionStorage.removeItem('login_redirect');

// ── Bootstrap ────────────────────────────────────────────────────────────────

async function getAppId() {
	try {
		const r = await fetch('/api/config');
		const cfg = await r.json();
		return cfg.privyAppId || null;
	} catch {
		return null;
	}
}

const appId = await getAppId();

// If Privy is not configured, hide the section and exit.
const section = document.getElementById('privy-section');
const divider = document.getElementById('privy-or-divider');

if (!appId) {
	if (section) section.style.display = 'none';
	if (divider) divider.style.display = 'none';
} else {
	const privy = new Privy({ appId, storage: new LocalStorage() });
	mountPrivyUI(privy);
}

// ── Shared backend verify ─────────────────────────────────────────────────────

async function verifyWithBackend(identity_token) {
	const res = await fetch('/api/auth/privy/verify', {
		method: 'POST',
		credentials: 'include',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ token: identity_token }),
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(data.error_description || 'Sign-in failed.');

	try {
		localStorage.setItem(
			'3dagent:auth-hint',
			JSON.stringify({ authed: true, name: data.user?.display_name || '', ts: Date.now() }),
		);
	} catch { /* ignore */ }

	location.href = next;
}

// ── UI ───────────────────────────────────────────────────────────────────────

function mountPrivyUI(privy) {
	// Elements — email OTP
	const toggleBtn    = document.getElementById('privy-toggle-btn');
	const expandedArea = document.getElementById('privy-expanded');
	const stepEmail    = document.getElementById('privy-step-email');
	const stepCode     = document.getElementById('privy-step-code');
	const emailInput   = document.getElementById('privy-email-input');
	const codeInput    = document.getElementById('privy-code-input');
	const sendBtn      = document.getElementById('privy-send-btn');
	const verifyBtn    = document.getElementById('privy-verify-btn');
	const backBtn      = document.getElementById('privy-back-btn');
	const errEl        = document.getElementById('privy-inline-err');

	// Elements — wallet
	const walletWrap   = document.getElementById('privy-wallet-wrap');
	const walletBtn    = document.getElementById('privy-wallet-btn');
	const walletStatus = document.getElementById('privy-wallet-status');

	if (!toggleBtn || !expandedArea) return;

	let pendingEmail = '';

	function showErr(msg) {
		if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
	}
	function clearErr() {
		if (errEl) { errEl.textContent = ''; errEl.hidden = true; }
	}

	function expand() {
		toggleBtn.hidden = true;
		expandedArea.hidden = false;
		showStep('email');
		emailInput?.focus();
	}
	function collapse() {
		toggleBtn.hidden = false;
		expandedArea.hidden = true;
		clearErr();
		if (emailInput) emailInput.value = '';
		if (codeInput) codeInput.value = '';
		if (walletStatus) { walletStatus.textContent = ''; walletStatus.hidden = true; }
	}

	function showStep(step) {
		clearErr();
		stepEmail.hidden = step !== 'email';
		stepCode.hidden  = step !== 'code';
		// Wallet option only shown on email step
		if (walletWrap) walletWrap.hidden = step !== 'email';
	}

	// Open / close
	toggleBtn.addEventListener('click', expand);
	backBtn?.addEventListener('click', collapse);

	// ── Email OTP ──────────────────────────────────────────────────────────────

	sendBtn?.addEventListener('click', async () => {
		const email = emailInput?.value.trim();
		if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			showErr('Enter a valid email address.'); return;
		}
		sendBtn.disabled = true;
		sendBtn.textContent = 'Sending…';
		clearErr();
		try {
			await privy.auth.email.sendCode(email);
			pendingEmail = email;
			showStep('code');
			codeInput?.focus();
		} catch (e) {
			showErr(e?.message || 'Failed to send code. Try again.');
			sendBtn.disabled = false;
			sendBtn.textContent = 'Send code';
		}
	});

	emailInput?.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') { e.preventDefault(); sendBtn?.click(); }
	});

	verifyBtn?.addEventListener('click', async () => {
		const code = codeInput?.value.trim();
		if (!code || code.length < 4) {
			showErr('Enter the code from your email.'); return;
		}
		verifyBtn.disabled = true;
		verifyBtn.textContent = 'Verifying…';
		clearErr();
		try {
			const { identity_token } = await privy.auth.email.loginWithCode(pendingEmail, code);
			if (!identity_token) throw new Error('No identity token returned.');
			verifyBtn.textContent = 'Signing in…';
			await verifyWithBackend(identity_token);
		} catch (e) {
			showErr(e?.message || 'Verification failed. Check the code and try again.');
			verifyBtn.disabled = false;
			verifyBtn.textContent = 'Verify';
		}
	});

	codeInput?.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') { e.preventDefault(); verifyBtn?.click(); }
	});

	codeInput?.addEventListener('input', () => {
		codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
	});

	// ── EVM Wallet (SIWE via Privy) ────────────────────────────────────────────

	walletBtn?.addEventListener('click', async () => {
		if (!window.ethereum) {
			showErr('No wallet detected. Install MetaMask or another browser wallet.');
			return;
		}
		walletBtn.disabled = true;
		walletBtn.textContent = 'Connecting…';
		if (walletStatus) { walletStatus.textContent = 'Requesting accounts…'; walletStatus.hidden = false; }
		clearErr();

		try {
			const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
			const address  = accounts[0];
			if (!address) throw new Error('No account returned from wallet.');

			const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
			const chainId    = parseInt(chainIdHex, 16);

			if (walletStatus) walletStatus.textContent = 'Generating sign-in message…';
			const { message } = await privy.auth.siwe.init(
				{ address, chainId },
				location.hostname,
				location.origin,
			);

			if (walletStatus) walletStatus.textContent = 'Sign the message in your wallet…';
			const signature = await window.ethereum.request({
				method: 'personal_sign',
				params: [message, address],
			});

			if (walletStatus) walletStatus.textContent = 'Signing in…';
			const { identity_token } = await privy.auth.siwe.loginWithSiwe(signature);
			if (!identity_token) throw new Error('No identity token returned.');

			await verifyWithBackend(identity_token);
		} catch (e) {
			const raw = e?.message || '';
			const msg = /reject|denied|cancel|user refused/i.test(raw)
				? 'Signature cancelled.'
				: raw || 'Wallet sign-in failed.';
			showErr(msg);
			walletBtn.disabled = false;
			walletBtn.textContent = 'Connect Wallet';
			if (walletStatus) { walletStatus.textContent = ''; walletStatus.hidden = true; }
		}
	});
}
