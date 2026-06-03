// AgentTrust demo controller.
// ----------------------------------------------------------------------------
// Drives the governed chat loop against /api/watsonx/govern (IBM Granite brain +
// Granite Guardian guardrails), renders the live trust panel, and seals each
// governed turn into a verifiable, on-chain-anchorable attestation ledger.
// The 3D agent is a <model-viewer> presence with browser-native voice.

import { AttestationLedger, verifyChain, sha256Hex, GENESIS } from '../../src/trust/attestation.js';

const GOVERN_URL = '/api/watsonx/govern';
// The harm-suite shown by default — mirrors DEFAULT_RISKS server-side so the
// pending gauges match what comes back.
const RISKS = [
	['harm', 'Harm'],
	['social_bias', 'Social bias'],
	['jailbreak', 'Jailbreak'],
	['violence', 'Violence'],
	['profanity', 'Profanity'],
];

const $ = (id) => document.getElementById(id);
const el = {
	chat: $('chat-log'),
	input: $('msg-input'),
	send: $('send-btn'),
	samples: $('samples'),
	riskIn: $('risk-input'),
	riskOut: $('risk-output'),
	ledgerList: $('ledger-list'),
	ledgerHead: $('ledger-head'),
	ledgerCount: $('ledger-count'),
	verifyBtn: $('verify-btn'),
	tamperBtn: $('tamper-btn'),
	downloadBtn: $('download-btn'),
	anchorBtn: $('anchor-btn'),
	verifyResult: $('verify-result'),
	anchorResult: $('anchor-result'),
	speakRing: $('speak-ring'),
	avatarStatus: $('avatar-status'),
	soundToggle: $('sound-toggle'),
	wxUnavail: $('wx-unavail'),
	brainModel: $('brain-model'),
	guardianModel: $('guardian-model'),
	sigAlg: $('sig-alg'),
	avatar: $('avatar'),
	avatarFallback: $('avatar-fallback'),
};

const state = {
	history: [],
	ledger: new AttestationLedger(),
	busy: false,
	soundOn: true,
};

// ── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
	await state.ledger.init();
	el.sigAlg.textContent = `SHA-256 chain · ${state.ledger.signer.alg}`;

	el.avatar?.addEventListener('load', () => el.avatarFallback?.remove());
	el.avatar?.addEventListener('error', () => {
		if (el.avatarFallback) el.avatarFallback.textContent = '3D agent unavailable';
	});

	el.send.addEventListener('click', () => submit());
	el.input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			submit();
		}
	});
	el.samples.querySelectorAll('.sample').forEach((b) =>
		b.addEventListener('click', () => {
			el.input.value = b.dataset.q;
			submit();
		}),
	);
	el.soundToggle.addEventListener('click', toggleSound);
	el.verifyBtn.addEventListener('click', runVerify);
	el.tamperBtn.addEventListener('click', runTamperTest);
	el.downloadBtn.addEventListener('click', downloadLog);
	el.anchorBtn.addEventListener('click', anchorOnChain);
}

// ── Governed turn ──────────────────────────────────────────────────────────
async function submit() {
	const message = el.input.value.trim();
	if (!message || state.busy) return;
	setBusy(true);
	el.input.value = '';

	addMessage('user', message);
	renderGauges(el.riskIn, RISKS.map(([risk, label]) => ({ risk, label, verdict: 'pending' })));
	renderGauges(el.riskOut, [], 'Reply not generated yet.');
	const typing = addTyping();
	setAvatarStatus('Screening on watsonx…');

	let data;
	try {
		const res = await fetch(GOVERN_URL, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ message, history: state.history.slice(-12) }),
		});
		data = await res.json();
	} catch (e) {
		typing.remove();
		addMessage('sys', `Network error reaching the governance service: ${e.message}`);
		setBusy(false);
		setAvatarStatus('Ready');
		return;
	}
	typing.remove();

	if (data.models) {
		el.brainModel.textContent = data.models.brain || el.brainModel.textContent;
		el.guardianModel.textContent = data.models.guardian || el.guardianModel.textContent;
	}

	if (!data.configured) {
		el.wxUnavail.classList.add('show');
		renderGauges(el.riskIn, [], 'Live brain not connected.');
		addMessage(
			'sys',
			'Ada’s brain is offline on this deployment — watsonx.ai credentials are not set. The governance pipeline and this exact UI are wired to real IBM Granite + Granite Guardian; add the keys (or open the deployed demo) to see live verdicts. The attestation ledger below still runs fully in your browser.',
		);
		setBusy(false);
		setAvatarStatus('Brain offline');
		return;
	}

	// Input guardrail verdicts.
	renderGauges(el.riskIn, data.input?.results || []);
	setAvatarStatus('Thinking on Granite…');

	const reply = data.reply || '(no reply)';
	addMessage('agent', reply);
	renderGauges(el.riskOut, data.output?.results || []);

	state.history.push({ role: 'user', content: message }, { role: 'assistant', content: reply });
	await sealReceipt({ message, reply, input: data.input, output: data.output, models: data.models });

	speak(reply);
	setBusy(false);
}

