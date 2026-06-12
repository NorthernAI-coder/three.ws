// Scene Studio boot — mounts the vendored three.js editor (r184, MIT, see
// vendor/LICENSE) into the #studio-app container under the three.ws site nav.
// Ported from editor/index.html upstream; local changes: container mount
// instead of document.body, no service worker, three.ws chrome overrides.

import './vendor/css/main.css';
import './studio.css';

// Dark-locked surface: the injected site theme boot honors the user's saved
// theme, but the studio chrome (vendor css + studio.css) only ships dark.
document.documentElement.setAttribute('data-theme', 'dark');

import * as THREE from 'three';

import { Editor } from './vendor/js/Editor.js';
import { Viewport } from './vendor/js/Viewport.js';
import { Toolbar } from './vendor/js/Toolbar.js';
import { Script } from './vendor/js/Script.js';
import { Player } from './vendor/js/Player.js';
import { Sidebar } from './vendor/js/Sidebar.js';
import { Menubar } from './vendor/js/Menubar.js';
import { Resizer } from './vendor/js/Resizer.js';
import { AnimationResizer } from './vendor/js/AnimationResizer.js';
import { Animation } from './vendor/js/Animation.js';

import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

window.URL = window.URL || window.webkitURL;
window.BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder;

const container = document.getElementById('studio-app');

const editor = new Editor();

window.editor = editor; // Expose editor to Console
window.THREE = THREE; // Expose THREE to APP Scripts and Console

THREE.ObjectLoader.registerGeometry('TextGeometry', TextGeometry);

const viewport = new Viewport(editor);
container.appendChild(viewport.dom);

const toolbar = new Toolbar(editor);
container.appendChild(toolbar.dom);

const script = new Script(editor);
container.appendChild(script.dom);

const player = new Player(editor);
container.appendChild(player.dom);

const sidebar = new Sidebar(editor);
container.appendChild(sidebar.dom);

const menubar = new Menubar(editor);
container.appendChild(menubar.dom);

const resizer = new Resizer(editor);
container.appendChild(resizer.dom);

const animation = new Animation(editor);
container.appendChild(animation.dom);

const animationResizer = new AnimationResizer(editor);
container.appendChild(animationResizer.dom);

editor.signals.animationPanelChanged.add(function (height) {
	const visible = height !== false;

	viewport.dom.classList.toggle('with-animation', visible);
	toolbar.dom.classList.toggle('with-animation', visible);

	if (visible) {
		viewport.dom.style.bottom = height + 'px';
		toolbar.dom.style.bottom = height + 20 + 'px';
	} else {
		viewport.dom.style.bottom = '';
		toolbar.dom.style.bottom = '';
	}

	editor.signals.windowResize.dispatch();
});

//

editor.storage.init(function () {
	editor.storage.get(async function (state) {
		if (isLoadingFromHash) return;

		if (state !== undefined) {
			await editor.fromJSON(state);
		} else {
			editor.signals.sceneEnvironmentChanged.dispatch('Default');
		}

		const selected = editor.config.getKey('selected');

		if (selected !== undefined) {
			editor.selectByUuid(selected);
		}
	});

	//

	let timeout;

	function saveState() {
		if (editor.config.getKey('autosave') === false) {
			return;
		}

		clearTimeout(timeout);

		timeout = setTimeout(function () {
			editor.signals.savingStarted.dispatch();

			timeout = setTimeout(function () {
				editor.storage.set(editor.toJSON());

				editor.signals.savingFinished.dispatch();
			}, 100);
		}, 1000);
	}

	const signals = editor.signals;

	signals.geometryChanged.add(saveState);
	signals.objectAdded.add(saveState);
	signals.objectChanged.add(saveState);
	signals.objectRemoved.add(saveState);
	signals.materialChanged.add(saveState);
	signals.sceneBackgroundChanged.add(saveState);
	signals.sceneEnvironmentChanged.add(saveState);
	signals.sceneFogChanged.add(saveState);
	signals.sceneGraphChanged.add(saveState);
	signals.scriptChanged.add(saveState);
	signals.historyChanged.add(saveState);
});

//

document.addEventListener('dragover', function (event) {
	event.preventDefault();
	event.dataTransfer.dropEffect = 'copy';
});

document.addEventListener('drop', function (event) {
	event.preventDefault();

	if (event.dataTransfer.types[0] === 'text/plain') return; // Outliner drop

	if (event.dataTransfer.items) {
		// DataTransferItemList supports folders
		editor.loader.loadItemList(event.dataTransfer.items);
	} else {
		editor.loader.loadFiles(event.dataTransfer.files);
	}
});

function onWindowResize() {
	editor.signals.windowResize.dispatch();
}

window.addEventListener('resize', onWindowResize);

onWindowResize();

//

let isLoadingFromHash = false;
const hash = window.location.hash;

if (hash.slice(1, 6) === 'file=') {
	const file = hash.slice(6);

	if (confirm(editor.strings.getKey('prompt/file/open'))) {
		const loader = new THREE.FileLoader();
		loader.crossOrigin = '';
		loader.load(file, function (text) {
			editor.clear();
			editor.fromJSON(JSON.parse(text));
		});

		isLoadingFromHash = true;
	}
}
