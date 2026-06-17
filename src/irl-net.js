// Realtime client for /irl — wraps colyseus.js with a tiny event API so irl.js
// can subscribe to live pin changes without knowing anything about Colyseus.
// Mirrors walk-net.js in shape (status model, single-retry reconnect, no storms)
// so the two transports read the same.
//
// What it does: joins the irl_world room for the viewer's precision-6 geocell and
// relays the pin MapSchema as pin:add / pin:update / pin:remove events. A late
// joiner is handed the room's full current pin set on connect (schema sync), so
// it never misses pins placed before it arrived. When the viewer physically walks
// into a new geocell, moveTo() re-joins the new room.
//
// Graceful degradation: if no server is configured for this environment, or the
// socket can't be reached after one retry, it settles into a distinct status
// (`unavailable` / `failed`) so irl.js drops to the poll fallback and the HUD pill
// says "Polling" — never a dead "reconnecting…" forever.

import { Client, getStateCallbacks } from 'colyseus.js';
import { IrlState } from '../multiplayer/src/irl-schemas.js';
import { encodeGeohash } from '../multiplayer/src/geohash.js';
import { log } from './shared/log.js';

const ROOM_NAME = 'irl_world';
const GEOCELL_PRECISION = 6;
const MAX_RETRIES = 1; // one jittered retry on failure/drop, then drop to poll

function defaultServerUrl() {
	// The IRL world runs on the SAME Colyseus host as /walk (a new room, not a new
	// process), so we resolve the walk-server config as a fallback — production sets
	// <meta name="walk-server">, and an explicit irl-server meta/env can override it.
	//   1. window.IRL_SERVER_URL / window.WALK_SERVER_URL   (runtime / test override)
	//   2. <meta name="irl-server"> / <meta name="walk-server">  (per-page prod config)
	//   3. VITE_IRL_SERVER_URL / VITE_WALK_SERVER_URL       (build-time prod config)
	//   4. Codespaces / Gitpod port-subdomain forwarding (-3000 → -2567)
	//   5. Same host on :2567                               (DEV ONLY convenience)
	// In production with none set we return '' so the caller stays in graceful poll
	// mode — the public domain doesn't expose :2567.
	if (typeof window !== 'undefined') {
		if (window.IRL_SERVER_URL) return String(window.IRL_SERVER_URL).trim().replace(/\/$/, '');
		if (window.WALK_SERVER_URL) return String(window.WALK_SERVER_URL).trim().replace(/\/$/, '');
	}
	if (typeof document !== 'undefined') {
		for (const name of ['irl-server', 'walk-server']) {
			const v = document.querySelector(`meta[name="${name}"]`)?.getAttribute('content')?.trim();
			if (v) return v.replace(/\/$/, '');
		}
	}
	try {
		const envUrl = import.meta?.env?.VITE_IRL_SERVER_URL || import.meta?.env?.VITE_WALK_SERVER_URL;
		if (envUrl) return String(envUrl).trim().replace(/\/$/, '');
	} catch (_) {}
	if (typeof location !== 'undefined') {
		const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
		const host = location.hostname;
		const fwd = host.match(/^(.*)-(\d+)\.(app\.github\.dev|githubpreview\.dev|gitpod\.io)$/);
		if (fwd) return `${proto}//${fwd[1]}-2567.${fwd[3]}`;
		let isProd = false;
		try { isProd = import.meta?.env?.PROD === true; } catch (_) {}
		const isLocalHost = host === 'localhost' || host === '127.0.0.1';
		if (!isProd || isLocalHost) return `${proto}//${host}:2567`;
		return '';
	}
	return '';
}

export class IrlNet {
	/**
	 * @param {object} opts
	 * @param {number} opts.lat viewer latitude (picks the geocell)
	 * @param {number} opts.lng viewer longitude
	 * @param {string} [opts.deviceToken] anonymous device id (D2 presence / D4 attribution)
	 * @param {string} [opts.agent] three.ws agent id this viewer is embodying
	 * @param {string} [opts.url] override server URL (otherwise resolved from meta)
	 */
	constructor(opts = {}) {
		this.lat = Number(opts.lat);
		this.lng = Number(opts.lng);
		this.deviceToken = opts.deviceToken || '';
		this.agent = opts.agent || '';
		this.url = opts.url || defaultServerUrl();
		this.geocell = encodeGeohash(this.lat, this.lng, GEOCELL_PRECISION);

		this.client = null;
		this.room = null;
		this.status = 'idle'; // idle | connecting | online | offline | failed | unavailable
		this.error = null;
		this._handlers = {
			status: new Set(),
			'pin:add': new Set(),
			'pin:update': new Set(),
			'pin:remove': new Set(),
			presence: new Set(), // D2 — declared now so the event API is stable
		};
		this._retries = 0;
		this._reconnectTimer = null;
		this._destroyed = false;
		this._connectGen = 0;
	}

	on(event, fn) {
		const bucket = this._handlers[event];
		if (!bucket) throw new Error(`IrlNet: unknown event "${event}"`);
		bucket.add(fn);
		return () => bucket.delete(fn);
	}

