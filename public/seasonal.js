/* three.ws seasonal decorations — self-contained and date-gated.
 *
 * Include with `<script src="/seasonal.js" defer></script>` on any page.
 * Outside its active window the script is a no-op, so it can stay wired
 * year-round and retire itself automatically.
 *
 * Currently: Independence Day (July 1–5, viewer's local time).
 *  - a soft red/white/blue ribbon glow across the very top of the viewport
 *  - real launch-and-burst fireworks on a lightweight canvas confined to the
 *    page's `.hero`. Rockets rise, then explode in a strictly red/white/blue
 *    palette. Every rocket picks a random effect (peony, ring, willow,
 *    chrysanthemum, crackle, or comet), a random size, and a random color
 *    scheme, so no two bursts look alike. The streaky trails come from the
 *    canvas's own fading afterglow — natural motion blur, not drawn lines,
 *    which reads far more like a real firework than radial spokes.
 *  - user-launched fireworks: clicking open hero space fires a rocket that
 *    bursts right where you clicked, and a "🎆 Fireworks" chip injected into
 *    the hero's animation-chip row fires a staggered volley. The chip is a
 *    real button (keyboard + screen-reader reachable) and retires itself with
 *    the rest of the decorations, so no dead control ships out of season.
 *
 * Every passive layer is aria-hidden, pointer-events:none, and theme-aware.
 * Fireworks are skipped entirely for visitors who prefer reduced motion (the
 * ribbon still shows), and the animation pauses whenever the tab is hidden.
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

	// Strictly red / white / blue. Theme-aware so it reads on light or dark.
	// On a light backdrop we draw normally (source-over); on dark we add light
	// (lighter) so overlapping sparks glow. Colors re-read on a theme flip.
	function colors() {
		const light = document.documentElement.getAttribute('data-theme') === 'light';
		return light
			? { red: ['#c62828', '#e14b4b'], white: ['#7c86c4', '#9aa3d6'], blue: ['#2740b8', '#3f5ad6'], comp: 'source-over' }
			: { red: ['#ff3b3b', '#ff6b6e'], white: ['#ffffff', '#eaeeff'], blue: ['#4d6bff', '#8aa2ff'], comp: 'lighter' };
	}
	let C = colors();
	const themeObserver = new MutationObserver(() => { C = colors(); });
	themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

	// A color scheme is a weighted bag of channels; each spark draws one.
	const SCHEMES = [
		['red', 'white', 'blue'],           // full patriotic mix
		['red', 'red', 'white'],            // red-forward with white sparkle
		['blue', 'blue', 'white'],          // blue-forward with white sparkle
		['white', 'white', 'red', 'blue'],  // silver shell, colored flecks
		['red', 'white', 'blue', 'blue'],
	];
	const rand = (a, b) => a + Math.random() * (b - a);
	const pick = (arr) => arr[(Math.random() * arr.length) | 0];
	function channelColor(ch) { const pair = C[ch] || C.white; return pair[(Math.random() * pair.length) | 0]; }

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
	const MAX_SPARKS = 900;
	const MAX_ROCKETS = 16;

	// Ambient launches pick their own spot; user launches pass an aim point and
	// the rocket's velocity is solved so its apex (the burst) lands there.
	function launch(aimX, aimY) {
		if (W === 0 || H === 0) return;
		if (rockets.length >= MAX_ROCKETS) return;
		const targetY = aimY != null ? aimY : H * rand(0.10, 0.46);
		const x = aimX != null ? aimX + rand(-8, 8) : W * rand(0.12, 0.88);
		const g = 0.05;
		rockets.push({
			x, y: H + 4,
			vx: rand(-0.25, 0.25),
			// Aimed rockets get far less overshoot so the burst stays on the click.
			vy: -(Math.sqrt(2 * g * (H - targetY)) + (aimY != null ? rand(0.05, 0.2) : rand(0.3, 0.9))),
			g,
			color: channelColor(pick(['red', 'white', 'blue'])),
			trail: [],
		});
	}

	// Effect presets. `size` is a per-firework multiplier that adds variety and
	// makes some bursts noticeably bigger. Sparks are round dots; their streaks
	// come from the global afterglow fade, so no effect draws long lines.
	function burst(x, y) {
		const effect = pick(['peony', 'ring', 'willow', 'chrysanthemum', 'crackle', 'comet']);
		const scheme = pick(SCHEMES);
		const size = rand(0.85, 1.8);
		const emit = (opts) => {
			sparks.push(Object.assign({
				x, y, life: 1, twinkle: false, drag: 0.985, g: 0.05,
				color: channelColor(pick(scheme)),
			}, opts));
		};

		if (effect === 'ring') {
			const n = 44 + ((Math.random() * 26) | 0);
			const spd = rand(3.2, 4.6) * size;
			for (let i = 0; i < n; i++) {
				const a = (Math.PI * 2 * i) / n;
				const s = spd * rand(0.94, 1.06);
				emit({ vx: Math.cos(a) * s, vy: Math.sin(a) * s, decay: rand(0.012, 0.018), r: rand(1.4, 2.4), g: 0.03, drag: 0.985 });
			}
		} else if (effect === 'willow') {
			// Slow, long-lived, heavy — droops under gravity and lingers, so the
			// afterglow paints soft drooping streaks without any drawn lines.
			const n = 36 + ((Math.random() * 26) | 0);
			const spd = rand(2.2, 3.2) * size;
			for (let i = 0; i < n; i++) {
				const a = Math.random() * Math.PI * 2;
				const s = spd * rand(0.5, 1);
				emit({ vx: Math.cos(a) * s, vy: Math.sin(a) * s, decay: rand(0.006, 0.010), r: rand(1.6, 2.4), g: 0.09, drag: 0.975 });
			}
		} else if (effect === 'chrysanthemum') {
			const n = 60 + ((Math.random() * 46) | 0);
			const spd = rand(3, 4.6) * size;
			for (let i = 0; i < n; i++) {
				const a = Math.random() * Math.PI * 2;
				const s = spd * Math.sqrt(rand(0.15, 1));
				emit({ vx: Math.cos(a) * s, vy: Math.sin(a) * s, decay: rand(0.010, 0.016), r: rand(1.4, 2.3), g: 0.05, drag: 0.982 });
			}
		} else if (effect === 'crackle') {
			const n = 55 + ((Math.random() * 45) | 0);
			const spd = rand(2.4, 4.4) * size;
			for (let i = 0; i < n; i++) {
				const a = Math.random() * Math.PI * 2;
				const s = spd * rand(0.3, 1);
				emit({ vx: Math.cos(a) * s, vy: Math.sin(a) * s, decay: rand(0.016, 0.028), r: rand(1.2, 2), g: 0.05, drag: 0.98, twinkle: true });
			}
		} else if (effect === 'comet') {
			// A few fast, fading sparks in random directions — short bright darts
			// whose afterglow gives a clean comet streak, no fake rod.
			const n = 10 + ((Math.random() * 8) | 0);
			const spd = rand(3.4, 5) * size;
			for (let i = 0; i < n; i++) {
				const a = Math.random() * Math.PI * 2;
				const s = spd * rand(0.7, 1);
				emit({ vx: Math.cos(a) * s, vy: Math.sin(a) * s, decay: rand(0.012, 0.02), r: rand(1.8, 2.8), g: 0.06, drag: 0.97 });
			}
		} else { // peony — classic round burst
			const n = 50 + ((Math.random() * 44) | 0);
			const spd = rand(2.8, 4.8) * size;
			for (let i = 0; i < n; i++) {
				const a = Math.random() * Math.PI * 2;
				const s = spd * Math.sqrt(rand(0.1, 1));
				emit({ vx: Math.cos(a) * s, vy: Math.sin(a) * s, decay: rand(0.012, 0.018), r: rand(1.5, 2.7), g: 0.048, drag: 0.984 });
			}
		}

		if (sparks.length > MAX_SPARKS) sparks.splice(0, sparks.length - MAX_SPARKS);
	}

	// ── User-launched fireworks ─────────────────────────────────────
	// Click (or tap) open hero space and a rocket bursts where you clicked.
	// Interactive elements keep their jobs, and a camera drag on the 3D stage
	// ends in a click event too — a small movement threshold filters those out.
	const INTERACTIVE = 'a, button, input, select, textarea, lang-switcher, [role="button"]';
	let downX = 0, downY = 0;
	hero.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; }, { passive: true });
	hero.addEventListener('click', (e) => {
		if (e.target.closest(INTERACTIVE)) return;
		if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return; // was a drag
		const rect = hero.getBoundingClientRect();
		const x = Math.min(Math.max(e.clientX - rect.left, 8), W - 8);
		const y = Math.min(Math.max(e.clientY - rect.top, H * 0.06), H * 0.8);
		launch(x, y);
		sinceLaunch = 0; // the user just fired — hold the ambient schedule back
	});

	// A short staggered volley for the chip — real timers driving real rockets.
	function volley() {
		const n = 5 + ((Math.random() * 3) | 0);
		for (let i = 0; i < n; i++) setTimeout(() => launch(), i * (130 + Math.random() * 120));
		sinceLaunch = 0;
	}

	// Inject a "🎆 Fireworks" chip into the hero's animation-chip row so the
	// feature is discoverable and keyboard-reachable. It carries no data-anim,
	// so the page's avatar-animation chip handler ignores it, and because it is
	// only created inside the seasonal window it never ships as a dead button.
	const chipRow = document.getElementById('hero-chips');
	if (chipRow) {
		style.textContent += `
			.hero-chip--fireworks {
				border-color: color-mix(in srgb, var(--fw-blue) 55%, transparent);
			}
			.hero-chip--fireworks:hover, .hero-chip--fireworks:focus-visible {
				border-color: var(--fw-red);
				color: var(--fw-mid);
			}
		`;
		const chip = document.createElement('button');
		chip.type = 'button';
		chip.className = 'hero-chip hero-chip--fireworks';
		chip.setAttribute('aria-label', 'Light off a volley of fireworks');
		chip.textContent = '🎆 Fireworks';
		chip.addEventListener('click', volley);
		chipRow.prepend(chip);
	}

	let raf = 0;
	let sinceLaunch = 0;
	let nextGap = 36; // frames until first rocket
	let running = false;

	function frame() {
		if (!running) return;
		raf = requestAnimationFrame(frame);

		// Sparks aren't cleared each frame — the canvas fades a little instead,
		// leaving a short glowing tail behind every moving dot. This afterglow
		// IS the firework streak; a gentler fade means longer, softer tails.
		ctx.globalCompositeOperation = 'destination-out';
		ctx.fillStyle = 'rgba(0,0,0,0.15)';
		ctx.fillRect(0, 0, W, H);
		ctx.globalCompositeOperation = C.comp;

		if (++sinceLaunch >= nextGap) {
			sinceLaunch = 0;
			nextGap = 100 + ((Math.random() * 150) | 0); // ~1.7–4.2s at 60fps
			launch();
			if (Math.random() < 0.35) launch();          // occasional double
			if (Math.random() < 0.12) launch();          // rare triple
		}

		for (let i = rockets.length - 1; i >= 0; i--) {
			const r = rockets[i];
			r.x += r.vx;
			r.y += r.vy;
			r.vy += r.g;
			r.trail.push({ x: r.x, y: r.y });
			if (r.trail.length > 6) r.trail.shift();

			ctx.beginPath();
			for (let t = 0; t < r.trail.length; t++) {
				const p = r.trail[t];
				if (t === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
			}
			ctx.strokeStyle = r.color;
			ctx.globalAlpha = 0.6;
			ctx.lineWidth = 1.8;
			ctx.stroke();
			ctx.globalAlpha = 1;

			if (r.vy >= -0.4) { // apex reached — explode
				burst(r.x, r.y);
				rockets.splice(i, 1);
			}
		}

		for (let i = sparks.length - 1; i >= 0; i--) {
			const s = sparks[i];
			s.x += s.vx;
			s.y += s.vy;
			s.vy += s.g;
			s.vx *= s.drag;
			s.vy *= s.drag;
			s.life -= s.decay;
			if (s.life <= 0) { sparks.splice(i, 1); continue; }

			let alpha = s.life;
			if (s.twinkle) alpha *= Math.random() < 0.5 ? 0.15 : 1;

			ctx.globalAlpha = Math.max(0, alpha);
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
		sinceLaunch = 0; nextGap = 36;
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
