// /club — three.ws Pole Club
//
// A dark 3D venue with four pole stages arranged in a half-arc. Each pole has
// a "Tip $0.001 to dance" button bound to /api/x402/dance-tip via the x402
// drop-in modal (window.X402.pay). Once the buyer's USDC settles, the dancer
// for that slot teleports onto their pole and performs the selected routine
// for ~12s, then drifts back to backstage. No tip, no dance.

import {
	AmbientLight,
	Box3,
	CircleGeometry,
	Clock,
	Color,
	CylinderGeometry,
	DoubleSide,
	Fog,
	Group,
	HemisphereLight,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	PerspectiveCamera,
	PlaneGeometry,
	PMREMGenerator,
	PointLight,
	RingGeometry,
	Scene,
	SpotLight,
	SRGBColorSpace,
	Vector3,
	WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clone as cloneSkinnedScene } from 'three/addons/utils/SkeletonUtils.js';

import { AnimationManager } from './animation-manager.js';
import { ClubCamera } from './club-camera.js';
import { ClubAudio, styleAudioFor, TRACK_LABELS } from './club-audio.js';

const AVATAR_URL = '/avatars/default.glb';
const MANIFEST_URL = '/animations/manifest.json';

// Clips we actually use — keeps the manifest pre-fetch small.
const REQUIRED_CLIPS = new Set([
	'idle', 'dance', 'rumba', 'silly', 'thriller', 'capoeira', 'walk',
]);
const WALK_CLIP = 'walk';

const TIP_ENDPOINT = '/api/x402/dance-tip';

// ── Stage layout ─────────────────────────────────────────────────────────
// Four poles in a half-arc facing the camera. Backstage is behind the bar at
// negative Z so dancers visibly walk out before mounting the pole.
const STAGE_RADIUS = 4.2;
const POLE_COUNT = 4;
const POLE_HEIGHT = 3.6;
const POLE_RADIUS = 0.05;
const PERFORMANCE_FADE = 0.45; // seconds for clip crossfade

const POLES = Array.from({ length: POLE_COUNT }, (_, i) => {
	// Spread across an arc from -55° to +55° at the front of the room.
	const t = POLE_COUNT === 1 ? 0.5 : i / (POLE_COUNT - 1);
	const angle = -Math.PI * 0.31 + t * Math.PI * 0.62;
	return {
		id: String(i + 1),
		x: Math.sin(angle) * STAGE_RADIUS,
		z: -Math.cos(angle) * STAGE_RADIUS + 1.4, // shift forward of camera focus
		// Backstage spawn point — same X as pole, deeper into the room.
		backstageX: Math.sin(angle) * (STAGE_RADIUS + 0.6),
		backstageZ: -Math.cos(angle) * (STAGE_RADIUS + 0.6) - 2.4,
		yaw: angle + Math.PI, // face the camera (poles look outward)
	};
});

// ── DOM ───────────────────────────────────────────────────────────────────
const canvas = document.getElementById('club-canvas');
const polesPanel = document.getElementById('club-poles');
const statusEl = document.getElementById('club-status');
const tipFeedEl = document.getElementById('club-tip-feed');

function setStatus(text, { kind = 'info' } = {}) {
	if (!statusEl) return;
	statusEl.textContent = text;
	statusEl.dataset.kind = kind;
	statusEl.hidden = false;
	clearTimeout(setStatus._t);
	setStatus._t = setTimeout(() => { statusEl.hidden = true; }, 3500);
}

function fmtUsd(atomics, decimals = 6) {
	if (atomics == null) return '';
	const n = Number(atomics) / 10 ** decimals;
	if (n < 0.01) return `$${n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`;
	return `$${n.toFixed(2)}`;
}

