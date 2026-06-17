// src/irl/privacy-center.js — IRL "Location & privacy" control center (L3).
//
// One designed, reachable surface that tells the user — in plain language — what
// a placed pin actually shares and who can see it, and gives them the levers in
// one place: discovery precision (Precise vs Approximate, consumed by the L4
// proximity read), the "appear to others" presence opt-in, and a jump into
// pin management. Plus a one-time first-run disclosure shown the first time
// location is granted. This module owns the discovery-precision setting (single
// source of truth) so irl.js / loadNearbyPins read it without duplicating a key.

const PRECISION_KEY  = 'irl_discovery_precision';   // 'precise' | 'approximate'
const DISCLOSED_KEY  = 'irl_location_disclosed_v1';
const STYLE_ID       = 'irlpc-styles';

// ── Discovery precision (single source of truth) ────────────────────────────
export function getDiscoveryPrecision() {
	try { return localStorage.getItem(PRECISION_KEY) === 'approximate' ? 'approximate' : 'precise'; }
	catch { return 'precise'; }
}
export function setDiscoveryPrecision(v) {
	try { localStorage.setItem(PRECISION_KEY, v === 'approximate' ? 'approximate' : 'precise'); } catch {}
}

// The three honest facts, shared by the sheet and the first-run disclosure so the
// copy never diverges. Grounded in api/irl/pins.js behavior (≤60 m radius read,
// no roster, owner id stripped, anon pins expire in 7 days).
const FACTS = [
	{ icon: '📍', t: 'Only people right next to it', b: 'A placed agent appears to someone only when they’re physically within ~60 m of it — never on a map or a browsable list.' },
	{ icon: '🕶️', t: 'Never tied to your identity', b: 'The nearby feed never includes your account or device id. Others see an agent at a spot, not who placed it.' },
	{ icon: '⏳', t: 'Gone on your terms', b: 'Pins you place without signing in auto-expire after 7 days, and you can remove any of them instantly from “My pins”.' },
];

