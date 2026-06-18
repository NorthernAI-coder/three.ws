// Global nav holder chip. Loaded by the shared header (public/nav.js → the stable
// /nav-tier-badge.js bundle) right after the nav markup mounts, this hydrates the
// nav's #nav-tier-badge slot with the signed-in holder's $THREE tier ("◆ Silver")
// via the shared access helper. One getAccess() call does it; the helper hides the
// chip for anonymous visitors and non-holders, and the chip links to /three#tiers.
//
// A wallet:changed event (dispatched by src/wallet.js when a wallet connects or
// disconnects) re-hydrates the chip so a freshly-connected holder sees their tier
// without a reload — the only live coupling, kept lightweight.

import { mountTierBadge, getAccess } from './three-access.js';

const SLOT_ID = 'nav-tier-badge';

function hydrate() {
	const slot = document.getElementById(SLOT_ID);
	if (slot) mountTierBadge(slot);
}

hydrate();

// Re-read on wallet change. getAccess() is short-cached, so force a fresh read to
// refresh the matrix the badge reads, then re-mount; failures degrade silently.
if (typeof window !== 'undefined') {
	window.addEventListener('wallet:changed', () => {
		getAccess(undefined, { fresh: true }).finally(hydrate);
	});
}
