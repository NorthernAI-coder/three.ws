// /agora — the Commons. The watchable world layer over the City substrate.
//
// Reuses the City's scene/renderer/camera (src/city/city-scene.js) and its OSM
// Manhattan geometry (src/city/city-map.js), then adds a *population*: every real
// citizen from /api/agora/citizens, rendered as an animated avatar standing in
// the square with a name + profession label. Click (or keyboard-focus) a citizen
// to open its passport. Empty / loading / error states are all designed.
//
// This is the shell Tasks 06–08 hang the economy visuals and interactions on; it
// renders the people and their identities, nothing fabricated.

import * as THREE from 'three';
import { fetchOSMData, buildCity, CITY_HALF } from '../city/city-map.js';
import { createCityScene, bindResize } from '../city/city-scene.js';
import { CityCamera } from '../city/city-camera.js';
import { CitizenPopulation } from './citizen-avatar.js';
import { PassportPanel } from './passport-panel.js';
import { mountEconomyLayer } from './economy-layer.js';
import { log } from '../shared/log.js';

// Where the job board stands in the square (escrow origin for the coin flow).
const BOARD_POSITION = new THREE.Vector3(0, 0, -7);

// ── DOM refs ────────────────────────────────────────────────────────────────
const canvas    = document.getElementById('agora-canvas');
const loadingEl = document.getElementById('agora-loading');
const subEl     = document.getElementById('agora-loading-sub');
const barEl     = document.getElementById('agora-boot-bar-fill');
const hudEl     = document.getElementById('agora-hud');
const countEl   = document.getElementById('agora-count');
const stateEl   = document.getElementById('agora-state');
const rosterEl  = document.getElementById('agora-roster');

const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const PAN_BOUNDS = CITY_HALF - 20;
const PAN_SPEED  = 26; // m/s for WASD spectator panning

function progress(pct, label) {
	if (barEl) barEl.style.width = pct + '%';
	if (subEl) subEl.textContent = label;
}

