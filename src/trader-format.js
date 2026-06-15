/**
 * Shared formatting + presentation helpers for the trader surfaces
 * (leaderboard, profile, PnL card). Pure, dependency-free, safe to import in any
 * browser module. Centralized so the leaderboard row and the profile header can
 * never render the same number two different ways.
 */

const SOL = '◎';

export function escapeHtml(s) {
	return String(s ?? '').replace(/[&<>"']/g, (c) => (
		{ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
	));
}

/** Compact number: 1234 → "1.2K", 1_500_000 → "1.5M". */
export function compact(n) {
	const v = Number(n) || 0;
	const abs = Math.abs(v);
	if (abs >= 1e9) return (v / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
	if (abs >= 1e6) return (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
	if (abs >= 1e3) return (v / 1e3).toFixed(1).replace(/\.?0+$/, '') + 'K';
	return String(Math.round(v * 100) / 100);
}

/** Signed SOL with the ◎ glyph: 2.013 → "+2.01 ◎". */
export function fmtSol(n, { sign = true } = {}) {
	const v = Number(n) || 0;
	const s = sign && v > 0 ? '+' : '';
	const mag = Math.abs(v);
	const body = mag >= 1000 ? compact(mag) : mag.toFixed(mag >= 1 ? 2 : 3);
	return `${s}${v < 0 ? '−' : ''}${body} ${SOL}`;
}

/** Signed USD: 401.2 → "+$401". */
export function fmtUsd(n, { sign = true } = {}) {
	if (n == null) return '';
	const v = Number(n) || 0;
	const s = sign && v > 0 ? '+' : v < 0 ? '−' : '';
	const abs = Math.abs(v);
	const body = abs >= 1000 ? '$' + compact(abs) : '$' + abs.toFixed(abs < 1 ? 2 : 0);
	return `${s}${body}`;
}

/** Percent: 50.25 → "50.3%" (or "+50.3%" when signed). */
export function fmtPct(n, { sign = false, dp = 1 } = {}) {
	if (n == null) return '—';
	const v = Number(n) || 0;
	const s = sign && v > 0 ? '+' : v < 0 ? '−' : '';
	return `${s}${Math.abs(v).toFixed(dp)}%`;
}

/** Tailwind-free semantic class for a signed value. */
export function pnlClass(n) {
	const v = Number(n) || 0;
	return v > 0 ? 'lb-pos' : v < 0 ? 'lb-neg' : 'lb-muted';
}

/** Short pubkey: "7xKq…WtUK". */
export function shortAddr(a, head = 4, tail = 4) {
	if (!a || a.length <= head + tail + 1) return a || '';
	return `${a.slice(0, head)}…${a.slice(-tail)}`;
}

/** Human hold duration from seconds: 10 → "10s", 125 → "2m", 5400 → "1.5h". */
export function holdTime(seconds) {
	const s = Number(seconds) || 0;
	if (s < 60) return `${Math.round(s)}s`;
	if (s < 3600) return `${Math.round(s / 60)}m`;
	if (s < 86400) return `${(s / 3600).toFixed(s < 36000 ? 1 : 0)}h`;
	return `${(s / 86400).toFixed(1)}d`;
}

/** Relative time: "just now", "3m ago", "2h ago", "5d ago". */
export function relTime(iso) {
	if (!iso) return '';
	const then = new Date(iso).getTime();
	if (!Number.isFinite(then)) return '';
	const diff = Math.max(0, Date.now() - then) / 1000;
	if (diff < 45) return 'just now';
	if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
	if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
	return `${Math.round(diff / 86400)}d ago`;
}

/**
 * Deterministic SVG identicon data-URI from a seed string. The visual fingerprint
 * for any trader without a profile image — stable per agent, never a blank void.
 */
export function identicon(seed) {
	let h = 2166136261;
	for (let i = 0; i < String(seed).length; i++) {
		h ^= String(seed).charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	const hue = Math.abs(h) % 360;
	const hue2 = (hue + 140) % 360;
	const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'>
		<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
		<stop offset='0' stop-color='hsl(${hue} 65% 55%)'/>
		<stop offset='1' stop-color='hsl(${hue2} 60% 38%)'/></linearGradient></defs>
		<rect width='64' height='64' fill='url(#g)'/>
		<circle cx='${20 + (Math.abs(h >> 3) % 24)}' cy='${20 + (Math.abs(h >> 7) % 24)}' r='12' fill='rgba(255,255,255,0.18)'/>
	</svg>`;
	return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const CHECK_SVG = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 0.5l1.9 1.4 2.3-.3 1 2.1 2.1 1-.3 2.3 1.4 1.9-1.4 1.9.3 2.3-2.1 1-1 2.1-2.3-.3L8 15.5l-1.9-1.4-2.3.3-1-2.1-2.1-1 .3-2.3L-0.5 8l1.4-1.9-.3-2.3 2.1-1 1-2.1 2.3.3z" fill="currentColor" opacity="0.18"/><path d="M5.2 8.1l1.9 1.9 3.7-3.9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Verified badge markup (only when verified). */
export function verifiedBadge(verified, label = 'Verified track record') {
	if (!verified) return '';
	return `<span class="lb-verified" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${CHECK_SVG}</span>`;
}

export { SOL };
