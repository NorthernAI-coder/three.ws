// ── agent-exchange.js ────────────────────────────────────────────────────────
// Two 3D AI avatars buying and selling live crypto intel for real USDC via x402.
// Agent A (seller) hosts /api/x402/crypto-intel. Agent B (buyer) pays $0.01 per
// call through the server-side x402 payer at /api/x402-pay, which handles the
// challenge → sign → verify → settle → confirm flow and streams SSE stages.
//
// Every on-chain confirmation is real: real USDC on Solana mainnet, real Solscan
// link. The avatars are iframed into the page and driven via postMessage.
//
// No mock data. When /api/x402-pay is unconfigured (no funded agent wallet) the
// page shows an honest error state.

// ── Topics ────────────────────────────────────────────────────────────────────
const TOPICS = [
	{ id: 'sol',  label: '◎ SOL'  },
	{ id: 'btc',  label: '₿ BTC'  },
	{ id: 'eth',  label: '⟠ ETH'  },
	{ id: 'doge', label: '🐕 DOGE' },
	{ id: 'bnb',  label: '⬡ BNB'  },
];

// Stage config matches the SSE event names /api/x402-pay emits.
const STAGE_DEFS = [
	{ id: 'challenge',  label: '402 Challenge' },
	{ id: 'built',      label: 'Sign tx'       },
	{ id: 'verified',   label: 'Verify'        },
	{ id: 'settled',    label: 'Settle'        },
	{ id: 'done',       label: 'Confirmed'     },
];

// Agent scripts — lines spoken at each stage of the exchange.
const LINES = {
	A: {
		idle:      'I have live crypto intel. $0.01 USDC per signal, settled on-chain.',
		challenge: 'Payment challenge issued. Awaiting your signed transaction…',
		built:     'Transaction received. Forwarding to the facilitator…',
		verified:  'Payment verified. Preparing the intel…',
		settled:   'Funds confirmed on-chain. Delivering now.',
		done:      (headline) => `Here's your signal: ${headline}`,
		error:     'Payment failed. No charge made.',
	},
	B: {
		idle:      (topic) => `I need live ${topic.toUpperCase()} intelligence. Initiating payment.`,
		challenge: 'Building and signing the Solana transfer…',
		built:     'Signed. Sending to the facilitator for verification.',
		verified:  'Verified on-chain. Waiting for settlement…',
		settled:   'Settled. Collecting my intel.',
		done:      (signal) => `Signal received: ${signal.toUpperCase()}. Updating my model.`,
		error:     'Transaction rolled back. Wallet unchanged.',
	},
};

// ── DOM ───────────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const els = {
	frameA:    $('frameA'),
	frameB:    $('frameB'),
	labelA:    $('labelA'),
	labelB:    $('labelB'),
	nameA:     $('nameA'),
	nameB:     $('nameB'),
	bubbleA:   $('bubbleA'),
	bubbleAText: $('bubbleAText'),
	bubbleB:   $('bubbleB'),
	bubbleBText: $('bubbleBText'),
	topics:    $('topics'),
	payBtn:    $('payBtn'),
	payLabel:  null, // set in init()
	stages:    $('stages'),
	receipt:   $('receipt'),
	totalUsdc: $('totalUsdc'),
};

// ── State ─────────────────────────────────────────────────────────────────────
let activeTopic    = 'sol';
let busy           = false;
let sessionTotal   = 0; // USDC in dollars
let agentAReady    = false;
let agentBReady    = false;
const queueA       = [];
const queueB       = [];

// ── Avatar iframe driver ──────────────────────────────────────────────────────
function postToFrame(frame, ready, queue, msg) {
	if (ready) {
		frame.contentWindow?.postMessage(msg, location.origin);
	} else {
		queue.push(msg);
	}
}
function speakA(text) { postToFrame(els.frameA, agentAReady, queueA, { type: 'v1.avatar.speak', text }); }
function speakB(text) { postToFrame(els.frameB, agentBReady, queueB, { type: 'v1.avatar.speak', text }); }
function gestureA(name) { postToFrame(els.frameA, agentAReady, queueA, { type: 'v1.avatar.animation', name }); }
function gestureB(name) { postToFrame(els.frameB, agentBReady, queueB, { type: 'v1.avatar.animation', name }); }
function flushQueue(frame, queue) { while (queue.length) frame.contentWindow?.postMessage(queue.shift(), location.origin); }

