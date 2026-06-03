// Agent-to-agent x402 trade demo — Three.js scene + SSE consumer.
// Two 3D avatars (Nexus buyer, Oracle seller) face each other on glowing
// platforms. A particle beam fires when SOL moves on-chain; each step of
// the x402 protocol animates in real time.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ── Constants ──────────────────────────────────────────────────────────────
const BUYER_COL  = new THREE.Color(0x4589ff); // IBM blue
const SELLER_COL = new THREE.Color(0xf1c21b); // IBM gold
const BUYER_POS  = new THREE.Vector3(-3.4, 0, 0);
const SELLER_POS = new THREE.Vector3( 3.4, 0, 0);
const BEAM_N  = 350; // beam particles
const BURST_N = 90;  // confirmation burst particles
const AVATAR_GLB = '/avatars/default.glb';

// ── Renderer ───────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = false;

// ── Scene ──────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05050e);
scene.fog = new THREE.FogExp2(0x05050e, 0.038);

// ── Camera ─────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2.9, 9.8);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.1, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 4;
controls.maxDistance = 20;
controls.maxPolarAngle = Math.PI * 0.68;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;
controls.update();

// ── Lights ─────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0x10102a, 4));

const buyerLight = new THREE.PointLight(BUYER_COL, 10, 9);
buyerLight.position.set(BUYER_POS.x, 2.5, 1.2);
scene.add(buyerLight);

const sellerLight = new THREE.PointLight(SELLER_COL, 10, 9);
sellerLight.position.set(SELLER_POS.x, 2.5, 1.2);
scene.add(sellerLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
keyLight.position.set(2, 6, 3);
scene.add(keyLight);

// ── Floor ──────────────────────────────────────────────────────────────────
const grid = new THREE.GridHelper(32, 32, 0x1a1a4e, 0x0c0c24);
grid.position.y = 0.001;
scene.add(grid);

const floorGeo = new THREE.PlaneGeometry(32, 32);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x050510, roughness: 1, metalness: 0 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// ── Platforms ──────────────────────────────────────────────────────────────
function makePlatform(worldPos, col) {
  const g = new THREE.Group();

  const discGeo = new THREE.CylinderGeometry(1.15, 1.35, 0.09, 48);
  const discMat = new THREE.MeshStandardMaterial({
    color: 0x0d0d1c, emissive: col, emissiveIntensity: 0.2,
    roughness: 0.3, metalness: 0.8,
  });
  g.add(new THREE.Mesh(discGeo, discMat));

  const ringGeo = new THREE.TorusGeometry(1.15, 0.028, 8, 64);
  const ringMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.8 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.045;
  g.add(ring);

  g.position.copy(worldPos);
  scene.add(g);
  return { group: g, ring };
}

const buyerPlatform  = makePlatform(BUYER_POS,  BUYER_COL);
const sellerPlatform = makePlatform(SELLER_POS, SELLER_COL);

// ── Background stars ────────────────────────────────────────────────────────
{
  const N = 1400;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    const r  = 42 + Math.random() * 8;
    pos[i * 3]     = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
    pos[i * 3 + 2] = r * Math.cos(ph);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.07, transparent: true, opacity: 0.65 })));
}

// ── Avatar loading ──────────────────────────────────────────────────────────
const gltfLoader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
gltfLoader.setDRACOLoader(draco);

// Label tracking positions (above each avatar's head)
const labelPos = {
  buyer:  BUYER_POS.clone().add(new THREE.Vector3(0, 2.1, 0)),
  seller: SELLER_POS.clone().add(new THREE.Vector3(0, 2.1, 0)),
};

let buyerMesh = null;
let sellerMesh = null;

function applyTint(gltfScene, col) {
  gltfScene.traverse((child) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    const tinted = mats.map((m) => {
      const n = m.clone();
      n.color.multiplyScalar(0.65).addScaledVector(col, 0.38);
      n.emissive = col.clone().multiplyScalar(0.07);
      n.emissiveIntensity = 1;
      return n;
    });
    child.material = tinted.length === 1 ? tinted[0] : tinted;
  });
}

function makeFallbackFigure(col) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.12, roughness: 0.6, metalness: 0.3 });
  g.add(Object.assign(new THREE.Mesh(new THREE.CapsuleGeometry(0.31, 1.0, 8, 16), bodyMat)));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 16), bodyMat.clone());
  head.position.y = 1.05;
  g.add(head);
  return g;
}

