// three.ws — script-tag embed.
// <script async src="https://three.ws/embed.js" data-widget="wdgt_..."></script>
//
// Injects a sandboxed iframe at the script tag's location, sized via data-*
// attributes (or the type's default), then forwards widget:resize events from
// the iframe to keep the host layout snug.
//
// Zero deps, plain DOM. Intentionally tiny — gets minified/cached at the edge.

(function () {
	'use strict';

	var TYPE_SIZES = {
		'turntable':         [600, 600],
		'animation-gallery': [720, 720],
		'talking-agent':     [420, 600],
		'passport':          [480, 560],
		'hotspot-tour':      [800, 600],
	};

	var ORIGIN = (function () {
		try { return new URL(document.currentScript.src).origin; }
		catch (e) { return 'https://three.ws'; }
	})();

	// Single module-level registry: widgetId → iframe element.
	// One delegated message listener handles all embeds on the page — no
	// per-mount listeners that multiply with each <script data-widget>.
	var registry = Object.create(null);

	function onResize(e) {
		if (e.origin !== ORIGIN) return;
		if (!e.data || e.data.type !== 'widget:resize') return;
		var id = e.data.id;
		var iframe = id ? registry[id] : null;
		// If no id given, apply to every registered iframe (legacy broadcast).
		var targets = iframe ? [iframe] : Object.keys(registry).map(function (k) { return registry[k]; });
		targets.forEach(function (f) {
			if (e.data.width)  f.setAttribute('width',  String(e.data.width));
			if (e.data.height) f.setAttribute('height', String(e.data.height));
		});
	}

	window.addEventListener('message', onResize);

	function attr(el, name, fallback) {
		var v = el && el.getAttribute && el.getAttribute(name);
		return v != null && v !== '' ? v : fallback;
	}

	function mount(scriptEl) {
		var widgetId = attr(scriptEl, 'data-widget', null);
		if (!widgetId) {
			console.warn('[3d-agent embed] missing data-widget attribute');
			return;
		}
		var type     = attr(scriptEl, 'data-type', null);
		var defaults = (type && TYPE_SIZES[type]) || [600, 600];
		var width    = attr(scriptEl, 'data-width',  String(defaults[0]));
		var height   = attr(scriptEl, 'data-height', String(defaults[1]));
		var radius   = attr(scriptEl, 'data-radius', '12');
		var border   = attr(scriptEl, 'data-border', '0');

		var src = ORIGIN + '/app#widget=' + encodeURIComponent(widgetId) + '&kiosk=true';

		var iframe = document.createElement('iframe');
		iframe.src = src;
		iframe.title = 'three.ws widget ' + widgetId;
		iframe.allow = 'autoplay; clipboard-write; xr-spatial-tracking';
		iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
		iframe.setAttribute('width',  width);
		iframe.setAttribute('height', height);
		iframe.style.border       = border + 'px solid transparent';
		iframe.style.borderRadius = radius + 'px';
		iframe.style.maxWidth     = '100%';
		iframe.style.display      = 'block';

		// Wrap in a positioned container that holds the skeleton placeholder.
		var wrapper = document.createElement('div');
		wrapper.style.cssText =
			'position:relative;display:inline-block;max-width:100%;' +
			'width:' + width + 'px;height:' + height + 'px;' +
			'border-radius:' + radius + 'px;overflow:hidden;' +
			'background:#0c0c12;';

		var skeleton = document.createElement('div');
		skeleton.setAttribute('aria-hidden', 'true');
		skeleton.style.cssText =
			'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
			'pointer-events:none;transition:opacity 0.3s;';
		skeleton.innerHTML =
			'<div style="width:32px;height:32px;border:2px solid rgba(255,255,255,0.08);' +
			'border-top-color:rgba(255,255,255,0.35);border-radius:50%;' +
			'animation:_3dws_spin 0.8s linear infinite"></div>';

		// Inject the keyframe only once per page.
		if (!document.getElementById('_3dws_embed_css')) {
			var style = document.createElement('style');
			style.id = '_3dws_embed_css';
			style.textContent = '@keyframes _3dws_spin{to{transform:rotate(360deg)}}';
			document.head.appendChild(style);
		}

		iframe.style.position = 'relative';
		iframe.style.zIndex = '1';
		iframe.addEventListener('load', function () {
			skeleton.style.opacity = '0';
			setTimeout(function () { if (skeleton.parentNode) skeleton.parentNode.removeChild(skeleton); }, 350);
		});

		wrapper.appendChild(skeleton);
		wrapper.appendChild(iframe);

		var anchor = scriptEl.parentNode;
		if (!anchor) return;
		anchor.insertBefore(wrapper, scriptEl);

		// Register for the delegated resize listener.
		registry[widgetId] = iframe;

		// Lazy-load via IntersectionObserver when available (Firefox compat).
		// Falls back to immediate load when IO is absent.
		if (typeof IntersectionObserver !== 'undefined') {
			iframe.src = '';
			var io = new IntersectionObserver(function (entries, obs) {
				entries.forEach(function (entry) {
					if (entry.isIntersecting) {
						iframe.src = src;
						obs.disconnect();
					}
				});
			}, { rootMargin: '200px' });
			io.observe(wrapper);
		} else {
			iframe.src = src;
		}
	}

	// Mount every <script data-widget="..."> on the page (allows multiple embeds).
	var current = document.currentScript;
	if (current && current.getAttribute('data-widget')) {
		mount(current);
		return;
	}
	var scripts = document.querySelectorAll('script[data-widget][src*="embed.js"]');
	for (var i = 0; i < scripts.length; i++) mount(scripts[i]);
})();