window.addEventListener('message', (e) => {
	if (e.data?.type !== 'v1.avatar.ready') return;
	if (e.source === els.frameA.contentWindow) { agentAReady = true; flushQueue(els.frameA, queueA); }
	if (e.source === els.frameB.contentWindow) { agentBReady = true; flushQueue(els.frameB, queueB); }
});
// Resilience: if the avatar never signals ready, flush after 5 s.
setTimeout(() => {
	if (!agentAReady) { agentAReady = true; flushQueue(els.frameA, queueA); }
	if (!agentBReady) { agentBReady = true; flushQueue(els.frameB, queueB); }
}, 5000);

// ── Speech bubbles ────────────────────────────────────────────────────────────
let bubbleATimer, bubbleBTimer;
function sayA(text) {
	els.bubbleAText.textContent = text;
	els.bubbleA.classList.add('show');
	clearTimeout(bubbleATimer);
	bubbleATimer = setTimeout(() => els.bubbleA.classList.remove('show'), 5500);
	speakA(text);
}
function sayB(text) {
	els.bubbleBText.textContent = text;
	els.bubbleB.classList.add('show');
	clearTimeout(bubbleBTimer);
	bubbleBTimer = setTimeout(() => els.bubbleB.classList.remove('show'), 5500);
	speakB(text);
}

// ── Payment stages ────────────────────────────────────────────────────────────
function renderStages() {
	els.stages.innerHTML = STAGE_DEFS.map((s) =>
		`<div class="stage" id="stage-${s.id}">` +
		`<span class="si" aria-hidden="true"></span>` +
		`<span>${s.label}</span>` +
		`<span class="sval" id="sval-${s.id}"></span>` +
		`</div>`,
	).join('');
}

function setStage(id, state, val = '') {
	const el = $(`stage-${id}`);
	if (!el) return;
	el.className = `stage ${state}`;
	const sv = $(`sval-${id}`);
	if (sv) sv.textContent = val ? `· ${val}` : '';
}

function resetStages() {
	for (const s of STAGE_DEFS) setStage(s.id, '');
	els.receipt.classList.remove('show');
}

// ── Receipt renderer ──────────────────────────────────────────────────────────
function renderReceipt(payment, intel) {
	const amount    = payment.amount ? `${(Number(payment.amount) / 1e6).toFixed(4)} USDC` : '$0.01 USDC';
	const payer     = payment.payer ? `${payment.payer.slice(0, 8)}…${payment.payer.slice(-4)}` : '—';
	const payTo     = payment.payTo ? `${payment.payTo.slice(0, 8)}…${payment.payTo.slice(-4)}` : '—';
	const txShort   = payment.tx ? `${payment.tx.slice(0, 10)}…${payment.tx.slice(-6)}` : null;
	const explorer  = payment.tx ? `https://solscan.io/tx/${payment.tx}` : null;
	const signalCls = `signal-${intel.signal}`;
	const signalEmoji = { bullish: '▲', bearish: '▼', neutral: '→' }[intel.signal] || '';

	const changeStr = intel.change_24h != null
		? ` ${intel.change_24h >= 0 ? '+' : ''}${intel.change_24h.toFixed(2)}% 24h`
		: '';
	const priceStr = intel.price_usd != null
		? ` · $${intel.price_usd >= 100 ? intel.price_usd.toFixed(2) : intel.price_usd.toFixed(4)}`
		: '';

	els.receipt.innerHTML =
		`<div class="r-head">` +
		`<span class="r-badge">` +
		`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>` +
		`Confirmed on-chain · ${amount}</span>` +
		`<span class="r-time">${new Date().toLocaleTimeString()}</span>` +
		`</div>` +
		`<div class="r-grid">` +
		`<div class="rf"><span class="k">Payer (buyer agent)</span><span class="v">${payer}</span></div>` +
		`<div class="rf"><span class="k">Payee (intel agent)</span><span class="v">${payTo}</span></div>` +
		`<div class="rf"><span class="k">Network</span><span class="v">Solana mainnet</span></div>` +
		(txShort && explorer
			? `<div class="rf"><span class="k">Transaction</span><span class="v"><a href="${explorer}" target="_blank" rel="noopener">${txShort} ↗</a></span></div>`
			: '') +
		`</div>` +
		`<div class="r-headline">` +
		`<span class="r-signal ${signalCls}">${signalEmoji} ${intel.signal.toUpperCase()}</span>` +
		`<strong>${escHtml(intel.topic.toUpperCase())}</strong>${escHtml(priceStr)}${escHtml(changeStr)} · ` +
		escHtml(intel.headline) +
		`</div>`;

	els.receipt.classList.add('show');
}

