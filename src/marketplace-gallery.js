/**
 * Walk-Browse — the marketplace as a 3D gallery you stroll through.
 *
 * Activated only on /marketplace-walk (walk.js boots with ?gallery=marketplace).
 * Every marketplace listing — agents, avatars, skills — becomes a lit plinth in
 * a procedurally generated hall: artwork on a vertical billboard, title + price
 * floating above. Walk within two metres and the full listing slides in from the
 * right; press E (or tap) to open its detail page.
 *
 * The hall is endless. The walk engine pins the avatar inside a bounded ground
 * disc, so rather than march the avatar down an infinite corridor we run a
 * treadmill: the player's forward travel scrolls a belt of plinths past a fixed
 * anchor while the avatar stays centred. A pool of plinth meshes recycles from
 * back to front — when one slides behind you it leaps to the far end carrying the
 * next listing — so memory is constant no matter how far you browse. Listings
 * stream in page-by-page from the real marketplace APIs; once every page is in,
 * the hall loops the full catalogue so it never dead-ends.
 *
 * Everything rendered is real: agents from /api/marketplace/agents, avatars from
 * /api/explore, skills from /api/skills — same data, prices, and detail routes
 * the 2D grid uses, so a number never disagrees across surfaces.
 */

import {
	Group,
	Mesh,
	PlaneGeometry,
	CylinderGeometry,
	BoxGeometry,
	RingGeometry,
	MeshBasicMaterial,
	MeshStandardMaterial,
	CanvasTexture,
	TextureLoader,
	SRGBColorSpace,
	DoubleSide,
	Color,
	MathUtils,
} from 'three';

// ── Layout (metres) ─────────────────────────────────────────────────────────
const SPACING = 4; // a plinth every 4m down the hall
const START_Z = 4; // first plinth sits 4m ahead of the anchor
const SLOT_COUNT = 10; // recycled plinth pool — covers the full visible span
const SIDE_X = 3; // plinths stand 3m off the centre line, alternating sides
const ANCHOR_Z = 0; // world-z the avatar is pinned to (treadmill centre)
const LATERAL_LIMIT = 7.5; // how far the player may strafe off the centre line
const RECYCLE_BEHIND = 6; // once a plinth is this far behind, recycle it forward
const ENTER_RANGE = 2.0; // step within 2m → reveal the listing
const RELEASE_RANGE = 3.4; // step past this → dismiss (hysteresis stops flicker)
const REBASE_AT = 500; // fold belt offset back near 0 to preserve float precision

const PAGE_SIZE = 18;
const TYPE_ACCENT = { agent: '#8b5cf6', avatar: '#22d3ee', skill: '#34d399' };
const TYPE_LABEL = { agent: 'Agent', avatar: 'Avatar', skill: 'Skill' };

const FILTERS = [
	{ key: 'all', label: 'All' },
	{ key: 'agent', label: 'Agents' },
	{ key: 'avatar', label: 'Avatars' },
	{ key: 'skill', label: 'Skills' },
];

const STYLE_ID = 'marketplace-gallery-styles';

