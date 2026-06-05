/**
 * add-funds.js — in-product "Add funds / Buy USDC" overlay.
 *
 * Opens a Coinbase Onramp popup (or shows a wallet-address fallback) so a
 * zero-balance user can get USDC without leaving the app.  Polls the wallet
 * balance every 5 s and resolves when the balance increases.
 *
 * Usage:
 *   const newBalance = await showAddFunds({ walletAddress, requiredUsdc });
 *   // newBalance: { usdc: 1.23 } or null if dismissed
 */

const USDC_MINT_SOLANA = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const POLL_INTERVAL_MS = 5000;

function esc(s) {
	return String(s ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

const OVERLAY_HTML = `
<div class="af-overlay" id="af-overlay" role="dialog" aria-modal="true" aria-labelledby="af-title">
	<div class="af-box">
		<div class="af-head">
			<span class="af-title" id="af-title">Add funds</span>
			<button class="af-close" id="af-close" aria-label="Close">×</button>
		</div>
		<div class="af-body">
			<p class="af-desc">Buy USDC to use skills and pay for services. Funds are deposited directly to your connected wallet.</p>
			<div class="af-amounts" id="af-amounts">
				<button class="af-amt" data-amount="10">$10</button>
				<button class="af-amt" data-amount="25">$25</button>
				<button class="af-amt" data-amount="50">$50</button>
			</div>
			<button class="af-cta" id="af-cta">Buy USDC</button>
			<div class="af-alt" id="af-alt">
				<div class="af-alt-label">Or send USDC directly to your wallet:</div>
				<div class="af-addr-row">
					<code class="af-addr" id="af-addr"></code>
					<button class="af-copy" id="af-copy" title="Copy address">Copy</button>
				</div>
				<div class="af-alt-note">Solana network · USDC only</div>
			</div>
			<div class="af-status" id="af-status" role="status" aria-live="polite"></div>
			<div class="af-poll" id="af-poll" hidden>
				<div class="af-poll-indicator"></div>
				<span>Watching for deposit…</span>
			</div>
		</div>
	</div>
</div>
`;

const OVERLAY_STYLE = `
.af-overlay {
	position: fixed; inset: 0; z-index: 10000;
	background: rgba(0,0,0,0.72);
	display: flex; align-items: center; justify-content: center;
	font-family: system-ui, -apple-system, sans-serif;
	animation: af-fade-in 0.15s ease;
}
.af-overlay[hidden] { display: none; }
@keyframes af-fade-in { from { opacity: 0; } to { opacity: 1; } }

.af-box {
	background: #111827; border: 1px solid rgba(255,255,255,0.1);
	border-radius: 16px; padding: 28px 24px; width: 92%; max-width: 400px;
	color: #f0f0f0; box-shadow: 0 24px 64px rgba(0,0,0,0.7);
	animation: af-slide-up 0.2s cubic-bezier(.22,1,.36,1);
}
@keyframes af-slide-up { from { transform: translateY(16px); opacity: 0; } to { transform: none; opacity: 1; } }

.af-head {
	display: flex; align-items: center; justify-content: space-between;
	margin-bottom: 18px;
}
.af-title { font-size: 18px; font-weight: 700; letter-spacing: .01em; }
.af-close {
	background: none; border: none; color: rgba(255,255,255,0.45);
	font-size: 24px; cursor: pointer; line-height: 1; padding: 0;
	transition: color 0.15s;
}
.af-close:hover { color: #fff; }
.af-close:focus-visible { outline: 2px solid rgba(255,255,255,0.4); border-radius: 4px; }

.af-desc {
	font-size: 13px; color: rgba(255,255,255,0.55);
	margin: 0 0 18px; line-height: 1.5;
}

.af-amounts {
	display: flex; gap: 8px; margin-bottom: 14px;
}
.af-amt {
	flex: 1; padding: 9px 0; border-radius: 8px;
	border: 1px solid rgba(255,255,255,0.15);
	background: rgba(255,255,255,0.06); color: #fff;
	font-size: 15px; font-weight: 600; cursor: pointer;
	transition: background 0.12s, border-color 0.12s;
}
.af-amt:hover { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.3); }
.af-amt.selected { background: rgba(255,255,255,0.10); border-color: rgba(255,255,255,0.30); color: #ffffff; }
.af-amt:focus-visible { outline: 2px solid #6366f1; outline-offset: 2px; }

.af-cta {
	display: block; width: 100%; padding: 13px;
	border-radius: 10px; border: none;
	background: rgba(255,255,255,0.12); color: #fff; border: 1px solid rgba(255,255,255,0.18);
	font-size: 15px; font-weight: 700; cursor: pointer;
	transition: opacity 0.15s; letter-spacing: .02em;
	margin-bottom: 16px;
}
.af-cta:hover:not(:disabled) { opacity: 0.88; }
.af-cta:disabled { opacity: 0.4; cursor: default; }
.af-cta:focus-visible { outline: 2px solid rgba(255,255,255,0.4); outline-offset: 2px; }

.af-alt { padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.07); }
.af-alt-label { font-size: 12px; color: rgba(255,255,255,0.4); margin-bottom: 8px; }
.af-addr-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.af-addr {
	flex: 1; font-family: ui-monospace, monospace; font-size: 12px;
	color: rgba(255,255,255,0.7); overflow: hidden; text-overflow: ellipsis;
	white-space: nowrap; background: rgba(255,255,255,0.05);
	border-radius: 6px; padding: 5px 8px;
}
.af-copy {
	flex-shrink: 0; font-size: 12px; padding: 5px 10px;
	border-radius: 6px; border: 1px solid rgba(255,255,255,0.2);
	background: transparent; color: rgba(255,255,255,0.5); cursor: pointer;
	transition: background 0.12s, color 0.12s;
}
.af-copy:hover { background: rgba(255,255,255,0.1); color: #fff; }
.af-copy.copied { color: #34d399; border-color: #34d399; }
.af-alt-note { font-size: 11px; color: rgba(255,255,255,0.3); }

.af-status {
	margin-top: 12px; font-size: 13px; min-height: 18px;
	text-align: center; color: rgba(255,255,255,0.55);
}
.af-status.err { color: #f87171; }
.af-status.ok  { color: #34d399; font-weight: 600; }

.af-poll {
	display: flex; align-items: center; gap: 8px;
	justify-content: center; margin-top: 12px;
	font-size: 12px; color: rgba(255,255,255,0.35);
}
.af-poll[hidden] { display: none; }
.af-poll-indicator {
	width: 6px; height: 6px; border-radius: 50%;
	background: #4f46e5;
	animation: af-pulse 1.4s ease-in-out infinite;
}
@keyframes af-pulse {
	0%, 100% { opacity: 1; transform: scale(1); }
	50% { opacity: 0.4; transform: scale(0.7); }
}
`;

/**
 * Fetch USDC balance for a Solana address via our existing wallet/balances endpoint.
 * Returns the decimal USDC amount (e.g. 1.5 for 1.5 USDC) or null on failure.
 * @param {string} address
 * @returns {Promise<number|null>}
 */
async function fetchUsdcBalance(address) {
	try {
		const r = await fetch('/api/wallet/balances', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ chain: 'solana', address }),
		});
		if (!r.ok) return null;
		const data = await r.json();
		const usdcToken = (data.tokens || []).find(
			(t) => t.mint === USDC_MINT_SOLANA || t.symbol === 'USDC',
		);
		return usdcToken ? Number(usdcToken.amount) || 0 : 0;
	} catch {
		return null;
	}
}

