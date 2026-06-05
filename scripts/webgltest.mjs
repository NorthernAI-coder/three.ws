import puppeteer from 'puppeteer';
const b = await puppeteer.launch({headless:'new', args:['--no-sandbox','--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const p = await b.newPage();
const r = await p.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  return { ok: !!gl, vendor: gl ? gl.getParameter(gl.VERSION) : null };
});
console.log(JSON.stringify(r));
await b.close();
