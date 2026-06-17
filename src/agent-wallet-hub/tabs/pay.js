/**
 * Agent Wallet hub — Pay tab (placeholder; replaced by epic task 08).
 *
 * Owner-only: paying for services spends the agent's own funds.
 * Task 08 ships in-product x402 pay from the per-agent wallet + payment activity.
 */

import { registerPlaceholderTab } from './_placeholder.js';

registerPlaceholderTab({
	id: 'pay',
	label: 'Pay',
	order: 50,
	ownerOnly: true,
	icon: '⌁',
	title: 'Pay for services',
	body: 'Pay x402 paid-API endpoints in USDC straight from the agent’s wallet — no shared platform wallet — with a running ledger of what the agent has paid for. This panel is being wired up now.',
});
