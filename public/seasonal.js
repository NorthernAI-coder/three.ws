/* three.ws seasonal decorations — self-contained and date-gated.
 *
 * Include with `<script src="/seasonal.js" defer></script>` on any page.
 * Outside its active window the script is a no-op, so it can stay wired
 * year-round and retire itself automatically.
 *
 * Currently: Independence Day (July 1–5, viewer's local time).
 *  - a faint red/white/blue hairline across the very top of the viewport
 *  - sparse, tiny firework bursts inside the page's `.hero` (skipped when
 *    the visitor prefers reduced motion, or when no hero exists)
 * Both layers are aria-hidden, pointer-events:none, and theme-aware.
 */
(() => {
	const now = new Date();
	if (now.getMonth() !== 6 || now.getDate() > 5) return; // July 1–5 only
	if (document.getElementById('seasonal-hairline')) return;

	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	const style = document.createElement('style');
	style.textContent = `
		:root {
			--fw-red:  #ff6b6e;
			--fw-mid:  #f0f2ff;
			--fw-blue: #7a97ff;
		}
		:root[data-theme='light'] {
			--fw-red:  #d4373c;
			--fw-mid:  #7583c9;
			--fw-blue: #3452c7;
		}
		#seasonal-hairline {
			position: fixed; top: 0; left: 0; right: 0; height: 2px;
			z-index: 120; pointer-events: none;
			background: linear-gradient(90deg,
				transparent, var(--fw-red) 18%, var(--fw-red) 34%,
				var(--fw-mid) 46%, var(--fw-mid) 54%,
				var(--fw-blue) 66%, var(--fw-blue) 82%, transparent);
			opacity: .5;
		}
		.seasonal-fireworks {
			position: absolute; inset: 0; overflow: hidden;
			pointer-events: none; z-index: 0;
		}
		.seasonal-fw {
			position: absolute; width: 0; height: 0;
		}
		.seasonal-fw i {
			position: absolute; left: -1.5px; top: -1.5px;
			width: 3px; height: 3px; border-radius: 50%;
			background: var(--fw-c, var(--fw-mid));
			opacity: 0;
			animation: seasonal-burst var(--fw-cycle, 12s) ease-out infinite;
			animation-delay: var(--fw-delay, 0s);
		}
		@keyframes seasonal-burst {
			0%   { opacity: 0;   transform: rotate(var(--fw-a)) translateY(0) scale(1); }
			1%   { opacity: .55; }
			9%   { opacity: .3;  transform: rotate(var(--fw-a)) translateY(var(--fw-r)) scale(.9); }
			14%  { opacity: 0;   transform: rotate(var(--fw-a)) translateY(calc(var(--fw-r) + 14px)) scale(.4); }
			100% { opacity: 0;   transform: rotate(var(--fw-a)) translateY(calc(var(--fw-r) + 14px)) scale(.4); }
		}
	`;
	document.head.appendChild(style);

	const hairline = document.createElement('div');
	hairline.id = 'seasonal-hairline';
	hairline.setAttribute('aria-hidden', 'true');
	document.body.appendChild(hairline);

	if (reducedMotion) return;
	const hero = document.querySelector('.hero');
	if (!hero) return;

	const layer = document.createElement('div');
	layer.className = 'seasonal-fireworks';
	layer.setAttribute('aria-hidden', 'true');

	const colors = ['var(--fw-red)', 'var(--fw-mid)', 'var(--fw-blue)'];
	// Sparse: three burst sites in the hero's upper band, on offset cycles so
	// at most one is usually lighting up at a time.
	const sites = [
		{ x: '16%', y: '18%', r: 52, cycle: 13, delay: 1.5 },
		{ x: '78%', y: '12%', r: 64, cycle: 17, delay: 7 },
		{ x: '55%', y: '30%', r: 44, cycle: 15, delay: 12 },
	];
	for (const [i, site] of sites.entries()) {
		const fw = document.createElement('div');
		fw.className = 'seasonal-fw';
		fw.style.left = site.x;
		fw.style.top = site.y;
		fw.style.setProperty('--fw-cycle', site.cycle + 's');
		const spokes = 10;
		for (let s = 0; s < spokes; s++) {
			const p = document.createElement('i');
			p.style.setProperty('--fw-a', (s * (360 / spokes) + i * 12) + 'deg');
			p.style.setProperty('--fw-r', site.r + (s % 3) * 9 + 'px');
			p.style.setProperty('--fw-delay', site.delay + (s % 4) * 0.05 + 's');
			p.style.setProperty('--fw-c', colors[s % colors.length]);
			fw.appendChild(p);
		}
		layer.appendChild(fw);
	}

	// Appended last so the dots aren't buried behind the stage's opaque
	// backdrop; they're faint, tiny, and pointer-transparent, so painting
	// over hero content reads as fireworks in the scene, not clutter.
	if (getComputedStyle(hero).position === 'static') hero.style.position = 'relative';
	hero.appendChild(layer);
})();
