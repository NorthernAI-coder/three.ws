// Privy headless auth for login and register pages.
// Handles email-OTP, EVM wallet (SIWE via Privy), and Solana wallet (SIWS via Privy).
// On success POSTs the Privy identity_token to /api/auth/privy/verify
// which issues our standard session cookie, then redirects.

import Privy, { LocalStorage, createSiwsMessage } from '@privy-io/js-sdk-core';
import bs58 from 'bs58';

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

// ── Solana wallet detection ───────────────────────────────────────────────────

function getSolanaProvider() {
	if (window.phantom?.solana?.isPhantom)  return window.phantom.solana;
	if (window.solana?.isPhantom)           return window.solana;
	if (window.backpack?.solana)            return window.backpack.solana;
	if (window.solflare?.isSolflare)        return window.solflare;
	return null;
}

// ── UI ───────────────────────────────────────────────────────────────────────

function mountPrivyUI(privy) {
	// Email OTP elements
	const stepEmail    = document.getElementById('privy-step-email');
	const stepCode     = document.getElementById('privy-step-code');
	const emailInput   = document.getElementById('privy-email-input');
	const codeInput    = document.getElementById('privy-code-input');
	const sendBtn      = document.getElementById('privy-send-btn');
	const verifyBtn    = document.getElementById('privy-verify-btn');
	const backBtn      = document.getElementById('privy-back-btn');
	const errEl        = document.getElementById('privy-inline-err');

	// Wallet elements
	const walletWrap   = document.getElementById('privy-wallet-wrap');
	const evmBtn       = document.getElementById('privy-evm-btn');
	const solanaBtn    = document.getElementById('privy-solana-btn');
	const walletStatus = document.getElementById('privy-wallet-status');

	if (!stepEmail) return;

	let pendingEmail = '';

	function showErr(msg) {
		if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
	}
	function clearErr() {
		if (errEl) { errEl.textContent = ''; errEl.hidden = true; }
	}

	function showStep(step) {
		clearErr();
		stepEmail.hidden = step !== 'email';
		stepCode.hidden  = step !== 'code';
		if (walletWrap) walletWrap.hidden = step !== 'email';
	}

	function reset() {
		showStep('email');
		if (emailInput) emailInput.value = '';
		if (codeInput) codeInput.value = '';
		resetWalletBtns();
		emailInput?.focus();
	}

	const evmBtnHTML    = evmBtn?.innerHTML    ?? '';
	const solanaBtnHTML = solanaBtn?.innerHTML ?? '';

	function resetWalletBtns() {
		if (evmBtn)    { evmBtn.disabled = false;    evmBtn.innerHTML = evmBtnHTML; }
		if (solanaBtn) { solanaBtn.disabled = false;  solanaBtn.innerHTML = solanaBtnHTML; }
		if (walletStatus) { walletStatus.textContent = ''; walletStatus.hidden = true; }
	}

	function setWalletStatus(msg) {
		if (walletStatus) { walletStatus.textContent = msg; walletStatus.hidden = false; }
	}

	// Initialize — show email step
	showStep('email');

	backBtn?.addEventListener('click', reset);

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

	evmBtn?.addEventListener('click', async () => {
		if (!window.ethereum) {
			showErr('No EVM wallet detected. Install MetaMask or another browser wallet.');
			return;
		}
		evmBtn.disabled = true;
		evmBtn.innerHTML = 'Connecting…';
		if (solanaBtn) solanaBtn.disabled = true;
		setWalletStatus('Requesting accounts…');
		clearErr();

		try {
			const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
			const address  = accounts[0];
			if (!address) throw new Error('No account returned from wallet.');

			const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
			const chainId    = parseInt(chainIdHex, 16);

			setWalletStatus('Generating sign-in message…');
			const { message } = await privy.auth.siwe.init(
				{ address, chainId },
				location.hostname,
				location.origin,
			);

			setWalletStatus('Sign the message in your wallet…');
			const signature = await window.ethereum.request({
				method: 'personal_sign',
				params: [message, address],
			});

			setWalletStatus('Signing in…');
			const { identity_token } = await privy.auth.siwe.loginWithSiwe(signature);
			if (!identity_token) throw new Error('No identity token returned.');

			await verifyWithBackend(identity_token);
		} catch (e) {
			const raw = e?.message || '';
			showErr(/reject|denied|cancel|refused/i.test(raw) ? 'Signature cancelled.' : raw || 'Wallet sign-in failed.');
			resetWalletBtns();
		}
	});

	// ── Solana Wallet (SIWS via Privy) ─────────────────────────────────────────

	solanaBtn?.addEventListener('click', async () => {
		const provider = getSolanaProvider();
		if (!provider) {
			showErr('No Solana wallet detected. Install Phantom, Backpack, or Solflare.');
			return;
		}
		solanaBtn.disabled = true;
		solanaBtn.innerHTML = 'Connecting…';
		if (evmBtn) evmBtn.disabled = true;
		setWalletStatus('Connecting wallet…');
		clearErr();

		try {
			const resp    = await provider.connect();
			const address = resp.publicKey.toString();

			setWalletStatus('Generating sign-in message…');
			const { nonce } = await privy.auth.siws.fetchNonce({ address });
			const message   = createSiwsMessage({
				address,
				nonce,
				domain: location.hostname,
				uri:    location.origin,
			});

			setWalletStatus('Sign the message in your wallet…');
			const { signature: sigBytes } = await provider.signMessage(
				new TextEncoder().encode(message),
				'utf8',
			);
			const signature = bs58.encode(sigBytes);

			setWalletStatus('Signing in…');
			const { identity_token } = await privy.auth.siws.login({ message, signature });
			if (!identity_token) throw new Error('No identity token returned.');

			await verifyWithBackend(identity_token);
		} catch (e) {
			const raw = e?.message || '';
			showErr(/reject|denied|cancel|refused/i.test(raw) ? 'Signature cancelled.' : raw || 'Wallet sign-in failed.');
			resetWalletBtns();
		}
	});
}
