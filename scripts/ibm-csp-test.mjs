// Browser verification harness for pages/ibm/x402-demo.html (task 02).
// Serves the page from a NON-three.ws origin, enforces realistic IBM CSP tiers
// via real response headers, and uses Playwright to capture console errors, CSP
// violations, page errors, failed requests, and the full set of network origins.
// Run: node scripts/ibm-csp-test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const IBM_DIR = '/workspaces/three.ws/pages/ibm';
const PORT_HOST = 8088;   // "live.ibm.com" stand-in
const PORT_FOREIGN = 8099; // a second foreign origin that iframes the page
const TEACUP_GLB = 'https://three.ws/cdn/forge/anon/8450dc71-c18c-4620-a369-19afe3d6d2a6.glb';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
};

const oneLine = (s) => s.replace(/\s*\n\s*/g, ' ').trim();

const TIER1 = oneLine(`
  default-src 'none';
  script-src 'self' https://three.ws 'unsafe-inline';
  connect-src https://three.ws;
  style-src 'self' 'unsafe-inline';
  font-src 'self';
  img-src 'self' data:;
  base-uri 'self';
`);

const TIER2 = oneLine(`
  default-src 'none';
  script-src 'self' https://three.ws https://esm.sh 'unsafe-inline';
  connect-src https://three.ws https://assets.three.ws https://esm.sh;
  style-src 'self' 'unsafe-inline';
  font-src 'self';
  img-src 'self' data: blob: https://three.ws https://assets.three.ws;
  media-src 'self' blob: https://three.ws https://assets.three.ws;
  worker-src 'self' blob:;
  frame-src https://three.ws;
  base-uri 'self';
`);

// Base-only trim: drop the 3D-layer sections + their script tags so the strict
// Tier 1 policy has nothing to violate (mirrors the HOSTING.md "remove sections" path).
function trimToBaseOnly(html) {
  let out = html;
  out = out.replace(/<!-- ══ DEMO 01 · FORGE[\s\S]*?<\/section>\s*/i, '');
  out = out.replace(/<!-- ══ THE AGENT ══[\s\S]*?<\/section>\s*/i, '');
  out = out.replace(/<!-- ══ DEMO 04 · PLAY ══[\s\S]*?<\/section>\s*/i, '');
  out = out.replace(/<!-- ══ DEMO 05 · IRL ══[\s\S]*?<\/section>\s*/i, '');
  out = out.replace(/<script type="module" src="\.\/vendor\/model-viewer\.min\.js"><\/script>\s*/i, '');
  out = out.replace(/<script type="module" src="https:\/\/three\.ws\/agent-3d[^"]*"><\/script>\s*/i, '');
  return out;
}

function makeServer(rootDir, getCsp, routes = {}) {
  return http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (routes[url]) {
      const r = routes[url];
      const headers = { 'content-type': r.type || 'text/html; charset=utf-8' };
      const csp = getCsp();
      if (csp) headers['content-security-policy'] = csp;
      res.writeHead(200, headers);
      res.end(r.body());
      return;
    }
    let rel = url === '/' ? '/x402-demo.html' : url;
    const filePath = path.normalize(path.join(rootDir, rel));
    if (!filePath.startsWith(rootDir)) { res.writeHead(403); res.end('forbidden'); return; }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      const headers = { 'content-type': MIME[path.extname(filePath)] || 'application/octet-stream' };
      const csp = getCsp();
      if (csp) headers['content-security-policy'] = csp;
      res.writeHead(200, headers);
      res.end(data);
    });
  });
}

const listen = (srv, port) => new Promise((r) => srv.listen(port, '127.0.0.1', r));
const close = (srv) => new Promise((r) => srv.close(r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function instrument(page) {
  const rec = { console: [], errors: [], failed: [], csp: [], origins: new Set(), requests: [] };
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__csp.push({ directive: e.effectiveDirective || e.violatedDirective, blocked: e.blockedURI });
    });
  });
  page.on('console', (m) => {
    const t = m.text();
    rec.console.push({ type: m.type(), text: t });
    if (/content security policy|refused to (load|connect|execute|apply|frame)/i.test(t)) {
      rec.csp.push(t);
    }
  });
  page.on('pageerror', (e) => rec.errors.push(String(e)));
  page.on('requestfailed', (r) => {
    const f = r.failure();
    // about:blank / intentional aborts are noise; keep real failures
    rec.failed.push({ url: r.url(), err: f && f.errorText });
  });
  page.on('request', (r) => {
    rec.requests.push(r.url());
    try { rec.origins.add(new URL(r.url()).origin); } catch {}
  });
  return rec;
}

async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = Math.max(400, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y <= document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 250));
    }
    window.scrollTo(0, 0);
  });
}

