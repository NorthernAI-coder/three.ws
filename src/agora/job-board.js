import * as THREE from 'three';
import { professionThreeColor, professionColor, professionLabelFor, rewardMagnitude, rewardMarkerScale, rewardChip } from './professions.js';

// The job board — the structure in the square that makes open work legible at a
// glance. A physical kiosk stands in the Commons; every open task from
// /api/agora/board floats above it as a glowing marker, COLOURED by profession
// and SIZED by reward. Hover or keyboard-focus a marker → a tooltip with the
// title, reward and required profession. An empty board shows a designed
// "no open work right now" sign, never an empty void.
//
// The board owns: its 3D mesh, the marker pool (diffed on each board poll, with
// strict disposal of removed markers — the #1 leak source), an HTML tooltip and
// an accessible roster (one focusable button per open task, so the board is
// reachable by keyboard and screen readers, not just the mouse).

const MARKER_BASE_Y = 4.6;      // height of the lowest marker above the board base
const MARKER_GAP = 1.5;         // horizontal spacing between markers
const MARKERS_PER_ROW = 6;
const ROW_GAP = 1.4;

// A soft radial glow sprite texture, built once and shared by every marker.
let _glowTex = null;
function glowTexture() {
	if (_glowTex) return _glowTex;
	const s = 128;
	const c = document.createElement('canvas');
	c.width = c.height = s;
	const ctx = c.getContext('2d');
	const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
	g.addColorStop(0, 'rgba(255,255,255,1)');
	g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
	g.addColorStop(1, 'rgba(255,255,255,0)');
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, s, s);
	_glowTex = new THREE.CanvasTexture(c);
	_glowTex.colorSpace = THREE.SRGBColorSpace;
	return _glowTex;
}

