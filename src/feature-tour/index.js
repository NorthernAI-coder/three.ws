// index.js — public surface for the Feature Tour. Creates a single director,
// exposes a small control object (the nav button and the /tour page drive the
// tour through it), and a bootstrap() that honors the ?tour= deep-link and
// re-hydrates an in-progress tour on every page load. Side-effect free on
// import: nothing mounts until bootstrap()/start() runs.

import { TourDirector } from './director.js';
import { readState } from './curriculum.js';

export function createFeatureTour() {
	let director = null;
	const ensure = () => (director ||= new TourDirector());

	const control = {
		get director() {
			return director;
		},
		isActive() {
			return readState().active === true;
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
		// Replicates the companion's auto-mount/deep-link behaviour. Safe to call
		// once on load. `?tour=start|1` begins or resumes; an already-active tour
		// rehydrates silently.
		bootstrap() {
			if (typeof window === 'undefined') return;
			if (window.top !== window.self) return; // never inside an embed/iframe
			const params = new URLSearchParams(location.search);
			const param = params.get('tour');
			if (param === 'start') {
				const track = params.get('track') === 'quick' ? 'quick' : 'full';
				ensure().start(track);
			} else if (param === '0') {
				director?.exit();
			} else if (param === '1' || readState().active) {
				ensure().resume();
			}
		},
	};

	return control;
}