// Deterministic phyllotaxis (golden-angle) layout — the honest fallback when a
// citizen has no world position yet (position 0,0). Spreads the fleet in a tidy
// spiral around the plaza so nobody stacks on the origin.
function layoutPosition(i) {
	const GOLDEN = 2.399963229728653;
	const a = i * GOLDEN;
	const r = 2.6 * Math.sqrt(i + 0.6);
	return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

function citizenPosition(citizen, i) {
	const x = Number(citizen.position?.x);
	const z = Number(citizen.position?.z);
	if (Number.isFinite(x) && Number.isFinite(z) && (x !== 0 || z !== 0)) {
		// Clamp into the walkable square so a stray seed can't fling someone past
		// the buildings.
		return {
			x: Math.max(-PAN_BOUNDS, Math.min(PAN_BOUNDS, x)),
			z: Math.max(-PAN_BOUNDS, Math.min(PAN_BOUNDS, z)),
		};
	}
	return layoutPosition(i);
}

async function main() {
	progress(6, 'Setting up renderer…');
	const { renderer, scene, camera } = createCityScene(canvas);

	progress(20, 'Loading Manhattan…');
	let osmData;
	try {
		osmData = await fetchOSMData((frac, label) => progress(20 + frac * 34, label));
	} catch (err) {
		log.error('[agora] OSM fetch failed — empty world', err);
		osmData = { elements: [] };
	}

	progress(56, 'Building the square…');
	buildCity(scene, osmData);

	// Free-orbit spectator camera over the square. We reuse the City's orbit
	// camera but drive it with a movable focus point (WASD pans, selecting a
	// citizen glides the focus to them) instead of a player avatar.
	const cityCamera = new CityCamera(camera, canvas);
	const focus = new THREE.Vector3(0, 0, 0);
	let focusGoal = null; // when set, focus eases toward it (cleared on manual pan)
	camera.position.set(0, 16, 30);

	canvas.addEventListener('contextmenu', (e) => e.preventDefault());
	bindResize(renderer, camera);

	// ── Spectator panning input ───────────────────────────────────────────────
	const keys = new Set();
	const PAN_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
	window.addEventListener('keydown', (e) => {
		const k = e.key.toLowerCase();
		if (!PAN_KEYS.has(k)) return;
		// Don't hijack typing or scrolling: let form fields, editable content, and any
		// open panel keep arrow/WASD keys. Only pan when the world itself has focus.
		const ae = document.activeElement;
		if (ae && (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(ae.tagName) || ae.isContentEditable
			|| (ae.closest && ae.closest('.agora-passport, .agora-panel, .agora-h-root, [role="dialog"]')))) return;
		if (k.startsWith('arrow')) e.preventDefault();
		keys.add(k);
		focusGoal = null;
	});
	window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

	// ── Population ────────────────────────────────────────────────────────────
	const population = new CitizenPopulation({ renderer, scene, reducedMotion: REDUCED_MOTION });
	const passport = new PassportPanel();
	const raycaster = new THREE.Raycaster();
	const pointer = new THREE.Vector2();
	let hoverId = null;

	function openPassport(id, trigger) {
		const inst = population.getInstance(id);
		population.highlight(id);
		// Glide the camera to frame the inspected citizen.
		const p = population.worldPosition(id);
		if (p) focusGoal = p.clone();
		passport.open(id, {
			trigger,
			hint: inst?.citizen || null,
			onClose: () => { if (population.selectedId === id) population.highlight(null); },
		});
	}

	// Pointer → ray. Distinguish a click from a camera-orbit drag.
	let downX = 0, downY = 0, downT = 0;
	canvas.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; downT = performance.now(); });
	canvas.addEventListener('pointerup', (e) => {
		const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
		if (moved > 6 || performance.now() - downT > 500) return; // a drag, not a click
		const id = pickAt(e.clientX, e.clientY);
		if (id) openPassport(id, null);
	});

	let lastHoverRay = 0;
	canvas.addEventListener('pointermove', (e) => {
		const now = performance.now();
		if (now - lastHoverRay < 60) return; // throttle hit-testing
		lastHoverRay = now;
		const id = pickAt(e.clientX, e.clientY);
		hoverId = id;
		canvas.style.cursor = id ? 'pointer' : 'grab';
	});

	function pickAt(clientX, clientY) {
		const rect = canvas.getBoundingClientRect();
		pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
		pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
		raycaster.setFromCamera(pointer, camera);
		return population.pick(raycaster);
	}

	// ── Fetch + populate (re-runnable for the error-state retry + live joins) ──
	// Guarded against overlap: population.add has an async gap between its dedupe
	// check and insert, so two concurrent runs could double-place a citizen. A run
	// requested while one is in flight is coalesced into a single follow-up pass.
	let loadInFlight = false;
	let loadAgain = false;
	async function loadCitizens() {
		if (loadInFlight) { loadAgain = true; return; }
		loadInFlight = true;
		hideState();
		try {
			const res = await fetch('/api/agora/citizens?limit=200', { headers: { accept: 'application/json' } });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			const citizens = Array.isArray(data.citizens) ? data.citizens : [];

			if (!citizens.length || data.empty) {
				revealWorld();
				showEmptyState();
				updateCount(0);
				return;
			}

			revealWorld();
			updateCount(citizens.length);
			buildRoster(citizens);

			// Progressive populate: each avatar fades in as its GLB resolves. Loads
			// are pooled inside CitizenPopulation so the fleet streams in smoothly.
			let placed = 0;
			await Promise.all(citizens.map(async (citizen, i) => {
				const inst = await population.add(citizen, citizenPosition(citizen, i));
				if (inst) { placed++; updateCount(placed, citizens.length); }
			}));
			updateCount(population.count);
		} catch (err) {
			log.warn('[agora] citizens fetch failed', err?.message);
			revealWorld();
			showErrorState(err?.message || 'The registry could not be reached.');
		} finally {
			loadInFlight = false;
			if (loadAgain) { loadAgain = false; loadCitizens(); }
		}
	}

	// ── Accessible roster (keyboard + screen reader) ──────────────────────────
	// One focusable button per citizen, visually hidden but reachable by Tab.
	// Focus highlights the avatar; Enter/Space opens its passport.
	function buildRoster(citizens) {
		rosterEl.innerHTML = `<h2 class="agora-sr-only">Citizens of the Commons</h2>`;
		const list = document.createElement('ul');
		list.className = 'agora-roster-list';
		for (const c of citizens) {
			const li = document.createElement('li');
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'agora-roster-btn';
			btn.dataset.id = c.id;
			const prof = c.professions?.[0]?.label || c.profession || 'Citizen';
			btn.textContent = `Inspect ${c.displayName || 'citizen'} — ${prof}`;
			btn.addEventListener('focus', () => {
				population.highlight(c.id);
				const p = population.worldPosition(c.id);
				if (p) focusGoal = p.clone();
			});
			btn.addEventListener('click', () => openPassport(c.id, btn));
			li.appendChild(btn);
			list.appendChild(li);
		}
		rosterEl.appendChild(list);
	}

	// ── State overlays ────────────────────────────────────────────────────────
	function hideState() { stateEl.hidden = true; stateEl.innerHTML = ''; }

	function showEmptyState() {
		stateEl.hidden = false;
		stateEl.innerHTML = `
			<div class="agora-state-card">
				<div class="agora-state-glyph" aria-hidden="true">◍</div>
				<h2>The Commons is quiet</h2>
				<p>No citizens have settled here yet. Agora is a real economy of AI agents and
				humans — when the life engine seeds the first citizens, they'll appear in the
				square, living their daily loop.</p>
				<div class="agora-state-actions">
					<a class="agora-btn agora-btn-primary" href="/docs/agora.md">How the Commons works</a>
					<a class="agora-btn" href="/city">Visit the City</a>
				</div>
			</div>`;
	}

	function showErrorState(detail) {
		stateEl.hidden = false;
		stateEl.innerHTML = `
			<div class="agora-state-card">
				<div class="agora-state-glyph agora-state-glyph-error" aria-hidden="true">!</div>
				<h2>Couldn't reach the Commons</h2>
				<p>${detail.replace(/[<>&]/g, '')}</p>
				<div class="agora-state-actions">
					<button class="agora-btn agora-btn-primary" type="button" id="agora-retry">Try again</button>
				</div>
			</div>`;
		stateEl.querySelector('#agora-retry')?.addEventListener('click', loadCitizens);
	}

	function updateCount(n, total) {
		if (!countEl) return;
		countEl.textContent = total && total !== n ? `${n} / ${total}` : String(n);
	}

	function revealWorld() {
		if (loadingEl.classList.contains('hidden')) return;
		loadingEl.classList.add('hidden');
		hudEl.style.display = '';
		setTimeout(() => { loadingEl.style.display = 'none'; }, 480);
	}

	progress(72, 'Gathering citizens…');
	// Kick off the population fetch; the world reveals as soon as we know its state.
	loadCitizens();
	progress(100, 'Entering the Commons…');

	// When a human joins or posts (me-hud emits this after a successful act), the
	// agora_citizens projection changed — re-fetch so their freshly-placed avatar
	// streams into the square live, no reload. population.add is idempotent by
	// citizen id, so this only adds the newcomer; it never duplicates the crowd.
	// Debounced to coalesce the join + first-action burst into one fetch.
	let citizensRefresh = null;
	function onCitizensChanged() {
		clearTimeout(citizensRefresh);
		citizensRefresh = setTimeout(() => { loadCitizens(); }, 400);
	}
	window.addEventListener('agora:citizens-changed', onCitizensChanged);
	window.addEventListener('pagehide', () => {
		clearTimeout(citizensRefresh);
		window.removeEventListener('agora:citizens-changed', onCitizensChanged);
	}, { once: true });

	// ── Economy layer (Task 06) ────────────────────────────────────────────────
	// The job board, live ticker, and the completion moment (coin flow + rep tick
	// + orbit-able plinth), all driven by a single deduped pulse poll. It's handed
	// a small crowd adapter so a real claimed_task walks the right citizen and a
	// completed_task celebrates them — decoupled from the scaffold internals.
	const crowd = {
		findByName: (name) => population.findByName(name),
		getPosition: (id) => population.worldPosition(id),
		setStatus: (id, status) => population.setStatus(id, status),
		celebrate: (id) => population.celebrate(id),
		walkTo: (id, target, onArrive) => population.walkTo(id, target, onArrive),
	};
	const economy = mountEconomyLayer({
		scene, camera, renderer,
		reducedMotion: REDUCED_MOTION,
		boardPosition: BOARD_POSITION,
		focusOn: (v) => { focusGoal = v.clone ? v.clone() : new THREE.Vector3(v.x, v.y, v.z); },
		crowd,
		openPassport: (id) => openPassport(id, null),
	});
	window.addEventListener('pagehide', () => economy.dispose(), { once: true });

	// ── Render loop ───────────────────────────────────────────────────────────
	const clock = new THREE.Timer();
	(function tick() {
		requestAnimationFrame(tick);
		clock.update();
		const dt = Math.min(clock.getDelta(), 0.05);

		// Spectator panning (camera-relative), unless easing toward a selection.
		let px = 0, pz = 0;
		const yaw = cityCamera.yaw;
		if (keys.has('w') || keys.has('arrowup'))    { px -= Math.sin(yaw); pz -= Math.cos(yaw); }
		if (keys.has('s') || keys.has('arrowdown'))  { px += Math.sin(yaw); pz += Math.cos(yaw); }
		if (keys.has('a') || keys.has('arrowleft'))  { px -= Math.cos(yaw); pz += Math.sin(yaw); }
		if (keys.has('d') || keys.has('arrowright')) { px += Math.cos(yaw); pz -= Math.sin(yaw); }
		if (px !== 0 || pz !== 0) {
			const len = Math.hypot(px, pz);
			focus.x = clampPan(focus.x + (px / len) * PAN_SPEED * dt);
			focus.z = clampPan(focus.z + (pz / len) * PAN_SPEED * dt);
		} else if (focusGoal) {
			focus.lerp(focusGoal, Math.min(1, dt * 4));
			if (focus.distanceTo(focusGoal) < 0.15) focusGoal = null;
		}

		cityCamera.update(focus, 1.7);
		population.update(dt);
		economy.update(dt);
		renderer.render(scene, camera);
	})();
}

function clampPan(v) { return Math.max(-PAN_BOUNDS, Math.min(PAN_BOUNDS, v)); }

main().catch((err) => {
	log.error('[agora] fatal', err);
	if (stateEl) {
		loadingEl?.classList.add('hidden');
		stateEl.hidden = false;
		stateEl.innerHTML = `
			<div class="agora-state-card">
				<div class="agora-state-glyph agora-state-glyph-error" aria-hidden="true">!</div>
				<h2>The Commons failed to load</h2>
				<p>Something went wrong building the world. Reload to try again.</p>
				<div class="agora-state-actions">
					<button class="agora-btn agora-btn-primary" type="button" onclick="location.reload()">Reload</button>
				</div>
			</div>`;
	}
});
