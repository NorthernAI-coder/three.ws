/**
 * Brain Studio — form editor (P1, replaces the node-graph canvas)
 * ===============================================================
 * The agent's brain as a structured form instead of a draggable flow-chart. Same
 * underlying model (brain-nodes.js graph: nodes + edges), same compiler, same
 * runtime — only the editing surface changed. Wiring is automatic and deterministic:
 * the user configures persona, model, memory, skills, market signals and avatar
 * output in plain fields, and this view keeps a fully-connected circuit wired for
 * the compiler and the live "watch it think" animation.
 *
 * Drop-in replacement for the old BrainGraphView — same public surface the studio
 * controller and brain-runtime.js depend on:
 *   new BrainFormView(host, { onChange, getProviders, getSkills })
 *   .load(graph) / .toGraph()
 *   .addNode(type) / .removeNode(id) / .updateNodeData(id, patch)
 *   .setProviders(list)            — re-render Model pickers when availability arrives
 *   .fit()                         — no-op (kept for interface parity)
 *   Active-path animation (driven by brain-runtime.js):
 *   .circuit() / .setActive() / .pulseNode() / .flowEdge() / .clearActive()
 *   .setNodeBusy(id, busy) / .setNodeStat(id, text)
 */

import { NODE_TYPES, makeNode, edge, normalizeGraph } from './brain-nodes.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The order sections stack in the form, top → bottom: identity first, the model
// that runs it last-but-one, the avatar it speaks through last. Memory/skill/market
// slot between persona and model as the "context" the model reasons over.
const SECTION_ORDER = ['persona', 'memory', 'skill', 'market', 'model', 'output'];

// One-line "what this section does" copy under each header — orients without a manual.
const SECTION_HINT = {
	persona: 'Who your agent is and how it speaks.',
	model: 'The brain that runs it — pick speed vs. depth.',
	memory: 'Recall relevant past context before answering, and remember new facts.',
	skill: 'A capability your agent can invoke as a tool.',
	market: 'A market condition your agent reasons about and reacts to.',
	output: 'How the reply reaches your live avatar.',
};

export class BrainFormView {
	constructor(host, { onChange, getProviders, getSkills } = {}) {
		this.host = host;
		this.onChange = onChange || (() => {});
		this.getProviders = getProviders || (() => []);
		this.getSkills = getSkills || (() => []);
		this.nodes = [];
		this.edges = [];
		this._cardEls = new Map(); // nodeId → section element
		this._render();
	}

	_render() {
		this.host.classList.add('bform');
		this.host.innerHTML = `<div class="bform__sections" id="bfSections"></div>`;
		this.sectionsEl = this.host.querySelector('#bfSections');
	}

	// ── Load / serialize ──────────────────────────────────────────────────────

	load(graph) {
		const g = normalizeGraph(graph);
		this.nodes = g.nodes.map((n) => ({ ...n, data: { ...n.data } }));
		this._ensureStructural();
		this._rewire();
		this._renderAll();
	}

	toGraph() {
		return {
			version: 1,
			nodes: this.nodes.map((n) => ({ id: n.id, type: n.type, x: Math.round(n.x || 0), y: Math.round(n.y || 0), data: { ...n.data } })),
			edges: this.edges.map((e) => ({ id: e.id, from: e.from, fromPort: e.fromPort, to: e.to, toPort: e.toPort })),
		};
	}

	_emitChange() { this.onChange(this.toGraph()); }

	fit() { /* no canvas to frame — kept for BrainGraphView interface parity */ }

	// ── Structure + deterministic wiring ────────────────────────────────────────

	// Persona, Model and Output are structural: the circuit is meaningless without
	// them, so a loaded graph missing any gets a default one rather than a half-brain.
	_ensureStructural() {
		for (const type of ['persona', 'model', 'output']) {
			if (!this.nodes.some((n) => n.type === type)) this.nodes.push(makeNode(type, 0, 0));
		}
	}

	// Rebuild edges from the current node set so every configured section feeds the
	// model and the model feeds the avatar. The user never wires anything by hand —
	// adding a Memory/Skill/Market section is enough to put it in the live circuit.
	_rewire() {
		const persona = this.nodes.find((n) => n.type === 'persona');
		const model = this.nodes.find((n) => n.type === 'model');
		const output = this.nodes.find((n) => n.type === 'output');
		const edges = [];
		if (persona && model) edges.push(edge(persona, 'identity', model, 'identity'));
		for (const mem of this.nodes.filter((n) => n.type === 'memory')) edges.push(edge(mem, 'recall', model, 'context'));
		for (const sk of this.nodes.filter((n) => n.type === 'skill')) edges.push(edge(sk, 'tool', model, 'tools'));
		for (const mk of this.nodes.filter((n) => n.type === 'market')) edges.push(edge(mk, 'signal', model, 'context'));
		if (model && output) edges.push(edge(model, 'reply', output, 'reply'));
		this.edges = edges;
	}

