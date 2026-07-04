/* three.ws seasonal decorations — self-contained and date-gated.
 *
 * Include with `<script src="/seasonal.js" defer></script>` on any page.
 * Outside its active window the script is a no-op, so it can stay wired
 * year-round and retire itself automatically.
 *
 * Currently: Independence Day (July 1–5, viewer's local time).
 *  - a soft red/white/blue ribbon glow across the very top of the viewport
 *  - real launch-and-burst fireworks on a lightweight canvas confined to the
 *    page's `.hero` — rockets rise with a trail, then explode into a patriotic
 *    shower that falls and fades. Sparse by design (one rocket every few
 *    seconds) so it reads as celebratory, not busy.
 *
 * Every layer is aria-hidden, pointer-events:none, and theme-aware. Fireworks
 * are skipped entirely for visitors who prefer reduced motion (the ribbon
 * still shows), and the animation pauses whenever the tab is hidden.
 */
(() => {
	const now = new Date();
	if (now.getMonth() !== 6 || now.getDate() > 5) return; // July 1–5 only
	if (document.getElementById('seasonal-ribbon')) return;

	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	const style = document.createElement('style');
	style.textContent = `
		:root {
			--fw-red:  #ff5a5f;
			--fw-mid:  #f4f6ff;
			--fw-blue: #6f8cff;
		}
		:root[data-theme='light'] {
			--fw-red:  #d4373c;
			--fw-mid:  #8b97d8;
			--fw-blue: #3452c7;
		}
		#seasonal-ribbon {
			position: fixed; top: 0; left: 0; right: 0; height: 3px;
			z-index: 120; pointer-events: none;
			background: linear-gradient(90deg,
				transparent, var(--fw-red) 16%, var(--fw-red) 32%,
				var(--fw-mid) 46%, var(--fw-mid) 54%,
				var(--fw-blue) 68%, var(--fw-blue) 84%, transparent);
			opacity: .62;
		}
		#seasonal-ribbon::after {
			content: ''; position: absolute; inset: -14px 0 auto 0; height: 40px;
			background: linear-gradient(90deg,
				transparent, color-mix(in srgb, var(--fw-red) 40%, transparent) 24%,
				color-mix(in srgb, var(--fw-mid) 40%, transparent) 50%,
				color-mix(in srgb, var(--fw-blue) 40%, transparent) 76%, transparent);
			filter: blur(10px); opacity: .5;
		}
		.seasonal-fireworks {
			position: absolute; inset: 0; overflow: hidden;
			pointer-events: none; z-index: 1;
		}
		.seasonal-fireworks canvas { width: 100%; height: 100%; display: block; }
	`;
	document.head.appendChild(style);

	const ribbon = document.createElement('div');
	ribbon.id = 'seasonal-ribbon';
	ribbon.setAttribute('aria-hidden', 'true');
	document.body.appendChild(ribbon);

	if (reducedMotion) return;
	const hero = document.querySelector('.hero');
	if (!hero) return;

	const layer = document.createElement('div');
	layer.className = 'seasonal-fireworks';
	layer.setAttribute('aria-hidden', 'true');
	const canvas = document.createElement('canvas');
	layer.appendChild(canvas);
	if (getComputedStyle(hero).position === 'static') hero.style.position = 'relative';
	hero.appendChild(layer);

	const ctx = canvas.getContext('2d');

	// Patriotic palette, theme-aware. Read once; re-read on theme flip.
	const PALETTES = {
		dark:  ['#ff5a5f', '#f4f6ff', '#6f8cff', '#ffd166'],
		light: ['#d4373c', '#e6ecff', '#3452c7', '#e0a53b'],
	};
	let palette = PALETTES[document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'];
	const themeObserver = new MutationObserver(() => {
		palette = PALETTES[document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'];
	});
	themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

	let dpr = Math.min(window.devicePixelRatio || 1, 2);
	let W = 0, H = 0;
	function resize() {
		W = hero.clientWidth; H = hero.clientHeight;
		dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = Math.max(1, Math.round(W * dpr));
		canvas.height = Math.max(1, Math.round(H * dpr));
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	}
	resize();
	const ro = new ResizeObserver(resize);
	ro.observe(hero);

	const rockets = [];   // rising trails
	const sparks = [];    // exploded particles
	const GRAVITY = 0.05;
	const MAX_SPARKS = 320;

	function launch() {
		if (W === 0 || H === 0) return;
		const targetY = H * (0.16 + Math.random() * 0.34);
		const x = W * (0.16 + Math.random() * 0.68);
		rockets.push({
			x, y: H + 4,
			vy: -(Math.sqrt(2 * GRAVITY * (H - targetY)) + 0.6),
			color: palette[(Math.random() * palette.length) | 0],
			trail: [],
		});
	}

	function burst(x, y, color) {
		const count = 26 + ((Math.random() * 16) | 0);
		const speed = 1.6 + Math.random() * 1.1;
		for (let i = 0; i < count; i++) {
			const a = (Math.PI * 2 * i) / count + Math.random() * 0.16;
			const s = speed * (0.55 + Math.random() * 0.6);
			// Mostly the rocket's color, with a few white/gold accents for pop.
			const c = Math.random() < 0.22 ? palette[(Math.random() * palette.length) | 0] : color;
			sparks.push({
				x, y,
				vx: Math.cos(a) * s,
				vy: Math.sin(a) * s,
				life: 1, decay: 0.012 + Math.random() * 0.012,
				color: c, r: 1.4 + Math.random() * 1.1,
			});
		}
		if (sparks.length > MAX_SPARKS) sparks.splice(0, sparks.length - MAX_SPARKS);
	}

	let raf = 0;
	let sinceLaunch = 0;
	let nextGap = 40; // frames until first rocket
	let running = false;

	function frame() {
		if (!running) return;
		raf = requestAnimationFrame(frame);

		// Trails fade rather than hard-clear, for a soft afterglow.
		ctx.globalCompositeOperation = 'destination-out';
		ctx.fillStyle = 'rgba(0,0,0,0.22)';
		ctx.fillRect(0, 0, W, H);
		ctx.globalCompositeOperation = 'lighter';

		if (++sinceLaunch >= nextGap) {
			sinceLaunch = 0;
			nextGap = 150 + ((Math.random() * 130) | 0); // ~2.5–4.6s at 60fps
			launch();
			if (Math.random() < 0.28) launch(); // occasional double
		}

		for (let i = rockets.length - 1; i >= 0; i--) {
			const r = rockets[i];
			r.x += (r.vx || 0);
			r.y += r.vy;
			r.vy += GRAVITY;
			r.trail.push({ x: r.x, y: r.y });
			if (r.trail.length > 8) r.trail.shift();

			ctx.beginPath();
			for (let t = 0; t < r.trail.length; t++) {
				const p = r.trail[t];
				if (t === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
			}
			ctx.strokeStyle = r.color;
			ctx.globalAlpha = 0.7;
			ctx.lineWidth = 1.6;
			ctx.stroke();
			ctx.globalAlpha = 1;

			if (r.vy >= -0.4) { // apex reached — explode
				burst(r.x, r.y, r.color);
				rockets.splice(i, 1);
			}
		}

		for (let i = sparks.length - 1; i >= 0; i--) {
			const s = sparks[i];
			s.x += s.vx;
			s.y += s.vy;
			s.vy += GRAVITY;
			s.vx *= 0.985;
			s.life -= s.decay;
			if (s.life <= 0) { sparks.splice(i, 1); continue; }
			ctx.globalAlpha = Math.max(0, s.life);
			ctx.fillStyle = s.color;
			ctx.beginPath();
			ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalAlpha = 1;
	}

	function start() {
		if (running) return;
		running = true;
		sinceLaunch = 0; nextGap = 40;
		raf = requestAnimationFrame(frame);
	}
	function stop() {
		running = false;
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
	}

	document.addEventListener('visibilitychange', () => {
		if (document.hidden) stop(); else start();
	});
	if (!document.hidden) start();
})();
