// Homepage "Pose it here" demo — a lite, embeddable slice of /pose.
// Reuses the exact same primitive Mannequin and preset library the full Pose
// Studio runs on, wrapped in a self-contained Three.js stage: orbit the camera,
// click a body part to select it, drag the X/Y/Z sliders to pose that joint, or
// tap a preset to morph the whole figure. No fake data — this is the real rig.
//
// The render loop is gated on visibility (IntersectionObserver) so the homepage
// stays smooth: the WebGL context idles whenever the section is off-screen.

import {
	AmbientLight,
	CircleGeometry,
	Color,
	DirectionalLight,
	HemisphereLight,
	Mesh,
	MeshBasicMaterial,
	PCFSoftShadowMap,
	PerspectiveCamera,
	Raycaster,
	Scene,
	ShadowMaterial,
	SphereGeometry,
	Vector2,
	Vector3,
	WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
	Mannequin,
	JOINT_LABELS,
	JOINT_AXIS_LABELS,
} from './pose-mannequin.js';
import { getPresetById } from './pose-presets.js';

// Curated spread of presets for the lite demo — one or two from each group so
// the chip row reads like a tour without overwhelming the homepage.
const DEMO_PRESET_IDS = [
	'relaxed',
	'tpose',
	'wave',
	'hands-on-hips',
	'run',
	'jump',
	'superhero-landing',
	'sit-chair',
	'thinker',
	'warrior2',
	'flex',
	'meditate',
];

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;
const prefersReducedMotion =
	typeof matchMedia === 'function' &&
	matchMedia('(prefers-reduced-motion: reduce)').matches;

