// Atelier World — entry module.
//
// Boots the shared arena engine (OmniologyArena: scene, loop, local-player
// controller, camera, joystick), loads the local avatar, connects real-time
// presence over the shared Colyseus `walk_world` room namespaced to
// `arena:atelier`, and mounts the Atelier marketplace plaza on top. The engine
// owns movement/camera; this module owns avatars, networking, and the plaza —
// the same split the Omniology Arena uses.
//
// No multiplayer-server changes: we join `walk_world` with a synthetic coin
// token, so Colyseus isolates the Atelier World into its own room instances and
// presence/movement/labels come for free.

import { Group, Vector3 } from 'three';
import { OmniologyArena, REMOTE_LERP } from './arena.js';
import { CommunityNet } from '../community-net.js';
import { AnimationManager } from '../animation-manager.js';
import {
	loadManifest, resolveAvatarUrl, buildAvatar, playEmoteClip,
	CLIP_IDLE, CLIP_WALK,
} from '../avatar-rig.js';
import { getRequestedAvatar, getPlayCosmetics } from '../play-handoff.js';
import { applyLoadout } from '../cosmetics-loadout.js';
import { createAtelierPlaza } from './atelier-plaza.js';
import { fetchRoster } from './atelier-adapter.js';
import { log } from '../../shared/log.js';

const ROSTER_POLL_MS = 30_000;

// The synthetic room token. Colyseus filterBy(['coin','tier']) isolates this into
// its own world instances, separate from every real coin community and the
// Omniology Arena.
const ATELIER_COIN = { mint: 'arena:atelier', name: 'Atelier World', symbol: 'ATLR', image: '' };

// A networked peer rendered in the Atelier World: avatar rig + animation + DOM
// nameplate. Lean port of /play's RemotePlayer; label placement is driven by the
// PeerManager via arena.project().
class Peer {
	constructor(scene, player) {
		this.scene = scene;
		this.rig = new Group();
		this.anim = new AnimationManager();
		this.tx = player.x; this.ty = player.y; this.tz = player.z; this.tyaw = player.yaw;
		this.curYaw = player.yaw; this.motion = player.motion || 'idle';
		this.height = 1.7;
		this.rig.position.set(player.x, player.y, player.z);
		scene.add(this.rig);

		this.label = document.createElement('div');
		this.label.className = 'cc-label';
		this.label.textContent = player.name || 'guest';
		document.body.appendChild(this.label);
		this.bubble = null; this._bubbleTimer = null;
		this._cosWire = player.cosmetics || '';
		this.setAvatar(player.avatar);
	}
	setAvatar(url) {
		if (url === this._url) return;
		this._url = url;
		try { this.cos?.dispose(); } catch { /* best-effort */ }
		this.cos = null; this._cosApplied = null;
		this.rig.clear();
		this.anim = new AnimationManager();
		const token = (this._tok = (this._tok || 0) + 1);
		const anim = this.anim;
		resolveAvatarUrl(url).then((u) => buildAvatar(this.rig, u, anim).then(({ height }) => {
			if (this._dead || token !== this._tok) return;
			this.height = height;
			anim.crossfadeTo(this.motion === 'walk' || this.motion === 'run' ? CLIP_WALK : CLIP_IDLE, 0);
			this._dress();
		})).catch(() => { /* peer avatar failed; nameplate still shows */ });
	}
	_dress(wire) {
		const next = typeof wire === 'string' ? wire : (this._cosWire || '');
		this._cosWire = next;
		if (this._dead || !this.height || (this.cos && this._cosApplied === next)) return;
		this._cosApplied = next;
		try { this.cos?.dispose(); } catch { /* best-effort */ }
		this.cos = applyLoadout(this.rig, this.height, next);
	}
	apply(player) {
		this.tx = player.x; this.ty = player.y; this.tz = player.z; this.tyaw = player.yaw;
		if (player.name) this.label.textContent = player.name;
		if (player.avatar !== this._url) this.setAvatar(player.avatar);
		if (player.cosmetics !== undefined && player.cosmetics !== this._cosWire) this._dress(player.cosmetics);
		if (player.motion !== this.motion) {
			this.motion = player.motion;
			this.anim.crossfadeTo(this.motion === 'walk' || this.motion === 'run' ? CLIP_WALK : CLIP_IDLE, 0.18);
		}
		if (player.emote && player.emoteTs && player.emoteTs !== this._emoteTs) {
			this._emoteTs = player.emoteTs;
			playEmoteClip(this.anim, player.emote, this.motion);
		}
	}
	say(text) {
		this.bubble?.remove();
		this.bubble = document.createElement('div');
		this.bubble.className = 'cc-bubble';
		this.bubble.textContent = text;
		document.body.appendChild(this.bubble);
		clearTimeout(this._bubbleTimer);
		this._bubbleTimer = setTimeout(() => { this.bubble?.remove(); this.bubble = null; }, 5000);
	}
	tick(dt) {
		this.rig.position.x += (this.tx - this.rig.position.x) * REMOTE_LERP;
		this.rig.position.y += (this.ty - this.rig.position.y) * REMOTE_LERP;
		this.rig.position.z += (this.tz - this.rig.position.z) * REMOTE_LERP;
		let d = this.tyaw - this.curYaw;
		while (d > Math.PI) d -= Math.PI * 2;
		while (d < -Math.PI) d += Math.PI * 2;
		this.curYaw += d * 0.2;
		this.rig.rotation.y = this.curYaw;
		this.anim.update(dt);
		this.cos?.tick(dt);
	}
	dispose() {
		this._dead = true;
		try { this.cos?.dispose(); } catch { /* best-effort */ }
		this.scene.remove(this.rig);
		this.label.remove();
		this.bubble?.remove();
		clearTimeout(this._bubbleTimer);
	}
}

