const { chromium } = require('I:/Programs/ListofHackathon/hackathons/04-solana-mobile-clock-in/pitch/node_modules/playwright');
const fs = require('fs');
const mark = fs.readFileSync(__dirname + '/mark.svg', 'utf8');
const lock = (bg, fg, sub) => `<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Tiro+Devanagari+Hindi&family=IBM+Plex+Sans:wght@500&display=swap" rel="stylesheet"><style>*{margin:0}body{background:${bg};width:1600px;height:480px;display:flex;align-items:center;gap:56px;padding:0 100px;box-sizing:border-box}svg{width:300px;height:300px;flex:none}h1{font:400 150px/1 'Tiro Devanagari Hindi',serif;color:${fg};letter-spacing:-2px}p{font:500 34px 'IBM Plex Sans',sans-serif;color:${sub};margin-top:22px}</style></head><body>${mark}<div><h1>Switched Off</h1><p>India’s internet shutdown register</p></div></body></html>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 512, height: 512 } });
  await p.setContent(`<html><body style="margin:0;background:transparent">${mark}</body></html>`);
  for (const s of [512, 192, 64]) { await p.setViewportSize({ width: s, height: s }); await p.evaluate((s) => { const v = document.querySelector('svg'); v.setAttribute('width', s); v.setAttribute('height', s) }, s); await p.screenshot({ path: `${__dirname}/mark-${s}.png`, omitBackground: true }) }
  const q = await b.newPage({ viewport: { width: 1600, height: 480 } });
  for (const [name, bg, fg, sub] of [['lockup-dark', '#0A0C17', '#EBE8F3', '#A3A5C2'], ['lockup-light', '#F2ECDF', '#1E1B15', '#5E5646']]) {
    await q.setContent(lock(bg, fg, sub)); await q.evaluate(() => document.fonts.ready); await q.waitForTimeout(800)
    await q.screenshot({ path: `${__dirname}/${name}.png` })
  }
  await b.close()
})()
