import { describe, it, expect } from 'vitest';
import {
	truncate,
	resolveGateway,
	normalizeDasAsset,
	agencStatusLabel,
	agencActive,
} from '../api/_lib/solana-agents-normalize.js';

describe('solana-agents-crawl helpers', () => {
	describe('truncate', () => {
		it('trims and caps length, nulling empties', () => {
			expect(truncate('  hi  ', 10)).toBe('hi');
			expect(truncate('abcdef', 3)).toBe('abc');
			expect(truncate('   ', 10)).toBe(null);
			expect(truncate(null, 10)).toBe(null);
			expect(truncate(undefined, 10)).toBe(null);
		});
	});

	describe('resolveGateway', () => {
		it('rewrites ipfs:// to a https gateway', () => {
			expect(resolveGateway('ipfs://bafyhash')).toBe('https://ipfs.io/ipfs/bafyhash');
			expect(resolveGateway('ipfs://ipfs/bafyhash')).toBe('https://ipfs.io/ipfs/bafyhash');
		});
		it('rewrites ar:// to arweave', () => {
			expect(resolveGateway('ar://txid123')).toBe('https://arweave.net/txid123');
		});
		it('treats a bare CID as ipfs', () => {
			const cid = 'QmbWqxBEKC3P8tqsKc98xmWNzrzDtRLMiMPL8wBuTGsMnR';
			expect(resolveGateway(cid)).toBe(`https://ipfs.io/ipfs/${cid}`);
		});
		it('leaves http(s) URLs untouched and nulls empties', () => {
			expect(resolveGateway('https://example.com/a.json')).toBe('https://example.com/a.json');
			expect(resolveGateway('')).toBe(null);
			expect(resolveGateway(null)).toBe(null);
		});
	});

	describe('normalizeDasAsset', () => {
		it('extracts image, glb, owner and metadata from a DAS result', () => {
			const out = normalizeDasAsset({
				content: {
					json_uri: 'https://meta.example/agent.json',
					metadata: { name: 'Astra', description: 'A trading agent' },
					links: { image: 'https://cdn.example/astra.png' },
					files: [
						{ mime: 'image/png', uri: 'https://cdn.example/astra.png' },
						{ mime: 'model/gltf-binary', uri: 'https://cdn.example/astra.glb' },
					],
				},
				ownership: { owner: 'OwnerPubkey1111' },
			});
			expect(out).toEqual({
				name: 'Astra',
				description: 'A trading agent',
				image: 'https://cdn.example/astra.png',
				glb_url: 'https://cdn.example/astra.glb',
				metadata_uri: 'https://meta.example/agent.json',
				owner: 'OwnerPubkey1111',
			});
		});

		it('falls back to a files[] image when links.image is absent', () => {
			const out = normalizeDasAsset({
				content: { metadata: {}, files: [{ mime: 'image/jpeg', uri: 'https://x/y.jpg' }] },
			});
			expect(out.image).toBe('https://x/y.jpg');
			expect(out.glb_url).toBe(null);
		});

		it('detects a GLB by file extension when mime is generic', () => {
			const out = normalizeDasAsset({
				content: { metadata: {}, files: [{ mime: 'application/octet-stream', uri: 'https://x/model.glb?v=2' }] },
			});
			expect(out.glb_url).toBe('https://x/model.glb?v=2');
		});

		it('returns null for a missing result', () => {
			expect(normalizeDasAsset(null)).toBe(null);
			expect(normalizeDasAsset(undefined)).toBe(null);
		});
	});

	describe('agencStatusLabel', () => {
		it('maps numeric status codes', () => {
			expect(agencStatusLabel(0)).toBe('pending');
			expect(agencStatusLabel(1)).toBe('active');
			expect(agencStatusLabel(2)).toBe('inactive');
			expect(agencStatusLabel(3)).toBe('suspended');
		});
		it('decodes an Anchor enum object', () => {
			// camelCase variant key falls through to the string passthrough
			expect(agencStatusLabel({ active: {} })).toBe('active');
			// numeric-keyed variant resolves via the code table
			expect(agencStatusLabel({ 1: {} })).toBe('active');
		});
		it('passes through unknown string codes and nulls junk', () => {
			expect(agencStatusLabel('weird')).toBe('weird');
			expect(agencStatusLabel(99)).toBe(null);
		});
	});
});
