// Unit coverage for the pure pieces of autonomous ERC-8004 deployment:
// the manifest builder (what lands on-chain) and the avatar-URL gate (what we
// refuse to publish). The on-chain signing path is exercised through the live
// cron; here we lock the shape the crawler/feed depend on.
import { describe, it, expect } from 'vitest';
import { buildAgentManifest, resolveAvatarUrls } from '../api/_lib/erc8004-publish.js';

describe('buildAgentManifest', () => {
	const agent = { name: 'Nova', description: 'a guide' };
	const urls = { glbUrl: 'https://cdn.three.ws/a.glb', imageUrl: 'https://cdn.three.ws/a.png' };
	const manifest = buildAgentManifest(agent, urls, 'https://three.ws');

	it('carries an avatar service so the crawler marks it has_3d', () => {
		const avatar = manifest.services.find((s) => s.name === 'avatar');
		expect(avatar).toBeTruthy();
		expect(avatar.endpoint).toBe(urls.glbUrl);
	});

	it('points the body at the GLB', () => {
		expect(manifest.body.uri).toBe(urls.glbUrl);
		expect(manifest.body.format).toBe('gltf-binary');
	});

	it('declares x402 support via the registry fields', () => {
		expect(manifest.x402Support).toBe(true);
	});

	it('preserves name, description and image', () => {
		expect(manifest.name).toBe('Nova');
		expect(manifest.description).toBe('a guide');
		expect(manifest.image).toBe(urls.imageUrl);
	});
});

describe('resolveAvatarUrls', () => {
	it('returns null when there is no GLB body', () => {
		expect(resolveAvatarUrls({ glb_key: null, visibility: 'public' })).toBeNull();
	});

	it('refuses private avatars — their GLB 404s for everyone else', () => {
		expect(resolveAvatarUrls({ glb_key: 'k.glb', visibility: 'private' })).toBeNull();
	});

	it('allows public and unlisted bodies', () => {
		expect(resolveAvatarUrls({ glb_key: 'k.glb', visibility: 'public' })).not.toBeNull();
		expect(resolveAvatarUrls({ glb_key: 'k.glb', visibility: 'unlisted' })).not.toBeNull();
	});
});