	// ── Mutations ───────────────────────────────────────────────────────────────

	addNode(type) {
		const spec = NODE_TYPES[type];
		if (!spec) return null;
		// Memory is conceptually one-per-brain even though the model allows many.
		const onePer = spec.single || type === 'memory';
		if (onePer && this.nodes.some((n) => n.type === type)) return null;
		const node = makeNode(type, 0, 0);
		this.nodes.push(node);
		this._rewire();
		this._renderAll();
		this._emitChange();
		// Focus the new section's first field so adding flows straight into editing.
		this._cardEls.get(node.id)?.querySelector('input, select, textarea')?.focus();
		return node;
	}

	removeNode(id) {
		const node = this.nodes.find((n) => n.id === id);
		if (!node || NODE_TYPES[node.type].single) return; // persona/model/output are structural
		this.nodes = this.nodes.filter((n) => n.id !== id);
		this._rewire();
		this._renderAll();
		this._emitChange();
	}

	updateNodeData(id, patch) {
		const node = this.nodes.find((n) => n.id === id);
		if (!node) return;
		Object.assign(node.data, patch);
		this._emitChange();
	}

	// ── Render ────────────────────────────────────────────────────────────────

	_renderAll() {
		this._cardEls.clear();
		this.sectionsEl.innerHTML = '';
		for (const type of SECTION_ORDER) {
			const ofType = this.nodes.filter((n) => n.type === type);
			for (const node of ofType) this.sectionsEl.appendChild(this._cardEl(node));
			const addEl = this._addControl(type, ofType.length);
			if (addEl) this.sectionsEl.appendChild(addEl);
		}
	}

	// An "+ Add …" control for the optional, repeatable sections. Memory shows only
	// while absent; Skill/Market always offer another. Structural nodes get none.
	_addControl(type, count) {
		if (type === 'memory' && count === 0) return this._addBtn('memory', '+ Add memory');
		if (type === 'skill') return this._addBtn('skill', count ? '+ Add another skill' : '+ Add a skill');
		if (type === 'market') return this._addBtn('market', count ? '+ Add another market signal' : '+ Add a market signal');
		return null;
	}

	_addBtn(type, label) {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = `bform__add bform__add--${NODE_TYPES[type].accent}`;
		btn.textContent = label;
		btn.addEventListener('click', () => this.addNode(type));
		return btn;
	}

	_cardEl(node) {
		const spec = NODE_TYPES[node.type];
		const removable = !spec.single;
		const card = document.createElement('section');
		card.className = `bform__card bform__card--${spec.accent}`;
		card.dataset.node = node.id;
		card.dataset.type = node.type;
		card.innerHTML = `
			<header class="bform__card-head">
				<span class="bform__card-dot" aria-hidden="true"></span>
				<h3 class="bform__card-title">${esc(spec.title)}</h3>
				<span class="bform__card-stat" data-stat hidden></span>
				${removable ? '<button type="button" class="bform__card-del" aria-label="Remove this section">Remove</button>' : ''}
			</header>
			<p class="bform__card-hint">${esc(SECTION_HINT[node.type] || '')}</p>
			<div class="bform__fields">${spec.fields.map((f) => this._fieldHtml(f, node.data[f.key])).join('')}</div>`;

		card.querySelector('.bform__card-del')?.addEventListener('click', () => this.removeNode(node.id));
		card.querySelectorAll('[data-field]').forEach((inp) => {
			const key = inp.dataset.field;
			const field = spec.fields.find((f) => f.key === key);
			const evt = inp.tagName === 'SELECT' || inp.type === 'checkbox' ? 'change' : 'input';
			inp.addEventListener(evt, () => this.updateNodeData(node.id, { [key]: this._readField(field, inp) }));
		});
		this._cardEls.set(node.id, card);
		return card;
	}

	// ── Fields ──────────────────────────────────────────────────────────────────