class AtelierWorld {
	constructor() {
		this.canvas = document.getElementById('kx-canvas');
		this.statusEl = document.getElementById('arena-status');
		this.peers = new Map();
		this._rosterTimer = 0;
		this._disposed = false;
	}

	async boot() {
		this.arena = new OmniologyArena(this.canvas);

		// Local avatar — resolved the same way /play does, with a default fallback.
		await loadManifest().catch((e) => log.warn('[atelier] manifest load failed', e?.message));
		await this._loadLocalAvatar();

		// Real-time presence.
		this._connect();

		// The marketplace plaza.
		this.plaza = createAtelierPlaza(this.arena, {
			onStatus: (s) => { if (s === 'error') this._setStatus('error', 'Marketplace offline'); },
		});
		this.arena.registerUpdatable(this.plaza);

		// Stream our movement to peers every frame (sendMove self-throttles to 15Hz).
		this.arena.registerUpdatable({ update: () => { if (this.net) this.net.sendMove(this.arena.getLocalState()); } });

		// Tick + label every peer each frame.
		this.arena.registerUpdatable({ update: (dt) => this._tickPeers(dt) });

		// Pull the agent roster now and on an interval.
		await this._refreshRoster();
		this._rosterTimer = setInterval(() => this._refreshRoster(), ROSTER_POLL_MS);

		this._hideLoader();
		window.addEventListener('pagehide', this._onUnload = () => this.dispose(), { once: true });
	}

	async _loadLocalAvatar() {
		const rig = new Group();
		const anim = new AnimationManager();
		try {
			const url = await resolveAvatarUrl(getRequestedAvatar());
			const { height } = await buildAvatar(rig, url, anim);
			anim.crossfadeTo(CLIP_IDLE, 0);
			this.arena.attachLocalAvatar(rig, anim, height);
			this.arena.seatAtSpawn();
			try { this._localCos = applyLoadout(rig, height, getPlayCosmetics()); } catch { /* none */ }
		} catch (e) {
			log.warn('[atelier] local avatar failed; using default', e?.message);
			const url = await resolveAvatarUrl('');
			const { height } = await buildAvatar(rig, url, anim);
			anim.crossfadeTo(CLIP_IDLE, 0);
			this.arena.attachLocalAvatar(rig, anim, height);
			this.arena.seatAtSpawn();
		}
	}

