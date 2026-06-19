/**
 * <page-agent> custom element — @three-ws/page-agent
 * ==================================================
 *
 * Declarative wrapper around PageAgent. The element itself is invisible (the
 * agent docks itself to the page corner); it exists so a site can drop the
 * companion in with pure HTML and no script:
 *
 *   <page-agent avatar="nova" position="bottom-right" auto-narrate controls></page-agent>
 *
 * Attributes (all optional):
 *   avatar          initial rigged agent id (default: visitor's saved choice / "sol")
 *   agents          comma-separated allow-list of agent ids for the picker
 *   position        bottom-right | bottom-left | top-right | top-left
 *   asset-base      override GLB host
 *   greeting        line spoken on load (ignored when auto-narrate is set)
 *   auto-narrate    present → tour the page; value → CSS selector of segments
 *   muted           present → start muted (visual lipsync only)
 *   collapsed       present → start as the launcher pill
 *   no-picker       present → hide the "change agent" affordance
 *   no-controls     present → hide the control bar
 *
 * Methods mirror PageAgent: narrate, narratePage, stop, setAgent, mute,
 * collapse, openPicker. Events re-dispatched as DOM CustomEvents:
 *   page-agent:ready | :agentchange | :state | :caption | :segment | :error
 */

import { PageAgent } from './page-agent.js';

const bool = (el, name) => el.hasAttribute(name);

export class PageAgentElement extends HTMLElement {
	connectedCallback() {
		if (this._agent) return;
		this.style.display = 'none';

		const autoAttr = this.getAttribute('auto-narrate');
		const autoNarrate = this.hasAttribute('auto-narrate') ? (autoAttr || true) : false;

		this._agent = new PageAgent({
			agent: this.getAttribute('avatar') || undefined,
			agents: this.getAttribute('agents')?.split(',').map((s) => s.trim()).filter(Boolean),
			position: this.getAttribute('position') || undefined,
			assetBase: this.getAttribute('asset-base') || undefined,
			greeting: this.getAttribute('greeting') || undefined,
			autoNarrate,
			muted: bool(this, 'muted'),
			collapsed: bool(this, 'collapsed'),
			picker: !bool(this, 'no-picker'),
			controls: !bool(this, 'no-controls'),
		});

		for (const ev of ['ready', 'agentchange', 'state', 'caption', 'segment', 'error']) {
			this._agent.on(ev, (detail) => {
				this.dispatchEvent(new CustomEvent(`page-agent:${ev}`, { detail, bubbles: true, composed: true }));
			});
		}
	}

	disconnectedCallback() {
		this._agent?.dispose();
		this._agent = null;
	}

	// ── Imperative API proxy ──────────────────────────────────────────────────
	narrate(text, opts) { return this._agent?.narrate(text, opts); }
	narratePage(opts) { return this._agent?.narratePage(opts); }
	stop() { this._agent?.stop(); }
	setAgent(id) { return this._agent?.setAgent(id); }
	mute(on = true) { this._agent?.mute(on); }
	collapse(on = true) { this._agent?.collapse(on); }
	openPicker() { this._agent?.openPicker(); }
	get controller() { return this._agent; }
	get currentAgent() { return this._agent?.currentAgent; }
}

export function registerElement(tag = 'page-agent') {
	if (typeof customElements !== 'undefined' && !customElements.get(tag)) {
		customElements.define(tag, PageAgentElement);
	}
	return tag;
}
