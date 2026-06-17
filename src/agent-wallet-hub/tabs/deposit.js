/**
 * Agent Wallet hub — Deposit tab (placeholder; replaced by epic task 02).
 *
 * Visible to owner AND visitors: funding an agent is a public-safe action (you
 * can deposit to any agent's public address). Task 02 ships the QR + copy +
 * `solana:` deep-link + live "funds received" confirmation here.
 */

import { registerPlaceholderTab } from './_placeholder.js';

registerPlaceholderTab({
	id: 'deposit',
	label: 'Deposit',
	order: 20,
	ownerOnly: false,
	icon: '↓',
	title: 'Fund this wallet',
	body: 'Scan a QR with your phone, copy the address, or tap a one-tap Solana deposit link to send SOL to this agent — with a live confirmation the moment funds land. This panel is being wired up now.',
});
