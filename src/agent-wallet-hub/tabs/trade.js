/**
 * Agent Wallet hub — Trade tab (placeholder; replaced by epic task 04).
 *
 * Owner-only: discretionary trading moves the agent's own custodial funds.
 * Task 04 ships the pump.fun buy/sell widget that signs from the agent wallet.
 */

import { registerPlaceholderTab } from './_placeholder.js';

registerPlaceholderTab({
	id: 'trade',
	label: 'Trade',
	order: 30,
	ownerOnly: true,
	icon: '⇄',
	title: 'Trade from this wallet',
	body: 'Buy and sell pump.fun tokens directly from the agent’s own funded wallet, with live quotes, slippage controls, and price-impact guardrails. This panel is being wired up now.',
});
