// Omniology Arena — entry module.
//
// Boots the OmniologyArena world, loads the local player's avatar through the
// shared avatar-rig library (the same path /play uses), connects multiplayer
// presence via CommunityNet to a namespaced `walk_world` instance, and renders
// every remote player with a nameplate and smooth interpolation. No multiplayer
// server changes: we join the existing `walk_world` room with a synthetic coin
// token (`arena:omniology`, tier '') so Colyseus isolates the arena into its own
// room instances, separate from every real coin world.
//
// Prompts 02–04 mount the venue GLB (via arena.setAnchors), the live contest
// screens, and the entry desk on top — they register with the arena, they don't
// edit this file.

import { Group } from 'three';
import { OmniologyArena, REMOTE_LERP, RUN_TIMESCALE } from './arena.js';
import { AnimationManager } from '../../animation-manager.js';
import { CommunityNet } from '../community-net.js';
import { mountContestScreens } from './contest-screens.js';
import {
	resolveAvatarUrl, buildAvatar, loadManifest, CLIP_IDLE, CLIP_WALK,
} from '../avatar-rig.js';
import {
	getRequestedAvatar, getPlayCosmetics, setPlayName, GUEST_SENTINEL, uploadPendingGuestAvatar, CC_NAME_KEY,
} from '../play-handoff.js';
import { log } from '../../shared/log.js';

// The synthetic identity that namespaces the arena into its own walk_world
// instances. NOT a coin — a stable room key. $THREE is the only coin the platform
// references; this is plumbing (a room token), it names nothing tradeable.
const ARENA_COIN = { mint: 'arena:omniology', name: 'Omniology Arena', symbol: 'OMNI', image: '' };

// A networked peer: avatar rig + animation + nameplate, interpolated toward the
// server's authoritative transform. A focused sibling of coincommunities.js's
// RemotePlayer — it reuses the same avatar-rig library and the same REMOTE_LERP
// interpolation, minus the /play-only cosmetics + mini-game coupling the arena
// skeleton doesn't need. Registered as an arena updatable so it ticks each frame.
class RemotePlayer {
	constructor(arena, player) {
		this.arena = arena;
		this.scene = arena.scene;
		this.rig = new Group();
		this.anim = new AnimationManager();
		this.targetX = player.x; this.targetY = player.y; this.targetZ = player.z;
		this.targetYaw = player.yaw; this.curYaw = player.yaw;
		this.motion = player.motion || 'idle';
		this.height = 1.7;
		this._avatarUrl = null;
		this._avatarToken = 0;
		this._disposed = false;
		this.rig.position.set(player.x, player.y, player.z);
		this.scene.add(this.rig);

		// Nameplate — reuses the shared .cc-label treatment from coincommunities.css.
		this.label = document.createElement('div');
		this.label.className = 'cc-label';
		this.label.textContent = player.name || 'guest';
		document.body.appendChild(this.label);

		this.setAvatar(player.avatar);
	}

	setAvatar(url) {
		if (url === this._avatarUrl) return;
		this._avatarUrl = url;
		this.rig.clear();
		this.anim = new AnimationManager();
		// Tag this load so a slower in-flight GLB can't attach after a newer swap.
		const token = (this._avatarToken += 1);
		const anim = this.anim;
		resolveAvatarUrl(url).then((u) => buildAvatar(this.rig, u, anim).then(({ height }) => {
			if (this._disposed || token !== this._avatarToken) return;
			this.height = height;
			anim.crossfadeTo(this.motion === 'walk' || this.motion === 'run' ? CLIP_WALK : CLIP_IDLE, 0);
		})).catch(() => {});
	}

	apply(player) {
		this.targetX = player.x; this.targetY = player.y; this.targetZ = player.z;
		this.targetYaw = player.yaw;
		if (player.name) this.label.textContent = player.name;
		if (player.avatar !== this._avatarUrl) this.setAvatar(player.avatar);
		if (player.motion !== this.motion) {
			this.motion = player.motion;
			this.anim.crossfadeTo(this.motion === 'walk' || this.motion === 'run' ? CLIP_WALK : CLIP_IDLE, 0.18);
		}
	}

