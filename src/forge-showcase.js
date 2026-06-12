// Forge community showcase — "Fresh from the Forge".
//
// Renders the newest finished models across all Forge users into the
// #showcase section on /forge (GET /api/forge-gallery?scope=community).
// Two affordances per card:
//   • click the card  → opens the model in the page's main viewer via the
//     `forge:open-creation` hook in src/forge.js, so the full result bar
//     (download, share, stylize, optimize, split) works on it
//   • Remix           → copies the creation's prompt into the composer and
//     focuses it, so a visitor starts from something that demonstrably works
//
// The section stays hidden when the deployment has no durable store or the
// feed is empty — a first-time visitor never sees a broken or hollow strip.

import { skeletonHTML, errorStateHTML, ensureStateKitStyles } from './shared/state-kit.js';
ensureStateKitStyles();

const ENGINE_LABELS = { nvidia: 'Free', trellis: 'Fast', meshy: 'Meshy', tripo: 'Tripo', hunyuan3d: 'Hunyuan3D', triposg: 'TripoSG' };

const els = {
	section: document.getElementById('showcase'),
	grid: document.getElementById('showcase-grid'),
	count: document.getElementById('showcase-count'),
	refresh: document.getElementById('showcase-refresh'),
};

// "3m ago" / "2h ago" / "5d ago" — compact, no library.
function timeAgo(iso) {
	const t = Date.parse(iso);
	if (!Number.isFinite(t)) return '';
	const s = Math.max(0, (Date.now() - t) / 1000);
	if (s < 60) return 'just now';
	if (s < 3600) return `${Math.floor(s / 60)}m ago`;
	if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
	return `${Math.floor(s / 86400)}d ago`;
}

function buildCard(c) {
	const card = document.createElement('div');
	card.className = 'creation showcase-card';
	card.tabIndex = 0;
	card.setAttribute('role', 'button');
	card.title = c.prompt || 'Forged model';
	card.setAttribute('aria-label', `Open in viewer: ${c.prompt || 'forged model'}`);

	if (c.preview_image_url) {
		const img = document.createElement('img');
		img.className = 'thumb';
		img.loading = 'lazy';
		img.alt = '';
		img.src = c.preview_image_url;
		card.appendChild(img);
	} else {
		const ph = document.createElement('span');
		ph.className = 'thumb placeholder';
		ph.textContent = '◳';
		card.appendChild(ph);
	}

	// Engine · tier provenance, same convention as "Your creations".
	if (c.backend || c.tier) {
		const prov = document.createElement('span');
		prov.className = 'badge';
		prov.style.left = '6px';
		prov.style.right = 'auto';
		prov.textContent = [ENGINE_LABELS[c.backend] || c.backend, c.tier].filter(Boolean).join(' · ');
		card.appendChild(prov);
	}

	attachHoverPreview(card, c);
	if (Number(c.views_used) > 1) {
		const mv = document.createElement('span');
		mv.className = 'badge';
		mv.textContent = `${c.views_used}×`;
		mv.title = `${c.views_used} reference views`;
		card.appendChild(mv);
	}

	const meta = document.createElement('span');
	meta.className = 'meta';
	meta.textContent = c.prompt || 'Untitled';
	card.appendChild(meta);

	const foot = document.createElement('div');
	foot.className = 'showcase-foot';

	const when = document.createElement('span');
	when.className = 'showcase-when';
	when.textContent = timeAgo(c.created_at);
	foot.appendChild(when);

	// Remix — only meaningful when there is a prompt to start from.
	if (c.prompt) {
		const remix = document.createElement('button');
		remix.type = 'button';
		remix.className = 'showcase-remix';
		remix.textContent = 'Remix';
		remix.title = 'Copy this prompt into the composer';
		remix.setAttribute('aria-label', `Remix prompt: ${c.prompt}`);
		remix.addEventListener('click', (e) => {
			e.stopPropagation();
			remixPrompt(c.prompt);
		});
		foot.appendChild(remix);
	}
	card.appendChild(foot);

	const open = () =>
		document.dispatchEvent(new CustomEvent('forge:open-creation', { detail: { creation: c } }));
	card.addEventListener('click', open);
	card.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			open();
		}
	});

	return card;
}

