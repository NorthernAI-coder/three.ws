/**
 * Brain Studio — controller (P1)
 * ==============================
 * The visible, programmable agent brain. Mounts into the studio shell's Brain tab
 * container and wires together:
 *   • BrainGraphView      — the visual node-graph editor
 *   • compileBrain        — graph → real persona_prompt + provider/tool config
 *   • BrainRuntime        — streaming test chat against the real LLM proxy + live
 *                           memory + active-path animation + avatar reactions
 *   • TEMPLATES           — forkable Sniper / Scalper / Researcher / Companion brains
 *
 * The graph is the persona. We persist the graph verbatim to meta.studio.brain
 * (lossless round-trip) AND the compiled persona to agent_identities.persona_prompt
 * (so /api/chat and every existing chat surface keep working), both through the
 * shared `studio` store (optimistic + debounced PUT).
 *
 * Mount: import { mountBrainStudio } from './brain/brain-studio.js';
 *        mountBrainStudio(container, { studio });
 */

import { BrainGraphView } from './brain-graph.js';
import { compileBrain } from './brain-compile.js';
import { BrainRuntime } from './brain-runtime.js';
import { NODE_TYPES, normalizeGraph, defaultGraph } from './brain-nodes.js';
import { TEMPLATES } from './brain-templates.js';
import { apiFetch } from '../../api.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PALETTE = ['persona', 'model', 'memory', 'skill', 'market', 'output'];

export function mountBrainStudio(container, { studio }) {
	if (container.dataset.brainMounted) return;
	container.dataset.brainMounted = '1';
	return new BrainStudio(container, studio);
}

class BrainStudio {
	constructor(container, studio) {
		this.studio = studio;
		this.el = container;
		this.providers = [];
		this._saveTimer = null;
		this._history = [];
		this._savedPersona = studio.brain?.compiled?.personaPrompt || '';
		this._render();
		this._init();
	}

	async _init() {
		// Providers power the Model node's picker — real availability from the proxy.
		try {
			const resp = await apiFetch('/api/brain/chat', { allowAnonymous: true });
			if (resp.ok) this.providers = (await resp.json()).providers || [];
		} catch { /* picker falls back to a static list of model ids */ }

		const stored = this.studio.brain?.graph;
		if (stored) {
			this._showEditor();
			this.graph.load(normalizeGraph(stored));
		} else {
			this._showOnboarding();
		}
	}

	// ── Layout ────────────────────────────────────────────────────────────────

