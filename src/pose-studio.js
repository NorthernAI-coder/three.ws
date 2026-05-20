// /pose — 3D pose-reference studio inspired by setpose.com. Builds a
// Three.js scene with an articulated Mannequin, orbit camera, ground +
// grid, and a control panel that lets the user pick presets, drag joints
// to pose them, tweak sliders for fine control, swap body type, add floor
// props, change lighting and FOV, and export a PNG screenshot.

import {
	AmbientLight,
	BoxGeometry,
	CircleGeometry,
	Color,
	CylinderGeometry,
	DirectionalLight,
	GridHelper,
	Group,
	HemisphereLight,
	Mesh,
	MeshStandardMaterial,
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

import { JOINT_AXIS_LABELS, JOINT_LABELS, Mannequin } from './pose-mannequin.js';
import { PRESETS, getPresetsByGroup, getPresetById } from './pose-presets.js';

// ─── DOM helpers ────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, children = []) => {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (k === 'class') node.className = v;
		else if (k === 'text') node.textContent = v;
		else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
		else if (v !== false && v != null) node.setAttribute(k, v);
	}
	for (const child of children) {
		if (child == null) continue;
		node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
	}
	return node;
};

// ─── Floor props ────────────────────────────────────────────────────────
// Simple primitive-based props the user can drop into the scene as drawing
// references. Each prop is a function that returns a Group positioned so
// its base sits on y = 0.
const FLOOR_PROPS = {
	none: { label: 'None', build: null },
	chair: {
		label: 'Chair',
		build: () => {
			const g = new Group();
			const wood = new MeshStandardMaterial({ color: '#8b6f47', roughness: 0.8 });
			const seat = new Mesh(new BoxGeometry(0.46, 0.05, 0.46), wood);
			seat.position.y = 0.45;
			seat.castShadow = true;
			seat.receiveShadow = true;
			g.add(seat);
			const legGeom = new BoxGeometry(0.05, 0.45, 0.05);
			for (const [x, z] of [[+0.19, +0.19], [+0.19, -0.19], [-0.19, +0.19], [-0.19, -0.19]]) {
				const leg = new Mesh(legGeom, wood);
				leg.position.set(x, 0.225, z);
				leg.castShadow = true;
				leg.receiveShadow = true;
				g.add(leg);
			}
			const back = new Mesh(new BoxGeometry(0.46, 0.55, 0.04), wood);
			back.position.set(0, 0.75, -0.22);
			back.castShadow = true;
			back.receiveShadow = true;
			g.add(back);
			return g;
		},
	},
	stool: {
		label: 'Stool',
		build: () => {
			const g = new Group();
			const mat = new MeshStandardMaterial({ color: '#3f3f46', roughness: 0.6 });
			const top = new Mesh(new CylinderGeometry(0.22, 0.22, 0.05, 24), mat);
			top.position.y = 0.45;
			top.castShadow = true;
			top.receiveShadow = true;
			g.add(top);
			const post = new Mesh(new CylinderGeometry(0.04, 0.04, 0.42, 14), mat);
			post.position.y = 0.21;
			post.castShadow = true;
			g.add(post);
			const base = new Mesh(new CylinderGeometry(0.18, 0.20, 0.03, 24), mat);
			base.position.y = 0.015;
			base.receiveShadow = true;
			g.add(base);
			return g;
		},
	},
	cube: {
		label: 'Cube',
		build: () => {
			const g = new Group();
			const mat = new MeshStandardMaterial({ color: '#ef4444', roughness: 0.7 });
			const box = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), mat);
			box.position.y = 0.25;
			box.castShadow = true;
			box.receiveShadow = true;
			g.add(box);
			return g;
		},
	},
	ball: {
		label: 'Ball',
		build: () => {
			const g = new Group();
			const mat = new MeshStandardMaterial({ color: '#facc15', roughness: 0.5 });
			const ball = new Mesh(new SphereGeometry(0.18, 24, 16), mat);
			ball.position.y = 0.18;
			ball.castShadow = true;
			ball.receiveShadow = true;
			g.add(ball);
			return g;
		},
	},
	plinth: {
		label: 'Plinth',
		build: () => {
			const g = new Group();
			const mat = new MeshStandardMaterial({ color: '#a8a29e', roughness: 0.85 });
			const box = new Mesh(new BoxGeometry(0.7, 0.8, 0.7), mat);
			box.position.y = 0.4;
			box.castShadow = true;
			box.receiveShadow = true;
			g.add(box);
			return g;
		},
	},
};

