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

    assert.match(await page.locator('#checkResult').innerText(),/記録がありません/);
    await page.evaluate(()=>{
      const make=(id,start,parts)=>{let t=+new Date(start);const segments=parts.map(([type,h])=>{const a=t;t+=h*3600000;return {type,start:new Date(a).toISOString(),end:new Date(t).toISOString()}});return {id,source:'punch',start,end:new Date(t).toISOString(),segments}};
      records=[make('prev','2026-08-11T05:30:00',[['drive',4],['break',1],['drive',4],['other',4.5]]),make('sample','2026-08-12T05:30:00',[['drive',3.75],['break',1],['drive',3.75],['break',0.5],['drive',0.5],['other',3.5]])];
      store(KEYS.records,records);settings.completeFrom='2026-08-01';settings.completeThrough='2026-08-12';store(KEYS.settings,settings);$('checkDate').value='2026-08-12';renderAll();
    });
    assert.match(await page.locator('#checkResult').innerText(),/注意/);
    assert.match(await page.locator('#checkResult').innerText(),/10:30/);
    assert.equal(await page.locator('.check-week-day').count(),7);
    await page.locator('#checkConditions summary').click();
    await page.locator('#checkLongDistance').check();await page.locator('#checkNote').fill('450km・宿泊条件は確認中');
    await page.locator('#saveCheckConditions').click();assert.match(await page.locator('#checkSaveStatus').innerText(),/保存しました/);
    await page.reload();await page.locator('#checkDate').fill('2026-08-12');await page.locator('#checkConditions summary').click();
    assert.equal(await page.locator('#checkLongDistance').isChecked(),true);assert.equal(await page.locator('#checkNote').inputValue(),'450km・宿泊条件は確認中');
    await page.locator('#checkNote').fill('編集中');await page.evaluate(()=>renderAll());assert.equal(await page.locator('#checkNote').inputValue(),'編集中');
    const candidate=await page.evaluate(()=>validateBackup({records,settings}));assert.equal(candidate.records[1].checkConditions.longDistance,true);
    const downloadEvent=page.waitForEvent('download');await page.locator('#backupBtn').click();const download=await downloadEvent;const backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(backup.records[1].checkConditions.note,'450km・宿泊条件は確認中');
    await page.evaluate(()=>{commitBackup(validateBackup({records:[]}));renderAll()});assert.match(await page.locator('#checkResult').innerText(),/勤務なし/);
    page.once('dialog',d=>d.accept());await page.locator('#restoreFile').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.waitForFunction(()=>records.length===2);
    await context.setOffline(true);await page.reload();await page.locator('#checkDate').fill('2026-08-12');assert.match(await page.locator('#checkResult').innerText(),/10:30/);
    await page.locator('#checkToday').click();assert.match(await page.locator('#checkResult').innerText(),/記録がありません/);
    await page.locator('#checkDate').fill('2026-08-12');
    for(const width of [360,393,768]){await page.setViewportSize({width,height:852});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'overflow at '+width)}
    await page.setViewportSize({width:393,height:852});await page.locator('#quickCheck').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(fs.mkdtempSync(path.join(require('os').tmpdir(),'kintai-check-')),'quick-check-mobile.png'),fullPage:false});
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    console.log('PASS mobile dashboard, conditions persistence, draft protection, backup/restore, offline, three viewport widths, no JS errors');
    await context.close();
  }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
