// /agent-identities — Agent Identity Studio showcase grid.
//
// Renders the demo identities from data/agent-identities.json (real pipeline
// runs, written by scripts/okx-identity-demo.mjs). Each card: the full-body
// hero shot with the PFP crop pinned on top, thumbnails to switch poses, and
// a lazy "View in 3D" that swaps the image for a <model-viewer> of the rigged
// GLB — heavy 3D loads only on request, never on page load.

import data from '../data/agent-identities.json';

const grid = document.getElementById('identity-grid');

let modelViewerLoaded = false;
function ensureModelViewer() {
	if (modelViewerLoaded) return;
	modelViewerLoaded = true;
	const s = document.createElement('script');
	s.type = 'module';
	s.src = '/model-viewer-meshopt.js';
	document.head.appendChild(s);
}

function el(tag, attrs = {}, children = []) {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (k === 'text') node.textContent = v;
		else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
		else node.setAttribute(k, v);
	}
	for (const c of children) node.appendChild(c);
	return node;
}

function card(identity) {
	const { agentName, kind, brief, result } = identity;

	const stage = el('div', { class: 'ai-stage' });
	if (!result) {
		// Every state designed: an entry without a completed run says so instead
		// of rendering a broken card.
		stage.appendChild(
			el('div', { class: 'ai-pending', text: `${agentName} is still in the studio — check back soon.` }),
		);
	}

	const bodyChildren = [
		el('span', { class: 'ai-kind', text: kind }),
		el('h2', { class: 'ai-name', text: agentName }),
		el('p', { class: 'ai-brief', text: brief }),
	];

	if (result) {
		const hero = el('img', {
			src: result.fullBody[0]?.url || result.pfp.url,
			alt: `${agentName} — full-body 3D render`,
			loading: 'lazy',
		});
		stage.appendChild(hero);
		stage.appendChild(
			el('div', { class: 'ai-pfp' }, [
				el('img', { src: result.pfp.url, alt: `${agentName} profile picture crop`, loading: 'lazy' }),
			]),
		);

		const shots = el('div', { class: 'ai-shots', role: 'group', 'aria-label': `${agentName} poses` });
		for (const shot of result.fullBody) {
			const btn = el(
				'button',
				{
					type: 'button',
					'aria-label': `Show ${shot.pose} pose`,
					'aria-pressed': shot === result.fullBody[0] ? 'true' : 'false',
					onclick: () => {
						hero.src = shot.url;
						const viewer = stage.querySelector('model-viewer');
						if (viewer) {
							viewer.remove();
							hero.style.opacity = '1';
						}
						shots.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
						btn.setAttribute('aria-pressed', 'true');
					},
				},
				[el('img', { src: shot.url, alt: '', loading: 'lazy' })],
			);
			shots.appendChild(btn);
		}
		bodyChildren.push(shots);

		const view3d = el('button', {
			type: 'button',
			text: 'View in 3D',
			onclick: () => {
				ensureModelViewer();
				if (stage.querySelector('model-viewer')) return;
				const viewer = el('model-viewer', {
					src: result.riggedGlbUrl,
					'camera-controls': '',
					'touch-action': 'pan-y',
					'shadow-intensity': '0.6',
					exposure: '1.05',
					alt: `${agentName} rigged 3D avatar`,
				});
				hero.style.opacity = '0';
				stage.appendChild(viewer);
				view3d.textContent = 'Rotate · drag to orbit';
			},
		});
		bodyChildren.push(
			el('div', { class: 'ai-actions' }, [
				view3d,
				el('a', { href: result.viewerUrl, target: '_blank', rel: 'noopener', text: 'Open in viewer' }),
				el('a', { href: result.poseStudioUrl, target: '_blank', rel: 'noopener', text: 'Pose studio' }),
			]),
		);
	}

	return el('article', { class: 'ai-card' }, [stage, el('div', { class: 'ai-body' }, bodyChildren)]);
}

for (const identity of data.identities) grid.appendChild(card(identity));