// ── Attestation ──────────────────────────────────────────────────────────────
async function sealReceipt({ message, reply, input, output, models }) {
	const [userHash, replyHash] = await Promise.all([sha256Hex(message), sha256Hex(reply)]);
	const compact = (g) =>
		(g?.results || []).map((r) => ({
			risk: r.risk,
			verdict: r.verdict,
			flagged: !!r.flagged,
			confidence: r.confidence || null,
		}));
	const flagged = Boolean(input?.anyFlagged || output?.anyFlagged);

	await state.ledger.append({
		ts: new Date().toISOString(),
		turn: {
			user: { text: message, hash: userHash },
			assistant: { text: reply, hash: replyHash },
		},
		governance: {
			brain: models?.brain || null,
			guardian: models?.guardian || null,
			input: compact(input),
			output: compact(output),
			flagged,
		},
	});
	refreshLedger();
}

function refreshLedger() {
	const receipts = state.ledger.receipts;
	el.ledgerCount.textContent = `${receipts.length} receipt${receipts.length === 1 ? '' : 's'}`;
	el.ledgerHead.innerHTML = receipts.length
		? `<b>${state.ledger.head}</b>`
		: '— empty chain —';

	if (!receipts.length) return;
	el.ledgerList.innerHTML = '';
	for (const r of receipts) {
		const flagged = r.governance?.flagged;
		const row = document.createElement('div');
		row.className = 'rcpt';
		row.innerHTML =
			`<span class="seq">#${r.seq}</span>` +
			`<span class="h" title="${r.hash}">${r.hash.slice(0, 18)}…${r.hash.slice(-6)}</span>` +
			`<span class="badge ${flagged ? 'flagged' : 'clean'}">${flagged ? 'flagged' : 'clean'}</span>`;
		el.ledgerList.appendChild(row);
	}
	el.ledgerList.scrollTop = el.ledgerList.scrollHeight;

	for (const b of [el.verifyBtn, el.tamperBtn, el.downloadBtn, el.anchorBtn]) b.disabled = false;
}

async function runVerify() {
	el.verifyResult.className = 'result-line info';
	el.verifyResult.textContent = 'Recomputing hashes & checking signatures…';
	const res = await state.ledger.verify();
	if (res.valid) {
		el.verifyResult.className = 'result-line ok';
		el.verifyResult.textContent = `Chain valid ✓ — ${res.length} receipt(s), signed (${state.ledger.signer.alg}), head ${res.head.slice(0, 12)}…`;
	} else {
		el.verifyResult.className = 'result-line bad';
		el.verifyResult.textContent = `Chain INVALID ✗ — ${res.reason}`;
	}
}

// Prove tamper-evidence on a COPY so the real ledger is never corrupted.
async function runTamperTest() {
	if (!state.ledger.receipts.length) return;
	const doc = state.ledger.export();
	const clone = JSON.parse(JSON.stringify(doc));
	const victim = clone.receipts[0];
	victim.turn.user.text += ' ← secretly edited';
	const res = await verifyChain(clone.receipts, { alg: clone.alg, publicKeyHex: clone.publicKey });
	if (!res.valid) {
		el.verifyResult.className = 'result-line ok';
		el.verifyResult.textContent = `Tamper detected ✓ — editing receipt #${res.brokenAt} broke verification (${res.reason}). The live ledger is untouched.`;
	} else {
		el.verifyResult.className = 'result-line bad';
		el.verifyResult.textContent = 'Unexpected: tampering went undetected.';
	}
}

function downloadLog() {
	const doc = state.ledger.export();
	const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `agenttrust-ledger-${doc.head.slice(0, 10)}.json`;
	a.click();
	URL.revokeObjectURL(url);
	el.verifyResult.className = 'result-line info';
	el.verifyResult.textContent = `Downloaded ${doc.count} signed receipt(s) — verifiable offline.`;
}