function ensureStyles() {
	if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
	const el = document.createElement('style');
	el.id = STYLE_ID;
	el.textContent = `
.irlpc-root{position:fixed;inset:0;z-index:10001;display:flex;align-items:flex-end;justify-content:center}
.irlpc-back{position:absolute;inset:0;background:rgba(4,6,12,.62);backdrop-filter:blur(2px);animation:irlpc-fade .2s ease}
.irlpc-sheet{position:relative;width:100%;max-width:540px;max-height:90vh;overflow-y:auto;background:#0c0f17;
  border:1px solid #232838;border-bottom:none;border-radius:18px 18px 0 0;box-shadow:0 -8px 40px rgba(0,0,0,.55);
  animation:irlpc-rise .26s cubic-bezier(.2,.8,.2,1)}
@media(min-width:600px){.irlpc-root{align-items:center}.irlpc-sheet{border-radius:18px;border-bottom:1px solid #232838}}
@keyframes irlpc-rise{from{transform:translateY(14px);opacity:.4}to{transform:translateY(0);opacity:1}}
@keyframes irlpc-fade{from{opacity:0}to{opacity:1}}
.irlpc-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px 6px}
.irlpc-title{font:600 16px/1.2 system-ui,sans-serif;color:#eef1f7}
.irlpc-x{appearance:none;background:none;border:none;color:#8b93a7;font-size:24px;line-height:1;cursor:pointer;
  width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;transition:background .15s,color .15s}
.irlpc-x:hover,.irlpc-x:focus-visible{background:#1a1f2e;color:#eef1f7;outline:none}
.irlpc-sec{padding:12px 18px;border-top:1px solid #161b27}
.irlpc-sec:first-of-type{border-top:none}
.irlpc-sec h4{margin:0 0 10px;font:600 12px/1.2 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#7b8398}
.irlpc-fact{display:flex;gap:11px;margin-bottom:11px}
.irlpc-fact:last-child{margin-bottom:0}
.irlpc-fact .ic{font-size:17px;line-height:1.3;flex-shrink:0}
.irlpc-fact .t{font:600 13.5px/1.3 system-ui,sans-serif;color:#eef1f7;margin-bottom:2px}
.irlpc-fact .b{font:400 12.5px/1.45 system-ui,sans-serif;color:#aeb6c8}
.irlpc-seg{display:flex;gap:6px;background:#11151f;border:1px solid #232838;border-radius:11px;padding:4px}
.irlpc-seg button{flex:1;appearance:none;background:none;border:none;border-radius:8px;cursor:pointer;padding:9px 6px;
  font:600 13px/1.1 system-ui,sans-serif;color:#aeb6c8;transition:background .15s,color .15s}
.irlpc-seg button small{display:block;font-weight:500;font-size:10.5px;color:#6f7790;margin-top:2px}
.irlpc-seg button.on{background:#4f7cff;color:#fff}
.irlpc-seg button.on small{color:#dbe5ff}
.irlpc-note{margin-top:9px;font:400 11.5px/1.45 system-ui,sans-serif;color:#7b8398}
.irlpc-row{display:flex;align-items:center;justify-content:space-between;gap:14px}
.irlpc-row .rt{font:600 13.5px/1.3 system-ui,sans-serif;color:#eef1f7}
.irlpc-row .rb{font:400 12px/1.4 system-ui,sans-serif;color:#8b93a7;margin-top:2px;max-width:330px}
.irlpc-switch{position:relative;width:46px;height:27px;border-radius:999px;background:#2a3042;border:none;cursor:pointer;flex-shrink:0;transition:background .18s}
.irlpc-switch::after{content:'';position:absolute;top:3px;left:3px;width:21px;height:21px;border-radius:50%;background:#fff;transition:transform .18s}
.irlpc-switch[aria-pressed="true"]{background:#34c759}
.irlpc-switch[aria-pressed="true"]::after{transform:translateX(19px)}
.irlpc-switch:focus-visible{outline:2px solid #4f7cff;outline-offset:2px}
.irlpc-manage{display:flex;align-items:center;justify-content:space-between;width:100%;appearance:none;cursor:pointer;
  background:#11151f;border:1px solid #232838;border-radius:11px;padding:13px 14px;color:#eef1f7;
  font:600 13.5px system-ui,sans-serif;transition:background .15s}
.irlpc-manage:hover{background:#1a2032}
.irlpc-manage .ar{color:#8b93a7;font-size:18px}
.irlpc-foot{padding:14px 18px 18px}
.irlpc-done{width:100%;appearance:none;background:#4f7cff;color:#fff;border:none;border-radius:11px;
  font:600 14px system-ui,sans-serif;padding:13px;cursor:pointer;transition:background .15s}
.irlpc-done:hover{background:#3d6af0}
/* First-run disclosure reuses the sheet shell with a tighter body */
.irlpc-discl .irlpc-sec{border-top:none}
`;
	document.head.appendChild(el);
}

function esc(s) {
	return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function factsHTML() {
	return FACTS.map((f) => `<div class="irlpc-fact"><span class="ic">${f.icon}</span><div><div class="t">${esc(f.t)}</div><div class="b">${esc(f.b)}</div></div></div>`).join('');
}

// Generic modal shell with backdrop + Esc + focus return. `build(sheet, close)`
// fills the sheet; `close()` tears down.
function modal(buildInner, { extraClass = '' } = {}) {
	ensureStyles();
	const root = document.createElement('div');
	root.className = `irlpc-root ${extraClass}`.trim();
	root.setAttribute('role', 'dialog');
	root.setAttribute('aria-modal', 'true');
	const back = document.createElement('div');
	back.className = 'irlpc-back';
	const sheet = document.createElement('div');
	sheet.className = 'irlpc-sheet';
	root.append(back, sheet);
	document.body.appendChild(root);
	const prevOverflow = document.body.style.overflow;
	document.body.style.overflow = 'hidden';
	const prevFocus = document.activeElement;

	let closed = false;
	const close = () => {
		if (closed) return;
		closed = true;
		document.removeEventListener('keydown', onKey, true);
		root.remove();
		document.body.style.overflow = prevOverflow;
		try { prevFocus?.focus?.(); } catch {}
	};
	const onKey = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } };
	document.addEventListener('keydown', onKey, true);
	back.addEventListener('click', close);
	buildInner(sheet, close);
	return close;
}