// ── Main payment flow ─────────────────────────────────────────────────────────
async function doPurchase() {
	if (busy) return;
	busy = true;
	els.payBtn.classList.add('busy');
	els.payBtn.disabled = true;
	els.payLabel.textContent = 'Paying…';
	resetStages();

	// Both agents react to the initiation.
	const line = LINES.B.idle(activeTopic);
	sayB(line);
	gestureB('wave');
	await delay(600);
	sayA(LINES.A.idle);

	let settled     = null;
	let intel       = null;
	let activeStage = 'challenge';
	let errored     = false;

	try {
		const res = await fetch('/api/x402-pay', {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
			body: JSON.stringify({
				tool:   'crypto_intel',
				topic:  activeTopic,
				// Tell x402-pay which endpoint to call. The server proxies to
				// /api/x402/crypto-intel with the x402 payment attached.
				endpoint: '/api/x402/crypto-intel',
				body: { topic: activeTopic },
			}),
		});

		if (!res.ok || !res.body) {
			const text = await res.text().catch(() => '');
			let msg = 'Payment service unavailable.';
			try { msg = JSON.parse(text).error_description || msg; } catch { /* ignore */ }
			throw new Error(msg);
		}

		for await (const { event, data } of sseReader(res)) {
			if (event === 'challenge') {
				setStage('challenge', 'done', `${(Number(data.amount) / 1e6).toFixed(4)} USDC`);
				setStage('built', 'active', 'signing…');
				activeStage = 'built';
				sayB(LINES.B.challenge);
				sayA(LINES.A.challenge);
			} else if (event === 'built') {
				setStage('built', 'done', `${data.build_ms} ms`);
				setStage('verified', 'active', 'facilitator…');
				activeStage = 'verified';
				sayB(LINES.B.built);
				sayA(LINES.A.built);
			} else if (event === 'verified') {
				setStage('verified', 'done', `${data.verify_ms} ms`);
				setStage('settled', 'active', 'on-chain…');
				activeStage = 'settled';
				sayB(LINES.B.verified);
				sayA(LINES.A.verified);
			} else if (event === 'settled') {
				setStage('settled', 'done', `${data.settle_ms} ms · ${data.tx ? data.tx.slice(0, 8) + '…' : ''}`);
				setStage('done', 'active');
				activeStage = 'done';
				settled = data;
				sayB(LINES.B.settled);
				sayA(LINES.A.settled);
			} else if (event === 'result') {
				intel = data;
			} else if (event === 'error') {
				errored = true;
				setStage(activeStage, 'error', data.error || 'failed');
				throw new Error(data.error || 'payment failed');
			}
		}

		if (!intel || !settled) throw new Error('incomplete response from payment service');

		// ── Success choreography ──────────────────────────────
		setStage('done', 'done', 'confirmed');

		// Buyer celebrates receiving the intel.
		gestureB('celebrate');
		await delay(300);
		sayB(LINES.B.done(intel.signal));

		// Seller delivers the headline.
		await delay(700);
		sayA(LINES.A.done(intel.headline));
		gestureA('wave');

		// Update session total.
		const amount = intel ? 0.01 : Number(settled.amount || 10000) / 1e6;
		sessionTotal += amount;
		els.totalUsdc.textContent = `$${sessionTotal.toFixed(2)}`;
		els.totalUsdc.classList.add('flash');
		setTimeout(() => els.totalUsdc.classList.remove('flash'), 600);

		// Show the receipt.
		renderReceipt(settled, intel);

	} catch (err) {
		if (!errored) setStage(activeStage, 'error', 'failed');
		sayA(LINES.A.error);
		sayB(LINES.B.error);
		gestureA('idle');
		// Show a user-facing error in the receipt area.
		els.receipt.innerHTML =
			`<div style="color:var(--red);font-size:13px;font-weight:600;">` +
			`⚠ ${escHtml(err.message || 'Payment failed. No funds moved.')} ` +
			`<a href="/pay" style="color:var(--usdc-lt);text-decoration:underline;">See the x402 demo →</a>` +
			`</div>`;
		els.receipt.classList.add('show');
	} finally {
		busy = false;
		els.payBtn.classList.remove('busy');
		els.payBtn.disabled = false;
		els.payLabel.textContent = 'Buy intel — $0.01 USDC';
	}
}