// ─── Scene setup ────────────────────────────────────────────────────────
function setupScene(canvas, hudStatus) {
	const scene = new Scene();
	scene.background = new Color('#0b0b10');

	const camera = new PerspectiveCamera(45, 1, 0.05, 100);
	camera.position.set(2.2, 1.65, 3.0);

	const renderer = new WebGLRenderer({
		canvas,
		antialias: true,
		preserveDrawingBuffer: true, // needed for toDataURL screenshots
	});
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = PCFSoftShadowMap;

	const controls = new OrbitControls(camera, canvas);
	controls.enableDamping = true;
	controls.dampingFactor = 0.08;
	controls.minDistance = 0.6;
	controls.maxDistance = 12;
	controls.maxPolarAngle = Math.PI * 0.96;
	controls.target.set(0, 0.95, 0);

	// Lighting — a hemisphere + key directional light produces the soft
	// silhouette/shadow look that pose references need.
	const hemi = new HemisphereLight('#f1f5f9', '#0a0a0f', 0.55);
	scene.add(hemi);
	const ambient = new AmbientLight('#ffffff', 0.18);
	scene.add(ambient);

	const key = new DirectionalLight('#ffffff', 1.4);
	key.position.set(3, 5, 2.5);
	key.castShadow = true;
	key.shadow.mapSize.set(2048, 2048);
	key.shadow.camera.near = 0.5;
	key.shadow.camera.far = 18;
	key.shadow.camera.left = -3.5;
	key.shadow.camera.right = 3.5;
	key.shadow.camera.top = 4;
	key.shadow.camera.bottom = -1;
	key.shadow.bias = -0.0008;
	scene.add(key);

	const fill = new DirectionalLight('#9bb1ff', 0.35);
	fill.position.set(-2.5, 2, -2);
	scene.add(fill);

	// Ground — invisible shadow catcher + grid for reference.
	const ground = new Mesh(new CircleGeometry(12, 64), new ShadowMaterial({ opacity: 0.35 }));
	ground.rotation.x = -Math.PI / 2;
	ground.position.y = 0;
	ground.receiveShadow = true;
	scene.add(ground);

	const grid = new GridHelper(8, 32, 0x2a2a35, 0x1a1a22);
	grid.position.y = 0.001;
	scene.add(grid);

	const propLayer = new Group();
	scene.add(propLayer);

	function resize() {
		const w = canvas.clientWidth;
		const h = canvas.clientHeight;
		renderer.setSize(w, h, false);
		camera.aspect = w / Math.max(1, h);
		camera.updateProjectionMatrix();
	}
	window.addEventListener('resize', resize);
	resize();

	function setStatus(text, kind = 'info') {
		if (!hudStatus) return;
		hudStatus.textContent = text;
		hudStatus.dataset.kind = kind;
	}

	return { scene, camera, renderer, controls, key, hemi, ambient, propLayer, setStatus };
}

// ─── State ──────────────────────────────────────────────────────────────
const state = {
	selectedJoint: null,
	dragMode: 'bend', // 'bend' | 'tilt' | 'twist' | 'move'
	dragging: null,    // { joint, startX, startY, startRot }
	prop: 'none',
	propGroup: null,
	keyLight: null,
	keyAzimuth: 0.9,    // radians around Y
	keyElevation: 0.95, // radians from +Y down
	keyDistance: 5.8,
};

