// dashboard-next — Referrals.
//
// A 3D, flippable membership card (the centrepiece) plus the referral link,
// share actions, and live referral stats. Front shows the member's standing;
// back shows a scannable QR for the referral link. Every number is real,
// pulled from /api/users/referrals — no placeholders.

import { mountShell } from '../shell.js';
import { requireUser, get, esc } from '../api.js';
import { renderQRToSVG, renderQRToCanvas } from '../../erc8004/qr.js';

const MONO = `'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace`;

// Referral commission paid to the referrer on each purchase. Mirrors the
// server default (REFERRAL_COMMISSION_BPS in api/_lib/purchase-confirm.js).
const REFERRAL_PCT = 5;

// ── small utilities ─────────────────────────────────────────────────────────

function toast(msg) {
	let el = document.getElementById('dn-toast');
	if (!el) {
		el = document.createElement('div');
		el.id = 'dn-toast';
		el.style.cssText = `
			position:fixed;left:50%;bottom:32px;transform:translateX(-50%) translateY(20px);
			background:rgba(20,21,28,0.95);border:1px solid var(--nxt-stroke-strong);
			color:var(--nxt-ink);padding:9px 16px;border-radius:999px;font-size:13px;
			z-index:9999;opacity:0;transition:opacity .18s, transform .18s;
			backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
			box-shadow:0 8px 24px rgba(0,0,0,0.4);pointer-events:none;`;
		document.body.appendChild(el);
	}
	el.textContent = msg;
	requestAnimationFrame(() => {
		el.style.opacity = '1';
		el.style.transform = 'translateX(-50%) translateY(0)';
	});
	clearTimeout(el._t);
	el._t = setTimeout(() => {
		el.style.opacity = '0';
		el.style.transform = 'translateX(-50%) translateY(20px)';
	}, 1600);
}

async function copyToClipboard(text) {
	try {
		await navigator.clipboard.writeText(text);
		toast('Copied');
		return true;
	} catch {
		const t = document.createElement('textarea');
		t.value = text;
		t.style.position = 'fixed';
		t.style.opacity = '0';
		document.body.appendChild(t);
		t.select();
		let ok = false;
		try { ok = document.execCommand('copy'); } catch { ok = false; }
		document.body.removeChild(t);
		toast(ok ? 'Copied' : 'Copy failed');
		return ok;
	}
}

function fmtInt(n) {
	return Number(n || 0).toLocaleString('en-US');
}

