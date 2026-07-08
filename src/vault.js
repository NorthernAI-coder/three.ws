// /vault — browse, buy, unlock, and view encrypted 3D models gated by a
// BNB Chain purchase (prompt 12, BNB Chain campaign Track B).
//
// Wallet model (see src/bnb/vault-session.js's docstring for the full
// rationale): the vault's unlock key delivery is ECIES over secp256k1 —
// recovering the wrapped content key needs the buyer's RAW private key,
// which a browser-extension wallet (MetaMask) deliberately never exposes.
// So the actual "buyer" identity for buy() + the unlock signature + the
// client-side decrypt is a local session key (src/bnb/vault-session.js,
// same pattern src/agora/onchain-presence.js already established on this
// platform). MetaMask's ONLY role on the buy side is funding that session
// key with a plain native-token transfer. Sellers, by contrast, use a
// directly-connected MetaMask wallet (no ECIES involved in list()).
//
// Flow: browse (GET /list) -> select -> connect/fund session -> buy() on
// GreenfieldVault -> poll GET /status ("granting access on Greenfield…" is
// surfaced honestly, never hidden) -> POST /unlock -> unwrap the content key
// + download ciphertext (GET /download) -> decrypt client-side -> render in
// <model-viewer>.

import { escapeHtml as esc } from './shared/coin-format.js';
import {
	createPublicClient,
	createWalletClient,
	http,
	custom,
	formatEther,
	parseEther,
} from 'viem';
import {
	buildVaultUnlockMessage,
	generateUnlockNonce,
} from '../api/_lib/bnb/vault-unlock-message.js';
import {
	getVaultSessionAccount,
	getVaultSessionPrivateKey,
	resetVaultSession,
} from './bnb/vault-session.js';
import { quoteBuyRelayFee, sendBuyTx, sendListTx } from './bnb/vault-buy.js';
import { unwrapKey, decryptGlb } from './bnb/vault-crypto-browser.js';
import {
	deriveListingState,
	nextFlowStep,
	formatBnbAtomic,
	truncateAddress,
	pollDelayMs,
} from './vault-fsm.js';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);

// Dev/E2E-proof escape hatches ONLY — mirror the server's own `?contractAddress=`
// override (api/vault/list.js) and `BNB_VAULT_RPC_OVERRIDE_TESTNET` (vault-contract.js).
// Unset in normal use; a real visitor's URL never carries these.
const DEV_RPC = qs.get('devRpc') || '';
const DEV_CONTRACT = qs.get('contractAddress') || '';

const BSC_TESTNET = {
	id: 97,
	name: 'BNB Smart Chain Testnet',
	nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
	rpcUrls: { default: { http: [DEV_RPC || 'https://data-seed-prebsc-1-s1.bnbchain.org:8545'] } },
	blockExplorers: { default: { name: 'BscScan', url: 'https://testnet.bscscan.com' } },
	testnet: true,
};

const NETWORK = 'testnet';
const POLL_ATTEMPTS_BEFORE_MANUAL = 12; // ~90s of bounded backoff before "still settling"

const state = {
	listings: [],
	listStatus: 'loading', // loading | ready | empty | error
	listError: null,
	contractAddress: null,
	contractDeployed: false,
	session: null, // { address, balance }
	detail: null, // { listing, flow, pollAttempt, glbBlobUrl, glbFilename }
	message: null, // { tone, text }
};

const publicClient = createPublicClient({ chain: BSC_TESTNET, transport: http() });

function apiUrl(path, extra = {}) {
	const u = new URL(path, location.origin);
	u.searchParams.set('network', NETWORK);
	if (DEV_CONTRACT) u.searchParams.set('contractAddress', DEV_CONTRACT);
	for (const [k, v] of Object.entries(extra)) if (v != null) u.searchParams.set(k, v);
	return u.toString();
}

const svgAlert =
	'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>';

// ── Session (buyer identity) ────────────────────────────────────────────

