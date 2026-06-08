// Unit tests for the dependency-free Markdown renderer used on bounty detail
// pages. The renderer must (1) render the common Markdown subset and (2) never
// emit attacker-controlled HTML — every block is escaped before markup is added,
// and only http(s)/mailto/root-relative links are produced.

import { describe, it, expect } from 'vitest';
import { mdToHtml } from '../src/md.js';

describe('mdToHtml — formatting', () => {
	it('renders headings shifted under the section h2', () => {
		expect(mdToHtml('# Title')).toBe('<h3>Title</h3>');
		expect(mdToHtml('### Deep')).toBe('<h5>Deep</h5>');
	});

	it('renders emphasis and inline code', () => {
		expect(mdToHtml('a **b** c *d* `e`')).toBe(
			'<p>a <strong>b</strong> c <em>d</em> <code>e</code></p>',
		);
	});

	it('renders unordered and ordered lists', () => {
		expect(mdToHtml('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>');
		expect(mdToHtml('1. a\n2. b')).toBe('<ol><li>a</li><li>b</li></ol>');
	});

	it('renders blockquotes and horizontal rules', () => {
		expect(mdToHtml('> quote')).toBe('<blockquote>quote</blockquote>');
		expect(mdToHtml('---')).toBe('<hr/>');
	});

	it('renders fenced code blocks with escaped contents', () => {
		expect(mdToHtml('```\n<x> & y\n```')).toBe(
			'<pre class="md-pre"><code>&lt;x&gt; &amp; y</code></pre>',
		);
	});

	it('separates paragraphs and keeps single newlines as <br/>', () => {
		expect(mdToHtml('one\ntwo\n\nthree')).toBe('<p>one<br/>two</p>\n<p>three</p>');
	});

	it('returns empty string for null/undefined', () => {
		expect(mdToHtml(null)).toBe('');
		expect(mdToHtml(undefined)).toBe('');
	});
});

describe('mdToHtml — links', () => {
	it('linkifies [label](url) for safe schemes with noopener', () => {
		expect(mdToHtml('[docs](https://pump.fun/go)')).toBe(
			'<p><a href="https://pump.fun/go" target="_blank" rel="noopener noreferrer nofollow">docs</a></p>',
		);
	});

	it('autolinks bare http(s) URLs', () => {
		expect(mdToHtml('see https://three.ws here')).toBe(
			'<p>see <a href="https://three.ws" target="_blank" rel="noopener noreferrer nofollow">https://three.ws</a> here</p>',
		);
	});
});

describe('mdToHtml — safety', () => {
	it('escapes raw HTML tags', () => {
		expect(mdToHtml('<script>alert(1)</script>')).toBe(
			'<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
		);
	});

	it('does not produce a link for javascript: scheme', () => {
		const out = mdToHtml('[x](javascript:alert(1))');
		expect(out).not.toContain('href="javascript');
		expect(out).not.toContain('<a ');
	});

	it('never mistakes spaced literal numbers for token placeholders', () => {
		expect(mdToHtml('I need 3 logos and 5 banners')).toBe(
			'<p>I need 3 logos and 5 banners</p>',
		);
	});

	it('does not let emphasis bleed into code spans', () => {
		expect(mdToHtml('`a*b*c`')).toBe('<p><code>a*b*c</code></p>');
	});
});
