// World life — the W08 manager that makes a coin world feel inhabited.
//
// It owns one deterministic nav graph and hangs everything off it: the ambient
// crowd and traffic (ambient-life.js), the interactive NPCs from the catalog
// (npc.js + npc-catalog.js), the W07-gated mobs (mobs.js), and the bit of road
// geometry that makes the traffic legible. coincommunities.js builds one of these
// per world on enter, ticks it in the render loop, routes E / tap to it, and
// disposes it on leave — the same lifecycle the Agent Exchange already uses. The
// Agent Exchange stays its own special module; this manages everyone else.

import {
	Group, Mesh, RingGeometry, MeshBasicMaterial, MeshStandardMaterial,
	DoubleSide, Vector3, Raycaster, Vector2,
} from 'three';
import { NavGraph } from './nav-graph.js';
import { AmbientLife } from './ambient-life.js';
import { Npc } from './npc.js';
import { npcCatalogFor } from './npc-catalog.js';
import { MobSystem } from './mobs.js';
import { log } from '../../shared/log.js';

const ROLE_RING = { vendor: 0x46d49a, quest: 0xffce6e, flavor: 0xffffff };

export class WorldLife {
	// world: { mint, seed, biome }  — biome is the resolved env biome object.
	constructor({ scene, camera, renderer, getPlayer, ui, net, world, radius = 54 }) {
		this.scene = scene;
		this.camera = camera;
		this.renderer = renderer;
		this.getPlayer = getPlayer;
		this.ui = ui;
		this.net = net;
		this.world = world || {};

		this._injectStyles();

		this.nav = new NavGraph({ radius, seed: world?.seed >>> 0 });
		this._paintRoad();

		this.ambient = new AmbientLife({ scene, nav: this.nav, biome: world?.biome });
		this.mobs = new MobSystem({ scene, nav: this.nav });

		// Interactive NPCs from the data-driven catalog.
		this.npcs = npcCatalogFor(world).map((def) => {
			const npc = new Npc(scene, def);
			npc.marker = this._npcMarker(def);
			return npc;
		});

		// One shared "press E" prompt for whichever NPC you're nearest.
		this.prompt = document.createElement('div');
		this.prompt.className = 'npc-prompt';
		document.body.appendChild(this.prompt);
		this._promptNpc = null;

		this._ray = new Raycaster();
		this._ndc = new Vector2();
		this._ringT = 0;
	}

	// A subtle road band + inner kerb so the traffic reads as driving on something,
	// not gliding over grass. Dirt for the frontier town, dark asphalt elsewhere.
	_paintRoad() {
		const r = this.nav.roadRadius, w = this.nav.roadWidth;
		const frontier = this.world?.biome?.town === 'frontier';
		this.roadGroup = new Group();
		const road = new Mesh(
			new RingGeometry(r - w / 2, r + w / 2, 96),
			new MeshStandardMaterial({ color: frontier ? 0x6b5536 : 0x24272c, roughness: 1, metalness: 0 }),
		);
		road.rotation.x = -Math.PI / 2; road.position.y = 0.012; road.receiveShadow = true;
		this.roadGroup.add(road);
		// A pale kerb just inside, hinting a sidewalk for the foot traffic.
		const kerb = new Mesh(
			new RingGeometry(r - w / 2 - 0.5, r - w / 2 - 0.18, 96),
			new MeshBasicMaterial({ color: frontier ? 0x9a8458 : 0x3a3f47, transparent: true, opacity: 0.6, side: DoubleSide }),
		);
		kerb.rotation.x = -Math.PI / 2; kerb.position.y = 0.014;
		this.roadGroup.add(kerb);
		this.scene.add(this.roadGroup);
	}

	// A faint role-tinted ground ring under an interactive NPC so the spot reads as
	// a place (a market, a board) rather than a person standing in a field.
	_npcMarker(def) {
		const ring = new Mesh(
			new RingGeometry(1.0, 1.3, 40),
			new MeshBasicMaterial({ color: ROLE_RING[def.role] || ROLE_RING.flavor, transparent: true, opacity: 0.28, side: DoubleSide }),
		);
		ring.rotation.x = -Math.PI / 2;
		ring.position.set(def.pos.x, 0.02, def.pos.z);
		this.scene.add(ring);
		return ring;
	}