// Real Solana memo anchor (devnet) via a connected wallet. Writes the chain head
// hash into a Memo instruction so the whole audit log is timestamped on-chain.
async function anchorOnChain() {
	const head = state.ledger.head;
	if (head === GENESIS) {
		setAnchor('Nothing to anchor yet — send a message first.', 'info');
		return;
	}
	const provider = window.solana;
	if (!provider || !provider.isPhantom) {
		setAnchor('Install a Solana wallet (Phantom) to anchor the audit root on-chain.', 'info');
		return;
	}
	try {
		setAnchor('Connecting wallet…', 'info');
		const web3 = await import('@solana/web3.js');
		const { Connection, clusterApiUrl, PublicKey, Transaction, TransactionInstruction, LAMPORTS_PER_SOL } = web3;
		const resp = await provider.connect();
		const payer = new PublicKey(resp.publicKey.toString());
		const conn = new Connection(clusterApiUrl('devnet'), 'confirmed');

		const balance = await conn.getBalance(payer);
		if (balance < 5000) {
			setAnchor('Funding via devnet airdrop…', 'info');
			try {
				const sig = await conn.requestAirdrop(payer, LAMPORTS_PER_SOL / 10);
				await conn.confirmTransaction(sig, 'confirmed');
			} catch {
				/* airdrop is best-effort; the wallet may already be funded enough */
			}
		}

		const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
		const ix = new TransactionInstruction({
			keys: [{ pubkey: payer, isSigner: true, isWritable: true }],
			programId: MEMO_PROGRAM,
			data: new TextEncoder().encode(`threews-attest:${head}`),
		});
		const tx = new Transaction().add(ix);
		tx.feePayer = payer;
		tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;

		setAnchor('Awaiting signature…', 'info');
		const { signature } = await provider.signAndSendTransaction(tx);
		await conn.confirmTransaction(signature, 'confirmed');
		el.anchorResult.className = 'result-line ok';
		el.anchorResult.innerHTML = `Anchored on Solana devnet ✓ — <a href="https://explorer.solana.com/tx/${signature}?cluster=devnet" target="_blank" rel="noopener">view transaction</a>`;
	} catch (e) {
		setAnchor(`Anchor cancelled or failed: ${e.message || e}`, 'bad');
	}
}

// ── Rendering helpers ──────────────────────────────────────────────────────
function addMessage(role, text) {
	const wrap = document.createElement('div');
	wrap.className = `msg ${role}`;
	const who = role === 'user' ? 'You' : role === 'agent' ? 'Ada · Granite' : 'Guardrail';
	wrap.innerHTML = `<div><div class="who">${who}</div><div class="body"></div></div>`;
	wrap.querySelector('.body').textContent = text;
	el.chat.appendChild(wrap);
	el.chat.scrollTop = el.chat.scrollHeight;
	return wrap;
}

function addTyping() {
	const wrap = document.createElement('div');
	wrap.className = 'msg agent';
	wrap.innerHTML = `<div><div class="who">Ada · Granite</div><div class="body"><span class="typing"><i></i><i></i><i></i></span></div></div>`;
	el.chat.appendChild(wrap);
	el.chat.scrollTop = el.chat.scrollHeight;
	return wrap;
}

function renderGauges(container, results, emptyText) {
	if (!results.length) {
		container.innerHTML = `<div class="empty">${emptyText || 'No data.'}</div>`;
		return;
	}
	container.innerHTML = '';
	for (const r of results) {
		const pending = r.verdict === 'pending';
		const error = r.verdict === 'Error' || r.error;
		const flagged = !!r.flagged;
		const prob = typeof r.probability === 'number' ? r.probability : null;
		const pct = pending ? 12 : prob == null ? (error ? 0 : 10) : Math.round(prob * 100);
		const fillClass = flagged ? 'flagged' : prob != null && prob > 0.3 ? 'warn' : '';

		let vtext, vclass;
		if (error) { vtext = 'error'; vclass = 'err'; }
		else if (pending) { vtext = 'scanning…'; vclass = 'pending'; }
		else if (flagged) { vtext = `flagged${r.confidence ? ' · ' + r.confidence : ''}`; vclass = 'flagged'; }
		else { vtext = `clear${r.confidence ? ' · ' + r.confidence : ''}`; vclass = 'clear'; }

		const row = document.createElement('div');
		row.className = 'gauge';
		row.innerHTML =
			`<span class="lbl">${r.label || r.risk}</span>` +
			`<span class="track"><span class="fill ${fillClass}" style="width:0%"></span></span>` +
			`<span class="v ${vclass}">${vtext}</span>`;
		container.appendChild(row);
		// Animate the fill on the next frame so the width transition runs.
		requestAnimationFrame(() => {
			row.querySelector('.fill').style.width = pct + '%';
		});
	}
}

// ── Voice + status ──────────────────────────────────────────────────────────
function speak(text) {
	if (!state.soundOn || !window.speechSynthesis) {
		setAvatarStatus('Ready');
		return;
	}
	const u = new SpeechSynthesisUtterance(text);
	u.rate = 1.03;
	u.pitch = 1.0;
	u.onstart = () => setSpeaking(true);
	u.onend = () => setSpeaking(false);
	u.onerror = () => setSpeaking(false);
	window.speechSynthesis.cancel();
	window.speechSynthesis.speak(u);
}

function setSpeaking(on) {
	el.speakRing.classList.toggle('on', on);
	setAvatarStatus(on ? 'Speaking…' : 'Ready');
}

function setAvatarStatus(t) {
	el.avatarStatus.textContent = t;
}

function toggleSound() {
	state.soundOn = !state.soundOn;
	el.soundToggle.textContent = state.soundOn ? '🔊 Voice' : '🔇 Muted';
	if (!state.soundOn && window.speechSynthesis) window.speechSynthesis.cancel();
}

function setBusy(b) {
	state.busy = b;
	el.send.disabled = b;
	el.send.textContent = b ? '…' : 'Send';
}

function setAnchor(text, cls) {
	el.anchorResult.className = `result-line ${cls}`;
	el.anchorResult.textContent = text;
}

boot();
