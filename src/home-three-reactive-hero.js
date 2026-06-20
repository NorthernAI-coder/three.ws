/**
 * Reactive $THREE hero — the homepage centerpiece that breathes with the market.
 *
 * A faceted $THREE crystal floating in a particle field, mounted behind the hero
 * avatar. Every visual is driven by *real* live data — no simulated numbers:
 *
 *   • Price momentum (24h change)  → spin speed + warm/cool color temperature
 *   • 24h volume                   → particle brightness/density + crystal glow
 *   • Each on-chain trade          → a ripple pulse, green for buy / red for sell
 *   • Each deploy burn             → a warm ember burst + crystal flare
 *
 * Data sources (all live, polled, diffed against last value):
 *   /api/three-token/stats          price · 24h change · volume · holders
 *   /api/pump/coin-trades?mint=…     real buy/sell trades for $THREE
 *   /api/three-token/burns           deploy-to-burn ledger
 *
 * Three.js is dynamic-imported only once the hero scrolls into view; on
 * prefers-reduced-motion we skip the canvas entirely and keep just the live data
 * readout. Fetch failures freeze the last-known state and surface a subtle
 * "reconnecting" hint — the canvas never crashes and we never invent a number.
 */

const THREE_MINT = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';

const STATS_URL = '/api/three-token/stats';
const TRADES_URL = `/api/pump/coin-trades?mint=${THREE_MINT}&limit=20`;
const BURNS_URL = '/api/three-token/burns';

const STATS_POLL_MS = 20_000; // price/volume/holders move slowly; 20s is plenty
const TRADES_POLL_MS = 6_000; // trades are the heartbeat — poll tighter
const BURNS_POLL_MS = 45_000; // deploy burns are rare; gentle cadence

const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
const prefersReducedMotion = () =>
	window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;

function fmtPrice(p) {
	const v = Number(p);
	if (!isFinite(v) || v <= 0) return '—';
	if (v >= 1) return `$${v.toFixed(3)}`;
	if (v >= 0.001) return `$${v.toFixed(5)}`;
	// Sub-thousandth: show the first significant digits without a wall of zeros.
	return `$${v.toPrecision(3)}`;
}