function ensureStyles() {
	if (document.getElementById(STYLE_ID)) return;
	const s = document.createElement('style');
	s.id = STYLE_ID;
	s.textContent = `
.mwg-chips{position:fixed;top:calc(env(safe-area-inset-top,0) + 116px);left:50%;
	transform:translateX(-50%);z-index:6;display:flex;gap:6px;padding:5px;border-radius:999px;
	background:rgba(10,10,12,.72);border:1px solid rgba(255,255,255,.1);
	backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 8px 28px rgba(0,0,0,.4);}
.mwg-chip{appearance:none;border:0;background:transparent;color:#a1a1aa;font:inherit;font-size:13px;
	font-weight:600;padding:7px 15px;border-radius:999px;cursor:pointer;white-space:nowrap;
	transition:background .15s ease,color .15s ease;}
.mwg-chip:hover{color:#fafafa;background:rgba(255,255,255,.06);}
.mwg-chip[aria-pressed="true"]{color:#0a0a0a;background:#fafafa;}
.mwg-chip:focus-visible{outline:2px solid rgba(255,255,255,.6);outline-offset:2px;}

.mwg-panel{position:fixed;top:50%;right:max(16px,env(safe-area-inset-right,0));
	transform:translate(calc(100% + 32px),-50%);z-index:7;width:min(340px,calc(100vw - 32px));
	max-height:min(78vh,640px);overflow:hidden auto;border-radius:18px;
	background:rgba(12,12,14,.86);border:1px solid rgba(255,255,255,.12);
	backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
	box-shadow:0 24px 70px rgba(0,0,0,.55);color:#fafafa;
	transition:transform .32s cubic-bezier(.22,1,.36,1),opacity .26s ease;opacity:0;
	scrollbar-width:thin;}
.mwg-panel[data-show="1"]{transform:translate(0,-50%);opacity:1;}
.mwg-panel-media{position:relative;width:100%;aspect-ratio:16/10;background:#17171b;overflow:hidden;}
.mwg-panel-media img{width:100%;height:100%;object-fit:cover;display:block;}
.mwg-panel-fallback{width:100%;height:100%;display:flex;align-items:center;justify-content:center;
	font-size:64px;font-weight:800;color:rgba(255,255,255,.9);}
.mwg-panel-badge{position:absolute;top:12px;left:12px;font-size:11px;font-weight:700;
	letter-spacing:.04em;text-transform:uppercase;padding:5px 10px;border-radius:999px;
	color:#0a0a0a;}
.mwg-panel-body{padding:16px 18px 18px;}
.mwg-panel-title{margin:0 0 4px;font-size:18px;font-weight:700;line-height:1.25;}
.mwg-panel-author{margin:0 0 10px;font-size:12px;color:#a1a1aa;}
.mwg-panel-desc{margin:0 0 14px;font-size:13px;line-height:1.5;color:#c8c8d0;
	display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden;}
.mwg-panel-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;}
.mwg-panel-price{font-size:17px;font-weight:700;}
.mwg-panel-cat{font-size:11px;font-weight:600;color:#a1a1aa;text-transform:capitalize;
	padding:4px 9px;border-radius:999px;background:rgba(255,255,255,.06);}
.mwg-panel-cta{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;
	appearance:none;border:0;border-radius:12px;padding:12px 16px;font:inherit;font-size:14px;
	font-weight:700;color:#0a0a0a;cursor:pointer;transition:filter .15s ease,transform .1s ease;}
.mwg-panel-cta:hover{filter:brightness(1.08);}
.mwg-panel-cta:active{transform:scale(.98);}
.mwg-panel-cta:focus-visible{outline:2px solid #fff;outline-offset:2px;}
.mwg-panel-hint{margin:9px 0 0;text-align:center;font-size:11px;color:#71717a;}
.mwg-panel-hint kbd{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;padding:1px 5px;
	border-radius:4px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14);}

.mwg-prompt{position:fixed;left:50%;bottom:calc(86px + env(safe-area-inset-bottom,0));
	transform:translateX(-50%) translateY(8px);z-index:6;display:none;align-items:center;gap:9px;
	padding:9px 16px;border-radius:999px;background:rgba(10,10,12,.82);
	border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
	color:#fafafa;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 8px 26px rgba(0,0,0,.45);
	transition:opacity .2s ease,transform .2s ease;opacity:0;}
.mwg-prompt[data-show="1"]{display:inline-flex;opacity:1;transform:translateX(-50%) translateY(0);}
.mwg-prompt kbd{font-family:ui-monospace,Menlo,monospace;font-size:11px;padding:2px 7px;border-radius:5px;
	background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.2);}

.mwg-toast{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0) + 168px);
	transform:translateX(-50%);z-index:6;display:none;align-items:center;gap:12px;
	padding:12px 18px;border-radius:14px;background:rgba(12,12,14,.9);
	border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
	color:#fafafa;font-size:13px;box-shadow:0 12px 40px rgba(0,0,0,.5);max-width:min(420px,calc(100vw - 32px));}
.mwg-toast[data-show="1"]{display:inline-flex;}
.mwg-toast a,.mwg-toast button{color:#8b5cf6;font-weight:700;text-decoration:none;background:none;
	border:0;font:inherit;cursor:pointer;padding:0;white-space:nowrap;}

@media (hover:none),(max-width:640px){
	.mwg-chips{top:calc(env(safe-area-inset-top,0) + 104px);}
	.mwg-panel{top:auto;bottom:calc(150px + env(safe-area-inset-bottom,0));right:50%;
		transform:translate(50%,calc(100% + 40px));width:min(360px,calc(100vw - 24px));max-height:46vh;}
	.mwg-panel[data-show="1"]{transform:translate(50%,0);}
	.mwg-prompt{bottom:calc(150px + env(safe-area-inset-bottom,0));}
}
@media (prefers-reduced-motion:reduce){
	.mwg-panel,.mwg-prompt,.mwg-chip,.mwg-panel-cta{transition:none;}
}
body.is-zen .mwg-chips,body.is-zen .mwg-panel,body.is-zen .mwg-prompt,body.is-zen .mwg-toast{display:none !important;}
`;
	document.head.appendChild(s);
}