async function refreshSessionBalance() {
	const account = getVaultSessionAccount();
	let balance = state.session?.balance ?? 0n;
	try {
		balance = await publicClient.getBalance({ address: account.address });
	} catch {
		/* RPC hiccup — keep the last known balance rather than showing 0 */
	}
	state.session = { address: account.address, balance };
	$('vlt-session-addr').textContent = truncateAddress(account.address);
	$('vlt-session-addr').title = account.address;
	$('vlt-session-balance').textContent = `${formatEther(balance)} tBNB`;
}

/** Connect MetaMask (or any EIP-1193 injected wallet) purely to fund the session key with a plain native-token transfer. */
async function fundSessionFromWallet() {
	if (!window.ethereum) {
		alert(
			'No browser wallet detected — install MetaMask, or fund your session address directly from the BSC testnet faucet:\n' +
				state.session.address,
		);
		return;
	}
	const amountStr = prompt(
		'How much tBNB to send to your vault session address? (e.g. 0.02)',
		'0.02',
	);
	if (!amountStr) return;
	let amount;
	try {
		amount = parseEther(amountStr);
	} catch {
		alert('Enter a valid tBNB amount, e.g. 0.02');
		return;
	}
	const btn = $('vlt-fund-btn');
	const prevLabel = btn.textContent;
	btn.disabled = true;
	btn.textContent = 'Funding…';
	try {
		const walletClient = createWalletClient({
			chain: BSC_TESTNET,
			transport: custom(window.ethereum),
		});
		const [from] = await walletClient.requestAddresses();
		try {
			await walletClient.switchChain({ id: BSC_TESTNET.id });
		} catch (switchErr) {
			if (
				switchErr?.code === 4902 ||
				/Unrecognized chain/i.test(String(switchErr?.message))
			) {
				await walletClient.addChain({ chain: BSC_TESTNET });
				await walletClient.switchChain({ id: BSC_TESTNET.id });
			} else {
				throw switchErr;
			}
		}
		const hash = await walletClient.sendTransaction({
			account: from,
			chain: BSC_TESTNET,
			to: state.session.address,
			value: amount,
		});
		btn.textContent = 'Confirming…';
		await publicClient.waitForTransactionReceipt({ hash });
		await refreshSessionBalance();
	} catch (err) {
		alert(
			`Funding failed: ${err?.shortMessage || err?.message || 'wallet rejected the transaction'}`,
		);
	} finally {
		btn.disabled = false;
		btn.textContent = prevLabel;
	}
}

// ── Browse ───────────────────────────────────────────────────────────────

function renderBanner() {
	const el = $('vlt-banner-slot');
	if (state.contractDeployed !== false || state.listStatus === 'loading') {
		el.innerHTML = '';
		return;
	}
	el.innerHTML = `<div class="vlt-banner" role="status">${svgAlert}<p><strong>The GreenfieldVault contract isn't deployed on this network yet.</strong> This is the honest state until BNB testnet deploy funding lands — see <code>contracts/DEPLOYMENTS.md</code>.</p></div>`;
}

