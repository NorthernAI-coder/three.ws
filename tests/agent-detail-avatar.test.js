// @vitest-environment jsdom
//
// Regression guard for the hero avatar on every /agents/:id (and /agent/:id)
// detail page. The page markup ships a dedicated <model-viewer id="ad-avatar-3d">
// for the hero plus a hidden flat <img id="ad-avatar"> fallback. Marketplace
// enrichment then upgrades the hero to the agent's own GLB.
//
// A prior revision of render3DAvatar built a *new* <model-viewer>, gave it the
// same `ad-avatar-3d` id, and swapped it in for the <img>. With the dedicated
// hero viewer already present that produced TWO elements sharing one id: a
// second, unsized 240×280 canvas stacked below the avatar wrap, bleeding the
// model over the agent's name on every custom-avatar page. These tests lock the
// invariant that there is always exactly one hero viewer, updated in place.

import { describe, it, expect, beforeEach } from 'vitest';
import { render3DAvatar } from '../src/agent-detail-market.js';

const GLB = 'https://three.ws/cdn/u/abc/draft-x/model.glb';
const THUMB = 'https://three.ws/cdn/thumb/abc.png';

beforeEach(() => {
	document.body.innerHTML = `
		<div class="ad-hero-avatar-wrap" id="ad-avatar-wrap">
			<model-viewer id="ad-avatar-3d" class="ad-hero-avatar" src="/avatars/mannequin.glb"></model-viewer>
			<img class="ad-hero-avatar" id="ad-avatar" alt="" style="display:none" />
		</div>
		<div class="ad-3d-modal hidden" id="ad-3d-modal">
			<model-viewer id="ad-avatar-modal-3d" src="/avatars/mannequin.glb"></model-viewer>
		</div>`;
});

describe('render3DAvatar', () => {
	it('updates the existing hero viewer in place — never duplicates the id', () => {
		render3DAvatar({ name: 'hexagon_dance', avatar_glb_url: GLB, thumbnail_url: THUMB });

		const viewers = document.querySelectorAll('#ad-avatar-3d');
		expect(viewers.length).toBe(1);
		expect(viewers[0].getAttribute('src')).toBe(GLB);
		expect(viewers[0].getAttribute('poster')).toBe(THUMB);
		// The flat fallback stays in the DOM but hidden behind the live model.
		expect(document.getElementById('ad-avatar').style.display).toBe('none');
	});

	it('upgrades the fullscreen modal viewer to the same GLB', () => {
		render3DAvatar({ name: 'hexagon_dance', avatar_glb_url: GLB, thumbnail_url: THUMB });

		const modal = document.getElementById('ad-avatar-modal-3d');
		expect(modal.getAttribute('src')).toBe(GLB);
		expect(modal.getAttribute('alt')).toContain('hexagon_dance');
	});

	it('is idempotent — a second call leaves a single hero viewer', () => {
		render3DAvatar({ name: 'a', avatar_glb_url: GLB });
		render3DAvatar({ name: 'a', avatar_glb_url: GLB });
		expect(document.querySelectorAll('#ad-avatar-3d').length).toBe(1);
		expect(document.querySelectorAll('model-viewer').length).toBe(2); // hero + modal
	});

	it('leaves the mannequin untouched when the agent ships no custom GLB', () => {
		render3DAvatar({ name: 'plain', avatar_glb_url: null });
		const hero = document.getElementById('ad-avatar-3d');
		expect(hero.getAttribute('src')).toBe('/avatars/mannequin.glb');
		expect(document.getElementById('ad-avatar').style.display).toBe('none');
	});
});
