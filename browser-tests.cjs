const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const root=__dirname,types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const server=http.createServer((req,res)=>{let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/kintai-app\//,'/');if(pathname.endsWith('/'))pathname+='index.html';const file=path.join(root,pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'text/plain','Cache-Control':'no-store'});res.end(data)})});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,url=origin+'/kintai-app/';
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true});
  try{
    const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,deviceScaleFactor:1,acceptDownloads:true});
    const errors=[],external=[];context.on('request',r=>{if(!r.url().startsWith(origin))external.push(r.url())});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await page.locator('#lawYear').selectOption('2024');assert.equal(await page.locator('.law-card').count(),3);
    await page.locator('#lawCards .law-confirm input').first().check();assert.match(await page.locator('#lawProgress').innerText(),/1 \/ 3/);
    await page.reload();assert.equal(await page.locator('#lawCards .law-confirm input').first().isChecked(),true);
    await page.locator('#lawYear').selectOption('2028');assert.equal(await page.locator('.law-card').count(),2);
    await page.locator('#lawSearch').fill('適正原価');assert.equal(await page.locator('.law-card').count(),1);
    await page.locator('#lawSearch').fill('該当なし検索');assert.equal(await page.locator('.law-card').count(),0);
    await page.locator('#lawSearch').fill('');await page.locator('#lawYear').selectOption('all');
    const saved=await page.evaluate(()=>localStorage.getItem('truck_kintai_v8_law_checks'));
    await page.evaluate(()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='truck_kintai_v8_law_checks')throw Error('quota');return window.originalSet.call(this,k,v)}});
    await page.locator('#lawCards .law-confirm input').nth(1).click();assert.equal(await page.locator('#lawCards .law-confirm input').nth(1).isChecked(),false);assert.match(await page.locator('#lawSaveStatus').innerText(),/保存できません/);
    await page.evaluate(()=>Storage.prototype.setItem=window.originalSet);
    const downloadEvent=page.waitForEvent('download');await page.locator('#backupBtn').click();const download=await downloadEvent;const backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.deepEqual(backup.lawChecks,JSON.parse(saved));
    await page.evaluate(()=>{commitBackup(validateBackup({records:[],lawChecks:{}}));});assert.equal(await page.locator('#lawCards .law-confirm input').first().isChecked(),false);
    page.once('dialog',d=>d.accept());await page.locator('#restoreFile').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.waitForFunction(()=>Object.keys(lawChecks).length===1);
    const before=await page.evaluate(()=>localStorage.getItem('truck_kintai_v8_law_checks'));
    await context.setOffline(true);await page.reload();assert.equal(await page.locator('.law-card').count(),9);assert.equal(await page.locator('#lawCards .law-confirm input').first().isChecked(),true);
    await page.locator('#returnPref').selectOption('東京都');await page.waitForFunction(()=>document.getElementById('returnCity').options.length>1);
    await page.locator('#lawCards .law-confirm input').nth(1).check();await page.reload();assert.equal(await page.locator('#lawCards .law-confirm input').nth(1).isChecked(),true);
    await page.goto(url+'gps-check.html');assert.match(await page.title(),/GPS/);await page.goto(url);
    await page.locator('a[href="#lawGuide"]').click();await page.screenshot({path:path.join(require('os').tmpdir(),'kintai-law-mobile.png')});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    console.log('PASS mobile filters, persistence, quota rollback, backup/restore, offline reload, offline city data, GPS help, layout, zero external requests');
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
