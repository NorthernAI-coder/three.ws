import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ args:['--no-sandbox','--use-gl=swiftshader','--enable-webgl'] });
const p = await b.newPage();
await p.setViewport({ width:1440, height:900 });
await p.goto('http://localhost:3001/login.html', { waitUntil:'networkidle2' });
await new Promise(r=>setTimeout(r,3000));
const read = ()=>p.evaluate(()=>{
  const a=window.__agent; if(!a||!a.avatar) return {err:'no agent/avatar'};
  const s=a.worldToScreen(a.avatar.position.x, a.avatar.position.y);
  return { scrollY:window.scrollY, avatarScreenX:Math.round(s.x), avatarScreenY:Math.round(s.y), wx:+a.avatar.position.x.toFixed(3), wy:+a.avatar.position.y.toFixed(3) };
});
await p.evaluate(()=>window.scrollTo(0,0)); await new Promise(r=>setTimeout(r,400));
console.log('scroll0  ', JSON.stringify(await read()));
await p.evaluate(()=>window.scrollTo(0,400)); await new Promise(r=>setTimeout(r,400));
console.log('scroll400', JSON.stringify(await read()));
await b.close();