function pushFeed({ dancer, label, payer, amountAtomics, network }) {
	if (!tipFeedEl) return;
	tipFeedEl.querySelector('.club-feed-empty')?.remove();
	const row = document.createElement('div');
	row.className = 'club-tip-row';
	const who = payer ? `${payer.slice(0, 4)}…${payer.slice(-4)}` : 'someone';
	const safeLabel = String(label || 'dance').replace(/[<>&]/g, '');
	row.innerHTML = `
		<span class="club-tip-who">${who}</span>
		<span class="club-tip-mid">tipped dancer ${dancer} → ${safeLabel}</span>
		<span class="club-tip-amt">${fmtUsd(amountAtomics)} · ${network || ''}</span>
	`;
	tipFeedEl.prepend(row);
	while (tipFeedEl.children.length > 10) tipFeedEl.lastChild.remove();
}

// ── Renderer / scene ──────────────────────────────────────────────────────
const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = SRGBColorSpace;
renderer.shadowMap.enabled = true;

const scene = new Scene();
scene.background = new Color(0x07050b);
scene.fog = new Fog(0x07050b, 9, 28);

const pmrem = new PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.02).texture;

// Soft room light so the avatars aren't pitch black — but kept low so the
// spotlights do the talking.
scene.add(new AmbientLight(0x150b1a, 0.55));
const hemi = new HemisphereLight(0xff6abf, 0x110820, 0.35);
hemi.position.set(0, 6, 0);
scene.add(hemi);

const camera = new PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.05, 80);
camera.position.set(0, 1.8, 6.0);
camera.lookAt(0, 1.4, -1.5);

const clubCam = new ClubCamera(camera, {
	onModeChange: (mode) => updateFreeCamChip(mode),
});

