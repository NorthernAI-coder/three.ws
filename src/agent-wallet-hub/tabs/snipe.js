/**
 * Agent Wallet hub — Snipe tab.
 *
 * Owner-only. Arming an autonomous strategy spends the agent's own funds, so the
 * full arming form + live positions/PnL stream live on the dedicated Sniper
 * dashboard (built by epic task 06, served at /dashboard/sniper, backed by
 * api/sniper/{strategy,stream,history,leaderboard}.js). The hub surfaces that
 * here as a real, reachable entry point — what the sniper does, the guardrails
 * it shares with discretionary trading, and a direct link into the dashboard —
 * rather than a dead placeholder.
 */

import { registerWalletTab } from '../registry.js';

const STYLE_ID = 'awh-snipe-style';
const STYLE = `
.awh-snipe { display: flex; flex-direction: column; gap: var(--space-3,12px); }
.awh-snipe-icon { width: 38px; height: 38px; border-radius: var(--radius-md,10px); display: grid; place-items: center; background: var(--surface-2, rgba(255,255,255,.05)); border: 1px solid var(--stroke, rgba(255,255,255,.08)); font-size: 18px; }
.awh-snipe h2 { margin: 0; font-size: var(--text-lg,1.236rem); color: var(--ink-bright,#fff); font-family: var(--font-display, system-ui); }
.awh-snipe p { margin: 0; color: var(--ink-dim,#888); font-size: var(--text-md,.8125rem); line-height: var(--leading-normal,1.618); max-width: 54ch; }
.awh-snipe-points { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.awh-snipe-points li { display: flex; align-items: flex-start; gap: 9px; color: var(--ink, #c8c8c8); font-size: var(--text-md,.8125rem); line-height: 1.5; }
.awh-snipe-points li::before { content: '◎'; color: var(--accent, #fff); flex: none; font-size: .85em; line-height: 1.7; opacity: .75; }
.awh-snipe-cta { display: inline-flex; align-items: center; gap: 8px; text-decoration: none; margin-top: 4px; }
.awh-snipe-cta::after { content: '↗'; font-size: .9em; }
`;

function injectStyle() {
	if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
	const tag = document.createElement('style');
	tag.id = STYLE_ID;
	tag.textContent = STYLE;
	document.head.appendChild(tag);
}

registerWalletTab({
	id: 'snipe',
	label: 'Snipe',
	order: 40,
	ownerOnly: true,
	mount({ panel, ctx }) {
		injectStyle();
		const { escapeHtml, agentId } = ctx;
		// The dashboard lists the owner's strategies (this agent's among them); the
		// hash hint keeps the origin traceable without depending on a query param.
		const dashUrl = `/dashboard/sniper#agent=${encodeURIComponent(agentId)}`;
		panel.innerHTML = `
			<div class="awh-card">
				<div class="awh-snipe">
					<div class="awh-snipe-icon" aria-hidden="true">◎</div>
					<h2>Arm an autonomous strategy</h2>
					<p>
						Set a budget, entry filters, and exit rules, then let this agent snipe
						brand-new pump.fun launches on its own — from its own funded wallet,
						under the same per-trade caps, daily budget, and price-impact breaker
						that govern discretionary trades.
					</p>
					<ul class="awh-snipe-points">
						<li>Budget &amp; sizing: daily cap, per-trade cap, max concurrent positions.</li>
						<li>Entry filters: market cap, creator history, socials, SOL-quote only.</li>
						<li>Exits: take-profit, stop-loss, trailing stop, max hold — auto-executed.</li>
						<li>Live positions &amp; realized PnL stream as trades fill.</li>
					</ul>
					<a class="awh-btn awh-btn--primary awh-snipe-cta" href="${escapeHtml(dashUrl)}">
						Open the Sniper dashboard
					</a>
				</div>
			</div>
		`;
		return {};
	},
});
