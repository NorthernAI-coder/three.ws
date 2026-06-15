// <avatar-actions> — the per-avatar ownership + wallet control surfaced on every
// place a user interacts with, saves, or edits a 3D avatar.
//
// It expresses one model consistently everywhere:
//   • Saving someone else's avatar is a FORK — it mints a NEW avatar in your
//     namespace (copied model, your owner_id), linked back GitHub-style with
//     "Forked from <owner>". You never co-own one row.
//   • Every avatar's agent has its own custodial wallet, assigned per user. The
//     owner can create it (if missing) and manage it; nobody else can touch it.
//
// Usage (drop into any page):
//   <script type="module" src="/avatar-actions.js"></script>
//   <avatar-actions avatar-id="<uuid>"></avatar-actions>
// Optionally seed data to skip a fetch:
//   el.avatar = avatarObjectFromApi;            // { id, owner_id, agent_id, ... }
// Variants: variant="full" (default) | "compact" (icon-dense, for cards/toolbars)
//
// Emits bubbling CustomEvents the host can react to:
//   'avatar-forked'  detail: { avatar, agent }   — a new fork was created
//   'wallet-created' detail: { agentId, wallet_address, solana_address }

const API = '';
let _mePromise = null;

function me() {
	if (!_mePromise) {
		_mePromise = fetch(`${API}/api/auth/me`, { credentials: 'include' })
			.then((r) => (r.ok ? r.json() : { user: null }))
			.then((d) => d.user || null)
			.catch(() => null);
	}
	return _mePromise;
}

let _csrf = null;
async function csrfToken() {
	if (_csrf) return _csrf;
	try {
		const r = await fetch(`${API}/api/csrf-token`, { credentials: 'include' });
		if (!r.ok) return null;
		_csrf = (await r.json()).token || null;
	} catch {
		_csrf = null;
	}
	return _csrf;
}

const short = (a) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || '');

const styles = `
:host { display: block; --aa-fg: var(--text, #f5f5f6); --aa-dim: var(--text-dim, #8c8c92);
  --aa-bg: var(--surface-2, rgba(255,255,255,0.04)); --aa-line: var(--border, rgba(255,255,255,0.1));
  --aa-acc: var(--accent, #9945ff); --aa-good: #5fd08a; --aa-bad: #e06c75;
  font: 13px/1.45 var(--font, ui-sans-serif, system-ui, sans-serif); color: var(--aa-fg); }
.card { border: 1px solid var(--aa-line); border-radius: 12px; background: var(--aa-bg);
  padding: 14px; display: flex; flex-direction: column; gap: 12px; }
:host([variant="compact"]) .card { padding: 10px; gap: 8px; border-radius: 10px; }
.row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.spread { justify-content: space-between; }
.lineage { font-size: 12px; color: var(--aa-dim); display: flex; align-items: center; gap: 6px; }
.lineage a { color: var(--aa-fg); text-decoration: none; border-bottom: 1px dashed var(--aa-line); }
.lineage a:hover { border-bottom-color: var(--aa-acc); color: var(--aa-acc); }
.forks { font-size: 12px; color: var(--aa-dim); }
button { font: inherit; cursor: pointer; border-radius: 9px; border: 1px solid var(--aa-line);
  background: rgba(255,255,255,0.04); color: var(--aa-fg); padding: 8px 12px; display: inline-flex;
  align-items: center; gap: 7px; transition: background .15s, border-color .15s, transform .05s; }
button:hover { background: rgba(255,255,255,0.08); border-color: var(--aa-acc); }
button:active { transform: translateY(1px); }
button:focus-visible { outline: 2px solid var(--aa-acc); outline-offset: 2px; }
button[disabled] { opacity: .55; cursor: progress; }
button.primary { background: var(--aa-acc); border-color: var(--aa-acc); color: #fff; font-weight: 600; }
button.primary:hover { filter: brightness(1.08); background: var(--aa-acc); }
.wallet { border: 1px solid var(--aa-line); border-radius: 10px; padding: 10px 12px; display: flex;
  flex-direction: column; gap: 8px; }
.wallet h4 { margin: 0; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--aa-dim); font-weight: 600; }
.addr { display: flex; align-items: center; gap: 8px; }
.addr .chain { font-size: 10px; font-weight: 700; color: var(--aa-dim); width: 26px; }
.addr code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--aa-fg); }
.copy { padding: 3px 7px; font-size: 11px; }
.copy.copied { color: var(--aa-good); border-color: var(--aa-good); }
.manage { color: var(--aa-acc); text-decoration: none; font-size: 12px; font-weight: 600; }
.manage:hover { text-decoration: underline; }
.msg { font-size: 12px; padding: 8px 10px; border-radius: 8px; }
.msg.err { color: var(--aa-bad); background: rgba(224,108,117,0.1); }
.msg.ok { color: var(--aa-good); background: rgba(95,208,138,0.1); }
.spinner { width: 13px; height: 13px; border: 2px solid currentColor; border-top-color: transparent;
  border-radius: 50%; animation: aa-spin .7s linear infinite; }
@keyframes aa-spin { to { transform: rotate(360deg); } }
.hidden { display: none !important; }
.muted { color: var(--aa-dim); font-size: 12px; }
`;

