/**
 * Agent Wallet hub — Withdraw tab (placeholder; replaced by epic task 09).
 *
 * Owner-only: only the owner may move funds out of the custodial wallet.
 * Task 09 ships the withdraw/sweep path (SOL + SPL), spend limits, and the
 * custody audit trail.
 */

import { registerPlaceholderTab } from './_placeholder.js';

registerPlaceholderTab({
	id: 'withdraw',
	label: 'Withdraw',
	order: 60,
	ownerOnly: true,
	icon: '↑',
	title: 'Withdraw funds',
	body: 'Move all SOL and SPL tokens out of the agent wallet to any address or .sol name at any time — you always control the funds. Spend limits and a full custody audit trail live here too. This panel is being wired up now.',
});