// Hover a card for a beat → its actual model spins in the thumb. One live
// mini-viewer at a time (GLBs are megabytes; a grid of twelve would jank the
// page), created only on real intent (300ms dwell) and torn down on leave.
// <model-viewer> is already registered on this page. Pointer-only by design:
// on touch, tapping the card opens the full viewer anyway.
let activePreview = null; // { card, viewer }
let previewTimer = null;

function teardownHoverPreview() {
	clearTimeout(previewTimer);
	previewTimer = null;
	if (activePreview) {
		activePreview.viewer.remove();
		activePreview.card.classList.remove('is-previewing');
		activePreview = null;
	}
}

function attachHoverPreview(card, c) {
	if (!c.glb_url || !window.customElements?.get('model-viewer')) return;
	if (matchMedia('(hover: none)').matches) return;

	card.addEventListener('mouseenter', () => {
		teardownHoverPreview();
		previewTimer = setTimeout(() => {
			const thumb = card.querySelector('.thumb');
			if (!thumb) return;
			const viewer = document.createElement('model-viewer');
			viewer.className = 'showcase-preview';
			viewer.setAttribute('src', c.glb_url);
			viewer.setAttribute('auto-rotate', '');
			viewer.setAttribute('auto-rotate-delay', '0');
			viewer.setAttribute('rotation-per-second', '24deg');
			viewer.setAttribute('interaction-prompt', 'none');
			viewer.setAttribute('disable-zoom', '');
			viewer.setAttribute('shadow-intensity', '0');
			viewer.setAttribute('exposure', '0.9');
			viewer.setAttribute('environment-image', 'neutral');
			viewer.setAttribute('aria-hidden', 'true');
			// Fade in only once the GLB is actually ready — no pop, no void.
			viewer.addEventListener('load', () => card.classList.add('is-previewing'), { once: true });
			thumb.insertAdjacentElement('afterend', viewer);
			activePreview = { card, viewer };
		}, 300);
	});
	card.addEventListener('mouseleave', teardownHoverPreview);
}

// Put the prompt in the composer, in text mode, ready to edit-and-Generate.
function remixPrompt(prompt) {
	document.querySelector('#mode-switch [data-mode="text"]')?.click();
	const box = document.getElementById('prompt');
	if (!box) return;
	box.value = prompt;
	box.dispatchEvent(new Event('input', { bubbles: true }));
	box.focus();
	// Caret at the end — the natural place to start tweaking.
	box.setSelectionRange(box.value.length, box.value.length);
	box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function loadShowcase() {
	if (!els.section || !els.grid) return;

	els.grid.setAttribute('aria-busy', 'true');
	els.grid.innerHTML = skeletonHTML(4, 'card');
	els.section.classList.remove('is-hidden');

	let data;
	try {
		// Over-fetch, then dedupe near-identical prompts client-side — people
		// re-roll the same prompt, and a feed of six teapots sells nothing.
		const res = await fetch('/api/forge-gallery?scope=community&limit=24');
		data = await res.json().catch(() => ({}));
	} catch {
		els.grid.removeAttribute('aria-busy');
		els.grid.innerHTML = errorStateHTML({
			title: "Couldn't load the community feed",
			body: 'Check your connection and retry — generation itself is unaffected.',
		});
		els.grid.querySelector('[data-sk-retry]')?.addEventListener('click', loadShowcase);
		return;
	}

	els.grid.removeAttribute('aria-busy');
	const all = Array.isArray(data?.creations) ? data.creations : [];
	const seen = new Set();
	const creations = all
		.filter((c) => {
			const key = (c.prompt || c.id || '').toLowerCase().replace(/\s+/g, ' ').trim();
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.slice(0, 12);
	if (!data?.enabled || creations.length === 0) {
		// No durable store, or nothing forged yet — no hollow strip.
		els.section.classList.add('is-hidden');
		return;
	}

	teardownHoverPreview();
	els.grid.innerHTML = '';
	for (const c of creations) els.grid.appendChild(buildCard(c));
	if (els.count) els.count.textContent = `${creations.length} recent`;
}

els.refresh?.addEventListener('click', loadShowcase);

loadShowcase();
