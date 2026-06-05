import puppeteer from 'puppeteer';
const b = await puppeteer.launch({headless:'new', args:['--no-sandbox','--disable-setuid-sandbox']});
const p = await b.newPage();
await p.setViewport({width:1440, height:900});
await p.goto('https://three.ws/deploy', {waitUntil:'domcontentloaded', timeout:60000});
await new Promise(r=>setTimeout(r,7000));
const info = await p.evaluate(()=>{
  const footer = document.querySelector('footer');
  const cs = el => el?getComputedStyle(el):null;
  const fcs = cs(footer);
  const bodyCs = cs(document.body);
  const wrap = document.querySelector('main.wrap');
  const deployMain = document.querySelector('.deploy-main');
  const r = el=>el?(x=>({y:x.y|0,bottom:x.bottom|0,h:x.height|0}))(el.getBoundingClientRect()):null;
  return {
    footerParent: footer?.parentElement?.tagName+'.'+footer?.parentElement?.className,
    footerPrevSibling: footer?.previousElementSibling?.tagName+'.'+footer?.previousElementSibling?.className,
    footerMarginTop: fcs.marginTop, footerMarginBottom: fcs.marginBottom, footerPos: fcs.position,
    bodyDisplay: bodyCs.display, bodyFlexDir: bodyCs.flexDirection,
    wrapDisplay: cs(wrap).display, wrapMinH: cs(wrap).minHeight, wrapFlex: cs(wrap).flex,
    deployMain: r(deployMain), deployMainMb: cs(deployMain).marginBottom,
    deployPagePos: cs(document.querySelector('.deploy-page')).position,
    deployPageFlex: cs(document.querySelector('.deploy-page')).flex,
  };
});
console.log(JSON.stringify(info,null,2));
await b.close();