/**
 * Fetch an onramp URL from our server endpoint.
 * Returns { url, mode } or null on failure.
 * @param {string} address  Solana wallet address
 * @param {number} [amount] suggested USD amount
 */
async function fetchOnrampLink(address, amount = 25) {
	try {
		const params = new URLSearchParams({ address, amount: String(amount) });
		const r = await fetch(`/api/onramp/link?${params}`, { credentials: 'include' });
		if (!r.ok) return null;
		return await r.json();
	} catch {
		return null;
	}
}

/**
 * Show the "Add funds" overlay.
 *
 * @param {object} opts
 * @param {string}  opts.walletAddress    the Phantom/Solana wallet to fund
 * @param {number}  [opts.requiredUsdc]   minimum amount needed (shows as suggestion)
 * @param {Element} [opts.container]      defaults to document.body
 * @returns {Promise<{usdc: number}|null>}  resolves with new balance or null if dismissed
 */
export function showAddFunds({ walletAddress, requiredUsdc, container } = {}) {
	return new Promise((resolve) => {
		const root = container || document.body;

		// Inject styles once
		if (!document.getElementById('af-styles')) {
			const style = document.createElement('style');
			style.id = 'af-styles';
			style.textContent = OVERLAY_STYLE;
			document.head.appendChild(style);
		}

		const wrapper = document.createElement('div');
		wrapper.innerHTML = OVERLAY_HTML;
		root.appendChild(wrapper);

		const overlay = wrapper.querySelector('#af-overlay');
		const addrEl  = wrapper.querySelector('#af-addr');
		const copyBtn = wrapper.querySelector('#af-copy');
		const ctaBtn  = wrapper.querySelector('#af-cta');
		const closeBtn = wrapper.querySelector('#af-close');
		const statusEl = wrapper.querySelector('#af-status');
		const pollEl  = wrapper.querySelector('#af-poll');
		const amtBtns = wrapper.querySelectorAll('.af-amt');

		let selectedAmount = 25;
		let pollTimer = null;
		let baselineUsdc = null;
		let popupWindow = null;
		let destroyed = false;

		// Mark first preset selected by default
		amtBtns.forEach((btn) => {
			if (Number(btn.dataset.amount) === selectedAmount) btn.classList.add('selected');
			btn.addEventListener('click', () => {
				amtBtns.forEach((b) => b.classList.remove('selected'));
				btn.classList.add('selected');
				selectedAmount = Number(btn.dataset.amount);
			});
		});

		// Show wallet address
		if (walletAddress) {
			addrEl.textContent = `${walletAddress.slice(0, 12)}…${walletAddress.slice(-8)}`;
			addrEl.title = walletAddress;
		}

		// Copy address button
		copyBtn.addEventListener('click', async () => {
			if (!walletAddress) return;
			try {
				await navigator.clipboard.writeText(walletAddress);
				copyBtn.textContent = 'Copied!';
				copyBtn.classList.add('copied');
				setTimeout(() => {
					copyBtn.textContent = 'Copy';
					copyBtn.classList.remove('copied');
				}, 1800);
			} catch {
				copyBtn.textContent = 'Copy';
			}
		});

		function setStatus(msg, kind = '') {
			statusEl.textContent = msg;
			statusEl.className = 'af-status' + (kind ? ` ${kind}` : '');
		}

		function dismiss(result = null) {
			if (destroyed) return;
			destroyed = true;
			clearInterval(pollTimer);
			if (popupWindow && !popupWindow.closed) popupWindow.close();
			overlay.style.animation = 'af-fade-in 0.12s ease reverse forwards';
			setTimeout(() => wrapper.remove(), 130);
			resolve(result);
		}

		// Snapshot the current balance so we can detect an increase
		async function snapshotBalance() {
			if (!walletAddress) return;
			baselineUsdc = await fetchUsdcBalance(walletAddress);
		}

		// Poll for balance increase after popup opens
		async function startPolling() {
			if (!walletAddress) return;
			pollEl.removeAttribute('hidden');
			setStatus('Waiting for your deposit to confirm…');

			pollTimer = setInterval(async () => {
				const current = await fetchUsdcBalance(walletAddress);
				if (current === null) return;
				if (baselineUsdc !== null && current > baselineUsdc) {
					clearInterval(pollTimer);
					pollEl.setAttribute('hidden', '');
					setStatus(
						`✓ Deposit confirmed — ${current.toFixed(2)} USDC added`,
						'ok',
					);
					setTimeout(() => dismiss({ usdc: current }), 1800);
				}
			}, POLL_INTERVAL_MS);
		}

		// Main CTA: open onramp popup + start polling
		ctaBtn.addEventListener('click', async () => {
			ctaBtn.disabled = true;
			setStatus('Opening Coinbase checkout…');

			await snapshotBalance();

			const onramp = await fetchOnrampLink(walletAddress, selectedAmount);

			if (onramp?.url) {
				popupWindow = window.open(
					onramp.url,
					'af_coinbase_pay',
					'width=480,height=720,menubar=no,toolbar=no,location=no,status=no',
				);
			}

			if (!popupWindow || popupWindow.closed) {
				// Popup blocked or no URL — fall back to same-tab link
				if (onramp?.url) {
					setStatus('Popup blocked. Opening in new tab…');
					window.open(onramp.url, '_blank', 'noopener');
				} else {
					setStatus('Copy your address below and send USDC from any exchange.', '');
				}
			} else {
				setStatus('');
			}

			ctaBtn.disabled = false;
			await startPolling();
		});

		// Close handlers
		closeBtn.addEventListener('click', () => dismiss(null));
		overlay.addEventListener('click', (e) => {
			if (e.target === overlay) dismiss(null);
		});

		// Keyboard dismiss
		const keyHandler = (e) => {
			if (e.key === 'Escape') { document.removeEventListener('keydown', keyHandler); dismiss(null); }
		};
		document.addEventListener('keydown', keyHandler);

		// Focus the CTA on open
		requestAnimationFrame(() => ctaBtn.focus());
	});
}
