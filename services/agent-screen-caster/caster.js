/**
 * AgentScreenCaster
 * -----------------
 * Wraps a Playwright Chromium session, captures JPEG frames, and pushes them
 * to the three.ws screen-push endpoint so any connected watch-panel or 3D desk
 * can render the agent's live screen.
 *
 * Usage:
 *   const caster = new AgentScreenCaster({ agentId, bearerToken, pushUrl });
 *   await caster.launch();
 *   await caster.navigate('https://pump.fun');
 *   await caster.act('buy', async () => { ... });
 *   caster.startFrameLoop();
 *   // … later …
 *   await caster.close();
 */

import { chromium } from 'playwright';

const DEFAULT_PUSH_URL       = 'https://three.ws/api/agent/screen-push';
const DEFAULT_FRAME_INTERVAL = 400;   // ms between periodic captures
const DEFAULT_JPEG_QUALITY   = 72;
const DEFAULT_VIEWPORT       = { width: 1280, height: 720 };

export class AgentScreenCaster {
	/**
	 * @param {object} opts
	 * @param {string} opts.agentId          UUID of the agent identity
	 * @param {string} opts.bearerToken      JWT or API key for /api/agent/screen-push
	 * @param {string} [opts.pushUrl]        Override the push endpoint
	 * @param {number} [opts.frameIntervalMs]  Milliseconds between frame captures
	 * @param {number} [opts.jpegQuality]    JPEG quality 1-100
	 */
	constructor({ agentId, bearerToken, pushUrl, frameIntervalMs, jpegQuality } = {}) {
		if (!agentId)     throw new Error('agentId required');
		if (!bearerToken) throw new Error('bearerToken required');

		this.agentId      = agentId;
		this.bearerToken  = bearerToken;
		this.pushUrl      = pushUrl      || DEFAULT_PUSH_URL;
		this.frameMs      = frameIntervalMs ?? DEFAULT_FRAME_INTERVAL;
		this.jpegQuality  = jpegQuality  ?? DEFAULT_JPEG_QUALITY;

		this.browser  = null;
		this.context  = null;
		this.page     = null;
		this._timer   = null;
		this._seq     = 0;
		this._pushing = false; // guard against overlapping push calls
	}

	// ── Lifecycle ──────────────────────────────────────────────────────────────

	async launch(headless = true) {
		this.browser = await chromium.launch({
			headless,
			args: [
				'--no-sandbox',
				'--disable-setuid-sandbox',
				'--disable-dev-shm-usage',
				'--disable-gpu',
			],
		});

		this.context = await this.browser.newContext({
			viewport: DEFAULT_VIEWPORT,
			userAgent:
				'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
				'(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			locale: 'en-US',
			timezoneId: 'America/New_York',
		});

		this.page = await this.context.newPage();

		// Push a frame on every finished navigation so the watcher sees transitions.
		this.page.on('load', () => this._safePushFrame());
	}

	async close() {
		this.stopFrameLoop();
		try { await this.browser?.close(); } catch {}
		this.browser = this.context = this.page = null;
	}

	// ── Navigation & actions ───────────────────────────────────────────────────

	/**
	 * Navigate to a URL. Pushes a frame + activity entry automatically.
	 */
	async navigate(url, { waitUntil = 'domcontentloaded' } = {}) {
		await this.pushActivity([{
			type: 'navigate',
			summary: `Navigating to ${url}`,
			ts: Date.now(),
		}]);
		await this.page.goto(url, { waitUntil });
		await this._safePushFrame();
	}

	/**
	 * Named action wrapper. Runs fn(), then pushes a frame capturing the result.
	 *
	 * @param {string}   type        Action type token (e.g. 'click', 'trade')
	 * @param {string}   summary     Human-readable description shown in watch panel
	 * @param {Function} fn          Async action body
	 */
	async act(type, summary, fn) {
		await this.pushActivity([{ type, summary, ts: Date.now() }]);
		await fn();
		await this._safePushFrame();
	}

	// ── Frame loop ─────────────────────────────────────────────────────────────

	startFrameLoop() {
		if (this._timer) return;
		this._timer = setInterval(() => this._safePushFrame(), this.frameMs);
	}

	stopFrameLoop() {
		if (this._timer) {
			clearInterval(this._timer);
			this._timer = null;
		}
	}

	// ── Push primitives ────────────────────────────────────────────────────────

	/**
	 * Capture the current page as JPEG, base64-encode, and POST to screen-push.
	 */
	async pushFrame() {
		if (!this.page) return;

		const buf = await this.page.screenshot({
			type:    'jpeg',
			quality: this.jpegQuality,
			fullPage: false,
		});

		const frame = buf.toString('base64');
		const seq   = ++this._seq;

		await this._post({ agentId: this.agentId, frame, seq });
	}

	/**
	 * POST structured activity records to screen-push.
	 *
	 * @param {Array<{ type: string, summary: string, payload?: any, ts?: number }>} actions
	 */
	async pushActivity(actions) {
		await this._post({ agentId: this.agentId, actions });
	}

	// ── Internals ──────────────────────────────────────────────────────────────

	/** Non-throwing frame push — safe to call from event handlers and timers. */
	async _safePushFrame() {
		if (this._pushing) return;
		this._pushing = true;
		try {
			await this.pushFrame();
		} catch (err) {
			console.error('[caster] frame push failed:', err?.message || err);
		} finally {
			this._pushing = false;
		}
	}

	async _post(body) {
		const res = await fetch(this.pushUrl, {
			method:  'POST',
			headers: {
				'Content-Type':  'application/json',
				'Authorization': `Bearer ${this.bearerToken}`,
			},
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			const text = await res.text().catch(() => '');
			throw new Error(`screen-push ${res.status}: ${text}`);
		}

		return res.json();
	}
}