// ─── App boot ───────────────────────────────────────────────────────────
function boot() {
	const canvas = $('#pose-canvas');
	const hudStatus = $('#pose-status');
	if (!canvas) {
		console.error('[pose] missing #pose-canvas');
		return;
	}

	const ctx = setupScene(canvas, hudStatus);
	const { scene, camera, renderer, controls, key, propLayer, setStatus } = ctx;
	state.keyLight = key;

	const mannequin = new Mannequin({ build: 'male', color: '#d4d4d8' });
	scene.add(mannequin.root);

	// Pick a reasonable starting pose so the figure looks alive on load.
	const intro = getPresetById('contrapposto');
	if (intro) mannequin.applyPose(intro.pose);

	// Render loop.
	function tick() {
		requestAnimationFrame(tick);
		controls.update();
		renderer.render(scene, camera);
	}
	tick();

	// ── Raycast selection + drag-to-rotate ──────────────────────────────
	const raycaster = new Raycaster();
	const ndc = new Vector2();

	function pickJointAt(clientX, clientY) {
		const rect = canvas.getBoundingClientRect();
		ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
		ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
		raycaster.setFromCamera(ndc, camera);
		const hits = raycaster.intersectObjects(mannequin.selectableMeshes, false);
		if (!hits.length) return null;
		return mannequin.jointFromHit(hits[0].object);
	}

	function selectJoint(name) {
		state.selectedJoint = name;
		renderControlsPanel();
		updateSelectionLabel();
	}

	canvas.addEventListener('pointerdown', (ev) => {
		// Left button only — right/middle stay with OrbitControls.
		if (ev.button !== 0) return;
		const joint = pickJointAt(ev.clientX, ev.clientY);
		if (!joint) return;
		selectJoint(joint);
		if (state.dragMode === 'move') return;
		controls.enabled = false;
		const rot = mannequin.getJointRotation(joint);
		state.dragging = {
			joint,
			startX: ev.clientX,
			startY: ev.clientY,
			startRot: { ...rot },
		};
		canvas.setPointerCapture(ev.pointerId);
		ev.preventDefault();
	});

	canvas.addEventListener('pointermove', (ev) => {
		const d = state.dragging;
		if (!d) return;
		const dx = (ev.clientX - d.startX) / 140;
		const dy = (ev.clientY - d.startY) / 140;
		const r = { ...d.startRot };
		if (state.dragMode === 'bend') {
			r.x = d.startRot.x + dy;
			r.z = d.startRot.z + dx;
		} else if (state.dragMode === 'tilt') {
			r.z = d.startRot.z + dx;
			r.x = d.startRot.x + dy * 0.3;
		} else if (state.dragMode === 'twist') {
			r.y = d.startRot.y + dx;
		}
		mannequin.setJointRotation(d.joint, 'x', r.x);
		mannequin.setJointRotation(d.joint, 'y', r.y);
		mannequin.setJointRotation(d.joint, 'z', r.z);
		// Re-read so constraint clamping is reflected in the sliders.
		if (state.selectedJoint === d.joint) renderControlsPanel();
	});

	function endDrag(ev) {
		if (!state.dragging) return;
		try { canvas.releasePointerCapture(ev.pointerId); } catch {}
		state.dragging = null;
		controls.enabled = true;
	}
	canvas.addEventListener('pointerup', endDrag);
	canvas.addEventListener('pointercancel', endDrag);

	// ── Controls panel rendering ────────────────────────────────────────
	const sliderHost = $('#pose-controls-host');
	const selectionLabel = $('#pose-selection-label');

	function updateSelectionLabel() {
		if (!selectionLabel) return;
		selectionLabel.textContent = state.selectedJoint
			? JOINT_LABELS[state.selectedJoint] || state.selectedJoint
			: 'Click a body part';
	}

	function renderControlsPanel() {
		if (!sliderHost) return;
		sliderHost.innerHTML = '';
		const joint = state.selectedJoint;
		if (!joint) {
			sliderHost.appendChild(
				el('p', { class: 'pose-hint' }, [
					'Click any body part in the scene, or pick a preset on the right, to start posing.',
				]),
			);
			return;
		}
		const rot = mannequin.getJointRotation(joint);
		const axisLabels = JOINT_AXIS_LABELS[joint] || JOINT_AXIS_LABELS.default;
		for (const axis of ['x', 'y', 'z']) {
			const value = rot[axis];
			const row = el('div', { class: 'pose-slider-row' }, [
				el('label', {}, [`${axisLabels[axis]} (${axis.toUpperCase()})`]),
				el('div', { class: 'pose-slider-value', 'data-axis': axis }, [
					`${((value * 180) / Math.PI).toFixed(0)}°`,
				]),
			]);
			const slider = el('input', {
				type: 'range',
				min: '-3.14159',
				max: '3.14159',
				step: '0.01',
				value: String(value),
			});
			slider.addEventListener('input', () => {
				const v = parseFloat(slider.value);
				mannequin.setJointRotation(joint, axis, v);
				const next = mannequin.getJointRotation(joint);
				row.querySelector(`.pose-slider-value[data-axis="${axis}"]`).textContent =
					`${((next[axis] * 180) / Math.PI).toFixed(0)}°`;
				// If constraint clamped the value, snap the slider back.
				slider.value = String(next[axis]);
			});
			row.appendChild(slider);
			sliderHost.appendChild(row);
		}
		// Reset-this-joint button.
		const resetBtn = el('button', {
			class: 'pose-btn pose-btn-ghost',
			type: 'button',
		}, ['Reset this joint']);
		resetBtn.addEventListener('click', () => {
			mannequin.setJointRotation(joint, 'x', 0);
			mannequin.setJointRotation(joint, 'y', 0);
			mannequin.setJointRotation(joint, 'z', 0);
			renderControlsPanel();
		});
		sliderHost.appendChild(resetBtn);
	}
	renderControlsPanel();
	updateSelectionLabel();

	// ── Joint-list quick picker (left panel) ────────────────────────────
	const jointPicker = $('#pose-joint-picker');
	if (jointPicker) {
		const order = [
			['Head', ['head', 'neck']],
			['Torso', ['chest', 'spine', 'pelvis']],
			['Arms', ['shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR']],
			['Legs', ['hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR']],
		];
		for (const [group, names] of order) {
			jointPicker.appendChild(el('div', { class: 'pose-joint-group' }, [group]));
			const row = el('div', { class: 'pose-joint-row' }, []);
			for (const name of names) {
				const btn = el('button', {
					class: 'pose-joint-btn',
					type: 'button',
					'data-joint': name,
				}, [JOINT_LABELS[name] || name]);
				btn.addEventListener('click', () => selectJoint(name));
				row.appendChild(btn);
			}
			jointPicker.appendChild(row);
		}
	}

	// ── Preset picker (right panel) ─────────────────────────────────────
	const presetHost = $('#pose-presets-host');
	if (presetHost) {
		const grouped = getPresetsByGroup();
		for (const [groupName, presets] of Object.entries(grouped)) {
			if (!presets.length) continue;
			presetHost.appendChild(el('div', { class: 'pose-preset-group' }, [groupName]));
			const wrap = el('div', { class: 'pose-preset-grid' }, []);
			for (const preset of presets) {
				const btn = el('button', {
					class: 'pose-preset-btn',
					type: 'button',
					'data-preset': preset.id,
				}, [preset.label]);
				btn.addEventListener('click', () => {
					mannequin.applyPose(preset.pose);
					selectJoint(state.selectedJoint); // re-render sliders
					setStatus(`Applied preset: ${preset.label}`);
				});
				wrap.appendChild(btn);
			}
			presetHost.appendChild(wrap);
		}
	}

	// ── Top toolbar wiring ──────────────────────────────────────────────
	const modeButtons = document.querySelectorAll('[data-mode]');
	modeButtons.forEach((btn) => {
		btn.addEventListener('click', () => {
			state.dragMode = btn.dataset.mode;
			modeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
		});
	});
	const initialMode = document.querySelector(`[data-mode="${state.dragMode}"]`);
	if (initialMode) initialMode.setAttribute('aria-pressed', 'true');

	$('#pose-reset')?.addEventListener('click', () => {
		mannequin.resetPose();
		setStatus('Pose reset.');
		renderControlsPanel();
	});

	$('#pose-screenshot')?.addEventListener('click', async () => {
		// Force one synchronous render so the WebGL backbuffer is fresh
		// before we grab a data URL (preserveDrawingBuffer keeps it valid).
		renderer.render(scene, camera);
		const url = canvas.toDataURL('image/png');
		const a = document.createElement('a');
		a.href = url;
		a.download = `pose-${Date.now()}.png`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setStatus('Screenshot saved.');
	});

	$('#pose-export-json')?.addEventListener('click', () => {
		const pose = mannequin.getPose();
		const blob = new Blob([JSON.stringify(pose, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `pose-${Date.now()}.json`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		setStatus('Pose JSON saved.');
	});

	$('#pose-import-json')?.addEventListener('change', (ev) => {
		const file = ev.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			try {
				const pose = JSON.parse(String(reader.result));
				mannequin.applyPose(pose);
				renderControlsPanel();
				setStatus(`Imported pose from ${file.name}.`);
			} catch (err) {
				setStatus(`Import failed: ${err.message}`, 'error');
			}
		};
		reader.readAsText(file);
		ev.target.value = '';
	});

	// ── Settings panel ──────────────────────────────────────────────────
	$('#pose-build')?.addEventListener('change', (ev) => {
		mannequin.setBuild(ev.target.value);
	});

	$('#pose-skin')?.addEventListener('input', (ev) => {
		mannequin.setColor(ev.target.value);
	});

	$('#pose-bg')?.addEventListener('input', (ev) => {
		scene.background = new Color(ev.target.value);
	});

	$('#pose-constraints')?.addEventListener('change', (ev) => {
		mannequin.setConstraintsEnabled(ev.target.checked);
		setStatus(ev.target.checked ? 'Biological constraints on.' : 'Constraints off — full rotation allowed.');
	});

	$('#pose-fov')?.addEventListener('input', (ev) => {
		camera.fov = parseFloat(ev.target.value);
		camera.updateProjectionMatrix();
	});

	$('#pose-grid')?.addEventListener('change', (ev) => {
		ctx.scene.traverse((o) => {
			if (o.isGridHelper) o.visible = ev.target.checked;
		});
	});

	// Light direction — azimuth (around Y) and elevation. Distance fixed
	// to the value set in state.keyDistance. Updating these moves the key
	// light around the figure to change shadow direction.
	function syncKeyLight() {
		const r = state.keyDistance;
		const az = state.keyAzimuth;
		const el = state.keyElevation; // angle from horizon
		const x = r * Math.cos(el) * Math.sin(az);
		const z = r * Math.cos(el) * Math.cos(az);
		const y = r * Math.sin(el);
		state.keyLight.position.set(x, y, z);
		state.keyLight.target.position.set(0, 0.9, 0);
		state.keyLight.target.updateMatrixWorld();
	}
	syncKeyLight();

	$('#pose-light-azimuth')?.addEventListener('input', (ev) => {
		state.keyAzimuth = (parseFloat(ev.target.value) / 180) * Math.PI;
		syncKeyLight();
	});
	$('#pose-light-elevation')?.addEventListener('input', (ev) => {
		state.keyElevation = (parseFloat(ev.target.value) / 180) * Math.PI;
		syncKeyLight();
	});
	$('#pose-light-intensity')?.addEventListener('input', (ev) => {
		state.keyLight.intensity = parseFloat(ev.target.value);
	});

	// ── Floor props ─────────────────────────────────────────────────────
	const propHost = $('#pose-prop-host');
	if (propHost) {
		for (const [id, def] of Object.entries(FLOOR_PROPS)) {
			const btn = el('button', {
				class: 'pose-prop-btn',
				type: 'button',
				'data-prop': id,
				'aria-pressed': String(state.prop === id),
			}, [def.label]);
			btn.addEventListener('click', () => {
				state.prop = id;
				propLayer.clear();
				if (def.build) {
					const g = def.build();
					propLayer.add(g);
					state.propGroup = g;
				}
				document.querySelectorAll('[data-prop]').forEach((b) => {
					b.setAttribute('aria-pressed', String(b.dataset.prop === id));
				});
			});
			propHost.appendChild(btn);
		}
	}

	setStatus('Ready. Click a body part to pose.');
}

document.addEventListener('DOMContentLoaded', boot);
