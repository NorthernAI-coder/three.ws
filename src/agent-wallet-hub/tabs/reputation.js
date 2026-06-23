/**
 * Agent Wallet hub — Reputation tab ("why this wallet is trusted").
 *
 * The full, auditable breakdown of the agent's wallet-trust score: every real
 * input (tenure, settled volume, tips from distinct funded wallets, settlement
 * reliability, fork lineage, on-chain identity), its point contribution, and a
 * link to the real evidence. It also surfaces what does NOT count (self-tips,
 * single-counterparty volume) so the score reads as credible rather than a black
 * box — transparency is the trust.
 *
 * Visible to owner AND visitor — the score is public, so both see the same
 * number. The OWNER additionally sees actionable guidance ("verify your on-chain
 * identity to raise trust") tied to real, available actions; the server strips
 * that block for everyone else.
 *
 * All data comes from GET /api/agents/:id/reputation, computed entirely from real
 * ledger + chain reads (api/_lib/trust/wallet-reputation.js). Nothing is faked.
 */

import { registerWalletTab } from '../registry.js';
import { reputationPanelEl, ensureReputationStyles } from '../../shared/agent-reputation.js';
import { proofOfReservesPanelEl, ensureProofOfReservesStyles } from '../../shared/agent-proof-of-reserves.js';

registerWalletTab({
	id: 'reputation',
	label: 'Trust',
	order: 25, // between Pulse (15) and Deposit (20)… sorts after both; sits early.
	ownerOnly: false,
	mount({ panel, ctx }) {
		ensureReputationStyles();
		ensureProofOfReservesStyles();
		panel.innerHTML = '';
		const wrap = document.createElement('div');
		wrap.className = 'awh-rep-tab';

		// "Open the books" — Proof-of-Reserves first (live, verifiable reserves +
		// lifetime flows + obligations), then the explainable financial-reputation
		// score it feeds. Both are public; the owner additionally sees guidance.
		const reservesHead = document.createElement('div');
		reservesHead.className = 'awh-rep-block';
		reservesHead.innerHTML =
			'<h3 class="awh-rep-h">Proof-of-Reserves</h3>' +
			'<p class="awh-rep-intro">Live, independently verifiable holdings, lifetime flows, and what this wallet still owes — every figure traceable on-chain.</p>';
		reservesHead.appendChild(proofOfReservesPanelEl(ctx.agentId, { network: ctx.network }));
		wrap.appendChild(reservesHead);

		const repHead = document.createElement('div');
		repHead.className = 'awh-rep-block';
		repHead.innerHTML =
			'<h3 class="awh-rep-h">Financial reputation</h3>' +
			'<p class="awh-rep-intro">A real, non-gameable 0–100 credibility score from this wallet’s settlement reliability, generosity, longevity, trading conduct, and solvency. Fully explainable below.</p>';
		repHead.appendChild(reputationPanelEl(ctx.agentId, {}));
		wrap.appendChild(repHead);

		panel.appendChild(wrap);

		if (typeof document !== 'undefined' && !document.getElementById('awh-rep-style')) {
			const tag = document.createElement('style');
			tag.id = 'awh-rep-style';
			tag.textContent = `
.awh-rep-tab{display:flex;flex-direction:column;gap:var(--space-6,28px)}
.awh-rep-block{display:flex;flex-direction:column;gap:var(--space-3,12px)}
.awh-rep-h{margin:0;font-family:var(--font-display,Space Grotesk,sans-serif);font-size:var(--text-lg,1.0625rem);font-weight:700;color:var(--ink-bright,#fff)}
.awh-rep-intro{margin:0;font-size:var(--text-sm,.8125rem);line-height:1.5;color:var(--ink-dim,#9ca3af)}
`;
			document.head.appendChild(tag);
		}
		return {};
	},
});
