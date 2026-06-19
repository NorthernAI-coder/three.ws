/**
 * Brain Studio — visual node-graph editor (P1)
 * ============================================
 * A dependency-free node editor built on DOM nodes + an SVG edge layer inside a
 * pan/zoom world. We deliberately did NOT pull in Rete.js / litegraph / React
 * Flow: the main app is vanilla and we cannot add npm deps in this environment,
 * AND keeping the renderer ours means the saved format is ours (brain-nodes.js),
 * never a library's internal schema leaking into the DB — and the live "thinking"
 * animation can address our own nodes/edges directly. ~1 file, zero deps, full
 * control of the screenshot moment.
 *
 * Public API:
 *   new BrainGraphView(host, { onChange, onSelect })
 *   .load(graph)            — render a normalized graph
 *   .toGraph()              — serialize current state
 *   .addNode(type)          — drop a node at viewport centre
 *   .removeNode(id) / .removeEdge(id)
 *   .select(id|null)
 *   .fit()                  — frame all nodes
 *   Active-path animation (driven by brain-runtime.js):
 *   .setActive(nodeIds, edgeIds) / .pulseNode(id) / .flowEdge(id) / .clearActive()
 */

import { NODE_TYPES, canConnect, makeNode } from './brain-nodes.js';

const NODE_W = 208;
const HEADER_H = 34;
const PORT_ROW = 26;
const PORT_PAD = 10;

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class BrainGraphView {
	constructor(host, { onChange, onSelect } = {}) {
		this.host = host;
		this.onChange = onChange || (() => {});
		this.onSelect = onSelect || (() => {});
		this.nodes = [];
		this.edges = [];
		this.selectedId = null;
		this.scale = 1;
		this.tx = 0;
		this.ty = 0;
		this._nodeEls = new Map();
		this._linking = null; // { from, fromPort, kind, ghost }
		this._render();
	}

	_render() {
		this.host.classList.add('bgraph');
		this.host.innerHTML = `
			<div class="bgraph__world" id="bgWorld">
				<svg class="bgraph__edges" id="bgEdges" aria-hidden="true"></svg>
				<div class="bgraph__nodes" id="bgNodes"></div>
			</div>
			<div class="bgraph__hint" id="bgHint"></div>`;
		this.world = this.host.querySelector('#bgWorld');
		this.svg = this.host.querySelector('#bgEdges');
		this.nodesEl = this.host.querySelector('#bgNodes');
		this._bindCanvas();
	}

	// ── Load / serialize ──────────────────────────────────────────────────────

	load(graph) {
		this.nodes = graph.nodes.map((n) => ({ ...n, data: { ...n.data } }));
		this.edges = graph.edges.map((e) => ({ ...e }));
		this.selectedId = null;
		this._renderAll();
		// Frame the graph on first load so the user always sees their circuit.
		requestAnimationFrame(() => this.fit());
	}

	toGraph() {
		return {
			version: 1,
			nodes: this.nodes.map((n) => ({ id: n.id, type: n.type, x: Math.round(n.x), y: Math.round(n.y), data: { ...n.data } })),
			edges: this.edges.map((e) => ({ id: e.id, from: e.from, fromPort: e.fromPort, to: e.to, toPort: e.toPort })),
		};
	}

	_emitChange() { this.onChange(this.toGraph()); }

	// ── Geometry ────────────────────────────────────────────────────────────

	_nodeHeight(node) {
		const spec = NODE_TYPES[node.type];
		const rows = Math.max(spec.inputs.length, spec.outputs.length);
		return HEADER_H + Math.max(rows, 1) * PORT_ROW + PORT_PAD;
	}

	_portAnchor(node, portId, dir) {
		const spec = NODE_TYPES[node.type];
		const list = dir === 'out' ? spec.outputs : spec.inputs;
		const idx = list.findIndex((p) => p.id === portId);
		const y = node.y + HEADER_H + idx * PORT_ROW + PORT_ROW / 2 + PORT_PAD / 2;
		const x = dir === 'out' ? node.x + NODE_W : node.x;
		return { x, y };
	}

	// ── Full render ─────────────────────────────────────────────────────────

	_renderAll() {
		this.nodesEl.innerHTML = '';
		this._nodeEls.clear();
		for (const node of this.nodes) this._renderNode(node);
		this._renderEdges();
		this._applyTransform();
	}

	_renderNode(node) {
		const spec = NODE_TYPES[node.type];
		const el = document.createElement('div');
		el.className = `bnode bnode--${spec.accent}`;
		el.dataset.id = node.id;
		el.style.width = `${NODE_W}px`;
		el.style.height = `${this._nodeHeight(node)}px`;
		el.style.transform = `translate(${node.x}px, ${node.y}px)`;
		el.innerHTML = `
			<div class="bnode__head"><span class="bnode__title">${escapeHtml(spec.title)}</span>${spec.single ? '' : '<button class="bnode__del" title="Delete node" aria-label="Delete node">×</button>'}</div>
			<div class="bnode__summary">${escapeHtml(this._summary(node))}</div>
			<div class="bnode__ports">
				<div class="bnode__col bnode__col--in">${spec.inputs.map((p) => this._portHtml(p, 'in')).join('')}</div>
				<div class="bnode__col bnode__col--out">${spec.outputs.map((p) => this._portHtml(p, 'out')).join('')}</div>
			</div>`;
		this.nodesEl.appendChild(el);
		this._nodeEls.set(node.id, el);
		this._bindNode(el, node);
	}

	_portHtml(port, dir) {
		return `<span class="bport bport--${dir} bport--${port.kind}" data-port="${port.id}" data-dir="${dir}" data-kind="${port.kind}" title="${escapeHtml(port.label)} (${port.kind})"><i class="bport__dot"></i><span class="bport__label">${escapeHtml(port.label)}</span></span>`;
	}

	_summary(node) {
		const d = node.data;
		switch (node.type) {
			case 'persona': return d.role || 'identity';
			case 'model': return d.provider || 'pick a model';
			case 'memory': return `recall ${d.topK} · write ${d.write ? 'on' : 'off'}`;
			case 'skill': return d.skill || 'pick a skill';
			case 'market': return `${d.trigger}${d.level ? ` @ ${d.level}` : ''}`;
			case 'output': return [d.speak && 'speak', d.emotion && 'emote', d.lipsync && 'lip-sync'].filter(Boolean).join(' · ') || 'silent';
			default: return '';
		}
	}

	refreshNode(id) {
		const node = this.nodes.find((n) => n.id === id);
		const el = this._nodeEls.get(id);
		if (!node || !el) return;
		el.querySelector('.bnode__summary').textContent = this._summary(node);
	}

	_renderEdges() {
		const parts = [];
		for (const e of this.edges) {
			const fromNode = this.nodes.find((n) => n.id === e.from);
			const toNode = this.nodes.find((n) => n.id === e.to);
			if (!fromNode || !toNode) continue;
			const a = this._portAnchor(fromNode, e.fromPort, 'out');
			const b = this._portAnchor(toNode, e.toPort, 'in');
			parts.push(`<path class="bedge" data-id="${e.id}" d="${this._curve(a, b)}" />`);
			parts.push(`<path class="bedge-hit" data-id="${e.id}" d="${this._curve(a, b)}" />`);
		}
		this.svg.innerHTML = parts.join('');
		this.svg.querySelectorAll('.bedge-hit').forEach((p) => {
			p.addEventListener('click', (ev) => { ev.stopPropagation(); this.removeEdge(p.dataset.id); });
		});
	}

	_curve(a, b) {
		const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
		return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
	}

	// ── Node interaction ──────────────────────────────────────────────────────

	_bindNode(el, node) {
		const head = el.querySelector('.bnode__head');
		head.addEventListener('pointerdown', (e) => this._startDrag(e, node, el));
		el.addEventListener('pointerdown', () => this.select(node.id));
		el.querySelector('.bnode__del')?.addEventListener('click', (e) => { e.stopPropagation(); this.removeNode(node.id); });
		el.querySelectorAll('.bport').forEach((portEl) => {
			portEl.addEventListener('pointerdown', (e) => {
				e.stopPropagation();
				if (portEl.dataset.dir === 'out') this._startLink(e, node, portEl);
			});
			portEl.addEventListener('pointerup', (e) => {
				if (portEl.dataset.dir === 'in') this._completeLink(e, node, portEl);
			});
		});
	}

	_startDrag(e, node, el) {
		e.preventDefault();
		const startX = e.clientX, startY = e.clientY;
		const ox = node.x, oy = node.y;
		const move = (ev) => {
			node.x = ox + (ev.clientX - startX) / this.scale;
			node.y = oy + (ev.clientY - startY) / this.scale;
			el.style.transform = `translate(${node.x}px, ${node.y}px)`;
			this._renderEdges();
		};
		const up = () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			this._emitChange();
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
	}

	_startLink(e, node, portEl) {
		e.preventDefault();
		const kind = portEl.dataset.kind;
		const a = this._portAnchor(node, portEl.dataset.port, 'out');
		const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		ghost.setAttribute('class', 'bedge bedge--ghost');
		this.svg.appendChild(ghost);
		this._linking = { from: node.id, fromPort: portEl.dataset.port, kind, a, ghost };
		this.host.querySelector('#bgHint').textContent = `Connecting ${kind} — drop on a matching input`;
		const move = (ev) => {
			const pt = this._toWorld(ev.clientX, ev.clientY);
			ghost.setAttribute('d', this._curve(a, pt));
		};
		const up = (ev) => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			// If released over an input port, _completeLink already ran; clean up ghost.
			const target = document.elementFromPoint(ev.clientX, ev.clientY);
			const portTarget = target?.closest?.('.bport--in');
			if (portTarget) {
				const nodeEl = portTarget.closest('.bnode');
				this._tryConnect(nodeEl?.dataset.id, portTarget.dataset.port, portTarget.dataset.kind);
			}
			ghost.remove();
			this._linking = null;
			this.host.querySelector('#bgHint').textContent = '';
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
	}

	_completeLink() { /* handled in _startLink's pointerup via elementFromPoint */ }

	_tryConnect(toId, toPort, toKind) {
		if (!this._linking || !toId) return;
		const { from, fromPort, kind } = this._linking;
		if (from === toId) return;
		if (!canConnect(kind, toKind)) {
			this.host.querySelector('#bgHint').textContent = `Can't connect ${kind} → ${toKind}`;
			setTimeout(() => { this.host.querySelector('#bgHint').textContent = ''; }, 1400);
			return;
		}
		// One edge per input port (latest wins) — keeps the circuit unambiguous.
		this.edges = this.edges.filter((e) => !(e.to === toId && e.toPort === toPort));
		const id = `e_${from}.${fromPort}-${toId}.${toPort}`;
		if (!this.edges.some((e) => e.id === id)) {
			this.edges.push({ id, from, fromPort, to: toId, toPort });
			this._renderEdges();
			this._emitChange();
		}
	}

	// ── Mutations ─────────────────────────────────────────────────────────────

	addNode(type) {
		const spec = NODE_TYPES[type];
		if (spec.single && this.nodes.some((n) => n.type === type)) {
			this.host.querySelector('#bgHint').textContent = `Only one ${spec.title} node allowed`;
			setTimeout(() => { this.host.querySelector('#bgHint').textContent = ''; }, 1400);
			return null;
		}
		// Drop at the centre of the current viewport, in world coords.
		const rect = this.host.getBoundingClientRect();
		const c = this._toWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
		const node = makeNode(type, c.x - NODE_W / 2, c.y - 40);
		this.nodes.push(node);
		this._renderNode(node);
		this._applyTransform();
		this.select(node.id);
		this._emitChange();
		return node;
	}

	removeNode(id) {
		const node = this.nodes.find((n) => n.id === id);
		if (!node) return;
		if (NODE_TYPES[node.type].single) return; // persona/output are structural
		this.nodes = this.nodes.filter((n) => n.id !== id);
		this.edges = this.edges.filter((e) => e.from !== id && e.to !== id);
		this._nodeEls.get(id)?.remove();
		this._nodeEls.delete(id);
		if (this.selectedId === id) this.select(null);
		this._renderEdges();
		this._emitChange();
	}

	removeEdge(id) {
		this.edges = this.edges.filter((e) => e.id !== id);
		this._renderEdges();
		this._emitChange();
	}

	updateNodeData(id, patch) {
		const node = this.nodes.find((n) => n.id === id);
		if (!node) return;
		Object.assign(node.data, patch);
		this.refreshNode(id);
		this._emitChange();
	}

	select(id) {
		this.selectedId = id;
		for (const [nid, el] of this._nodeEls) el.classList.toggle('is-selected', nid === id);
		this.onSelect(id ? this.nodes.find((n) => n.id === id) : null);
	}

	// ── Pan / zoom ──────────────────────────────────────────────────────────

	_bindCanvas() {
		this.host.addEventListener('pointerdown', (e) => {
			if (e.target.closest('.bnode') || e.target.closest('.bport')) return;
			this.select(null);
			const sx = e.clientX, sy = e.clientY, otx = this.tx, oty = this.ty;
			this.host.classList.add('is-panning');
			const move = (ev) => { this.tx = otx + (ev.clientX - sx); this.ty = oty + (ev.clientY - sy); this._applyTransform(); };
			const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); this.host.classList.remove('is-panning'); };
			window.addEventListener('pointermove', move);
			window.addEventListener('pointerup', up);
		});
		this.host.addEventListener('wheel', (e) => {
			e.preventDefault();
			const rect = this.host.getBoundingClientRect();
			const mx = e.clientX - rect.left, my = e.clientY - rect.top;
			const before = this._toWorld(e.clientX, e.clientY);
			const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
			this.scale = Math.max(0.3, Math.min(2, this.scale * factor));
			// keep the point under the cursor fixed
			this.tx = mx - before.x * this.scale;
			this.ty = my - before.y * this.scale;
			this._applyTransform();
		}, { passive: false });
	}

	_toWorld(clientX, clientY) {
		const rect = this.host.getBoundingClientRect();
		return { x: (clientX - rect.left - this.tx) / this.scale, y: (clientY - rect.top - this.ty) / this.scale };
	}

	_applyTransform() {
		this.world.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
	}

	fit() {
		if (!this.nodes.length) return;
		const xs = this.nodes.map((n) => n.x);
		const ys = this.nodes.map((n) => n.y);
		const minX = Math.min(...xs) - 40;
		const minY = Math.min(...ys) - 40;
		const maxX = Math.max(...this.nodes.map((n) => n.x + NODE_W)) + 40;
		const maxY = Math.max(...this.nodes.map((n) => n.y + this._nodeHeight(n))) + 40;
		const rect = this.host.getBoundingClientRect();
		if (!rect.width) return;
		this.scale = Math.max(0.4, Math.min(1.2, Math.min(rect.width / (maxX - minX), rect.height / (maxY - minY))));
		this.tx = (rect.width - (maxX - minX) * this.scale) / 2 - minX * this.scale;
		this.ty = (rect.height - (maxY - minY) * this.scale) / 2 - minY * this.scale;
		this._applyTransform();
	}

	// ── Active-path animation (the "watch it think" moment) ─────────────────────

	setActive(nodeIds = [], edgeIds = []) {
		const ns = new Set(nodeIds);
		for (const [id, el] of this._nodeEls) el.classList.toggle('is-active', ns.has(id));
		const es = new Set(edgeIds);
		this.svg.querySelectorAll('.bedge').forEach((p) => p.classList.toggle('is-active', es.has(p.dataset.id)));
	}

	pulseNode(id) {
		const el = this._nodeEls.get(id);
		if (!el) return;
		el.classList.remove('is-pulse');
		void el.offsetWidth; // restart animation
		el.classList.add('is-pulse');
	}

	flowEdge(id) {
		const p = this.svg.querySelector(`.bedge[data-id="${CSS.escape(id)}"]`);
		if (p) { p.classList.add('is-active', 'is-flow'); }
	}

	setNodeBusy(id, busy) {
		this._nodeEls.get(id)?.classList.toggle('is-busy', !!busy);
	}

	setNodeStat(id, text) {
		const el = this._nodeEls.get(id);
		if (!el) return;
		let stat = el.querySelector('.bnode__stat');
		if (!stat) {
			stat = document.createElement('div');
			stat.className = 'bnode__stat';
			el.appendChild(stat);
		}
		stat.textContent = text || '';
		stat.hidden = !text;
	}

	clearActive() {
		for (const el of this._nodeEls.values()) el.classList.remove('is-active', 'is-pulse', 'is-busy');
		this.svg.querySelectorAll('.bedge').forEach((p) => p.classList.remove('is-active', 'is-flow'));
	}

	// Find the live circuit (nodes + edges reachable upstream from output) — used to
	// pre-highlight the path the runtime will walk.
	circuit() {
		const incoming = new Map();
		for (const e of this.edges) { if (!incoming.has(e.to)) incoming.set(e.to, []); incoming.get(e.to).push(e); }
		const out = this.nodes.find((n) => n.type === 'output');
		if (!out) return { nodeIds: [], edgeIds: [] };
		const nodeIds = new Set(); const edgeIds = new Set(); const stack = [out.id];
		while (stack.length) {
			const id = stack.pop();
			if (nodeIds.has(id)) continue;
			nodeIds.add(id);
			for (const e of incoming.get(id) || []) { edgeIds.add(e.id); stack.push(e.from); }
		}
		return { nodeIds: [...nodeIds], edgeIds: [...edgeIds] };
	}
}