	_render() {
		this.el.innerHTML = `
			<div class="brainstudio" data-view="onboard">
				<div class="brainstudio__onboard" id="bsOnboard">
					<div class="brainstudio__onboard-inner">
						<h1>Build your agent's mind</h1>
						<p>Wire persona, model, memory, skills and trading reasoning into a living circuit. Watch it light up as it thinks.</p>
						<div class="brainstudio__templates" id="bsTplGrid"></div>
						<button class="studio__btn studio__btn-primary" id="bsBlank">Start from blank</button>
					</div>
				</div>

				<div class="brainstudio__editor" id="bsEditor" hidden>
					<div class="brainstudio__toolbar">
						<div class="brainstudio__palette" id="bsPalette" role="toolbar" aria-label="Add node"></div>
						<div class="brainstudio__tools">
							<button class="studio__btn" id="bsFit" title="Frame the graph">Fit</button>
							<button class="studio__btn" id="bsDiff" title="See how this brain reads">Behavior</button>
							<button class="studio__btn" id="bsTpl" title="Fork a template">Templates</button>
							<button class="studio__btn" id="bsSave" title="Save now (⌘/Ctrl + S)">Save</button>
							<button class="studio__btn studio__btn-primary" id="bsDone" title="Save and continue to Memory">Done →</button>
						</div>
					</div>
					<div class="brainstudio__main">
						<div class="brainstudio__canvas" id="bsCanvas"></div>
						<aside class="brainstudio__side">
							<div class="brainstudio__inspector" id="bsInspector"></div>
							<div class="brainstudio__test" id="bsTest">
								<div class="brainstudio__test-head">Test chat <span class="brainstudio__test-model" id="bsTestModel"></span></div>
								<div class="brainstudio__transcript" id="bsTranscript"></div>
								<form class="brainstudio__compose" id="bsCompose">
									<textarea id="bsInput" rows="1" placeholder="Talk to your agent…" aria-label="Test message"></textarea>
									<button class="studio__btn studio__btn-primary" type="submit" id="bsSend">Run</button>
								</form>
							</div>
						</aside>
					</div>
				</div>

				<div class="brainstudio__modal" id="bsModal" hidden>
					<div class="brainstudio__modal-card" id="bsModalCard"></div>
				</div>
			</div>`;

		this.root = this.el.querySelector('.brainstudio');
		this._renderTemplateGrid(this.el.querySelector('#bsTplGrid'));
		this._renderPalette();
		this.el.querySelector('#bsBlank').addEventListener('click', () => this._start(defaultGraph()));
		this.el.querySelector('#bsFit').addEventListener('click', () => this.graph?.fit());
		this.el.querySelector('#bsDiff').addEventListener('click', () => this._showBehavior());
		this.el.querySelector('#bsTpl').addEventListener('click', () => this._showTemplateModal());
		this.el.querySelector('#bsSave').addEventListener('click', () => this._saveNow());
		this.el.querySelector('#bsDone').addEventListener('click', () => this._done());
		this.el.querySelector('#bsCompose').addEventListener('submit', (e) => { e.preventDefault(); this._send(); });
		const input = this.el.querySelector('#bsInput');
		input.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); this._send(); } });
		input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(120, input.scrollHeight)}px`; });
		this.el.querySelector('#bsModal').addEventListener('click', (e) => { if (e.target.id === 'bsModal') this._closeModal(); });

		// Keyboard: ⌘/Ctrl+S saves the graph immediately; Escape always dismisses an
		// open modal so it can never become a dead-end that blocks the editor beneath.
		this._keyHandler = (e) => {
			const modal = this.el.querySelector('#bsModal');
			if (e.key === 'Escape' && modal && !modal.hidden) { e.preventDefault(); this._closeModal(); return; }
			if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S') && this._isVisible()) {
				e.preventDefault();
				this._saveNow();
			}
		};
		document.addEventListener('keydown', this._keyHandler);
	}

	// True only when the Brain tab is the active (non-hidden) studio panel — keeps
	// the global ⌘S handler from firing while the user is editing another tab.
	_isVisible() {
		const panel = this.el.closest('.studio-tabpanel');
		return !!panel && !panel.hidden && this.root?.dataset.view === 'editor';
	}

	// ── Save + continue ───────────────────────────────────────────────────────

	// Flush the debounced graph persist to the server right now and confirm it on
	// the Save button. The shell's header indicator also tracks the underlying
	// store write (save:pending → save:ok), so the user gets two honest signals.
	async _saveNow({ silent = false } = {}) {
		// Push the latest graph through the normal persist path (immediate, no debounce)
		// then flush the store so the write lands before we confirm or navigate.
		if (this.graph) this._onGraphChange(this.graph.toGraph(), { immediate: true });
		const btn = this.el.querySelector('#bsSave');
		if (btn && !silent) { btn.disabled = true; btn.textContent = 'Saving…'; }
		try {
			await this.studio.commit();
			if (btn && !silent) this._flashSaved(btn);
			return true;
		} catch {
			if (btn && !silent) { btn.disabled = false; btn.textContent = 'Retry save'; }
			return false;
		}
	}

	_flashSaved(btn) {
		btn.disabled = false;
		btn.textContent = 'Saved ✓';
		btn.classList.add('is-saved');
		clearTimeout(this._savedFlash);
		this._savedFlash = setTimeout(() => { btn.textContent = 'Save'; btn.classList.remove('is-saved'); }, 1600);
	}

	// Save, then hand off to the next studio section so building a brain flows
	// naturally into Memory rather than dead-ending on the graph.
	async _done() {
		// Only advance once the write actually lands — a failed save rolls back in the
		// store, so navigating away on failure would silently drop the user's edits.
		if (await this._saveNow()) {
			document.dispatchEvent(new CustomEvent('studio:navigate', { detail: { tab: 'memory' } }));
		}
	}

	_renderPalette() {
		const pal = this.el.querySelector('#bsPalette');
		pal.innerHTML = PALETTE.map((t) => `<button class="brainstudio__chip brainstudio__chip--${NODE_TYPES[t].accent}" data-add="${t}" title="Add ${NODE_TYPES[t].title}">+ ${esc(NODE_TYPES[t].title)}</button>`).join('');
		pal.addEventListener('click', (e) => {
			const t = e.target.closest('[data-add]')?.dataset.add;
			if (t) this.graph?.addNode(t);
		});
	}

	_renderTemplateGrid(host) {
		host.innerHTML = TEMPLATES.map((t) => `
			<button class="brainstudio__tpl brainstudio__tpl--${t.accent}" data-tpl="${t.id}">
				<span class="brainstudio__tpl-name">${esc(t.name)}</span>
				<span class="brainstudio__tpl-tag">${esc(t.tagline)}</span>
			</button>`).join('');
		host.addEventListener('click', (e) => {
			const id = e.target.closest('[data-tpl]')?.dataset.tpl;
			const tpl = TEMPLATES.find((t) => t.id === id);
			if (tpl) this._start(tpl.make());
		});
	}

	// ── View states ────────────────────────────────────────────────────────

	_showOnboarding() { this.root.dataset.view = 'onboard'; this.el.querySelector('#bsOnboard').hidden = false; this.el.querySelector('#bsEditor').hidden = true; }

	_showEditor() {
		this.root.dataset.view = 'editor';
		this.el.querySelector('#bsOnboard').hidden = true;
		this.el.querySelector('#bsEditor').hidden = false;
		if (!this.graph) {
			const canvas = this.el.querySelector('#bsCanvas');
			this.graph = new BrainGraphView(canvas, {
				onChange: (g) => this._onGraphChange(g),
				onSelect: (n) => this._renderInspector(n),
			});
			// The Brain tab may be mounted while hidden (zero size), so the initial
			// fit() no-ops. Re-frame once the panel first gains a real size.
			if (typeof ResizeObserver !== 'undefined') {
				let framed = false;
				const ro = new ResizeObserver(() => {
					if (!framed && canvas.clientWidth > 0) { framed = true; this.graph.fit(); ro.disconnect(); }
				});
				ro.observe(canvas);
			}
			this.runtime = new BrainRuntime({
				graphView: this.graph,
				studio: this.studio,
				getCompiled: () => compileBrain(this.graph.toGraph(), { agentName: this.studio.agent?.name }),
				getGraph: () => this.graph.toGraph(),
			});
		}
	}

	_start(graph) {
		this._showEditor();
		this.graph.load(normalizeGraph(graph));
		this._onGraphChange(this.graph.toGraph(), { immediate: true });
		this._renderInspector(null);
	}

	// ── Persistence ─────────────────────────────────────────────────────────

	_onGraphChange(graph, { immediate = false } = {}) {
		const compiled = compileBrain(graph, { agentName: this.studio.agent?.name });
		this._updateTestModelLabel(compiled);
		clearTimeout(this._saveTimer);
		const persist = () => {
			this.studio.patch({
				meta: { studio: { studio_version: 1, brain: { version: 1, graph, compiled: { personaPrompt: compiled.personaPrompt, provider: compiled.provider, model: compiled.model } } } },
				personaPrompt: compiled.personaPrompt,
			});
		};
		if (immediate) persist();
		else this._saveTimer = setTimeout(persist, 400);
	}

	// ── Inspector ─────────────────────────────────────────────────────────────

	_renderInspector(node) {
		const host = this.el.querySelector('#bsInspector');
		if (!node) {
			host.innerHTML = `<div class="brainstudio__inspector-empty"><h3>Inspector</h3><p>Select a node to edit it, or drag from a node's right-hand port to wire it into another.</p></div>`;
			return;
		}
		const spec = NODE_TYPES[node.type];
		host.innerHTML = `<div class="brainstudio__insp-head"><span class="brainstudio__insp-dot brainstudio__insp-dot--${spec.accent}"></span><h3>${esc(spec.title)}</h3></div>
			<div class="brainstudio__fields">${spec.fields.map((f) => this._fieldHtml(f, node.data[f.key])).join('')}</div>`;
		host.querySelectorAll('[data-field]').forEach((inp) => {
			const key = inp.dataset.field;
			const field = spec.fields.find((f) => f.key === key);
			const handler = () => this.graph.updateNodeData(node.id, { [key]: this._readField(field, inp) });
			inp.addEventListener(inp.tagName === 'SELECT' || inp.type === 'checkbox' ? 'change' : 'input', handler);
		});
	}

	_fieldHtml(field, value) {
		const id = `f_${field.key}`;
		const label = `<label class="brainstudio__field-label" for="${id}">${esc(field.label)}</label>`;
		let control = '';
		switch (field.type) {
			case 'textarea':
				control = `<textarea class="brainstudio__input" id="${id}" data-field="${field.key}" rows="2">${esc(value || '')}</textarea>`;
				break;
			case 'number':
				control = `<input class="brainstudio__input" id="${id}" data-field="${field.key}" type="number" min="${field.min ?? ''}" max="${field.max ?? ''}" step="${field.step ?? 1}" value="${esc(value ?? '')}" />`;
				break;
			case 'toggle':
				control = `<label class="brainstudio__toggle"><input id="${id}" data-field="${field.key}" type="checkbox" ${value ? 'checked' : ''} /><span></span></label>`;
				break;
			case 'select':
				control = `<select class="brainstudio__input" id="${id}" data-field="${field.key}">${field.options.map((o) => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
				break;
			case 'provider':
				control = this._providerSelect(id, field.key, value);
				break;
			case 'skill':
				control = this._skillSelect(id, field.key, value);
				break;
			case 'tags':
				control = `<input class="brainstudio__input" id="${id}" data-field="${field.key}" type="text" value="${esc((value || []).join(', '))}" placeholder="comma, separated" />`;
				break;
			default:
				control = `<input class="brainstudio__input" id="${id}" data-field="${field.key}" type="text" value="${esc(value ?? '')}" placeholder="${esc(field.placeholder || '')}" />`;
		}
		return `<div class="brainstudio__field">${label}${control}</div>`;
	}

	_providerSelect(id, key, value) {
		const list = this.providers.length ? this.providers : [{ key: value || 'claude-sonnet-4-6', label: value || 'Claude Sonnet 4.6', available: true, tier: '', network: '' }];
		const opts = list.map((p) => `<option value="${esc(p.key)}" ${p.key === value ? 'selected' : ''} ${p.available ? '' : 'disabled'}>${esc(p.label)}${p.available ? '' : ' (no key)'}${p.tier ? ` · ${esc(p.tier)}` : ''}</option>`).join('');
		return `<select class="brainstudio__input" id="${id}" data-field="${key}">${opts}</select>`;
	}

	_skillSelect(id, key, value) {
		const skills = this.studio.agent?.skills || [];
		if (!skills.length) return `<input class="brainstudio__input" id="${id}" data-field="${key}" type="text" value="${esc(value || '')}" placeholder="no skills enabled yet" />`;
		const opts = ['<option value="">— pick a skill —</option>', ...skills.map((s) => `<option value="${esc(s)}" ${s === value ? 'selected' : ''}>${esc(s)}</option>`)].join('');
		return `<select class="brainstudio__input" id="${id}" data-field="${key}">${opts}</select>`;
	}

	_readField(field, inp) {
		switch (field.type) {
			case 'number': return Number(inp.value);
			case 'toggle': return inp.checked;
			case 'tags': return inp.value.split(',').map((s) => s.trim()).filter(Boolean);
			default: return inp.value;
		}
	}

	// ── Test chat ───────────────────────────────────────────────────────────

	_updateTestModelLabel(compiled) {
		const el = this.el.querySelector('#bsTestModel');
		if (el) el.textContent = compiled.provider ? `· ${compiled.provider}` : '';
	}

	async _send() {
		const input = this.el.querySelector('#bsInput');
		const text = input.value.trim();
		if (!text || this._running) return;
		input.value = ''; input.style.height = 'auto';
		this._running = true;
		this.el.querySelector('#bsSend').disabled = true;

		this._appendMsg('user', text);
		const bubble = this._appendMsg('agent', '');
		const statEl = bubble.querySelector('.brainstudio__msg-stat');
		try {
			const { stats } = await this.runtime.run(text, {
				history: this._history,
				onToken: (t) => { bubble.querySelector('.brainstudio__msg-text').textContent += t; this._scrollTranscript(); },
				onMeta: (m) => { statEl.textContent = `${m.label}…`; },
			});
			const reply = bubble.querySelector('.brainstudio__msg-text').textContent;
			// Only record a turn the proxy will accept next time (it rejects empty
			// assistant content) — an empty reply means nothing streamed.
			if (reply.trim()) {
				this._history.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
				this._history = this._history.slice(-20);
			}
			statEl.textContent = this._fmtStats(stats);
		} catch (err) {
			bubble.classList.add('is-error');
			bubble.querySelector('.brainstudio__msg-text').textContent = this._friendlyError(err);
		} finally {
			this._running = false;
			this.el.querySelector('#bsSend').disabled = false;
			this.graph.clearActive();
		}
	}

	_friendlyError(err) {
		const m = err?.message || 'stream error';
		if (/sign in/i.test(m)) return 'Sign in to use this model, or pick a free one in the Model node.';
		if (/rate|429|too many/i.test(m)) return 'Rate limited — slow down a moment and try again.';
		if (/not_configured|no api key/i.test(m)) return 'That model has no API key configured. Pick another in the Model node.';
		return `Couldn't reach the model: ${m}`;
	}

	_fmtStats(s) {
		const bits = [];
		if (s.label) bits.push(s.label);
		if (s.firstTokenMs != null) bits.push(`${s.firstTokenMs}ms first token`);
		if (s.usage?.outputTokens) bits.push(`${s.usage.outputTokens} tok`);
		if (s.elapsedMs) bits.push(`${(s.elapsedMs / 1000).toFixed(1)}s`);
		return bits.join(' · ');
	}

	_appendMsg(role, text) {
		const t = this.el.querySelector('#bsTranscript');
		const msg = document.createElement('div');
		msg.className = `brainstudio__msg brainstudio__msg--${role}`;
		msg.innerHTML = `<div class="brainstudio__msg-text"></div><div class="brainstudio__msg-stat"></div>`;
		msg.querySelector('.brainstudio__msg-text').textContent = text;
		t.appendChild(msg);
		this._scrollTranscript();
		return msg;
	}

	_scrollTranscript() {
		const t = this.el.querySelector('#bsTranscript');
		t.scrollTop = t.scrollHeight;
	}

	// ── Modals: templates + behavior diff ─────────────────────────────────────

	_showTemplateModal() {
		const card = this.el.querySelector('#bsModalCard');
		card.innerHTML = `<div class="brainstudio__modal-head"><h2>Fork a brain</h2><button class="brainstudio__modal-x" aria-label="Close">×</button></div>
			<p class="brainstudio__modal-sub">Replaces the current graph. Your current brain is saved until you save over it.</p>
			<div class="brainstudio__templates" id="bsModalTpl"></div>`;
		this._renderTemplateGrid(card.querySelector('#bsModalTpl'));
		card.querySelector('.brainstudio__modal-x').addEventListener('click', () => this._closeModal());
		card.querySelector('#bsModalTpl').addEventListener('click', () => this._closeModal());
		this.el.querySelector('#bsModal').hidden = false;
	}

	// Show how the current circuit compiles to behavior, and diff it against the
	// last-saved brain so a user sees exactly how an edit changes the agent.
	_showBehavior() {
		// The brain canvas mounts lazily (see _showEditor), so #bsDiff can be
		// clicked before this.graph exists — e.g. during the async provider fetch
		// in _init, or a stray click while onboarding is still showing. Lazily
		// mount the editor first so there's always a graph to compile; an empty
		// graph renders the "(empty — wire a Persona node)" diff rather than
		// throwing "undefined is not an object (evaluating 'this.graph.toGraph')".
		if (!this.graph) this._showEditor();
		const current = compileBrain(this.graph.toGraph(), { agentName: this.studio.agent?.name });
		const prev = this._savedPersona;
		const card = this.el.querySelector('#bsModalCard');
		card.innerHTML = `<div class="brainstudio__modal-head"><h2>How this brain behaves</h2><button class="brainstudio__modal-x" aria-label="Close">×</button></div>
			<div class="brainstudio__behavior">
				<div class="brainstudio__behavior-meta">
					<span><b>Model</b> ${esc(current.provider)}</span>
					<span><b>Memory</b> ${current.memory ? `top-${current.memory.topK} @ ${current.memory.minScore}` : 'off'}</span>
					<span><b>Skills</b> ${current.skills.length || 'none'}</span>
					<span><b>Market rules</b> ${current.marketRules.length || 'none'}</span>
				</div>
				<h3>Compiled persona</h3>
				<pre class="brainstudio__diff">${this._diffHtml(prev, current.personaPrompt)}</pre>
			</div>`;
		card.querySelector('.brainstudio__modal-x').addEventListener('click', () => this._closeModal());
		this.el.querySelector('#bsModal').hidden = false;
	}

	// Minimal line-level diff: unchanged lines plain, added green, removed red.
	_diffHtml(prev, next) {
		const a = (prev || '').split('\n');
		const b = (next || '').split('\n');
		const aSet = new Set(a);
		const bSet = new Set(b);
		const out = [];
		for (const line of a) if (!bSet.has(line) && line.trim()) out.push(`<span class="diff-del">- ${esc(line)}</span>`);
		for (const line of b) out.push(bSet.has(line) && !aSet.has(line) ? `<span class="diff-add">+ ${esc(line)}</span>` : esc(line));
		return out.join('\n') || '<span class="diff-muted">(empty — wire a Persona node)</span>';
	}

	_closeModal() {
		const modal = this.el.querySelector('#bsModal');
		if (modal) modal.hidden = true;
		// The brain canvas mounts lazily (see _mountGraph), so the modal can be
		// dismissed before this.graph exists — e.g. a fast open→close, or closing
		// via backdrop click before the canvas framed. Only resnapshot the saved
		// persona when there's a graph to compile; otherwise keep the last value.
		if (this.graph) {
			this._savedPersona = compileBrain(this.graph.toGraph(), {
				agentName: this.studio.agent?.name,
			}).personaPrompt;
		}
	}
}
