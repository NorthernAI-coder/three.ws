// "Place agents around me" — the /irl room authoring UI (Epic R / R1).
//
// Self-contained on purpose: it builds its OWN DOM (entry button, aim HUD, room
// badge) and injects its OWN styles, so it needs only a single additive hook in
// src/irl.js (initRoomMode) and never edits the shared markup. It rides the pure,
// unit-tested src/irl/room-session.js for all geometry/session logic and calls
// back into irl.js through injected deps for pose, permissions, and the actual
// placement (which owns the network + 3D scene).
//
// The interaction: enter the mode, physically aim the phone at a real spot, set a
// distance, tap Place — the agent drops at that compass bearing + distance,
// anchored into one shared room, and renders world-locked immediately (it stays
// put as you turn). Drop several around you; the left wall stays empty unless you
// aim there. Everything is delivered to other viewers by the existing REST
// proximity read (rooms do not ride realtime).

import {
	establishRoom,
	roomPlacement,
	clampDistance,
	serializeRoom,
	reviveRoom,
	DIST_DEFAULT_M,
} from './room-session.js';

const STORE_KEY = 'irl_room_v1';
const COMPASS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function compassLabel(deg) {
	return COMPASS_8[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

// Coarse, stable place token for the room id (≈110 m grid) — keeps placements at
// one spot in one session sharing a room without pulling in a geohash dep.
function locationKey(lat, lng) {
	return `${Math.round(lat * 1000)}x${Math.round(lng * 1000)}`.replace('-', 'n');
}

let _stylesInjected = false;
function injectStyles() {
	if (_stylesInjected) return;
	_stylesInjected = true;
	const css = `
.irl-room-fab.is-active{background:rgba(124,92,255,.22);border-color:rgba(124,92,255,.7);color:#fff}
#irl-aim-hud{position:fixed;inset:0;z-index:6;pointer-events:none;display:none;
  font:inherit;color:#fff}
#irl-aim-hud.is-open{display:block}
.irl-aim-reticle{position:absolute;top:46%;left:50%;width:74px;height:74px;
  margin:-37px 0 0 -37px;border-radius:50%;border:2px solid rgba(255,255,255,.9);
  box-shadow:0 0 0 2px rgba(0,0,0,.35),0 0 18px rgba(124,92,255,.55);
  animation:irlAimPulse 1.8s ease-in-out infinite}
.irl-aim-reticle::before,.irl-aim-reticle::after{content:'';position:absolute;
  background:rgba(255,255,255,.9);box-shadow:0 0 4px rgba(0,0,0,.5)}
.irl-aim-reticle::before{top:50%;left:18px;right:18px;height:2px;margin-top:-1px}
.irl-aim-reticle::after{left:50%;top:18px;bottom:18px;width:2px;margin-left:-1px}
@keyframes irlAimPulse{0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.08);opacity:1}}
.irl-aim-readout{position:absolute;top:calc(46% + 50px);left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.18);border-radius:999px;
  padding:5px 12px;font-size:13px;font-weight:600;letter-spacing:.2px;white-space:nowrap;
  backdrop-filter:blur(6px)}
.irl-aim-panel{position:absolute;left:0;right:0;bottom:0;pointer-events:auto;
  padding:14px 16px calc(16px + env(safe-area-inset-bottom));
  background:linear-gradient(to top,rgba(8,8,16,.92),rgba(8,8,16,.55) 70%,transparent);
  display:flex;flex-direction:column;gap:12px}
.irl-aim-coach{font-size:13px;line-height:1.4;color:rgba(255,255,255,.82);text-align:center;margin:0}
.irl-aim-coach[data-tone="warn"]{color:#fcd34d}
.irl-aim-dist{display:flex;align-items:center;gap:12px}
.irl-aim-dist label{font-size:12px;opacity:.7;min-width:58px}
.irl-aim-dist input[type=range]{flex:1;accent-color:#7c5cff;height:28px}
.irl-aim-dist output{min-width:54px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.irl-aim-actions{display:flex;gap:10px;align-items:stretch}
.irl-aim-place{flex:1;min-height:52px;border:none;border-radius:14px;font-size:16px;font-weight:700;
  color:#fff;background:linear-gradient(135deg,#7c5cff,#9d7bff);cursor:pointer;
  box-shadow:0 6px 20px rgba(124,92,255,.4);transition:transform .12s ease,filter .12s ease}
.irl-aim-place:hover{filter:brightness(1.08)}
.irl-aim-place:active{transform:scale(.97)}
.irl-aim-place:disabled{opacity:.5;cursor:not-allowed;box-shadow:none}
.irl-aim-place.is-flash{animation:irlPlaceFlash .4s ease}
@keyframes irlPlaceFlash{0%{transform:scale(1)}40%{transform:scale(.92)}100%{transform:scale(1)}}
.irl-aim-face,.irl-aim-done{min-height:52px;padding:0 14px;border-radius:14px;font-size:14px;font-weight:600;
  background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;cursor:pointer}
.irl-aim-face[aria-pressed="true"]{background:rgba(124,92,255,.28);border-color:rgba(124,92,255,.6)}
.irl-aim-face:focus-visible,.irl-aim-done:focus-visible,.irl-aim-place:focus-visible{
  outline:2px solid #9d7bff;outline-offset:2px}
.irl-room-badge{position:fixed;left:50%;top:72px;transform:translateX(-50%);z-index:7;
  display:none;align-items:center;gap:7px;pointer-events:auto;
  background:rgba(8,8,16,.7);border:1px solid rgba(124,92,255,.45);border-radius:999px;
  padding:6px 13px;font-size:13px;font-weight:600;backdrop-filter:blur(8px);color:#fff}
.irl-room-badge.is-shown{display:flex}
.irl-room-badge .dot{width:7px;height:7px;border-radius:50%;background:#7c5cff;box-shadow:0 0 7px #7c5cff}
@media (prefers-reduced-motion:reduce){
  .irl-aim-reticle{animation:none}.irl-aim-place.is-flash{animation:none}}
`;
	const style = document.createElement('style');
	style.setAttribute('data-irl-room-mode', '');
	style.textContent = css;
	document.head.appendChild(style);
}

/**
 * Wire the room authoring mode. All DOM is created here; irl.js supplies pose,
 * permission/AR readiness, and the placement (network + scene) via deps.
 *
 * @param {object} deps
 * @param {Element|null} deps.controlRow  where to mount the entry button (falls back to body)
 * @param {() => {lat:number,lng:number,ready:boolean,accuracy:number}} deps.getFix
 * @param {() => {deg:number, absolute:boolean}} deps.getHeading  live compass bearing
 * @param {() => Promise<boolean>} deps.ensureReady  turn on camera AR + perms; resolve true when usable
 * @param {(body:object) => Promise<{ok:boolean,id?:string,message?:string}>} deps.placeRoomAgent
 * @param {(msg:string, opts?:object) => void} [deps.status]
 * @returns {{ isActive:()=>boolean, exit:()=>void }}
 */
export function initRoomMode(deps) {
	const { getFix, getHeading, ensureReady, placeRoomAgent } = deps;
	const status = deps.status || (() => {});
	if (typeof getFix !== 'function' || typeof placeRoomAgent !== 'function') {
		throw new Error('initRoomMode: getFix + placeRoomAgent are required');
	}
	injectStyles();

	let active = false;
	let distM = DIST_DEFAULT_M;
	let faceViewer = true;
	let activeRoom = reviveRoomFromStore();
	let tickTimer = null;
	let busy = false;

	// ── Entry button ─────────────────────────────────────────────────────────
	const fab = document.createElement('button');
	fab.type = 'button';
	fab.className = 'irl-pill-btn irl-room-fab';
	fab.setAttribute('aria-pressed', 'false');
	fab.setAttribute('aria-label', 'Place AI agents around your room');
	fab.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2.4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="8.5" opacity=".5"/></svg> Place agents`;
	(deps.controlRow || document.body).appendChild(fab);
	fab.addEventListener('click', () => (active ? exit() : enter()));

	// ── Room badge ───────────────────────────────────────────────────────────
	const badge = document.createElement('div');
	badge.className = 'irl-room-badge';
	badge.setAttribute('role', 'status');
	badge.setAttribute('aria-live', 'polite');
	document.body.appendChild(badge);

	// ── Aim HUD ──────────────────────────────────────────────────────────────
	const hud = document.createElement('div');
	hud.id = 'irl-aim-hud';
	hud.innerHTML = `
		<div class="irl-aim-reticle" aria-hidden="true"></div>
		<div class="irl-aim-readout" id="irl-aim-readout" aria-hidden="true">2.5 m</div>
		<div class="irl-aim-panel" role="group" aria-label="Place an agent">
			<p class="irl-aim-coach" id="irl-aim-coach">Aim at a spot and tap Place to drop your first agent.</p>
			<div class="irl-aim-dist">
				<label for="irl-aim-range">Distance</label>
				<input type="range" id="irl-aim-range" min="0.5" max="8" step="0.5" value="2.5"
				       aria-label="Distance to place the agent, in metres">
				<output id="irl-aim-out" for="irl-aim-range">2.5 m</output>
			</div>
			<div class="irl-aim-actions">
				<button type="button" class="irl-aim-place" id="irl-aim-place">Place agent</button>
				<button type="button" class="irl-aim-face" id="irl-aim-face" aria-pressed="true"
				        aria-label="Agent faces you">Faces you</button>
				<button type="button" class="irl-aim-done" id="irl-aim-done">Done</button>
			</div>
		</div>`;
	document.body.appendChild(hud);

	const reticleReadout = hud.querySelector('#irl-aim-readout');
	const coach = hud.querySelector('#irl-aim-coach');
	const range = hud.querySelector('#irl-aim-range');
	const out = hud.querySelector('#irl-aim-out');
	const placeBtn = hud.querySelector('#irl-aim-place');
	const faceBtn = hud.querySelector('#irl-aim-face');
	const doneBtn = hud.querySelector('#irl-aim-done');

	range.addEventListener('input', () => {
		distM = clampDistance(parseFloat(range.value));
		refreshReadouts();
	});
	faceBtn.addEventListener('click', () => {
		faceViewer = !faceViewer;
		faceBtn.setAttribute('aria-pressed', String(faceViewer));
		faceBtn.textContent = faceViewer ? 'Faces you' : 'Faces away';
	});
	doneBtn.addEventListener('click', exit);
	placeBtn.addEventListener('click', place);
	// Keyboard: Esc exits, Enter on the HUD places.
	hud.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') { e.preventDefault(); exit(); }
	});

	function reviveRoomFromStore() {
		try { return reviveRoom(localStorage.getItem(STORE_KEY) || ''); } catch { return null; }
	}
	function persistRoom() {
		try { localStorage.setItem(STORE_KEY, serializeRoom(activeRoom)); } catch {}
	}

	function refreshReadouts() {
		out.textContent = `${distM.toFixed(1)} m`;
		const fix = getFix();
		const ready = !!fix && fix.ready;
		const heading = getHeading ? getHeading() : { deg: 0, absolute: false };
		const dir = compassLabel(heading.deg);
		reticleReadout.textContent = ready ? `${distM.toFixed(1)} m · ${dir} ${Math.round(heading.deg)}°` : `${distM.toFixed(1)} m`;

		// Coach + Place enablement reflect the live state honestly.
		if (!ready) {
			setCoach(`Finding your spot…${fix && fix.accuracy ? ` (±${Math.round(fix.accuracy)} m)` : ''}`, 'warn');
			placeBtn.disabled = true;
			return;
		}
		placeBtn.disabled = busy;
		if (!heading.absolute) {
			setCoach('Compass not calibrated — others may see this room rotated. Placement still works.', 'warn');
		} else if (activeRoom && activeRoom.count > 0) {
			setCoach(`Aim and Place to add another. ${activeRoom.count} placed in this room.`);
		} else {
			setCoach('Aim at a spot and tap Place to drop your first agent.');
		}
	}
	function setCoach(text, tone) {
		coach.textContent = text;
		if (tone) coach.setAttribute('data-tone', tone); else coach.removeAttribute('data-tone');
	}

	function refreshBadge() {
		const n = activeRoom ? activeRoom.count : 0;
		if (active && n > 0) {
			badge.innerHTML = `<span class="dot"></span> ${n} agent${n === 1 ? '' : 's'} in this room`;
			badge.classList.add('is-shown');
		} else {
			badge.classList.remove('is-shown');
		}
	}

	async function enter() {
		if (active) return;
		let ok = false;
		try { ok = await ensureReady(); } catch { ok = false; }
		if (!ok) { status('Turn on the camera and allow motion + location to place agents.', { warn: true }); return; }
		active = true;
		busy = false;
		document.body.classList.add('irl-room-mode');
		fab.setAttribute('aria-pressed', 'true');
		fab.classList.add('is-active');
		hud.classList.add('is-open');
		range.value = String(distM);
		refreshReadouts();
		refreshBadge();
		placeBtn.focus();
		tickTimer = setInterval(refreshReadouts, 120); // live compass/fix readout, decoupled from the render loop
	}

	function exit() {
		if (!active) return;
		active = false;
		document.body.classList.remove('irl-room-mode');
		fab.setAttribute('aria-pressed', 'false');
		fab.classList.remove('is-active');
		hud.classList.remove('is-open');
		badge.classList.remove('is-shown');
		if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
	}

	async function place() {
		if (busy) return;
		const fix = getFix();
		if (!fix || !fix.ready) { setCoach('Waiting for a GPS fix before placing…', 'warn'); return; }
		const heading = getHeading ? getHeading() : { deg: 0, absolute: false };

		// Establish the room on the first placement of the session/spot.
		if (!activeRoom) {
			activeRoom = establishRoom({
				lat: fix.lat, lng: fix.lng,
				headingDeg: heading.deg, hasAbsoluteCompass: heading.absolute,
				locationKey: locationKey(fix.lat, fix.lng),
				rand: (Math.random().toString(36).slice(2, 8)),
				now: Date.now(),
			});
		}

		let body;
		try {
			body = roomPlacement({
				room: activeRoom,
				viewerLat: fix.lat, viewerLng: fix.lng,
				bearingDeg: heading.deg, distM, faceViewer,
			});
		} catch (err) {
			setCoach('Could not compute the placement — try again.', 'warn');
			return;
		}
		body.absolute = heading.absolute; // irl.js maps this to anchor_source

		busy = true;
		placeBtn.disabled = true;
		const prevLabel = placeBtn.textContent;
		placeBtn.textContent = 'Placing…';
		let result;
		try { result = await placeRoomAgent(body); } catch { result = { ok: false, message: 'Network error — try again.' }; }

		busy = false;
		placeBtn.textContent = prevLabel;
		if (result && result.ok) {
			activeRoom.count = (activeRoom.count || 0) + 1;
			persistRoom();
			placeBtn.classList.remove('is-flash'); void placeBtn.offsetWidth; placeBtn.classList.add('is-flash');
			try { navigator.vibrate && navigator.vibrate(10); } catch {}
			refreshBadge();
			refreshReadouts();
		} else {
			setCoach(result?.message || 'Could not place the agent — try again.', 'warn');
		}
		placeBtn.disabled = false;
	}

	return {
		isActive: () => active,
		exit,
	};
}
