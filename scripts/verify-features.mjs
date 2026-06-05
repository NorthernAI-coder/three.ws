import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
const errs=[];
p.on('console', m=>{ if(m.type()==='error') errs.push(m.text()); });
p.on('pageerror', e=> errs.push('PAGEERROR: '+e.message));
await p.goto('http://localhost:3000/features',{waitUntil:'networkidle', timeout:45000});
await p.waitForTimeout(1200);
const data = await p.evaluate(()=>{
  const q=s=>Array.from(document.querySelectorAll(s));
  const txt=e=>e? e.textContent.trim().replace(/\s+/g,' '):null;
  return {
    title: document.title,
    heroTitle: txt(document.querySelector('.feat-hero-title')),
    navPills: q('.feat-goal-pill').map(txt),
    sections: q('.feat-goal-section').map(s=>({id:s.id, h2:txt(s.querySelector('.feat-goal-title'))})),
    coreBanner: txt(document.querySelector('.feat-tier-banner--core .feat-tier-banner-text')),
    optBanner: txt(document.querySelector('.feat-tier-banner--optional .feat-tier-banner-text')),
    coreCards: q('#core .feat-card .feat-card-title').map(txt),
    optCards: q('#optional .feat-card .feat-card-title').map(txt),
    reqChips: q('.feat-req').map(txt),
    optCtas: q('#optional .feat-card-cta').map(a=>a.getAttribute('href')),
    coreCtas: q('#core .feat-card-cta').map(a=>a.getAttribute('href')),
    termSpans: q('[data-term]').map(e=>e.getAttribute('data-term')),
    glossaryLoaded: !!window.__twsGlossary,
    dashVisible: !!document.querySelector('.feat-dash-tiles'),
    launchVisible: !!document.querySelector('.feat-launch-curve'),
    bannerBg: (()=>{const e=document.querySelector('.feat-tier-banner--core');return e?getComputedStyle(e).backgroundColor:null;})(),
  };
});
const term = await p.$('.feat-tier-banner--optional [data-term="usdc"]');
let tip=null;
if(term){ await term.hover(); await p.waitForTimeout(300); tip = await p.evaluate(()=>{const t=document.getElementById('tws-tt-pop');return t&&t.classList.contains('is-on')?t.textContent.trim():null;}); }
console.log(JSON.stringify({data, tooltip:tip, errors:errs}, null, 2));
await b.close();