	_emit(event, ...args) {
		for (const fn of this._handlers[event]) {
			try { fn(...args); } catch (e) { log.error(`[irl-net] ${event} handler threw:`, e); }
		}
	}

	_setStatus(status, error = null) {
		this.status = status;
		this.error = error;
		this._emit('status', { status, error });
	}

	// Detach and close the current room without triggering a reconnect — every
	// (re)connect/moveTo replaces this.room, and a leftover socket would keep firing
	// schema callbacks alongside the new one (the same duplicate-event leak walk-net
	// guards against).
	_closeRoom() {
		const room = this.room;
		if (!room) return;
		this.room = null;
		try { room.removeAllListeners(); } catch {}
		try { room.leave(); } catch {}
	}

	_pinToObj(pin) {
		return {
			id: pin.id,
			lat: pin.lat,
			lng: pin.lng,
			heading: pin.heading,
			avatarUrl: pin.avatarUrl,
			avatarName: pin.avatarName,
			caption: pin.caption,
			x402Endpoint: pin.x402Endpoint,
			agentId: pin.agentId,
			placedAt: pin.placedAt,
		};
	}

	async connect() {
		if (this._destroyed) return;
		this._closeRoom();
		// No server resolved for this environment → honest 'unavailable' (the page
		// still works via the poll fallback) instead of looping on a dead endpoint.
		if (!this.url) {
			this._setStatus('unavailable');
			return;
		}
		if (!this.geocell) {
			// No valid GPS cell yet — nothing to join; the caller polls until a fix lands.
			this._setStatus('unavailable');
			return;
		}
		const gen = ++this._connectGen;
		this._setStatus('connecting');
		try {
			this.client = new Client(this.url);
			// `geocell` is the server's filterBy key (matchmaking): every viewer in the
			// same precision-6 cell joins one room instance.
			const room = await this.client.joinOrCreate(ROOM_NAME, {
				geocell: this.geocell,
				deviceToken: this.deviceToken,
				agent: this.agent,
				lat: this.lat,
				lng: this.lng,
			}, IrlState);
			if (this._destroyed || gen !== this._connectGen) {
				try { room.leave(); } catch {}
				return;
			}
			this.room = room;
			this._retries = 0; // a clean connection resets the retry budget

			// Colyseus 0.16 moved schema callbacks behind getStateCallbacks(room).
			const $ = getStateCallbacks(this.room);
			const $pins = $(this.room.state)?.pins;
			if ($pins) {
				$pins.onAdd((pin) => {
					this._emit('pin:add', this._pinToObj(pin));
					$(pin).onChange(() => this._emit('pin:update', this._pinToObj(pin)));
				});
				$pins.onRemove((pin, id) => {
					this._emit('pin:remove', { id: pin?.id || id });
				});
			}

			this.room.onLeave((code) => {
				// A clean leave (1000) is us calling _closeRoom on destroy/moveTo — don't
				// reconnect. An unexpected drop schedules the single retry, then poll.
				if (this._destroyed || code === 1000) return;
				this._setStatus('offline');
				this._scheduleReconnect();
			});
			this.room.onError((code, message) => {
				log.warn('[irl-net] room.onError', code, message);
			});

			this._setStatus('online');
		} catch (err) {
			const reason = err?.message || (err?.code != null ? `code ${err.code}` : String(err));
			log.warn('[irl-net] connect failed:', reason);
			this._setStatus('failed', reason);
			this._scheduleReconnect();
		}
	}

	_scheduleReconnect() {
		if (this._reconnectTimer || this._destroyed) return;
		if (this._retries >= MAX_RETRIES) {
			// Out of retries — settle into 'unavailable' so the caller polls instead of
			// looping forever on a dead endpoint.
			this._setStatus('unavailable', this.error);
			return;
		}
		this._retries++;
		const delay = 2500 + Math.random() * 1500;
		this._reconnectTimer = setTimeout(() => {
			this._reconnectTimer = null;
			if (this._destroyed) return;
			this.connect();
		}, delay);
	}

	/**
	 * Re-join the room for a new geocell when the viewer physically walks into one.
	 * No-op while still inside the current cell (the common case — cells are ~1.2 km).
	 */
	async moveTo(lat, lng) {
		this.lat = Number(lat);
		this.lng = Number(lng);
		const cell = encodeGeohash(this.lat, this.lng, GEOCELL_PRECISION);
		if (!cell || cell === this.geocell) return;
		this.geocell = cell;
		this._retries = 0; // a deliberate move gets a fresh connection budget
		await this.connect(); // leave the old room, join the new one
	}

	/** Force a reconnect (e.g. the user tapped the offline pill). */
	retry() {
		if (this._reconnectTimer) {
			clearTimeout(this._reconnectTimer);
			this._reconnectTimer = null;
		}
		this._retries = 0;
		this.connect();
	}

	destroy() {
		this._destroyed = true;
		if (this._reconnectTimer) {
			clearTimeout(this._reconnectTimer);
			this._reconnectTimer = null;
		}
		this._closeRoom();
		this.client = null;
	}
}
