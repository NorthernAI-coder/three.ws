// Coin Communities UI layer — lobby + in-world chrome.
//
// Two surfaces:
//   1. Lobby: live pump.fun coin grid (each coin = a community to enter) + a
//      zero-friction avatar picker (presets, or paste your own avatar / 3D
//      agent GLB URL or three.ws avatar id).
//   2. In-world HUD: coin banner + online count, chat, emote tray, leave.
//
// The 3D scene (coincommunities.js) owns WebGL + projected name labels; this
// module owns the 2D chrome and calls back through the handlers passed in.

import { renderAvatarThumb } from './avatar-thumb.js';
import { resolveAvatarUrl } from './avatar-rig.js';
import { validateGlb, uploadGlb } from './avatar-upload.js';
import { GUEST_SENTINEL, playAs } from './play-handoff.js';
import { COMPOSITE_PIECES } from './build-voxels.js';
import { PROP_CATALOG, GALLERY_PROP_PREFIX, registerGalleryProp } from './world-objects.js';
import { log } from '../shared/log.js';

// Degrees shown on the rotate button for each quarter-turn step (0–3).
const ROT_DEG = ['0°', '90°', '180°', '270°'];

function el(tag, props = {}, kids = []) {
	const n = document.createElement(tag);
	for (const [k, v] of Object.entries(props)) {
		if (k === 'class') n.className = v;
		else if (k === 'text') n.textContent = v;
		else if (k === 'html') n.innerHTML = v;
		else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
		else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v);
	}
	for (const kid of [].concat(kids)) if (kid != null && kid !== false) n.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
	return n;
}

const fmtMc = (n) => {
	if (!n || !isFinite(n)) return null;
	if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
	if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
	if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
	return '$' + Math.round(n);
};

