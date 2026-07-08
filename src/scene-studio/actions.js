// Scene Studio — layered quality-of-life action bar.
//
// Sibling to the vendored r184 editor (src/scene-studio/vendor/**) — never
// edits vendor files, only reads `editor` and mounts its own DOM/CSS. Adds
// three affordances the vendored File/Export menus don't offer on their own:
//
//   • Import from Forge — paste the GLB URL from a Forge (or Parts Studio)
//     result and drop it straight into the scene, using the same undo-able
//     AddObjectCommand path the ?model= deep-link importer uses.
//   • Export presets    — one click for "Web GLB" or "AR bundle (USDZ)",
//     instead of hovering File ▸ Export ▸ GLB/USDZ in the vendored menu.
//   • Share / Embed      — uploads the current scene as a GLB and opens the
//     platform's existing "Embed this model" panel (iframe / web component /
//     <agent-3d> snippet) — the same modal Forge results use.

import { addGltfBufferToScene } from './loader.js';
import { showEmbedPanel } from '../forge-embed-panel.js';

const STYLE_ID = 'tws-studio-actions-styles';

function ensureStyles() {
	if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
	const el = document.createElement('style');
	el.id = STYLE_ID;
	el.textContent = CSS;
	document.head.appendChild(el);
}

function getAnimations(scene) {
	const animations = [];
	scene.traverse((object) => animations.push(...object.animations));
	return animations;
}

function saveArrayBuffer(buffer, filename) {
	const blob = new Blob([buffer], { type: 'application/octet-stream' });
	downloadBlob(blob, filename);
}

function downloadBlob(blob, filename) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// Same GLB export shape as the vendored File ▸ Export ▸ GLB menu item —
// binary, with cloned+optimized animation clips.
async function exportSceneGlb(editor) {
	const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
	const scene = editor.scene;
	const animations = getAnimations(scene).map((clip) => clip.clone().optimize());
	const exporter = new GLTFExporter();
	return new Promise((resolve, reject) => {
		// binary: true always resolves an ArrayBuffer (the GLB container),
		// never the plain-JSON glTF shape — matches the vendored File ▸
		// Export ▸ GLB menu item exactly.
		exporter.parse(scene, resolve, reject, { binary: true, animations });
	});
}

async function exportSceneUsdz(editor) {
	const { USDZExporter } = await import('three/addons/exporters/USDZExporter.js');
	const exporter = new USDZExporter();
	return exporter.parseAsync(editor.scene);
}

async function importFromForge(editor) {
	const url = window.prompt(
		'Paste the GLB URL from a Forge result (its "Copy share link" or Download link).',
	);
	if (!url) return;
	const trimmed = url.trim();
	if (!/^https:\/\//i.test(trimmed)) {
		alert('That doesn\'t look like an https URL. Copy the GLB link from Forge\'s result bar and try again.');
		return;
	}
	try {
		const res = await fetch(trimmed);
		if (!res.ok) throw new Error('HTTP ' + res.status);
		const contents = await res.arrayBuffer();
		const base = decodeURIComponent(trimmed.split('?')[0].split('/').pop() || '');
		const label = (base.replace(/\.(glb|gltf)$/i, '') || 'Forge model').slice(0, 64);
		await addGltfBufferToScene(editor, contents, label);
	} catch (error) {
		alert('Could not import that model (' + error.message + '). You can drag the GLB file into the editor instead.');
	}
}

function closeMenu(menu) {
	menu?.remove();
}

function showExportMenu(editor, anchorBtn) {
	document.querySelector('.tws-sa-menu')?.remove();
	const menu = document.createElement('div');
	menu.className = 'tws-sa-menu';
	menu.setAttribute('role', 'menu');
	menu.innerHTML = `
		<button type="button" role="menuitem" data-preset="glb">Web GLB <span>.glb — orbit-ready, compressed</span></button>
		<button type="button" role="menuitem" data-preset="usdz">AR bundle <span>.usdz — iOS Quick Look</span></button>
	`;
	document.body.appendChild(menu);
	const rect = anchorBtn.getBoundingClientRect();
	menu.style.left = `${Math.max(8, rect.right - menu.offsetWidth)}px`;
	menu.style.top = `${rect.top - menu.offsetHeight - 8}px`;

	const onDocClick = (e) => {
		if (!menu.contains(e.target) && e.target !== anchorBtn) {
			closeMenu(menu);
			document.removeEventListener('click', onDocClick, true);
		}
	};
	setTimeout(() => document.addEventListener('click', onDocClick, true), 0);

	menu.addEventListener('click', async (e) => {
		const btn = e.target.closest('[data-preset]');
		if (!btn) return;
		closeMenu(menu);
		document.removeEventListener('click', onDocClick, true);
		try {
			if (btn.dataset.preset === 'glb') {
				saveArrayBuffer(await exportSceneGlb(editor), 'scene.glb');
			} else {
				saveArrayBuffer(await exportSceneUsdz(editor), 'scene.usdz');
			}
		} catch (error) {
			alert('Export failed: ' + (error?.message || error));
		}
	});
}