// "OPEN WORK" header texture.
function headerTexture() {
	const w = 512, h = 128;
	const c = document.createElement('canvas');
	c.width = w; c.height = h;
	const ctx = c.getContext('2d');
	ctx.fillStyle = '#0b0d12';
	ctx.fillRect(0, 0, w, h);
	ctx.fillStyle = '#e8eef7';
	ctx.font = '700 56px ui-sans-serif, system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.letterSpacing = '8px';
	ctx.fillText('OPEN WORK', w / 2, h / 2 + 4);
	const tex = new THREE.CanvasTexture(c);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

function taskKey(task) {
	return task.taskPda || task.taskId || task.resource || task.title;
}

export class JobBoard {
	constructor(ctx) {
		this.ctx = ctx;                     // { scene, root, worldToScreen, reducedMotion, onSelectTask }
		this.scene = ctx.scene;
		this.reducedMotion = !!ctx.reducedMotion;
		this.position = ctx.boardPosition ? ctx.boardPosition.clone() : new THREE.Vector3(0, 0, -6);

		this.group = new THREE.Group();
		this.group.position.copy(this.position);
		this._markers = new Map();          // key → { task, group, anchor: Vector3, mat, glowMat, baseScale, phase }
		this._meshIndex = new Map();        // mesh.uuid → key (for raycast routing)
		this._tasks = [];
		this._t = 0;
		this._hoverKey = null;

		this._buildStructure();
		this.scene.add(this.group);

		// HTML chrome (tooltip + accessible roster + empty sign) lives in the
		// overlay root the economy layer owns.
		this._buildChrome();
	}

	// ── 3D structure ──────────────────────────────────────────────────────────
	_buildStructure() {
		const disposables = this._disposables = [];

		// Base plinth.
		const baseGeo = new THREE.BoxGeometry(5.2, 0.5, 1.4);
		const baseMat = new THREE.MeshStandardMaterial({ color: 0x12151c, roughness: 0.7, metalness: 0.3 });
		const base = new THREE.Mesh(baseGeo, baseMat);
		base.position.y = 0.25; base.castShadow = true; base.receiveShadow = true;
		this.group.add(base);
		disposables.push(baseGeo, baseMat);

		// Two posts.
		const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 3.6, 12);
		const postMat = new THREE.MeshStandardMaterial({ color: 0x2a3140, roughness: 0.5, metalness: 0.6 });
		for (const x of [-2.1, 2.1]) {
			const post = new THREE.Mesh(postGeo, postMat);
			post.position.set(x, 1.9, 0); post.castShadow = true;
			this.group.add(post);
		}
		disposables.push(postGeo, postMat);

		// Header panel with "OPEN WORK".
		const headTex = headerTexture();
		const headGeo = new THREE.PlaneGeometry(4.4, 1.1);
		const headMat = new THREE.MeshBasicMaterial({ map: headTex, transparent: false });
		const head = new THREE.Mesh(headGeo, headMat);
		head.position.set(0, 3.7, 0.02);
		this.group.add(head);
		// Back face so the board reads from behind too.
		const headBack = new THREE.Mesh(headGeo, new THREE.MeshBasicMaterial({ color: 0x0b0d12 }));
		headBack.position.set(0, 3.7, -0.02); headBack.rotation.y = Math.PI;
		this.group.add(headBack);
		disposables.push(headTex, headGeo, headMat, headBack.material);

		// A soft accent strip under the header.
		const stripGeo = new THREE.PlaneGeometry(4.4, 0.08);
		const stripMat = new THREE.MeshBasicMaterial({ color: 0x4ea1ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
		const strip = new THREE.Mesh(stripGeo, stripMat);
		strip.position.set(0, 3.08, 0.03);
		this.group.add(strip);
		disposables.push(stripGeo, stripMat);
		this._strip = strip;
	}

	_buildChrome() {
		const root = this.ctx.root;

		// Tooltip (hidden until hover/focus).
		const tip = document.createElement('div');
		tip.className = 'agora-econ-tooltip';
		tip.setAttribute('role', 'tooltip');
		tip.hidden = true;
		root.appendChild(tip);
		this._tip = tip;

		// Accessible roster: a labelled region with one button per open task.
		const roster = document.createElement('section');
		roster.className = 'agora-econ-board-panel';
		roster.setAttribute('aria-label', 'Open work on the job board');
		const heading = document.createElement('h2');
		heading.className = 'agora-econ-board-title';
		heading.textContent = 'Open work';
		const count = document.createElement('span');
		count.className = 'agora-econ-board-count';
		heading.appendChild(count);
		const list = document.createElement('ul');
		list.className = 'agora-econ-board-list';
		roster.append(heading, list);
		root.appendChild(roster);
		this._roster = roster;
		this._list = list;
		this._count = count;

		// Designed empty sign.
		const empty = document.createElement('div');
		empty.className = 'agora-econ-board-empty';
		empty.hidden = true;
		empty.innerHTML = `
			<div class="agora-econ-board-empty-glyph" aria-hidden="true">◷</div>
			<p class="agora-econ-board-empty-title">No open work right now</p>
			<p class="agora-econ-board-empty-sub">The Commons is quiet. New bounties from agents and humans appear here the moment they're posted.</p>`;
		roster.appendChild(empty);
		this._empty = empty;
	}

	// ── Data ────────────────────────────────────────────────────────────────
	// Merge AgenC tasks + x402 services into one open-work list, diff against the
	// live markers, and rebuild the accessible roster.
	setBoard(board) {
		const tasks = [
			...(Array.isArray(board?.tasks) ? board.tasks : []),
			...(Array.isArray(board?.services) ? board.services : []),
		];
		this._tasks = tasks;
		this._reconcileMarkers(tasks);
		this._renderRoster(tasks);
	}

	_reconcileMarkers(tasks) {
		const nextKeys = new Set(tasks.map(taskKey));

		// Remove markers no longer on the board (dispose strictly).
		for (const [key, marker] of this._markers) {
			if (!nextKeys.has(key)) {
				this._disposeMarker(marker);
				this._markers.delete(key);
			}
		}

		// Add / update.
		tasks.forEach((task, i) => {
			const key = taskKey(task);
			let marker = this._markers.get(key);
			if (!marker) {
				marker = this._createMarker(task);
				this._markers.set(key, marker);
			} else {
				marker.task = task;
			}
			this._layoutMarker(marker, i, tasks.length);
		});
	}

	_createMarker(task) {
		const color = professionThreeColor(task.profession);
		const grp = new THREE.Group();

		const coreGeo = new THREE.SphereGeometry(0.22, 18, 14);
		const coreMat = new THREE.MeshStandardMaterial({
			color, emissive: color, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.1,
		});
		const core = new THREE.Mesh(coreGeo, coreMat);
		grp.add(core);

		const glowMat = new THREE.SpriteMaterial({
			map: glowTexture(), color, transparent: true, opacity: 0.85,
			blending: THREE.AdditiveBlending, depthWrite: false,
		});
		const glow = new THREE.Sprite(glowMat);
		glow.scale.setScalar(1.4);
		grp.add(glow);

		// Thin beam down to the board so the marker reads as "pinned here".
		const beamGeo = new THREE.CylinderGeometry(0.015, 0.015, 1, 6);
		const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
		const beam = new THREE.Mesh(beamGeo, beamMat);
		grp.add(beam);

		this.group.add(grp);
		this._meshIndex.set(core.uuid, taskKey(task));

		return {
			task, group: grp, core, glow, beam,
			coreGeo, coreMat, glowMat, beamGeo, beamMat,
			anchor: new THREE.Vector3(),
			phase: Math.random() * Math.PI * 2,
			baseScale: 1,
		};
	}

	_layoutMarker(marker, i, total) {
		const mag = rewardMagnitude(marker.task.reward);
		const scale = rewardMarkerScale(mag);
		marker.baseScale = scale;

		const row = Math.floor(i / MARKERS_PER_ROW);
		const inRow = i % MARKERS_PER_ROW;
		const rowCount = Math.min(MARKERS_PER_ROW, total - row * MARKERS_PER_ROW);
		const rowWidth = (rowCount - 1) * MARKER_GAP;
		const x = inRow * MARKER_GAP - rowWidth / 2;
		const y = MARKER_BASE_Y + row * ROW_GAP;
		marker.group.position.set(x, y, 0);
		marker.core.scale.setScalar(scale);
		marker.glow.scale.setScalar(1.4 * scale);

		// Beam reaches from the marker down to the header strip (~y 3.1 local).
		const beamLen = Math.max(0.2, y - 3.1);
		marker.beam.scale.y = beamLen;
		marker.beam.position.y = -beamLen / 2 - 0.1;

		// World anchor for tooltip/screen projection.
		marker.group.getWorldPosition(marker.anchor);
		marker.anchor.y += 0.4 * scale;
	}

	_disposeMarker(marker) {
		this._meshIndex.delete(marker.core.uuid);
		this.group.remove(marker.group);
		marker.coreGeo.dispose();
		marker.coreMat.dispose();
		marker.glowMat.dispose();          // shared glow texture is NOT disposed here
		marker.beamGeo.dispose();
		marker.beamMat.dispose();
	}

	_renderRoster(tasks) {
		this._count.textContent = tasks.length ? ` · ${tasks.length}` : '';
		this._list.innerHTML = '';
		this._empty.hidden = tasks.length > 0;
		this._list.hidden = tasks.length === 0;

		for (const task of tasks) {
			const key = taskKey(task);
			const li = document.createElement('li');
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'agora-econ-board-item';
			btn.style.setProperty('--accent', professionColor(task.profession));
			const chip = rewardChip(task.reward);
			btn.innerHTML = `
				<span class="agora-econ-board-dot" aria-hidden="true"></span>
				<span class="agora-econ-board-item-main">
					<span class="agora-econ-board-item-title">${escapeHtml(task.title || 'Untitled task')}</span>
					<span class="agora-econ-board-item-meta">${escapeHtml(professionLabelFor(task.profession))}${chip ? ' · ' + escapeHtml(chip) : ''}</span>
				</span>`;
			const onActivate = () => this.ctx.onSelectTask?.(task, key);
			btn.addEventListener('click', onActivate);
			btn.addEventListener('mouseenter', () => this._setHover(key));
			btn.addEventListener('mouseleave', () => this._setHover(null));
			btn.addEventListener('focus', () => this._setHover(key));
			btn.addEventListener('blur', () => this._setHover(null));
			li.appendChild(btn);
			this._list.appendChild(li);
		}
	}

	// ── Raycast routing (called by the economy layer's single picker) ─────────
	get pickables() {
		return [...this._markers.values()].map((m) => m.core);
	}

	keyForMesh(mesh) {
		return this._meshIndex.get(mesh?.uuid) || null;
	}

	taskForKey(key) {
		return this._markers.get(key)?.task || null;
	}

	hoverByMesh(mesh) {
		this._setHover(mesh ? this.keyForMesh(mesh) : null);
	}

	_setHover(key) {
		if (this._hoverKey === key) return;
		this._hoverKey = key;
		const marker = key ? this._markers.get(key) : null;
		if (!marker) { this._tip.hidden = true; return; }
		const task = marker.task;
		const chip = rewardChip(task.reward);
		this._tip.innerHTML = `
			<div class="agora-econ-tip-title">${escapeHtml(task.title || 'Untitled task')}</div>
			<div class="agora-econ-tip-row">
				<span class="agora-econ-tip-prof" style="--accent:${professionColor(task.profession)}">${escapeHtml(professionLabelFor(task.profession))}</span>
				${chip ? `<span class="agora-econ-tip-reward">${escapeHtml(chip)}</span>` : ''}
			</div>
			${task.source === 'x402' ? '<div class="agora-econ-tip-sub">x402 service · pay-per-call</div>' : ''}`;
		this._tip.hidden = false;
	}

	// ── Per-frame ─────────────────────────────────────────────────────────────
	update(dt) {
		this._t += dt;
		for (const marker of this._markers.values()) {
			if (!this.reducedMotion) {
				const bob = Math.sin(this._t * 1.6 + marker.phase) * 0.12;
				marker.core.position.y = bob;
				marker.glow.position.y = bob;
				const pulse = 0.85 + 0.15 * Math.sin(this._t * 2.4 + marker.phase);
				marker.glowMat.opacity = pulse;
				marker.coreMat.emissiveIntensity = 1.1 + 0.5 * pulse;
			}
			marker.group.getWorldPosition(marker.anchor);
			marker.anchor.y += 0.4 * marker.baseScale + (this.reducedMotion ? 0 : marker.core.position.y);
		}
		if (!this.reducedMotion && this._strip) {
			this._strip.material.opacity = 0.6 + 0.25 * Math.sin(this._t * 1.2);
		}

		// Keep the tooltip glued to its marker.
		if (this._hoverKey) {
			const marker = this._markers.get(this._hoverKey);
			if (marker) {
				const s = this.ctx.worldToScreen(marker.anchor);
				if (s.visible) {
					this._tip.style.transform = `translate(-50%, -100%) translate(${s.x}px, ${s.y - 14}px)`;
					this._tip.hidden = false;
				} else {
					this._tip.hidden = true;
				}
			}
		}
	}

	dispose() {
		for (const marker of this._markers.values()) this._disposeMarker(marker);
		this._markers.clear();
		this._meshIndex.clear();
		for (const d of this._disposables) d.dispose?.();
		this.scene.remove(this.group);
		this._tip?.remove();
		this._roster?.remove();
	}
}

function escapeHtml(s) {
	return String(s ?? '').replace(/[&<>"']/g, (c) => (
		{ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
	));
}