// Compact token-amount label ("1.5M", "12.3K", "950") for gate requirements.
const fmtCompact = (n) => {
	const v = Number(n) || 0;
	if (v >= 1e9) return (v / 1e9).toFixed(v >= 1e10 ? 0 : 1).replace(/\.0$/, '') + 'B';
	if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
	if (v >= 1e3) return (v / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
	return String(Math.round(v));
};

// Compact "3h ago" / "just now" relative time from an epoch-ms timestamp.
function timeAgo(ts) {
	const t = Number(ts);
	if (!t || !isFinite(t)) return '';
	const s = Math.max(0, (Date.now() - t) / 1000);
	if (s < 60) return 'just now';
	if (s < 3600) return `${Math.floor(s / 60)}m ago`;
	if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
	return `${Math.floor(s / 86400)}d ago`;
}

const DEFAULT_AVATAR = '/avatars/default.glb';

export class CommunityUI {
	/**
	 * @param {object} h handlers: { onEnter(coin), onLeave(), onChat(text), onEmote(name) }
	 */
	constructor(h) {
		this.h = h;
		this.coins = [];
		this.featured = null;      // pinned official town (e.g. the $THREE flagship)
		this.searchResults = [];   // live pump.fun search hits beyond the trending grid
		this.searching = false;
		this._searchSeq = 0;       // guards against out-of-order async search responses
		this._searchTimer = null;
		this.avatar = localStorage.getItem('cc-avatar') || DEFAULT_AVATAR;
		this._buildLobby();
		this._buildHud();
		this._buildStructures();
		this._buildPropPalette();
	}

	// ---------------------------------------------------------------- lobby
	_buildLobby() {
		this.searchInput = el('input', { type: 'text', placeholder: 'Search any pump.fun coin…', oninput: () => this._onSearchInput() });
		this.grid = el('div', { class: 'cc-grid' });

		// Your display name — the label peers see above your avatar and in chat.
		// Persisted so it sticks across sessions; broadcast live if changed in-world.
		this.nameInput = el('input', {
			type: 'text', maxlength: '24', class: 'cc-name-input', id: 'cc-name-input',
			placeholder: 'Pick a name', 'aria-label': 'Your display name',
			value: localStorage.getItem('cc-name') || '',
			onchange: () => this._commitName(),
			onkeydown: (e) => { if (e.key === 'Enter') { this._commitName(); this.nameInput.blur(); } e.stopPropagation(); },
		});

		this.presetRow = el('div', { class: 'cc-avatar-presets' });
		this.customInput = el('input', {
			type: 'text',
			placeholder: 'Paste avatar / 3D agent GLB URL or avatar id',
			value: /^https?:|^\//.test(this.avatar) && this.avatar !== DEFAULT_AVATAR ? this.avatar : '',
			onchange: () => { this._setAvatar(this.customInput.value.trim() || DEFAULT_AVATAR, true); },
		});

		// Bring-your-own avatar: drop a .glb on the bar or pick one. It's validated,
		// uploaded to storage, then broadcast by its public URL so peers see it too.
		this.uploadFile = el('input', {
			type: 'file', accept: '.glb,model/gltf-binary', class: 'cc-upload-file',
			onchange: (e) => { const f = e.target.files?.[0]; if (f) this._handleGlbFile(f); e.target.value = ''; },
		});
		this.uploadBtn = el('label', { class: 'cc-upload-btn', title: 'Upload a .glb avatar from your device' }, [
			el('span', { class: 'cc-upload-ico', text: '⬆' }),
			el('span', { class: 'cc-upload-text', text: 'Upload .glb' }),
			this.uploadFile,
		]);

		// Browse the full avatar library (your own + the public gallery) with live
		// 3D previews, instead of pasting a URL. Reuses the platform-wide
		// AvatarGalleryPicker, lazy-loaded so the lobby bundle stays lean.
		this.galleryBtn = el('button', {
			type: 'button', class: 'cc-gallery-btn',
			title: 'Browse your avatars and the public gallery',
			onclick: () => this._openGallery(),
		}, [
			el('span', { class: 'cc-gallery-ico', text: '🖼' }),
			el('span', { class: 'cc-gallery-text', text: 'Browse gallery' }),
		]);
		// Create a brand-new avatar without leaving the lobby — the headline action.
		// Opens the in-app creator (design from scratch or from a photo); the exported
		// GLB is staged locally and adopted instantly, then the world uploads it so
		// peers see it too. Lazy-loaded so the avatar SDK never bloats the lobby boot.
		this.createBtn = el('button', {
			type: 'button', class: 'cc-create-btn',
			title: 'Create a brand-new 3D avatar — design it or build it from a photo',
			onclick: () => this._openCreate(),
		}, [
			el('span', { class: 'cc-create-ico', 'aria-hidden': 'true', text: '✦' }),
			el('span', { class: 'cc-create-copy', html: 'Create your avatar<small>Design from scratch or from a photo — drop straight in</small>' }),
			el('span', { class: 'cc-create-arrow', 'aria-hidden': 'true', text: '→' }),
		]);

		this.uploadStatus = el('div', { class: 'cc-upload-status', role: 'status', 'aria-live': 'polite', hidden: true });

		this.lobby = el('div', { id: 'cc-lobby' }, [
			this._buildSiteNav(),
			el('div', { class: 'cc-lobby-inner' }, [
				el('div', { class: 'cc-lobby-head' }, [
					el('div', { class: 'cc-brand' }, [
						el('a', { class: 'cc-brand-logo', href: '/', 'aria-label': 'three.ws home', title: 'three.ws', html: '<svg viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M11.013 1.011a16 16 0 0 0-3.96 1.39C2.79 4.531.213 8.757.012 13.564c-.16 3.933 1.31 7.62 4.117 10.357l.736.715-.16.46c-.084.249-.13.504-.138.761 0 1.358 1.448 2.218 2.638 1.567.535-.292.879-.748 1.043-1.384.084-.331.092-.462.07-.882-.02-.43-.04-.535-.18-.83-.246-.52-.567-.86-1.087-1.153l-.297-.167.106-.32c.18-.543.79-1.717 1.181-2.276 1.91-2.729 5.066-4.395 8.4-4.434l.43-.005.012-1.19c.006-.654.024-1.19.04-1.19s.252.197.526.438c.71.624 2.296 1.95 2.785 2.328.23.178.41.34.4.36-.01.02-.214.156-.453.303-.926.57-2.265 1.65-3.13 2.524l-.27.273.012 1.064.013 1.064.32.027c1.327.114 2.598.685 3.578 1.607.21.198.39.343.4.323.04-.073.276-1.327.346-1.84.296-2.169-.094-4.317-1.129-6.16l-.19-.34.246-.45c.811-1.485 1.291-3.063 1.456-4.776.04-.42.046-.488.111-.488.111 0 1.327.715 1.94 1.143 2.953 2.057 4.96 5.241 5.579 8.856.21 1.22.234 1.585.234 3.063 0 1.485-.024 1.844-.234 3.064-.811 4.736-4.06 8.732-8.51 10.474-1.04.407-2.504.78-3.578.91l-.32.04v2.395l.41-.046c2.014-.226 4.222-.93 5.98-1.91 4.84-2.688 8.058-7.464 8.696-12.897.105-.892.105-3.063 0-3.956-.638-5.433-3.856-10.21-8.697-12.898C24.083.99 21.875.285 19.86.06 19.322 0 19.27 0 15.752.006c-3.346.006-4.234.02-4.74.105Z"/></svg>' }),
						el('div', {}, [
							el('div', { class: 'cc-brand-title', text: 'Coin Communities' }),
							el('div', { class: 'cc-brand-sub', text: 'Every coin is a 3D world. Drop in and hang out.' }),
						]),
					]),
					el('div', { class: 'cc-search' }, [el('span', { text: '🔎' }), this.searchInput]),
					el('a', { class: 'cc-adventure', href: '/play', title: 'Isometric MMO — gather, fight, level up' }, [
						el('span', { class: 'cc-adventure-ico', text: '⚔️' }),
						el('span', { html: 'Adventure mode<small>Gather · fight · level up</small>' }),
					]),
				]),
				this.avatarBar = el('div', { class: 'cc-avatar-bar' }, [
					el('div', { class: 'cc-name-row' }, [
						el('label', { class: 'cc-name-label', for: 'cc-name-input', text: 'Your name' }),
						this.nameInput,
					]),
					el('div', { class: 'cc-avatar-label', html: 'Your avatar<small>Create your own, pick a preset, browse the gallery, paste a URL, or drop your own .glb</small>' }),
					this.createBtn,
					this.presetRow,
					el('div', { class: 'cc-avatar-custom' }, [this.customInput, this.galleryBtn, this.uploadBtn]),
						this.uploadStatus,
						el('div', { class: 'cc-avatar-dropmsg', text: 'Drop .glb to use as your avatar' }),
				]),
				el('p', { class: 'cc-section-title', text: 'Live communities' }),
				this.grid,
			]),
			this._buildSiteFooter(),
		]);
		document.body.appendChild(this.lobby);

		this._wireNav();
		this._wireGlbDrop();
		this._renderPresets();
		this.setCoinsLoading();
	}

	// ---------------------------------------------------------- site chrome
	// The platform-wide top nav + footer, so the lobby sits inside three.ws
	// instead of feeling like an island. Mirrors the home page's navigation
	// (Build / Discover / Embed / Learn / Labs) so links and ordering stay
	// consistent across the site; styled with the lobby's own dark tokens.
	_buildSiteNav() {
		const THREE_MARK = '<svg viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M11.013 1.011a16 16 0 0 0-3.96 1.39C2.79 4.531.213 8.757.012 13.564c-.16 3.933 1.31 7.62 4.117 10.357l.736.715-.16.46c-.084.249-.13.504-.138.761 0 1.358 1.448 2.218 2.638 1.567.535-.292.879-.748 1.043-1.384.084-.331.092-.462.07-.882-.02-.43-.04-.535-.18-.83-.246-.52-.567-.86-1.087-1.153l-.297-.167.106-.32c.18-.543.79-1.717 1.181-2.276 1.91-2.729 5.066-4.395 8.4-4.434l.43-.005.012-1.19c.006-.654.024-1.19.04-1.19s.252.197.526.438c.71.624 2.296 1.95 2.785 2.328.23.178.41.34.4.36-.01.02-.214.156-.453.303-.926.57-2.265 1.65-3.13 2.524l-.27.273.012 1.064.013 1.064.32.027c1.327.114 2.598.685 3.578 1.607.21.198.39.343.4.323.04-.073.276-1.327.346-1.84.296-2.169-.094-4.317-1.129-6.16l-.19-.34.246-.45c.811-1.485 1.291-3.063 1.456-4.776.04-.42.046-.488.111-.488.111 0 1.327.715 1.94 1.143 2.953 2.057 4.96 5.241 5.579 8.856.21 1.22.234 1.585.234 3.063 0 1.485-.024 1.844-.234 3.064-.811 4.736-4.06 8.732-8.51 10.474-1.04.407-2.504.78-3.578.91l-.32.04v2.395l.41-.046c2.014-.226 4.222-.93 5.98-1.91 4.84-2.688 8.058-7.464 8.696-12.897.105-.892.105-3.063 0-3.956-.638-5.433-3.856-10.21-8.697-12.898C24.083.99 21.875.285 19.86.06 19.322 0 19.27 0 15.752.006c-3.346.006-4.234.02-4.74.105Z"/></svg>';

		// [href, title, description, badge?] per menu item.
		const GROUPS = [
			['Build', [
				['/create', 'Create agent', 'Avatar + brain wizard'],
				['/create/selfie', 'Selfie to avatar', 'One photo → rigged 3D avatar', 'New'],
				['/worlds', 'Worlds', 'Every coin is a 3D world — drop in & hang out', 'New'],
				['/app', 'Viewer', 'Drag-and-drop GLB'],
				['/playground', 'Playground', 'Viewer + environment + embed code'],
				['/voice', 'Voice Lab', 'Clone your voice · TTS playground', 'New'],
			]],
			['Discover', [
				['/features', 'Features', 'Everything an agent gets — interactive tour'],
				['/discover', 'ERC-8004 Agents', 'On-chain agent directory'],
				['/marketplace', 'Marketplace', 'Buy, sell & remix agents'],
				['/gallery', 'Avatar Gallery', 'Every public 3D avatar'],
				['/skills', 'Skills', 'Browse agent tool packs & capabilities', 'New'],
				['/bazaar', 'x402 Bazaar', 'Browse paid APIs and MCP tools'],
				['/community', 'Community', 'X, GitHub, and ways to get involved'],
			]],
			['Embed', [
				['/widgets', 'Widgets', 'Browse + customize embeddable widgets'],
				['/studio', 'Widget Studio', 'Pick avatar → copy snippet'],
				['/embed.html', 'Embed editor', 'Tune mode, size, position'],
				['/avatar-sdk', 'Avatar SDK', 'npm · web component · React · GLB upload', 'New'],
				['/docs#embedding', 'Embed docs', 'iframe + oEmbed'],
			]],
			['Learn', [
				['/docs', 'Docs', 'SDKs + API reference'],
				['/tutorials', 'Tutorials', 'Step-by-step guides'],
				['/brain', 'Brain', 'Claude · GPT · DeepSeek · Qwen · Llama', 'New'],
				['/chat', 'Chat', 'Talk to your agent'],
				['/pay', 'Pay', 'Agent payments — x402 + USDC', 'New'],
			]],
			['Labs', [
				['/launchpad', 'Launchpad Studio', 'Build a 3D launchpad · token · concierge', 'New'],
				['/mocap-studio', 'Mocap Studio', 'Record face → save clip → replay', 'New'],
				['/pose', 'Pose Studio', 'Click-to-pose mannequin + export PNG'],
				['/walk', 'Walk', 'Walk your avatar — multiplayer + AR', 'New'],
				['/xr', 'XR', 'Place your avatar in the real world', 'New'],
				['/three-live', '$THREE Live', 'Protocol pulse — live trades in 3D', 'New'],
				['/pump-visualizer', 'Pump Visualizer', '3D view of trending tokens'],
				['/club', 'Pole Club', 'x402 micro-tip demo — $0.001 / dance', 'New'],
				['/play/agent-wallet', 'Agent Wallet', 'Your avatar pays an endpoint — USDC on Solana', 'New'],
			], true],
		];

		const item = ([href, title, desc, badge]) => el('a', { class: 'cc-nav-mi', href, role: 'menuitem' }, [
			el('span', { class: 'cc-nav-mi-t' }, [title, badge ? el('span', { class: 'cc-nav-pill', text: badge }) : null]),
			el('span', { class: 'cc-nav-mi-d', text: desc }),
		]);

		const group = ([label, items, wide]) => el('div', { class: 'cc-nav-grp' }, [
			el('button', { type: 'button', class: 'cc-nav-trigger', 'aria-haspopup': 'true', 'aria-expanded': 'false' }, [
				label,
				el('span', { class: 'cc-nav-caret', 'aria-hidden': 'true', text: '▾' }),
			]),
			el('div', { class: 'cc-nav-pop' + (wide ? ' cc-nav-wide' : ''), role: 'menu', 'aria-label': label }, items.map(item)),
		]);

		// Mobile drawer mirrors the same destinations as a flat list.
		const drawerSections = GROUPS.map(([label, items]) => [
			el('div', { class: 'cc-dr-h', text: label }),
			...items.map(([href, title]) => el('a', { href, text: title })),
		]).flat();

		this.navDrawer = el('nav', { class: 'cc-nav-drawer', id: 'cc-nav-drawer', 'aria-label': 'Mobile', 'aria-hidden': 'true' }, [
			...drawerSections,
			el('div', { class: 'cc-dr-h', text: 'More' }),
			el('a', { href: '/pricing', text: 'Pricing' }),
			el('div', { class: 'cc-dr-sep' }),
			el('a', { href: '/login', text: 'Sign in' }),
			el('a', { class: 'cc-dr-console', href: '/dashboard', text: 'Console →' }),
		]);

		this.navToggle = el('button', { class: 'cc-nav-toggle', id: 'cc-nav-toggle', 'aria-label': 'Menu', 'aria-expanded': 'false' }, [
			el('span', { class: 'cc-nav-burger', 'aria-hidden': 'true', html: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="2" y1="12" x2="14" y2="12"/></svg>' }),
			el('span', { class: 'cc-nav-x', 'aria-hidden': 'true', html: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>' }),
		]);

		return el('header', { class: 'cc-nav' }, [
			el('div', { class: 'cc-nav-inner' }, [
				el('a', { class: 'cc-nav-brand', href: '/', 'aria-label': 'three.ws home', html: THREE_MARK + '<span>three.ws</span>' }),
				el('nav', { class: 'cc-nav-main', 'aria-label': 'Primary' }, [
					...GROUPS.map(group),
					el('a', { class: 'cc-nav-flat', href: '/pricing', text: 'Pricing' }),
				]),
				el('div', { class: 'cc-nav-end' }, [
					el('a', { class: 'cc-nav-signin', href: '/login', text: 'Sign in' }),
					el('a', { class: 'cc-nav-console', href: '/dashboard', text: 'Console →' }),
				]),
				this.navToggle,
			]),
			this.navDrawer,
		]);
	}

	_buildSiteFooter() {
		const link = (href, text) => el('a', { href, text, ...(href.startsWith('http') ? { target: '_blank', rel: 'noopener' } : {}) });
		return el('footer', { class: 'cc-foot' }, [
			el('div', { class: 'cc-foot-inner' }, [
				el('div', { class: 'cc-foot-copy', text: '© 2026 · three.ws · the 3D agent layer of the internet' }),
				el('div', { class: 'cc-foot-links' }, [
					link('/docs', 'Docs'),
					link('/pricing', 'Pricing'),
					link('/discover', 'Discover'),
					link('/dashboard/api', 'API'),
					link('https://github.com/nirholas/three.ws', 'GitHub'),
					link('mailto:support@three.ws', 'Contact'),
				]),
			]),
		]);
	}

	// Hover-to-open desktop dropdowns (click/keyboard for touch + a11y) plus the
	// mobile drawer toggle. Mirrors the home page's nav behavior.
	_wireNav() {
		const groups = [...this.lobby.querySelectorAll('.cc-nav-main .cc-nav-grp')];
		const hoverCapable = window.matchMedia('(hover: hover)').matches;
		const setOpen = (grp, on) => {
			grp.classList.toggle('cc-open', on);
			grp.querySelector('.cc-nav-trigger')?.setAttribute('aria-expanded', on ? 'true' : 'false');
		};
		const closeAll = (except) => groups.forEach((g) => { if (g !== except) setOpen(g, false); });

		groups.forEach((grp) => {
			const trigger = grp.querySelector('.cc-nav-trigger');
			if (!trigger) return;
			let closeTimer;
			trigger.addEventListener('click', (e) => {
				e.stopPropagation();
				if (hoverCapable) { closeAll(grp); setOpen(grp, true); return; }
				const willOpen = !grp.classList.contains('cc-open');
				closeAll(grp);
				setOpen(grp, willOpen);
			});
			if (hoverCapable) {
				grp.addEventListener('mouseenter', () => { clearTimeout(closeTimer); closeAll(grp); setOpen(grp, true); });
				grp.addEventListener('mouseleave', () => { closeTimer = setTimeout(() => setOpen(grp, false), 120); });
			}
			grp.querySelectorAll('.cc-nav-mi').forEach((a) => a.addEventListener('click', () => setOpen(grp, false)));
		});
		document.addEventListener('click', (e) => { if (!e.target.closest('.cc-nav-main .cc-nav-grp')) closeAll(); });
		document.addEventListener('keydown', (e) => {
			if (e.key !== 'Escape') return;
			const openGrp = this.lobby.querySelector('.cc-nav-main .cc-nav-grp.cc-open');
			if (openGrp) { setOpen(openGrp, false); openGrp.querySelector('.cc-nav-trigger')?.focus(); }
		});

		// Mobile drawer
		const toggle = this.navToggle, drawer = this.navDrawer;
		const isOpen = () => drawer.classList.contains('cc-open');
		const setDrawer = (open) => {
			toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
			drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
			drawer.classList.toggle('cc-open', open);
		};
		toggle.addEventListener('click', () => setDrawer(!isOpen()));
		drawer.addEventListener('click', (e) => { if (e.target.closest('a')) setDrawer(false); });
		document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) { setDrawer(false); toggle.focus(); } });
		window.addEventListener('resize', () => { if (window.innerWidth > 880 && isOpen()) setDrawer(false); });
	}

	// Make the avatar bar a drop target for a local .glb. Only reacts to file
	// drags so a stray text/element drag never lights it up.
	_wireGlbDrop() {
		const bar = this.avatarBar;
		const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
		const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
		bar.addEventListener('dragenter', (e) => { stop(e); if (hasFiles(e)) bar.classList.add('cc-drag'); });
		bar.addEventListener('dragover', (e) => { stop(e); if (hasFiles(e)) { e.dataTransfer.dropEffect = 'copy'; bar.classList.add('cc-drag'); } });
		bar.addEventListener('dragleave', (e) => { stop(e); if (!bar.contains(e.relatedTarget)) bar.classList.remove('cc-drag'); });
		bar.addEventListener('drop', (e) => {
			stop(e);
			bar.classList.remove('cc-drag');
			const files = [...(e.dataTransfer?.files || [])];
			const glb = files.find((f) => f.name.toLowerCase().endsWith('.glb')) || files[0];
			if (glb) this._handleGlbFile(glb);
		});
	}

	// Validate → upload → adopt a dropped/selected .glb as the player's avatar.
	async _handleGlbFile(file) {
		if (this._uploading) return;
		this._uploading = true;
		this._setUploadState('working', 'Checking your model…');
		try {
			await validateGlb(file);
			this._setUploadState('working', 'Uploading… 0%');
			const url = await uploadGlb(file, (p) => this._setUploadState('working', `Uploading… ${Math.round(p * 100)}%`));
			this._addUploadedAvatar(url, file.name);
			this._setUploadState('done', `“${file.name}” is now your avatar.`);
		} catch (err) {
			this._setUploadState('error', err?.message || 'Upload failed.');
		} finally {
			this._uploading = false;
		}
	}

	_setUploadState(state, msg) {
		this.uploadStatus.hidden = false;
		this.uploadStatus.setAttribute('data-state', state);
		this.uploadStatus.textContent = msg;
		this.uploadBtn.classList.toggle('cc-busy', state === 'working');
		clearTimeout(this._uploadStatusTimer);
		if (state === 'done' || state === 'error') {
			const ttl = state === 'done' ? 4000 : 7000;
			this._uploadStatusTimer = setTimeout(() => { this.uploadStatus.hidden = true; }, ttl);
		}
	}

	// Surface the uploaded avatar as its own selected chip (replacing any prior
	// upload chip) and make it the active avatar.
	_addUploadedAvatar(url, name) {
		if (this._uploadChip?.isConnected) this._uploadChip.remove();
		const chip = el('button', {
			class: 'cc-avatar-chip cc-avatar-loading cc-avatar-upload',
			title: name || 'Your uploaded avatar', 'aria-label': name || 'Your uploaded avatar',
			onclick: () => this._setAvatar(url, false),
		}, [el('span', { class: 'cc-avatar-glyph', text: '🧑‍🎨' })]);
		chip._url = url;
		this._uploadChip = chip;
		this.presetRow.insertBefore(chip, this.presetRow.firstChild);
		this._renderChipPreview(chip, { url, label: name || 'Your avatar' });
		this._setAvatar(url, false);
	}

	// ---------------------------------------------------------- create avatar
	// The complete in-lobby creation workflow. A method chooser opens over the
	// lobby; each method ends with a real GLB the player can drop in with:
	//   • Create     → the in-app avatar creator (design from scratch / from a
	//                  photo). Anonymous, exports a GLB Blob we adopt instantly.
	//   • Upload     → reuse the bar's validated .glb upload.
	//   • Studio     → the full sculpt/outfit builder at /create/studio (richer,
	//                  saves to your three.ws account). Opens in a new tab.
	// Confine Tab/Shift+Tab focus to an open modal so keyboard focus can't walk
	// out to the obscured lobby behind an aria-modal dialog. Returns a release
	// function the close path calls; pair with restoring focus to the opener.
	_trapFocus(container) {
		const SEL = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
		const handler = (e) => {
			if (e.key !== 'Tab') return;
			const items = [...container.querySelectorAll(SEL)].filter((n) => n.offsetParent !== null);
			if (!items.length) return;
			const first = items[0];
			const last = items[items.length - 1];
			const active = document.activeElement;
			if (e.shiftKey && (active === first || !container.contains(active))) { e.preventDefault(); last.focus(); }
			else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
		};
		container.addEventListener('keydown', handler);
		return () => container.removeEventListener('keydown', handler);
	}

	_openCreate() {
		if (this._createModal) return;

		const card = (icon, title, desc, badge, onActivate) => {
			const c = el('button', {
				type: 'button', class: 'cc-create-card',
				onclick: () => onActivate(),
			}, [
				el('span', { class: 'cc-create-card-ico', 'aria-hidden': 'true', text: icon }),
				el('span', { class: 'cc-create-card-body' }, [
					el('span', { class: 'cc-create-card-title' }, [
						document.createTextNode(title),
						badge ? el('span', { class: 'cc-create-card-badge', text: badge }) : null,
					]),
					el('span', { class: 'cc-create-card-desc', text: desc }),
				]),
				el('span', { class: 'cc-create-card-arrow', 'aria-hidden': 'true', text: '→' }),
			]);
			return c;
		};

		const cards = el('div', { class: 'cc-create-methods' }, [
			card('✦', 'Design your avatar', 'Build a 3D character from scratch or from a selfie, then drop straight into the world. No sign-in needed.', 'Recommended', () => this._launchEditor()),
			card('⬆', 'Upload a .glb', 'Already have a model from Blender, Mixamo, VRoid, or any avatar tool? Bring it in.', '', () => { this._closeCreate(); this.uploadFile.click(); }),
			card('✨', 'Advanced studio', 'Sculpt face & body, layer outfits and accessories, and save it to your three.ws account.', 'Opens in a new tab', () => { window.open('/create/studio', '_blank', 'noopener'); this._closeCreate(); }),
		]);

		const closeBtn = el('button', { type: 'button', class: 'cc-create-close', 'aria-label': 'Close', text: '×', onclick: () => this._closeCreate() });
		const modal = el('div', {
			class: 'cc-create-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cc-create-title',
		}, [
			el('div', { class: 'cc-create-head' }, [
				el('div', {}, [
					el('h2', { id: 'cc-create-title', class: 'cc-create-title', text: 'Create your avatar' }),
					el('p', { class: 'cc-create-sub', text: 'However you make it, your avatar is ready to play the moment it’s done.' }),
				]),
				closeBtn,
			]),
			cards,
		]);
		const overlay = el('div', { class: 'cc-create-overlay', onclick: (e) => { if (e.target === overlay) this._closeCreate(); } }, [modal]);

		this._createModal = overlay;
		this._createKeyHandler = (e) => {
			if (e.key === 'Escape') { e.stopPropagation(); this._closeCreate(); }
		};
		document.addEventListener('keydown', this._createKeyHandler, true);
		document.body.appendChild(overlay);
		this._createTrapRelease = this._trapFocus(overlay);
		// Animate in on the next frame and move focus into the dialog.
		requestAnimationFrame(() => {
			overlay.classList.add('cc-on');
			cards.querySelector('.cc-create-card')?.focus();
		});
	}

	_closeCreate() {
		const overlay = this._createModal;
		if (!overlay) return;
		this._createModal = null;
		if (this._createKeyHandler) {
			document.removeEventListener('keydown', this._createKeyHandler, true);
			this._createKeyHandler = null;
		}
		if (this._createTrapRelease) { this._createTrapRelease(); this._createTrapRelease = null; }
		overlay.classList.remove('cc-on');
		const done = () => overlay.remove();
		overlay.addEventListener('transitionend', done, { once: true });
		setTimeout(done, 260); // fallback if transitionend never fires
		this.createBtn.focus();
	}

	// Open the in-app avatar creator (Studio builder + photo editor) in a modal.
	// On export it hands us a GLB Blob, which we adopt as the active avatar.
	async _launchEditor() {
		this._closeCreate();
		this.createBtn.classList.add('cc-busy');
		try {
			const { AvatarCreator } = await import('../avatar-creator.js');
			this._creator?.dispose?.();
			this._creator = new AvatarCreator(document.body, (blob, meta = {}) => {
				this._adoptCreatedAvatar(blob, meta);
			});
			await this._creator.openDefaultEditor();
		} catch (err) {
			log.warn('[coincommunities] avatar creator failed to open:', err?.message);
			this.toast('Couldn’t open the avatar creator. Try uploading a .glb instead.', 'warn');
		} finally {
			this.createBtn.classList.remove('cc-busy');
		}
	}

	// Stage a freshly-created GLB locally (instant self-preview), surface it as the
	// selected chip, and make the guest sentinel the active avatar. The world reads
	// the sentinel, shows it to the creator immediately from the local blob, and
	// uploads it in the background so peers can load it too (see play-handoff.js).
	async _adoptCreatedAvatar(blob, meta = {}) {
		this._setUploadState('working', 'Saving your new avatar…');
		try {
			// Pass the player's chosen name only if they set one — playAs persists it as
			// the display name, and we don't want a placeholder shadowing the guest-id
			// fallback the world assigns to unnamed players.
			const name = this.getName();
			await playAs({ blob, name, source: meta.provider || 'three-ws-create', dest: null });
			this._addCreatedChip(name || 'My avatar');
			this._setUploadState('done', 'Your avatar is ready — pick a community to drop in.');
			this.toast('Your avatar is ready — pick a community below to drop in.', 'info');
		} catch (err) {
			log.warn('[coincommunities] could not adopt created avatar:', err?.message);
			this._setUploadState('error', 'Couldn’t save your new avatar. Please try again.');
		}
	}

	// Surface the just-created avatar as its own selected chip (replacing any prior
	// one) and make the guest sentinel the active avatar. The chip starts with a
	// loading shimmer, then renders a real portrait of the new model — the sentinel
	// resolves to the locally-staged blob, so no upload round-trip is needed.
	_addCreatedChip(name) {
		if (this._createdChip?.isConnected) this._createdChip.remove();
		const chip = el('button', {
			class: 'cc-avatar-chip cc-avatar-loading cc-avatar-created',
			title: name || 'Your new avatar', 'aria-label': name || 'Your new avatar',
			onclick: () => this._setAvatar(GUEST_SENTINEL, false),
		}, [el('span', { class: 'cc-avatar-glyph', text: '✦' })]);
		chip._url = GUEST_SENTINEL;
		this._createdChip = chip;
		this.presetRow.insertBefore(chip, this.presetRow.firstChild);
		this._renderChipPreview(chip, { url: GUEST_SENTINEL, label: name || 'Your avatar' });
		this._setAvatar(GUEST_SENTINEL, false);
	}

	// Open the platform avatar gallery (your own avatars + the public gallery)
	// with live 3D previews, and adopt the chosen one. Lazy-loaded so the picker
	// and its model-viewer dependency aren't in the lobby's critical bundle.
	async _openGallery() {
		this.galleryBtn.classList.add('cc-busy');
		try {
			const { openAvatarPicker } = await import('../avatar-gallery-picker.js');
			const selected = await openAvatarPicker({
				source: 'both',
				showModes: false,
				title: 'Choose your avatar',
				ctaLabel: 'Use this avatar',
				selectedId: this._galleryChip?._avatarId || '',
			});
			if (selected) this._adoptGalleryAvatar(selected);
		} catch (err) {
			log.warn('[coincommunities] gallery picker failed:', err?.message);
		} finally {
			this.galleryBtn.classList.remove('cc-busy');
		}
	}

	// Surface a gallery pick as its own selected chip and make it the active
	// avatar. Stores the canonical avatar id when available (so the picker can
	// pre-select it next time); the scene resolves it to a loadable URL before
	// broadcasting to peers.
	_adoptGalleryAvatar(a) {
		const value = a.id || a.model_url;
		if (!value) return;
		if (this._galleryChip?.isConnected) this._galleryChip.remove();
		const chip = el('button', {
			class: 'cc-avatar-chip cc-avatar-loading cc-avatar-gallery',
			title: a.name || 'Your avatar', 'aria-label': a.name || 'Your avatar',
			onclick: () => this._setAvatar(value, false),
		}, [
			a.thumbnail_url
				? el('img', {
						src: a.thumbnail_url, alt: a.name || 'Avatar', loading: 'lazy',
						// A stale thumbnail (e.g. a legacy OG key that 404s before the
						// avatar self-heals) shouldn't leave a broken-image icon — drop
						// it; _renderChipPreview paints the live model over this anyway.
						onerror: (e) => e.target.remove(),
					})
				: el('span', { class: 'cc-avatar-glyph', text: '🧑' }),
		]);
		chip._url = value;
		chip._avatarId = a.id || '';
		this._galleryChip = chip;
		this.presetRow.insertBefore(chip, this.presetRow.firstChild);
		this._renderChipPreview(chip, { url: a.model_url || value, label: a.name || 'Your avatar' });
		this._setAvatar(value, false);
	}

	async _renderPresets() {
		// Default + a few real three.ws community avatars (best-effort fetch).
		const presets = [{ label: 'Default', url: DEFAULT_AVATAR, icon: '🧍' }];
		try {
			const r = await fetch('/api/explore?source=avatar&only3d=1&limit=6', { headers: { accept: 'application/json' } });
			if (r.ok) {
				const data = await r.json();
				for (const it of (data.items || [])) {
					if (it.glbUrl) presets.push({ label: it.name || 'Avatar', url: it.glbUrl, thumb: it.image });
				}
			}
		} catch { /* offline / no API — default preset still works */ }
		this.presets = presets.slice(0, 7);
		this.presetRow.textContent = '';
		for (const p of this.presets) {
			// Start with the best instantly-available fallback (API thumbnail, else
			// emoji) so the chip is never empty, then render the real model and swap
			// it in. The chip carries a loading shimmer until a preview resolves.
			const fallback = p.thumb
				? el('img', {
						src: p.thumb, alt: p.label, loading: 'lazy',
						onerror: (e) => e.target.remove(), // broken thumb → let the model preview stand in
					})
				: el('span', { class: 'cc-avatar-glyph', text: p.icon || '🙂' });
			const chip = el('button', {
				class: 'cc-avatar-chip cc-avatar-loading' + (p.url === this.avatar ? ' cc-on' : ''),
				title: p.label,
				'aria-label': p.label,
				onclick: () => this._setAvatar(p.url, false),
			}, [fallback]);
			chip._url = p.url;
			this.presetRow.appendChild(chip);
			this._renderChipPreview(chip, p);
		}
	}

	// Render the real avatar model to a portrait and swap it into the chip,
	// replacing the placeholder. Leaves the fallback in place if rendering fails
	// (no WebGL, model load error) so the chip stays meaningful.
	async _renderChipPreview(chip, p) {
		let dataUrl = null;
		try {
			dataUrl = await renderAvatarThumb(await resolveAvatarUrl(p.url));
		} catch { /* keep fallback */ }
		if (!chip.isConnected) return;
		chip.classList.remove('cc-avatar-loading');
		if (!dataUrl) return;
		chip.textContent = '';
		chip.appendChild(el('img', { class: 'cc-avatar-render', src: dataUrl, alt: p.label }));
	}

	_setAvatar(url, fromCustom) {
		this.avatar = url || DEFAULT_AVATAR;
		localStorage.setItem('cc-avatar', this.avatar);
		for (const chip of this.presetRow.children) chip.classList.toggle('cc-on', chip._url === this.avatar);
		if (!fromCustom) this.customInput.value = (this.avatar === DEFAULT_AVATAR || !/^https?:|^\//.test(this.avatar)) ? '' : this.avatar;
		this.h.onAvatarChange?.(this.avatar);
	}

	getAvatar() { return this.customInput.value.trim() || this.avatar; }

	setCoinsLoading() {
		this.grid.textContent = '';
		// Keep the pinned official town visible while the live grid loads, so the
		// flagship never blinks out behind the skeletons.
		if (this.featured) this.grid.appendChild(this._coinCard(this.featured, true));
		for (let i = 0; i < 8; i++) {
			this.grid.appendChild(el('div', { class: 'cc-card cc-skeleton' }, [
				el('div', { class: 'cc-card-img' }),
				el('div', { class: 'cc-card-body' }, [el('div', { class: 'cc-card-name' }), el('div', { class: 'cc-card-meta' })]),
			]));
		}
	}

	setCoins(list) { this.coins = list || []; this._renderGrid(); }

	/** Pin an official town (e.g. the $THREE flagship) to the top of the lobby. */
	setFeatured(coin) { this.featured = coin && coin.mint ? coin : null; this._renderGrid(); }

	setCoinsError(retry) {
		this.grid.textContent = '';
		this.grid.appendChild(el('div', { class: 'cc-state' }, [
			el('span', { class: 'cc-state-ico', text: '📡' }),
			el('div', { text: 'Could not load live coins right now.' }),
			el('button', { text: 'Retry', onclick: retry }),
		]));
	}

	// Debounced live search: filter the loaded trending grid instantly for
	// snappy feedback, then query all of pump.fun so any coin (not just the
	// trending 30) becomes reachable as a world.
	_onSearchInput() {
		const q = this.searchInput.value.trim();
		clearTimeout(this._searchTimer);
		if (q.length < 2) {
			this.searchResults = [];
			this.searching = false;
			this._searchSeq++; // invalidate any in-flight search
			this._renderGrid();
			return;
		}
		this._renderGrid(); // instant local filter
		this._searchTimer = setTimeout(() => this._remoteSearch(q), 280);
	}

	async _remoteSearch(query) {
		if (!this.h.onSearch) return;
		const seq = ++this._searchSeq;
		this.searching = true;
		this._renderGrid();
		let results = [];
		try {
			results = (await this.h.onSearch(query)) || [];
		} catch (err) {
			log.warn('[coincommunities] search failed:', err?.message);
		}
		if (seq !== this._searchSeq) return; // a newer query superseded this one
		this.searchResults = results;
		this.searching = false;
		this._renderGrid();
	}

	_renderGrid() {
		const q = this.searchInput.value.trim().toLowerCase();
		const matches = (c) =>
			!q || (c.name || '').toLowerCase().includes(q) || (c.symbol || '').toLowerCase().includes(q) || (c.mint || '').toLowerCase().includes(q);
		// The pinned official town leads the grid when it matches the current query,
		// and is excluded from the regular list so it never appears twice.
		const featured = this.featured && matches(this.featured) ? this.featured : null;
		// Trending matches first, then live search hits not already on screen —
		// deduped by mint so a coin never appears twice.
		const list = this.coins.filter((c) => matches(c) && c.mint !== this.featured?.mint);
		const seen = new Set(list.map((c) => c.mint));
		if (this.featured) seen.add(this.featured.mint);
		for (const c of this.searchResults) {
			if (c.mint && !seen.has(c.mint)) { seen.add(c.mint); list.push(c); }
		}
		this.grid.textContent = '';
		if (!featured && !list.length) {
			if (this.searching) { this._renderSearching(); return; }
			this.grid.appendChild(el('div', { class: 'cc-state' }, [
				el('span', { class: 'cc-state-ico', text: '🪙' }),
				el('div', { text: q ? 'No coins match — try a different name, symbol, or mint.' : 'No communities yet — be the first in!' }),
			]));
			return;
		}
		if (featured) this.grid.appendChild(this._coinCard(featured, true));
		for (const c of list) this.grid.appendChild(this._coinCard(c, false));
		// Searching beyond the trending grid while results are already showing.
		if (this.searching) this.grid.appendChild(el('div', { class: 'cc-search-more' }, [
			el('span', { class: 'cc-spinner' }), document.createTextNode('Searching all of pump.fun…'),
		]));
	}

	// Build one lobby card. The featured (official) town gets a distinct frame, an
	// OFFICIAL badge, and a "home town" call to action so it reads as the flagship.
	_coinCard(c, featured) {
		const mc = fmtMc(c.marketCap);
		const sym = c.symbol ? '$' + c.symbol.toUpperCase().replace(/^\$/, '') : 'this coin';
		const liveBadge = featured
			? el('span', { class: 'cc-card-official', title: 'Official three.ws town' }, [
				el('span', { class: 'cc-card-official-ico', text: '◇' }),
				document.createTextNode('OFFICIAL'),
			])
			: el('span', { class: 'cc-card-live' }, [el('span', { class: 'cc-dot' }), document.createTextNode('LIVE')]);
		// Every coin has two worlds: the open General room (the card body) and a
		// gated Holders room. The badge is always visible so the holders' world is
		// discoverable on touch too; clicking it routes the player through the gate.
		const holdersBadge = el('button', {
			type: 'button', class: 'cc-card-holders',
			title: `Holders only — hold ${sym} to enter this coin’s gated world`,
			'aria-label': `Enter the ${sym} holders-only world`,
			onclick: (e) => { e.stopPropagation(); this.h.onEnter(c, 'holders'); },
		}, [el('span', { class: 'cc-card-holders-ico', 'aria-hidden': 'true', text: '🔒' }), document.createTextNode('Holders')]);
		return el('div', {
			class: 'cc-card' + (featured ? ' cc-card-featured' : ''),
			onclick: () => this.h.onEnter(c, ''),
		}, [
			el('div', { class: 'cc-card-img', style: c.image ? `background-image:url("${c.image}")` : '' }, [liveBadge, holdersBadge]),
			el('div', { class: 'cc-card-body' }, [
				el('div', { class: 'cc-card-name', text: c.name || 'Unnamed coin' }),
				el('div', { class: 'cc-card-meta' }, [
					el('span', { class: 'cc-card-sym', text: c.symbol ? '$' + c.symbol : '' }),
					mc ? el('span', { text: mc + ' mcap' }) : null,
				]),
				el('div', { class: 'cc-card-cta', text: featured ? 'Enter home town →' : 'Enter community →' }),
			]),
		]);
	}

	_renderSearching() {
		this.grid.appendChild(el('div', { class: 'cc-state' }, [
			el('span', { class: 'cc-spinner cc-spinner-lg' }),
			el('div', { text: 'Searching all of pump.fun…' }),
		]));
	}

	// ---------------------------------------------------------------- holder gate
	// A coin's Holders world is gated: the player must prove they hold ≥ the floor
	// (default $8) of the coin. This overlay is a thin view over the scene's gate
	// state machine (coincommunities.js _passHolderGate) — the scene drives us
	// through setHolderGate(state, data) and we report the player's choice back via
	// onHolderAction(action): 'signin' | 'wallet' | 'switch' | 'buy' | 'recheck' | 'cancel'.
	openHolderGate(coin) {
		if (this._gate) return; // already open — the scene re-uses it across states
		this._gateBody = el('div', { class: 'cc-gate-body' });
		const modal = el('div', {
			class: 'cc-gate-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Holder verification',
		}, [
			el('div', { class: 'cc-gate-head' }, [
				el('span', { class: 'cc-gate-tag', text: '🔒 Holders only' }),
				el('button', {
					type: 'button', class: 'cc-gate-x', 'aria-label': 'Cancel', text: '×',
					onclick: () => this.h.onHolderAction?.('cancel'),
				}),
			]),
			this._gateBody,
		]);
		// Backdrop click and Escape both read as "I don't want in" → cancel, which
		// drops the player back to the lobby (free to enter the open world instead).
		const overlay = el('div', {
			class: 'cc-gate-overlay',
			onclick: (e) => { if (e.target === overlay) this.h.onHolderAction?.('cancel'); },
		}, [modal]);
		this._gate = overlay;
		this._gateKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.h.onHolderAction?.('cancel'); } };
		document.addEventListener('keydown', this._gateKey, true);
		// Remember who opened the gate so focus returns there when it closes.
		this._gateOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		document.body.appendChild(overlay);
		this._gateTrapRelease = this._trapFocus(overlay);
		requestAnimationFrame(() => {
			overlay.classList.add('cc-on');
			(modal.querySelector('.cc-gate-x') || modal).focus?.();
		});
	}

	closeHolderGate() {
		const o = this._gate;
		if (!o) return;
		this._gate = null;
		this._gateBody = null;
		if (this._gateKey) { document.removeEventListener('keydown', this._gateKey, true); this._gateKey = null; }
		if (this._gateTrapRelease) { this._gateTrapRelease(); this._gateTrapRelease = null; }
		if (this._gateOpener?.isConnected) this._gateOpener.focus();
		this._gateOpener = null;
		o.classList.remove('cc-on');
		const done = () => o.remove();
		o.addEventListener('transitionend', done, { once: true });
		setTimeout(done, 280); // fallback if transitionend never fires
	}

	// Reveal the creator-only gate control once the server confirms ownership.
	setWorldCreator(isCreator) {
		if (this.gateBtn) this.gateBtn.hidden = !isCreator;
	}

	// Creator gate config (R24). A small modal where the coin's creator sets the
	// token amount a wallet must hold to enter the Holders world, or removes the
	// requirement. `onSave(minTokens)` returns a promise that resolves to the saved
	// config or rejects with a coded error; we drive the busy/error states off it.
	openGateConfig(coin, { minTokens = 0, unknown = false, onSave } = {}) {
		this.closeGateConfig();
		const sym = coin?.symbol ? '$' + String(coin.symbol).replace(/^\$/, '').toUpperCase() : 'this coin';
		const input = el('input', {
			type: 'number', min: '0', step: '1', inputmode: 'numeric',
			class: 'cc-gatecfg-input', value: minTokens > 0 ? String(minTokens) : '',
			placeholder: 'e.g. 1000000', 'aria-label': `Minimum ${sym} to enter the holders world`,
		});
		const errLine = el('p', { class: 'cc-gatecfg-err', hidden: !unknown });
		if (unknown) errLine.textContent = 'Couldn’t load the current gate — saving will overwrite it.';
		const hint = el('p', { class: 'cc-gatecfg-hint', text: `Leave blank to use the default ($-value) floor. Set a number to require that many ${sym} on-chain.` });
		const saveBtn = el('button', { type: 'button', class: 'cc-gate-btn cc-gate-primary', text: 'Save gate' });
		// "Remove gate" whenever a gate exists — or might exist (the read failed). Only
		// a confirmed-ungated world shows a plain "Cancel".
		const canRemove = minTokens > 0 || unknown;
		const clearBtn = el('button', {
			type: 'button', class: 'cc-gate-btn cc-gate-ghost',
			text: canRemove ? 'Remove gate' : 'Cancel',
		});
		const busy = (on) => {
			saveBtn.disabled = on; clearBtn.disabled = on; input.disabled = on;
			saveBtn.textContent = on ? 'Saving…' : 'Save gate';
		};
		const fail = (msg) => { errLine.textContent = msg; errLine.hidden = false; busy(false); };
		const commit = async (value) => {
			errLine.hidden = true; errLine.textContent = '';
			busy(true);
			try {
				await onSave?.(value);
				this.closeGateConfig();
				this.toast(value > 0 ? `Holders world now needs ${fmtCompact(value)} ${sym}.` : 'Holders gate removed — default floor applies.', 'success');
			} catch (err) {
				fail(err?.message || 'Couldn’t save the gate. Try again.');
			}
		};
		saveBtn.onclick = () => {
			const v = Math.floor(Number(input.value));
			if (!Number.isFinite(v) || v <= 0) return fail('Enter a positive number of tokens, or use Remove gate.');
			commit(v);
		};
		clearBtn.onclick = () => { if (canRemove) commit(0); else this.closeGateConfig(); };
		input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); saveBtn.click(); } e.stopPropagation(); };

		const body = el('div', { class: 'cc-gate-body' }, [
			el('h3', { class: 'cc-gate-title', text: 'Holders world gate' }),
			el('p', { class: 'cc-gate-msg', text: `Require holding ${sym} to enter this coin’s Holders world.` }),
			el('label', { class: 'cc-gatecfg-row' }, [
				el('span', { class: 'cc-gatecfg-label', text: `Minimum ${sym}` }), input,
			]),
			hint, errLine,
			el('div', { class: 'cc-gate-actions' }, [saveBtn, clearBtn]),
		]);
		const modal = el('div', {
			class: 'cc-gate-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Holders world gate',
		}, [
			el('div', { class: 'cc-gate-head' }, [
				el('span', { class: 'cc-gate-tag', text: '🔑 Creator' }),
				el('button', { type: 'button', class: 'cc-gate-x', 'aria-label': 'Close', text: '×', onclick: () => this.closeGateConfig() }),
			]),
			body,
		]);
		const overlay = el('div', {
			class: 'cc-gate-overlay', onclick: (e) => { if (e.target === overlay) this.closeGateConfig(); },
		}, [modal]);
		this._gateCfg = overlay;
		this._gateCfgKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.closeGateConfig(); } };
		document.addEventListener('keydown', this._gateCfgKey, true);
		this._gateCfgOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		document.body.appendChild(overlay);
		this._gateCfgTrapRelease = this._trapFocus(overlay);
		requestAnimationFrame(() => { overlay.classList.add('cc-on'); input.focus(); });
	}

	closeGateConfig() {
		const o = this._gateCfg;
		if (!o) return;
		this._gateCfg = null;
		if (this._gateCfgKey) { document.removeEventListener('keydown', this._gateCfgKey, true); this._gateCfgKey = null; }
		if (this._gateCfgTrapRelease) { this._gateCfgTrapRelease(); this._gateCfgTrapRelease = null; }
		if (this._gateCfgOpener?.isConnected) this._gateCfgOpener.focus();
		this._gateCfgOpener = null;
		o.classList.remove('cc-on');
		const done = () => o.remove();
		o.addEventListener('transitionend', done, { once: true });
		setTimeout(done, 280);
	}

	setHolderGate(state, data = {}) {
		if (!this._gate) this.openHolderGate(data);
		const body = this._gateBody;
		if (!body) return;
		const sym = data.symbol ? '$' + String(data.symbol).replace(/^\$/, '').toUpperCase() : 'this coin';
		const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
		const usd = '$' + round2(data.usd);
		// R24: a coin's creator can gate on a *token amount* instead of the USD floor.
		// When set, state the requirement and the player's holding in tokens of the
		// coin ("hold 1M $SYM"); otherwise fall back to the dollar floor.
		const tokenGated = Number(data.minTokens) > 0;
		const fmtAmt = (n) => fmtCompact(Number(n) || 0);
		const min = tokenGated
			? `${fmtAmt(data.minTokens)} ${sym}`
			: '$' + (data.minUsd ? round2(data.minUsd) : 8);
		const held = tokenGated ? `${fmtAmt(data.amount)} ${sym}` : usd;
		const btn = (label, action, variant = '') => el('button', {
			type: 'button', class: 'cc-gate-btn' + (variant ? ' ' + variant : ''),
			onclick: () => this.h.onHolderAction?.(action),
		}, [label]);
		const spin = () => el('div', { class: 'cc-gate-spin' }, [el('span', { class: 'cc-spinner cc-spinner-lg' })]);
		const title = (t) => el('h3', { class: 'cc-gate-title', text: t });
		const msg = (t) => el('p', { class: 'cc-gate-msg', text: t });
		const errLine = data.error ? el('p', { class: 'cc-gate-err', text: data.error }) : null;
		const actions = (...kids) => el('div', { class: 'cc-gate-actions' }, kids.filter(Boolean));

		let nodes;
		switch (state) {
			case 'checking':
				nodes = [spin(), title('Checking your holdings'), msg(`Pricing your ${sym} balance on-chain…`)];
				break;
			case 'working':
				nodes = [spin(), title('One moment'), msg(data.msg || 'Working…')];
				break;
			case 'granted':
				nodes = [el('div', { class: 'cc-gate-check', text: '✓' }), title('You’re in'), msg(`Verified ${held} of ${sym}. Welcome to the holders’ world.`)];
				break;
			case 'short':
				nodes = [
					el('div', { class: 'cc-gate-lock', text: '🔒' }),
					title('Holders only'),
					msg(`You hold ${held} of ${sym}. This world is for holders of ${min} or more.`),
					actions(
						btn(`Buy ${sym}`, 'buy', 'cc-gate-primary'),
						btn('I bought — re-check', 'recheck'),
						btn('Use a different wallet', 'switch'),
						btn('Enter the open world instead', 'cancel', 'cc-gate-ghost'),
					),
				];
				break;
			case 'auth':
				nodes = [
					el('div', { class: 'cc-gate-lock', text: '𝕏' }),
					title('Verify you’re a holder'),
					msg(`Sign in with X so we can check the wallet you hold ${sym} in. Your wallet is read server-side and never shared.`),
					errLine,
					actions(btn('Sign in with X', 'signin', 'cc-gate-primary'), btn('Cancel', 'cancel', 'cc-gate-ghost')),
				];
				break;
			case 'wallet':
				nodes = [
					el('div', { class: 'cc-gate-lock', text: '◎' }),
					title('Link your Solana wallet'),
					msg(`Connect the wallet that holds ${sym} and sign a message to link it. No transaction, no fee.`),
					errLine,
					actions(btn('Connect wallet', 'wallet', 'cc-gate-primary'), btn('Cancel', 'cancel', 'cc-gate-ghost')),
				];
				break;
			case 'error':
			default:
				nodes = [
					el('div', { class: 'cc-gate-lock', text: '!' }),
					title('Couldn’t verify'),
					msg(data.error || 'Something went wrong checking your holdings.'),
					actions(
						btn('Try again', 'recheck', 'cc-gate-primary'),
						btn('Use a different wallet', 'switch'),
						btn('Cancel', 'cancel', 'cc-gate-ghost'),
					),
				];
				break;
		}
		body.replaceChildren(...nodes.filter(Boolean));
	}

	// ---------------------------------------------------------------- HUD
	_buildHud() {
		this.coinImg = el('img', { class: 'cc-coin-img', alt: '' });
		this.coinName = el('div', { class: 'cc-coin-name', text: '' });
		this.coinSym = el('span', { class: 'cc-coin-sym', text: '' });
		this.onlineCount = el('span', { text: '1 online' });
		// Marks the gated Holders world so the player always knows which room they're
		// in and the floor they cleared. Hidden in the open General world.
		this.tierBadge = el('span', { class: 'cc-tier-badge', hidden: true });
		// Buy this coin from inside its own world — the most natural action in a
		// pump.fun community. Opens the native on-chain buy modal (lazy chunk).
		this.buyBtnLabel = el('span', { class: 'cc-buy-btn-text', text: 'Buy' });
		this.buyBtn = el('button', {
			class: 'cc-buy-btn', type: 'button', title: 'Buy this coin',
			onclick: () => this.h.onBuy?.(),
		}, [el('span', { class: 'cc-buy-btn-ico', text: '⚡' }), this.buyBtnLabel]);
		// Creator-only (R24): set the token threshold to enter this coin's Holders
		// world. Hidden until the server confirms this player is the coin's creator
		// (build-perms snapshot); shown in both the General and Holders worlds.
		this.gateBtn = el('button', {
			class: 'cc-gate-cfg-btn', type: 'button', hidden: true,
			title: 'Set who can enter the Holders world', 'aria-label': 'Configure the holders gate',
			onclick: () => this.h.onConfigureGate?.(),
		}, [el('span', { class: 'cc-gate-cfg-ico', 'aria-hidden': 'true', text: '🔑' }), el('span', { class: 'cc-gate-cfg-text', text: 'Gate' })]);
		// Open the cosmetics shop — browse + try cosmetics on your avatar live.
		this.shopBtn = el('button', {
			class: 'cc-shop-btn', type: 'button', title: 'Cosmetics — try looks on your avatar',
			'aria-label': 'Open cosmetics shop',
			onclick: () => this.h.onShop?.(),
		}, [el('span', { class: 'cc-shop-btn-ico', 'aria-hidden': 'true', text: '🛍️' }), el('span', { class: 'cc-shop-btn-text', text: 'Shop' })]);
		const banner = el('div', { class: 'cc-coin-banner' }, [
			this.coinImg,
			el('div', { class: 'cc-coin-info' }, [
				this.coinName,
				el('div', { class: 'cc-coin-sub' }, [
					this.coinSym,
					el('span', { class: 'cc-online' }, [el('span', { class: 'cc-dot' }), this.onlineCount]),
					this.tierBadge,
				]),
			]),
			this.shopBtn,
			this.gateBtn,
			this.buyBtn,
		]);

		const leave = el('button', { class: 'cc-leave', onclick: () => this.h.onLeave() }, [
			el('span', { text: '←' }), document.createTextNode('Communities'),
		]);

		this.statusText = el('span', { text: 'connecting…' });
		this.pingText = el('span', { class: 'cc-ping', hidden: true });
		const tryRetry = () => {
			if (['offline', 'failed'].includes(this.statusPill.getAttribute('data-state'))) this.h.onRetry?.();
		};
		this.statusPill = el('div', {
			id: 'cc-status', 'data-state': 'connecting',
			// Live region so screen readers announce connect/disconnect; becomes a
			// real keyboard-operable button only while a retry is possible (see
			// setStatus, which toggles tabindex + aria-label).
			role: 'status', 'aria-live': 'polite',
			onclick: tryRetry,
			onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tryRetry(); } },
		}, [el('span', { class: 'cc-dot' }), this.statusText, this.pingText]);

		this.chatLog = el('div', { class: 'cc-chat-log' });
		this.chatInput = el('input', {
			type: 'text', maxlength: '200', placeholder: 'Say something…',
			onkeydown: (e) => {
				if (e.key === 'Enter') this._sendChat();
				else if (e.key === 'Escape') this.chatInput.blur();
				e.stopPropagation();
			},
		});
		this.chatUnread = el('span', { class: 'cc-chat-unread', hidden: true });
		this.chatChevron = el('span', { class: 'cc-chat-chevron', text: '▾' });
		const head = el('div', {
			class: 'cc-chat-head', role: 'button', tabindex: '0', 'aria-label': 'Toggle chat',
			onclick: () => this.toggleChat(),
			onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.toggleChat(); } },
		}, [
			el('span', { class: 'cc-chat-title' }, [el('span', { class: 'cc-chat-ico', text: '💬' }), document.createTextNode('Chat')]),
			this.chatUnread,
			this.chatChevron,
		]);
		this.chatBody = el('div', { class: 'cc-chat-body' }, [
			this.chatLog,
			el('div', { class: 'cc-chat-input' }, [this.chatInput, el('button', { class: 'cc-chat-send', text: 'Send', onclick: () => this._sendChat() })]),
		]);
		this.chat = el('div', { id: 'cc-chat' }, [head, this.chatBody]);
		// Default: collapsed on touch (small screens), open on desktop — unless the
		// user has expressed a preference before.
		const stored = localStorage.getItem('cc-chat-min');
		this._unread = 0;
		this.toggleChat(stored != null ? stored === '1' : matchMedia('(pointer: coarse)').matches);
		const chat = this.chat;

		this.emoteTray = el('div', { id: 'cc-emotes', role: 'toolbar', 'aria-label': 'Emotes' });

		// Spatial voice toggle. Off by default (no mic until the player opts in);
		// the icon + label reflect every state (connecting / live / muted / blocked).
		// The SVG carries its own mute slash, shown via the button's data-state.
		this.voiceLabel = el('span', { class: 'cc-voice-label', text: 'Voice' });
		this.voiceBtn = el('button', {
			class: 'cc-voice', type: 'button', 'data-state': 'off',
			'aria-label': 'Voice chat', title: 'Join voice — talk to people near you',
			onclick: () => this.h.onVoiceToggle?.(),
		}, [
			el('span', { class: 'cc-voice-ico', html:
				'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
				+ '<rect class="cc-voice-cap" x="9" y="2.5" width="6" height="11" rx="3"/>'
				+ '<path class="cc-voice-stand" d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/>'
				+ '<line class="cc-voice-slash" x1="4" y1="3.4" x2="20" y2="20.6"/>'
				+ '</svg>' }),
			this.voiceLabel,
		]);

		const hint = el('div', { id: 'cc-hint', html:
			'<kbd>W A S D</kbd> / drag-joystick to move · <kbd>drag</kbd> to look · scroll zoom · <kbd>Enter</kbd> chat' });

		this.joystick = el('div', { id: 'cc-joystick' });

		this.hud = el('div', { id: 'cc-hud', hidden: true }, [banner, leave, this.statusPill, this.voiceBtn, chat, this.emoteTray, hint, this.joystick]);
		document.body.appendChild(this.hud);
	}

	// ---------------------------------------------------------------- build structures (R20)
	// The structures toolbar that rides above the block hotbar while build mode is
	// on: pick a composite piece (wall / floor / stairs / doorway) instead of a
	// single block, rotate it, screenshot-and-share the build, or open this coin's
	// featured builds. The block hotbar itself lives in build-voxels.js; this panel
	// is the "structures" layer on top of it.
	_buildStructures() {
		this._activePiece = null;

		// "Block" is the default single-cell tool; each composite piece follows.
		const tools = [{ id: null, name: 'Block', icon: '▪', key: 'B' }, ...COMPOSITE_PIECES];
		this._pieceBtns = new Map();
		const pieceRow = el('div', { class: 'cc-st-pieces', role: 'radiogroup', 'aria-label': 'Build tool' },
			tools.map((p) => {
				const btn = el('button', {
					class: 'cc-st-piece' + (p.id === null ? ' cc-on' : ''), type: 'button',
					role: 'radio', 'aria-checked': p.id === null ? 'true' : 'false',
					title: p.id === null ? 'Single block' : `${p.name} — one-click structure (R rotates)`,
					'aria-label': p.name,
					onclick: () => this.h.onPickPiece?.(p.id),
				}, [
					el('span', { class: 'cc-st-piece-ico', 'aria-hidden': 'true', text: p.icon || '▦' }),
					el('span', { class: 'cc-st-piece-name', text: p.name }),
				]);
				this._pieceBtns.set(p.id, btn);
				return btn;
			}));

		this.rotateBtn = el('button', {
			class: 'cc-st-rotate', type: 'button', disabled: true,
			title: 'Rotate the piece a quarter-turn (R)', 'aria-label': 'Rotate piece',
			onclick: () => this.h.onRotateBuild?.(),
		}, [
			el('span', { class: 'cc-st-rotate-ico', 'aria-hidden': 'true', text: '⟳' }),
			el('span', { class: 'cc-st-rotate-deg', text: ROT_DEG[0] }),
		]);

		const shareBtn = el('button', {
			class: 'cc-st-action', type: 'button', title: 'Screenshot & share this build',
			onclick: () => this.h.onShareBuild?.(),
		}, [el('span', { 'aria-hidden': 'true', text: '📸' }), document.createTextNode('Share')]);

		const featuredBtn = el('button', {
			class: 'cc-st-action', type: 'button', title: 'Featured builds in this world',
			onclick: () => this.h.onOpenFeatured?.(),
		}, [el('span', { 'aria-hidden': 'true', text: '🏛' }), document.createTextNode('Builds')]);

		this.structures = el('div', { id: 'cc-structures', hidden: true, 'aria-label': 'Build structures' }, [
			pieceRow,
			el('div', { class: 'cc-st-tools' }, [this.rotateBtn, el('span', { class: 'cc-st-sep' }), shareBtn, featuredBtn]),
		]);
		document.body.appendChild(this.structures);
	}

	/** Show/hide the structures toolbar with build mode. */
	setBuildToolsVisible(on) { if (this.structures) this.structures.hidden = !on; }

	/** Reflect the armed composite piece (null = single block); toggles rotate. */
	setBuildPiece(id) {
		this._activePiece = id ?? null;
		for (const [pid, btn] of this._pieceBtns) {
			const on = pid === this._activePiece;
			btn.classList.toggle('cc-on', on);
			btn.setAttribute('aria-checked', on ? 'true' : 'false');
		}
		this.rotateBtn.disabled = this._activePiece == null;
	}

	/** Reflect the current quarter-turn rotation on the rotate button. */
	setBuildRotation(rot) {
		this.rotateBtn.querySelector('.cc-st-rotate-deg').textContent = ROT_DEG[((rot % 4) + 4) % 4];
	}

	// ---------------------------------------------------------------- build props (R18)
	// The props palette that rides beside the structures toolbar in build mode: a
	// scroll-row of placeable props (crates, lamps, arches, a stage…) plus a rotate
	// button for touch (desktop also has the R key). Selecting a prop arms the object
	// placement layer; selecting it again returns to voxel building. Deleting your own
	// props reuses the build HUD's place/break toggle (break + tap removes).
	_buildPropPalette() {
		this._activeProp = null;
		this._propBtns = new Map();
		// Gallery streaming state: every public community model is placeable, paged in
		// after the built-in props as the user scrolls / searches / hits "More".
		this._gallery = { cursor: null, loading: false, done: false, started: false, q: '' };

		const items = PROP_CATALOG.map((p) => this._propButton(p));

		// A thin rule separates the hand-authored props from the community gallery that
		// streams in after them; hidden until the first gallery model lands.
		this._galleryDivider = el('div', { class: 'cc-prop-divider', hidden: true, 'aria-hidden': 'true' });
		this._galleryMore = el('button', {
			class: 'cc-prop cc-prop-more', type: 'button', hidden: true,
			title: 'Load more community models', 'aria-label': 'Load more community models',
			onclick: () => this._loadGalleryPage(),
		}, [
			el('span', { class: 'cc-prop-ico', 'aria-hidden': 'true', text: '＋' }),
			el('span', { class: 'cc-prop-name', text: 'More' }),
		]);
		this.propRow = el('div', { class: 'cc-prop-row', role: 'radiogroup', 'aria-label': 'Place a prop' },
			[...items, this._galleryDivider, this._galleryMore]);

		this.propSearch = el('input', {
			type: 'search', class: 'cc-prop-search', placeholder: 'Search models…',
			'aria-label': 'Search community models', maxlength: '60', autocomplete: 'off',
			oninput: (e) => this._onGallerySearch(e.target.value),
			// Swallow keys so typing in the search box never steers the avatar/build hotkeys.
			onkeydown: (e) => e.stopPropagation(),
		});

		this.propRotateBtn = el('button', {
			class: 'cc-prop-rotate', type: 'button', disabled: true,
			title: 'Rotate the prop a quarter-turn (R)', 'aria-label': 'Rotate prop',
			onclick: () => this.h.onRotateProp?.(),
		}, [el('span', { 'aria-hidden': 'true', text: '⟳' })]);

		const head = el('div', { class: 'cc-prop-head' }, [
			el('span', { class: 'cc-prop-title', text: 'Props' }),
			this.propSearch,
			this.propRotateBtn,
		]);

		this._galleryStatus = el('div', { class: 'cc-prop-gstatus', role: 'status', 'aria-live': 'polite', hidden: true });

		this.propPalette = el('div', { id: 'cc-props', hidden: true, 'aria-label': 'Build props' }, [head, this.propRow, this._galleryStatus]);
		document.body.appendChild(this.propPalette);
	}

	// One placeable-prop button. Built-in props show their emoji glyph; gallery models
	// show a real thumbnail (falling back to the glyph when a model has no render yet).
	_propButton(p) {
		const ico = p.thumbnail
			? el('img', { class: 'cc-prop-thumb', src: p.thumbnail, alt: '', loading: 'lazy', decoding: 'async' })
			: el('span', { class: 'cc-prop-ico', 'aria-hidden': 'true', text: p.icon || '◆' });
		const btn = el('button', {
			class: 'cc-prop', type: 'button',
			role: 'radio', 'aria-checked': 'false',
			title: `${p.name} — place a prop (R rotates, break mode removes yours)`,
			'aria-label': p.name,
			onclick: () => this.h.onPickProp?.(this._activeProp === p.id ? null : p.id),
		}, [ico, el('span', { class: 'cc-prop-name', text: p.name })]);
		this._propBtns.set(p.id, btn);
		return btn;
	}

	/** Show/hide the props palette with build mode; first open kicks off the gallery. */
	setPropPaletteVisible(on) {
		if (!this.propPalette) return;
		this.propPalette.hidden = !on;
		if (on) this._startGallery();
	}

	/** Reflect the armed prop (null = voxel layer); toggles the rotate button. */
	setPropSelected(id) {
		this._activeProp = id ?? null;
		let foundActive = false;
		for (const [pid, btn] of this._propBtns) {
			const on = pid === this._activeProp;
			if (on) foundActive = true;
			btn.classList.toggle('cc-on', on);
			btn.setAttribute('aria-checked', on ? 'true' : 'false');
		}
		// A gallery prop can be armed before its button has paged in (e.g. armed by a
		// deep link); scroll the active button into view when it exists.
		if (foundActive) this._propBtns.get(this._activeProp)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
		if (this.propRotateBtn) this.propRotateBtn.disabled = this._activeProp == null;
	}

	// ---- community gallery as placeable props -------------------------------------
	// Kick the first gallery page when the palette first opens; cheap no-op after.
	_startGallery() {
		if (this._gallery.started) return;
		this._gallery.started = true;
		this._loadGalleryPage();
	}

	// Debounced search: re-query the gallery for models matching the typed text.
	_onGallerySearch(value) {
		const q = (value || '').trim();
		if (q === this._gallery.q) return;
		this._gallery.q = q;
		clearTimeout(this._gallerySearchT);
		this._gallerySearchT = setTimeout(() => this._resetGallery(), 260);
	}

	// Drop every streamed gallery button (keeping built-in props) and re-page from the
	// top — used when the search query changes.
	_resetGallery() {
		for (const [id, btn] of this._propBtns) {
			if (id.startsWith(GALLERY_PROP_PREFIX)) { btn.remove(); this._propBtns.delete(id); }
		}
		this._galleryDivider.hidden = true;
		this._gallery.cursor = null;
		this._gallery.done = false;
		this._loadGalleryPage();
	}

	// Fetch one page of public gallery models and stream them in as placeable props.
	async _loadGalleryPage() {
		const g = this._gallery;
		if (g.loading || g.done) return;
		g.loading = true;
		this._galleryMore.hidden = true;
		const first = !g.cursor;
		if (first) this._setGalleryStatus('Loading community models…', false);
		try {
			const params = new URLSearchParams({ limit: '48' });
			if (g.cursor) params.set('cursor', g.cursor);
			if (g.q) params.set('q', g.q);
			const r = await fetch(`/api/avatars/public?${params}`, { headers: { accept: 'application/json' } });
			if (!r.ok) throw new Error(`gallery ${r.status}`);
			const { avatars, next_cursor: next } = await r.json();
			const list = (avatars || []).filter((a) => a.id && (a.model_url || a.base_model_url));
			for (const a of list) this._appendGalleryItem(a);
			g.cursor = next || null;
			g.done = !g.cursor || list.length === 0;
			const count = this._galleryCount();
			this._galleryMore.hidden = g.done || !count;
			this._setGalleryStatus(count ? '' : (g.q ? `No models match “${g.q}”.` : 'No community models yet.'), false);
		} catch (e) {
			log.warn('[cc-ui] gallery load failed', e?.message || e);
			this._setGalleryStatus('Couldn’t load models — tap to retry.', true);
			this._galleryMore.hidden = true;
		} finally {
			g.loading = false;
		}
	}

	_galleryCount() {
		let n = 0;
		for (const id of this._propBtns.keys()) if (id.startsWith(GALLERY_PROP_PREFIX)) n++;
		return n;
	}

	// Register a gallery model with the world-object catalog (so it can be placed +
	// rendered) and add its button to the palette, just before the trailing "More".
	_appendGalleryItem(a) {
		const id = GALLERY_PROP_PREFIX + a.id;
		if (this._propBtns.has(id)) return;
		registerGalleryProp(a.id, { url: a.model_url || a.base_model_url, name: a.name, thumbnail: a.thumbnail_url });
		const btn = this._propButton({ id, name: a.name || 'Model', icon: '🧍', thumbnail: a.thumbnail_url });
		btn.classList.add('cc-prop-gallery');
		this.propRow.insertBefore(btn, this._galleryMore);
		this._galleryDivider.hidden = false;
	}

	// Render a one-line gallery status (loading / empty / error). The error variant is
	// tappable to retry the failed page.
	_setGalleryStatus(msg, isError) {
		const s = this._galleryStatus;
		if (!s) return;
		s.textContent = msg || '';
		s.hidden = !msg;
		s.classList.toggle('cc-err', !!isError);
		if (isError) {
			s.setAttribute('role', 'button');
			s.tabIndex = 0;
			s.onclick = () => { this._gallery.done = false; this._loadGalleryPage(); };
		} else {
			s.setAttribute('role', 'status');
			s.removeAttribute('tabindex');
			s.onclick = null;
		}
	}

	// ---------------------------------------------------------------- share sheet (R20)
	// A modal that shows the captured screenshot and offers three ways to share the
	// build: copy a deep link back into this world, download the image, or publish
	// it to the coin's featured builds. The scene captures the shot and owns the
	// publish call; this only renders and routes the user's choice.
	openShareSheet({ image, link, blocks, coinName, canPublish }) {
		this.closeShareSheet();
		const titleInput = el('input', {
			type: 'text', maxlength: '60', class: 'cc-share-title',
			placeholder: 'Name your build (optional)', 'aria-label': 'Build name',
			onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') publish(); },
		});
		const status = el('div', { class: 'cc-share-status', role: 'status', 'aria-live': 'polite', hidden: true });
		const setStatus = (msg, kind) => {
			status.hidden = !msg;
			status.textContent = msg || '';
			status.setAttribute('data-kind', kind || '');
		};

		const copyBtn = el('button', { class: 'cc-share-btn', type: 'button' },
			[el('span', { 'aria-hidden': 'true', text: '🔗' }), document.createTextNode('Copy link')]);
		copyBtn.addEventListener('click', async () => {
			try { await navigator.clipboard.writeText(link); setStatus('Link copied to clipboard.', 'ok'); }
			catch { setStatus('Couldn’t copy — select and copy the link manually.', 'warn'); }
		});

		const dlBtn = el('a', {
			class: 'cc-share-btn', href: image, download: `threews-build-${Date.now()}.jpg`,
		}, [el('span', { 'aria-hidden': 'true', text: '⬇' }), document.createTextNode('Download')]);

		const publishBtn = el('button', {
			class: 'cc-share-btn cc-primary', type: 'button', disabled: !canPublish,
			title: canPublish ? 'Publish to this world’s featured builds' : 'Build something first',
		}, [el('span', { 'aria-hidden': 'true', text: '🏛' }), document.createTextNode('Publish to featured')]);
		const publish = async () => {
			if (publishBtn.disabled) return;
			publishBtn.disabled = true;
			setStatus('Publishing…', '');
			const res = await this.h.onPublishBuild?.({ image, title: titleInput.value });
			if (res?.ok) {
				setStatus('Published! It’s now in this world’s featured builds.', 'ok');
				publishBtn.textContent = '✓ Published';
			} else {
				setStatus(res?.error || 'Couldn’t publish — try again.', 'warn');
				publishBtn.disabled = false;
			}
		};
		publishBtn.addEventListener('click', publish);

		const closeBtn = el('button', {
			class: 'cc-share-close', type: 'button', 'aria-label': 'Close', title: 'Close',
			onclick: () => this.closeShareSheet(),
		}, ['✕']);

		const card = el('div', {
			class: 'cc-share-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Share your build',
			onclick: (e) => e.stopPropagation(),
		}, [
			closeBtn,
			el('div', { class: 'cc-share-head' }, [
				el('h3', { class: 'cc-share-h', text: 'Share your build' }),
				el('p', { class: 'cc-share-sub', text: `${coinName} · ${blocks.toLocaleString()} block${blocks === 1 ? '' : 's'}` }),
			]),
			el('div', { class: 'cc-share-shot' }, [el('img', { src: image, alt: 'Screenshot of your build' })]),
			titleInput,
			el('div', { class: 'cc-share-actions' }, [copyBtn, dlBtn, publishBtn]),
			status,
		]);
		this.shareSheet = el('div', { id: 'cc-share', onclick: () => this.closeShareSheet() }, [card]);
		this._shareKeydown = (e) => { if (e.key === 'Escape') this.closeShareSheet(); };
		document.addEventListener('keydown', this._shareKeydown);
		document.body.appendChild(this.shareSheet);
		requestAnimationFrame(() => this.shareSheet?.classList.add('cc-on'));
		(canPublish ? titleInput : copyBtn).focus();
	}

	closeShareSheet() {
		if (this._shareKeydown) { document.removeEventListener('keydown', this._shareKeydown); this._shareKeydown = null; }
		if (this.shareSheet) { this.shareSheet.remove(); this.shareSheet = null; }
	}

	// ---------------------------------------------------------------- featured builds (R20)
	// A per-coin surface of shared builds. Designed for every state: loading
	// (skeletons), empty (a clear call to be the first), error (retry), and a
	// populated grid whose cards link back into the world.
	openFeatured(coinLabel) {
		if (this.featuredPanel) { this.featuredPanel.remove(); this.featuredPanel = null; }
		this._featuredBody = el('div', { class: 'cc-fb-body' });
		const closeBtn = el('button', {
			class: 'cc-fb-close', type: 'button', 'aria-label': 'Close', title: 'Close',
			onclick: () => this.closeFeatured(),
		}, ['✕']);
		const card = el('div', {
			class: 'cc-fb-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Featured builds',
			onclick: (e) => e.stopPropagation(),
		}, [
			closeBtn,
			el('div', { class: 'cc-fb-head' }, [
				el('h3', { class: 'cc-fb-h', html: '🏛 Featured builds' }),
				el('p', { class: 'cc-fb-sub', text: `Creations shared in ${coinLabel}` }),
			]),
			this._featuredBody,
		]);
		this.featuredPanel = el('div', { id: 'cc-featured', onclick: () => this.closeFeatured() }, [card]);
		this._featuredKeydown = (e) => { if (e.key === 'Escape') this.closeFeatured(); };
		document.addEventListener('keydown', this._featuredKeydown);
		document.body.appendChild(this.featuredPanel);
		requestAnimationFrame(() => this.featuredPanel?.classList.add('cc-on'));
		closeBtn.focus();
	}

	closeFeatured() {
		this._featuredOpen = false;
		if (this._featuredKeydown) { document.removeEventListener('keydown', this._featuredKeydown); this._featuredKeydown = null; }
		if (this.featuredPanel) { this.featuredPanel.remove(); this.featuredPanel = null; }
		this.h.onFeaturedClosed?.();
	}

	setFeaturedLoading() {
		if (!this._featuredBody) return;
		this._featuredBody.textContent = '';
		const grid = el('div', { class: 'cc-fb-grid', 'aria-busy': 'true' },
			Array.from({ length: 4 }, () => el('div', { class: 'cc-fb-skel' })));
		this._featuredBody.appendChild(grid);
	}

	setFeaturedError(retry) {
		if (!this._featuredBody) return;
		this._featuredBody.textContent = '';
		this._featuredBody.appendChild(el('div', { class: 'cc-fb-state' }, [
			el('span', { class: 'cc-fb-state-ico', 'aria-hidden': 'true', text: '⚠️' }),
			el('p', { class: 'cc-fb-state-msg', text: 'Couldn’t load featured builds.' }),
			el('button', { class: 'cc-fb-retry', type: 'button', text: 'Try again', onclick: () => retry?.() }),
		]));
	}

	setFeaturedBuilds(list) {
		if (!this._featuredBody) return;
		this._featuredBody.textContent = '';
		if (!list || list.length === 0) {
			this._featuredBody.appendChild(el('div', { class: 'cc-fb-state' }, [
				el('span', { class: 'cc-fb-state-ico', 'aria-hidden': 'true', text: '🏗️' }),
				el('p', { class: 'cc-fb-state-msg', text: 'No featured builds yet.' }),
				el('p', { class: 'cc-fb-state-hint', text: 'Build something, hit Share, and publish it to be the first.' }),
			]));
			return;
		}
		const grid = el('div', { class: 'cc-fb-grid' }, list.map((b) => this._featuredCard(b)));
		this._featuredBody.appendChild(grid);
	}

	_featuredCard(b) {
		const q = new URLSearchParams({ coin: b.mint || '' });
		if (b.coinName) q.set('name', b.coinName);
		if (b.coinSymbol) q.set('symbol', b.coinSymbol);
		const href = `/play?${q.toString()}`;
		const meta = [b.author ? `by ${b.author}` : null, b.blocks ? `${Number(b.blocks).toLocaleString()} blocks` : null, timeAgo(b.createdAt)]
			.filter(Boolean).join(' · ');
		return el('a', { class: 'cc-fb-item', href, title: 'Enter this world' }, [
			el('div', { class: 'cc-fb-thumb' }, [
				b.thumb ? el('img', { src: b.thumb, alt: b.title || 'Featured build', loading: 'lazy' })
					: el('div', { class: 'cc-fb-thumb-empty', 'aria-hidden': 'true', text: '🧱' }),
			]),
			el('div', { class: 'cc-fb-meta' }, [
				el('div', { class: 'cc-fb-title', text: b.title || 'Untitled build' }),
				el('div', { class: 'cc-fb-byline', text: meta }),
			]),
			el('span', { class: 'cc-fb-enter', 'aria-hidden': 'true', text: 'Enter →' }),
		]);
	}

	// Reflect the voice engine's state on the mic button: label, tooltip, and the
	// data-state hook the CSS uses to colour the icon / show the mute slash.
	setVoiceState(state) {
		if (!this.voiceBtn) return;
		const map = {
			off:        ['Voice',        'Join voice — talk to people near you'],
			connecting: ['Connecting…',  'Requesting microphone access…'],
			on:         ['Mic on',       'You’re live — click to mute'],
			muted:      ['Muted',        'Muted — click to unmute (you can still hear everyone)'],
			denied:     ['Mic blocked',  'Microphone blocked — allow it in your browser settings'],
			error:      ['Voice error',  'Couldn’t start voice — check your mic and try again'],
			unsupported:['No voice',     'Voice chat isn’t supported in this browser'],
		};
		const [label, title] = map[state] || map.off;
		this.voiceBtn.setAttribute('data-state', state);
		this.voiceLabel.textContent = label;
		this.voiceBtn.title = title;
		this.voiceBtn.disabled = state === 'unsupported';
		if (state !== 'on') this.voiceBtn.classList.remove('cc-voice-speaking');
	}

	// Pulse the mic button while the local player is actually speaking.
	setMicSpeaking(on) { this.voiceBtn?.classList.toggle('cc-voice-speaking', !!on); }

	setEmotes(list) {
		this.emoteTray.textContent = '';
		for (const e of list) {
			this.emoteTray.appendChild(el('button', {
				// The visible text is an emoji, so give SR users the emote's real
				// name as the accessible label rather than the raw glyph.
				class: 'cc-emote', type: 'button', title: e.label || e.name,
				'aria-label': e.label || e.name, text: e.icon || '🙂',
				onclick: () => this.h.onEmote(e.name),
			}));
		}
	}

	_sendChat() {
		const text = this.chatInput.value.trim();
		if (!text) return;
		this.h.onChat(text);
		this.chatInput.value = '';
	}

	enterWorld(coin) {
		this.lobby.hidden = true;
		this.hud.hidden = false;
		this.coinName.textContent = coin.name || 'Community';
		this.coinSym.textContent = coin.symbol ? '$' + coin.symbol : '';
		this.buyBtnLabel.textContent = coin.symbol ? 'Buy $' + coin.symbol.toUpperCase() : 'Buy';
		if (coin.image) { this.coinImg.src = coin.image; this.coinImg.style.display = ''; }
		else this.coinImg.style.display = 'none';
		this.refreshTierBadge(coin);
		this.chatLog.textContent = '';
		this._unread = 0;
		this.chatUnread.hidden = true;
		this.pingText.hidden = true;
	}

	// The Holders badge states the real entry bar: a creator-set token threshold
	// (R24) reads "1M $SYM+", otherwise the USD floor reads "$8+". Extracted so the
	// creator can update it live after saving a new gate without rebuilding the HUD.
	refreshTierBadge(coin) {
		const holders = coin.tier === 'holders';
		this.tierBadge.hidden = !holders;
		const sym = coin.symbol ? '$' + String(coin.symbol).replace(/^\$/, '').toUpperCase() : '';
		const req = coin.holderMinTokens > 0
			? `${fmtCompact(coin.holderMinTokens)} ${sym}+`
			: `$${coin.holderMinUsd ? Math.round(coin.holderMinUsd * 100) / 100 : 8}+`;
		this.tierBadge.textContent = holders ? `🔒 Holders · ${req}` : '';
	}

	showLobby() {
		this.hud.hidden = true;
		this.lobby.hidden = false;
		this._renderGrid();
	}

	setStatus(state) {
		const labels = { connecting: 'connecting…', online: 'connected', offline: 'reconnecting…', unavailable: 'multiplayer unavailable', failed: 'offline — retry', idle: 'idle' };
		this.statusPill.setAttribute('data-state', state);
		this.statusText.textContent = labels[state] || state;
		// The latency readout is only meaningful while the link is live.
		if (state !== 'online') this.pingText.hidden = true;
		// Only expose the pill to the keyboard / label it as actionable while a
		// retry actually does something — otherwise it's a passive status readout.
		const retryable = state === 'offline' || state === 'failed';
		if (retryable) {
			this.statusPill.setAttribute('tabindex', '0');
			this.statusPill.setAttribute('role', 'button');
			this.statusPill.setAttribute('aria-label', `Connection ${labels[state]} — activate to reconnect`);
			this.statusPill.title = 'Reconnect';
		} else {
			this.statusPill.removeAttribute('tabindex');
			this.statusPill.setAttribute('role', 'status');
			this.statusPill.removeAttribute('aria-label');
			this.statusPill.removeAttribute('title');
		}
	}

	// Show the live round-trip latency next to the status dot. Colour-coded so a
	// glance reads as healthy (green), okay (amber), or laggy (red).
	setPing(ms) {
		if (this.statusPill.getAttribute('data-state') !== 'online') return;
		this.pingText.hidden = false;
		this.pingText.textContent = `${ms}ms`;
		this.pingText.setAttribute('data-grade', ms < 90 ? 'good' : ms < 200 ? 'ok' : 'bad');
	}

	setOnline(n) { this.onlineCount.textContent = `${n} online`; }

	/** Persist the typed display name and, if connected, broadcast it live. */
	_commitName() {
		const name = this.nameInput.value.trim().slice(0, 24);
		if (name) localStorage.setItem('cc-name', name);
		this.h.onRename?.(name);
	}

	/** The chosen display name, or '' to let the caller fall back to a guest id. */
	getName() { return this.nameInput.value.trim().slice(0, 24); }

	/** Reflect a name assigned elsewhere (e.g. a generated guest id) in the field. */
	setName(name) { if (name) this.nameInput.value = name; }

	// Transient bottom-center toast for one-off notices (avatar fell back to a
	// stand-in, etc.). Self-dismisses; a new toast replaces the previous one.
	toast(msg, kind = '') {
		if (!this._toast) {
			this._toast = el('div', { id: 'cc-toast', role: 'status', 'aria-live': 'polite' });
			document.body.appendChild(this._toast);
		}
		clearTimeout(this._toastTimer);
		this._toast.textContent = msg;
		this._toast.setAttribute('data-kind', kind);
		this._toast.classList.add('cc-on');
		this._toastTimer = setTimeout(() => this._toast.classList.remove('cc-on'), 4200);
	}

	addChat({ name, text, mine }) {
		const t = new Date();
		const stamp = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
		// Stick to bottom only if the user is already near it, so reading scrollback
		// isn't yanked away when a new message lands.
		const nearBottom = this.chatLog.scrollHeight - this.chatLog.scrollTop - this.chatLog.clientHeight < 60;
		const row = el('div', { class: 'cc-chat-msg' + (mine ? ' cc-mine' : '') }, [
			el('span', { class: 'cc-chat-meta' }, [
				el('b', { text: name }),
				el('time', { text: stamp }),
			]),
			el('span', { class: 'cc-chat-text', text }),
		]);
		this.chatLog.appendChild(row);
		while (this.chatLog.children.length > 200) this.chatLog.removeChild(this.chatLog.firstChild);
		if (nearBottom || mine) this.chatLog.scrollTop = this.chatLog.scrollHeight;
		if (this._chatMin && !mine) {
			this._unread += 1;
			this.chatUnread.textContent = this._unread > 99 ? '99+' : String(this._unread);
			this.chatUnread.hidden = false;
		}
	}

	/** Collapse/expand the chat sidebar. Pass a boolean to force a state. */
	toggleChat(force) {
		this._chatMin = typeof force === 'boolean' ? force : !this._chatMin;
		this.chat.classList.toggle('cc-min', this._chatMin);
		this.chatChevron.textContent = this._chatMin ? '▴' : '▾';
		this.chat.setAttribute('aria-expanded', String(!this._chatMin));
		localStorage.setItem('cc-chat-min', this._chatMin ? '1' : '0');
		if (!this._chatMin) {
			this._unread = 0;
			this.chatUnread.hidden = true;
			this.chatLog.scrollTop = this.chatLog.scrollHeight;
		}
	}

	/** Open the sidebar (if collapsed) and put the cursor in the input. */
	focusChat() {
		if (this._chatMin) this.toggleChat(false);
		this.chatInput.focus();
	}

	get chatFocused() { return document.activeElement === this.chatInput; }
}
