/**
 * Agent Wallet hub — placeholder tab factory.
 *
 * The Balance tab ships fully built in this task. Deposit, Trade, Snipe, Pay, and
 * Withdraw are honest "coming online" placeholders that the later epic tasks
 * (02/04/06/08/09) replace by overwriting their own tab file. Each placeholder is
 * a real, designed empty-state — it tells the user exactly what the section will
 * do and that it is arriving, never a blank void or a fake/disabled control.
 */

import { registerWalletTab } from '../registry.js';

const PH_STYLE_ID = 'awh-placeholder-style';
const PH_STYLE = `
.awh-ph { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-3,12px); }
.awh-ph-icon { width: 38px; height: 38px; border-radius: var(--radius-md,10px); display: grid; place-items: center; background: var(--surface-2, rgba(255,255,255,.05)); border: 1px solid var(--stroke, rgba(255,255,255,.08)); font-size: 18px; }
.awh-ph h2 { margin: 0; font-size: var(--text-lg,1.236rem); color: var(--ink-bright,#fff); font-family: var(--font-display, system-ui); }
.awh-ph p { margin: 0; color: var(--ink-dim,#888); font-size: var(--text-md,.8125rem); line-height: var(--leading-normal,1.618); max-width: 52ch; }
`;
function injectPlaceholderStyle() {
	if (typeof document === 'undefined' || document.getElementById(PH_STYLE_ID)) return;
	const tag = document.createElement('style');
	tag.id = PH_STYLE_ID;
	tag.textContent = PH_STYLE;
	document.head.appendChild(tag);
}

/**
 * Register a "coming online" placeholder tab.
 * @param {{ id, label, order, ownerOnly?, icon, title, body }} def
 */
export function registerPlaceholderTab(def) {
	registerWalletTab({
		id: def.id,
		label: def.label,
		order: def.order,
		ownerOnly: !!def.ownerOnly,
		mount({ panel, ctx }) {
			injectPlaceholderStyle();
			const { escapeHtml } = ctx;
			panel.innerHTML = `
				<div class="awh-card">
					<div class="awh-ph">
						<div class="awh-ph-icon" aria-hidden="true">${escapeHtml(def.icon || '◎')}</div>
						<span class="awh-placeholder-badge">Coming online</span>
						<h2>${escapeHtml(def.title)}</h2>
						<p>${escapeHtml(def.body)}</p>
					</div>
				</div>
			`;
			return {};
		},
	});
}