// ── Club floor + walls ───────────────────────────────────────────────────
const floor = new Mesh(
	new CircleGeometry(14, 80),
	new MeshStandardMaterial({
		color: 0x12080f,
		roughness: 0.4,
		metalness: 0.65,
	}),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Dance-floor inlay — slightly emissive checker so the room reads as a club,
// not an empty plane.
const danceFloor = new Mesh(
	new CircleGeometry(STAGE_RADIUS + 1.4, 64),
	new MeshStandardMaterial({
		color: 0x1a0a1f,
		roughness: 0.25,
		metalness: 0.85,
		emissive: 0x220a36,
		emissiveIntensity: 0.45,
	}),
);
danceFloor.rotation.x = -Math.PI / 2;
danceFloor.position.y = 0.001;
danceFloor.receiveShadow = true;
scene.add(danceFloor);

// Back wall — gives the room some depth instead of fog going on forever.
const wallMat = new MeshStandardMaterial({
	color: 0x0a050d, roughness: 0.7, metalness: 0.2, side: DoubleSide,
});
const wallBack = new Mesh(new PlaneGeometry(30, 8), wallMat);
wallBack.position.set(0, 4, -10);
scene.add(wallBack);
const wallLeft = new Mesh(new PlaneGeometry(20, 8), wallMat);
wallLeft.position.set(-10, 4, 0);
wallLeft.rotation.y = Math.PI / 2;
scene.add(wallLeft);
const wallRight = new Mesh(new PlaneGeometry(20, 8), wallMat);
wallRight.position.set(10, 4, 0);
wallRight.rotation.y = -Math.PI / 2;
scene.add(wallRight);

// Bar counter behind the dance floor — a long box hint, nothing fancy.
const bar = new Mesh(
	new PlaneGeometry(9, 0.9),
	new MeshStandardMaterial({ color: 0x271425, roughness: 0.4, metalness: 0.7, emissive: 0x10050f, emissiveIntensity: 0.3 }),
);
bar.position.set(0, 0.45, -7.5);
scene.add(bar);

// ── Neon ring around dance floor ─────────────────────────────────────────
const neonRing = new Mesh(
	new RingGeometry(STAGE_RADIUS + 1.35, STAGE_RADIUS + 1.55, 96),
	new MeshBasicMaterial({ color: 0xff2bd6, side: DoubleSide, transparent: true, opacity: 0.85 }),
);
neonRing.rotation.x = -Math.PI / 2;
neonRing.position.y = 0.01;
scene.add(neonRing);
const neonRingOuter = new Mesh(
	new RingGeometry(STAGE_RADIUS + 1.7, STAGE_RADIUS + 1.82, 96),
	new MeshBasicMaterial({ color: 0x4ad6ff, side: DoubleSide, transparent: true, opacity: 0.7 }),
);
neonRingOuter.rotation.x = -Math.PI / 2;
neonRingOuter.position.y = 0.012;
scene.add(neonRingOuter);

// ── Poles + spotlights ───────────────────────────────────────────────────
const POLE_COLORS = [0xff3bd6, 0x4ad6ff, 0xff8a3b, 0x9b5dff];

class PoleStation {
	constructor(idx, layout) {
		this.idx = idx;
		this.layout = layout;
		this.id = layout.id;

		// Stage disc — slightly raised so dancer's feet sit on top.
		const stage = new Mesh(
			new CylinderGeometry(0.9, 1.0, 0.18, 48),
			new MeshStandardMaterial({
				color: 0x140511,
				roughness: 0.35,
				metalness: 0.85,
				emissive: POLE_COLORS[idx % POLE_COLORS.length],
				emissiveIntensity: 0.18,
			}),
		);
		stage.position.set(layout.x, 0.09, layout.z);
		stage.receiveShadow = true;
		scene.add(stage);
		this.stage = stage;
		this.stageTopY = 0.18;

		// The pole — a brushed chrome cylinder.
		const pole = new Mesh(
			new CylinderGeometry(POLE_RADIUS, POLE_RADIUS, POLE_HEIGHT, 16),
			new MeshStandardMaterial({
				color: 0xe6e8f0,
				roughness: 0.12,
				metalness: 1.0,
				emissive: 0x1a1c25,
				emissiveIntensity: 0.4,
			}),
		);
		pole.position.set(layout.x, this.stageTopY + POLE_HEIGHT / 2, layout.z);
		pole.castShadow = true;
		scene.add(pole);

		// Spotlight — colored, focused on the pole base.
		const spot = new SpotLight(POLE_COLORS[idx % POLE_COLORS.length], 0, 12, Math.PI / 7, 0.4, 1.6);
		spot.position.set(layout.x, 6.0, layout.z + 0.5);
		spot.target.position.set(layout.x, 0.0, layout.z);
		spot.castShadow = true;
		spot.shadow.mapSize.set(512, 512);
		spot.shadow.bias = -0.0008;
		scene.add(spot);
		scene.add(spot.target);
		this.spot = spot;
		this.spotIdleIntensity = 0.6;
		this.spotActiveIntensity = 12.0;
		spot.intensity = this.spotIdleIntensity;

		// Floor accent point light — sits at the base of the pole.
		const accent = new PointLight(POLE_COLORS[idx % POLE_COLORS.length], 0.4, 4.5, 1.6);
		accent.position.set(layout.x, 0.6, layout.z);
		scene.add(accent);
		this.accent = accent;

		// Dancer rig — placed in backstage. We populate skinned mesh later.
		this.rig = new Group();
		this.rig.position.set(layout.backstageX, 0, layout.backstageZ);
		this.rig.rotation.y = layout.yaw;
		scene.add(this.rig);

		this.anim = null;
		this.skinned = null;

		// Current performance lifecycle.
		this.activeTicket = null;     // backend ticket id
		this.activeUntil = 0;         // ms epoch — when to release the stage
		this.performing = false;
		this.walkPhase = 'idle';      // 'idle' | 'to-pole' | 'dancing' | 'returning'
		this._phaseTarget = this.rig.position.clone();
	}

	attachAvatar(template, animationDefs) {
		const root = cloneSkinnedScene(template);
		root.traverse((n) => {
			if (!n.isMesh) return;
			n.castShadow = true;
			n.receiveShadow = false;
			if (n.material && 'envMapIntensity' in n.material) {
				n.material = n.material.clone();
				n.material.envMapIntensity = 0.6;
				// Tint each dancer subtly with the pole's accent color so the
				// four are visually distinct even before the spotlight kicks in.
				if (n.material.emissive) {
					n.material.emissive = new Color(POLE_COLORS[this.idx % POLE_COLORS.length]);
					n.material.emissiveIntensity = 0.05;
				}
			}
		});

		// Re-zero the avatar so feet sit at rig y=0.
		const box = new Box3().setFromObject(root);
		root.position.y -= box.min.y;

		this.rig.add(root);
		this.skinned = root;

		this.anim = new AnimationManager();
		this.anim.attach(root);
		this.anim.setAnimationDefs(animationDefs);
		// Lazy-load — first clip request fetches its JSON on demand.
		this.anim.play('idle');
	}

	get backstagePos() {
		return new Vector3(this.layout.backstageX, 0, this.layout.backstageZ);
	}
	get poleBasePos() {
		return new Vector3(this.layout.x, 0, this.layout.z + 0.02);
	}

	async startPerformance(ticket) {
		this.activeTicket = ticket;
		this.performing = true;
		this.activeUntil = Date.now() + (ticket.durationSec || 12) * 1000;
		this.walkPhase = 'to-pole';
		this._phaseTarget = this.poleBasePos;

		// Spotlight ramps up while the dancer walks on stage.
		this._spotTarget = this.spotActiveIntensity;
		this._accentTarget = 2.4;

		// Auto-cam: if the user opted in and no manual VIP/house shot is active,
		// switch to this pole's VIP cam for the duration. We remember that the
		// auto-cam started this transition so we can release it on end.
		if (autoFollow && clubCam.getMode() === 'free') {
			this._autoCammed = true;
			clubCam.setVip(this.layout);
		} else {
			this._autoCammed = false;
		}

		// Crossfade idle → walking → dance once the dancer reaches the pole.
		await this.anim?.crossfadeTo(WALK_CLIP, PERFORMANCE_FADE);
	}

	async _arriveAtPole() {
		this.walkPhase = 'dancing';
		const clipName = this.activeTicket?.clip || 'dance';
		await this.anim?.crossfadeTo(clipName, PERFORMANCE_FADE);
	}

	async _endPerformance() {
		this.performing = false;
		this.walkPhase = 'returning';
		this._phaseTarget = this.backstagePos;
		this._spotTarget = this.spotIdleIntensity;
		this._accentTarget = 0.4;
		// Release auto-cam back to free if we were the ones who took it.
		if (this._autoCammed && clubCam.getMode() === 'vip') {
			clubCam.setFree();
		}
		this._autoCammed = false;
		// Signal the audio mixer (and anyone else listening) to fade the
		// style loop back to ambience. Dispatched on window so the page-
		// level audio binding can stay decoupled from this class.
		try {
			window.dispatchEvent(new CustomEvent('club:performance-end', {
				detail: { dancer: this.id, ticket: this.activeTicket },
			}));
		} catch {}
		await this.anim?.crossfadeTo(WALK_CLIP, PERFORMANCE_FADE);
	}

	async _arriveBackstage() {
		this.walkPhase = 'idle';
		this.activeTicket = null;
		this._phaseTarget = this.backstagePos;
		await this.anim?.crossfadeTo('idle', PERFORMANCE_FADE);
	}

	tick(dt) {
		// Lerp spotlight intensity.
		if (this._spotTarget != null) {
			this.spot.intensity += (this._spotTarget - this.spot.intensity) * Math.min(1, dt * 4);
		}
		if (this._accentTarget != null) {
			this.accent.intensity += (this._accentTarget - this.accent.intensity) * Math.min(1, dt * 4);
		}

		// Drive avatar walk between waypoints.
		if (this.walkPhase === 'to-pole' || this.walkPhase === 'returning') {
			const target = this._phaseTarget;
			const dir = new Vector3().subVectors(target, this.rig.position);
			dir.y = 0;
			const dist = dir.length();
			if (dist < 0.04) {
				this.rig.position.copy(target);
				if (this.walkPhase === 'to-pole') this._arriveAtPole();
				else this._arriveBackstage();
			} else {
				dir.normalize();
				const step = Math.min(dist, 1.4 * dt);
				this.rig.position.addScaledVector(dir, step);
				// Face direction of travel.
				const targetYaw = Math.atan2(dir.x, dir.z);
				this.rig.rotation.y += angleDelta(this.rig.rotation.y, targetYaw) * Math.min(1, dt * 6);
			}
		} else if (this.walkPhase === 'dancing') {
			// Keep dancer facing the camera (yaw lerp to original pole yaw).
			const targetYaw = this.layout.yaw;
			this.rig.rotation.y += angleDelta(this.rig.rotation.y, targetYaw) * Math.min(1, dt * 3);
			if (this.performing && Date.now() >= this.activeUntil) {
				this._endPerformance();
			}
		} else {
			// idle backstage — face into the room.
			const targetYaw = this.layout.yaw;
			this.rig.rotation.y += angleDelta(this.rig.rotation.y, targetYaw) * Math.min(1, dt * 1.5);
		}

		this.anim?.update(dt);
	}
}

function angleDelta(from, to) {
	let d = (to - from) % (Math.PI * 2);
	if (d > Math.PI) d -= Math.PI * 2;
	if (d < -Math.PI) d += Math.PI * 2;
	return d;
}

const stations = POLES.map((layout, i) => new PoleStation(i, layout));

// ── Disco / strobe light cycling ─────────────────────────────────────────
// A slowly rotating set of fill lights to keep the room feeling alive even
// when no dancers are out. Kept low-intensity so spotlights still dominate.
const disco = new Group();
scene.add(disco);
const discoColors = [0xff2bd6, 0x4ad6ff, 0xff8a3b, 0x6c4dff];
for (let i = 0; i < 4; i++) {
	const p = new PointLight(discoColors[i], 0.6, 12, 1.4);
	const angle = (i / 4) * Math.PI * 2;
	p.position.set(Math.sin(angle) * 5.5, 4.6, Math.cos(angle) * 5.5 - 1);
	disco.add(p);
}

// ── Avatar template + manifest load ──────────────────────────────────────
let animationDefs = null;
async function bootstrap() {
	setStatus('Loading club…');

	const loader = new GLTFLoader();
	const [gltf, manifest] = await Promise.all([
		loader.loadAsync(AVATAR_URL),
		fetch(MANIFEST_URL, { cache: 'force-cache' }).then((r) => {
			if (!r.ok) throw new Error(`HTTP ${r.status} loading animation manifest`);
			return r.json();
		}),
	]);

	const template = gltf.scene;
	// Mark all materials as cloneable up front so per-dancer tinting works.
	template.traverse((n) => {
		if (n.isMesh) n.castShadow = true;
	});

	animationDefs = manifest.filter((d) => REQUIRED_CLIPS.has(d.name));

	for (const station of stations) {
		station.attachAvatar(template, animationDefs);
	}

	setStatus('Tip a pole to make her dance.', { kind: 'ok' });
}

// ── Tip flow (x402 drop-in) ──────────────────────────────────────────────
async function tipDancer({ dancer, dance, button }) {
	if (!window.X402?.pay) {
		setStatus('Payment widget still loading — try again in a second.', { kind: 'error' });
		return;
	}

	const station = stations.find((s) => s.id === String(dancer));
	if (!station) {
		setStatus(`No dancer ${dancer} on stage.`, { kind: 'error' });
		return;
	}
	if (station.performing) {
		setStatus(`Dancer ${dancer} is already performing — tip another pole.`, { kind: 'warn' });
		return;
	}

	const url = `${TIP_ENDPOINT}?dancer=${encodeURIComponent(dancer)}&dance=${encodeURIComponent(dance)}`;

	button?.classList.add('is-pending');
	const originalLabel = button?.textContent;
	if (button) button.textContent = 'Open wallet…';

	try {
		const out = await window.X402.pay({
			endpoint: url,
			method: 'GET',
			merchant: 'three.ws Pole Club',
			action: `Tip Dancer ${dancer} — ${dance}`,
		});
		const ticket = out?.result;
		if (!ticket?.ok) {
			throw new Error(ticket?.error || 'tip did not settle');
		}
		station.startPerformance(ticket);
		pushFeed({
			dancer: ticket.dancer,
			label: ticket.label || ticket.dance,
			payer: ticket.payer,
			amountAtomics: ticket.amountAtomics,
			network: ticket.network,
		});
		setStatus(`Dancer ${ticket.dancer} → ${ticket.label}`, { kind: 'ok' });
	} catch (err) {
		if (err?.code !== 'cancelled') {
			setStatus(err?.message || 'tip failed', { kind: 'error' });
		}
	} finally {
		button?.classList.remove('is-pending');
		if (button && originalLabel) button.textContent = originalLabel;
	}
}

// ── Free cam chip (shown while in VIP / house) ───────────────────────────
let freeCamChip = null;
function ensureFreeCamChip() {
	if (freeCamChip) return freeCamChip;
	const chip = document.createElement('button');
	chip.type = 'button';
	chip.id = 'club-free-cam';
	chip.textContent = '↩ Free cam';
	chip.hidden = true;
	chip.addEventListener('click', () => clubCam.setFree());
	const stage = document.getElementById('club-stage');
	(stage || document.body).appendChild(chip);
	freeCamChip = chip;
	return chip;
}
function updateFreeCamChip(mode) {
	const chip = ensureFreeCamChip();
	chip.hidden = (mode === 'free');
}

// ── Auto-follow tips toggle (persisted) ──────────────────────────────────
const AUTO_FOLLOW_KEY = 'club:autoFollowTips';
let autoFollow = (() => {
	try { return localStorage.getItem(AUTO_FOLLOW_KEY) === '1'; } catch { return false; }
})();
function setAutoFollow(on) {
	autoFollow = !!on;
	try { localStorage.setItem(AUTO_FOLLOW_KEY, autoFollow ? '1' : '0'); } catch {}
}

// ── Side panel — render pole controls ────────────────────────────────────
const DANCES = [
	{ key: 'rumba',    label: 'Rumba' },
	{ key: 'silly',    label: 'Silly' },
	{ key: 'thriller', label: 'Thriller' },
	{ key: 'capoeira', label: 'Capoeira' },
	{ key: 'hiphop',   label: 'Hip Hop' },
];

function renderPoles() {
	if (!polesPanel) return;
	polesPanel.innerHTML = '';
	for (const pole of POLES) {
		const card = document.createElement('div');
		card.className = 'club-pole-card';
		card.innerHTML = `
			<div class="club-pole-head">
				<span class="club-pole-id">Pole ${pole.id}</span>
				<span class="club-pole-row-right">
					<span class="club-pole-price">$0.001 USDC</span>
					<button type="button" class="club-cam-btn" data-pole="${pole.id}" title="VIP cam">🎬</button>
				</span>
			</div>
			<label class="club-pole-style">
				Style
				<select data-dancer="${pole.id}" class="club-pole-select">
					${DANCES.map((d) => `<option value="${d.key}">${d.label}</option>`).join('')}
				</select>
			</label>
			<button type="button" class="club-tip-btn" data-dancer="${pole.id}">
				Tip ${pole.id} — make her dance
			</button>
		`;
		polesPanel.appendChild(card);
	}
	polesPanel.addEventListener('click', (e) => {
		const camBtn = e.target.closest('.club-cam-btn');
		if (camBtn) {
			const layout = POLES.find((p) => p.id === camBtn.dataset.pole);
			if (layout) clubCam.setVip(layout);
			return;
		}
		const btn = e.target.closest('.club-tip-btn');
		if (!btn) return;
		const dancer = btn.dataset.dancer;
		const select = polesPanel.querySelector(`.club-pole-select[data-dancer="${dancer}"]`);
		const dance = select?.value || 'rumba';
		tipDancer({ dancer, dance, button: btn });
	});
}

// ── Pointer + pinch handling ─────────────────────────────────────────────
// One pointer → orbit (ClubCamera.applyDrag, free mode only). Two pointers →
// pinch zoom (ClubCamera.applyZoom). Wheel also zooms. The camera state
// machine owns yaw/pitch — this block is just input plumbing.
{
	const pointers = new Map(); // pointerId → {x, y}
	let pinchPrevDist = 0;

	const pinchDistance = () => {
		const [a, b] = [...pointers.values()];
		return Math.hypot(a.x - b.x, a.y - b.y);
	};

	canvas.addEventListener('pointerdown', (e) => {
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		canvas.setPointerCapture?.(e.pointerId);
		if (pointers.size === 2) pinchPrevDist = pinchDistance();
	});
	canvas.addEventListener('pointermove', (e) => {
		const prev = pointers.get(e.pointerId);
		if (!prev) return;
		const dx = e.clientX - prev.x;
		const dy = e.clientY - prev.y;
		prev.x = e.clientX; prev.y = e.clientY;

		if (pointers.size === 1) {
			clubCam.applyDrag(dx, dy);
		} else if (pointers.size === 2) {
			const next = pinchDistance();
			// Pinch-in (fingers closer) → zoom in (negative deltaY); pinch-out → zoom out.
			const delta = (pinchPrevDist - next) * 4; // scale to wheel-ish units
			clubCam.applyZoom(delta);
			pinchPrevDist = next;
		}
	});
	const onUp = (e) => {
		if (!pointers.has(e.pointerId)) return;
		pointers.delete(e.pointerId);
		try { canvas.releasePointerCapture?.(e.pointerId); } catch {}
		if (pointers.size < 2) pinchPrevDist = 0;
	};
	canvas.addEventListener('pointerup', onUp);
	canvas.addEventListener('pointercancel', onUp);

	canvas.addEventListener('wheel', (e) => {
		e.preventDefault();
		clubCam.applyZoom(e.deltaY);
	}, { passive: false });
}

// ── Resize ────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
	renderer.setSize(window.innerWidth, window.innerHeight, false);
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
});

