import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('http://localhost:3000/', { waitUntil:'load', timeout:30000 }).catch(()=>{});
await p.waitForTimeout(4000);
const info = await p.evaluate(()=>{
  const el = document.querySelector('.hero-stage agent-3d');
  if (!el) return 'no agent-3d';
  const out = { tag: el.tagName, classes: el.className, loaded: el.classList.contains('loaded') };
  const sr = el.shadowRoot;
  if (sr) {
    out.shadow = true;
    // find skeleton-ish elements
    out.shadowChildren = [...sr.children].map(c=>`${c.tagName}.${c.className||''}`);
    const skel = sr.querySelector('.skeleton, [class*=skel], [class*=silhouet], [class*=placeholder]');
    out.skel = skel ? `${skel.tagName}.${skel.className}` : 'none';
    if (skel) {
      const cs = getComputedStyle(skel);
      out.skelStyle = { display: cs.display, opacity: cs.opacity, visibility: cs.visibility };
    }
    const canvas = sr.querySelector('canvas');
    out.hasCanvas = !!canvas;
    if (canvas) { const cs=getComputedStyle(canvas); out.canvasStyle={opacity:cs.opacity, display:cs.display}; }
  } else { out.shadow = false; out.innerHTML = el.innerHTML.slice(0,200); }
  return out;
});
console.log(JSON.stringify(info,null,2));
await b.close();