// ── SSE reader (same pattern as /pay demo) ────────────────────────────────────
async function* sseReader(res) {
	const reader = res.body.getReader();
	const dec = new TextDecoder();
	let buf = '';
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buf += dec.decode(value, { stream: true });
		const chunks = buf.split('\n\n');
		buf = chunks.pop();
		for (const chunk of chunks) {
			if (!chunk.trim()) continue;
			let event = 'message', data = {};
			for (const line of chunk.split('\n')) {
				if (line.startsWith('event:')) event = line.slice(6).trim();
				if (line.startsWith('data:')) {
					try { data = JSON.parse(line.slice(5).trim()); } catch { /* ignore */ }
				}
			}
			yield { event, data };
		}
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function escHtml(s) {
	return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Init ──────────────────────────────────────────────────────────────────────
function buildTopics() {
	for (const t of TOPICS) {
		const b = document.createElement('button');
		b.type = 'button';
		b.className = 't-chip' + (t.id === activeTopic ? ' active' : '');
		b.textContent = t.label;
		b.dataset.id = t.id;
		b.setAttribute('aria-pressed', String(t.id === activeTopic));
		b.addEventListener('click', () => {
			if (busy) return;
			activeTopic = t.id;
			els.topics.querySelectorAll('.t-chip').forEach((c) => {
				c.classList.toggle('active', c.dataset.id === activeTopic);
				c.setAttribute('aria-pressed', String(c.dataset.id === activeTopic));
			});
			// Buyer agent reacts to topic change.
			const line = `Switching to ${t.id.toUpperCase()} intel. Ready to buy.`;
			sayB(line);
		});
		els.topics.appendChild(b);
	}
}

function mountAvatars() {
	// Agent A (seller) — faces right (mirror = true flips the avatar).
	const aqA = new URLSearchParams();
	aqA.set('model', '/avatars/default.glb');
	aqA.set('bg', 'transparent');
	aqA.set('idle', 'on');
	aqA.set('name', '0');
	aqA.set('animPicker', '0');
	aqA.set('overlayMode', '1');
	els.frameA.src = `/avatar-embed.html?${aqA}`;

	// Agent B (buyer) — same setup on the right side.
	const aqB = new URLSearchParams();
	aqB.set('model', '/avatars/default.glb');
	aqB.set('bg', 'transparent');
	aqB.set('idle', 'on');
	aqB.set('name', '0');
	aqB.set('animPicker', '0');
	aqB.set('overlayMode', '1');
	els.frameB.src = `/avatar-embed.html?${aqB}`;
}

function init() {
	els.payLabel = els.payBtn.querySelector('.lbl');

	buildTopics();
	renderStages();
	mountAvatars();

	els.payBtn.addEventListener('click', doPurchase);

	// Opening lines once both avatars are ready (or after timeout).
	setTimeout(() => {
		sayA(LINES.A.idle);
		setTimeout(() => sayB(LINES.B.idle(activeTopic)), 1400);
	}, 2000);
}

init();
