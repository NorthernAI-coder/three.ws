/**
 * Embed modal for the agent hub page.
 * Shows iframe, web-component, and SDK snippets with copy-to-clipboard.
 * Size controls let the developer customise width × height before copying.
 */
export class AgentEmbedModal {
	/**
	 * @param {string} agentId
	 */
	constructor(agentId) {
		this._id = agentId;
		this._modal = null;
		this._onKey = this._onKey.bind(this);
		this._w = 420;
		this._h = 520;
	}

	open() {
		if (this._modal) return;
		this._build();
		document.body.appendChild(this._modal);
		document.addEventListener('keydown', this._onKey);
		requestAnimationFrame(() => this._modal.classList.add('aem-open'));
	}

	close() {
		if (!this._modal) return;
		document.removeEventListener('keydown', this._onKey);
		this._modal.remove();
		this._modal = null;
	}

	_onKey(e) {
		if (e.key === 'Escape') this.close();
	}

	_snippets(origin, id, w, h) {
		return {
			iframe:
				`<iframe\n` +
				`  src="${origin}/agent/${id}/embed"\n` +
				`  width="${w}" height="${h}"\n` +
				`  title="three.ws agent"\n` +
				`  style="border:0;border-radius:12px"\n` +
				`  allow="autoplay; xr-spatial-tracking"\n` +
				`  sandbox="allow-scripts allow-same-origin allow-popups"\n` +
				`  loading="lazy"\n` +
				`></iframe>`,
			webcomponent:
				`<script type="module"\n` +
				`  src="${origin}/dist-lib/agent-3d.js"\n` +
				`><\/script>\n` +
				`<agent-3d\n` +
				`  agent-id="${id}"\n` +
				`  style="width:${w}px;height:${h}px"\n` +
				`></agent-3d>`,
			sdk:
				`<script src="${origin}/embed-sdk.js"><\/script>\n` +
				`<iframe\n` +
				`  id="agent-frame"\n` +
				`  src="${origin}/agent/${id}/embed"\n` +
				`  width="${w}" height="${h}"\n` +
				`  title="three.ws agent"\n` +
				`  style="border:0;border-radius:12px"\n` +
				`  allow="autoplay; xr-spatial-tracking"\n` +
				`  sandbox="allow-scripts allow-same-origin allow-popups"\n` +
				`  loading="lazy"\n` +
				`></iframe>\n` +
				`<script>\n` +
				`const bridge = Agent3D.connect(\n` +
				`  document.getElementById('agent-frame'),\n` +
				`  {\n` +
				`    agentId: '${id}',\n` +
				`    onReady: (info) => console.log('ready', info),\n` +
				`    onAction: (action) => console.log('action', action),\n` +
				`  }\n` +
				`);\n\n` +
				`// Send a message once the agent is ready\n` +
				`bridge.ready.then(() => {\n` +
				`  bridge.send({ type: 'speak', payload: { text: 'Hello!' } });\n` +
				`});\n` +
				`<\/script>`,
		};
	}

	_build() {
		const origin = location.origin;
		const id = this._id;

		const overlay = document.createElement('div');
		overlay.className = 'aem-overlay';
		overlay.innerHTML = `
			<div class="aem-modal" role="dialog" aria-modal="true" aria-label="Embed this agent">
				<div class="aem-header">
					<span class="aem-title">Embed this agent</span>
					<button class="aem-close" aria-label="Close">&times;</button>
				</div>
				<div class="aem-body">
					<div class="aem-size-row">
						<label class="aem-size-label">
							Width
							<input class="aem-size-input" id="aem-width" type="number" min="100" max="2000" step="10" value="${this._w}" />
						</label>
						<span class="aem-size-sep">&times;</span>
						<label class="aem-size-label">
							Height
							<input class="aem-size-input" id="aem-height" type="number" min="100" max="2000" step="10" value="${this._h}" />
						</label>
						<span class="aem-size-unit">px</span>
					</div>
					<div class="aem-tabs" role="tablist">
						<button class="aem-tab active" data-tab="iframe">iframe</button>
						<button class="aem-tab" data-tab="webcomponent">&lt;agent-3d&gt;</button>
						<button class="aem-tab" data-tab="sdk">SDK</button>
					</div>
					<div class="aem-snippet-wrap">
						<pre class="aem-snippet" id="aem-snippet-text"></pre>
						<button class="aem-copy" id="aem-copy-btn">copy</button>
					</div>
					<p class="aem-note">Free to embed — no wallet or on-chain deployment required.</p>
				</div>
			</div>
		`;

		let current = 'iframe';
		const snippetEl = overlay.querySelector('#aem-snippet-text');
		const copyBtn = overlay.querySelector('#aem-copy-btn');
		const widthInput = overlay.querySelector('#aem-width');
		const heightInput = overlay.querySelector('#aem-height');

		const renderSnippet = () => {
			snippetEl.textContent = this._snippets(origin, id, this._w, this._h)[current];
		};
		renderSnippet();

		const onSizeChange = () => {
			const w = parseInt(widthInput.value, 10);
			const h = parseInt(heightInput.value, 10);
			if (w >= 100 && w <= 2000) this._w = w;
			if (h >= 100 && h <= 2000) this._h = h;
			renderSnippet();
		};
		widthInput.addEventListener('input', onSizeChange);
		heightInput.addEventListener('input', onSizeChange);

		overlay.querySelectorAll('.aem-tab').forEach((btn) => {
			btn.addEventListener('click', () => {
				current = btn.dataset.tab;
				overlay
					.querySelectorAll('.aem-tab')
					.forEach((b) => b.classList.toggle('active', b === btn));
				renderSnippet();
			});
		});

		copyBtn.addEventListener('click', async () => {
			try {
				await navigator.clipboard.writeText(this._snippets(origin, id, this._w, this._h)[current]);
				copyBtn.textContent = 'copied!';
				copyBtn.classList.add('aem-copied');
				setTimeout(() => {
					copyBtn.textContent = 'copy';
					copyBtn.classList.remove('aem-copied');
				}, 1400);
			} catch {}
		});

		overlay.querySelector('.aem-close').addEventListener('click', () => this.close());
		overlay.addEventListener('click', (e) => {
			if (e.target === overlay) this.close();
		});

		this._modal = overlay;
	}
}