async function loadListings() {
	state.listStatus = 'loading';
	renderGrid();
	try {
		const res = await fetch(apiUrl('/api/vault/list'), {
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(10000),
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const body = await res.json();
		state.contractAddress = body.contractAddress;
		state.contractDeployed = body.contractDeployed;
		state.listings = body.listings || [];
		state.listStatus = state.listings.length ? 'ready' : 'empty';
	} catch (err) {
		state.listStatus = 'error';
		state.listError = err.message;
	}
	renderBanner();
	renderGrid();
}

function listingCard(listing) {
	const name = listing.glbObjectRef?.object?.split('/').pop() || 'Untitled model';
	return `
		<button type="button" class="vlt-card" data-object-id="${esc(listing.objectId)}">
			<div class="vlt-card-art" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" /><path d="M3 7l9 5 9-5M12 12v10" /></svg>
			</div>
			<div class="vlt-card-body">
				<div class="vlt-card-title" title="${esc(name)}">${esc(name)}</div>
				<div class="vlt-card-row"><span class="vlt-card-price">${esc(formatBnbAtomic(listing.priceAtomic))}</span><span class="vlt-badge" data-state="locked">Locked</span></div>
				<div class="vlt-card-row">Seller <code>${esc(truncateAddress(listing.seller))}</code></div>
			</div>
		</button>
	`;
}

function renderGrid() {
	const el = $('vlt-grid');
	if (state.listStatus === 'loading') {
		el.innerHTML = Array.from({ length: 6 })
			.map(() => '<div class="vlt-skel" aria-hidden="true"></div>')
			.join('');
		return;
	}
	if (state.listStatus === 'error') {
		el.innerHTML = `<div class="vlt-error" role="alert">${svgAlert}<h3>Couldn't load vault listings</h3><p>${esc(state.listError || 'the API is unreachable')}</p></div>`;
		return;
	}
	if (state.listStatus === 'empty') {
		el.innerHTML = `<div class="vlt-empty">${svgAlert}<h3>${state.contractDeployed ? 'No models listed yet' : 'Nothing to browse yet'}</h3><p>${
			state.contractDeployed
				? 'List yours below — encrypt, upload to Greenfield, and list on the vault contract.'
				: 'Once the vault contract is deployed and a seller lists a model, it shows up here automatically.'
		}</p></div>`;
		return;
	}
	el.innerHTML = state.listings.map(listingCard).join('');
	el.querySelectorAll('[data-object-id]').forEach((card) =>
		card.addEventListener('click', () => {
			const listing = state.listings.find((l) => l.objectId === card.dataset.objectId);
			if (listing) openDetail(listing);
		}),
	);
}

// ── Detail drawer: buy → settle → unlock → view ─────────────────────────

function openDrawer() {
	$('vlt-backdrop').dataset.open = 'true';
	$('vlt-drawer').dataset.open = 'true';
	$('vlt-drawer').setAttribute('aria-hidden', 'false');
	$('vlt-drawer-close').focus();
}

function closeDrawer() {
	stopPolling();
	$('vlt-backdrop').dataset.open = 'false';
	$('vlt-drawer').dataset.open = 'false';
	$('vlt-drawer').setAttribute('aria-hidden', 'true');
	if (state.detail?.glbBlobUrl) URL.revokeObjectURL(state.detail.glbBlobUrl);
	state.detail = null;
}

function stopPolling() {
	if (state.detail?.pollTimer) clearTimeout(state.detail.pollTimer);
	if (state.detail) state.detail.pollTimer = null;
}

async function openDetail(listing) {
	state.detail = {
		listing,
		flow: 'available',
		pollAttempt: 0,
		glbBlobUrl: null,
		glbFilename: null,
		note: null,
		noteTone: 'info',
	};
	$('vlt-drawer-title').textContent = listing.glbObjectRef?.object?.split('/').pop() || 'Model';
	openDrawer();
	renderDetail();
	await refreshSessionBalance();
	await refreshStatus();
}

async function refreshStatus() {
	const d = state.detail;
	if (!d) return;
	try {
		const res = await fetch(
			apiUrl('/api/vault/status', {
				objectId: d.listing.objectId,
				buyer: state.session.address,
			}),
			{
				headers: { accept: 'application/json' },
				signal: AbortSignal.timeout(10000),
			},
		);
		const body = await res.json();
		if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
		const derived = deriveListingState({
			contractDeployed: body.contractDeployed,
			listingActive: body.listing?.active,
			saleId: body.saleId,
			saleStatus: body.saleStatus,
		});
		const step = nextFlowStep({
			walletConnected: true,
			listingState: derived,
			hasDecrypted: !!d.glbBlobUrl,
		});
		d.flow = step === 'buy' ? 'available' : step;
		if (d.flow === 'pending-grant') schedulePoll();
		else stopPolling();
	} catch (err) {
		d.note = `Couldn't read purchase status: ${err.message}`;
		d.noteTone = 'error';
	}
	renderDetail();
}

function schedulePoll() {
	const d = state.detail;
	if (!d) return;
	stopPolling();
	if (d.pollAttempt >= POLL_ATTEMPTS_BEFORE_MANUAL) {
		renderDetail(); // shows the "still settling — check back" manual-refresh state
		return;
	}
	d.pollTimer = setTimeout(() => {
		if (!state.detail) return; // drawer closed meanwhile
		d.pollAttempt += 1;
		refreshStatus();
	}, pollDelayMs(d.pollAttempt));
}

async function buyListing() {
	const d = state.detail;
	if (!d) return;
	d.note = 'Preparing purchase…';
	d.noteTone = 'info';
	renderDetail();
	try {
		const account = getVaultSessionAccount();
		const priceAtomic = BigInt(d.listing.priceAtomic);
		const { total: relayFeeTotal } = await quoteBuyRelayFee(NETWORK, state.contractAddress, {
			client: publicClient,
		});
		const needed = priceAtomic + relayFeeTotal;
		if (state.session.balance < needed) {
			d.note = `Session needs ${formatEther(needed)} tBNB (price + relay fee) — currently has ${formatEther(state.session.balance)}. Fund it above first.`;
			d.noteTone = 'error';
			renderDetail();
			return;
		}
		d.note = 'Confirming purchase on-chain…';
		renderDetail();
		const { hash, mode } = await sendBuyTx(
			{
				account,
				network: NETWORK,
				contractAddress: state.contractAddress,
				objectId: d.listing.objectId,
				priceAtomic,
			},
			{ publicClient },
		);
		d.note = `Purchase tx ${mode === 'sponsored' ? '(gasless via MegaFuel) ' : ''}submitted: ${truncateAddress(hash)} — waiting for confirmation…`;
		renderDetail();
		await publicClient.waitForTransactionReceipt({ hash });
		d.flow = 'pending-grant';
		d.note = 'Purchase confirmed on-chain. Granting access on Greenfield…';
		d.noteTone = 'success';
		d.pollAttempt = 0;
		renderDetail();
		await refreshSessionBalance();
		schedulePoll();
	} catch (err) {
		d.note = `Purchase failed: ${err?.shortMessage || err?.message || 'wallet rejected the transaction'}`;
		d.noteTone = 'error';
		renderDetail();
	}
}

async function unlockAndView() {
	const d = state.detail;
	if (!d) return;
	d.note = 'Signing unlock request…';
	d.noteTone = 'info';
	renderDetail();
	try {
		const account = getVaultSessionAccount();
		const message = buildVaultUnlockMessage({
			objectId: d.listing.objectId,
			buyer: account.address,
			network: NETWORK,
			nonce: generateUnlockNonce(),
			issuedAt: new Date().toISOString(),
		});
		const signature = await account.signMessage({ message });

		d.note = 'Verifying purchase and fetching your wrapped key…';
		renderDetail();
		const res = await fetch('/api/vault/unlock', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				objectId: d.listing.objectId,
				buyer: account.address,
				network: NETWORK,
				message,
				signature,
			}),
			signal: AbortSignal.timeout(15000),
		});
		const body = await res.json();
		if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
		if (body.state === 'pending-grant') {
			d.note = body.pollHint || 'Still settling — try again shortly.';
			d.noteTone = 'info';
			d.flow = 'pending-grant';
			renderDetail();
			schedulePoll();
			return;
		}

		d.note = 'Unwrapping content key…';
		renderDetail();
		const contentKey = await unwrapKey(body.wrappedKey, getVaultSessionPrivateKey());

		d.note = 'Downloading encrypted model…';
		renderDetail();
		const dl = await fetch(
			`/api/vault/download?objectId=${d.listing.objectId}&network=${NETWORK}&buyer=${account.address}&token=${encodeURIComponent(body.downloadToken)}`,
			{ signal: AbortSignal.timeout(60000) },
		);
		if (!dl.ok) {
			const errBody = await dl.json().catch(() => ({}));
			throw new Error(errBody?.message || `download failed (HTTP ${dl.status})`);
		}
		const ciphertext = new Uint8Array(await dl.arrayBuffer());

		d.note = 'Decrypting…';
		renderDetail();
		const plaintext = await decryptGlb(
			{
				ciphertext,
				contentKey,
				iv: body.manifest?.encryption?.iv,
				authTag: body.manifest?.encryption?.authTag,
			},
			{ expectedSha256: body.manifest?.sha256 },
		);

		const blob = new Blob([plaintext], { type: 'model/gltf-binary' });
		d.glbBlobUrl = URL.createObjectURL(blob);
		d.glbFilename = (d.listing.glbObjectRef?.object || 'vault-model').split('/').pop();
		d.flow = 'viewing';
		d.note = 'Unlocked — model decrypted and sha256-verified locally.';
		d.noteTone = 'success';
		renderDetail();
	} catch (err) {
		d.note = `Unlock failed: ${err.message || 'unknown error'} — likely the wrong key or corrupted ciphertext.`;
		d.noteTone = 'error';
		renderDetail();
	}
}

