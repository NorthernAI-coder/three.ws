/**
 * Reactive Avatar Controller — drives a 3D agent's embodiment from its REAL
 * on-chain net worth.
 *
 * Given a live viewer (and, when present, the AgentAvatar empathy layer + the
 * protocol bus), this:
 *   1. fetches the agent's real net-worth look (one normalizer — agent-networth.js)
 *      and applies it as a persistent aura + idle confidence;
 *   2. watches the real chain for change — a positive USD/$THREE delta between two
 *      real reads means funds actually landed (a tip, a fill, a pump), so the
 *      avatar performs a short celebratory reaction; a real drawdown reads as
 *      subdued, never punishing. No reaction ever fires without a real delta.
 *   3. respects the owner's reactivity preference (off ↔ expressive) and per-signal
 *      opt-outs, `prefers-reduced-motion`, and visibility — it stops entirely when
 *      the avatar is offscreen or the tab is hidden, holding the last real state.
 *
 * Every visual traces to a real read. The poll cadence is just how often we read
 * the chain; the *reaction* is event-driven off real deltas, not a timer.
 */

import { Box3, Vector3 } from 'three';
import { fetchNetWorth, normalizePrefs, fmtUsd } from './agent-networth.js';
import { NetWorthAura } from './networth-aura.js';
import { ACTION_TYPES } from '../agent-protocol.js';

const REDUCED_MOTION =
	typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// How often we read the chain while visible. The balances API caches ~60s, so a
// 30s cadence costs almost nothing yet catches a tip within one cache window.
const POLL_MS = 30_000;
// A USD move smaller than this is price noise, not an event.
const usdEventFloor = (usd) => Math.max(0.5, usd * 0.01);

export class ReactiveAvatarController {
	/**
	 * @param {object} ctx
	 * @param {string} ctx.agentId
	 * @param {object} ctx.viewer            the 3D Viewer (has .scene, .content, ._afterAnimateHooks, .el)
	 * @param {object} [ctx.protocol]        the agent-protocol bus (for emotion/gesture reactions)
	 * @param {object} [ctx.avatar]          the AgentAvatar empathy layer (optional)
	 * @param {boolean} [ctx.isOwner]
	 * @param {(data:object)=>void} [ctx.onUpdate]  called with each fresh net-worth payload
	 * @param {(ev:object)=>void}   [ctx.onReaction] called when a real event fires
	 */
	constructor(ctx) {
		this.agentId = ctx.agentId;
		this.viewer = ctx.viewer;
		this.protocol = ctx.protocol || null;
		this.avatar = ctx.avatar || null;
		this.isOwner = !!ctx.isOwner;
		this.onUpdate = ctx.onUpdate || null;
		this.onReaction = ctx.onReaction || null;

		this.aura = new NetWorthAura();
		this.prefs = normalizePrefs(null);
		this.data = null;          // last real net-worth payload
		this._last = null;         // last snapshot used for delta detection
		this._timer = null;
		this._inflight = null;
		this._disposed = false;
		this._onFrame = (dt) => this.aura.update(dt);
		this._io = null;
		this._intersecting = true;
		this._boundsFitted = false;

		this._onVisibility = () => this._reschedule();
	}

	/** Boot: attach the aura, hook the frame loop, do the first real read. */
	async start() {
		if (this._disposed) return;
		const scene = this.viewer?.scene;
		if (scene) scene.add(this.aura.object3D);
		this._fitBounds();

		if (this.viewer && Array.isArray(this.viewer._afterAnimateHooks)) {
			this.viewer._afterAnimateHooks.push(this._onFrame);
		}

		// Pause cleanly when offscreen.
		if (typeof IntersectionObserver === 'function' && this.viewer?.el) {
			this._io = new IntersectionObserver((entries) => {
				this._intersecting = entries.some((e) => e.isIntersecting);
				this.aura.setVisible(this._intersecting);
				this._reschedule();
			}, { threshold: 0.01 });
			this._io.observe(this.viewer.el);
		}
		document.addEventListener('visibilitychange', this._onVisibility);

		await this.refresh();
		this._reschedule();
	}

	/** Re-fit the aura to the avatar's real bounds (call after a model swap). */
	_fitBounds() {
		const content = this.viewer?.content;
		if (!content) return;
		try {
			const box = new Box3().setFromObject(content);
			if (box.isEmpty()) return;
			const size = box.getSize(new Vector3());
			const center = box.getCenter(new Vector3());
			const radius = Math.max(0.25, Math.max(size.x, size.z) / 2);
			this.aura.setBounds({ radius, height: Math.max(0.5, size.y), centerY: center.y, baseY: box.min.y });
			this.aura.object3D.position.set(content.position.x, 0, content.position.z);
			this._boundsFitted = true;
		} catch {
			/* bounds unavailable yet — the look still applies, halo sits at origin */
		}
	}