	_connect() {
		let name = 'guest';
		try { name = localStorage.getItem('cc-name') || 'guest'; } catch { /* storage off */ }
		this.net = new CommunityNet({
			name,
			avatar: getRequestedAvatar(),
			coin: ATELIER_COIN,
			tier: '',
			cosmetics: getPlayCosmetics(),
		});
		this.net.on('status', ({ status }) => this._onNetStatus(status));
		this.net.on('add', (player, id) => {
			if (id === this.net.sessionId) return;
			this.peers.set(id, new Peer(this.arena.scene, player));
		});
		this.net.on('change', (player, id) => {
			if (id === this.net.sessionId) return;
			this.peers.get(id)?.apply(player);
		});
		this.net.on('remove', (id) => { this.peers.get(id)?.dispose(); this.peers.delete(id); });
		this.net.on('chat', ({ id, text }) => this.peers.get(id)?.say(text));
		this.net.connect();
	}

	_tickPeers(dt) {
		const arena = this.arena;
		for (const [, p] of this.peers) {
			p.tick(dt);
			const head = new Vector3(p.rig.position.x, p.rig.position.y + p.height + 0.2, p.rig.position.z);
			const s = arena.project(head);
			if (s.visible) {
				p.label.style.display = '';
				p.label.style.transform = `translate(-50%, -100%) translate(${s.x}px, ${s.y}px)`;
			} else {
				p.label.style.display = 'none';
			}
			if (p.bubble) {
				const bh = arena.project(new Vector3(p.rig.position.x, p.rig.position.y + p.height + 0.7, p.rig.position.z));
				if (bh.visible) { p.bubble.style.display = ''; p.bubble.style.transform = `translate(-50%, -100%) translate(${bh.x}px, ${bh.y}px)`; }
				else p.bubble.style.display = 'none';
			}
		}
	}

	async _refreshRoster() {
		try {
			const roster = await fetchRoster();
			if (this._disposed) return;
			this.plaza.applyRoster(roster);
		} catch (e) {
			log.warn('[atelier] roster fetch failed', e?.message);
			if (!this._disposed) this.plaza.setStatus('error');
		}
	}

	// ── status pill ───────────────────────────────────────────────────────────────
	_onNetStatus(status) {
		const map = {
			online: ['online', `${this.peers.size + 1} in world`],
			connecting: ['connecting', 'Connecting'],
			offline: ['offline', 'Single-player'],
			unavailable: ['offline', 'Single-player'],
			failed: ['connecting', 'Reconnecting'],
			denied: ['offline', 'Single-player'],
		};
		const [state, label] = map[status] || ['connecting', 'Connecting'];
		this._setStatus(state, label);
	}
	_setStatus(state, label) {
		if (!this.statusEl) return;
		this.statusEl.dataset.state = state;
		const l = this.statusEl.querySelector('.label');
		if (l) l.textContent = label;
	}

	_hideLoader() {
		const l = document.getElementById('kx-loading');
		if (!l) return;
		l.classList.add('kx-hidden');
		try { window.__ccBootAvatar?.dispose?.(); } catch { /* best-effort */ }
		setTimeout(() => { if (l.classList.contains('kx-hidden')) l.style.display = 'none'; }, 600);
	}

	dispose() {
		if (this._disposed) return;
		this._disposed = true;
		clearInterval(this._rosterTimer);
		try { this.net?.destroy(); } catch { /* best-effort */ }
		for (const [, p] of this.peers) p.dispose();
		this.peers.clear();
		try { this.plaza?.dispose(); } catch { /* best-effort */ }
		try { this._localCos?.dispose?.(); } catch { /* best-effort */ }
		try { this.arena?.dispose(); } catch { /* best-effort */ }
	}
}

// ── boot ─────────────────────────────────────────────────────────────────────────
const world = new AtelierWorld();
world.boot().catch((err) => {
	log.error('[atelier] boot failed', err);
	const l = document.getElementById('kx-loading');
	if (l) {
		const sub = l.querySelector('.kx-loading-sub');
		const noWebGL = err?.code === 'NO_WEBGL' || /webgl|context/i.test(err?.message || '');
		if (sub) sub.textContent = noWebGL ? 'WebGL is unavailable in this browser.' : 'Could not load the Atelier World.';
		const mark = l.querySelector('.kx-loading-mark');
		if (mark) mark.textContent = noWebGL ? 'WebGL unavailable' : 'Load failed';
	}
});

// Expose for debugging / teardown parity with /play.
window.__atelierWorld = world;