	_injectStyles() {
		if (document.getElementById('npc-styles')) return;
		const s = document.createElement('style');
		s.id = 'npc-styles';
		s.textContent = `
		.npc-name { color: var(--npc-tint, #fff); text-shadow: 0 1px 3px rgba(0,0,0,0.7); }
		.npc-bubble { /* inherits .cc-bubble; ambient chatter + NPC dialogue */ }
		.npc-prompt {
			position: fixed; left: 0; top: 0; z-index: 16; pointer-events: none;
			transform: translate(-50%, -100%); white-space: nowrap;
			background: var(--cc-panel-solid, #0c0c0e); border: 1px solid var(--cc-edge, rgba(255,255,255,0.12));
			color: var(--cc-text, #f5f5f6); font-size: 12px; font-weight: 700; letter-spacing: 0.04em;
			padding: 6px 11px; border-radius: var(--cc-radius, 4px); box-shadow: var(--cc-glow, 0 0 14px rgba(255,255,255,0.25));
			text-transform: uppercase; transition: opacity 0.18s ease; opacity: 0;
		}
		.npc-prompt.npc-show { opacity: 1; }
		.npc-prompt .npc-key {
			display: inline-block; min-width: 16px; text-align: center; margin-right: 5px;
			background: #fff; color: var(--cc-ink, #060607); border-radius: 3px; padding: 0 4px;
		}`;
		document.head.appendChild(s);
	}

	// Project a world point to a screen-space DOM transform (same math the rest of
	// the scene uses). Hidden when behind the camera.
	_place(node, x, y, z) {
		const w = this.renderer.domElement.clientWidth, h = this.renderer.domElement.clientHeight;
		const v = new Vector3(x, y, z).project(this.camera);
		if (v.z > 1 || v.z < -1) { node.style.display = 'none'; return; }
		node.style.display = '';
		node.style.transform = `translate(-50%, -100%) translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px)`;
	}

	// Nearest interactive NPC within its own interaction range, else null.
	_nearestNpc(p) {
		let best = null, bestD = Infinity;
		for (const npc of this.npcs) {
			const d = npc.distanceTo(p);
			if (d <= npc.range && d < bestD) { best = npc; bestD = d; }
		}
		return best;
	}

	// Tell the ambient crowd how many real players are present so it tapers.
	setRealPeers(n) { this.ambient?.setRealPeers(n); }

	tick(dt) {
		const player = this.getPlayer?.();
		const project = (node, x, y, z) => this._place(node, x, y, z);

		this.ambient?.update(dt, { player, project });
		this.mobs?.update(dt);

		for (const npc of this.npcs) {
			npc.tick(dt);
			this._place(npc.label, npc.pos.x, npc.height + 0.2, npc.pos.z);
			if (npc.bubble) this._place(npc.bubble, npc.pos.x, npc.height + 0.7, npc.pos.z);
		}

		// Breathe the NPC markers.
		this._ringT += dt;
		const pulse = 0.22 + 0.1 * (0.5 + 0.5 * Math.sin(this._ringT * 2));
		for (const npc of this.npcs) if (npc.marker) npc.marker.material.opacity = pulse;

		// Single proximity prompt for the nearest interactive NPC.
		const near = player ? this._nearestNpc(player) : null;
		if (near !== this._promptNpc) {
			this._promptNpc = near;
			if (near) this.prompt.innerHTML = `<span class="npc-key">E</span> ${near.def.prompt || 'Talk'}`;
		}
		if (near) {
			this.prompt.classList.add('npc-show');
			this._place(this.prompt, near.pos.x, near.height + 0.9, near.pos.z);
			near.faceTowards(player); // turn to greet whoever walks up
		} else {
			this.prompt.classList.remove('npc-show');
		}
	}

	// Player pressed E: talk to / open the nearest interactive NPC. Returns true if
	// one consumed the press, so the caller can stop here.
	interact() {
		const player = this.getPlayer?.();
		if (!player) return false;
		const npc = this._nearestNpc(player);
		if (!npc) return false;
		try { npc.interact({ player, ui: this.ui, net: this.net, world: this.world }); }
		catch (e) { log.warn('[world-life] npc interact failed:', e?.message); }
		return true;
	}

	// Tap/click an NPC (or its marker ring) while in range — the touch equivalent
	// of E. Returns true if it consumed the tap.
	tryActivateAt(clientX, clientY) {
		const player = this.getPlayer?.();
		if (!player) return false;
		const near = this._nearestNpc(player);
		if (!near) return false;
		const el = this.renderer.domElement;
		const rect = el.getBoundingClientRect();
		this._ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
		this._ray.setFromCamera(this._ndc, this.camera);
		const targets = this.npcs.flatMap((n) => (n.marker ? [n.rig, n.marker] : [n.rig]));
		if (this._ray.intersectObjects(targets, true).length > 0) { this.interact(); return true; }
		return false;
	}

	dispose() {
		this.ambient?.dispose();
		this.mobs?.dispose();
		for (const npc of this.npcs) { npc.dispose(); if (npc.marker) { this.scene.remove(npc.marker); npc.marker.geometry.dispose(); } }
		this.npcs = [];
		if (this.roadGroup) { this.scene.remove(this.roadGroup); this.roadGroup = null; }
		this.prompt?.remove();
	}
}