function loadAvatar(worldPos, col, yaw, onLoaded) {
  gltfLoader.load(AVATAR_GLB, (gltf) => {
    const s = gltf.scene.clone(true);
    applyTint(s, col);
    s.position.copy(worldPos);
    s.rotation.y = yaw;
    scene.add(s);
    const box = new THREE.Box3().setFromObject(s);
    onLoaded(s, new THREE.Vector3(worldPos.x, box.max.y + 0.18, worldPos.z));
  }, undefined, () => {
    // GLB failed (CORS in dev? missing file?) — use stylised capsule
    const s = makeFallbackFigure(col);
    s.position.copy(worldPos);
    s.rotation.y = yaw;
    scene.add(s);
    onLoaded(s, new THREE.Vector3(worldPos.x, 2.15, worldPos.z));
  });
}

loadAvatar(BUYER_POS,  BUYER_COL,  0.12, (m, top) => { buyerMesh  = m; labelPos.buyer  = top; });
loadAvatar(SELLER_POS, SELLER_COL, -0.12, (m, top) => { sellerMesh = m; labelPos.seller = top; });

// ── Payment beam ────────────────────────────────────────────────────────────
const beamPhases = new Float32Array(BEAM_N).map(() => Math.random());
const beamSpeeds = new Float32Array(BEAM_N).map(() => 0.28 + Math.random() * 0.55);
const beamPos    = new Float32Array(BEAM_N * 3);

const beamGeo = new THREE.BufferGeometry();
beamGeo.setAttribute('position', new THREE.BufferAttribute(beamPos, 3));
const beamMat = new THREE.PointsMaterial({
  color: 0x4589ff, size: 0.065, transparent: true, opacity: 0,
  blending: THREE.AdditiveBlending, depthWrite: false,
});
scene.add(new THREE.Points(beamGeo, beamMat));

let beamActive = false;

function startBeam() {
  beamActive = true;
  beamMat.opacity = 0.92;
}

// ── Confirmation burst ──────────────────────────────────────────────────────
const burstPos  = new Float32Array(BURST_N * 3);
const burstVels = new Float32Array(BURST_N * 3);
const burstGeo  = new THREE.BufferGeometry();
burstGeo.setAttribute('position', new THREE.BufferAttribute(burstPos, 3));
const burstMat = new THREE.PointsMaterial({
  color: 0x42be65, size: 0.1, transparent: true, opacity: 0,
  blending: THREE.AdditiveBlending, depthWrite: false,
});
scene.add(new THREE.Points(burstGeo, burstMat));

let burstLife = 0;

function triggerBurst() {
  beamActive = false;
  const s = SELLER_POS;
  for (let i = 0; i < BURST_N; i++) {
    burstPos[i * 3]     = s.x + (Math.random() - 0.5) * 0.3;
    burstPos[i * 3 + 1] = s.y + 0.95 + Math.random() * 0.4;
    burstPos[i * 3 + 2] = s.z + (Math.random() - 0.5) * 0.3;
    const th = Math.random() * Math.PI * 2;
    const spd = 1.2 + Math.random() * 2.2;
    burstVels[i * 3]     = Math.cos(th) * spd;
    burstVels[i * 3 + 1] = (0.5 + Math.random()) * spd;
    burstVels[i * 3 + 2] = Math.sin(th) * spd * 0.5;
  }
  burstGeo.attributes.position.needsUpdate = true;
  burstMat.opacity = 1;
  burstLife = 1.2;
}

// ── DOM references ──────────────────────────────────────────────────────────
const els = {
  buyerLabel:   document.getElementById('buyerLabel'),
  sellerLabel:  document.getElementById('sellerLabel'),
  buyerAddr:    document.getElementById('buyerAddr'),
  sellerAddr:   document.getElementById('sellerAddr'),
  buyerBal:     document.getElementById('buyerBal'),
  buyerBubble:  document.getElementById('buyerBubble'),
  sellerBubble: document.getElementById('sellerBubble'),
  centralCard:  document.getElementById('centralCard'),
  stepLog:      document.getElementById('stepLog'),
  startBtn:     document.getElementById('startBtn'),
  topicSelect:  document.getElementById('topicSelect'),
  networkBadge: document.getElementById('networkBadge'),
  notConfigured:document.getElementById('notConfigured'),
  toast:        document.getElementById('toast'),
  cfgClose:     document.getElementById('cfgClose'),
};

els.cfgClose.addEventListener('click', () => els.notConfigured.classList.add('hidden'));