async function shareScene(editor, triggerBtn) {
	const original = triggerBtn.textContent;
	triggerBtn.disabled = true;
	triggerBtn.textContent = 'Exporting…';
	try {
		const buffer = await exportSceneGlb(editor);
		const blob = new Blob([buffer], { type: 'model/gltf-binary' });

		triggerBtn.textContent = 'Uploading…';
		const presignRes = await fetch('/api/scene-glb-upload', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ content_type: 'model/gltf-binary', size_bytes: blob.size }),
		});
		const presign = await presignRes.json().catch(() => null);
		if (!presignRes.ok || !presign?.upload_url) {
			throw new Error(presign?.message || `Upload not available (HTTP ${presignRes.status})`);
		}

		const putRes = await fetch(presign.upload_url, {
			method: presign.method || 'PUT',
			headers: presign.headers || { 'content-type': 'model/gltf-binary' },
			body: blob,
		});
		if (!putRes.ok) throw new Error(`Upload failed (HTTP ${putRes.status})`);

		const title = document.title.replace(/\s*·\s*Scene Studio.*$/i, '').trim() || 'Scene composed on three.ws';
		showEmbedPanel({ glbUrl: presign.public_url, title }, triggerBtn);
	} catch (error) {
		alert('Could not share this scene: ' + (error?.message || error));
	} finally {
		triggerBtn.disabled = false;
		triggerBtn.textContent = original;
	}
}

/**
 * Mount the action bar into the Scene Studio container.
 * @param {import('./vendor/js/Editor.js').Editor} editor
 * @param {HTMLElement} container
 */
export function mountStudioActions(editor, container) {
	ensureStyles();
	const bar = document.createElement('div');
	bar.className = 'tws-sa-bar';
	bar.setAttribute('role', 'toolbar');
	bar.setAttribute('aria-label', 'Scene Studio quick actions');
	bar.innerHTML = `
		<button type="button" class="tws-sa-btn" data-action="import" aria-label="Import a model from Forge">⤵ Import from Forge</button>
		<button type="button" class="tws-sa-btn" data-action="export" aria-label="Export presets">⇩ Export</button>
		<button type="button" class="tws-sa-btn tws-sa-primary" data-action="share" aria-label="Share or embed this scene">🔗 Share</button>
	`;
	container.appendChild(bar);

	bar.addEventListener('click', (e) => {
		const btn = e.target.closest('.tws-sa-btn');
		if (!btn) return;
		if (btn.dataset.action === 'import') importFromForge(editor);
		else if (btn.dataset.action === 'export') showExportMenu(editor, btn);
		else if (btn.dataset.action === 'share') shareScene(editor, btn);
	});

	return bar;
}

const CSS = `
.tws-sa-bar {
	/* Clears the vendored #menubar row (fixed 36px tall — see
	   src/scene-studio/vendor/css/main.css, also the reference #player/#viewport
	   use for their own top offset) at every breakpoint we support (320/768/1440),
	   so this bar never sits on top of File/Edit/Add/View/Render/Help. */
	position: absolute; top: 44px; right: 12px; z-index: 10;
	display: flex; gap: 6px;
	font: 600 12px/1 system-ui, -apple-system, sans-serif;
}
.tws-sa-btn {
	appearance: none; cursor: pointer; white-space: nowrap;
	border: 1px solid rgba(255,255,255,0.16); border-radius: 8px;
	padding: 7px 11px; background: rgba(20,20,24,0.82); color: #e8e8ec;
	backdrop-filter: blur(6px);
	transition: background 0.14s, border-color 0.14s, transform 0.08s;
}
.tws-sa-btn:hover { background: rgba(34,34,40,0.92); border-color: rgba(255,255,255,0.3); }
.tws-sa-btn:active { transform: translateY(1px); }
.tws-sa-btn:focus-visible { outline: 2px solid #6ee7b7; outline-offset: 2px; }
.tws-sa-btn:disabled { opacity: 0.6; cursor: default; }
.tws-sa-btn.tws-sa-primary { background: #e8e8ec; color: #0a0a0f; border-color: transparent; }
.tws-sa-btn.tws-sa-primary:hover { background: #ffffff; }
.tws-sa-menu {
	position: fixed; z-index: 1000;
	display: flex; flex-direction: column; gap: 2px;
	background: rgba(18,18,22,0.98); border: 1px solid rgba(255,255,255,0.14);
	border-radius: 10px; padding: 6px; min-width: 220px;
	box-shadow: 0 12px 32px rgba(0,0,0,0.45);
	font: 600 12.5px/1.3 system-ui, sans-serif;
}
.tws-sa-menu button {
	appearance: none; cursor: pointer; text-align: left;
	border: 0; border-radius: 7px; padding: 8px 10px;
	background: transparent; color: #e8e8ec;
}
.tws-sa-menu button:hover, .tws-sa-menu button:focus-visible { background: rgba(255,255,255,0.08); outline: none; }
.tws-sa-menu button span { display: block; margin-top: 2px; font-weight: 400; font-size: 11px; color: #9a9aa8; }
@media (prefers-reduced-motion: reduce) { .tws-sa-btn { transition: none; } }
/* Narrow viewports: stay pinned top-right (never bottom — that corner is
   reserved for the site-wide "Getting started" launcher pill on every page,
   see public/getting-started.js) and shrink to fit under the vendor menubar. */
@media (max-width: 640px) {
	.tws-sa-bar { flex-wrap: wrap; justify-content: flex-end; max-width: calc(100% - 16px); }
	.tws-sa-btn { font-size: 11px; padding: 6px 8px; }
}
`;
