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

registerWalletTab({
	id: 'reputation',
	label: 'Trust',
	order: 25, // between Pulse (15) and Deposit (20)… sorts after both; sits early.
	ownerOnly: false,
	mount({ panel, ctx }) {
		ensureReputationStyles();
		panel.innerHTML = '';
		const wrap = document.createElement('div');
		wrap.className = 'awh-rep-tab';
		const intro = document.createElement('p');
		intro.className = 'awh-rep-intro';
		intro.textContent =
			'A real, non-gameable credibility score derived entirely from this wallet’s on-chain and ledger history. Backed by money and time — and fully explainable below.';
		wrap.appendChild(intro);
		wrap.appendChild(reputationPanelEl(ctx.agentId, {}));
		panel.appendChild(wrap);

		if (typeof document !== 'undefined' && !document.getElementById('awh-rep-style')) {
			const tag = document.createElement('style');
			tag.id = 'awh-rep-style';
			tag.textContent = `
.awh-rep-tab{display:flex;flex-direction:column;gap:var(--space-4,16px)}
.awh-rep-intro{margin:0;font-size:var(--text-sm,.8125rem);line-height:1.5;color:var(--ink-dim,#9ca3af)}
`;
			document.head.appendChild(tag);
		}
		return {};
	},
});
