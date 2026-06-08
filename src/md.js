// Minimal, safe Markdown → HTML for pump.fun bounty briefs and submissions.
//
// pump.fun stores briefs and proofs as Markdown (`bodyMarkdown`). Rendering them
// as raw text loses headings, lists, links, and emphasis — so the detail page
// reads like a dump. This renders the common subset (headings, lists, quotes,
// code, emphasis, links, rules) with NO external dependency.
//
// Security: every block's text is HTML-escaped BEFORE any markup is inserted, so
// user content can never inject tags. Links are whitelisted to http(s), mailto,
// and root-relative paths — `javascript:` and friends stay inert text. The
// output is therefore safe to assign via innerHTML.

// Private-use sentinel that wraps stashed token indices. It can't appear in real
// content and survives HTML-escaping untouched, so emphasis rules never reach
// inside a code span or link, and literal numbers are never mistaken for tokens.
const SENT = String.fromCharCode(0xe000); // U+E000 private-use sentinel
const RESTORE = new RegExp(SENT + '(\\d+)' + SENT, 'g');

function esc(str) {
	if (str == null) return '';
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

// Inline formatting on already-escaped text. Code spans and links are stashed as
// sentinel-wrapped placeholders first so their contents aren't re-processed.
function inline(s) {
	const tokens = [];
	const stash = (html) => `${SENT}${tokens.push(html) - 1}${SENT}`;

	// [label](url) — whitelist safe schemes only.
	s = s.replace(
		/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|\/[^\s)]*)\)/g,
		(_, label, url) =>
			stash(
				`<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`,
			),
	);
	// `inline code`
	s = s.replace(/`([^`]+)`/g, (_, code) => stash(`<code>${code}</code>`));
	// **bold** / __bold__
	s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
	// *italic* / _italic_ (avoid matching list bullets or intra-word underscores)
	s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>');
	s = s.replace(/(^|[^_\w])_([^_\s][^_]*?)_/g, '$1<em>$2</em>');
	// ~~strike~~
	s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
	// bare URL autolink (those inside a stashed anchor are already protected)
	s = s.replace(
		/(^|[\s(])(https?:\/\/[^\s<)]+)/g,
		(_, pre, url) =>
			`${pre}${stash(`<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>`)}`,
	);

	return s.replace(RESTORE, (_, i) => tokens[+i]);
}

const RE_FENCE = /^```/;
const RE_BLANK = /^\s*$/;
const RE_HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const RE_HEAD = /^(#{1,6})\s+(.*)$/;
const RE_QUOTE = /^\s*>\s?/;
const RE_UL = /^\s*[-*+]\s+/;
const RE_OL = /^\s*\d+[.)]\s+/;

function startsBlock(line) {
	return (
		RE_FENCE.test(line) ||
		RE_HEAD.test(line) ||
		RE_QUOTE.test(line) ||
		RE_UL.test(line) ||
		RE_OL.test(line) ||
		RE_HR.test(line)
	);
}

export function mdToHtml(src) {
	if (src == null) return '';
	const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
	const out = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		if (RE_FENCE.test(line)) {
			const buf = [];
			i++;
			while (i < lines.length && !RE_FENCE.test(lines[i])) buf.push(lines[i++]);
			i++; // closing fence (if present)
			out.push(`<pre class="md-pre"><code>${esc(buf.join('\n'))}</code></pre>`);
			continue;
		}
		if (RE_BLANK.test(line)) {
			i++;
			continue;
		}
		if (RE_HR.test(line)) {
			out.push('<hr/>');
			i++;
			continue;
		}
		const h = line.match(RE_HEAD);
		if (h) {
			const lvl = Math.min(6, h[1].length + 2); // # → h3, so it sits under the section h2
			out.push(`<h${lvl}>${inline(esc(h[2].trim()))}</h${lvl}>`);
			i++;
			continue;
		}
		if (RE_QUOTE.test(line)) {
			const buf = [];
			while (i < lines.length && RE_QUOTE.test(lines[i]))
				buf.push(lines[i++].replace(RE_QUOTE, ''));
			out.push(
				`<blockquote>${inline(esc(buf.join('\n'))).replace(/\n/g, '<br/>')}</blockquote>`,
			);
			continue;
		}
		if (RE_UL.test(line)) {
			const buf = [];
			while (i < lines.length && RE_UL.test(lines[i]))
				buf.push(lines[i++].replace(RE_UL, ''));
			out.push(`<ul>${buf.map((li) => `<li>${inline(esc(li))}</li>`).join('')}</ul>`);
			continue;
		}
		if (RE_OL.test(line)) {
			const buf = [];
			while (i < lines.length && RE_OL.test(lines[i]))
				buf.push(lines[i++].replace(RE_OL, ''));
			out.push(`<ol>${buf.map((li) => `<li>${inline(esc(li))}</li>`).join('')}</ol>`);
			continue;
		}

		// Paragraph: gather consecutive non-blank, non-block lines.
		const buf = [];
		while (i < lines.length && !RE_BLANK.test(lines[i]) && !startsBlock(lines[i])) {
			buf.push(lines[i++]);
		}
		out.push(`<p>${inline(esc(buf.join('\n'))).replace(/\n/g, '<br/>')}</p>`);
	}

	return out.join('\n');
}