	/** One real chain read → apply look, detect events. */
	async refresh() {
		if (this._disposed || this._inflight) return;
		const ctrl = new AbortController();
		this._inflight = ctrl;
		let data;
		try {
			data = await fetchNetWorth(this.agentId, { signal: ctrl.signal });
		} finally {
			this._inflight = null;
		}
		if (this._disposed) return;
		// Null = read failed: hold the last real state, never invent one.
		if (!data) return;

		if (!this._boundsFitted) this._fitBounds();
		this.prefs = normalizePrefs(data.prefs);
		this.data = data;
		this._applyLook(data.look);
		this._detectEvents(data);
		this.onUpdate?.(data);
	}

	/** Apply the persistent net-worth look (respecting the owner's aura opt-out). */
	_applyLook(look) {
		if (!look) return;
		const auraOn = this.prefs.reactivity !== 'off' && this.prefs.signals.aura !== false;
		if (auraOn) {
			this.aura.setLook(look);
		} else {
			// Owner muted the balance aura → keep a flat, minimal presence floor.
			this.aura.setLook({ glow: 0.12, auraColor: look.auraColor });
		}
	}

	/**
	 * Compare the new real snapshot to the last and fire a reaction on a genuine
	 * delta. The first read only seeds the baseline — no reaction without history.
	 */
	_detectEvents(data) {
		const usd = Number(data?.portfolio?.usd) || 0;
		const three = Number(data?.portfolio?.three?.amount) || 0;
		const prev = this._last;
		this._last = { usd, three };
		if (!prev) return; // baseline only

		if (this.prefs.reactivity === 'off' || this.prefs.signals.events === false) return;

		const dUsd = usd - prev.usd;
		const dThree = three - prev.three;

		if (dUsd > usdEventFloor(prev.usd) || dThree > 0) {
			this._react('positive', {
				kind: dThree > 0 ? 'three_in' : 'funds_in',
				deltaUsd: dUsd,
				deltaThree: dThree,
				label: dThree > 0 ? `+${data.portfolio.three ? three - prev.three : ''} $THREE` : `+${fmtUsd(dUsd)}`,
			});
		} else if (dUsd < -Math.max(1, prev.usd * 0.02)) {
			this._react('subdued', { kind: 'drawdown', deltaUsd: dUsd, label: fmtUsd(dUsd) });
		}
	}

	/** Perform a reaction, scaled to the owner's reactivity level. */
	_react(tone, ev) {
		const level = this.prefs.reactivity; // 'subtle' | 'balanced' | 'expressive'
		// Aura pulse on every level (it self-suppresses under reduced motion).
		this.aura.pulse(tone);

		// Emotion + gesture only on richer levels, and never under reduced motion.
		if (!REDUCED_MOTION && this.protocol && level !== 'subtle') {
			if (tone === 'positive') {
				this.protocol.emit({ type: ACTION_TYPES.EMOTE, payload: { trigger: 'celebration', weight: level === 'expressive' ? 0.95 : 0.65 } });
				if (level === 'expressive') this.protocol.emit({ type: ACTION_TYPES.GESTURE, payload: { name: 'celebrate', duration: 1800 } });
				this.protocol.emit({ type: ACTION_TYPES.LOOK_AT, payload: { target: 'up' } });
			} else {
				// Drawdown: subdued, not punished — a quiet downward glance.
				this.protocol.emit({ type: ACTION_TYPES.EMOTE, payload: { trigger: 'empathy', weight: 0.4 } });
				this.protocol.emit({ type: ACTION_TYPES.LOOK_AT, payload: { target: 'down' } });
			}
		}
		this.onReaction?.({ tone, ...ev });
	}

	/** Owner changed reactivity prefs in the UI — apply immediately (already saved). */
	applyPrefs(prefs) {
		this.prefs = normalizePrefs(prefs);
		if (this.data?.look) this._applyLook(this.data.look);
		this._reschedule();
	}

	/** Start/stop the poll based on visibility + reactivity. */
	_reschedule() {
		clearTimeout(this._timer);
		this._timer = null;
		if (this._disposed) return;
		const active = !document.hidden && this._intersecting && this.prefs.reactivity !== 'off';
		if (!active) return;
		this._timer = setTimeout(async () => {
			await this.refresh();
			this._reschedule();
		}, POLL_MS);
	}

	dispose() {
		this._disposed = true;
		clearTimeout(this._timer);
		this._inflight?.abort();
		document.removeEventListener('visibilitychange', this._onVisibility);
		this._io?.disconnect();
		if (this.viewer && Array.isArray(this.viewer._afterAnimateHooks)) {
			const i = this.viewer._afterAnimateHooks.indexOf(this._onFrame);
			if (i !== -1) this.viewer._afterAnimateHooks.splice(i, 1);
		}
		this.aura.dispose();
	}
}