// ── Listing normalisation ───────────────────────────────────────────────────
function fmtTokenPrice(price) {
	if (!price || price.amount == null) return 'Free';
	const dec = Number(price.mint_decimals ?? 6);
	const v = Number(price.amount) / Math.pow(10, dec);
	if (!Number.isFinite(v) || v <= 0) return 'Free';
	return `$${v >= 1 ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : v.toFixed(2)}`;
}

function normalizeAgent(a) {
	return {
		type: 'agent',
		name: a.name || 'Untitled agent',
		description: a.description || '',
		image: a.thumbnail_url || null,
		price: fmtTokenPrice(a.price),
		category: a.category || '',
		author: null,
		href: `/marketplace/agents/${encodeURIComponent(a.id)}`,
	};
}

function normalizeAvatar(a) {
	return {
		type: 'avatar',
		name: a.name || 'Untitled avatar',
		description: a.description || '',
		image: a.image || null,
		price: fmtTokenPrice(a.price),
		category: a.modelCategory || 'avatar',
		author: a.author?.displayName || a.author?.handle || null,
		href: `/marketplace/avatars/${encodeURIComponent(a.avatarId)}`,
	};
}

function normalizeSkill(s) {
	const usd = Number(s.price_per_call_usd);
	return {
		type: 'skill',
		name: s.name || 'Untitled skill',
		description: s.description || '',
		image: null,
		price: usd > 0 ? `$${usd}/call` : 'Free',
		category: s.category || '',
		author: s.author?.display_name || null,
		href: `/marketplace/skills/${encodeURIComponent(s.slug || s.id)}`,
	};
}

/**
 * @param {object} cfg
 * @param {import('three').Scene} cfg.scene
 * @param {() => {x:number,y:number,z:number}} cfg.getLocalPosition
 */