function report(name, rec, { expectClean = true } = {}) {
  const errs = rec.console.filter((c) => c.type === 'error').map((c) => c.text);
  const warns = rec.console.filter((c) => c.type === 'warning').map((c) => c.text);
  // Network failures to three.ws RPC endpoints the agent probes are not page bugs
  // unless they are CSP-blocked; flag only blocked/refused ones distinctly.
  const cspCount = rec.csp.length;
  console.log(`\n──────── ${name} ────────`);
  console.log(`origins touched: ${[...rec.origins].sort().join('  ')}`);
  console.log(`console errors: ${errs.length} | warnings: ${warns.length} | CSP violations: ${cspCount} | pageerrors: ${rec.errors.length}`);
  if (cspCount) { console.log('  CSP VIOLATIONS:'); rec.csp.slice(0, 40).forEach((c) => console.log('   • ' + c.slice(0, 200))); }
  if (errs.length) { console.log('  ERRORS:'); errs.slice(0, 30).forEach((e) => console.log('   • ' + e.slice(0, 200))); }
  if (rec.errors.length) { console.log('  PAGEERRORS:'); rec.errors.slice(0, 20).forEach((e) => console.log('   • ' + e.slice(0, 200))); }
  if (warns.length) { console.log('  WARNINGS:'); warns.slice(0, 15).forEach((w) => console.log('   • ' + w.slice(0, 160))); }
  const blockedFails = rec.failed.filter((f) => /denied|blocked|csp|ERR_BLOCKED/i.test(f.err || ''));
  if (blockedFails.length) { console.log('  BLOCKED REQUESTS:'); blockedFails.forEach((f) => console.log(`   • ${f.url.slice(0, 120)} (${f.err})`)); }
  const clean = cspCount === 0 && errs.length === 0 && rec.errors.length === 0;
  console.log(`  → ${clean ? 'CLEAN ✓' : (expectClean ? 'NOT CLEAN ✗' : 'violations expected/documented')}`);
  return { clean, cspCount, errs, warns };
}