// ── Label & bubble positioning ──────────────────────────────────────────────
function project(v3) {
  const v = v3.clone().project(camera);
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
}

function placeEl(el, worldPos, xOffset = 0, yOffset = 0) {
  const p = project(worldPos);
  el.style.left      = `${p.x + xOffset}px`;
  el.style.top       = `${p.y + yOffset}px`;
  el.style.transform = 'translate(-50%, -100%)';
}

function updateOverlays() {
  placeEl(els.buyerLabel,  labelPos.buyer,  0, -8);
  placeEl(els.sellerLabel, labelPos.seller, 0, -8);

  if (!els.buyerBubble.classList.contains('hidden')) {
    const bp = labelPos.buyer.clone().add(new THREE.Vector3(0, 0.55, 0));
    placeEl(els.buyerBubble, bp, 0, -4);
  }
  if (!els.sellerBubble.classList.contains('hidden')) {
    const sp = labelPos.seller.clone().add(new THREE.Vector3(0, 0.55, 0));
    placeEl(els.sellerBubble, sp, 0, -4);
  }
}

// ── Bubble helpers ──────────────────────────────────────────────────────────
function showBubble(side, text) {
  const el = side === 'buyer' ? els.buyerBubble : els.sellerBubble;
  el.textContent = text;
  el.classList.remove('hidden');
}
function hideBubble(side) {
  const el = side === 'buyer' ? els.buyerBubble : els.sellerBubble;
  el.classList.add('hidden');
}

// ── Central card ────────────────────────────────────────────────────────────
function showCard(html) {
  els.centralCard.innerHTML = html;
  els.centralCard.classList.remove('hidden');
}
function hideCard() { els.centralCard.classList.add('hidden'); }

// ── Step log ─────────────────────────────────────────────────────────────────
const STEP_NAMES = ['init', 'request', 'challenged', 'paying', 'confirmed', 'delivering', 'delivered'];
const chips = {};

function buildStepLog() {
  els.stepLog.innerHTML = '';
  STEP_NAMES.forEach((s) => {
    const c = document.createElement('div');
    c.className = 'step-chip';
    c.textContent = s;
    els.stepLog.appendChild(c);
    chips[s] = c;
  });
}

function setChip(name, state) {
  const c = chips[name];
  if (!c) return;
  c.classList.remove('active', 'done', 'error');
  if (state) c.classList.add(state);
}

// ── Toast ────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 5000);
}

// ── Camera animation ─────────────────────────────────────────────────────────
const camAnim = { active: false, t: 0, dur: 0, fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(), fromTgt: new THREE.Vector3(), toTgt: new THREE.Vector3() };

function flyCamera(toPos, toTgt, dur = 1100) {
  camAnim.fromPos.copy(camera.position);
  camAnim.toPos.copy(toPos);
  camAnim.fromTgt.copy(controls.target);
  camAnim.toTgt.copy(toTgt);
  camAnim.t = 0;
  camAnim.dur = dur;
  camAnim.active = true;
}

// ── SSE event handling ────────────────────────────────────────────────────────
function setRunning(on) {
  els.startBtn.disabled     = on;
  els.topicSelect.disabled  = on;
  els.startBtn.textContent  = on ? '⏳ Running…' : '▶ Run Trade Demo';
  if (!on) controls.autoRotate = true;
}

function fmt(addr) {
  return addr ? addr.slice(0, 4) + '…' + addr.slice(-4) : '—';
}