export function createMarketplaceGallery({ scene, getLocalPosition }) {
	ensureStyles();

	const texLoader = new TextureLoader();
	texLoader.setCrossOrigin('anonymous');

	// ── Static hall: a runner + side bases anchored under the avatar so the
	//    scrolling plinths always have a floor (the engine's ground disc is
	//    only 12m wide; the hall reaches far past it). ─────────────────────────
	const hall = new Group();
	hall.name = 'mwg-hall';
	const runner = new Mesh(
		new PlaneGeometry(7, 80),
		new MeshStandardMaterial({ color: 0xd9d5cc, roughness: 0.95, metalness: 0 }),
	);
	runner.rotation.x = -Math.PI / 2;
	runner.position.set(0, 0.02, ANCHOR_Z - 28);
	runner.receiveShadow = true;
	hall.add(runner);
	const centerLine = new Mesh(
		new PlaneGeometry(0.12, 80),
		new MeshBasicMaterial({ color: 0xb8b2a6 }),
	);
	centerLine.rotation.x = -Math.PI / 2;
	centerLine.position.set(0, 0.03, ANCHOR_Z - 28);
	hall.add(centerLine);
	for (const sx of [-3.5, 3.5]) {
		const base = new Mesh(
			new BoxGeometry(0.5, 0.5, 80),
			new MeshStandardMaterial({ color: 0xf2efe9, roughness: 0.9, metalness: 0 }),
		);
		base.position.set(sx, 0.25, ANCHOR_Z - 28);
		base.castShadow = true;
		base.receiveShadow = true;
		hall.add(base);
	}
	scene.add(hall);

	// ── Plinth pool (recycled) ─────────────────────────────────────────────────
	const belt = new Group();
	belt.name = 'mwg-belt';
	scene.add(belt);

	/** @type {Array<ReturnType<typeof buildSlot>>} */
	const slots = [];

	function makeFallbackTexture(name, accentHex) {
		const c = document.createElement('canvas');
		c.width = 512;
		c.height = 640;
		const ctx = c.getContext('2d');
		const g = ctx.createLinearGradient(0, 0, 0, 640);
		g.addColorStop(0, accentHex);
		g.addColorStop(1, '#0c0c0e');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, 512, 640);
		ctx.fillStyle = 'rgba(255,255,255,.92)';
		ctx.font = '800 240px Inter, system-ui, sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText((name || '?').trim().charAt(0).toUpperCase() || '?', 256, 320);
		const tex = new CanvasTexture(c);
		tex.colorSpace = SRGBColorSpace;
		return tex;
	}

	function drawLabel(canvas, listing, accentHex) {
		const ctx = canvas.getContext('2d');
		const W = canvas.width;
		const H = canvas.height;
		ctx.clearRect(0, 0, W, H);
		const r = 26;
		ctx.fillStyle = 'rgba(10,10,12,.92)';
		ctx.beginPath();
		ctx.moveTo(r, 0);
		ctx.arcTo(W, 0, W, H, r);
		ctx.arcTo(W, H, 0, H, r);
		ctx.arcTo(0, H, 0, 0, r);
		ctx.arcTo(0, 0, W, 0, r);
		ctx.fill();
		ctx.fillStyle = accentHex;
		ctx.fillRect(0, 0, 12, H);
		// name (truncate to fit one line)
		ctx.fillStyle = '#fafafa';
		ctx.font = '700 52px Inter, system-ui, sans-serif';
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'left';
		let name = listing.name || '';
		while (ctx.measureText(name).width > W - 60 && name.length > 1) {
			name = name.slice(0, -2);
		}
		if (name !== (listing.name || '')) name = name.trimEnd() + '…';
		ctx.fillText(name, 36, H * 0.36);
		// price + type
		ctx.font = '700 44px Inter, system-ui, sans-serif';
		ctx.fillStyle = accentHex;
		ctx.fillText(listing.price, 36, H * 0.74);
		ctx.font = '600 32px Inter, system-ui, sans-serif';
		ctx.fillStyle = '#a1a1aa';
		ctx.textAlign = 'right';
		ctx.fillText(TYPE_LABEL[listing.type] || '', W - 36, H * 0.74);
	}

	function coverFit(tex, imgW, imgH, planeAspect) {
		const imgAspect = imgW / imgH;
		tex.center.set(0.5, 0.5);
		if (imgAspect > planeAspect) {
			tex.repeat.set(planeAspect / imgAspect, 1);
		} else {
			tex.repeat.set(1, imgAspect / planeAspect);
		}
	}

	function buildSlot(index) {
		const side = index % 2 === 0 ? -1 : 1;
		const group = new Group();
		group.position.set(side * SIDE_X, 0, -(START_Z + index * SPACING));
		const faceYaw = side < 0 ? Math.PI / 2 : -Math.PI / 2;

		const pedestal = new Mesh(
			new CylinderGeometry(0.5, 0.66, 1.0, 28),
			new MeshStandardMaterial({ color: 0xeceae4, roughness: 0.85, metalness: 0.05 }),
		);
		pedestal.position.y = 0.5;
		pedestal.castShadow = true;
		pedestal.receiveShadow = true;
		group.add(pedestal);

		const frame = new Mesh(
			new BoxGeometry(1.78, 2.18, 0.08),
			new MeshStandardMaterial({ color: 0x18181b, roughness: 0.6, metalness: 0.1 }),
		);
		frame.position.set(0, 2.1, -0.04);
		frame.rotation.y = faceYaw;
		frame.castShadow = true;
		group.add(frame);

		const billboardMat = new MeshBasicMaterial({ side: DoubleSide, toneMapped: false });
		const billboard = new Mesh(new PlaneGeometry(1.6, 2.0), billboardMat);
		billboard.position.set(0, 2.1, 0);
		billboard.rotation.y = faceYaw;
		group.add(billboard);

		const labelCanvas = document.createElement('canvas');
		labelCanvas.width = 512;
		labelCanvas.height = 176;
		const labelTex = new CanvasTexture(labelCanvas);
		labelTex.colorSpace = SRGBColorSpace;
		const label = new Mesh(
			new PlaneGeometry(1.7, 0.58),
			new MeshBasicMaterial({ map: labelTex, transparent: true, toneMapped: false, side: DoubleSide }),
		);
		label.position.set(0, 3.5, 0);
		label.rotation.y = faceYaw;
		group.add(label);

		const ring = new Mesh(
			new RingGeometry(0.74, 0.92, 40),
			new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: DoubleSide }),
		);
		ring.rotation.x = -Math.PI / 2;
		ring.position.y = 0.05;
		ring.visible = false;
		group.add(ring);

		group.visible = false;
		belt.add(group);

		return {
			index,
			side,
			group,
			billboard,
			billboardMat,
			label,
			labelTex,
			labelCanvas,
			ring,
			listing: null,
			imgToken: 0,
		};
	}

	function assignListing(slot, listing) {
		slot.listing = listing;
		slot.group.visible = true;
		const accent = TYPE_ACCENT[listing.type] || '#8b5cf6';
		slot.ring.material.color.set(accent);
		drawLabel(slot.labelCanvas, listing, accent);
		slot.labelTex.needsUpdate = true;

		// Swap artwork. Dispose the previous map so a long browse never leaks GPU.
		const token = ++slot.imgToken;
		const setMap = (tex) => {
			if (token !== slot.imgToken) {
				tex.dispose();
				return;
			}
			const prev = slot.billboardMat.map;
			slot.billboardMat.map = tex;
			slot.billboardMat.needsUpdate = true;
			if (prev) prev.dispose();
		};
		if (listing.image) {
			texLoader.load(
				listing.image,
				(tex) => {
					tex.colorSpace = SRGBColorSpace;
					coverFit(tex, tex.image?.width || 1, tex.image?.height || 1, 1.6 / 2.0);
					setMap(tex);
				},
				undefined,
				() => setMap(makeFallbackTexture(listing.name, accent)),
			);
		} else {
			setMap(makeFallbackTexture(listing.name, accent));
		}
	}

	// ── Listing stream (real APIs, paged, then looped) ──────────────────────────
	const sources = {
		agent: { cursor: null, done: false, fetch: fetchAgents },
		avatar: { cursor: null, done: false, fetch: fetchAvatars },
		skill: { cursor: null, done: false, fetch: fetchSkills },
	};
	let filter = 'all';
	let buffer = []; // normalised listings waiting for a plinth
	let served = []; // everything seen this filter — replayed once pages run out
	let loading = false;
	let loadError = false;
	let loadedAny = false;

	async function fetchAgents(cursor) {
		const u = new URL('/api/marketplace/agents', location.origin);
		u.searchParams.set('limit', String(PAGE_SIZE));
		u.searchParams.set('sort', 'recommended');
		if (cursor) u.searchParams.set('cursor', cursor);
		const r = await fetch(u);
		if (!r.ok) throw new Error(`agents ${r.status}`);
		const j = await r.json();
		const items = (j?.data?.items || []).map(normalizeAgent);
		return { items, next: j?.data?.next_cursor || null };
	}

	async function fetchAvatars(cursor) {
		const u = new URL('/api/explore', location.origin);
		u.searchParams.set('source', 'avatar');
		u.searchParams.set('quality', 'high');
		u.searchParams.set('limit', String(PAGE_SIZE));
		if (cursor) u.searchParams.set('cursor', cursor);
		const r = await fetch(u);
		if (!r.ok) throw new Error(`avatars ${r.status}`);
		const j = await r.json();
		const items = (j?.items || []).map(normalizeAvatar);
		return { items, next: j?.nextCursor || null };
	}

	async function fetchSkills(cursor) {
		const u = new URL('/api/skills', location.origin);
		u.searchParams.set('limit', String(PAGE_SIZE));
		u.searchParams.set('sort', 'popular');
		if (cursor) u.searchParams.set('cursor', cursor);
		const r = await fetch(u);
		if (!r.ok) throw new Error(`skills ${r.status}`);
		const j = await r.json();
		const items = (j?.skills || []).map(normalizeSkill);
		return { items, next: j?.next_cursor || null };
	}

	function activeSources() {
		return filter === 'all'
			? ['agent', 'avatar', 'skill']
			: [filter];
	}

	function allDone() {
		return activeSources().every((k) => sources[k].done);
	}

	async function loadPage() {
		if (loading || allDone()) return;
		loading = true;
		const want = activeSources().filter((k) => !sources[k].done);
		try {
			const results = await Promise.all(
				want.map((k) => sources[k].fetch(sources[k].cursor).then((res) => ({ k, res }))),
			);
			// Interleave across sources so "All" reads as a varied hall, not three blocks.
			const lanes = results.map(({ k, res }) => {
				sources[k].cursor = res.next;
				if (!res.next) sources[k].done = true;
				return res.items;
			});
			const merged = [];
			for (let i = 0; lanes.some((l) => i < l.length); i++) {
				for (const lane of lanes) if (i < lane.length) merged.push(lane[i]);
			}
			if (merged.length) {
				loadedAny = true;
				buffer.push(...merged);
				served.push(...merged);
			}
			loadError = false;
			hideToast();
		} catch (err) {
			loadError = true;
			showToast(`Couldn't load listings`, 'Retry', () => {
				loadError = false;
				loadPage().then(fillEmptySlots);
			});
		} finally {
			loading = false;
		}
	}

	function nextListing() {
		if (buffer.length) return buffer.shift();
		// Pages exhausted but we have a catalogue → loop it so the hall never ends.
		if (allDone() && served.length) {
			buffer = served.slice();
			return buffer.shift();
		}
		return null;
	}

	function fillEmptySlots() {
		for (const slot of slots) {
			if (slot.listing) continue;
			const listing = nextListing();
			if (!listing) break;
			assignListing(slot, listing);
		}
		maybeShowEmpty();
	}

	// ── Treadmill + recycling ───────────────────────────────────────────────────
	let anchored = false;
	let beltBaseZ = 0; // accumulated forward travel folded out of belt.position for precision

	function recycleAndFill() {
		// A plinth that has slid behind the player leaps to the front of the hall.
		let minLocalZ = Infinity;
		for (const s of slots) minLocalZ = Math.min(minLocalZ, s.group.position.z);
		for (const slot of slots) {
			const worldZ = slot.group.position.z + belt.position.z;
			if (worldZ > ANCHOR_Z + RECYCLE_BEHIND) {
				slot.group.position.z = minLocalZ - SPACING;
				minLocalZ = slot.group.position.z;
				const listing = nextListing();
				if (listing) assignListing(slot, listing);
				else {
					slot.listing = null;
					slot.group.visible = false;
				}
			}
		}
	}

	let activeSlot = null;
	let navigating = false;

	function pickNearest(px, pz) {
		let best = null;
		let bestD = Infinity;
		for (const slot of slots) {
			if (!slot.listing || !slot.group.visible) continue;
			const dx = slot.group.position.x - px;
			const dz = slot.group.position.z + belt.position.z - pz;
			const d = Math.hypot(dx, dz);
			if (d < bestD) {
				bestD = d;
				best = slot;
			}
		}
		return { best, bestD };
	}

	let ringPulse = 0;

	function update(dt) {
		const pos = getLocalPosition?.();
		if (!pos) return;

		if (!anchored) {
			pos.z = ANCHOR_Z;
			anchored = true;
		}
		// Transfer the avatar's forward travel into the belt, then re-anchor it so
		// the engine's ground-disc clamp is never reached. Net effect: the player
		// walks forever while standing still in world space.
		const dz = pos.z - ANCHOR_Z;
		if (dz !== 0) {
			belt.position.z -= dz;
			pos.z = ANCHOR_Z;
		}
		// Keep the player on the carpet.
		if (pos.x < -LATERAL_LIMIT) pos.x = -LATERAL_LIMIT;
		else if (pos.x > LATERAL_LIMIT) pos.x = LATERAL_LIMIT;

		// Fold large offsets back toward zero to keep float precision crisp on a
		// very long stroll (shift belt + every plinth together — no visible jump).
		if (belt.position.z > REBASE_AT) {
			const k = belt.position.z;
			belt.position.z = 0;
			beltBaseZ += k;
			for (const s of slots) s.group.position.z += k;
		}

		// Stream the next page well before the hall runs dry (≈ a screen ahead).
		if (!loading && !loadError && !allDone() && buffer.length < SLOT_COUNT) {
			loadPage().then(fillEmptySlots);
		}

		fillEmptySlots();
		recycleAndFill();

		// Proximity — reveal the nearest listing within reach, with hysteresis.
		const { best, bestD } = pickNearest(pos.x, ANCHOR_Z);
		if (activeSlot) {
			const ax = activeSlot.group.position.x - pos.x;
			const az = activeSlot.group.position.z + belt.position.z - ANCHOR_Z;
			const ad = Math.hypot(ax, az);
			if (!activeSlot.listing || ad > RELEASE_RANGE) {
				setActive(best && bestD <= ENTER_RANGE ? best : null);
			} else if (best && best !== activeSlot && bestD <= ENTER_RANGE && bestD < ad - 0.6) {
				setActive(best);
			}
		} else if (best && bestD <= ENTER_RANGE) {
			setActive(best);
		}

		// Gentle ring pulse + lift on the active plinth.
		ringPulse += dt;
		for (const slot of slots) {
			const target = slot === activeSlot ? 1 : 0;
			const cur = slot.group.scale.x;
			const next = MathUtils.lerp(cur, 1 + target * 0.06, 0.18);
			slot.group.scale.setScalar(next);
			if (slot.ring.visible) {
				slot.ring.material.opacity = 0.55 + Math.sin(ringPulse * 3) * 0.35;
			}
		}
	}

	function setActive(slot) {
		if (slot === activeSlot) return;
		if (activeSlot) {
			activeSlot.ring.visible = false;
		}
		activeSlot = slot;
		if (slot) {
			slot.ring.visible = true;
			showPanel(slot.listing);
		} else {
			hidePanel();
		}
	}

	function navigateActive() {
		if (!activeSlot?.listing || navigating) return;
		navigating = true;
		location.href = activeSlot.listing.href;
	}

	// ── DOM: chips, panel, prompt, toast ────────────────────────────────────────
	const chips = document.createElement('div');
	chips.className = 'mwg-chips';
	chips.setAttribute('role', 'tablist');
	chips.setAttribute('aria-label', 'Filter gallery listings');
	for (const f of FILTERS) {
		const b = document.createElement('button');
		b.className = 'mwg-chip';
		b.type = 'button';
		b.textContent = f.label;
		b.dataset.filter = f.key;
		b.setAttribute('aria-pressed', String(f.key === filter));
		b.addEventListener('click', () => setFilter(f.key));
		chips.appendChild(b);
	}
	document.body.appendChild(chips);

	const panel = document.createElement('aside');
	panel.className = 'mwg-panel';
	panel.setAttribute('aria-live', 'polite');
	document.body.appendChild(panel);

	const prompt = document.createElement('button');
	prompt.className = 'mwg-prompt';
	prompt.type = 'button';
	prompt.innerHTML = `<kbd>E</kbd><span class="mwg-prompt-text">Open listing</span>`;
	prompt.addEventListener('click', navigateActive);
	document.body.appendChild(prompt);

	const toast = document.createElement('div');
	toast.className = 'mwg-toast';
	toast.setAttribute('role', 'status');
	document.body.appendChild(toast);

	function showToast(message, actionLabel, onAction) {
		toast.innerHTML = '';
		const span = document.createElement('span');
		span.textContent = message;
		toast.appendChild(span);
		if (actionLabel) {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.textContent = actionLabel;
			btn.addEventListener('click', onAction);
			toast.appendChild(btn);
		}
		toast.setAttribute('data-show', '1');
	}
	function hideToast() {
		toast.removeAttribute('data-show');
	}

	function maybeShowEmpty() {
		if (loadedAny || loading || !allDone()) return;
		const label = FILTERS.find((f) => f.key === filter)?.label || 'listings';
		showToast(`No ${label.toLowerCase()} listed yet.`, 'Browse the grid →', () => {
			location.href = '/marketplace';
		});
	}

	function showPanel(listing) {
		const accent = TYPE_ACCENT[listing.type] || '#8b5cf6';
		const media = listing.image
			? `<img src="${escapeAttr(listing.image)}" alt="" loading="lazy" />`
			: `<div class="mwg-panel-fallback" style="background:linear-gradient(160deg,${accent},#0c0c0e)">${escapeHtml((listing.name || '?').charAt(0).toUpperCase())}</div>`;
		panel.innerHTML = `
			<div class="mwg-panel-media">
				${media}
				<span class="mwg-panel-badge" style="background:${accent}">${TYPE_LABEL[listing.type] || ''}</span>
			</div>
			<div class="mwg-panel-body">
				<h2 class="mwg-panel-title">${escapeHtml(listing.name)}</h2>
				${listing.author ? `<p class="mwg-panel-author">by ${escapeHtml(listing.author)}</p>` : ''}
				${listing.description ? `<p class="mwg-panel-desc">${escapeHtml(listing.description)}</p>` : ''}
				<div class="mwg-panel-meta">
					<span class="mwg-panel-price" style="color:${accent}">${escapeHtml(listing.price)}</span>
					${listing.category ? `<span class="mwg-panel-cat">${escapeHtml(listing.category)}</span>` : ''}
				</div>
				<button class="mwg-panel-cta" type="button" style="background:${accent}">View listing →</button>
				<p class="mwg-panel-hint">Press <kbd>E</kbd> to open</p>
			</div>`;
		panel.querySelector('.mwg-panel-cta')?.addEventListener('click', navigateActive);
		panel.setAttribute('data-show', '1');
		prompt.querySelector('.mwg-prompt-text').textContent = listing.name;
		prompt.setAttribute('data-show', '1');
	}

	function hidePanel() {
		panel.removeAttribute('data-show');
		prompt.removeAttribute('data-show');
	}

	async function setFilter(next) {
		if (next === filter) return;
		filter = next;
		for (const b of chips.children) b.setAttribute('aria-pressed', String(b.dataset.filter === filter));
		// Reset the stream and the hall, then rebuild from the live position.
		buffer = [];
		served = [];
		loadedAny = false;
		loadError = false;
		for (const k of Object.keys(sources)) {
			sources[k].cursor = null;
			sources[k].done = false;
		}
		setActive(null);
		for (let i = 0; i < slots.length; i++) {
			slots[i].listing = null;
			slots[i].group.visible = false;
			slots[i].group.position.z = -(START_Z + i * SPACING);
			slots[i].group.scale.setScalar(1);
		}
		belt.position.z = 0;
		hideToast();
		await loadPage();
		fillEmptySlots();
	}

	// ── Key intercept — E opens the active listing (capture phase so it wins over
	//    the engine's snap-turn binding, but only while a listing is in reach). ──
	function onKeyDown(e) {
		if (!activeSlot) return;
		if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
		if (e.code === 'KeyE' || e.code === 'Enter') {
			e.preventDefault();
			e.stopImmediatePropagation();
			navigateActive();
		}
	}
	window.addEventListener('keydown', onKeyDown, true);

	// ── Boot ────────────────────────────────────────────────────────────────────
	for (let i = 0; i < SLOT_COUNT; i++) slots.push(buildSlot(i));
	loadPage().then(fillEmptySlots);

	return {
		update,
		destroy() {
			window.removeEventListener('keydown', onKeyDown, true);
			chips.remove();
			panel.remove();
			prompt.remove();
			toast.remove();
			scene.remove(belt);
			scene.remove(hall);
		},
	};
}

function escapeHtml(s) {
	return String(s ?? '').replace(/[&<>"']/g, (c) =>
		({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
	);
}
function escapeAttr(s) {
	return escapeHtml(s);
}
