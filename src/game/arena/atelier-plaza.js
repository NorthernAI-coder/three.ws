// Atelier Plaza — the in-world marketplace layer of the Atelier World.
//
// Given the arena engine (scene + camera + local player) and a NormalizedRoster
// from atelier-adapter.js, this builds a booth for every Atelier agent: a lit
// pedestal, a holographic billboard card (name · specialty · price), and a glow
// ring. The featured three.ws 3D Studio takes the central dais; marketplace
// agents ring it. Walk up to a booth and a hire prompt appears; activate it and
// an in-world card opens. Hiring a marketplace agent runs the real x402 USDC
// flow through /api/x402-pay; the internal studio routes to the forge.
//
// Registered with arena.registerUpdatable(): update(dt) billboards the cards,
// pulses the nearest booth, and tracks player proximity. Every DOM node and GPU
// resource it creates is torn down in dispose().

import {
	Group, Mesh, Vector3,
	CylinderGeometry, CircleGeometry, RingGeometry, PlaneGeometry,
	MeshStandardMaterial, MeshBasicMaterial,
	CanvasTexture, SRGBColorSpace, DoubleSide, PointLight,
} from 'three';
import { hireRequest } from './atelier-adapter.js';
import { log } from '../../shared/log.js';

const RING_RADIUS = 13;          // metres from centre the marketplace booths sit on
const ACTIVATE_DIST = 3.4;       // how close the player walks before a booth activates
const CARD_W = 2.6;              // billboard width (metres)
const CARD_H = 1.7;
const ACCENT = 0x6ea8ff;         // Atelier-tinted accent (matches the arena ring)
const ACCENT_HOT = 0x9bd0ff;

export function createAtelierPlaza(arena, opts = {}) {
	return new AtelierPlaza(arena, opts);
}

class AtelierPlaza {
	/**
	 * @param {object} arena   the OmniologyArena engine (scene, camera, localPos, project, registerUpdatable)
	 * @param {object} [opts]
	 * @param {() => string} [opts.getAgentId]   paying agent id for x402 hires (optional)
	 * @param {(s:string)=>void} [opts.onStatus] surface 'loading'|'live'|'empty'|'error'
	 */
	constructor(arena, opts = {}) {
		this.arena = arena;
		this.scene = arena.scene;
		this.getAgentId = typeof opts.getAgentId === 'function' ? opts.getAgentId : () => '';
		this.onStatus = typeof opts.onStatus === 'function' ? opts.onStatus : null;

		this.group = new Group();
		this.scene.add(this.group);
		this.booths = [];        // { agent, root, card, tex, ring, light, basePos }
		this.activeBooth = null;
		this.status = 'loading';
		this._t = 0;
		this._disposed = false;
		this._hireBusy = false;

		this._injectStyles();
		this._buildPrompt();
		this._bindKeys();
	}

	// ── roster → booths ─────────────────────────────────────────────────────────
	/** (Re)build every booth from a NormalizedRoster. Idempotent: clears first. */
	applyRoster(roster) {
		this._clearBooths();
		const agents = roster?.agents || [];
		const featured = agents.filter((a) => a.featured);
		const ring = agents.filter((a) => !a.featured);

		// Featured (the three.ws studio) sits on the central dais.
		featured.forEach((agent, i) => {
			const angle = featured.length > 1 ? (i / featured.length) * Math.PI * 2 : 0;
			const pos = new Vector3(Math.sin(angle) * 2.2 * (i ? 1 : 0), 0, Math.cos(angle) * 2.2 * (i ? 1 : 0));
			this._buildBooth(agent, pos, true);
		});
		// Marketplace agents evenly distributed on the ring, starting at the back
		// so the player (spawned near the front) faces into the plaza.
		ring.forEach((agent, i) => {
			const angle = (i / Math.max(1, ring.length)) * Math.PI * 2 + Math.PI;
			const pos = new Vector3(Math.sin(angle) * RING_RADIUS, 0, Math.cos(angle) * RING_RADIUS);
			this._buildBooth(agent, pos, false);
		});

		this.status = roster?.ok ? (ring.length ? 'live' : 'empty') : (roster?.reason === 'unconfigured' ? 'empty' : 'error');
		this._renderDais(roster);
		this.onStatus?.(this.status);
	}