	_fieldHtml(field, value) {
		const id = `bf_${field.key}_${Math.abs(hash(String(value) + field.key))}`;
		const label = `<label class="bform__field-label" for="${id}">${esc(field.label)}</label>`;
		let control = '';
		switch (field.type) {
			case 'textarea':
				control = `<textarea class="bform__input" id="${id}" data-field="${field.key}" rows="2">${esc(value || '')}</textarea>`;
				break;
			case 'number':
				control = `<input class="bform__input" id="${id}" data-field="${field.key}" type="number" min="${field.min ?? ''}" max="${field.max ?? ''}" step="${field.step ?? 1}" value="${esc(value ?? '')}" />`;
				break;
			case 'toggle':
				control = `<label class="bform__toggle"><input id="${id}" data-field="${field.key}" type="checkbox" ${value ? 'checked' : ''} /><span></span></label>`;
				break;
			case 'select':
				control = `<select class="bform__input" id="${id}" data-field="${field.key}">${field.options.map((o) => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
				break;
			case 'provider':
				control = this._providerSelect(id, field.key, value);
				break;
			case 'skill':
				control = this._skillSelect(id, field.key, value);
				break;
			case 'tags':
				control = `<input class="bform__input" id="${id}" data-field="${field.key}" type="text" value="${esc((value || []).join(', '))}" placeholder="comma, separated" />`;
				break;
			default:
				control = `<input class="bform__input" id="${id}" data-field="${field.key}" type="text" value="${esc(value ?? '')}" placeholder="${esc(field.placeholder || '')}" />`;
		}
		// Toggles read better as a single inline row (label + switch) than stacked.
		const inline = field.type === 'toggle' ? ' bform__field--inline' : '';
		return `<div class="bform__field${inline}">${label}${control}</div>`;
	}

	_providerSelect(id, key, value) {
		const list = this.getProviders();
		const opts = (list.length ? list : [{ key: value || 'claude-sonnet-4-6', label: value || 'Claude Sonnet 4.6', available: true, tier: '' }])
			.map((p) => `<option value="${esc(p.key)}" ${p.key === value ? 'selected' : ''} ${p.available ? '' : 'disabled'}>${esc(p.label)}${p.available ? '' : ' (no key)'}${p.tier ? ` · ${esc(p.tier)}` : ''}</option>`)
			.join('');
		return `<select class="bform__input" id="${id}" data-field="${key}">${opts}</select>`;
	}

	_skillSelect(id, key, value) {
		const skills = this.getSkills();
		if (!skills.length) return `<input class="bform__input" id="${id}" data-field="${key}" type="text" value="${esc(value || '')}" placeholder="no skills enabled yet — turn some on in the Skills tab" />`;
		const opts = ['<option value="">— pick a skill —</option>', ...skills.map((s) => `<option value="${esc(s)}" ${s === value ? 'selected' : ''}>${esc(s)}</option>`)].join('');
		return `<select class="bform__input" id="${id}" data-field="${key}">${opts}</select>`;
	}

	_readField(field, inp) {
		switch (field.type) {
			case 'number': return Number(inp.value);
			case 'toggle': return inp.checked;
			case 'tags': return inp.value.split(',').map((s) => s.trim()).filter(Boolean);
			default: return inp.value;
		}
	}

	// Providers arrive async (GET /api/brain/chat); re-render just the Model pickers so
	// availability + labels fill in without disturbing the user's other in-progress edits.
	setProviders() {
		for (const node of this.nodes.filter((n) => n.type === 'model')) {
			const card = this._cardEls.get(node.id);
			const sel = card?.querySelector('[data-field="provider"]');
			if (sel) sel.outerHTML = this._providerSelect(sel.id, 'provider', node.data.provider);
			// outerHTML replaces the node, so rebind the change handler on the fresh one.
			const fresh = card?.querySelector('[data-field="provider"]');
			fresh?.addEventListener('change', () => this.updateNodeData(node.id, { provider: fresh.value }));
		}
	}

	// ── Active-path animation (the "watch it think" moment, sans canvas) ─────────

	circuit() {
		// Every section is auto-wired into the live circuit, so the runtime can light
		// them all up in order. Edge ids are unused by the form but kept for parity.
		return { nodeIds: this.nodes.map((n) => n.id), edgeIds: this.edges.map((e) => e.id) };
	}

	setActive(nodeIds = []) {
		const on = new Set(nodeIds);
		for (const [id, el] of this._cardEls) el.classList.toggle('is-active', on.has(id));
	}

	pulseNode(id) {
		const el = this._cardEls.get(id);
		if (!el) return;
		el.classList.remove('is-pulse');
		void el.offsetWidth; // restart the animation
		el.classList.add('is-pulse');
		// Bring the firing section into view so the user watches the path travel.
		el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}

	flowEdge() { /* no visible edges in form mode */ }

	setNodeBusy(id, busy) {
		this._cardEls.get(id)?.classList.toggle('is-busy', !!busy);
	}

	setNodeStat(id, text) {
		const el = this._cardEls.get(id)?.querySelector('[data-stat]');
		if (!el) return;
		el.textContent = text || '';
		el.hidden = !text;
	}

	clearActive() {
		for (const el of this._cardEls.values()) {
			el.classList.remove('is-active', 'is-pulse', 'is-busy');
			const stat = el.querySelector('[data-stat]');
			if (stat) { stat.textContent = ''; stat.hidden = true; }
		}
	}
}

// Tiny stable hash for unique field ids (avoids Date.now / Math.random churn on
// re-render so label/for pairs stay deterministic within a render).
function hash(s) {
	let h = 0;
	for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
	return h;
}