	// Ticked by the arena loop: interpolate transform, advance animation, and
	// re-anchor the nameplate above the head in screen space.
	update(dt) {
		this.rig.position.x += (this.targetX - this.rig.position.x) * REMOTE_LERP;
		this.rig.position.y += (this.targetY - this.rig.position.y) * REMOTE_LERP;
		this.rig.position.z += (this.targetZ - this.rig.position.z) * REMOTE_LERP;
		let d = this.targetYaw - this.curYaw;
		while (d > Math.PI) d -= Math.PI * 2;
		while (d < -Math.PI) d += Math.PI * 2;
		this.curYaw += d * 0.2;
		this.rig.rotation.y = this.curYaw;
		if (this.anim.currentName === CLIP_WALK) this.anim.setSpeed(this.motion === 'run' ? RUN_TIMESCALE : 1);
		this.anim.update(dt);
		this._placeLabel();
	}

	_placeLabel() {
		const p = this.arena.project({ x: this.rig.position.x, y: this.rig.position.y + this.height + 0.2, z: this.rig.position.z });
		if (!p.visible) { this.label.style.display = 'none'; return; }
		this.label.style.display = '';
		this.label.style.transform = `translate(-50%, -100%) translate(${p.x}px, ${p.y}px)`;
	}

	dispose() {
		this._disposed = true;
		this.scene.remove(this.rig);
		this.rig.traverse((n) => {
			n.geometry?.dispose?.();
			const m = n.material;
			if (Array.isArray(m)) m.forEach((x) => x?.dispose?.()); else m?.dispose?.();
		});
		this.label.remove();
	}
}

// ----------------------------------------------------------------- status pill
function setStatus(state, label) {
	const pill = document.getElementById('arena-status');
	if (!pill) return;
	pill.dataset.state = state;
	const text = pill.querySelector('.label');
	if (text) text.textContent = label;
}

// Map CommunityNet status → a human pill state. Mirrors the honest states from
// /play: connecting, online, reconnecting, single-player.
function applyNetStatus(net, status) {
	switch (status) {
		case 'connecting': setStatus('connecting', 'Connecting'); break;
		case 'online': setStatus('online', 'Live'); break;
		case 'failed': setStatus('connecting', 'Reconnecting'); break;
		case 'offline': setStatus('offline', 'Offline'); break;
		case 'unavailable': setStatus('offline', 'Single-player'); break;
		default: setStatus('connecting', 'Connecting');
	}
	// Let the player force a retry when we've given up.
	const pill = document.getElementById('arena-status');
	if (!pill) return;
	if (status === 'offline') {
		pill.dataset.retry = '1';
		pill.title = 'Reconnect';
		pill.onclick = () => net.retry();
	} else {
		pill.dataset.retry = '0';
		pill.title = '';
		pill.onclick = null;
	}
}

// ----------------------------------------------------------------- boot
async function hideLoader() {
	const l = document.getElementById('kx-loading');
	if (!l) return;
	const boot = window.__ccBootAvatar;
	try { await boot?.ready; } catch { /* proceed regardless */ }
	l.classList.add('kx-hidden');
	setTimeout(() => { try { boot?.dispose?.(); } catch {} l.remove(); }, 600);
}