function fmtCount(n) {
	const v = Number(n);
	if (!isFinite(v) || v < 0) return '—';
	if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
	if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
	return `${Math.round(v)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Live market feed — polls three real endpoints, diffs, and emits events.
// ─────────────────────────────────────────────────────────────────────────────

class MarketFeed {
	constructor({ onStats, onTrade, onBurn, onConnection }) {
		this.onStats = onStats || (() => {});
		this.onTrade = onTrade || (() => {});
		this.onBurn = onBurn || (() => {});
		this.onConnection = onConnection || (() => {});

		this.lastStats = null;
		this.seenTrades = new Set();
		this.seenBurns = new Set();
		this.tradesSeeded = false;
		this.burnsSeeded = false;

		this.timers = {};
		this.fetching = {};
		this.failStreak = 0;
		this.connected = null; // null = unknown until first result
		this.running = false;
		this.destroyed = false;
	}

	start() {
		if (this.running || this.destroyed) return;
		this.running = true;
		// Kick all three immediately, then settle into their own cadences.
		this._loop('stats', () => this._pollStats(), STATS_POLL_MS);
		this._loop('trades', () => this._pollTrades(), TRADES_POLL_MS);
		this._loop('burns', () => this._pollBurns(), BURNS_POLL_MS);
	}

	stop() {
		this.running = false;
		for (const t of Object.values(this.timers)) clearTimeout(t);
		this.timers = {};
	}

	destroy() {
		this.destroyed = true;
		this.stop();
	}

	_loop(key, fn, interval) {
		const tick = async () => {
			if (!this.running || this.destroyed) return;
			if (this.fetching[key]) return;
			this.fetching[key] = true;
			try {
				await fn();
			} finally {
				this.fetching[key] = false;
				if (this.running && !this.destroyed) {
					this.timers[key] = setTimeout(tick, interval);
				}
			}
		};
		tick();
	}

	async _getJSON(url) {
		const r = await fetch(url, { headers: { accept: 'application/json' } });
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
		return r.json();
	}

	_markOk() {
		this.failStreak = 0;
		if (this.connected !== true) {
			this.connected = true;
			this.onConnection(true);
		}
	}

	_markFail() {
		this.failStreak += 1;
		// Only declare a real outage after repeated failures so a single blip
		// doesn't flicker the readout into an error state.
		if (this.failStreak >= 3 && this.connected !== false) {
			this.connected = false;
			this.onConnection(false);
		}
	}

	async _pollStats() {
		try {
			const data = await this._getJSON(STATS_URL);
			const t = data?.token || {};
			const stats = {
				price: t.price_usd != null ? Number(t.price_usd) : null,
				change24h: t.price_change_24h != null ? Number(t.price_change_24h) : null,
				volume24h: t.volume_24h != null ? Number(t.volume_24h) : null,
				holders: t.holders != null ? Number(t.holders) : null,
			};
			const prev = this.lastStats;
			this.lastStats = stats;
			this._markOk();
			this.onStats(stats, prev);
		} catch {
			this._markFail();
		}
	}

	async _pollTrades() {
		try {
			const data = await this._getJSON(TRADES_URL);
			const trades = Array.isArray(data?.trades) ? data.trades : [];
			this._markOk();
			// First successful fetch only seeds the seen-set — we don't want to
			// fire 20 ripples at once on page load. Subsequent fetches emit only
			// genuinely new trades.
			for (const tr of trades) {
				const id = tr.tx || tr.signature;
				if (!id || this.seenTrades.has(id)) continue;
				this.seenTrades.add(id);
				if (!this.tradesSeeded) continue;
				this.onTrade({
					isBuy: tr.is_buy === true,
					usd: tr.usd_amount != null ? Number(tr.usd_amount) : null,
					sol: tr.sol_amount != null ? Number(tr.sol_amount) : null,
				});
			}
			this.tradesSeeded = true;
			if (this.seenTrades.size > 600) {
				this.seenTrades = new Set(
					trades.map((t) => t.tx || t.signature).filter(Boolean),
				);
			}
		} catch {
			this._markFail();
		}
	}

	async _pollBurns() {
		try {
			const data = await this._getJSON(BURNS_URL);
			const burns = Array.isArray(data?.burns) ? data.burns : [];
			this._markOk();
			for (const b of burns) {
				const id = b.id != null ? String(b.id) : null;
				if (!id || this.seenBurns.has(id)) continue;
				this.seenBurns.add(id);
				if (!this.burnsSeeded) continue;
				this.onBurn({ amount: Number(b.amount) || 0, agent: b.agent_name });
			}
			this.burnsSeeded = true;
			if (this.seenBurns.size > 400) {
				this.seenBurns = new Set(burns.map((b) => String(b.id)).filter(Boolean));
			}
		} catch {
			this._markFail();
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Reactive Three.js scene — crystal + particle field + trade ripples + burns.
// ─────────────────────────────────────────────────────────────────────────────

class ReactiveScene {
	constructor(THREE, canvas) {
		this.THREE = THREE;
		this.canvas = canvas;

		const renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: !isMobile(),
			alpha: true,
			powerPreference: 'high-performance',
		});
		renderer.setClearColor(0x000000, 0);
		this.renderer = renderer;

		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
		this.camera.position.set(0, 0, 7.2);

		// Lighting — a cool key + warm rim so facets read with depth even before
		// the emissive glow kicks in.
		const key = new THREE.DirectionalLight(0xffffff, 1.6);
		key.position.set(3, 4, 5);
		this.scene.add(key);
		const rim = new THREE.DirectionalLight(0x88aaff, 0.7);
		rim.position.set(-4, -2, -3);
		this.scene.add(rim);
		this.scene.add(new THREE.AmbientLight(0x404050, 1.0));

		// Color targets for momentum tint (subtle — premium, not a disco ball).
		this.colWarm = new THREE.Color(0xfff0d8);
		this.colCool = new THREE.Color(0xcfe0ff);
		this.colNeutral = new THREE.Color(0xf2f4f8);

		this._buildCrystal();
		this._buildParticles();
		this._buildRipplePool();

		// Smoothed visual state — data sets targets, the render loop lerps toward.
		this.spin = 0.12;
		this.targetSpin = 0.12;
		this.glow = 0.35;
		this.targetGlow = 0.35;
		this.hue = 0; // -1 cool … +1 warm
		this.targetHue = 0;
		this.burnFlash = 0; // decays each frame
		this.crystalRot = { x: 0, y: 0 };

		this.disposed = false;
		this.running = false;
		this._lastT = 0;
		this._tick = this._tick.bind(this);

		this._ro = new ResizeObserver(() => this._resize());
		this._ro.observe(canvas);
		this._resize();
	}

	_buildCrystal() {
		const T = this.THREE;
		const geo = new T.IcosahedronGeometry(1.18, 0); // 0 detail = sharp facets
		const mat = new T.MeshStandardMaterial({
			color: 0xf2f4f8,
			emissive: 0x223044,
			emissiveIntensity: 0.4,
			metalness: 0.35,
			roughness: 0.18,
			flatShading: true,
			transparent: true,
			opacity: 0.92,
		});
		this.crystalMat = mat;
		this.crystal = new T.Mesh(geo, mat);
		this.scene.add(this.crystal);

		// Crisp facet edges over the shaded body — reads as a cut gem, not a blob.
		const edges = new T.EdgesGeometry(geo);
		this.edgeMat = new T.LineBasicMaterial({
			color: 0xffffff,
			transparent: true,
			opacity: 0.5,
		});
		this.crystalEdges = new T.LineSegments(edges, this.edgeMat);
		this.crystal.add(this.crystalEdges);

		// Additive halo sprite behind the crystal — the "energy" that brightens
		// with volume and flares on a burn. Generated, not loaded.
		const halo = this._radialSprite(0xbcdcff);
		halo.scale.set(7, 7, 1);
		halo.position.z = -1.2;
		this.haloMat = halo.material;
		this.scene.add(halo);
		this.halo = halo;
	}

	_radialSprite(color) {
		const T = this.THREE;
		const size = 128;
		const cnv = document.createElement('canvas');
		cnv.width = cnv.height = size;
		const ctx = cnv.getContext('2d');
		const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
		g.addColorStop(0, 'rgba(255,255,255,1)');
		g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
		g.addColorStop(1, 'rgba(255,255,255,0)');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, size, size);
		const tex = new T.CanvasTexture(cnv);
		tex.colorSpace = T.SRGBColorSpace;
		const mat = new T.SpriteMaterial({
			map: tex,
			color,
			transparent: true,
			opacity: 0.4,
			blending: T.AdditiveBlending,
			depthWrite: false,
		});
		return new T.Sprite(mat);
	}

	_buildParticles() {
		const T = this.THREE;
		const count = isMobile() ? 1100 : 2600;
		const positions = new Float32Array(count * 3);
		const phases = new Float32Array(count);
		for (let i = 0; i < count; i++) {
			// Spherical shell around the crystal so particles fill the stage and
			// frame the avatar rather than clumping at the centre.
			const r = 2.3 + Math.pow(Math.random(), 0.6) * 3.4;
			const theta = Math.random() * Math.PI * 2;
			const phi = Math.acos(2 * Math.random() - 1);
			positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
			positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.8;
			positions[i * 3 + 2] = r * Math.cos(phi);
			phases[i] = Math.random() * Math.PI * 2;
		}
		const geo = new T.BufferGeometry();
		geo.setAttribute('position', new T.BufferAttribute(positions, 3));
		this._particlePhases = phases;
		this._particleBase = positions.slice();

		const mat = new T.PointsMaterial({
			color: 0x9fb4d8,
			size: isMobile() ? 0.045 : 0.038,
			sizeAttenuation: true,
			transparent: true,
			opacity: 0.5,
			blending: T.AdditiveBlending,
			depthWrite: false,
		});
		this.particleMat = mat;
		this.particles = new T.Points(geo, mat);
		this.scene.add(this.particles);
	}

	_buildRipplePool() {
		const T = this.THREE;
		this.ripples = [];
		for (let i = 0; i < 14; i++) {
			const geo = new T.RingGeometry(1, 1.06, 48);
			const mat = new T.MeshBasicMaterial({
				color: 0xffffff,
				transparent: true,
				opacity: 0,
				side: T.DoubleSide,
				blending: T.AdditiveBlending,
				depthWrite: false,
			});
			const mesh = new T.Mesh(geo, mat);
			mesh.visible = false;
			this.scene.add(mesh);
			this.ripples.push({ mesh, mat, active: false, age: 0, life: 1, scale: 1, speed: 1 });
		}
	}

	// ── Data → visuals ────────────────────────────────────────────────────────

	applyStats(stats) {
		if (!stats) return;
		// Momentum → spin + tint. Normalise 24h change into a -1…1 band.
		const m = stats.change24h != null ? clamp(stats.change24h / 15, -1, 1) : 0;
		this.targetSpin = 0.1 + Math.abs(m) * 0.55 + (m > 0 ? m * 0.25 : 0);
		this.targetHue = m;

		// Volume → glow/brightness. Log scale so it's responsive across orders of
		// magnitude without a tiny float pinning it to zero.
		if (stats.volume24h != null && stats.volume24h > 0) {
			const v = clamp(Math.log10(stats.volume24h + 1) / 6.2, 0, 1);
			this.targetGlow = 0.3 + v * 0.85;
		}
	}

	pulseTrade(trade) {
		const T = this.THREE;
		const slot = this.ripples.find((r) => !r.active) || this.ripples[0];
		const usd = trade.usd != null && trade.usd > 0 ? trade.usd : 0;
		// Bigger trades throw bigger, brighter rings.
		const mag = usd > 0 ? clamp(Math.log10(usd + 1) / 3, 0.3, 1) : 0.45;
		slot.active = true;
		slot.age = 0;
		slot.life = 1.4 + mag * 0.6;
		slot.scale = 1;
		slot.endScale = 2.4 + mag * 3.2;
		slot.speed = 1;
		slot.mesh.visible = true;
		slot.mesh.scale.setScalar(0.6);
		slot.mesh.rotation.set(0, 0, Math.random() * Math.PI);
		slot.mat.color.set(trade.isBuy ? 0x2ecc71 : 0xff5c5c);
		slot.startOpacity = 0.55 + mag * 0.35;
		// A buy nudges the crystal brighter, a sell dims it momentarily.
		this.targetGlow = clamp(this.targetGlow + (trade.isBuy ? 0.08 : -0.05), 0.3, 1.3);
	}

	flashBurn() {
		// Warm flare: spike the halo + crystal emissive and warm the particles for
		// a beat. burnFlash decays in the render loop.
		this.burnFlash = 1;
		// A burn ring in $THREE's burn-orange.
		const slot = this.ripples.find((r) => !r.active) || this.ripples[0];
		slot.active = true;
		slot.age = 0;
		slot.life = 2.2;
		slot.scale = 1;
		slot.endScale = 6.5;
		slot.mesh.visible = true;
		slot.mesh.scale.setScalar(0.5);
		slot.mat.color.set(0xff8a2b);
		slot.startOpacity = 0.85;
	}

	// ── Loop ────────────────────────────────────────────────────────────────

	start() {
		if (this.running || this.disposed) return;
		this.running = true;
		this._lastT = 0;
		this._raf = requestAnimationFrame(this._tick);
	}

	pause() {
		this.running = false;
		if (this._raf) cancelAnimationFrame(this._raf);
		this._raf = null;
	}

	_tick(now) {
		if (this.disposed) return;
		this._raf = requestAnimationFrame(this._tick);
		const t = now / 1000;
		let dt = this._lastT ? t - this._lastT : 0.016;
		this._lastT = t;
		dt = Math.min(dt, 0.05); // clamp after a tab-switch so nothing jumps

		// Ease visual state toward data-driven targets.
		this.spin = lerp(this.spin, this.targetSpin, 1 - Math.pow(0.001, dt));
		this.glow = lerp(this.glow, this.targetGlow, 1 - Math.pow(0.01, dt));
		this.hue = lerp(this.hue, this.targetHue, 1 - Math.pow(0.05, dt));
		this.burnFlash = Math.max(0, this.burnFlash - dt * 1.6);

		// Crystal spin + gentle wobble + market "breathing".
		this.crystalRot.y += dt * this.spin;
		this.crystalRot.x += dt * this.spin * 0.35;
		this.crystal.rotation.set(this.crystalRot.x, this.crystalRot.y, 0);
		const breathe = 1 + Math.sin(t * 0.9) * 0.025;
		this.crystal.scale.setScalar(breathe * (1 + this.burnFlash * 0.18));

		// Momentum tint blends neutral→warm/cool.
		const tint = this.colNeutral.clone();
		if (this.hue > 0) tint.lerp(this.colWarm, this.hue);
		else if (this.hue < 0) tint.lerp(this.colCool, -this.hue);
		this.crystalMat.color.copy(tint);
		this.crystalMat.emissiveIntensity = 0.35 + this.glow * 0.9 + this.burnFlash * 1.5;
		if (this.burnFlash > 0) {
			this.crystalMat.emissive.setRGB(
				0.13 + this.burnFlash * 0.7,
				0.18 + this.burnFlash * 0.35,
				0.27,
			);
		} else {
			this.crystalMat.emissive.setHex(0x223044);
		}
		this.edgeMat.opacity = 0.4 + this.glow * 0.35;

		// Halo brightness from glow + burn flare.
		this.haloMat.opacity = 0.22 + this.glow * 0.3 + this.burnFlash * 0.5;
		const haloScale = 6.4 + this.glow * 1.4 + this.burnFlash * 3;
		this.halo.scale.set(haloScale, haloScale, 1);
		if (this.burnFlash > 0.01) this.haloMat.color.setRGB(1, 0.6 + 0.2, 0.35);
		else this.haloMat.color.setHex(0xbcdcff);

		// Particle field: slow counter-rotation, subtle breathing, brightness from
		// volume; warmed during a burn.
		this.particles.rotation.y += dt * (0.04 + this.spin * 0.15);
		this.particles.rotation.x = Math.sin(t * 0.1) * 0.08;
		this.particleMat.opacity = 0.32 + this.glow * 0.4;
		this.particleMat.size = (isMobile() ? 0.045 : 0.038) * (1 + this.glow * 0.4);
		if (this.burnFlash > 0.01) this.particleMat.color.setRGB(1, 0.72, 0.45);
		else this.particleMat.color.setHex(0x9fb4d8);

		this._updateRipples(dt);
		this.renderer.render(this.scene, this.camera);
	}

	_updateRipples(dt) {
		for (const r of this.ripples) {
			if (!r.active) continue;
			r.age += dt;
			const p = r.age / r.life;
			if (p >= 1) {
				r.active = false;
				r.mesh.visible = false;
				r.mat.opacity = 0;
				continue;
			}
			// Ease-out expansion, opacity fades on a curve.
			const e = 1 - Math.pow(1 - p, 2);
			const s = lerp(0.6, r.endScale, e);
			r.mesh.scale.setScalar(s);
			r.mat.opacity = (r.startOpacity || 0.6) * (1 - p) * (1 - p);
		}
	}

	_resize() {
		const w = this.canvas.clientWidth;
		const h = this.canvas.clientHeight;
		if (!w || !h) return;
		const dpr = Math.min(window.devicePixelRatio || 1, isMobile() ? 1.5 : 2);
		this.renderer.setPixelRatio(dpr);
		this.renderer.setSize(w, h, false);
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
	}

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.pause();
		this._ro?.disconnect();
		this.scene.traverse((o) => {
			o.geometry?.dispose?.();
			const m = o.material;
			if (Array.isArray(m)) m.forEach((x) => x.dispose?.());
			else m?.dispose?.();
			o.material?.map?.dispose?.();
		});
		this.renderer.dispose();
		this.renderer.forceContextLoss?.();
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Live data overlay — the small, elegant readout anchored to the hero.
// ─────────────────────────────────────────────────────────────────────────────

class DataOverlay {
	constructor(root) {
		this.root = root;
		this.el = {
			price: root.querySelector('[data-rhero="price"]'),
			change: root.querySelector('[data-rhero="change"]'),
			holders: root.querySelector('[data-rhero="holders"]'),
			status: root.querySelector('[data-rhero="status"]'),
		};
	}

	setStats(stats) {
		this.root.removeAttribute('data-loading');
		if (this.el.price) this.el.price.textContent = fmtPrice(stats.price);
		if (this.el.holders) this.el.holders.textContent = fmtCount(stats.holders);
		if (this.el.change) {
			const c = stats.change24h;
			if (c == null || !isFinite(c)) {
				this.el.change.textContent = '—';
				this.el.change.dataset.dir = 'flat';
			} else {
				const up = c >= 0;
				this.el.change.textContent = `${up ? '+' : ''}${c.toFixed(2)}%`;
				this.el.change.dataset.dir = up ? 'up' : 'down';
			}
		}
	}

	setConnection(ok) {
		if (!this.el.status) return;
		this.root.dataset.connection = ok ? 'live' : 'reconnecting';
		this.el.status.textContent = ok ? 'Live' : 'Reconnecting…';
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {Object} opts
 * @param {HTMLElement} opts.stage   The hero-stage container (drives in-view loading).
 * @param {HTMLCanvasElement} opts.canvas  The reactive canvas (behind the avatar).
 * @param {HTMLElement} opts.overlay  The live data readout element.
 */
export function initReactiveHero({ stage, canvas, overlay }) {
	if (!stage || !overlay) return null;

	const data = new DataOverlay(overlay);
	const reduced = prefersReducedMotion();

	let scene = null;
	let booted = false;
	let booting = false;

	const feed = new MarketFeed({
		onStats: (stats) => {
			data.setStats(stats);
			scene?.applyStats(stats);
		},
		onTrade: (trade) => scene?.pulseTrade(trade),
		onBurn: () => scene?.flashBurn(),
		onConnection: (ok) => data.setConnection(ok),
	});

	async function bootScene() {
		if (booted || booting || reduced || !canvas) return;
		booting = true;
		try {
			const THREE = await import('three');
			if (destroyed) return;
			scene = new ReactiveScene(THREE, canvas);
			// Re-apply the latest stats so the scene opens already tuned to the market.
			if (feed.lastStats) scene.applyStats(feed.lastStats);
			scene.start();
			booted = true;
			canvas.classList.add('rhero-canvas--ready');
		} catch (e) {
			// Three failed to load (offline, blocked) — the static gradient stage and
			// the live readout still stand on their own. Don't crash the page.
			console.warn('[reactive-hero] scene unavailable', e);
		} finally {
			booting = false;
		}
	}

	let destroyed = false;
	let visible = false;

	// Lazy: only spin up Three + the data loop once the hero is actually on screen.
	const io = new IntersectionObserver(
		(entries) => {
			const onScreen = entries.some((e) => e.isIntersecting);
			if (onScreen === visible) return;
			visible = onScreen;
			if (onScreen) {
				feed.start();
				bootScene();
				scene?.start();
			} else {
				feed.stop();
				scene?.pause();
			}
		},
		{ rootMargin: '120px' },
	);
	io.observe(stage);

	// Honour tab visibility too — no point rendering/polling a hidden tab.
	const onVis = () => {
		if (document.hidden) {
			feed.stop();
			scene?.pause();
		} else if (visible) {
			feed.start();
			scene?.start();
		}
	};
	document.addEventListener('visibilitychange', onVis);

	function destroy() {
		if (destroyed) return;
		destroyed = true;
		io.disconnect();
		document.removeEventListener('visibilitychange', onVis);
		feed.destroy();
		scene?.dispose();
	}
	window.addEventListener('pagehide', destroy, { once: true });

	if (reduced) stage.dataset.rheroReduced = 'true';

	return { destroy };
}