function handleEvent(ev) {
  switch (ev.type) {
    case 'init': {
      setChip('init', 'done');
      if (ev.buyer?.address) {
        els.buyerAddr.textContent = fmt(ev.buyer.address);
        if (ev.buyer.sol != null) {
          const usd = ev.buyer.usd != null ? ` ($${ev.buyer.usd})` : '';
          els.buyerBal.textContent = ev.buyer.sol.toFixed(4) + ' SOL' + usd;
          els.buyerBal.style.color = 'var(--green)';
        }
      }
      if (ev.seller?.address) els.sellerAddr.textContent = fmt(ev.seller.address);
      if (ev.network) els.networkBadge.textContent = ev.network;
      controls.autoRotate = false;
      flyCamera(new THREE.Vector3(0, 2.6, 8.8), new THREE.Vector3(0, 1.1, 0), 1200);
      break;
    }

    case 'request': {
      setChip('request', 'active');
      showBubble('buyer', `"${ev.message || 'I need a market analysis…'}"`);
      setTimeout(() => setChip('request', 'done'), 900);
      break;
    }

    case 'challenged': {
      setChip('request', 'done');
      setChip('challenged', 'active');
      hideBubble('buyer');
      const m = ev.manifest || {};
      const price = m.price || {};
      const usdStr = price.usd != null ? ` ≈ $${price.usd}` : '';
      showBubble('seller', `402 — ${price.sol} SOL required`);
      showCard(`
        <div class="c-badge c-badge-402">⟶ 402 Payment Required</div>
        <div class="c-label">x402 Protocol · oracle-market-analysis</div>
        <div class="c-price blue">${price.sol ?? '?'} SOL${usdStr}</div>
        <div class="c-row">Recipient <span>${fmt(m.recipient)}</span></div>
        <div class="c-row">Network   <span>${m.network || '—'}</span></div>
        <div class="c-row">Memo      <span>${m.memo || '—'}</span></div>
        <div class="c-row">Currency  <span>${m.currency || 'SOL'}</span></div>
      `);
      setTimeout(() => setChip('challenged', 'done'), 700);
      break;
    }

    case 'paying': {
      setChip('paying', 'active');
      hideBubble('seller');
      hideCard();
      showBubble('buyer', `Sending ${ev.sol} SOL on-chain…`);
      startBeam();
      // Fly camera to watch the beam from a low angle
      flyCamera(new THREE.Vector3(0, 1.6, 7.2), new THREE.Vector3(0, 0.9, 0), 950);
      break;
    }

    case 'confirmed': {
      setChip('paying', 'done');
      setChip('confirmed', 'active');
      triggerBurst();
      hideBubble('buyer');
      setTimeout(() => showBubble('seller', 'Payment confirmed ✓'), 350);
      if (ev.newBuyerSol != null) {
        els.buyerBal.textContent = ev.newBuyerSol.toFixed(4) + ' SOL';
        els.buyerBal.style.color = 'var(--muted)';
      }
      const sigShort = ev.signature ? ev.signature.slice(0, 8) + '…' + ev.signature.slice(-6) : '';
      const usdStr = ev.usd != null ? ` ≈ $${ev.usd}` : '';
      showCard(`
        <div class="c-badge c-badge-ok">✓ Transaction Confirmed</div>
        <div class="c-label">On-Chain · ${ev.sol} SOL${usdStr}</div>
        <div class="c-price green">${ev.sol} SOL</div>
        <div class="c-row">Signature <span>${sigShort}</span></div>
        <div class="c-row">Network   <span>${ev.network || 'solana'}</span></div>
        ${ev.explorer ? `<a class="c-link" href="${ev.explorer}" target="_blank" rel="noopener">View on Solscan →</a>` : ''}
      `);
      setTimeout(() => setChip('confirmed', 'done'), 800);
      break;
    }

    case 'delivering': {
      setChip('delivering', 'active');
      setTimeout(() => {
        hideBubble('seller');
        showBubble('seller', `Analyzing with ${ev.model}…`);
        hideCard();
      }, 200);
      // Fly back to a wide view
      flyCamera(new THREE.Vector3(0, 3.0, 9.5), new THREE.Vector3(0, 1.2, 0), 1100);
      break;
    }

    case 'delivered': {
      setChip('delivering', 'done');
      setChip('delivered', 'done');
      hideBubble('seller');
      controls.autoRotate = true;
      showCard(`
        <div class="c-badge c-badge-ok">✓ Skill Delivered</div>
        <div class="c-label">${ev.provider || 'AI'} · ${ev.topic || ''}</div>
        <div class="c-content">${ev.content || ''}</div>
        <div class="c-powered">
          Powered by ${ev.model || ev.provider || ''}
          ${ev.explorer ? `&nbsp;·&nbsp;<a class="c-link" style="display:inline" href="${ev.explorer}" target="_blank" rel="noopener">tx →</a>` : ''}
        </div>
      `);
      setRunning(false);
      break;
    }

    case 'error': {
      STEP_NAMES.forEach((s) => { if (chips[s]?.classList.contains('active')) setChip(s, 'error'); });
      showToast(ev.message || 'Something went wrong');
      setRunning(false);
      beamActive = false;
      beamMat.opacity = 0;
      break;
    }
  }
}

// ── Start demo ───────────────────────────────────────────────────────────────
let currentEs = null;