class AvatarActions extends HTMLElement {
	static get observedAttributes() {
		return ['avatar-id'];
	}

	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this._avatar = null;
		this._agent = null;
		this._me = null;
		this._busy = false;
	}

	set avatar(v) {
		this._avatar = v || null;
		if (this.isConnected) this._init();
	}
	get avatar() {
		return this._avatar;
	}

	connectedCallback() {
		this._init();
	}

	attributeChangedCallback(name, oldV, newV) {
		if (name === 'avatar-id' && oldV !== newV && this.isConnected) this._init();
	}

	get avatarId() {
		return this._avatar?.id || this.getAttribute('avatar-id') || null;
	}

	async _init() {
		const id = this.avatarId;
		if (!id) {
			this.shadowRoot.innerHTML = '';
			return;
		}
		this._render(); // initial skeleton
		try {
			this._me = await me();
			if (!this._avatar) {
				const r = await fetch(`${API}/api/avatars/${id}`, { credentials: 'include' });
				if (r.ok) this._avatar = (await r.json()).avatar || null;
			}
			// Resolve the avatar's agent (owner sees wallet_address; secrets stripped).
			const ar = await fetch(`${API}/api/agents?avatar_id=${encodeURIComponent(id)}`, {
				credentials: 'include',
			});
			if (ar.ok) this._agent = (await ar.json()).agents?.[0] || null;
		} catch {
			/* render whatever we have */
		}
		this._render();
	}

	get isOwner() {
		return !!(this._me && this._avatar && this._me.id === this._avatar.owner_id);
	}

	_render() {
		const a = this._avatar;
		const css = `<style>${styles}</style>`;
		if (!a) {
			this.shadowRoot.innerHTML = `${css}<div class="card"><span class="muted">Loading…</span></div>`;
			return;
		}

		const lineage = a.forked_from
			? `<div class="lineage">⑂ Forked from
				<a href="/avatar-page.html?id=${a.forked_from.avatar_id}" title="View the original">
					${escapeHtml(a.forked_from.owner_name || a.forked_from.name || 'original')}
				</a></div>`
			: '';
		const forks =
			a.fork_count > 0
				? `<span class="forks">⑂ ${a.fork_count} ${a.fork_count === 1 ? 'fork' : 'forks'}</span>`
				: '';

		// mode: "full" (default) shows wallet to owners + fork to others;
		// "wallet" shows only the wallet panel; "fork" shows only the save/fork
		// affordance (use on surfaces that already manage the wallet elsewhere).
		const mode = this.getAttribute('mode') || 'full';
		let body = '';
		if (this.isOwner) {
			body = mode === 'fork' ? '' : this._walletBlock();
		} else if (mode === 'wallet') {
			body = '';
		} else if (this._me) {
			body = `<button class="primary" data-act="fork" title="Save a copy to your own avatars">
				⑂ Save to my avatars</button>
				<div class="muted">Creates your own copy with its own agent wallet. The original stays untouched.</div>`;
		} else {
			body = `<a class="manage" href="/login.html?next=${encodeURIComponent(location.pathname + location.search)}">Sign in to save this avatar →</a>`;
		}

		// Nothing to show for this viewer/mode combo — stay invisible rather than
		// render an empty card.
		if (!body && !lineage && !forks) {
			this.shadowRoot.innerHTML = '';
			return;
		}

		this.shadowRoot.innerHTML = `${css}
			<div class="card">
				${lineage || forks ? `<div class="row spread">${lineage}${forks}</div>` : ''}
				<div class="body">${body}</div>
				<div class="msg-slot"></div>
			</div>`;
		this._wire();
	}

	_walletBlock() {
		const ag = this._agent;
		if (!ag) {
			return `<div class="muted">Save the avatar to give its agent a wallet.</div>`;
		}
		const evm = ag.wallet_address || null;
		const sol = ag.meta?.solana_address || null;
		const manage = `<a class="manage" href="/agent-edit.html?id=${ag.id}">Manage →</a>`;

		if (!evm && !sol) {
			return `<div class="wallet">
				<div class="row spread"><h4>Agent wallet</h4>${manage}</div>
				<div class="muted">No wallet yet. Give this agent a custodial EVM + Solana wallet it can transact with.</div>
				<button class="primary" data-act="create-wallet">Create wallet</button>
			</div>`;
		}
		const addr = (chain, a) =>
			a
				? `<div class="addr"><span class="chain">${chain}</span><code>${short(a)}</code>
					<button class="copy" data-copy="${a}" title="Copy ${chain} address">Copy</button></div>`
				: '';
		return `<div class="wallet">
			<div class="row spread"><h4>Agent wallet</h4>${manage}</div>
			${addr('EVM', evm)}
			${addr('SOL', sol)}
			${evm && sol ? '' : `<button data-act="create-wallet">Provision missing chain</button>`}
		</div>`;
	}

	_wire() {
		const root = this.shadowRoot;
		root.querySelectorAll('[data-copy]').forEach((b) =>
			b.addEventListener('click', async () => {
				try {
					await navigator.clipboard.writeText(b.dataset.copy);
					b.classList.add('copied');
					const t = b.textContent;
					b.textContent = 'Copied';
					setTimeout(() => {
						b.classList.remove('copied');
						b.textContent = t;
					}, 1400);
				} catch {
					/* clipboard blocked — no-op */
				}
			}),
		);
		root.querySelector('[data-act="fork"]')?.addEventListener('click', () => this._fork());
		root
			.querySelector('[data-act="create-wallet"]')
			?.addEventListener('click', () => this._createWallet());
	}

	_msg(kind, html) {
		const slot = this.shadowRoot.querySelector('.msg-slot');
		if (slot) slot.innerHTML = `<div class="msg ${kind}">${html}</div>`;
	}

	_setBusy(btn, label) {
		this._busy = true;
		if (btn) {
			btn.disabled = true;
			btn.dataset.label = btn.innerHTML;
			btn.innerHTML = `<span class="spinner"></span>${label}`;
		}
	}
	_clearBusy(btn) {
		this._busy = false;
		if (btn && btn.dataset.label) {
			btn.disabled = false;
			btn.innerHTML = btn.dataset.label;
		}
	}

	async _fork() {
		if (this._busy) return;
		const btn = this.shadowRoot.querySelector('[data-act="fork"]');
		this._setBusy(btn, 'Saving…');
		this._msg('', '');
		try {
			const r = await fetch(`${API}/api/avatars/fork`, {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ source_avatar_id: this.avatarId }),
			});
			const d = await r.json().catch(() => ({}));
			if (!r.ok) throw new Error(d.message || d.error || `fork failed (${r.status})`);
			const wallet = d.agent?.wallet_address ? ` Its agent wallet: <code>${short(d.agent.wallet_address)}</code>.` : '';
			this._msg(
				'ok',
				`Saved to your avatars. <a class="manage" href="/avatar-page.html?id=${d.avatar.id}">Open →</a>${wallet}`,
			);
			this.dispatchEvent(
				new CustomEvent('avatar-forked', { detail: d, bubbles: true, composed: true }),
			);
		} catch (e) {
			this._msg('err', escapeHtml(e.message));
		} finally {
			this._clearBusy(btn);
		}
	}

	async _createWallet() {
		if (this._busy) return;
		const ag = this._agent;
		if (!ag) return;
		const btn = this.shadowRoot.querySelector('[data-act="create-wallet"]');
		this._setBusy(btn, 'Creating…');
		this._msg('', '');
		try {
			const token = await csrfToken();
			const r = await fetch(`${API}/api/agents/${ag.id}/wallet/provision`, {
				method: 'POST',
				credentials: 'include',
				headers: token ? { 'x-csrf-token': token } : {},
			});
			const d = await r.json().catch(() => ({}));
			if (!r.ok) throw new Error(d.message || d.error || `provision failed (${r.status})`);
			// Reflect the new wallet locally and re-render.
			this._agent = {
				...ag,
				wallet_address: d.wallet_address,
				meta: { ...(ag.meta || {}), solana_address: d.solana_address },
			};
			this._render();
			this._msg('ok', 'Wallet created. Fund it from the agent page to start transacting.');
			this.dispatchEvent(
				new CustomEvent('wallet-created', {
					detail: { agentId: ag.id, ...d },
					bubbles: true,
					composed: true,
				}),
			);
		} catch (e) {
			this._clearBusy(btn);
			this._msg('err', escapeHtml(e.message));
		}
	}
}

function escapeHtml(s) {
	return String(s == null ? '' : s).replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
	);
}

if (!customElements.get('avatar-actions')) {
	customElements.define('avatar-actions', AvatarActions);
}

export { AvatarActions };