function fmtUsd(n) {
	return Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** "06/27" — two years out, the card's notional validity. */
function expLabel(memberSince) {
	const base = memberSince ? new Date(memberSince) : new Date();
	const exp = new Date(base.getTime());
	exp.setFullYear(exp.getFullYear() + 2);
	const mm = String(exp.getMonth() + 1).padStart(2, '0');
	const yy = String(exp.getFullYear()).slice(-2);
	return `${mm}/${yy}`;
}

function memberSinceLabel(memberSince) {
	if (!memberSince) return '—';
	const d = new Date(memberSince);
	if (Number.isNaN(d.getTime())) return '—';
	return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// ── styles (scoped, injected once) ──────────────────────────────────────────

function injectStyles() {
	if (document.getElementById('ref-card-styles')) return;
	const s = document.createElement('style');
	s.id = 'ref-card-styles';
	s.textContent = `
	.ref-wrap{max-width:980px}
	.ref-stage{display:flex;gap:18px;align-items:center;justify-content:center;flex-wrap:wrap}
	.ref-perspective{perspective:1400px;width:100%;max-width:460px;flex:1 1 360px;min-width:300px}
	.ref-card{
		position:relative;width:100%;aspect-ratio:1.74/1;
		transform-style:preserve-3d;transition:transform .7s cubic-bezier(.22,.61,.36,1);
		will-change:transform;cursor:grab;
	}
	.ref-card:active{cursor:grabbing}
	.ref-face{
		position:absolute;inset:0;border-radius:20px;overflow:hidden;
		-webkit-backface-visibility:hidden;backface-visibility:hidden;
		box-shadow:0 26px 60px -22px rgba(60,30,140,0.7), 0 2px 0 rgba(255,255,255,0.06) inset;
		border:1px solid rgba(167,139,250,0.28);
		padding:clamp(16px,4.4%,22px);display:flex;flex-direction:column;color:#fff;
	}
	.ref-face.front{
		background:
			radial-gradient(120% 140% at 88% 6%, rgba(167,139,250,0.42), transparent 52%),
			radial-gradient(90% 120% at 0% 100%, rgba(86,52,170,0.5), transparent 60%),
			linear-gradient(135deg,#181230 0%,#241a4d 52%,#3a2680 100%);
	}
	.ref-face.back{
		transform:rotateY(180deg);
		background:
			radial-gradient(120% 130% at 12% 8%, rgba(167,139,250,0.34), transparent 55%),
			linear-gradient(150deg,#15102a 0%,#221a44 60%,#2f2160 100%);
	}
	.ref-sheen{position:absolute;inset:0;pointer-events:none;
		background:linear-gradient(105deg,transparent 38%,rgba(255,255,255,0.10) 48%,transparent 58%);
		mix-blend-mode:screen;opacity:.7}
	.ref-row{display:flex;align-items:center;justify-content:space-between;gap:10px}
	.ref-brand{display:flex;align-items:center;gap:8px;font-weight:700;letter-spacing:-0.01em;font-size:15px}
	.ref-brand img{width:20px;height:20px;border-radius:5px;display:block}
	.ref-chip{width:30px;height:22px;border-radius:5px;
		background:linear-gradient(135deg,#e8d9a0,#b8932f);position:relative;opacity:.9;flex-shrink:0}
	.ref-chip::before,.ref-chip::after{content:"";position:absolute;left:18%;right:18%;height:1px;background:rgba(0,0,0,.32)}
	.ref-chip::before{top:38%}.ref-chip::after{top:62%}
	.ref-qr{background:#fff;border-radius:9px;padding:6px;line-height:0;box-shadow:0 4px 14px rgba(0,0,0,.3)}
	.ref-qr svg{display:block;width:100%;height:100%}
	.ref-scan{font-size:11px;color:rgba(255,255,255,.62);letter-spacing:.02em}
	.ref-scan b{display:block;color:rgba(255,255,255,.92);font-size:12px;font-weight:600;letter-spacing:0}
	.ref-divider{height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.18),transparent);margin:auto 0 0}
	.ref-stats{display:flex;gap:12px;justify-content:space-between}
	.ref-stat-k{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:3px}
	.ref-stat-v{font-size:19px;font-weight:700;font-family:${MONO};line-height:1}
	.ref-stat-v.accent{color:#c4b5fd}
	.ref-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;
		font-family:${MONO};font-size:10.5px;color:rgba(255,255,255,.5)}
	.ref-meta b{color:rgba(255,255,255,.82);font-weight:600}
	.ref-name{font-size:clamp(20px,5.5%,26px);font-weight:700;letter-spacing:-0.01em;line-height:1}
	.ref-strip{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.06);
		border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:9px 12px;font-size:12px;color:rgba(255,255,255,.86)}
	.ref-strip svg{flex-shrink:0}
	.ref-rail{display:flex;flex-direction:column;gap:10px;flex:0 0 auto}
	.ref-rail-btn{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;
		background:rgba(255,255,255,.05);border:1px solid var(--nxt-stroke-strong);color:var(--nxt-ink);
		cursor:pointer;transition:transform .14s ease,background .14s ease,border-color .14s ease,box-shadow .14s ease;position:relative}
	.ref-rail-btn:hover{background:rgba(167,139,250,.16);border-color:rgba(167,139,250,.5);transform:translateY(-1px)}
	.ref-rail-btn:active{transform:translateY(0) scale(.95)}
	.ref-rail-btn:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(167,139,250,.4)}
	.ref-rail-btn svg{width:18px;height:18px}
	.ref-rail-btn[data-active="true"]{background:rgba(167,139,250,.22);border-color:rgba(167,139,250,.6)}
	.ref-tip{position:absolute;right:54px;top:50%;transform:translateY(-50%) translateX(4px);
		background:rgba(20,21,28,.96);border:1px solid var(--nxt-stroke-strong);color:var(--nxt-ink);
		font-size:12px;padding:5px 9px;border-radius:7px;white-space:nowrap;opacity:0;pointer-events:none;
		transition:opacity .14s ease,transform .14s ease;box-shadow:0 6px 18px rgba(0,0,0,.4)}
	.ref-rail-btn:hover .ref-tip,.ref-rail-btn:focus-visible .ref-tip{opacity:1;transform:translateY(-50%) translateX(0)}
	.ref-linkbar{display:flex;gap:8px;align-items:stretch;flex-wrap:wrap}
	.ref-linkbar input{flex:1;min-width:200px;background:rgba(255,255,255,.04);border:1px solid var(--nxt-stroke-strong);
		border-radius:9px;padding:11px 13px;color:var(--nxt-ink);font-family:${MONO};font-size:13px}
	.ref-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
	.ref-tile{border:1px solid var(--nxt-stroke);border-radius:var(--nxt-radius-sm,12px);padding:14px 16px;background:rgba(255,255,255,.015)}
	.ref-tile-k{font-size:11.5px;color:var(--nxt-ink-fade);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}
	.ref-tile-v{font-size:24px;font-weight:700;letter-spacing:-0.01em;font-family:${MONO}}
	.ref-tile-v small{font-size:13px;color:var(--nxt-ink-fade);font-weight:500;font-family:inherit}
	.ref-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
	.ref-step{display:flex;gap:12px;align-items:flex-start}
	.ref-step-n{flex:0 0 auto;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;
		background:rgba(167,139,250,.16);border:1px solid rgba(167,139,250,.4);color:#c4b5fd;font-size:12.5px;font-weight:700;font-family:${MONO}}
	.ref-step h4{margin:0 0 3px;font-size:13.5px;color:var(--nxt-ink)}
	.ref-step p{margin:0;font-size:12.5px;color:var(--nxt-ink-dim);line-height:1.45}
	.ref-card-skel{width:100%;aspect-ratio:1.74/1;border-radius:20px;
		background:linear-gradient(135deg,#1a1336,#2a1f52);border:1px solid var(--nxt-stroke);
		position:relative;overflow:hidden}
	.ref-card-skel::after{content:"";position:absolute;inset:0;
		background:linear-gradient(90deg,transparent,rgba(255,255,255,.07),transparent);
		transform:translateX(-100%);animation:ref-shim 1.4s infinite}
	@keyframes ref-shim{100%{transform:translateX(100%)}}
	@media (prefers-reduced-motion: reduce){
		.ref-card{transition:none}
		.ref-card-skel::after{animation:none}
	}
	@media (max-width:560px){
		.ref-stage{flex-direction:column-reverse}
		.ref-rail{flex-direction:row;flex-wrap:wrap;justify-content:center}
		.ref-tip{display:none}
	}
	`;
	document.head.appendChild(s);
}

// ── card faces ───────────────────────────────────────────────────────────────

function frontFace(card, refUrl) {
	const qr = renderQRToSVG(refUrl, { scale: 3, margin: 1, dark: '#1a1336', light: '#ffffff' });
	return `
		<div class="ref-face front" data-face="front">
			<div class="ref-sheen"></div>
			<div class="ref-row">
				<div class="ref-brand"><img src="/favicon.ico" alt="" />three.ws</div>
				<div class="ref-chip" aria-hidden="true"></div>
			</div>
			<div class="ref-row" style="margin-top:14px;align-items:flex-start;gap:14px">
				<div class="ref-qr" style="width:64px;height:64px">${qr}</div>
				<div class="ref-scan" style="margin-top:6px"><b>Scan to join</b>three.ws referral</div>
			</div>
			<div class="ref-divider" style="margin-top:14px"></div>
			<div class="ref-stats" style="margin-top:12px">
				<div><div class="ref-stat-k">Position</div><div class="ref-stat-v accent">#${fmtInt(card.position)}</div></div>
				<div><div class="ref-stat-k">Referrals</div><div class="ref-stat-v">${fmtInt(card.referred_users_count)}</div></div>
				<div><div class="ref-stat-k">Score</div><div class="ref-stat-v">${fmtInt(card.score)}</div></div>
			</div>
			<div class="ref-meta" style="margin-top:10px">
				<span>EXP <b>${esc(expLabel(card.member_since))}</b> &nbsp; Member since ${esc(memberSinceLabel(card.member_since))}</span>
				<span>#${String(card.position).padStart(6, '0')}</span>
			</div>
			<div class="ref-name" style="margin-top:10px">${esc(card.display_name || 'Member')}</div>
		</div>`;
}

function backFace(card, refUrl) {
	const qr = renderQRToSVG(refUrl, { scale: 4, margin: 1, dark: '#1a1336', light: '#ffffff' });
	const shortUrl = refUrl.replace(/^https?:\/\//, '');
	return `
		<div class="ref-face back" data-face="back">
			<div class="ref-sheen"></div>
			<div style="display:flex;gap:16px;align-items:center;flex:1">
				<div class="ref-qr" style="width:108px;height:108px;flex:0 0 auto">${qr}</div>
				<div>
					<div class="ref-scan"><b style="font-size:14px">Scan to join</b></div>
					<div style="font-family:${MONO};font-size:11px;color:rgba(255,255,255,.6);margin-top:4px;word-break:break-all">${esc(shortUrl)}</div>
				</div>
			</div>
			<div class="ref-strip" style="margin-top:12px">
				<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#c4b5fd" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="M10 6.5v7M7.8 8.2h3a1.4 1.4 0 010 2.8H8.2a1.4 1.4 0 000 2.8h3"/></svg>
				Earn <b style="color:#fff">${REFERRAL_PCT}%</b> on every referral purchase — paid in USDC
			</div>
			<div class="ref-stats" style="margin-top:12px">
				<div><div class="ref-stat-k">Position</div><div class="ref-stat-v accent">#${fmtInt(card.position)}</div></div>
				<div><div class="ref-stat-k">Score</div><div class="ref-stat-v">${fmtInt(card.score)}</div></div>
				<div><div class="ref-stat-k">Referrals</div><div class="ref-stat-v">${fmtInt(card.referred_users_count)}</div></div>
			</div>
			<div class="ref-divider" style="margin-top:12px"></div>
			<div class="ref-row" style="margin-top:10px;color:rgba(255,255,255,.5);font-size:11px">
				<div class="ref-brand" style="font-size:13px;opacity:.85"><img src="/favicon.ico" alt="" />three.ws</div>
				<span>© ${new Date().getFullYear()} three.ws</span>
			</div>
		</div>`;
}

// ── icons for the action rail ─────────────────────────────────────────────────

const ICONS = {
	flip:  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8a6 6 0 019.7-3.2L16 7M16 3v4h-4"/><path d="M16 12a6 6 0 01-9.7 3.2L4 13M4 17v-4h4"/></svg>',
	x:     '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M14.9 3H17l-4.6 5.3L18 17h-4.3l-3.4-4.4L6.4 17H4.3l5-5.7L3.5 3h4.4l3 4 3.9-4z"/></svg>',
	tg:    '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M17.6 3.3 2.9 9c-1 .4-1 1 0 1.3l3.7 1.1 1.4 4.5c.2.5.1.7.6.7.4 0 .6-.2.8-.4l1.8-1.8 3.8 2.8c.7.4 1.2.2 1.4-.6l2.5-11.8c.3-1-.4-1.5-1.3-1.1zM7.8 11.8l8-5c.4-.2.7 0 .4.3l-6.7 6-.3 2.6-1.4-3.9z"/></svg>',
	copy:  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="9" height="9" rx="2"/><path d="M13 7V5a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2"/></svg>',
	dl:    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v9M6.5 8.5 10 12l3.5-3.5"/><path d="M4 14v1.5A1.5 1.5 0 005.5 17h9a1.5 1.5 0 001.5-1.5V14"/></svg>',
	share: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="15" cy="5" r="2.2"/><circle cx="5" cy="10" r="2.2"/><circle cx="15" cy="15" r="2.2"/><path d="M6.9 8.9l6.2-3M6.9 11.1l6.2 3"/></svg>',
};

// ── PNG export — draw the front face to a canvas for a shareable image ────────

function exportCardPNG(card, refUrl) {
	const W = 1100, H = Math.round(W / 1.74), P = 56;
	const canvas = document.createElement('canvas');
	canvas.width = W; canvas.height = H;
	const ctx = canvas.getContext('2d');

	// Background gradient + radial sheen.
	const g = ctx.createLinearGradient(0, 0, W, H);
	g.addColorStop(0, '#181230'); g.addColorStop(0.52, '#241a4d'); g.addColorStop(1, '#3a2680');
	roundRect(ctx, 0, 0, W, H, 40); ctx.fillStyle = g; ctx.fill();
	const rg = ctx.createRadialGradient(W * 0.88, H * 0.06, 0, W * 0.88, H * 0.06, W * 0.6);
	rg.addColorStop(0, 'rgba(167,139,250,0.4)'); rg.addColorStop(1, 'rgba(167,139,250,0)');
	ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);

	ctx.fillStyle = '#ffffff';
	ctx.textBaseline = 'alphabetic';

	// Brand wordmark.
	ctx.font = '700 34px Inter, system-ui, sans-serif';
	ctx.fillText('three.ws', P, P + 30);

	// QR (small) top area.
	const qrCanvas = renderQRToCanvas(refUrl, { scale: 4, margin: 1 });
	const qrSize = 150;
	ctx.save();
	roundRect(ctx, P, P + 60, qrSize, qrSize, 14); ctx.fillStyle = '#fff'; ctx.fill();
	ctx.drawImage(qrCanvas, P + 8, P + 68, qrSize - 16, qrSize - 16);
	ctx.restore();
	ctx.fillStyle = 'rgba(255,255,255,0.92)';
	ctx.font = '600 24px Inter, system-ui, sans-serif';
	ctx.fillText('Scan to join', P + qrSize + 28, P + 110);
	ctx.fillStyle = 'rgba(255,255,255,0.55)';
	ctx.font = '400 18px Inter, system-ui, sans-serif';
	ctx.fillText('three.ws referral', P + qrSize + 28, P + 138);

	// Divider.
	const dy = P + 250;
	ctx.fillStyle = 'rgba(255,255,255,0.16)';
	ctx.fillRect(P, dy, W - P * 2, 1.5);

	// Stats row.
	const stats = [
		['POSITION', `#${fmtInt(card.position)}`, '#c4b5fd'],
		['REFERRALS', fmtInt(card.referred_users_count), '#ffffff'],
		['SCORE', fmtInt(card.score), '#ffffff'],
	];
	stats.forEach((st, i) => {
		const x = P + i * ((W - P * 2) / 3);
		ctx.fillStyle = 'rgba(255,255,255,0.5)';
		ctx.font = '600 16px Inter, system-ui, sans-serif';
		ctx.fillText(st[0], x, dy + 40);
		ctx.fillStyle = st[2];
		ctx.font = `700 40px ${'ui-monospace, Menlo, monospace'}`;
		ctx.fillText(st[1], x, dy + 86);
	});

	// Member meta + name.
	ctx.fillStyle = 'rgba(255,255,255,0.55)';
	ctx.font = '400 18px ui-monospace, Menlo, monospace';
	ctx.fillText(`EXP ${expLabel(card.member_since)}   Member since ${memberSinceLabel(card.member_since)}`, P, H - P - 44);
	ctx.textAlign = 'right';
	ctx.fillText(`#${String(card.position).padStart(6, '0')}`, W - P, H - P - 44);
	ctx.textAlign = 'left';
	ctx.fillStyle = '#ffffff';
	ctx.font = '700 40px Inter, system-ui, sans-serif';
	ctx.fillText(card.display_name || 'Member', P, H - P);

	canvas.toBlob((blob) => {
		if (!blob) { toast('Export failed'); return; }
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `three-ws-membership-${card.referral_code}.png`;
		document.body.appendChild(a); a.click(); a.remove();
		URL.revokeObjectURL(url);
		toast('Card downloaded');
	}, 'image/png');
}

function roundRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

// ── render ────────────────────────────────────────────────────────────────────

function renderCard(host, card) {
	const refUrl = `${location.origin}/register?ref=${encodeURIComponent(card.referral_code)}`;
	const shareText = `Join me on three.ws — build, deploy, and monetize 3D AI agents.`;
	const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(refUrl)}`;
	const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(refUrl)}&text=${encodeURIComponent(shareText)}`;

	host.innerHTML = `
		<div class="ref-stage">
			<div class="ref-perspective">
				<div class="ref-card" data-card role="img"
					aria-label="three.ws membership card — position ${fmtInt(card.position)}, ${fmtInt(card.referred_users_count)} referrals, score ${fmtInt(card.score)}">
					${frontFace(card, refUrl)}
					${backFace(card, refUrl)}
				</div>
			</div>
			<div class="ref-rail" role="toolbar" aria-label="Card actions">
				<button class="ref-rail-btn" data-action="flip" aria-label="Flip card">${ICONS.flip}<span class="ref-tip">Flip card</span></button>
				<a class="ref-rail-btn" data-action="x" href="${esc(xUrl)}" target="_blank" rel="noopener" aria-label="Share on X">${ICONS.x}<span class="ref-tip">Share on X</span></a>
				<a class="ref-rail-btn" data-action="tg" href="${esc(tgUrl)}" target="_blank" rel="noopener" aria-label="Share on Telegram">${ICONS.tg}<span class="ref-tip">Telegram</span></a>
				<button class="ref-rail-btn" data-action="copy" aria-label="Copy referral link">${ICONS.copy}<span class="ref-tip">Copy link</span></button>
				<button class="ref-rail-btn" data-action="download" aria-label="Download card image">${ICONS.dl}<span class="ref-tip">Download</span></button>
				<button class="ref-rail-btn" data-action="share" aria-label="Share">${ICONS.share}<span class="ref-tip">Share</span></button>
			</div>
		</div>

		<div style="margin-top:22px">
			<div class="dn-panel-title" style="margin-bottom:8px">Your referral link</div>
			<div class="ref-linkbar">
				<input type="text" readonly value="${esc(refUrl)}" data-link aria-label="Referral link" />
				<button class="dn-btn primary" data-action="copy-link" style="padding:0 18px">Copy link</button>
				<button class="dn-btn" data-action="copy-code" style="padding:0 16px">Copy code · ${esc(card.referral_code)}</button>
			</div>
		</div>

		<div class="ref-tiles" style="margin-top:18px">
			<div class="ref-tile"><div class="ref-tile-k">Member position</div><div class="ref-tile-v">#${fmtInt(card.position)} <small>of ${fmtInt(card.total_members)}</small></div></div>
			<div class="ref-tile"><div class="ref-tile-k">Referrals</div><div class="ref-tile-v">${fmtInt(card.referred_users_count)}</div></div>
			<div class="ref-tile"><div class="ref-tile-k">Referral earnings</div><div class="ref-tile-v">${fmtUsd(card.referral_earnings_usd)}</div></div>
			<div class="ref-tile"><div class="ref-tile-k">Score</div><div class="ref-tile-v">${fmtInt(card.score)}</div></div>
		</div>

		<section class="dn-panel" style="margin-top:20px">
			<div class="dn-panel-title" style="margin-bottom:14px">How referrals work</div>
			<div class="ref-steps">
				<div class="ref-step"><div class="ref-step-n">1</div><div><h4>Share your link</h4><p>Send your referral link or QR. Anyone who signs up through it is linked to you for life.</p></div></div>
				<div class="ref-step"><div class="ref-step-n">2</div><div><h4>They build &amp; spend</h4><p>When your referrals buy assets, skills, or services on three.ws, you earn automatically.</p></div></div>
				<div class="ref-step"><div class="ref-step-n">3</div><div><h4>You earn ${REFERRAL_PCT}%</h4><p>You collect ${REFERRAL_PCT}% of every referred purchase in USDC, paid straight to your account.</p></div></div>
			</div>
		</section>
	`;

	wireCard(host, card, refUrl);
}

function wireCard(host, card, refUrl) {
	const cardEl = host.querySelector('[data-card]');
	const flipBtn = host.querySelector('[data-action="flip"]');

	const state = { flipped: false, rx: 0, ry: 0 };
	const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

	const apply = () => {
		const baseY = state.flipped ? 180 : 0;
		cardEl.style.transform = `rotateX(${state.rx}deg) rotateY(${baseY + state.ry}deg)`;
	};
	apply();

	const flip = () => {
		state.flipped = !state.flipped;
		flipBtn.setAttribute('data-active', String(state.flipped));
		const tip = flipBtn.querySelector('.ref-tip');
		if (tip) tip.textContent = state.flipped ? 'Show front' : 'Flip card';
		apply();
	};
	flipBtn.addEventListener('click', flip);
	// Tapping the card flips it too — but not when the user is dragging to tilt.
	cardEl.addEventListener('click', (e) => {
		if (cardEl._dragged) { cardEl._dragged = false; return; }
		if (e.target.closest('a')) return;
		flip();
	});

	if (!reduce) {
		const onMove = (e) => {
			const r = cardEl.getBoundingClientRect();
			const px = (e.clientX - r.left) / r.width - 0.5;
			const py = (e.clientY - r.top) / r.height - 0.5;
			state.ry = px * 10;
			state.rx = -py * 10;
			cardEl._dragged = true;
			apply();
		};
		cardEl.addEventListener('pointermove', onMove);
		cardEl.addEventListener('pointerleave', () => {
			state.rx = 0; state.ry = 0; apply();
			setTimeout(() => { cardEl._dragged = false; }, 0);
		});
	}

	const copyLink = () => copyToClipboard(refUrl);
	host.querySelector('[data-action="copy"]').addEventListener('click', copyLink);
	host.querySelector('[data-action="copy-link"]').addEventListener('click', copyLink);
	host.querySelector('[data-action="copy-code"]').addEventListener('click', () => copyToClipboard(card.referral_code));
	host.querySelector('[data-link]').addEventListener('click', (e) => { e.currentTarget.select(); });
	host.querySelector('[data-action="download"]').addEventListener('click', () => exportCardPNG(card, refUrl));

	host.querySelector('[data-action="share"]').addEventListener('click', async () => {
		const data = {
			title: 'three.ws',
			text: 'Join me on three.ws — build, deploy, and monetize 3D AI agents.',
			url: refUrl,
		};
		if (navigator.share) {
			try { await navigator.share(data); } catch { /* user cancelled */ }
		} else {
			await copyToClipboard(refUrl);
		}
	});
}

function renderError(host, message) {
	host.innerHTML = `
		<div class="dn-empty" style="padding:40px 24px">
			<h3>Couldn't load your card</h3>
			<p>${esc(message || 'Try again in a moment.')}</p>
			<button class="dn-btn primary" data-action="retry">Retry</button>
		</div>`;
	host.querySelector('[data-action="retry"]').addEventListener('click', () => boot(host));
}

async function boot(host) {
	host.innerHTML = `<div class="ref-stage"><div class="ref-perspective"><div class="ref-card-skel"></div></div></div>`;
	try {
		const card = await get('/api/users/referrals');
		if (!card || !card.referral_code) {
			renderError(host, 'No referral code yet — refresh to mint one.');
			return;
		}
		renderCard(host, card);
	} catch (err) {
		renderError(host, err?.message);
	}
}

(async function main() {
	injectStyles();
	const root = await mountShell();
	await requireUser();

	root.innerHTML = `
		<h1 class="dn-h1">Referrals</h1>
		<p class="dn-h1-sub">Your three.ws membership card. Share it, earn ${REFERRAL_PCT}% on every referral.</p>
		<div class="ref-wrap" data-slot="card"></div>
	`;

	boot(root.querySelector('[data-slot="card"]'));
})();
