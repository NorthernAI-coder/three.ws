/**
 * Agent Wallet hub — Snipe tab (placeholder; replaced by epic task 06).
 *
 * Owner-only: arming an autonomous strategy spends the agent's own funds.
 * Task 06 ships the sniper arming form + live positions/PnL dashboard.
 */

import { registerPlaceholderTab } from './_placeholder.js';

registerPlaceholderTab({
	id: 'snipe',
	label: 'Snipe',
	order: 40,
	ownerOnly: true,
	icon: '◎',
	title: 'Arm an autonomous strategy',
	body: 'Set a budget, entry filters, and exit rules, then let the agent snipe brand-new pump.fun launches on its own — with live positions and realized PnL tracked here. This panel is being wired up now.',
});
