// Site-wide Walk Companion — three.ws integration entry.
// ======================================================
// The companion/playground engine now lives in the publishable SDK at
// walk-sdk/ (@three-ws/walk). This file is the thin three.ws wiring: it builds
// the platform-specific config, exposes the window API public/nav.js expects,
// and kicks off the app's auto-mount/deep-link behaviour.
//
// Delivery is unchanged: Vite emits this module to the stable, unhashed path
// /walk-companion.js (see vite.config.js → rollupOptions.output.entryFileNames),
// and public/nav.js injects it with <script type="module"> only when the
// companion is enabled — so a page that never turns it on pays nothing. We
// import from companion.js (not the package index) so the playground stays a
// lazy import() chunk and isn't pulled in until the avatar detaches.

import { createWalkCompanion } from '../walk-sdk/src/companion.js';
import { installTransitions } from './walk-companion-transitions.js';

const walk = createWalkCompanion({
	// Static GLBs and the animation manifest are served from this origin.
	assetBase: '',
	apiBase: '',
	manifestUrl: '/animations/manifest.json',
	// "Make your own" link in the avatar picker → the avatar builder.
	docsUrl: '/avatar-studio',
});

// public/nav.js drives the companion through this global (toggle from the nav
// Walk button, react to ?walk= overrides). Keep the surface it relies on.
window.__walkCompanion = walk;

// Walk-aware page transitions (task 33): dress the jump between pages to match
// the destination. The runner needs the companion's host element — both for the
// camera-zoom-into-avatar preset and for slotting the "Themed transitions"
// settings pill into the companion's existing control cluster. We read it lazily
// off the live instance so this survives avatar swaps and playground round-trips.
const companionHost = () => walk.instance?.host || null;

// When a themed transition takes over a link click it preventDefaults, which
// would suppress the SDK companion's own _onLinkClick (task 32: wave goodbye +
// set the sessionStorage greet flag the destination reads to wave hello). We
// reproduce that single behaviour here so it still fires exactly once.
const GREET_KEY = walk.config?.keys?.greet || 'walk:companion:greet';
function onTransitionNavStart() {
	try {
		walk.instance?.controller?.playWave();
	} catch {
		/* controller may not be ready — non-fatal */
	}
	try {
		sessionStorage.setItem(GREET_KEY, '1');
	} catch {
		/* private mode / disabled storage — non-fatal */
	}
}

installTransitions({
	getAvatarEl: companionHost,
	getHostEl: companionHost,
	onNavStart: onTransitionNavStart,
});

walk.bootstrap();