function startDemo() {
  if (currentEs) { currentEs.close(); currentEs = null; }
  const topic = els.topicSelect.value;
  setRunning(true);
  hideCard();
  hideBubble('buyer');
  hideBubble('seller');
  beamActive = false;
  beamMat.opacity = 0;
  buildStepLog();

  const es = new EventSource(`/api/agent-trade/demo?topic=${encodeURIComponent(topic)}`);
  currentEs = es;

  es.onmessage = (e) => {
    try {
      const ev = JSON.parse(e.data);
      handleEvent(ev);
      if (ev.type === 'delivered' || ev.type === 'error') {
        es.close();
        currentEs = null;
      }
    } catch { /* malformed event — ignore */ }
  };

  es.onerror = () => {
    showToast('Stream error — check wallet config and try again.');
    setRunning(false);
    es.close();
    currentEs = null;
  };
}

els.startBtn.addEventListener('click', startDemo);

// ── Config pre-flight ─────────────────────────────────────────────────────────
async function checkConfig() {
  try {
    const r = await fetch('/api/agent-trade/demo?check=1');
    if (!r.ok) return;
    const d = await r.json();
    if (!d.configured) {
      els.notConfigured.classList.remove('hidden');
      els.startBtn.disabled = true;
    } else {
      if (d.buyer?.address)  els.buyerAddr.textContent  = fmt(d.buyer.address);
      if (d.seller?.address) els.sellerAddr.textContent = fmt(d.seller.address);
      if (d.network) els.networkBadge.textContent = d.network;
    }
  } catch { /* API unreachable — leave button enabled, it will error gracefully */ }
}

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ── Animation loop ─────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

(function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  const t  = clock.elapsedTime;

  // Idle avatar breath
  if (buyerMesh)  buyerMesh.position.y  = Math.sin(t * 0.75) * 0.022;
  if (sellerMesh) sellerMesh.position.y = Math.sin(t * 0.75 + 1.2) * 0.022;

  // Platform ring pulse
  buyerPlatform.ring.material.emissiveIntensity  = 1.4 + Math.sin(t * 2.0) * 0.5;
  sellerPlatform.ring.material.emissiveIntensity = 1.4 + Math.sin(t * 2.0 + 1.0) * 0.5;

  // Beam travel
  if (beamActive) {
    const B = BUYER_POS, S = SELLER_POS;
    const spread = 0.13;
    for (let i = 0; i < BEAM_N; i++) {
      beamPhases[i] = (beamPhases[i] + beamSpeeds[i] * dt) % 1;
      const ph = beamPhases[i];
      beamPos[i * 3]     = B.x + (S.x - B.x) * ph + (Math.random() - 0.5) * spread;
      beamPos[i * 3 + 1] = B.y + 0.9 + (Math.random() - 0.5) * spread;
      beamPos[i * 3 + 2] = (Math.random() - 0.5) * spread;
    }
    beamGeo.attributes.position.needsUpdate = true;
    beamMat.opacity = 0.75 + Math.sin(t * 14) * 0.18;
  } else if (beamMat.opacity > 0) {
    beamMat.opacity = Math.max(0, beamMat.opacity - dt * 2.5);
    if (beamMat.opacity === 0) beamGeo.attributes.position.needsUpdate = true;
  }

  // Burst particles
  if (burstLife > 0) {
    burstLife -= dt * 0.65;
    burstMat.opacity = Math.max(0, burstLife);
    for (let i = 0; i < BURST_N; i++) {
      burstVels[i * 3 + 1] -= 4.8 * dt; // gravity
      burstPos[i * 3]     += burstVels[i * 3]     * dt;
      burstPos[i * 3 + 1] += burstVels[i * 3 + 1] * dt;
      burstPos[i * 3 + 2] += burstVels[i * 3 + 2] * dt;
    }
    burstGeo.attributes.position.needsUpdate = true;
    if (burstLife <= 0) burstMat.opacity = 0;
  }

  // Camera animation
  if (camAnim.active) {
    camAnim.t += dt * 1000;
    const raw  = Math.min(camAnim.t / camAnim.dur, 1);
    const ease = raw < 0.5 ? 2 * raw * raw : 1 - (-2 * raw + 2) ** 2 / 2;
    camera.position.lerpVectors(camAnim.fromPos, camAnim.toPos, ease);
    controls.target.lerpVectors(camAnim.fromTgt, camAnim.toTgt, ease);
    if (raw >= 1) camAnim.active = false;
  }

  controls.update();
  updateOverlays();
  renderer.render(scene, camera);
})();

checkConfig();
buildStepLog();