const STEP_LABELS = [
	{ key: 'buy', label: 'Purchase confirmed on-chain' },
	{ key: 'grant', label: 'Greenfield permission granted' },
	{ key: 'unlock', label: 'Key unwrapped & model decrypted' },
];

function stepState(stepKey, flow) {
	const order = { available: 0, pending: 0, 'pending-grant': 1, unlocked: 2, viewing: 3 };
	const idx = order[flow] ?? 0;
	const target = { buy: 1, grant: 2, unlock: 3 }[stepKey];
	if (idx >= target) return 'done';
	if (idx === target - 1) return 'active';
	return 'pending';
}

function renderDetail() {
	const d = state.detail;
	const el = $('vlt-drawer-body');
	if (!d || !el) return;

	const progressHtml = `<div class="vlt-progress">${STEP_LABELS.map(
		(s) =>
			`<div class="vlt-step" data-state="${stepState(s.key, d.flow)}"><span class="vlt-step-dot" aria-hidden="true"></span>${esc(s.label)}</div>`,
	).join('')}</div>`;

	let actionHtml = '';
	let viewerHtml = '';
	if (d.flow === 'available') {
		actionHtml = `<button type="button" class="vlt-btn vlt-btn-primary" id="vlt-buy-btn">Buy for ${esc(formatBnbAtomic(d.listing.priceAtomic))} (+ relay fee)</button>`;
	} else if (d.flow === 'pending-grant') {
		const stuck = d.pollAttempt >= POLL_ATTEMPTS_BEFORE_MANUAL;
		actionHtml = stuck
			? `<button type="button" class="vlt-btn" id="vlt-refresh-detail-btn">Check again</button>`
			: `<button type="button" class="vlt-btn" disabled>Granting access…</button>`;
	} else if (d.flow === 'unlocked') {
		actionHtml = `<button type="button" class="vlt-btn vlt-btn-primary" id="vlt-unlock-btn">Unlock &amp; view</button>`;
	} else if (d.flow === 'viewing') {
		actionHtml = `<a class="vlt-btn vlt-btn-primary" id="vlt-download-btn" download="${esc(d.glbFilename || 'model.glb')}" href="${d.glbBlobUrl}">Download GLB</a>`;
		viewerHtml = `<model-viewer id="vlt-viewer" src="${d.glbBlobUrl}" camera-controls auto-rotate shadow-intensity="1" alt="Unlocked 3D model"></model-viewer>`;
	} else if (d.flow === 'unlisted') {
		actionHtml = `<p class="vlt-drawer-note">This listing is no longer active.</p>`;
	}

	el.innerHTML = `
		${viewerHtml}
		<div class="vlt-detail-meta">
			<div class="vlt-detail-row"><span>Price</span><b>${esc(formatBnbAtomic(d.listing.priceAtomic))}</b></div>
			<div class="vlt-detail-row"><span>Seller</span><code>${esc(truncateAddress(d.listing.seller))}</code></div>
			${d.listing.sha256 ? `<div class="vlt-detail-row"><span>sha256</span><code>${esc(d.listing.sha256.slice(0, 16))}…</code></div>` : ''}
		</div>
		${progressHtml}
		<div class="vlt-drawer-actions">
			${actionHtml}
			${d.note ? `<p class="vlt-drawer-note" data-tone="${d.noteTone || 'info'}">${esc(d.note)}</p>` : ''}
		</div>
	`;
	$('vlt-buy-btn')?.addEventListener('click', buyListing);
	$('vlt-unlock-btn')?.addEventListener('click', unlockAndView);
	$('vlt-refresh-detail-btn')?.addEventListener('click', () => {
		d.pollAttempt = 0;
		refreshStatus();
	});
}

