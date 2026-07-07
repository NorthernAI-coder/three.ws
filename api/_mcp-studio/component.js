// three.ws 3D Studio (free) — Apps SDK inline component.
//
// A self-contained HTML/JS widget registered as the MCP resource
// `ui://widget/three-studio-model.html` and linked to every generation tool via
// `_meta["openai/outputTemplate"]`. ChatGPT renders it in a sandboxed iframe and
// exposes the tool's structuredContent on `window.openai.toolOutput`; we render
// the returned GLB with Google's <model-viewer> (loaded from jsdelivr, declared
// in the resource CSP). Every state is designed: loading, ready, empty, error.
//
// Reads structuredContent shape: { glbUrl, viewerUrl, kind, prompt, rigged?,
//   lineage?: [{ index, parentIndex, glbUrl, viewerUrl, label, instruction, active }],
//   activeIndex? }. When a lineage is present (a conversational refinement) the
// widget shows a version strip: click any version to swap it in with a cross-fade
// (a client-side revert view — every version's GLB is already in the lineage).
// No identifiers, no payment, no crypto — only what is needed to show the model.

const MODEL_VIEWER_CDN =
	'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js';

export const COMPONENT_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>three.ws 3D Studio</title>
<script type="module" src="${MODEL_VIEWER_CDN}"></script>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: radial-gradient(120% 120% at 50% 0%, #14161c 0%, #0b0c10 60%, #08090c 100%);
    color: #e8eaf0;
  }
  .wrap { display: flex; flex-direction: column; height: 100%; min-height: 320px; }
  .stage { position: relative; flex: 1 1 auto; min-height: 260px; }
  model-viewer {
    width: 100%; height: 100%;
    --poster-color: transparent;
    --progress-bar-color: #6ea8fe;
    background: transparent;
    transition: opacity .28s ease;
  }
  model-viewer.fading { opacity: 0; }
  @media (prefers-reduced-motion: reduce) { model-viewer { transition: none; } }
  .overlay {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 12px; text-align: center; padding: 24px;
  }
  .spinner {
    width: 34px; height: 34px; border-radius: 50%;
    border: 3px solid rgba(255,255,255,0.14); border-top-color: #6ea8fe;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 2.4s; } }
  .muted { color: #9aa3b2; font-size: 13px; line-height: 1.45; max-width: 36ch; }
  .title { font-size: 14px; font-weight: 600; }
  .bar {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 10px 14px; border-top: 1px solid rgba(255,255,255,0.07);
    background: rgba(10,11,14,0.6); backdrop-filter: blur(6px);
  }
  .prompt {
    flex: 1 1 160px; min-width: 0; font-size: 12.5px; color: #aeb6c4;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .chip {
    font-size: 11px; font-weight: 600; letter-spacing: .02em;
    color: #bcd3ff; background: rgba(110,168,254,0.13);
    border: 1px solid rgba(110,168,254,0.28); border-radius: 999px;
    padding: 3px 9px; text-transform: capitalize;
  }
  .versions {
    display: flex; align-items: center; gap: 6px; overflow-x: auto;
    padding: 8px 12px; border-top: 1px solid rgba(255,255,255,0.07);
    background: rgba(10,11,14,0.5); scrollbar-width: thin;
  }
  .versions::-webkit-scrollbar { height: 6px; }
  .versions::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.14); border-radius: 3px; }
  .vlabel { font-size: 10.5px; font-weight: 600; color: #8b93a3; letter-spacing: .03em; text-transform: uppercase; flex: 0 0 auto; margin-right: 2px; }
  button.vchip {
    appearance: none; cursor: pointer; flex: 0 0 auto;
    font-size: 11.5px; font-weight: 600; color: #cdd4e0;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px; padding: 5px 10px; max-width: 160px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    transition: background .15s, border-color .15s, color .15s, transform .05s;
  }
  button.vchip:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.24); color: #fff; }
  button.vchip:active { transform: translateY(1px); }
  button.vchip:focus-visible { outline: 2px solid #6ea8fe; outline-offset: 2px; }
  button.vchip.active { color: #eaf1ff; background: rgba(110,168,254,0.16); border-color: rgba(110,168,254,0.5); }
  .actions { display: flex; gap: 8px; }
  a.btn, button.btn {
    appearance: none; cursor: pointer; text-decoration: none;
    font-size: 12.5px; font-weight: 600; color: #e8eaf0;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14);
    border-radius: 9px; padding: 7px 12px; transition: background .15s, border-color .15s, transform .05s;
  }
  a.btn:hover, button.btn:hover { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.28); }
  a.btn:active, button.btn:active { transform: translateY(1px); }
  a.btn:focus-visible, button.btn:focus-visible { outline: 2px solid #6ea8fe; outline-offset: 2px; }
  .hidden { display: none !important; }
</style>
</head>
<body>
<div class="wrap">
  <div class="stage">
    <model-viewer id="mv" class="hidden" camera-controls auto-rotate touch-action="pan-y"
      shadow-intensity="1" exposure="1.05" environment-image="neutral"
      ar ar-modes="webxr scene-viewer quick-look" alt="Generated 3D model">
    </model-viewer>

    <div id="loading" class="overlay">
      <div class="spinner" aria-hidden="true"></div>
      <div class="title">Generating your 3D model…</div>
      <div class="muted">Text-to-3D runs on free GPU lanes and usually takes 15–60 seconds.</div>
    </div>

    <div id="empty" class="overlay hidden">
      <div class="title">No model yet</div>
      <div class="muted">Describe an object, character, or creature and the studio will turn it into an interactive 3D model.</div>
    </div>

    <div id="error" class="overlay hidden">
      <div class="title">Couldn't load the model</div>
      <div id="errmsg" class="muted">Something went wrong generating or displaying this model.</div>
    </div>
  </div>

  <div id="versions" class="versions hidden" role="group" aria-label="Model versions"></div>

  <div id="bar" class="bar hidden">
    <span id="kind" class="chip">model</span>
    <span id="prompt" class="prompt"></span>
    <div class="actions">
      <a id="open" class="btn" target="_blank" rel="noopener noreferrer">Open viewer</a>
      <a id="download" class="btn" download>Download GLB</a>
    </div>
  </div>
</div>

<script>
(function () {
  var mv = document.getElementById('mv');
  var loading = document.getElementById('loading');
  var empty = document.getElementById('empty');
  var errEl = document.getElementById('error');
  var errMsg = document.getElementById('errmsg');
  var bar = document.getElementById('bar');
  var promptEl = document.getElementById('prompt');
  var kindEl = document.getElementById('kind');
  var openEl = document.getElementById('open');
  var downloadEl = document.getElementById('download');
  var versionsEl = document.getElementById('versions');

  // Tracks whether the next model-viewer 'load' is a fresh render (show the
  // stage, hide overlays) or a cross-fade swap between versions (just fade in).
  var swapping = false;

  function show(el) { [loading, empty, errEl].forEach(function (n) { n.classList.add('hidden'); }); if (el) el.classList.remove('hidden'); }

  function fail(msg) {
    mv.classList.add('hidden');
    bar.classList.add('hidden');
    versionsEl.classList.add('hidden');
    errMsg.textContent = msg || 'Something went wrong displaying this model.';
    show(errEl);
  }

  function isHttps(u) { return typeof u === 'string' && /^https:\\/\\//.test(u); }

  // Swap the displayed GLB with a cross-fade (no hard pop). Used both for the
  // initial refined result and for clicking an earlier version in the strip.
  function swapTo(glb) {
    if (!isHttps(glb) || mv.getAttribute('src') === glb) return;
    swapping = true;
    mv.classList.add('fading');
    setTimeout(function () { mv.setAttribute('src', glb); }, 200);
  }

  // Build the version strip from a lineage. Each chip swaps its GLB in on click;
  // the active one is highlighted. A single-entry lineage (origin only) is hidden.
  function renderVersions(lineage, activeGlb) {
    versionsEl.textContent = '';
    if (!Array.isArray(lineage) || lineage.length < 2) { versionsEl.classList.add('hidden'); return; }
    var label = document.createElement('span');
    label.className = 'vlabel';
    label.textContent = 'Versions';
    versionsEl.appendChild(label);
    lineage.forEach(function (v) {
      if (!v || !isHttps(v.glbUrl)) return;
      var chip = document.createElement('button');
      chip.className = 'vchip' + (v.glbUrl === activeGlb ? ' active' : '');
      chip.type = 'button';
      var text = v.label || (v.index === 0 ? 'Original' : 'Version ' + v.index);
      chip.textContent = text;
      chip.title = v.instruction ? '“' + v.instruction + '”' : text;
      chip.addEventListener('click', function () {
        for (var i = 0; i < versionsEl.children.length; i++) versionsEl.children[i].classList.remove('active');
        chip.classList.add('active');
        openEl.href = v.viewerUrl || v.glbUrl;
        downloadEl.href = v.glbUrl;
        if (v.instruction) { promptEl.textContent = v.instruction; promptEl.title = v.instruction; }
        swapTo(v.glbUrl);
      });
      versionsEl.appendChild(chip);
    });
    versionsEl.classList.remove('hidden');
  }

  function render(out) {
    if (!out) { mv.classList.add('hidden'); bar.classList.add('hidden'); versionsEl.classList.add('hidden'); show(empty); return; }
    if (out.error || out.message && !out.glbUrl) { fail(out.message || 'Generation did not return a model.'); return; }
    var glb = out.glbUrl;
    if (!isHttps(glb)) { mv.classList.add('hidden'); bar.classList.add('hidden'); versionsEl.classList.add('hidden'); show(empty); return; }

    swapping = false;
    show(loading);
    mv.classList.remove('fading');
    mv.classList.add('hidden');
    mv.setAttribute('src', glb);

    var kind = (out.kind || 'model').replace(/_/g, ' ');
    kindEl.textContent = out.rigged ? 'rigged ' + kind : kind;
    var caption = out.instruction || out.prompt || '';
    if (caption) { promptEl.textContent = caption; promptEl.title = caption; }
    else { promptEl.textContent = ''; }
    openEl.href = out.viewerUrl || glb;
    downloadEl.href = glb;
    bar.classList.remove('hidden');
    renderVersions(out.lineage, glb);
  }

  mv.addEventListener('load', function () {
    if (swapping) { swapping = false; mv.classList.remove('fading'); return; }
    show(null); mv.classList.remove('hidden');
  });
  mv.addEventListener('error', function () { fail('The 3D model could not be displayed. You can still download the GLB file.'); });

  function current() {
    try { return (window.openai && window.openai.toolOutput) || null; } catch (e) { return null; }
  }

  // Initial paint (toolOutput may already be present) + live updates from the host.
  render(current());
  window.addEventListener('openai:set_globals', function () { render(current()); });
  window.addEventListener('message', function (ev) {
    var d = ev && ev.data;
    if (d && d.type === 'openai:set_globals') render(current());
    if (d && d.params && d.params.structuredContent) render(d.params.structuredContent);
  });
})();
</script>
</body>
</html>`;

export const COMPONENT_URI = 'ui://widget/three-studio-model.html';
// Established Apps SDK skybridge MIME for HTML widget resources.
export const COMPONENT_MIME = 'text/html+skybridge';

// CSP for the widget iframe: where it may connect (fetch GLBs) and load resources
// (the model-viewer script + GLB assets). Declared on the resource _meta so the
// ChatGPT host can enforce it.
export const COMPONENT_CSP = {
	connect_domains: [
		'https://three.ws',
		'https://*.three.ws',
		'https://cdn.jsdelivr.net',
		'https://replicate.delivery',
		'https://*.replicate.delivery',
	],
	resource_domains: [
		'https://three.ws',
		'https://*.three.ws',
		'https://cdn.jsdelivr.net',
		'https://replicate.delivery',
		'https://*.replicate.delivery',
	],
};
