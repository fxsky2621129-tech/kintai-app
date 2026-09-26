const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const root=__dirname,types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const server=http.createServer((req,res)=>{let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/kintai-app\//,'/');if(pathname.endsWith('/'))pathname+='index.html';const file=path.join(root,pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'text/plain','Cache-Control':'no-store'});res.end(data)})});
(async()=>{
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,url=origin+'/kintai-app/';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true});
try{
const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,timezoneId:'Asia/Tokyo',acceptDownloads:true});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(url);await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
assert.equal(await page.locator('#quickTotal').innerText(),'確認待ち');
await page.locator('#quickDate').fill('2026-01-04');await page.locator('#quickDate').dispatchEvent('change');
await page.getByText('休日・特例の確認',{exact:true}).click();await page.locator('#quickDayOff').click();assert.match(await page.locator('#quickSummary').innerText(),/休日/);
await page.locator('#quickLong').check();await page.reload();await page.locator('#quickDate').fill('2026-01-04');await page.locator('#quickDate').dispatchEvent('change');
assert.equal(await page.locator('#quickLong').isChecked(),true);
await page.locator('[data-quick-view="week"]').click();assert.equal(await page.locator('[data-quick-date]').count(),7);
await page.locator('[data-quick-view="month"]').click();assert.match(await page.locator('#quickDetails').innerText(),/年間拘束/);
page.once('dialog',d=>d.accept());await page.locator('#saveSettingsBtn').click();assert.equal(await page.evaluate(()=>settings.quickCheck.daysOff[0]),'2026-01-04');
const downloadEvent=page.waitForEvent('download');await page.locator('#backupBtn').click();const d=await downloadEvent;const backup=JSON.parse(fs.readFileSync(await d.path(),'utf8'));assert.equal(backup.settings.quickCheck.daysOff[0],'2026-01-04');
await page.evaluate(()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='truck_kintai_v8_settings')throw Error('quota');return window.originalSet.call(this,k,v)}});
await page.getByText('休日・特例の確認',{exact:true}).click();await page.locator('#quickDayOff').click();assert.match(await page.locator('#quickSaveStatus').innerText(),/保存できません/);assert.match(await page.locator('#quickSummary').innerText(),/休日/);
await page.evaluate(()=>Storage.prototype.setItem=window.originalSet);
await page.evaluate(()=>{const start='2026-01-05T06:00:00',end='2026-01-05T22:00:00';records=[{id:'test',source:'punch',start,end,segments:[{type:'other',start,end}]}];store(KEYS.records,records);});
await page.locator('#quickDate').fill('2026-01-05');await page.locator('#quickDate').dispatchEvent('change');await page.locator('[data-quick-view="day"]').click();assert.equal(await page.locator('#quickTotal').innerText(),'基準超過');assert.equal(await page.locator('#quickDayOff').isDisabled(),true);
await page.locator('#quickLong').check();assert.equal(await page.locator('#quickTotal').innerText(),'基準超過');
await context.setOffline(true);await page.reload();await page.locator('#quickDate').fill('2026-01-05');await page.locator('#quickDate').dispatchEvent('change');assert.equal(await page.locator('#quickTotal').innerText(),'基準超過');
await page.locator('#quickCheck').scrollIntoViewIfNeeded();await page.screenshot({path:process.env.QUICK_SCREENSHOT||path.join(require('os').tmpdir(),'kintai-quick-mobile.png'),fullPage:false});
for(const width of [320,393,1280]){await page.setViewportSize({width,height:852});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'overflow '+width)}
await page.setViewportSize({width:393,height:852});await page.evaluate(()=>document.documentElement.style.fontSize='200%');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
assert.deepEqual(errors,[]);console.log('PASS quick mobile tabs, holiday and flags, settings preservation, backup, quota rollback, normal excess, offline cache, 320/393/1280px layouts, zero browser errors');
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