// ── Keyboard shortcuts ───────────────────────────────────────────────────
// 0     → overhead house cam
// 1-4   → per-pole VIP cam
// Esc   → back to free orbit
// Inputs / selects in the side panel are excluded so typing doesn't move
// the camera.
window.addEventListener('keydown', (e) => {
	const tag = e.target?.tagName;
	if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
	if (e.key === '0') return clubCam.setHouse();
	if (e.key === 'Escape') return clubCam.setFree();
	if (['1', '2', '3', '4'].includes(e.key)) {
		const layout = POLES.find((p) => p.id === e.key);
		if (layout) clubCam.setVip(layout);
	}
});

// ── Render loop ──────────────────────────────────────────────────────────
const clock = new Clock();
function animate() {
	const dt = Math.min(clock.getDelta(), 0.066);
	const t = clock.getElapsedTime();

	for (const station of stations) station.tick(dt);

	// Disco light slow swirl.
	disco.rotation.y = t * 0.25;

	// Camera state machine — orbit / VIP / house.
	clubCam.tick(dt);

	renderer.render(scene, camera);
	requestAnimationFrame(animate);
}

renderPoles();

// Bind the auto-follow checkbox to persisted state.
{
	const cb = document.getElementById('club-auto-follow');
	if (cb) {
		cb.checked = autoFollow;
		cb.addEventListener('change', () => setAutoFollow(cb.checked));
	}
}

bootstrap()
	.catch((err) => {
		console.error('[club] bootstrap failed', err);
		setStatus(`Club failed to load: ${err.message}`, { kind: 'error' });
	})
	.finally(() => animate());
