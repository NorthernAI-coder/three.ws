/**
 * Standalone /proof page — an owner verifies one agent wallet's custody.
 *
 * Reads ?agent=<id>, fetches the owner-gated inclusion proof, and hands it to the
 * shared renderer, which auto-runs the independent in-browser verifier. With no
 * ?agent it explains how to get here from the wallet hub. A non-owner (or signed-
 * out) visitor is told the per-wallet proof is private and pointed at the public
 * /integrity page, which anyone can verify.
 */

import { apiFetch } from './api.js';
import { renderProofUI, injectProofStyle } from './proof-of-custody/ui.js';
import { verifyInclusionProof } from './proof-of-custody/verifier.js';

const root = document.getElementById('poc-root');

function card(html) {
	return `<div class="awh-proof"><div class="awh-proof-card">${html}</div></div>`;
}

async function main() {
	injectProofStyle();
	const agentId = new URLSearchParams(location.search).get('agent');

	if (!agentId) {
		root.innerHTML = card(`
			<h2>Open from your wallet</h2>
			<p class="awh-proof-lead">To verify a specific wallet, open its <strong>Proof of Custody</strong> tab in the wallet hub, or append <code>?agent=&lt;your-agent-id&gt;</code> to this URL. Want the platform-wide view instead?</p>
			<div class="awh-proof-actions" style="margin-top:12px">
				<a class="awh-proof-btn" href="/agents">My agents</a>
				<a class="awh-proof-btn ghost" href="/integrity">Public integrity page ↗</a>
			</div>`);
		return;
	}

	root.innerHTML = `<div class="awh-proof awh-proof-skel" aria-busy="true"><span style="height:64px"></span><span style="height:120px"></span><span style="height:90px"></span></div>`;

	let proof;
	try {
		const res = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/solana/proof`, { allowAnonymous: true });
		if (res.status === 401) {
			root.innerHTML = card(`
				<h2>This proof is private</h2>
				<p class="awh-proof-lead">Per-wallet custody proofs are only shown to the wallet's owner, so we never expose another owner's data. Sign in if this is your wallet — or verify the platform's on-chain custody, which anyone can do.</p>
				<div class="awh-proof-actions" style="margin-top:12px">
					<a class="awh-proof-btn" href="/login?next=${encodeURIComponent(location.pathname + location.search)}">Sign in</a>
					<a class="awh-proof-btn ghost" href="/integrity">Verify platform custody ↗</a>
				</div>`);
			return;
		}
		if (res.status === 403) {
			root.innerHTML = card(`
				<h2>Not your wallet</h2>
				<p class="awh-proof-lead">You're signed in, but this wallet belongs to another owner. You can still verify the platform's on-chain custody on the public integrity page.</p>
				<div class="awh-proof-actions" style="margin-top:12px"><a class="awh-proof-btn" href="/integrity">Public integrity page ↗</a></div>`);
			return;
		}
		if (res.status === 404) {
			root.innerHTML = card(`<h2>Agent not found</h2><p class="awh-proof-lead">No agent matches that id.</p>`);
			return;
		}
		if (!res.ok) throw new Error(`proof request failed (${res.status})`);
		proof = (await res.json())?.data;
	} catch (err) {
		root.innerHTML = card(`<h2>Couldn't load your proof</h2><p class="awh-proof-lead">${escapeHtml(err.message)}</p><div class="awh-proof-actions" style="margin-top:12px"><button class="awh-proof-btn" type="button" id="poc-retry">Try again</button></div>`);
		document.getElementById('poc-retry')?.addEventListener('click', main);
		return;
	}

	renderProofUI(root, { proof, verify: verifyInclusionProof, shareBase: '/proof', origin: location.origin });
}

function escapeHtml(s) {
	return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

main();