const el = (tag, attrs = {}, children = []) => {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (k === 'class') node.className = v;
		else if (k === 'text') node.textContent = v;
		else if (k === 'html') node.innerHTML = v;
		else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
		else if (v !== false && v != null) node.setAttribute(k, v);
	}
	for (const child of [].concat(children)) {
		if (child == null) continue;
		node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
	}
	return node;
};

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function initHomePose(root) {
	const stage = root.querySelector('[data-pose-stage]');
	const chipRow = root.querySelector('[data-pose-chips]');
	const sliderHost = root.querySelector('[data-pose-sliders]');
	const selLabel = root.querySelector('[data-pose-selected]');
	const hint = root.querySelector('[data-pose-hint]');
	const resetBtn = root.querySelector('[data-pose-reset]');
	if (!stage || !chipRow || !sliderHost) return;

	// ── Scene ───────────────────────────────────────────────────────────
	const canvas = el('canvas', { class: 'hp-canvas' });
	stage.appendChild(canvas);

	const renderer = new WebGLRenderer({
		canvas,
		antialias: true,
		alpha: true,
		powerPreference: 'high-performance',
	});
	renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = PCFSoftShadowMap;

	const scene = new Scene();
	const camera = new PerspectiveCamera(42, 1, 0.05, 100);
	camera.position.set(1.7, 1.45, 3.1);

	const controls = new OrbitControls(camera, renderer.domElement);
	controls.target.set(0, 0.95, 0);
	controls.enableDamping = true;
	controls.dampingFactor = 0.08;
	controls.enablePan = false;
	controls.minDistance = 2.0;
	controls.maxDistance = 5.5;
	controls.minPolarAngle = 0.35;
	controls.maxPolarAngle = Math.PI * 0.52;
	controls.rotateSpeed = 0.85;

	// ── Lighting ────────────────────────────────────────────────────────
	scene.add(new AmbientLight(0xffffff, 0.55));
	const hemi = new HemisphereLight(0xffffff, 0x202024, 0.6);
	scene.add(hemi);
	const key = new DirectionalLight(0xffffff, 1.5);
	key.position.set(2.6, 4.2, 2.4);
	key.castShadow = true;
	key.shadow.mapSize.set(1024, 1024);
	key.shadow.camera.near = 0.5;
	key.shadow.camera.far = 14;
	key.shadow.camera.left = -3;
	key.shadow.camera.right = 3;
	key.shadow.camera.top = 4;
	key.shadow.camera.bottom = -2;
	key.shadow.bias = -0.0006;
	key.shadow.radius = 4;
	scene.add(key);
	const rim = new DirectionalLight(0xffffff, 0.35);
	rim.position.set(-3, 2, -2.5);
	scene.add(rim);

	// ── Ground (shadow catcher + faint disc) ────────────────────────────
	const disc = new Mesh(
		new CircleGeometry(3.4, 64),
		new MeshBasicMaterial({ color: new Color(0x0c0c0d) }),
	);
	disc.rotation.x = -Math.PI / 2;
	disc.position.y = -0.001;
	scene.add(disc);

	const shadowCatcher = new Mesh(
		new CircleGeometry(3.4, 64),
		new ShadowMaterial({ opacity: 0.42 }),
	);
	shadowCatcher.rotation.x = -Math.PI / 2;
	shadowCatcher.receiveShadow = true;
	scene.add(shadowCatcher);

	// ── Mannequin ───────────────────────────────────────────────────────
	const mannequin = new Mannequin({ build: 'male', color: '#e6e6ea' });
	mannequin.setConstraintsEnabled(true);
	scene.add(mannequin.root);

	// Selection marker — a soft glowing orb pinned to the active joint.
	// (The mannequin shares materials across the body, so we can't tint one
	// joint via emissive; an overlay marker selects without side effects.)
	const marker = new Mesh(
		new SphereGeometry(0.05, 20, 16),
		new MeshBasicMaterial({ color: 0x4fc3ff, transparent: true, opacity: 0.9 }),
	);
	marker.visible = false;
	scene.add(marker);
	const markerHalo = new Mesh(
		new SphereGeometry(0.085, 20, 16),
		new MeshBasicMaterial({ color: 0x4fc3ff, transparent: true, opacity: 0.18 }),
	);
	marker.add(markerHalo);

	// ── State ───────────────────────────────────────────────────────────
	let selected = null;
	const raycaster = new Raycaster();
	const pointer = new Vector2();
	const tmpVec = new Vector3();

	// Pose tween (preset morph). Captures start/target euler per joint + root.
	let tween = null;

	function captureEuler() {
		const pose = {};
		for (const name of Object.keys(mannequin.joints)) {
			const r = mannequin.joints[name].rotation;
			pose[name] = { x: r.x, y: r.y, z: r.z };
		}
		pose.rootPosition = {
			x: mannequin.root.position.x,
			y: mannequin.root.position.y,
			z: mannequin.root.position.z,
		};
		return pose;
	}

	function targetFromPreset(preset) {
		const target = {};
		for (const name of Object.keys(mannequin.joints)) {
			const r = preset.pose[name];
			target[name] = { x: r?.x || 0, y: r?.y || 0, z: r?.z || 0 };
		}
		const rp = preset.pose.rootPosition;
		target.rootPosition = { x: rp?.x || 0, y: rp?.y || 0, z: rp?.z || 0 };
		return target;
	}

	function applyEuler(pose) {
		for (const name of Object.keys(mannequin.joints)) {
			const r = pose[name];
			if (!r) continue;
			mannequin.joints[name].rotation.set(r.x, r.y, r.z);
		}
		if (pose.rootPosition) {
			mannequin.root.position.set(
				pose.rootPosition.x,
				pose.rootPosition.y,
				pose.rootPosition.z,
			);
		}
	}

	function morphToPreset(preset) {
		const target = targetFromPreset(preset);
		if (prefersReducedMotion) {
			applyEuler(target);
			refreshSliders();
			return;
		}
		tween = { from: captureEuler(), to: target, t: 0, dur: 0.55 };
	}

	function advanceTween(dt) {
		if (!tween) return;
		tween.t = Math.min(1, tween.t + dt / tween.dur);
		const k = easeInOutCubic(tween.t);
		const { from, to } = tween;
		for (const name of Object.keys(mannequin.joints)) {
			const a = from[name];
			const b = to[name];
			if (!a || !b) continue;
			mannequin.joints[name].rotation.set(
				a.x + (b.x - a.x) * k,
				a.y + (b.y - a.y) * k,
				a.z + (b.z - a.z) * k,
			);
		}
		mannequin.root.position.set(
			from.rootPosition.x + (to.rootPosition.x - from.rootPosition.x) * k,
			from.rootPosition.y + (to.rootPosition.y - from.rootPosition.y) * k,
			from.rootPosition.z + (to.rootPosition.z - from.rootPosition.z) * k,
		);
		if (tween.t >= 1) {
			tween = null;
			refreshSliders();
		}
	}

	// ── Selection ───────────────────────────────────────────────────────
	function selectJoint(name) {
		selected = name;
		if (selLabel) selLabel.textContent = name ? JOINT_LABELS[name] || name : '—';
		if (hint) hint.hidden = !!name;
		marker.visible = !!name;
		buildSliders(name);
	}

	function pickFromEvent(e) {
		const rect = canvas.getBoundingClientRect();
		pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
		pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
		raycaster.setFromCamera(pointer, camera);
		const hits = raycaster.intersectObjects(mannequin.selectableMeshes, false);
		if (!hits.length) return;
		const name = mannequin.jointFromHit(hits[0].object);
		if (name) selectJoint(name);
	}

	// Distinguish a click (select) from an orbit drag.
	let downPos = null;
	canvas.addEventListener('pointerdown', (e) => {
		downPos = { x: e.clientX, y: e.clientY };
	});
	canvas.addEventListener('pointerup', (e) => {
		if (!downPos) return;
		const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
		downPos = null;
		if (moved < 5) pickFromEvent(e);
	});

	// ── Sliders ─────────────────────────────────────────────────────────
	const sliderRefs = {};
	function buildSliders(name) {
		sliderHost.replaceChildren();
		for (const k of Object.keys(sliderRefs)) delete sliderRefs[k];
		if (!name) {
			sliderHost.appendChild(
				el('p', { class: 'hp-sliders-empty', text: 'Select a joint to reveal its controls.' }),
			);
			return;
		}
		const axisLabels = JOINT_AXIS_LABELS[name] || JOINT_AXIS_LABELS.default;
		for (const axis of ['x', 'y', 'z']) {
			const value = el('span', { class: 'hp-slider-val' });
			const input = el('input', {
				type: 'range',
				min: '-180',
				max: '180',
				step: '1',
				class: 'hp-slider',
				'aria-label': `${JOINT_LABELS[name] || name} ${axisLabels[axis]}`,
				oninput: () => {
					const rad = Number(input.value) * RAD;
					mannequin.setJointRotation(name, axis, rad);
					value.textContent = `${Math.round(mannequin.getJointRotation(name)[axis] * DEG)}°`;
				},
			});
			sliderRefs[axis] = { input, value };
			sliderHost.appendChild(
				el('div', { class: 'hp-slider-row' }, [
					el('div', { class: 'hp-slider-head' }, [
						el('span', { class: 'hp-slider-axis', text: axisLabels[axis] }),
						value,
					]),
					input,
				]),
			);
		}
		refreshSliders();
	}

	function refreshSliders() {
		if (!selected) return;
		const rot = mannequin.getJointRotation(selected);
		for (const axis of ['x', 'y', 'z']) {
			const ref = sliderRefs[axis];
			if (!ref) continue;
			ref.input.value = String(Math.round(rot[axis] * DEG));
			ref.value.textContent = `${Math.round(rot[axis] * DEG)}°`;
		}
	}

	// ── Preset chips ────────────────────────────────────────────────────
	let activeChip = null;
	for (const id of DEMO_PRESET_IDS) {
		const preset = getPresetById(id);
		if (!preset) continue;
		const chip = el('button', {
			type: 'button',
			class: 'hp-chip',
			text: preset.label,
			onclick: () => {
				morphToPreset(preset);
				if (activeChip) activeChip.classList.remove('is-active');
				chip.classList.add('is-active');
				activeChip = chip;
			},
		});
		chipRow.appendChild(chip);
	}

	if (resetBtn) {
		resetBtn.addEventListener('click', () => {
			const relaxed = getPresetById('relaxed');
			if (relaxed) morphToPreset(relaxed);
			if (activeChip) {
				activeChip.classList.remove('is-active');
				activeChip = null;
			}
		});
	}

	// ── Render loop (visibility-gated) ──────────────────────────────────
	let running = false;
	let last = 0;
	let rafId = 0;

	function resize() {
		const w = stage.clientWidth;
		const h = stage.clientHeight;
		if (!w || !h) return;
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
	}

	function frame(now) {
		if (!running) return;
		rafId = requestAnimationFrame(frame);
		const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
		last = now;
		advanceTween(dt);
		if (selected && mannequin.joints[selected]) {
			mannequin.joints[selected].getWorldPosition(tmpVec);
			marker.position.copy(tmpVec);
		}
		const pulse = 0.9 + Math.sin(now / 320) * 0.12;
		markerHalo.scale.setScalar(pulse);
		controls.update();
		renderer.render(scene, camera);
	}

	function start() {
		if (running) return;
		running = true;
		last = 0;
		resize();
		rafId = requestAnimationFrame(frame);
	}
	function stop() {
		running = false;
		if (rafId) cancelAnimationFrame(rafId);
		rafId = 0;
	}

	const ro = new ResizeObserver(resize);
	ro.observe(stage);

	const io = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) start();
				else stop();
			}
		},
		{ threshold: 0.08 },
	);
	io.observe(stage);

	// ── First pose ──────────────────────────────────────────────────────
	const initial = getPresetById('relaxed');
	if (initial) applyEuler(targetFromPreset(initial));
	buildSliders(null);
	resize();
}

function boot() {
	const root = document.getElementById('home-pose');
	if (root) initHomePose(root);
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
	boot();
}
