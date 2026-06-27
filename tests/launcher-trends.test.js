import { describe, it, expect } from 'vitest';
import { decodeEntities, parseRssItems, normTerm } from '../api/_lib/launcher-trends.js';

describe('decodeEntities', () => {
	it('unwraps CDATA', () => {
		expect(decodeEntities('<![CDATA[Drooling Cat]]>')).toBe('Drooling Cat');
	});
	it('decodes named + numeric entities', () => {
		expect(decodeEntities('Tom &amp; Jerry')).toBe('Tom & Jerry');
		expect(decodeEntities('Don&#39;t Swear')).toBe("Don't Swear");
		expect(decodeEntities('Don&apos;t')).toBe("Don't");
	});
	it('strips unknown entities to a space rather than leaking "amp"-style garbage', () => {
		expect(decodeEntities('A&nbsp;B')).toBe('A B');
	});
});

describe('parseRssItems', () => {
	const xml = `<?xml version="1.0"?><rss><channel>
		<title>Know Your Meme Entries - Confirmed</title>
		<link>https://knowyourmeme.com</link>
		<item><title>Drooling Cat / Crowd of Drooling Cats</title>
			<link>https://knowyourmeme.com/memes/drooling-cat</link></item>
		<item><title><![CDATA[Train Dog]]></title>
			<link>https://knowyourmeme.com/memes/train-dog</link></item>
	</channel></rss>`;

	it('reads only <item> blocks, skipping the channel-level title', () => {
		const items = parseRssItems(xml);
		expect(items).toHaveLength(2);
		expect(items.map((i) => i.title)).toEqual([
			'Drooling Cat / Crowd of Drooling Cats',
			'Train Dog',
		]);
	});
	it('captures item links for slug de-referencing', () => {
		const items = parseRssItems(xml);
		expect(items[1].link).toBe('https://knowyourmeme.com/memes/train-dog');
	});
	it('returns [] for empty / malformed input, never throws', () => {
		expect(parseRssItems('')).toEqual([]);
		expect(parseRssItems(null)).toEqual([]);
		expect(parseRssItems('<rss>no items here</rss>')).toEqual([]);
	});
});

describe('KYM theme extraction shape', () => {
	it('takes the first clean variant from a "Primary / Variant" title', () => {
		const variant = 'Drooling Cat / Crowd of Drooling Cats'
			.split(/\s*\/\s*/).map((v) => normTerm(v)).find(Boolean);
		expect(variant).toBe('Drooling Cat');
	});
	it('falls through an emoticon variant to the readable one', () => {
		const variant = '( ͡° ͜ʖ ͡°) / Lenny Face'
			.split(/\s*\/\s*/).map((v) => normTerm(v)).find(Boolean);
		expect(variant).toBe('Lenny Face');
	});
	it('drops overlong meme titles (no usable ticker theme)', () => {
		expect(normTerm('She Had No Idea They Was Gonna Play In Her Face')).toBeNull();
	});
	it('de-slugs a /memes/<slug> link into a theme phrase', () => {
		const m = 'https://knowyourmeme.com/memes/subcultures/chimptopia'
			.match(/\/memes\/(?:[a-z-]+\/)?([a-z0-9-]+)\b/i);
		expect(normTerm(m[1].replace(/-/g, ' '))).toBe('chimptopia');
	});
});