// ── Sell panel ───────────────────────────────────────────────────────────

function sellLog(text) {
	const el = $('vlt-sell-log');
	el.hidden = false;
	el.textContent += (el.textContent ? '\n' : '') + text;
	el.scrollTop = el.scrollHeight;
}

async function connectAndList() {
	const glbUrl = $('vlt-sell-url').value.trim();
	const priceStr = $('vlt-sell-price').value.trim();
	if (!glbUrl || !priceStr) {
		alert('Enter a GLB URL and a price first.');
		return;
	}
	if (!window.ethereum) {
		alert('No browser wallet detected — install MetaMask to list a model.');
		return;
	}
	let priceWei;
	try {
		priceWei = parseEther(priceStr);
	} catch {
		alert('Enter a valid tBNB price, e.g. 0.01');
		return;
	}
	$('vlt-sell-log').textContent = '';
	const btn = $('vlt-sell-connect');
	btn.disabled = true;
	try {
		const walletClient = createWalletClient({
			chain: BSC_TESTNET,
			transport: custom(window.ethereum),
		});
		const [seller] = await walletClient.requestAddresses();
		sellLog(`Connected: ${seller}`);
		try {
			await walletClient.switchChain({ id: BSC_TESTNET.id });
		} catch (switchErr) {
			if (switchErr?.code === 4902) {
				await walletClient.addChain({ chain: BSC_TESTNET });
				await walletClient.switchChain({ id: BSC_TESTNET.id });
			} else throw switchErr;
		}

		sellLog('Uploading + encrypting GLB on Greenfield…');
		const upRes = await fetch('/api/bnb/vault-upload', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				glbUrl,
				sellerAddress: seller,
				priceAtomic: priceWei.toString(),
				network: NETWORK,
			}),
			signal: AbortSignal.timeout(60000),
		});
		const upBody = await upRes.json();
		if (!upRes.ok) throw new Error(upBody?.message || `upload failed (HTTP ${upRes.status})`);
		sellLog(`Uploaded — objectId ${upBody.objectId}`);

		if (!state.contractDeployed) {
			sellLog(
				'GreenfieldVault is not deployed on this network yet — the object is encrypted and stored, but cannot be listed until deploy funding lands.',
			);
			return;
		}

		sellLog('Listing on GreenfieldVault…');
		const hash = await sendListTx(
			walletClient,
			state.contractAddress,
			upBody.objectId,
			priceWei,
			seller,
		);
		sellLog(`list() submitted: ${hash} — waiting for confirmation…`);
		await publicClient.waitForTransactionReceipt({ hash });
		sellLog('Listed. Refreshing the grid…');
		await loadListings();
	} catch (err) {
		sellLog(`Failed: ${err?.shortMessage || err?.message || String(err)}`);
	} finally {
		btn.disabled = false;
	}
}

// ── Boot ─────────────────────────────────────────────────────────────────

function init() {
	$('vlt-fund-btn')?.addEventListener('click', fundSessionFromWallet);
	$('vlt-refresh-btn')?.addEventListener('click', loadListings);
	$('vlt-drawer-close')?.addEventListener('click', closeDrawer);
	$('vlt-backdrop')?.addEventListener('click', closeDrawer);
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && $('vlt-drawer').dataset.open === 'true') closeDrawer();
	});
	$('vlt-sell-connect')?.addEventListener('click', connectAndList);
	refreshSessionBalance();
	loadListings();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

// Exposed for a "reset session" affordance if a future revision wants one
// (not wired into this HTML's session strip — kept out of the way here).
export { resetVaultSession };