async function main() {
  let cspMode = { value: null };
  const baseHtml = () => fs.readFileSync(path.join(IBM_DIR, 'x402-demo.html'), 'utf8');

  const routes = {
    '/base-only.html': { body: () => trimToBaseOnly(baseHtml()), type: 'text/html; charset=utf-8' },
    '/mv-test.html': {
      type: 'text/html; charset=utf-8',
      body: () => `<!doctype html><meta charset=utf-8><body style="margin:0">
        <script type="module" src="./vendor/model-viewer.min.js"></script>
        <model-viewer id=mv src="${TEACUP_GLB}" style="width:100vw;height:100vh"
          camera-controls environment-image="neutral" exposure="1"></model-viewer>`,
    },
  };

  const host = makeServer(IBM_DIR, () => cspMode.value, routes);
  await listen(host, PORT_HOST);

  // Foreign-origin host that iframes the page (cross-origin: different port).
  const foreign = makeServer(IBM_DIR, () => null, {
    '/wrap.html': {
      type: 'text/html; charset=utf-8',
      body: () => `<!doctype html><meta charset=utf-8><title>foreign host</title>
        <body style="margin:0;font-family:sans-serif">
        <h1 style="padding:12px">Foreign origin embedding the IBM demo in an iframe</h1>
        <iframe src="http://127.0.0.1:${PORT_HOST}/x402-demo.html"
          allow="clipboard-write; payment"
          style="width:100%;height:1200px;border:0"></iframe>`,
    },
  });
  await listen(foreign, PORT_FOREIGN);

  const browser = await chromium.launch();
  const results = {};

  async function run(name, { url, csp, scroll = true, clickPay = false, expectClean = true, postCheck }) {
    cspMode.value = csp;
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const rec = await instrument(page);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await sleep(2500);
      if (scroll) await scrollThrough(page);
      await sleep(3500);
      if (clickPay) {
        await page.click('#payBtn').catch(() => {});
        await sleep(2500);
      }
      if (postCheck) await postCheck(page, rec);
    } catch (e) {
      console.log(`  [goto/runtime error in ${name}] ${String(e).slice(0, 200)}`);
    }
    results[name] = report(name, rec, { expectClean });
    results[name].rec = rec;
    await ctx.close();
  }

  // 1. No CSP — full page, top-level. Captures the full origin set; must be clean.
  await run('1. no-CSP / full page / top-level', { url: `http://127.0.0.1:${PORT_HOST}/x402-demo.html`, csp: null });

  // 2. Tier 2 full CSP — full page, top-level. Must be clean (validates Tier 2).
  await run('2. Tier 2 (full) / full page / top-level', {
    url: `http://127.0.0.1:${PORT_HOST}/x402-demo.html`, csp: TIER2,
    postCheck: async (page, rec) => {
      const mvDefined = await page.evaluate(() => !!customElements.get('model-viewer'));
      const fontReq = rec.requests.some((u) => /\/fonts\/IBMPlex/.test(u));
      const x402 = await page.evaluate(() => !!(window.X402 && typeof window.X402.pay === 'function'));
      console.log(`  checks: model-viewer defined=${mvDefined} | self-host font fetched=${fontReq} | window.X402.pay=${x402}`);
    },
  });

  // 3. Tier 1 strict CSP — Base-only trimmed page. Must be clean + Base modal opens.
  await run('3. Tier 1 (strict) / Base-only page / top-level', {
    url: `http://127.0.0.1:${PORT_HOST}/base-only.html`, csp: TIER1, clickPay: true,
    postCheck: async (page, rec) => {
      const modal = await page.evaluate(() => !!document.querySelector('.x402-overlay'));
      const fontReq = rec.requests.some((u) => /\/fonts\/IBMPlex/.test(u));
      const noGoogle = ![...rec.origins].some((o) => /googleapis|gstatic/.test(o));
      const previewOk = await page.evaluate(() => {
        const l = document.getElementById('pvLabel');
        return l ? l.className.includes('ok') : false;
      });
      console.log(`  checks: pay modal opened=${modal} | 402 preview live=${previewOk} | self-host font=${fontReq} | no google origins=${noGoogle}`);
    },
  });

  // 4. Tier 1 strict CSP — FULL page (informational): proves Base resources don't
  //    violate; the only violations are the 3D layer Tier 1 deliberately omits.
  await run('4. Tier 1 (strict) / FULL page (informational)', {
    url: `http://127.0.0.1:${PORT_HOST}/x402-demo.html`, csp: TIER1, expectClean: false,
  });

  // 5. Tier 2 — embedded in a cross-origin iframe from a foreign host.
  //    Outer wrap.html (foreign server) sends no CSP; the inner page (host server)
  //    is served under Tier 2 because cspMode is set to TIER2 for this run.
  await run('5. Tier 2 / cross-origin iframe', {
    url: `http://127.0.0.1:${PORT_FOREIGN}/wrap.html`, csp: TIER2,
    postCheck: async (page, rec) => {
      // The inner page is served by PORT_HOST; set its CSP to Tier 2 for this run.
      const frames = page.frames().filter((f) => f.url().includes(`:${PORT_HOST}`));
      const innerLoaded = frames.length > 0;
      let innerX402 = false, innerTitle = '';
      if (innerLoaded) {
        try { innerX402 = await frames[0].evaluate(() => !!(window.X402 && window.X402.pay)); } catch {}
        try { innerTitle = await frames[0].evaluate(() => document.title); } catch {}
      }
      const xfoBlocked = rec.csp.some((c) => /frame-ancestors|X-Frame-Options/i.test(c)) ||
        rec.console.some((c) => /refused to (display|frame)|X-Frame-Options/i.test(c.text));
      console.log(`  checks: inner frame present=${innerLoaded} | inner title="${innerTitle}" | inner X402.pay=${innerX402} | XFO/frame-ancestors block=${xfoBlocked}`);
    },
  });
  // For scenario 5, set inner CSP to Tier 2 (the iframe page is served by host server).
  // (cspMode applies to host server responses incl. the iframe doc.)

  // 6. model-viewer GLB probe — Tier 2, must render the real Forge GLB with NO gstatic.
  await run('6. model-viewer GLB probe (Tier 2)', {
    url: `http://127.0.0.1:${PORT_HOST}/mv-test.html`, csp: TIER2, scroll: false,
    postCheck: async (page, rec) => {
      await sleep(4000);
      const loaded = await page.evaluate(() => {
        const mv = document.getElementById('mv');
        return mv && mv.loaded === true;
      });
      const hitGoogle = [...rec.origins].some((o) => /googleapis|gstatic/.test(o));
      const glbReq = rec.requests.some((u) => u.includes('/cdn/forge/'));
      console.log(`  checks: model-viewer.loaded=${loaded} | fetched GLB=${glbReq} | hit google CDN=${hitGoogle}`);
    },
  });

  await browser.close();
  await close(host); await close(foreign);

  console.log('\n════════ SUMMARY ════════');
  for (const [name, r] of Object.entries(results)) {
    console.log(`${r.clean ? 'CLEAN ✓' : (name.includes('informational') ? 'documented' : 'CHECK ✗')}  ${name}  (csp=${r.cspCount}, err=${r.errs.length})`);
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