async function start(canvas) {
	const arena = new OmniologyArena(canvas);

	// Kick the animation manifest fetch early (idempotent + cached); buildAvatar
	// awaits it internally, so this just warms the cache.
	loadManifest();

	// Local avatar — resolved exactly like /play (?avatar= deep link → saved
	// cc-avatar → default). A staged-but-not-yet-uploaded guest avatar can't be
	// loaded by peers, so we join without one and broadcast the public URL once the
	// background upload finishes.
	const avatarInput = getRequestedAvatar();
	const localRig = new Group();
	const localAnim = new AnimationManager();
	const url = await resolveAvatarUrl(avatarInput);
	const { height, fallback } = await buildAvatar(localRig, url, localAnim);
	arena.attachLocalAvatar(localRig, localAnim, height);
	arena.seatAtSpawn();
	if (fallback && avatarInput !== GUEST_SENTINEL) {
		log.warn('[omniology] avatar failed to load — using stand-in:', url);
	}

	// Display name — reuse /play's persisted name (cc-name); mint a stable guest
	// name if blank, and persist it so it sticks across worlds.
	let name = '';
	try { name = (localStorage.getItem(CC_NAME_KEY) || '').trim(); } catch { /* storage disabled */ }
	if (!name) {
		name = 'guest-' + Math.random().toString(36).slice(2, 6);
		setPlayName(name);
	}

	const isGuest = avatarInput === GUEST_SENTINEL;
	const netAvatar = isGuest
		? ''
		: (/^https?:\/\//i.test(avatarInput) || avatarInput.startsWith('/') ? avatarInput : url);

	// Connect presence. tier '' + an unset platform gate = open join (verified in
	// WalkRoom.onAuth). The synthetic coin token isolates the arena room instances.
	const net = new CommunityNet({
		name,
		avatar: netAvatar,
		coin: ARENA_COIN,
		tier: '',
		cosmetics: getPlayCosmetics(),
	});

	const remotes = new Map();          // sessionId → RemotePlayer
	const unregister = new Map();       // sessionId → arena unregister fn

	const addRemote = (player, id) => {
		if (id === net.sessionId) return;       // that's us
		if (remotes.has(id)) { remotes.get(id).apply(player); return; }
		const r = new RemotePlayer(arena, player);
		remotes.set(id, r);
		unregister.set(id, arena.registerUpdatable(r));
	};
	const removeRemote = (id) => {
		const r = remotes.get(id);
		if (!r) return;
		unregister.get(id)?.();
		unregister.delete(id);
		r.dispose();
		remotes.delete(id);
	};

	net.on('status', ({ status }) => applyNetStatus(net, status));
	net.on('add', (p, id) => addRemote(p, id));
	net.on('change', (p, id) => { if (id !== net.sessionId) remotes.get(id)?.apply(p); });
	net.on('remove', (id) => removeRemote(id));

	// Stream our authoritative transform at the net's own 15Hz cadence. Registered
	// as an arena updatable so it ticks inside the single render loop.
	const mover = { update() { net.sendMove(arena.getLocalState()); } };
	arena.registerUpdatable(mover);

	if (isGuest) uploadPendingGuestAvatar((publicUrl) => net.setAvatar(publicUrl));

	net.connect();

	await hideLoader();

	// Teardown: drop the socket, every remote, the local avatar, and the world so
	// navigating away leaks no rAF, listeners, or GPU memory.
	let torn = false;
	const teardown = () => {
		if (torn) return;
		torn = true;
		try { net.destroy(); } catch {}
		for (const id of [...remotes.keys()]) removeRemote(id);
		try {
			localRig.traverse((n) => {
				n.geometry?.dispose?.();
				const m = n.material;
				if (Array.isArray(m)) m.forEach((x) => x?.dispose?.()); else m?.dispose?.();
			});
		} catch {}
		try { arena.dispose(); } catch {}
	};
	window.addEventListener('pagehide', teardown);
	window.addEventListener('beforeunload', teardown);

	// Expose for debugging + future HUD prompts (mirrors window.__CC__).
	if (typeof window !== 'undefined') window.__ARENA__ = { arena, net, remotes, teardown };
}

// Swap the boot loader for an actionable error state when the world can't start
// (most often WebGL unavailable), instead of a loader that never resolves.
function renderBootError(err) {
	log.error('[omniology] boot failed:', err);
	const noWebGL = err?.code === 'NO_WEBGL' || /webgl|context/i.test(err?.message || '');
	let overlay = document.getElementById('kx-loading');
	if (!overlay) { overlay = document.createElement('div'); overlay.id = 'kx-loading'; document.body.appendChild(overlay); }
	overlay.classList.remove('kx-hidden');
	overlay.replaceChildren();
	try { window.__ccBootAvatar?.dispose?.(); } catch {}

	const card = document.createElement('div');
	card.className = 'kx-loading-card kx-boot-error';
	card.setAttribute('role', 'alert');
	const mark = document.createElement('div');
	mark.className = 'kx-loading-mark';
	mark.textContent = noWebGL ? 'WebGL unavailable' : 'Couldn’t load the arena';
	card.appendChild(mark);
	const msg = document.createElement('p');
	msg.className = 'kx-boot-error-msg';
	msg.textContent = noWebGL
		? 'Your browser couldn’t start 3D graphics. Turn on hardware acceleration (or WebGL) and reload — on most browsers it’s under Settings › System.'
		: 'Something went wrong starting the Omniology Arena. Reload to try again — if it keeps happening, your browser may be out of date.';
	card.appendChild(msg);
	const actions = document.createElement('div');
	actions.className = 'kx-boot-error-actions';
	const retry = document.createElement('button');
	retry.type = 'button';
	retry.className = 'kx-boot-error-btn';
	retry.textContent = 'Try again';
	retry.addEventListener('click', () => location.reload());
	actions.appendChild(retry);
	const home = document.createElement('a');
	home.className = 'kx-boot-error-link';
	home.href = '/';
	home.textContent = 'Back to three.ws';
	actions.appendChild(home);
	card.appendChild(actions);
	overlay.appendChild(card);
	retry.focus();
}

const canvas = document.getElementById('kx-canvas');
if (canvas) {
	start(canvas).catch(renderBootError);
}