	setStatus(s) {
		if (s === 'error' && this.status !== 'live') { this.status = 'error'; this._renderDais(null); this.onStatus?.('error'); }
	}

	_buildBooth(agent, basePos, featured) {
		const root = new Group();
		root.position.copy(basePos);
		this.group.add(root);

		const tint = featured ? 0xb892ff : ACCENT;

		// Pedestal — a short metallic cylinder the card floats above.
		const pedH = featured ? 1.1 : 0.8;
		const pedGeo = new CylinderGeometry(featured ? 1.5 : 1.0, featured ? 1.7 : 1.2, pedH, 32);
		const pedMat = new MeshStandardMaterial({ color: 0x141821, roughness: 0.55, metalness: 0.6, emissive: tint, emissiveIntensity: 0.04 });
		const pedestal = new Mesh(pedGeo, pedMat);
		pedestal.position.y = pedH / 2;
		pedestal.castShadow = true; pedestal.receiveShadow = true;
		root.add(pedestal);

		// Glow ring at the base — pulses when the booth is active.
		const ringGeo = new RingGeometry(featured ? 1.8 : 1.3, featured ? 2.05 : 1.5, 48);
		const ringMat = new MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.35, depthWrite: false, side: DoubleSide });
		const ring = new Mesh(ringGeo, ringMat);
		ring.rotation.x = -Math.PI / 2;
		ring.position.y = 0.05;
		root.add(ring);

		// Holographic billboard card.
		const tex = new CanvasTexture(document.createElement('canvas'));
		tex.colorSpace = SRGBColorSpace;
		const cardMat = new MeshBasicMaterial({ map: tex, transparent: true, side: DoubleSide, depthWrite: false });
		const card = new Mesh(new PlaneGeometry(CARD_W, CARD_H), cardMat);
		card.position.y = pedH + 1.35;
		root.add(card);

		// A soft accent light so each booth sits in its own pool of colour.
		const light = new PointLight(tint, featured ? 10 : 6, 12, 2);
		light.position.set(0, pedH + 1.6, 0.4);
		root.add(light);

		const booth = { agent, root, card, tex, ring, ringMat, light, basePos: basePos.clone(), pedH, tint, featured, _hot: 0 };
		this._drawCard(booth, false);
		this.booths.push(booth);
	}

	// ── per-frame ───────────────────────────────────────────────────────────────
	update(dt) {
		this._t += dt;
		const cam = this.arena.camera;
		const px = this.arena.localPos.x, pz = this.arena.localPos.z;

		// Nearest booth within reach becomes active.
		let nearest = null, nearestD = Infinity;
		for (const b of this.booths) {
			const d = Math.hypot(b.basePos.x - px, b.basePos.z - pz);
			if (d < nearestD) { nearestD = d; nearest = b; }
		}
		const active = nearest && nearestD <= ACTIVATE_DIST ? nearest : null;
		if (active !== this.activeBooth) { this.activeBooth = active; this._refreshActive(); }

		for (const b of this.booths) {
			// Billboard the card toward the camera (upright — yaw only).
			b.card.quaternion.copy(cam.quaternion);
			// Gentle bob + a brighter pulse for the active booth.
			const isHot = b === this.activeBooth;
			b._hot += ((isHot ? 1 : 0) - b._hot) * Math.min(1, dt * 8);
			b.card.position.y = b.pedH + 1.35 + Math.sin(this._t * 1.4 + b.basePos.x) * 0.04;
			b.ringMat.opacity = 0.3 + 0.35 * b._hot + 0.08 * Math.sin(this._t * 3);
			b.ring.scale.setScalar(1 + 0.04 * Math.sin(this._t * 3) + 0.08 * b._hot);
			b.light.intensity = (b.featured ? 10 : 6) * (0.85 + 0.3 * b._hot);
		}

		// Position the in-world hire prompt above the active booth.
		if (this.activeBooth && !this._cardOpen) {
			const head = new Vector3(this.activeBooth.basePos.x, this.activeBooth.pedH + 2.7, this.activeBooth.basePos.z);
			const p = this.arena.project(head);
			if (p.visible) {
				this.prompt.style.display = '';
				this.prompt.style.transform = `translate(-50%, -100%) translate(${p.x}px, ${p.y}px)`;
			} else {
				this.prompt.style.display = 'none';
			}
		} else {
			this.prompt.style.display = 'none';
		}
	}

	_refreshActive() {
		if (this.activeBooth) {
			const a = this.activeBooth.agent;
			this.promptName.textContent = a.name;
			this.promptHint.textContent = a.internal ? 'Open Studio' : 'Hire';
		}
	}

	// ── the floating "walk up" prompt ─────────────────────────────────────────────
	_buildPrompt() {
		this.prompt = document.createElement('button');
		this.prompt.className = 'atl-prompt';
		this.prompt.type = 'button';
		this.prompt.style.display = 'none';
		this.promptName = document.createElement('span');
		this.promptName.className = 'atl-prompt-name';
		this.promptHint = document.createElement('span');
		this.promptHint.className = 'atl-prompt-hint';
		this.promptHint.innerHTML = '<kbd>E</kbd> Hire';
		this.prompt.append(this.promptName, this.promptHint);
		this.prompt.addEventListener('click', () => this._openCard());
		document.body.appendChild(this.prompt);
	}

	_bindKeys() {
		this._onKey = (e) => {
			if (e.target && /^(input|textarea)$/i.test(e.target.tagName)) return;
			const k = e.key.toLowerCase();
			if ((k === 'e' || k === 'enter') && this.activeBooth && !this._cardOpen) { this._openCard(); }
			if (k === 'escape' && this._cardOpen) { this._closeCard(); }
		};
		window.addEventListener('keydown', this._onKey);
	}

	// ── the in-world hire card ────────────────────────────────────────────────────
	_openCard() {
		const booth = this.activeBooth;
		if (!booth || this._cardOpen) return;
		this._cardOpen = true;
		this.prompt.style.display = 'none';
		const a = booth.agent;

		const overlay = document.createElement('div');
		overlay.className = 'atl-overlay';
		overlay.addEventListener('click', (e) => { if (e.target === overlay) this._closeCard(); });

		const card = document.createElement('div');
		card.className = 'atl-card';
		card.setAttribute('role', 'dialog');
		card.setAttribute('aria-label', `Hire ${a.name}`);

		const mono = a.name.trim().charAt(0).toUpperCase() || '◆';
		const priceLine = a.internal
			? a.pricePeriod
			: (a.priceUsdc > 0 ? `$${a.priceUsdc} USDC · ${a.pricePeriod}` : `Free · ${a.pricePeriod}`);
		const stats = [
			a.rating != null ? `★ ${a.rating.toFixed(1)}` : null,
			a.jobsDone != null ? `${a.jobsDone.toLocaleString()} hires` : null,
		].filter(Boolean).join('  ·  ');

		card.innerHTML = `
			<button class="atl-x" type="button" aria-label="Close">×</button>
			<div class="atl-head">
				<div class="atl-mono" style="--tint:#${booth.tint.toString(16).padStart(6, '0')}">${esc(mono)}</div>
				<div class="atl-head-txt">
					<div class="atl-name">${esc(a.name)}</div>
					<div class="atl-spec">${esc(a.specialty || 'AI agent')}</div>
				</div>
			</div>
			<p class="atl-tag">${esc(a.tagline || 'Hire this agent to deliver work, settled in USDC.')}</p>
			${stats ? `<div class="atl-stats">${esc(stats)}</div>` : ''}
			<div class="atl-price">${esc(priceLine)}</div>
			<div class="atl-flow" hidden></div>
			<button class="atl-hire" type="button">${a.internal ? 'Open the Studio' : 'Hire — pay in USDC'}</button>
		`;

		overlay.appendChild(card);
		document.body.appendChild(overlay);
		this._overlay = overlay;

		card.querySelector('.atl-x').addEventListener('click', () => this._closeCard());
		card.querySelector('.atl-hire').addEventListener('click', () => this._hire(booth));
		requestAnimationFrame(() => overlay.classList.add('atl-show'));
	}

	_closeCard() {
		if (!this._overlay) { this._cardOpen = false; return; }
		const o = this._overlay;
		o.classList.remove('atl-show');
		setTimeout(() => o.remove(), 200);
		this._overlay = null;
		this._cardOpen = false;
	}

	async _hire(booth) {
		const a = booth.agent;
		// Internal studio → the real forge surface; no payment.
		if (a.internal) {
			try { window.location.assign(a.hireUrl || '/forge'); } catch { /* navigation blocked */ }
			return;
		}
		if (this._hireBusy) return;
		const req = hireRequest(a);
		if (!req) { this._flow(booth, 'error', 'This agent has no hire endpoint configured.'); return; }

		this._hireBusy = true;
		const hireBtn = this._overlay?.querySelector('.atl-hire');
		if (hireBtn) { hireBtn.disabled = true; hireBtn.textContent = 'Settling…'; }

		const stages = ['challenge', 'built', 'verified', 'settled'];
		this._flowStepper(booth, stages, 'challenge');

		try {
			const res = await fetch('/api/x402-pay', {
				method: 'POST',
				headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
				body: JSON.stringify({ url: req.url, method: req.method, body: req.body, agentId: this.getAgentId() || undefined }),
			});
			if (!res.ok || !res.body) {
				const text = await res.text().catch(() => '');
				let msg = 'Payment service unavailable.';
				try { const j = JSON.parse(text); msg = j.error_description || j.error || msg; } catch { /* keep default */ }
				throw new Error(msg);
			}
			let settled = null, result = null;
			for await (const { event, data } of sse(res)) {
				if (stages.includes(event)) this._flowStepper(booth, stages, event);
				if (event === 'settled') settled = data;
				else if (event === 'result') result = data;
				else if (event === 'error') throw new Error(data?.error || 'payment failed');
			}
			if (!settled) throw new Error('incomplete response from payment service');
			this._flowDone(booth, settled, result);
		} catch (e) {
			log.warn('[atelier] hire failed', e?.message);
			this._flow(booth, 'error', e?.message || 'Hire failed. Try again.');
			if (hireBtn) { hireBtn.disabled = false; hireBtn.textContent = 'Retry — pay in USDC'; }
		} finally {
			this._hireBusy = false;
		}
	}

	_flowEl(booth) {
		const el = this._overlay?.querySelector('.atl-flow');
		if (el) el.hidden = false;
		return el;
	}
	_flow(booth, kind, msg) {
		const el = this._flowEl(booth);
		if (!el) return;
		el.className = `atl-flow atl-flow-${kind}`;
		el.textContent = msg;
	}
	_flowStepper(booth, stages, active) {
		const el = this._flowEl(booth);
		if (!el) return;
		const labels = { challenge: '402', built: 'Build', verified: 'Verify', settled: 'Settle' };
		const idx = stages.indexOf(active);
		el.className = 'atl-flow atl-flow-live';
		el.innerHTML = stages.map((s, i) =>
			`<span class="atl-step ${i < idx ? 'done' : ''} ${i === idx ? 'on' : ''}">${labels[s]}</span>`
		).join('<i class="atl-step-sep"></i>');
	}
	_flowDone(booth, settled, result) {
		const el = this._flowEl(booth);
		if (!el) return;
		const tx = settled?.transaction || settled?.tx || result?.payment?.transaction || '';
		const short = tx ? `${tx.slice(0, 6)}…${tx.slice(-6)}` : '';
		el.className = 'atl-flow atl-flow-done';
		el.innerHTML = `<strong>Hired.</strong> Settled on-chain in USDC.` +
			(short ? ` <a class="atl-tx" href="https://solscan.io/tx/${esc(tx)}" target="_blank" rel="noopener">${esc(short)}</a>` : '');
		const hireBtn = this._overlay?.querySelector('.atl-hire');
		if (hireBtn) { hireBtn.disabled = false; hireBtn.textContent = 'Done'; }
	}

	// ── dais sign (empty / connecting state) ──────────────────────────────────────
	_renderDais(roster) {
		if (!this._daisTex) {
			const tex = new CanvasTexture(document.createElement('canvas'));
			tex.colorSpace = SRGBColorSpace;
			const mat = new MeshBasicMaterial({ map: tex, transparent: true, side: DoubleSide, depthWrite: false });
			const sign = new Mesh(new PlaneGeometry(7, 1.0), mat);
			sign.position.set(0, 4.6, -RING_RADIUS - 4);
			this.group.add(sign);
			this._daisTex = tex; this._daisSign = sign; this._daisMat = mat;
		}
		const ringCount = (roster?.agents || []).filter((a) => !a.featured).length;
		let title = 'ATELIER WORLD';
		let sub = `${ringCount} agent${ringCount === 1 ? '' : 's'} for hire · settle in USDC`;
		if (!roster || roster.reason !== 'unconfigured' && roster.ok === false) sub = 'Reconnecting to the Atelier marketplace…';
		else if (roster.reason === 'unconfigured' || ringCount === 0) sub = 'Marketplace connecting — explore the three.ws 3D Studio';
		this._drawSign(this._daisTex, title, sub);
	}

	// ── canvas painters ───────────────────────────────────────────────────────────
	_drawCard(booth, active) {
		const a = booth.agent;
		const cv = booth.tex.image;
		const W = 768, H = 500; cv.width = W; cv.height = H;
		const g = cv.getContext('2d');
		g.clearRect(0, 0, W, H);
		// Glass panel.
		roundRect(g, 12, 12, W - 24, H - 24, 28);
		g.fillStyle = 'rgba(10,12,18,0.86)'; g.fill();
		g.lineWidth = 3; g.strokeStyle = `#${booth.tint.toString(16).padStart(6, '0')}`; g.globalAlpha = 0.8; g.stroke(); g.globalAlpha = 1;
		// Monogram disc.
		const mono = (a.name.trim().charAt(0) || '◆').toUpperCase();
		g.beginPath(); g.arc(96, 110, 56, 0, Math.PI * 2);
		g.fillStyle = `#${booth.tint.toString(16).padStart(6, '0')}`; g.globalAlpha = 0.16; g.fill(); g.globalAlpha = 1;
		g.lineWidth = 3; g.strokeStyle = `#${booth.tint.toString(16).padStart(6, '0')}`; g.stroke();
		g.fillStyle = '#eaf2ff'; g.font = '600 52px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
		g.fillText(mono, 96, 112);
		// Name + specialty.
		g.textAlign = 'left';
		g.fillStyle = '#f5f8ff'; g.font = '700 46px Inter, system-ui, sans-serif';
		fitText(g, a.name, 176, 96, W - 200, 46);
		g.fillStyle = '#8fb4ff'; g.font = '500 28px Inter, system-ui, sans-serif';
		fitText(g, a.specialty || 'AI agent', 176, 142, W - 200, 28);
		// Tagline.
		g.fillStyle = '#aab3c4'; g.font = '400 27px Inter, system-ui, sans-serif';
		wrapText(g, a.tagline || 'Hire to deliver work, settled in USDC.', 44, 220, W - 88, 34, 2);
		// Price pill.
		const price = a.internal ? a.pricePeriod : (a.priceUsdc > 0 ? `$${a.priceUsdc} USDC · ${a.pricePeriod}` : `Free · ${a.pricePeriod}`);
		roundRect(g, 44, 322, 360, 56, 28); g.fillStyle = `#${booth.tint.toString(16).padStart(6, '0')}`; g.globalAlpha = 0.16; g.fill(); g.globalAlpha = 1;
		g.fillStyle = '#dbe8ff'; g.font = '600 26px Inter, system-ui, sans-serif'; g.textBaseline = 'middle';
		g.fillText(price, 68, 351);
		// CTA hint.
		g.fillStyle = '#9aa6bb'; g.font = '600 24px Inter, system-ui, sans-serif';
		g.fillText(a.internal ? 'Walk up · open Studio' : 'Walk up · press E to hire', 44, 430);
		booth.tex.needsUpdate = true;
	}

	_drawSign(tex, title, sub) {
		const cv = tex.image; const W = 1024, H = 150; cv.width = W; cv.height = H;
		const g = cv.getContext('2d');
		g.clearRect(0, 0, W, H);
		g.textAlign = 'center';
		g.fillStyle = '#eaf2ff'; g.font = '800 64px Inter, system-ui, sans-serif'; g.textBaseline = 'middle';
		g.fillText(title, W / 2, 52);
		g.fillStyle = '#7f93b4'; g.font = '500 30px Inter, system-ui, sans-serif';
		g.fillText(sub, W / 2, 112);
		tex.needsUpdate = true;
	}

	// ── styles ────────────────────────────────────────────────────────────────────
	_injectStyles() {
		if (document.getElementById('atl-plaza-styles')) return;
		const s = document.createElement('style');
		s.id = 'atl-plaza-styles';
		s.textContent = `
		.atl-prompt{position:fixed;z-index:45;display:inline-flex;flex-direction:column;align-items:center;gap:2px;
			padding:8px 14px;border-radius:12px;border:1px solid rgba(155,208,255,.5);
			background:rgba(10,14,22,.82);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
			color:#eaf2ff;font:600 14px/1.2 Inter,system-ui,sans-serif;cursor:pointer;
			box-shadow:0 8px 30px rgba(0,0,0,.45);transition:transform .12s ease,border-color .12s ease;pointer-events:auto}
		.atl-prompt:hover{border-color:#9bd0ff;transform:translate(-50%,-100%) translate(var(--x,0),var(--y,0)) scale(1.04)}
		.atl-prompt-name{font-weight:700}
		.atl-prompt-hint{color:#8fb4ff;font-size:11px;letter-spacing:.04em;text-transform:uppercase}
		.atl-prompt-hint kbd{background:rgba(143,180,255,.18);border-radius:4px;padding:1px 5px;font:inherit;font-size:11px;border:1px solid rgba(143,180,255,.35)}
		.atl-overlay{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:20px;
			background:rgba(4,6,10,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
			opacity:0;transition:opacity .2s ease}
		.atl-overlay.atl-show{opacity:1}
		.atl-card{position:relative;width:min(440px,92vw);padding:26px;border-radius:20px;
			background:linear-gradient(180deg,rgba(18,22,32,.96),rgba(11,13,20,.97));
			border:1px solid rgba(255,255,255,.12);box-shadow:0 30px 80px rgba(0,0,0,.6);
			color:#f5f8ff;font-family:Inter,system-ui,sans-serif;transform:translateY(8px) scale(.98);transition:transform .2s ease}
		.atl-overlay.atl-show .atl-card{transform:none}
		.atl-x{position:absolute;top:14px;right:14px;width:30px;height:30px;border-radius:8px;border:1px solid rgba(255,255,255,.14);
			background:rgba(255,255,255,.04);color:#cfd8e6;font-size:18px;cursor:pointer;line-height:1;transition:background .12s ease}
		.atl-x:hover{background:rgba(255,255,255,.12)}
		.atl-head{display:flex;gap:14px;align-items:center;margin-bottom:14px}
		.atl-mono{width:56px;height:56px;border-radius:14px;display:grid;place-items:center;flex:0 0 auto;
			background:color-mix(in srgb,var(--tint) 18%,transparent);border:1px solid var(--tint);
			color:#eaf2ff;font-weight:700;font-size:26px}
		.atl-name{font-size:22px;font-weight:700;line-height:1.15}
		.atl-spec{color:#8fb4ff;font-size:13px;font-weight:600;margin-top:3px;text-transform:uppercase;letter-spacing:.03em}
		.atl-tag{color:#aeb8c8;font-size:14.5px;line-height:1.5;margin:0 0 14px}
		.atl-stats{color:#cbd5e6;font-size:13px;margin-bottom:12px}
		.atl-price{display:inline-block;padding:7px 14px;border-radius:999px;margin-bottom:18px;
			background:rgba(110,168,255,.14);border:1px solid rgba(110,168,255,.3);color:#dbe8ff;font-weight:600;font-size:14px}
		.atl-hire{width:100%;padding:13px;border-radius:12px;border:0;cursor:pointer;
			background:linear-gradient(180deg,#6ea8ff,#4f7fe0);color:#06101f;font-weight:700;font-size:15px;
			transition:filter .12s ease,transform .12s ease}
		.atl-hire:hover:not(:disabled){filter:brightness(1.07);transform:translateY(-1px)}
		.atl-hire:disabled{opacity:.7;cursor:default}
		.atl-flow{margin:0 0 16px;padding:12px 14px;border-radius:12px;font-size:13px;line-height:1.5;
			background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#cbd5e6}
		.atl-flow-live{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
		.atl-step{font-weight:600;color:#6b7689}
		.atl-step.on{color:#9bd0ff}
		.atl-step.done{color:#6ee7a8}
		.atl-step-sep{flex:1;height:1px;min-width:10px;background:rgba(255,255,255,.12)}
		.atl-flow-done{background:rgba(110,231,168,.1);border-color:rgba(110,231,168,.3);color:#bfeed4}
		.atl-flow-error{background:rgba(255,107,107,.1);border-color:rgba(255,107,107,.3);color:#ffc9c9}
		.atl-tx{color:#9bd0ff;text-decoration:none;border-bottom:1px solid rgba(155,208,255,.4)}
		@media (prefers-reduced-motion: reduce){.atl-overlay,.atl-card,.atl-prompt{transition:none}}
		`;
		document.head.appendChild(s);
	}

	// ── teardown ──────────────────────────────────────────────────────────────────
	_clearBooths() {
		for (const b of this.booths) {
			this.group.remove(b.root);
			b.root.traverse((o) => {
				o.geometry?.dispose?.();
				const m = o.material;
				if (Array.isArray(m)) m.forEach((mm) => mm?.dispose?.()); else m?.dispose?.();
			});
			b.tex.dispose();
		}
		this.booths = [];
		this.activeBooth = null;
	}

	dispose() {
		this._disposed = true;
		window.removeEventListener('keydown', this._onKey);
		this._closeCard();
		this.prompt?.remove();
		this._clearBooths();
		if (this._daisSign) { this.group.remove(this._daisSign); this._daisSign.geometry.dispose(); this._daisMat.dispose(); this._daisTex.dispose(); }
		this.scene.remove(this.group);
		document.getElementById('atl-plaza-styles')?.remove();
	}
}

