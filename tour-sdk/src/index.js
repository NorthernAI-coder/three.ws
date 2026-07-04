// @three-ws/tour — a 3D guide that walks your live site and narrates it.
// =====================================================================
// A small avatar walks across the real page, spotlights each feature, points at
// it with a beam, and speaks a line about it — a guided product tour that runs
// on your actual DOM, not a slideshow. It survives full-page navigation (state
// in sessionStorage), offers Quick/Full tracks, a searchable chapter map, free
// roam, and adjustable voice/speed. `three` and `@three-ws/walk` are peer
// dependencies — bring your own copies.
//
// Quick start (auto-mount + deep-link, app-style):
//
//   import { createFeatureTour } from '@three-ws/tour';
//   const tour = createFeatureTour({
//     curriculum: '/tour/curriculum.json',   // or an inline object
//     ttsEndpoint: '/api/tts/speak',         // optional — captions pace without it
//   });
//   window.__featureTour = tour;             // let your nav button call it
//   tour.bootstrap();                        // honour ?tour=… and rehydrate
//
// Or drive it yourself:
//
//   const tour = createFeatureTour();
//   tour.start('quick');   // begin the Quick-highlights track
//   tour.resume();         // pick up an in-progress tour after a navigation
//   tour.exit();           // tear everything down

import { TourDirector } from './director.js';
import { resolveTourConfig } from './config.js';
import { createTourState } from './curriculum.js';

export const VERSION = '0.2.0';

/**
 * Create a tour controller. Returns a small object the host drives:
 * `start(track)`, `resume()`, `exit()`, `isActive()`, `bootstrap()`, plus the
 * live `director` once one exists.
 *
 * @param {object} [options] see resolveTourConfig for the full option list.
 */
export function createFeatureTour(options = {}) {
	const config = resolveTourConfig(options);
	const state = createTourState(config);
	let director = null;
	const ensure = () => (director ||= new TourDirector(config));

	const control = {
		get director() {
			return director;
		},
		get config() {
			return config;
		},
		isActive() {
			return state.readState().active === true;
		},
		start(track) {
			return ensure().start(track);
		},
		resume() {
			return ensure().resume();
		},
		exit() {
			director?.exit();
		},
		// Auto-mount / deep-link behaviour. Safe to call once on load. With the
		// default deepLinkParam 'tour': `?tour=start` begins (optionally
		// `&track=quick`), `?tour=0` exits, `?tour=1` (or an already-active tour)
		// resumes. Never runs inside an embed/iframe.
		bootstrap() {
			if (typeof window === 'undefined') return;
			if (window.top !== window.self) return; // never inside an embed/iframe
			const params = new URLSearchParams(location.search);
			const param = params.get(config.deepLinkParam);
			if (param === 'start') {
				const track = params.get('track') === 'quick' ? 'quick' : 'full';
				ensure().start(track);
			} else if (param === '0') {
				director?.exit();
			} else if (param === '1' || state.readState().active) {
				ensure().resume();
			}
		},
	};

	return control;
}

// Engine internals, exported for advanced/standalone use.
export { TourDirector } from './director.js';
export { resolveTourConfig, DEFAULT_VOICES, DEFAULT_COPY } from './config.js';
export {
	loadCurriculum,
	createTourState,
	buildPlaylist,
	trackMeta,
	stopIndexForPath,
	sectionTitle,
	normalizePath,
} from './curriculum.js';

// Curriculum authoring helper — turn a pages document into a tour curriculum.
export { buildCurriculum } from './build-curriculum.js';
