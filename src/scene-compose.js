/**
 * Scene Composer — real-time 3D scene editor with Forge integration.
 *
 * Architecture:
 *   - Single Three.js scene (NOT reusing viewer.js — different multi-object lifecycle)
 *   - SceneObjects Map: id → { mesh, name, glbUrl, visible, boneAttached, boneName }
 *   - TransformControls for gizmo; OrbitControls for camera; both co-exist cleanly
 *   - Forge panel: prompt → POST /api/forge → poll /api/forge?job= → GLB into scene
 *   - Creations gallery: /api/forge-gallery lists prior creations to drag-in
 *   - Save: GLTFExporter for GLB export; PATCH /api/avatars/:id for outfit attach
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const canvasEl       = document.getElementById('compose-canvas');
const loadingEl      = document.getElementById('canvas-loading');
const loadingMsgEl   = document.getElementById('loading-msg');
const avatarPromptEl = document.getElementById('avatar-prompt');
const canvasHintEl   = document.getElementById('canvas-hint');
const objectListEl   = document.getElementById('object-list');
const inspectorEl    = document.getElementById('inspector');
const saveStatusEl   = document.getElementById('save-status');

// Topbar
const btnTranslate = document.getElementById('btn-translate');
const btnRotate    = document.getElementById('btn-rotate');
const btnScale     = document.getElementById('btn-scale');
const btnSpace     = document.getElementById('btn-space');
const spaceLabel   = document.getElementById('space-label');
const btnExport    = document.getElementById('btn-export-glb');
const btnSaveOutfit = document.getElementById('btn-save-outfit');

// Forge panel
const forgePromptEl    = document.getElementById('forge-prompt');
const forgeBtn         = document.getElementById('forge-btn');
const forgeProgress    = document.getElementById('forge-progress');
const forgeProgressFill = document.getElementById('forge-progress-fill');
const forgeProgressMsg = document.getElementById('forge-progress-msg');
const forgeError       = document.getElementById('forge-error');
const creationsListEl  = document.getElementById('creations-list');
const dropZone         = document.getElementById('drop-zone');
const glbFileInput     = document.getElementById('glb-file-input');

// Avatar load
const avatarUrlInput   = document.getElementById('avatar-url-input');
const btnLoadUrl       = document.getElementById('btn-load-url');
const btnBrowseAvatars = document.getElementById('btn-browse-avatars');
const btnSkipAvatar    = document.getElementById('btn-skip-avatar');
const btnLoadSmall     = document.getElementById('btn-load-avatar-small');
const avatarModal      = document.getElementById('avatar-modal');
const avatarModalClose = document.getElementById('avatar-modal-close');
const avatarModalBody  = document.getElementById('avatar-modal-body');

// ── Client identity (auth-free per CLAUDE.md / forge pattern) ─────────────────
function getClientKey() {
	let k = localStorage.getItem('forge_client_key');
	if (!k) { k = crypto.randomUUID(); localStorage.setItem('forge_client_key', k); }
	return k;
}
const CLIENT_KEY = getClientKey();
const CLIENT_HEADERS = { 'x-forge-client': CLIENT_KEY };

// ── Scene state ───────────────────────────────────────────────────────────────
const sceneObjects = new Map(); // id → { group, name, glbUrl, visible, boneAttached, boneName }
let nextId = 1;
let selectedId = null;
let avatarId = null; // object id of the loaded avatar
let avatarBones = []; // { name, bone } from skeleton
let transformMode = 'translate'; // 'translate' | 'rotate' | 'scale'
let transformSpace = 'world';   // 'world' | 'local'

// ── Three.js setup ────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07070f);

// Environment
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
pmremGenerator.dispose();

// Grid helper
const grid = new THREE.GridHelper(20, 40, 0x222233, 0x111122);
grid.material.opacity = 0.6;
grid.material.transparent = true;
scene.add(grid);

// Camera
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
camera.position.set(0, 1.5, 3.5);
camera.lookAt(0, 1, 0);

// OrbitControls
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 1, 0);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;
orbit.minDistance = 0.2;
orbit.maxDistance = 50;

// TransformControls
const transform = new TransformControls(camera, renderer.domElement);
transform.setMode(transformMode);
transform.setSpace(transformSpace);
scene.add(transform);

// Pause orbit while dragging the gizmo
transform.addEventListener('dragging-changed', (e) => {
	orbit.enabled = !e.value;
	if (!e.value) updateInspector(); // sync inspector after drag
});

// Light
const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(3, 8, 5);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
scene.add(dirLight);

// ── Resize ────────────────────────────────────────────────────────────────────
function resize() {
	const wrap = canvasEl.parentElement;
	const w = wrap.clientWidth;
	const h = wrap.clientHeight;
	renderer.setSize(w, h, false);
	camera.aspect = w / h;
	camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvasEl.parentElement);
resize();

// ── Render loop ───────────────────────────────────────────────────────────────
function animate() {
	requestAnimationFrame(animate);
	orbit.update();
	renderer.render(scene, camera);
}
animate();

// ── Loading helpers ───────────────────────────────────────────────────────────
function showLoading(msg = 'Loading…') {
	loadingMsgEl.textContent = msg;
	loadingEl.classList.remove('hidden');
}
function hideLoading() {
	loadingEl.classList.add('hidden');
}

// ── GLB loader ────────────────────────────────────────────────────────────────
const gltfLoader = new GLTFLoader();

function loadGLB(url, name, opts = {}) {
	return new Promise((resolve, reject) => {
		gltfLoader.load(
			url,
			(gltf) => {
				const group = gltf.scene;
				group.traverse((n) => {
					if (n.isMesh) {
						n.castShadow = true;
						n.receiveShadow = true;
					}
				});
				// Auto-fit: center at origin, scale if huge
				const box = new THREE.Box3().setFromObject(group);
				const size = new THREE.Vector3();
				box.getSize(size);
				const maxDim = Math.max(size.x, size.y, size.z);
				if (!opts.preserveTransform) {
					const center = new THREE.Vector3();
					box.getCenter(center);
					group.position.sub(center);
					group.position.y += size.y / 2; // stand on ground plane
					if (maxDim > 4) {
						const s = 2 / maxDim;
						group.scale.setScalar(s);
					}
				}
				// Collect bones if this is an avatar
				const bones = [];
				group.traverse((n) => {
					if (n.isBone) bones.push({ name: n.name, bone: n });
				});
				resolve({ group, gltf, bones });
			},
			undefined,
			reject,
		);
	});
}

// ── Scene object registry ─────────────────────────────────────────────────────
function addObjectToScene(group, name, glbUrl, role = 'item') {
	const id = nextId++;
	scene.add(group);
	sceneObjects.set(id, { group, name, glbUrl, visible: true, boneAttached: false, boneName: null, role });
	renderObjectList();
	selectObject(id);
	return id;
}

function removeObject(id) {
	const obj = sceneObjects.get(id);
	if (!obj) return;
	if (selectedId === id) deselect();
	// Detach from bone if attached
	if (obj.boneAttached && obj.boneName) {
		const boneEntry = avatarBones.find((b) => b.name === obj.boneName);
		if (boneEntry) {
			scene.attach(obj.group);
		}
	}
	scene.remove(obj.group);
	sceneObjects.delete(id);
	if (id === avatarId) {
		avatarId = null;
		avatarBones = [];
	}
	renderObjectList();
	if (selectedId === null) inspectorEl.innerHTML = '<span class="empty-msg">Select an object to inspect</span>';
}

function toggleVisibility(id) {
	const obj = sceneObjects.get(id);
	if (!obj) return;
	obj.visible = !obj.visible;
	obj.group.visible = obj.visible;
	renderObjectList();
}

// ── Selection ─────────────────────────────────────────────────────────────────
function selectObject(id) {
	selectedId = id;
	const obj = sceneObjects.get(id);
	if (!obj) { deselect(); return; }
	transform.attach(obj.group);
	renderObjectList();
	updateInspector();
}

function deselect() {
	selectedId = null;
	transform.detach();
	renderObjectList();
	inspectorEl.className = 'empty';
	inspectorEl.innerHTML = '<span class="empty-msg">Select an object to inspect</span>';
}

// Click-to-select on canvas
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
canvasEl.addEventListener('pointerdown', (e) => {
	if (e.button !== 0) return;
	// Ignore if clicking the gizmo itself
	if (transform.dragging) return;
	const rect = canvasEl.getBoundingClientRect();
	mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
	mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
	raycaster.setFromCamera(mouse, camera);
	// Build meshes list, skip gizmo
	const meshes = [];
	sceneObjects.forEach((obj, id) => {
		if (!obj.visible) return;
		obj.group.traverse((n) => { if (n.isMesh) meshes.push({ mesh: n, id }); });
	});
	const hits = raycaster.intersectObjects(meshes.map((m) => m.mesh));
	if (hits.length) {
		const hitMesh = hits[0].object;
		const entry = meshes.find((m) => m.mesh === hitMesh);
		if (entry) selectObject(entry.id);
	} else {
		deselect();
	}
});

// ── Transform mode ────────────────────────────────────────────────────────────
function setMode(mode) {
	transformMode = mode;
	transform.setMode(mode);
	[btnTranslate, btnRotate, btnScale].forEach((b) => b.classList.remove('active'));
	({ translate: btnTranslate, rotate: btnRotate, scale: btnScale })[mode]?.classList.add('active');
}

btnTranslate.addEventListener('click', () => setMode('translate'));
btnRotate.addEventListener('click',    () => setMode('rotate'));
btnScale.addEventListener('click',     () => setMode('scale'));

btnSpace.addEventListener('click', () => {
	transformSpace = transformSpace === 'world' ? 'local' : 'world';
	transform.setSpace(transformSpace);
	spaceLabel.textContent = transformSpace === 'world' ? 'World' : 'Local';
});

document.addEventListener('keydown', (e) => {
	if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
	if (e.key === 'w' || e.key === 'W') setMode('translate');
	if (e.key === 'e' || e.key === 'E') setMode('rotate');
	if (e.key === 'r' || e.key === 'R') setMode('scale');
	if (e.key === 'Escape') deselect();
	if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId !== null) {
		if (e.target === document.body) { e.preventDefault(); removeObject(selectedId); }
	}
});

// ── Object list (left panel) ──────────────────────────────────────────────────
function renderObjectList() {
	objectListEl.innerHTML = '';
	sceneObjects.forEach((obj, id) => {
		const row = document.createElement('div');
		row.className = 'obj-row' + (id === selectedId ? ' selected' : '');
		row.dataset.id = id;

		const icon = document.createElement('span');
		icon.className = 'obj-icon';
		icon.textContent = iconForRole(obj.role);
		row.appendChild(icon);

		const nameEl = document.createElement('span');
		nameEl.className = 'obj-name';
		nameEl.textContent = obj.name;
		row.appendChild(nameEl);

		if (obj.role) {
			const roleEl = document.createElement('span');
			roleEl.className = 'obj-role' + (obj.boneAttached ? ' attached' : '');
			roleEl.textContent = obj.boneAttached ? `↑ ${obj.boneName?.split(/[_:]/).pop() || 'bone'}` : obj.role;
			row.appendChild(roleEl);
		}

		const visBtn = document.createElement('button');
		visBtn.className = 'obj-vis';
		visBtn.title = obj.visible ? 'Hide' : 'Show';
		visBtn.textContent = obj.visible ? '●' : '○';
		visBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleVisibility(id); });
		row.appendChild(visBtn);

		const delBtn = document.createElement('button');
		delBtn.className = 'obj-del';
		delBtn.title = 'Remove';
		delBtn.textContent = '×';
		delBtn.addEventListener('click', (e) => { e.stopPropagation(); removeObject(id); });
		row.appendChild(delBtn);

		row.addEventListener('click', () => selectObject(id));
		objectListEl.appendChild(row);
	});

	if (sceneObjects.size === 0) {
		const empty = document.createElement('div');
		empty.style.cssText = 'padding:16px 12px;font-size:11px;color:#52525b;';
		empty.textContent = 'No objects yet. Load an avatar or forge an item.';
		objectListEl.appendChild(empty);
	}
}

function iconForRole(role) {
	return { avatar: '◉', accessory: '◈', item: '◇', scene: '▦', creature: '◆', vehicle: '▷', other: '○' }[role] || '◇';
}

// ── Inspector ─────────────────────────────────────────────────────────────────
function updateInspector() {
	const obj = sceneObjects.get(selectedId);
	if (!obj) { deselect(); return; }

	inspectorEl.className = '';
	const g = obj.group;

	const fmt = (v) => v.toFixed(3);

	let html = `
		<div class="insp-section">Position</div>
		<div class="xform-row">
			<label>X</label>
			<input class="xform-input" data-axis="px" value="${fmt(g.position.x)}" />
			<input class="xform-input" data-axis="py" value="${fmt(g.position.y)}" />
			<input class="xform-input" data-axis="pz" value="${fmt(g.position.z)}" />
		</div>
		<div class="insp-section">Rotation (°)</div>
		<div class="xform-row">
			<label>R</label>
			<input class="xform-input" data-axis="rx" value="${fmt(THREE.MathUtils.radToDeg(g.rotation.x))}" />
			<input class="xform-input" data-axis="ry" value="${fmt(THREE.MathUtils.radToDeg(g.rotation.y))}" />
			<input class="xform-input" data-axis="rz" value="${fmt(THREE.MathUtils.radToDeg(g.rotation.z))}" />
		</div>
		<div class="insp-section">Scale</div>
		<div class="xform-row">
			<label>S</label>
			<input class="xform-input" data-axis="sx" value="${fmt(g.scale.x)}" />
			<input class="xform-input" data-axis="sy" value="${fmt(g.scale.y)}" />
			<input class="xform-input" data-axis="sz" value="${fmt(g.scale.z)}" />
		</div>
	`;

	// Bone attach section — only for non-avatar items when an avatar with bones is loaded
	if (obj.role !== 'avatar' && avatarId !== null && avatarBones.length > 0) {
		const boneOptions = avatarBones
			.map((b) => `<option value="${b.name}" ${obj.boneName === b.name ? 'selected' : ''}>${cleanBoneName(b.name)}</option>`)
			.join('');
		html += `
			<div class="attach-section">
				<div class="attach-label">Attach to Bone</div>
				<div class="attach-controls">
					<select class="bone-select" id="bone-select">${boneOptions}</select>
					${obj.boneAttached
						? `<button class="detach-btn" id="detach-btn">Detach</button>`
						: `<button class="attach-btn" id="attach-btn">Attach</button>`
					}
				</div>
			</div>
		`;
	}

	inspectorEl.innerHTML = html;

	// Wire inspector inputs
	inspectorEl.querySelectorAll('.xform-input').forEach((input) => {
		input.addEventListener('change', () => {
			const v = parseFloat(input.value);
			if (!isFinite(v)) return;
			const axis = input.dataset.axis;
			const o = sceneObjects.get(selectedId)?.group;
			if (!o) return;
			if (axis === 'px') o.position.x = v;
			else if (axis === 'py') o.position.y = v;
			else if (axis === 'pz') o.position.z = v;
			else if (axis === 'rx') o.rotation.x = THREE.MathUtils.degToRad(v);
			else if (axis === 'ry') o.rotation.y = THREE.MathUtils.degToRad(v);
			else if (axis === 'rz') o.rotation.z = THREE.MathUtils.degToRad(v);
			else if (axis === 'sx') o.scale.x = v;
			else if (axis === 'sy') o.scale.y = v;
			else if (axis === 'sz') o.scale.z = v;
		});
	});

	document.getElementById('attach-btn')?.addEventListener('click', () => {
		const boneName = document.getElementById('bone-select')?.value;
		if (boneName) attachToBone(selectedId, boneName);
	});
	document.getElementById('detach-btn')?.addEventListener('click', () => {
		detachFromBone(selectedId);
	});
}

function cleanBoneName(name) {
	return name
		.replace(/^mixamorig:?/i, '')
		.replace(/^CC_Base_/i, '')
		.replace(/^rig_/i, '')
		.replace(/_/g, ' ');
}

// ── Bone attachment ───────────────────────────────────────────────────────────
function attachToBone(itemId, boneName) {
	const item = sceneObjects.get(itemId);
	const boneEntry = avatarBones.find((b) => b.name === boneName);
	if (!item || !boneEntry) return;

	// Detach from previous bone first
	if (item.boneAttached) detachFromBone(itemId, false);

	// Re-attach: world position preserved, then reparented to bone
	scene.remove(item.group);
	boneEntry.bone.add(item.group);
	item.group.position.set(0, 0, 0); // reset local offset after attach
	item.group.rotation.set(0, 0, 0);
	item.boneAttached = true;
	item.boneName = boneName;

	renderObjectList();
	updateInspector();
}

function detachFromBone(itemId, updateUI = true) {
	const item = sceneObjects.get(itemId);
	if (!item || !item.boneAttached) return;
	const boneEntry = avatarBones.find((b) => b.name === item.boneName);
	if (boneEntry) {
		// scene.attach preserves world transform
		scene.attach(item.group);
	}
	item.boneAttached = false;
	item.boneName = null;
	if (updateUI) {
		renderObjectList();
		updateInspector();
	}
}

// ── Avatar loader ─────────────────────────────────────────────────────────────
async function loadAvatar(url, name = 'Avatar') {
	showLoading(`Loading avatar…`);
	avatarPromptEl.classList.add('hidden');
	canvasHintEl.classList.remove('hidden');
	try {
		const { group, bones } = await loadGLB(url, name);
		// Remove existing avatar if any
		if (avatarId !== null) removeObject(avatarId);
		const id = addObjectToScene(group, name, url, 'avatar');
		avatarId = id;
		avatarBones = bones;

		// Frame the avatar
		const box = new THREE.Box3().setFromObject(group);
		const center = new THREE.Vector3();
		box.getCenter(center);
		const size = new THREE.Vector3();
		box.getSize(size);
		orbit.target.copy(center);
		camera.position.set(center.x, center.y + size.y * 0.3, center.z + size.y * 1.4);
		orbit.update();
	} catch (err) {
		console.error('Avatar load failed:', err);
		avatarPromptEl.classList.remove('hidden');
		showError(`Failed to load avatar: ${err.message}`);
	} finally {
		hideLoading();
	}
}

// ── Avatar prompt handlers ────────────────────────────────────────────────────
btnLoadUrl.addEventListener('click', () => {
	const url = avatarUrlInput.value.trim();
	if (!url) return;
	loadAvatar(url, 'Avatar');
});
avatarUrlInput.addEventListener('keydown', (e) => {
	if (e.key === 'Enter') btnLoadUrl.click();
});

btnSkipAvatar.addEventListener('click', () => {
	avatarPromptEl.classList.add('hidden');
	canvasHintEl.classList.remove('hidden');
	hideLoading();
});

btnLoadSmall.addEventListener('click', () => {
	avatarPromptEl.classList.remove('hidden');
});

btnBrowseAvatars.addEventListener('click', openAvatarModal);
avatarModalClose.addEventListener('click', closeAvatarModal);
avatarModal.addEventListener('click', (e) => { if (e.target === avatarModal) closeAvatarModal(); });

async function openAvatarModal() {
	avatarModal.hidden = false;
	avatarModalBody.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:#52525b;font-size:12px;">Loading…</div>';
	try {
		const res = await fetch(`/api/explore?type=avatar&limit=20`);
		const data = await res.json().catch(() => ({}));
		const avatars = data.avatars || data.items || [];
		if (!avatars.length) {
			avatarModalBody.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:#52525b;font-size:12px;">No avatars found. Create one in the <a href="/forge" style="color:#a5b4fc;">Forge</a>.</div>';
			return;
		}
		avatarModalBody.innerHTML = '';
		for (const av of avatars) {
			if (!av.glbUrl && !av.glb_url) continue;
			const glbUrl = av.glbUrl || av.glb_url;
			const card = document.createElement('div');
			card.style.cssText = 'aspect-ratio:1;border-radius:8px;overflow:hidden;cursor:pointer;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);position:relative;transition:border-color 0.15s,transform 0.12s;';
			card.addEventListener('mouseenter', () => { card.style.borderColor = 'rgba(99,102,241,0.5)'; card.style.transform = 'scale(1.03)'; });
			card.addEventListener('mouseleave', () => { card.style.borderColor = ''; card.style.transform = ''; });
			if (av.thumbnailUrl || av.thumbnail_url) {
				const img = document.createElement('img');
				img.src = av.thumbnailUrl || av.thumbnail_url;
				img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
				img.alt = av.name || 'Avatar';
				card.appendChild(img);
			} else {
				card.style.display = 'flex';
				card.style.alignItems = 'center';
				card.style.justifyContent = 'center';
				card.innerHTML = '<span style="font-size:28px;opacity:0.3;">◉</span>';
			}
			const label = document.createElement('div');
			label.style.cssText = 'position:absolute;bottom:0;left:0;right:0;padding:4px 6px;background:rgba(0,0,0,0.6);font-size:10px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
			label.textContent = av.name || 'Avatar';
			card.appendChild(label);
			card.addEventListener('click', () => {
				closeAvatarModal();
				loadAvatar(glbUrl, av.name || 'Avatar');
			});
			avatarModalBody.appendChild(card);
		}
	} catch {
		avatarModalBody.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:#f87171;font-size:12px;">Failed to load avatars.</div>';
	}
}

function closeAvatarModal() {
	avatarModal.hidden = true;
}

// ── ?avatar= / ?glb= URL params — auto-load ───────────────────────────────────
(async () => {
	const params = new URLSearchParams(location.search);
	// ?glb=<url> — preload a forged GLB item (e.g. arriving from /forge)
	const glbParam = params.get('glb');
	if (glbParam) {
		avatarPromptEl.classList.add('hidden');
		canvasHintEl.classList.remove('hidden');
		showLoading('Loading item…');
		try {
			const { group } = await loadGLB(glbParam, 'Forged item');
			addObjectToScene(group, 'Forged item', glbParam, 'item');
		} catch (err) {
			showError(`Failed to load: ${err.message}`);
		} finally {
			hideLoading();
		}
	}
	const avatarParam = params.get('avatar');
	if (avatarParam) {
		// Could be a URL or an avatar ID — try as URL first, then fetch by ID
		if (avatarParam.startsWith('http')) {
			loadAvatar(avatarParam, 'Avatar');
		} else {
			showLoading('Fetching avatar…');
			try {
				const res = await fetch(`/api/avatars/${encodeURIComponent(avatarParam)}`);
				const data = await res.json().catch(() => ({}));
				const glbUrl = data.glbUrl || data.glb_url;
				if (glbUrl) {
					await loadAvatar(glbUrl, data.name || 'Avatar');
				} else {
					hideLoading();
				}
			} catch {
				hideLoading();
			}
		}
	} else {
		hideLoading();
	}
})();

// ── Forge integration ─────────────────────────────────────────────────────────
let forgeJobId = null;
let forgePollTimer = null;
let forgePollStart = 0;
const FORGE_TIMEOUT_MS = 5 * 60 * 1000; // 5 min

function setForgeState(busy) {
	forgeBtn.disabled = busy;
	forgeBtn.classList.toggle('busy', busy);
	forgePromptEl.disabled = busy;
}

function showForgeProgress(msg, pct) {
	forgeProgress.classList.add('visible');
	forgeProgressMsg.textContent = msg;
	forgeProgressFill.style.width = `${pct}%`;
}

function hideForgeProgress() {
	forgeProgress.classList.remove('visible');
}

function showError(msg) {
	forgeError.textContent = msg;
	forgeError.classList.add('visible');
	setTimeout(() => forgeError.classList.remove('visible'), 6000);
}

forgeBtn.addEventListener('click', startForge);
forgePromptEl.addEventListener('keydown', (e) => {
	if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) startForge();
});

async function startForge() {
	const prompt = forgePromptEl.value.trim();
	if (!prompt) { forgePromptEl.focus(); return; }
	if (forgeBtn.disabled) return;

	setForgeState(true);
	hideForgeProgress();
	forgeError.classList.remove('visible');

	try {
		const res = await fetch('/api/forge', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...CLIENT_HEADERS },
			body: JSON.stringify({ prompt }),
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

		if (data.status === 'done' && data.glb_url) {
			// Instant result (cached / fast backend)
			await addForgedItem(data, prompt);
			setForgeState(false);
			return;
		}
		if (!data.job_id) throw new Error('No job ID returned');

		forgeJobId = data.job_id;
		forgePollStart = Date.now();
		showForgeProgress('Generating…', 10);
		pollForge();
	} catch (err) {
		setForgeState(false);
		hideForgeProgress();
		showError(`Forge failed: ${err.message}`);
	}
}

function pollForge() {
	clearTimeout(forgePollTimer);
	if (!forgeJobId) return;

	if (Date.now() - forgePollStart > FORGE_TIMEOUT_MS) {
		setForgeState(false);
		hideForgeProgress();
		showError('Generation timed out. Try again.');
		forgeJobId = null;
		return;
	}

	forgePollTimer = setTimeout(async () => {
		try {
			const res = await fetch(`/api/forge?job=${encodeURIComponent(forgeJobId)}`, {
				headers: CLIENT_HEADERS,
			});
			const data = await res.json().catch(() => ({}));

			if (data.status === 'done' && data.glb_url) {
				const elapsed = (Date.now() - forgePollStart) / 1000;
				showForgeProgress(`Done in ${elapsed.toFixed(0)}s`, 100);
				const prompt = forgePromptEl.value.trim();
				await addForgedItem(data, prompt);
				setTimeout(() => { hideForgeProgress(); setForgeState(false); }, 1000);
				forgeJobId = null;
				loadCreationsGallery();
			} else if (data.status === 'failed') {
				throw new Error(data.error || 'Generation failed');
			} else {
				// Still processing
				const elapsed = Date.now() - forgePollStart;
				const pct = Math.min(10 + (elapsed / FORGE_TIMEOUT_MS) * 80, 90);
				const stages = ['Initializing…', 'Processing image…', 'Building mesh…', 'Generating textures…', 'Finalizing…'];
				const stage = stages[Math.min(Math.floor(pct / 20), stages.length - 1)];
				showForgeProgress(stage, pct);
				pollForge();
			}
		} catch (err) {
			setForgeState(false);
			hideForgeProgress();
			showError(`Error: ${err.message}`);
			forgeJobId = null;
		}
	}, 3000);
}

async function addForgedItem(data, prompt) {
	const url = data.glb_url;
	if (!url) return;
	showLoading('Adding to scene…');
	try {
		const { group } = await loadGLB(url, prompt.slice(0, 40));
		// Offset items slightly so they don't stack on top of each other
		const count = sceneObjects.size;
		group.position.x = (count % 4) * 0.6 - 0.9;
		group.position.z = Math.floor(count / 4) * 0.6;
		addObjectToScene(group, prompt.slice(0, 40), url, data.model_category || 'item');
	} catch (err) {
		showError(`Failed to load GLB: ${err.message}`);
	} finally {
		hideLoading();
	}
}

// ── Creations gallery (right panel) ──────────────────────────────────────────
async function loadCreationsGallery() {
	try {
		const res = await fetch('/api/forge-gallery?limit=20', { headers: CLIENT_HEADERS });
		const data = await res.json().catch(() => ({}));
		const creations = data.creations || [];
		if (!creations.length) {
			creationsListEl.innerHTML = '<div class="creations-empty">Forge your first item above</div>';
			return;
		}
		creationsListEl.innerHTML = '';
		for (const c of creations) {
			if (!c.glb_url) continue;
			const card = document.createElement('div');
			card.className = 'creation-card';
			card.title = c.prompt || 'Forged item';

			if (c.preview_image_url) {
				const img = document.createElement('img');
				img.src = c.preview_image_url;
				img.alt = c.prompt || '';
				img.loading = 'lazy';
				img.onerror = () => applyGradientToCard(card, c.prompt);
				card.appendChild(img);
			} else {
				const div = document.createElement('div');
				div.className = 'card-gradient';
				div.textContent = c.prompt || 'Forged item';
				div.style.background = promptGradient(c.prompt);
				card.appendChild(div);
			}

			const overlay = document.createElement('div');
			overlay.className = 'card-overlay';
			const promptEl = document.createElement('div');
			promptEl.className = 'card-prompt';
			promptEl.textContent = c.prompt || 'Forged item';
			const addEl = document.createElement('div');
			addEl.className = 'card-add';
			addEl.textContent = '+ Add to scene';
			overlay.appendChild(promptEl);
			overlay.appendChild(addEl);
			card.appendChild(overlay);

			card.addEventListener('click', async () => {
				showLoading('Loading…');
				try {
					const { group } = await loadGLB(c.glb_url, (c.prompt || 'item').slice(0, 40));
					const count = sceneObjects.size;
					group.position.x = (count % 4) * 0.6 - 0.9;
					group.position.z = Math.floor(count / 4) * 0.6;
					addObjectToScene(group, (c.prompt || 'item').slice(0, 40), c.glb_url, c.model_category || 'item');
				} catch (err) {
					showError(`Failed to load: ${err.message}`);
				} finally {
					hideLoading();
				}
			});

			creationsListEl.appendChild(card);
		}
	} catch {
		creationsListEl.innerHTML = '<div class="creations-empty">Could not load creations</div>';
	}
}

function promptGradient(str) {
	let h = 0;
	for (let i = 0; i < (str || '').length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
	const hue = Math.abs(h) % 360;
	return `linear-gradient(135deg, hsl(${hue},28%,14%) 0%, hsl(${(hue+40)%360},22%,10%) 100%)`;
}

function applyGradientToCard(card, prompt) {
	const existing = card.querySelector('img');
	if (existing) existing.remove();
	const div = document.createElement('div');
	div.className = 'card-gradient';
	div.textContent = prompt || 'Forged item';
	div.style.background = promptGradient(prompt);
	card.prepend(div);
}

loadCreationsGallery();

// ── File drop / GLB upload ────────────────────────────────────────────────────
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
	e.preventDefault();
	dropZone.classList.remove('drag-over');
	const file = e.dataTransfer?.files?.[0];
	if (file) loadFileGLB(file);
});
glbFileInput.addEventListener('change', () => {
	const file = glbFileInput.files?.[0];
	if (file) loadFileGLB(file);
});

function loadFileGLB(file) {
	const url = URL.createObjectURL(file);
	const name = file.name.replace(/\.(glb|gltf)$/i, '');
	showLoading(`Loading ${file.name}…`);
	loadGLB(url, name)
		.then(({ group }) => {
			addObjectToScene(group, name, url, 'item');
		})
		.catch((err) => showError(`Failed to load file: ${err.message}`))
		.finally(() => hideLoading());
}

// ── Export ────────────────────────────────────────────────────────────────────
btnExport.addEventListener('click', exportScene);

async function exportScene() {
	if (sceneObjects.size === 0) { showError('Nothing to export.'); return; }
	showLoading('Exporting…');
	try {
		const exporter = new GLTFExporter();
		const exportGroup = new THREE.Group();
		sceneObjects.forEach((obj) => {
			if (obj.visible && !obj.boneAttached) exportGroup.add(obj.group.clone());
		});
		const glb = await new Promise((resolve, reject) => {
			exporter.parse(exportGroup, resolve, reject, { binary: true });
		});
		const blob = new Blob([glb], { type: 'model/gltf-binary' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'scene-compose.glb';
		a.click();
		URL.revokeObjectURL(url);
		flashSaveStatus('Exported');
	} catch (err) {
		showError(`Export failed: ${err.message}`);
	} finally {
		hideLoading();
	}
}

// ── Save outfit ───────────────────────────────────────────────────────────────
btnSaveOutfit.addEventListener('click', saveOutfit);

async function saveOutfit() {
	if (avatarId === null) { showError('Load an avatar first.'); return; }
	const avatarObj = sceneObjects.get(avatarId);
	if (!avatarObj) return;

	// Collect attached items
	const attachedItems = [];
	sceneObjects.forEach((obj, id) => {
		if (id !== avatarId && obj.boneAttached) {
			attachedItems.push({ bone: obj.boneName, glbUrl: obj.glbUrl, name: obj.name });
		}
	});

	if (!attachedItems.length) {
		showError('Attach at least one item to a bone before saving.');
		return;
	}

	// Extract avatar ID from URL
	const urlMatch = avatarObj.glbUrl?.match(/\/avatars\/([^/?]+)/);
	const avatarApiId = urlMatch?.[1];
	if (!avatarApiId) {
		// No persistent ID — export the whole thing as a GLB instead
		showError('Avatar has no persistent ID — use Export GLB instead.');
		return;
	}

	showLoading('Saving outfit…');
	try {
		const res = await fetch(`/api/avatars/${encodeURIComponent(avatarApiId)}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', ...CLIENT_HEADERS },
			body: JSON.stringify({ accessories: attachedItems }),
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(err.error || `HTTP ${res.status}`);
		}
		flashSaveStatus('Outfit saved ✓');
	} catch (err) {
		showError(`Save failed: ${err.message}`);
	} finally {
		hideLoading();
	}
}

function flashSaveStatus(msg = 'Saved ✓') {
	saveStatusEl.textContent = msg;
	saveStatusEl.classList.add('visible');
	setTimeout(() => saveStatusEl.classList.remove('visible'), 3000);
}

// ── Initial state ─────────────────────────────────────────────────────────────
renderObjectList();
