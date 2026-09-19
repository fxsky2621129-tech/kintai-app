const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
function setup(initial={}){
  const data={...initial},c=vm.createContext({console,Date,Math,JSON,Map,Set,Number,String,Array,Object,Promise,URL,Blob,AbortController,setTimeout,clearTimeout,localStorage:{getItem:k=>data[k]??null,setItem:(k,v)=>data[k]=String(v),removeItem:k=>delete data[k]},document:{addEventListener(){}},navigator:{onLine:true},window:{},confirm:()=>true});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'app.js'),'utf8'),c);
  vm.runInContext('loadRouteFromLive=renderSettings=renderAll=()=>{}',c);
  return {c,data,run:s=>vm.runInContext(s,c)};
}
const checks={'law-2024-rest':{revision:1,checkedAt:'2026-09-19T00:00:00.000Z'}};
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS '+name)};
test('old backup retains law checks',()=>{const x=setup({truck_kintai_v8_law_checks:JSON.stringify(checks)});x.run('commitBackup(validateBackup({records:[]}))');assert.deepEqual(JSON.parse(x.data.truck_kintai_v8_law_checks),checks)});
test('new backup restores law checks and clear removes them',()=>{const x=setup();x.c.checks=checks;x.run('commitBackup(validateBackup({records:[],lawChecks:checks}))');assert.deepEqual(JSON.parse(x.data.truck_kintai_v8_law_checks),checks);x.run('clearAll()');assert.equal(x.data.truck_kintai_v8_law_checks,undefined);assert.equal(x.run('Object.keys(lawChecks).length'),0)});
test('invalid dates and prototype keys rejected before restore',()=>{const x=setup();for(const value of [{...checks,'__bad':{}},{'law-x':{revision:1,checkedAt:'2026-02-30T00:00:00.000Z'}},[],null]){x.c.value=value;assert.throws(()=>x.run('validateBackup({records:[],lawChecks:value})'));assert.deepEqual(x.data,{})}});
test('law write failure rolls back attendance and checks together',()=>{const x=setup({truck_kintai_v8_law_checks:JSON.stringify(checks)});x.run('saveAll()');const before=JSON.stringify(x.data),set=x.c.localStorage.setItem;let failed=false;x.c.localStorage.setItem=(k,v)=>{if(k==='truck_kintai_v8_law_checks'&&!failed){failed=true;throw Error('quota')}set(k,v)};assert.throws(()=>x.run('commitBackup(validateBackup({records:[],lawChecks:{}}))'));assert.equal(JSON.stringify(x.data),before);assert.equal(x.run('Object.keys(lawChecks).length'),1)});
test('interrupted restore recovers checks',()=>{const x=setup();x.run('saveAll()');const previous={...x.data,truck_kintai_v8_law_checks:JSON.stringify(checks)};const y=setup({...previous,truck_kintai_v8_law_checks:'{}',truck_kintai_v8_restore_journal:JSON.stringify(previous)});assert.deepEqual(JSON.parse(y.data.truck_kintai_v8_law_checks),checks)});
test('backup export contains check timestamps',()=>{const x=setup({truck_kintai_v8_law_checks:JSON.stringify(checks)});x.c.capture=s=>x.c.saved=s;x.run('downloadBlob=capture;backup()');assert.deepEqual(JSON.parse(x.c.saved).lawChecks,checks)});
(async()=>{const x=setup();x.c.fetch=()=>{throw Error('external request')};assert.equal((await x.run('reverseGeocode(35,139)')).address,'');console.log('PASS GPS lookup makes no network request');console.log(`${count+1}/${count+1} passed`)})().catch(e=>{console.error(e);process.exitCode=1});
