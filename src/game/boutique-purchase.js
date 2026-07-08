// $THREE boutique purchase (W04) — the client half of the in-game premium
// cosmetics rail. Real on-chain settlement: the buyer's own connected Solana
// wallet signs ONE $THREE transfer (server-built, server-priced, split
// between the holder-rewards pool and the treasury — see
// multiplayer/src/game-token.js), we broadcast it, and only once the server
// re-reads the CONFIRMED transaction from RPC does it grant the cosmetic.
// Mirrors coin-buy.js's connect → sign → broadcast → confirm flow.

import { detectSolanaWallet, SOLANA_RPC, solanaTxExplorerUrl } from '../erc8004/solana-deploy.js';

// Overridable for local/devnet verification only (mirrors window.GAME_SERVER_URL
// in community-net.js). Every real deploy leaves this unset and settles on
// mainnet, matching the server's default SOLANA_RPC_URL.
function boutiqueNetwork() {
	return (typeof window !== 'undefined' && window.GAME_TOKEN_NETWORK) || 'mainnet';
}

// A fully custom RPC endpoint (e.g. a local `solana-test-validator`), for
// verification runs only — production never sets this and always resolves
// through the same-origin proxy in SOLANA_RPC.
function boutiqueRpcUrl() {
	if (typeof window !== 'undefined' && window.GAME_TOKEN_RPC_URL) return window.GAME_TOKEN_RPC_URL;
	return SOLANA_RPC[boutiqueNetwork()] || SOLANA_RPC.mainnet;
}

function decodeBase64(b64) {
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

/**
 * Map a purchase failure to copy the player can act on, mirroring
 * coin-buy.js's friendlyTradeError.
 * @param {Error} err
 */
function friendlyBoutiqueError(err) {
	const raw = (err && (err.message || String(err))) || '';
	const m = raw.toLowerCase();
	if (/reject|denied|cancell?ed|user declined/.test(m)) return 'Cancelled in wallet.';
	if (/insufficient (lamports|funds)|debit an account|custom program error: 0x1\b/.test(m))
		return 'Not enough $THREE (or SOL for network fees) to cover this purchase.';
	if (/blockhash not found|block height exceeded|expired|too old/.test(m))
		return 'The quote expired — try again.';
	if (/failed to fetch|networkerror|timed out|timeout|fetch failed/.test(m))
		return "Couldn't reach the network. Check your connection and try again.";
	return raw.replace(/\s+/g, ' ').trim().slice(0, 140) || 'Purchase failed. Try again.';
}

// Wait for the server's reply to a specific boutiqueQuote request. Times out
// so a dropped connection can't hang the buy action forever.
function waitForQuote(net, id, timeoutMs = 15000) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => { unsub(); reject(new Error('Timed out waiting for a price. Try again.')); }, timeoutMs);
		const unsub = net.on('boutiqueQuote', (msg) => {
			if (msg?.id !== id) return;
			clearTimeout(timer);
			unsub();
			resolve(msg);
		});
	});
}

// Wait for the settle-outcome notice (success or a specific server-side
// rejection) so the caller reports exactly what happened rather than guessing.
function waitForSettleNotice(net, timeoutMs = 20000) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => { unsub(); reject(new Error('Timed out confirming the purchase. Check your wardrobe in a moment.')); }, timeoutMs);
		const unsub = net.on('notice', (n) => {
			if (n?.kind !== 'boutique') return;
			clearTimeout(timer);
			unsub();
			resolve(n);
		});
	});
}

/**
 * Buy one premium cosmetic with $THREE, end to end: connect wallet → server
 * quote (server-priced) → wallet signs → broadcast → server re-verifies the
 * confirmed transaction on-chain → grant. Never trusts the client's own
 * "it worked" — the unlock only happens after `_handleBoutiqueSettle` on the
 * server confirms the transfer actually landed.
 * @param {{ net: object, item: { id: string, name: string, price?: number }, onStage?: (stage: string) => void }} opts
 * @returns {Promise<{ ok: true, sig: string, explorerUrl: string, text: string }>}
 */
export async function buyBoutiqueItem({ net, item, onStage = () => {} }) {
	if (!net || !item?.id) throw new Error('Nothing to buy.');
	const wallet = detectSolanaWallet();
	if (!wallet) {
		if (typeof window !== 'undefined') window.open('https://phantom.app/', '_blank', 'noopener');
		throw new Error('Install a Solana wallet (Phantom) to buy with $THREE.');
	}

	onStage('connecting');
	if (!wallet.publicKey) {
		try { await wallet.connect(); }
		catch (err) { throw new Error(friendlyBoutiqueError(err)); }
	}
	const address = wallet.publicKey?.toString?.();
	if (!address) throw new Error('Could not read your wallet address.');

	onStage('pricing');
	net.boutiqueQuote(item.id, address);
	const quote = await waitForQuote(net, item.id);
	if (!quote?.txBase64) throw new Error('Could not price that purchase — try again.');

	onStage('signing');
	const { Transaction, Connection } = await import('@solana/web3.js');
	const tx = Transaction.from(decodeBase64(quote.txBase64));
	let signed;
	try { signed = await wallet.signTransaction(tx); }
	catch (err) { throw new Error(friendlyBoutiqueError(err)); }

	onStage('broadcasting');
	const netId = boutiqueNetwork();
	const conn = new Connection(boutiqueRpcUrl(), 'confirmed');
	let sig;
	try {
		sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 });
	} catch (err) {
		throw new Error(friendlyBoutiqueError(err));
	}
	try {
		const latest = await conn.getLatestBlockhash('confirmed');
		await conn.confirmTransaction({ signature: sig, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight }, 'confirmed');
	} catch { /* landed but slow to confirm — settle re-checks the confirmed tx on RPC itself */ }

	onStage('settling');
	net.boutiqueSettle(quote.quoteToken, sig);
	const notice = await waitForSettleNotice(net);
	return { ok: true, sig, explorerUrl: solanaTxExplorerUrl(netId, sig), text: notice.text };
}