// ── The Location & privacy sheet ────────────────────────────────────────────
export function openPrivacyCenter({ getGhost, setGhost, onManagePins } = {}) {
	modal((sheet, close) => {
		const precision = getDiscoveryPrecision();
		const ghostOn = !!(getGhost && getGhost());
		sheet.setAttribute('aria-label', 'Location and privacy');
		sheet.innerHTML = `
			<div class="irlpc-head">
				<div class="irlpc-title">Location &amp; privacy</div>
				<button class="irlpc-x" type="button" data-close aria-label="Close">×</button>
			</div>
			<div class="irlpc-sec">
				<h4>What others can see</h4>
				${factsHTML()}
			</div>
			<div class="irlpc-sec">
				<h4>Discovery precision</h4>
				<div class="irlpc-seg" role="group" aria-label="Discovery precision">
					<button type="button" data-prec="precise" class="${precision === 'precise' ? 'on' : ''}" aria-pressed="${precision === 'precise'}">Precise<small>exact spot</small></button>
					<button type="button" data-prec="approximate" class="${precision === 'approximate' ? 'on' : ''}" aria-pressed="${precision === 'approximate'}">Approximate<small>~city block</small></button>
				</div>
				<div class="irlpc-note">Approximate keeps your exact position off our servers while you browse — nearby agents may resolve a little less precisely. Placement is always exactly where you choose.</div>
			</div>
			<div class="irlpc-sec">
				<div class="irlpc-row">
					<div>
						<div class="rt">Appear to others nearby</div>
						<div class="rb">Off by default. When on, people viewing this area see you as a ghost marker. Your presence count is shared either way.</div>
					</div>
					<button class="irlpc-switch" type="button" data-ghost role="switch" aria-pressed="${ghostOn}" aria-label="Appear to others nearby"></button>
				</div>
			</div>
			<div class="irlpc-sec">
				<h4>Your placements</h4>
				<button class="irlpc-manage" type="button" data-manage>
					<span>Manage &amp; remove agents you’ve placed</span><span class="ar">→</span>
				</button>
			</div>
			<div class="irlpc-foot"><button class="irlpc-done" type="button" data-close>Done</button></div>`;

		sheet.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));

		// Precision segmented control
		sheet.querySelectorAll('[data-prec]').forEach((btn) => {
			btn.addEventListener('click', () => {
				const v = btn.dataset.prec;
				setDiscoveryPrecision(v);
				sheet.querySelectorAll('[data-prec]').forEach((b) => {
					const on = b.dataset.prec === v;
					b.classList.toggle('on', on);
					b.setAttribute('aria-pressed', String(on));
				});
			});
		});

		// Presence opt-in — drives the host toggle so the topbar pill + room state stay in sync.
		const ghostBtn = sheet.querySelector('[data-ghost]');
		ghostBtn?.addEventListener('click', () => {
			const next = ghostBtn.getAttribute('aria-pressed') !== 'true';
			ghostBtn.setAttribute('aria-pressed', String(next));
			try { setGhost && setGhost(next); } catch {}
		});

		// Manage placements → close then open My pins
		sheet.querySelector('[data-manage]')?.addEventListener('click', () => {
			close();
			try { onManagePins && onManagePins(); } catch {}
		});

		setTimeout(() => sheet.querySelector('[data-close]')?.focus(), 60);
	});
}

// ── First-run disclosure (shown once, the first time location is granted) ────
export function maybeShowFirstRunDisclosure() {
	let already = false;
	try { already = localStorage.getItem(DISCLOSED_KEY) === '1'; } catch {}
	if (already) return;
	try { localStorage.setItem(DISCLOSED_KEY, '1'); } catch {}

	modal((sheet, close) => {
		sheet.setAttribute('aria-label', 'How location works here');
		sheet.innerHTML = `
			<div class="irlpc-head">
				<div class="irlpc-title">How location works here</div>
				<button class="irlpc-x" type="button" data-close aria-label="Close">×</button>
			</div>
			<div class="irlpc-sec">${factsHTML()}</div>
			<div class="irlpc-foot"><button class="irlpc-done" type="button" data-close>Got it</button></div>`;
		sheet.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
		setTimeout(() => sheet.querySelector('.irlpc-done')?.focus(), 60);
	}, { extraClass: 'irlpc-discl' });
}