// ── tiny shared helpers ──────────────────────────────────────────────────────────
function esc(s) {
	return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function roundRect(g, x, y, w, h, r) {
	g.beginPath();
	g.moveTo(x + r, y);
	g.arcTo(x + w, y, x + w, y + h, r);
	g.arcTo(x + w, y + h, x, y + h, r);
	g.arcTo(x, y + h, x, y, r);
	g.arcTo(x, y, x + w, y, r);
	g.closePath();
}

function fitText(g, text, x, y, maxW, size) {
	let s = size;
	g.font = `${g.font.split(' ').slice(0, -2).join(' ')} ${s}px Inter, system-ui, sans-serif`;
	while (g.measureText(text).width > maxW && s > 12) {
		s -= 2;
		g.font = g.font.replace(/\d+px/, `${s}px`);
	}
	g.textBaseline = 'middle';
	g.fillText(text, x, y);
}

function wrapText(g, text, x, y, maxW, lh, maxLines) {
	const words = String(text).split(/\s+/);
	let line = '', lines = 0;
	g.textBaseline = 'alphabetic';
	for (let i = 0; i < words.length; i++) {
		const test = line ? `${line} ${words[i]}` : words[i];
		if (g.measureText(test).width > maxW && line) {
			g.fillText(line, x, y + lines * lh);
			line = words[i]; lines++;
			if (lines >= maxLines - 1) {
				// last allowed line — ellipsize the remainder
				let rest = words.slice(i).join(' ');
				while (g.measureText(rest + '…').width > maxW && rest.length) rest = rest.slice(0, -1);
				g.fillText(rest + '…', x, y + lines * lh);
				return;
			}
		} else {
			line = test;
		}
	}
	g.fillText(line, x, y + lines * lh);
}

// SSE event reader — same framing /api/x402-pay speaks.
async function* sse(res) {
	const reader = res.body.getReader();
	const dec = new TextDecoder();
	let buf = '';
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buf += dec.decode(value, { stream: true });
		const chunks = buf.split('\n\n');
		buf = chunks.pop();
		for (const chunk of chunks) {
			if (!chunk.trim()) continue;
			let event = 'message', data = {};
			for (const line of chunk.split('\n')) {
				if (line.startsWith('event:')) event = line.slice(6).trim();
				if (line.startsWith('data:')) { try { data = JSON.parse(line.slice(5).trim()); } catch { /* ignore */ } }
			}
			yield { event, data };
		}
	}
}
