'use strict';

const APP_VERSION='8.6.6';
const KEYS={
  records:'truck_kintai_v8_records',
  settings:'truck_kintai_v8_settings',
  live:'truck_kintai_v8_live',
  rest:'truck_kintai_v8_rest',
  restLog:'truck_kintai_v8_restlog',
  migrated:'truck_kintai_v8_migrated'
};
const LEGACY={records:'truck_kintai_v6_records',settings:'truck_kintai_v6_settings',live:'truck_kintai_v6_live',rest:'truck_kintai_v6_rest'};
const TYPES={drive:'運転',wait:'待機',load:'荷積み',unload:'荷卸し',break:'休憩',other:'その他'};
const PREFS=['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
const GSI_REVERSE='https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress';
const LOCALGOV='https://code4fukui.github.io/localgovjp/localgovjp.json';
const LOCALGOV_CACHE_KEY='truck_kintai_v8_localgov_cache';

const RESTORE_JOURNAL='truck_kintai_v8_restore_journal';
recoverRestore();
let records=load(KEYS.records,[]);
let settings=load(KEYS.settings,{hourlyRate:1200,scheduledStart:'08:00',scheduledEnd:'17:00',dailyStandardHours:8,biweekStart:'2026-01-05'});
let live=load(KEYS.live,null);
let restState=load(KEYS.rest,null);
let restLog=load(KEYS.restLog,[]);
let installPrompt=null;
let localGovRows=null;
let localGovRequest=null;
let dataEpoch=0;
const gpsRequests=new Map();
const cityRequests={return:0,out:0};

function $(id){return document.getElementById(id)}
function load(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}}
function store(k,v){localStorage.setItem(k,JSON.stringify(v))}
function saveAll(){store(KEYS.records,records);store(KEYS.settings,settings);store(KEYS.live,live);store(KEYS.rest,restState);store(KEYS.restLog,restLog)}
function uid(){return `${Date.now()}_${Math.random().toString(36).slice(2,8)}`}
function pad(n){return String(n).padStart(2,'0')}
function localIso(d=new Date()){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`}
function dateKey(d){const x=d instanceof Date?d:new Date(d);return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`}
function fmtDateTime(v){if(!v)return '-';const d=new Date(v);return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`}
function fmtTime(v){if(!v)return '-';const d=v instanceof Date?v:new Date(v);return `${pad(d.getHours())}:${pad(d.getMinutes())}`}
function fmtHM(hours){if(!Number.isFinite(hours))return '-';const m=Math.max(0,Math.round(hours*60));return `${Math.floor(m/60)}:${pad(m%60)}`}
function hoursBetween(a,b){return Math.max(0,(new Date(b)-new Date(a))/3600000)}
function overlapHours(a1,a2,b1,b2){const s=Math.max(+new Date(a1),+new Date(b1)),e=Math.min(+new Date(a2),+new Date(b2));return Math.max(0,(e-s)/3600000)}
function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function csvCell(v){const s=String(v??'');return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s}
function dayLabel(d){return ['日','月','火','水','木','金','土'][d.getDay()]}
function monthKey(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}`}
function nowMonth(){return monthKey(new Date())}
function clamp(v,min,max){return Math.min(max,Math.max(min,v))}

function migrateLegacy(){
  if(localStorage.getItem(KEYS.migrated))return;
  const versions=[Object.fromEntries(Object.entries(LEGACY).map(([name,key])=>[name,key.replace('_v6_','_v7_')])),LEGACY];
  for(const name of ['records','settings','live','rest']){
    // Existing v8 values, including [] and null, must never be replaced by stale legacy data.
    if(localStorage.getItem(KEYS[name])!==null)continue;
    for(const keys of versions){
      const value=load(keys[name],null);if(value===null)continue;
      if(name==='records'){
        if(!Array.isArray(value))continue;
        records=value.filter(r=>r&&typeof r==='object'&&!Array.isArray(r)).map(r=>({...r,source:r.source||'punch'}));store(KEYS.records,records);
      }else{
        if(typeof value!=='object'||Array.isArray(value))continue;
        if(name==='settings'){settings={...settings,...value};store(KEYS.settings,settings)}
        else if(name==='live'){live=value;store(KEYS.live,live)}
        else{restState=value;store(KEYS.rest,restState)}
      }
      break;
    }
  }
  localStorage.setItem(KEYS.migrated,'1');
}

function composeRoute(prefix){const pref=$(prefix+'Pref').value.trim(),city=$(prefix+'City').value.trim(),extra=$(prefix+'Extra').value.trim();return [pref,city].filter(Boolean).join(' ')+(extra?` / ${extra}`:'')}
function syncRouteToLive(){if(!live)return;live.returnPref=$('returnPref').value.trim();live.returnCity=$('returnCity').value.trim();live.returnExtra=$('returnExtra').value.trim();live.outPref=$('outPref').value.trim();live.outCity=$('outCity').value.trim();live.outExtra=$('outExtra').value.trim();live.returnMemo=composeRoute('return');live.outboundMemo=composeRoute('out');store(KEYS.live,live)}
function setPrefOptions(){const options='<option value="">都道府県を選択</option>'+PREFS.map(p=>`<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');$('returnPref').innerHTML=options;$('outPref').innerHTML=options}
function uniqueCities(rows,pref){return [...new Set(rows.filter(r=>String(r.pref||'')===pref).map(r=>String(r.city||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ja'))}
async function populateCity(prefix,selected=''){
  const request=++cityRequests[prefix],pref=$(prefix+'Pref').value.trim(),cityEl=$(prefix+'City');
  if(!pref){cityEl.disabled=true;cityEl.innerHTML='<option value="">都道府県を先に選択</option>';return}
  cityEl.disabled=true;cityEl.innerHTML='<option value="">市区町村を読み込み中…</option>';
  const rows=await getLocalGov();if(request!==cityRequests[prefix]||$(prefix+'Pref').value.trim()!==pref)return;const cities=uniqueCities(rows,pref);
  $('routeDataStatus').textContent=cities.length?'都道府県を選ぶと市区町村を選択できます。':'市区町村を取得できません。通信復旧後に再試行します。';
  if(!cities.length){
    cityEl.innerHTML='<option value="">市区町村データを取得できません</option>';
    if(selected){const o=document.createElement('option');o.value=selected;o.textContent=selected;cityEl.appendChild(o);cityEl.value=selected}
    cityEl.disabled=false;return
  }
  cityEl.innerHTML='<option value="">市区町村を選択</option>'+cities.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  if(selected&&!cities.includes(selected)){const o=document.createElement('option');o.value=selected;o.textContent=selected;cityEl.appendChild(o)}
  cityEl.value=selected||'';cityEl.disabled=false
}
async function loadRouteFromLive(){
  const rp=live?.returnPref||'',rc=live?.returnCity||'',op=live?.outPref||'',oc=live?.outCity||'';
  $('returnPref').value=rp;$('outPref').value=op;$('returnExtra').value=live?.returnExtra||'';$('outExtra').value=live?.outExtra||'';
  await Promise.all([populateCity('return',rc),populateCity('out',oc)])
}
async function initRouteSelectors(){
  setPrefOptions();
  await loadRouteFromLive();
  const s=$('routeDataStatus');
  if(s)s.textContent=localGovRows?.length?'都道府県を選ぶと市区町村を選択できます。':'市区町村データは通信可能時に取得します。'
}

function emptyGps(requestedAt){return {status:'pending',requestedAt}}
function startGpsDisplay(g){return gpsDisplay(g)}
function gpsClass(g){if(!g)return '';return hasCoordinates(g)?(g.accuracy>100?'gps-wait':'gps-ok'):g.status==='pending'?'gps-wait':'gps-error'}
async function fetchJson(url,timeout=8000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{const r=await fetch(url,{cache:'no-store',signal:controller.signal});if(!r.ok)throw new Error('通信エラー '+r.status);return await r.json()}
  finally{clearTimeout(timer)}
}
function validCities(rows){return Array.isArray(rows)&&rows.length>0&&rows.every(r=>r&&typeof r.pref==='string'&&typeof r.city==='string'&&r.cid!=null)}
async function getLocalGov(){
  if(localGovRows?.length)return localGovRows;
  try{const cached=load(LOCALGOV_CACHE_KEY,null);if(validCities(cached)){localGovRows=cached;return localGovRows}}catch(e){}
  if(localGovRequest)return localGovRequest;
  localGovRequest=(async()=>{
    try{const rows=await fetchJson(LOCALGOV);if(!validCities(rows))throw new Error('市区町村データ形式が違います');localGovRows=rows;try{store(LOCALGOV_CACHE_KEY,rows)}catch(e){}return rows}
    catch(e){return []}
    finally{localGovRequest=null}
  })();
  return localGovRequest;
}
async function reverseGeocode(lat,lon){
  try{const [j,rows]=await Promise.all([fetchJson(GSI_REVERSE+'?lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lon)),getLocalGov()]);
    const x=j.results||{},code=String(x.muniCd||'').replace(/^0+/,''),muni=rows.find(v=>String(v.cid).replace(/^0+/,'')===code);
    return {address:[muni?.pref,muni?.city,x.lv01Nm].filter(Boolean).join(' '),prefecture:muni?.pref||'',municipality:muni?.city||'',locality:x.lv01Nm||'',muniCd:x.muniCd||'',reverseError:muni?'':'市区町村未取得（通信復旧後に再取得できます）'};
  }catch(e){return {address:'',reverseError:e.message||String(e)}}
}
function hasCoordinates(g){return g?.status==='ok'&&Number.isFinite(g.lat)&&Number.isFinite(g.lon)}
function gpsDisplay(g){
  if(!g)return '未取得';
  if(!hasCoordinates(g))return g.status==='pending'?'位置取得中（最大60秒）…':'未取得：'+(g.error||'再取得してください');
  const place=[g.prefecture,g.municipality,g.locality].filter(Boolean).join(' ')||g.address||'座標取得済み・住所未取得';
  return [place,Number.isFinite(g.accuracy)?'精度 ±'+Math.round(g.accuracy)+'m':'精度不明',g.positionAt?'取得 '+fmtDateTime(g.positionAt):'',g.locating?'精度を改善中…':'',g.addressPending?'住所確認中…':'',g.lateAcquisition?'打刻後の再取得位置（打刻時の位置ではありません）':'',g.retryError?'再取得失敗：保存済みの位置を保持':''].filter(Boolean).join(' ／ ');
}
function gpsError(err){
  if(err?.code===1)return '位置情報が許可されていません。Androidの位置情報とChromeのサイト設定を確認してください';
  if(err?.code===2)return '現在位置を特定できません。屋外や窓際で再取得してください';
  if(err?.code===3)return '60秒以内に利用できる位置情報を取得できませんでした。下の取得確認の結果を共有してください';
  return err?.message||'位置情報を取得できません';
}
function acquireGps(onUpdate=()=>{}){return new Promise(resolve=>{
  let done=false,best=null,retryTimer=null,lastError={code:3},attempt=0;
  let responses=0,stale=0,invalid=0,timeouts=0,unavailable=0,lastAge=null;
  const initialVisibility=document.visibilityState||"不明";
  const deadline=setTimeout(()=>finish(),60000);
  function finish(error){if(done)return;done=true;clearTimeout(deadline);clearTimeout(retryTimer);const reason=stale?'古い位置情報しか取得できなかったため、打刻位置を保存しませんでした。':invalid?'端末から返った位置情報の形式・時刻を確認できませんでした。':gpsError(error||lastError);const detail='［取得確認 v8.6.6：試行'+attempt+'回／応答'+responses+'回／古い位置'+stale+'回／形式・時刻不正'+invalid+'回／タイムアウト'+timeouts+'回／特定不可'+unavailable+'回'+(lastAge!==null?'／最終位置'+lastAge+'秒前':'')+'／画面'+initialVisibility+'→'+(document.visibilityState||'不明')+'］';resolve(best?{...best,locating:false}:{status:'error',error:reason+' '+detail,errorCode:(error||lastError)?.code||0})}
  function again(high,delay){if(!done)retryTimer=setTimeout(()=>request(high),delay)}
  function request(high){
    if(done)return;const token=++attempt;let settled=false;
    const active=()=>!done&&!settled&&token===attempt;
    const failed=e=>{if(!active())return;settled=true;lastError=e;if(e.code===3)timeouts++;if(e.code===2)unavailable++;if(e.code===1){finish(e);return}again(!high,1000)};
    try{navigator.geolocation.getCurrentPosition(p=>{
      if(!active())return;settled=true;responses++;
      const lat=p.coords?.latitude,lon=p.coords?.longitude,accuracy=p.coords?.accuracy,timestamp=p.timestamp,now=Date.now();
      lastAge=Number.isFinite(timestamp)?Math.round((now-timestamp)/1000):null;
      if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||!Number.isFinite(accuracy)||accuracy<0||!Number.isFinite(timestamp)||timestamp>now+10000){invalid++;again(true,1000);return}
      if(timestamp<now-60000){stale++;again(true,1000);return}
      if(!best||accuracy<best.accuracy||(accuracy===best.accuracy&&timestamp>new Date(best.positionAt).getTime())){best={status:'ok',lat,lon,accuracy,positionAt:new Date(timestamp).toISOString(),locating:true};onUpdate({...best})}
      if(accuracy<=20)finish();else again(true,5000);
    },failed,{enableHighAccuracy:high,timeout:15000,maximumAge:0})}catch(e){failed(e)}
  }
  if(globalThis.isSecureContext===false){finish({message:'HTTPSでアプリを開いてください'});return}
  if(!navigator.geolocation?.getCurrentPosition){finish({message:'このブラウザは位置情報に対応していません'});return}
  request(true);
})}

function saveGpsTarget(id,field,g){const r=gpsTarget(id);if(!r)return false;r[field]=g;store(r===live?KEYS.live:KEYS.records,r===live?live:records);renderAll();return true}
async function enrichGpsAddress(id,field,epoch,token){
  const target=gpsTarget(id),g=target?.[field];if(!hasCoordinates(g)||!navigator.onLine)return;
  const current=()=>dataEpoch===epoch&&gpsRequests.get(id+':'+field)===token;
  const rev=await reverseGeocode(g.lat,g.lon);if(!current())return;
  const latest=gpsTarget(id)?.[field];if(!hasCoordinates(latest)||latest.lat!==g.lat||latest.lon!==g.lon)return;
  const address=rev.municipality||rev.address?rev:{...rev,address:g.address||'',prefecture:g.prefecture||'',municipality:g.municipality||'',locality:g.locality||''};
  saveGpsTarget(id,field,{...latest,...address,addressPending:false});
}
async function requestGps(id,field){
  const r=gpsTarget(id);if(!r)return;
  const epoch=dataEpoch,token=uid(),key=id+':'+field,requestedAt=field==='startGps'?r.start:r.end,previous=r[field],attemptAt=localIso();
  const current=()=>dataEpoch===epoch&&gpsRequests.get(key)===token;
  gpsRequests.set(key,token);
  saveGpsTarget(id,field,hasCoordinates(previous)?{...previous,locating:true,retryError:''}:emptyGps(requestedAt));
  try{
    const persist=g=>{if(current())saveGpsTarget(id,field,{...g,requestedAt,attemptAt,lateAcquisition:Math.abs(new Date(attemptAt)-new Date(requestedAt))>120000,addressPending:!g.locating&&navigator.onLine})};
    const g=await acquireGps(persist);if(!current())return;
    if(!hasCoordinates(g)&&hasCoordinates(previous)){saveGpsTarget(id,field,{...previous,locating:false,retryError:g.error||'再取得失敗'});return}
    persist(g);if(hasCoordinates(g))await enrichGpsAddress(id,field,epoch,token);
  }catch(e){if(current())saveGpsTarget(id,field,hasCoordinates(previous)?{...previous,locating:false,retryError:e.message}:{status:'error',requestedAt,error:e.message||'位置取得失敗'})}
  finally{if(current()){gpsRequests.delete(key);renderAll()}}
}
async function refreshGpsAddress(id,field){
  if(!hasCoordinates(gpsTarget(id)?.[field]))return;
  const key=id+':'+field;if(gpsRequests.has(key))return;
  const epoch=dataEpoch,token=uid();gpsRequests.set(key,token);
  saveGpsTarget(id,field,{...gpsTarget(id)[field],addressPending:navigator.onLine});
  try{await enrichGpsAddress(id,field,epoch,token)}finally{if(dataEpoch===epoch&&gpsRequests.get(key)===token){gpsRequests.delete(key);renderAll()}}
}
async function retryGps(id,field){
  const r=gpsTarget(id);if(!r)return;
  // A later retry must not silently replace the saved punch location with today's location.
  if(hasCoordinates(r[field]))return refreshGpsAddress(id,field);
  return requestGps(id,field);
}
function recoverPendingGps(){
  let changed=false;
  for(const r of [...records,...(live?[live]:[])])for(const field of ['startGps','endGps']){
    const g=r[field];if(!g)continue;
    if(hasCoordinates(g)&&(g.locating||g.addressPending)){r[field]={...g,locating:false,addressPending:false};changed=true}
    else if(g.status==='pending'){r[field]={...g,status:'error',errorCode:3,error:'前回の取得が中断されました。再取得してください'};changed=true}
  }
  if(changed){store(KEYS.records,records);store(KEYS.live,live)}
}
async function retryMissingAddresses(){
  const targets=[...(live?[live]:[]),...records.filter(r=>r.source==='punch').slice(-20)];
  for(const r of targets)for(const field of ['startGps','endGps'])if(hasCoordinates(r[field])&&(!r[field].municipality||r[field].addressPending))await refreshGpsAddress(r.id,field);
}

function gpsTarget(id){return live?.id===id?live:records.find(r=>r.id===id)}
async function setStartGpsForLive(){if(live)await retryGps(live.id,'startGps')}
async function setEndGpsForRecord(id){await retryGps(id,'endGps')}
async function retryStartGps(){const r=live||[...records].reverse().find(x=>x.source==='punch');if(!r)return alert('勤務記録がありません');await retryGps(r.id,'startGps')}
async function retryEndGps(){const r=[...records].reverse().find(x=>x.source==='punch');if(!r)return alert('勤務記録がありません');await setEndGpsForRecord(r.id)}

function startShift(){if(live)return;const t=localIso();finishRestAt(t);live={id:uid(),source:'punch',start:t,segments:[],active:{type:'drive',start:t},returnPref:$('returnPref').value.trim(),returnCity:$('returnCity').value.trim(),returnExtra:$('returnExtra').value.trim(),outPref:$('outPref').value.trim(),outCity:$('outCity').value.trim(),outExtra:$('outExtra').value.trim(),returnMemo:composeRoute('return'),outboundMemo:composeRoute('out'),startGps:emptyGps(t)};store(KEYS.live,live);if(!$('monthPicker').value)$('monthPicker').value=nowMonth();renderAll();requestGps(live.id,'startGps')}
function closeActive(at){if(!live?.active)return;live.segments.push({...live.active,end:at});live.active=null}
function endShift(){if(!live)return;const t=localIso();closeActive(t);const rec={...live,end:t,active:undefined,returnMemo:composeRoute('return'),outboundMemo:composeRoute('out'),endGps:emptyGps(t)};records.push(rec);live=null;store(KEYS.records,records);store(KEYS.live,live);renderAll();requestGps(rec.id,'endGps')}
function startActivity(type){if(!live||!Object.hasOwn(TYPES,type)||type==='drive'||live.active?.type===type)return;const t=localIso();closeActive(t);live.active={type,start:t};store(KEYS.live,live);renderAll()}
function endActivity(type){if(!live?.active||live.active.type!==type||type==='drive')return;const t=localIso();closeActive(t);live.active={type:'drive',start:t};store(KEYS.live,live);renderAll()}
function ensureAutoDriveLive(){
  if(!live||live.active)return;
  const segs=Array.isArray(live.segments)?live.segments:[];
  const start=segs.length?(segs[segs.length-1].end||live.start):live.start;
  live.active={type:'drive',start:start||localIso()};
  store(KEYS.live,live);
}

function startRest(){if(live)return alert('勤務中は「休憩」を使用してください');if(restState?.start)return;restState={start:localIso()};store(KEYS.rest,restState);renderRest()}
function finishRestAt(at){if(!restState?.start)return;restLog.push({id:uid(),start:restState.start,end:new Date(at)<new Date(restState.start)?restState.start:at});restState=null;store(KEYS.restLog,restLog);store(KEYS.rest,restState)}
function endRest(){finishRestAt(localIso());renderRest()}

function effectiveRecords(){const out=records.filter(r=>r.source==='punch'&&r.start&&r.end).map(r=>structuredCloneSafe(r));if(live?.start){const t=localIso(),segs=(live.segments||[]).map(x=>({...x}));if(live.active)segs.push({type:live.active.type,start:live.active.start,end:t});out.push({...structuredCloneSafe(live),id:'__live__',end:t,segments:segs,isLive:true,source:'punch'})}return out}
function structuredCloneSafe(x){return JSON.parse(JSON.stringify(x))}
function segmentHours(r,type){return (r.segments||[]).filter(s=>s.type===type&&s.start&&s.end).reduce((a,s)=>a+hoursBetween(s.start,s.end),0)}
function workHours(r){return Object.keys(TYPES).filter(t=>t!=='break').reduce((a,t)=>a+segmentHours(r,t),0)}
function durationHours(r){return hoursBetween(r.start,r.end)}
function requiredBreak(work){return work>8?1:work>6?.75:0}


function continuousText(c){
  const notes=[];
  if(c.maxContinuous>4+1e-6)notes.push('連続運転4時間超');
  if(c.shortViolation)notes.push('10分未満の中断が3回以上連続');
  else if(c.shortCount)notes.push('要確認：10分未満の中断');
  if(c.nonBreakInterruption)notes.push('要確認：運転中断に休憩以外の作業あり');
  return notes.join(' ／ ');
}

function workSlices(r){
  const [sh,sm]=(settings.scheduledStart||'08:00').split(':').map(Number),[eh,em]=(settings.scheduledEnd||'17:00').split(':').map(Number);
  const begin=sh*60+sm,finish=eh*60+em,out=[];
  for(const seg of r.segments||[]){
    if(seg.type==='break'||!seg.start||!seg.end)continue;
    const a=+new Date(seg.start),b=+new Date(seg.end),cuts=new Set([a,b]);
    for(let day=new Date(a);+day<=b;day.setDate(day.getDate()+1)){
      for(const [h,m] of [[0,0],[5,0],[22,0],[sh,sm],[eh,em]]){
        const t=+new Date(day.getFullYear(),day.getMonth(),day.getDate(),h,m);if(t>a&&t<b)cuts.add(t);
      }
      day.setHours(0,0,0,0);
    }
    const points=[...cuts].sort((x,y)=>x-y);
    for(let i=1;i<points.length;i++){
      const mid=new Date((points[i-1]+points[i])/2),minute=mid.getHours()*60+mid.getMinutes();
      const inside=begin<finish?minute>=begin&&minute<finish:begin>finish?minute>=begin||minute<finish:false;
      out.push({id:r.id,start:points[i-1],end:points[i],hours:(points[i]-points[i-1])/3600000,outside:!inside,night:minute>=1320||minute<300});
    }
  }
  return out.sort((a,b)=>a.start-b.start);
}
function scheduledOutsideHours(r){return workSlices(r).filter(s=>s.outside).reduce((n,s)=>n+s.hours,0)}
function payableOtHours(r){const std=Number(settings.dailyStandardHours)||8;return Math.max(0,workHours(r)-std,scheduledOutsideHours(r))}
function applyPay(recordsForMonth){
  const rate=Number(settings.hourlyRate)||0,byId=new Map(),days=new Map();
  for(const r of [...recordsForMonth].sort((a,b)=>new Date(a.start)-new Date(b.start))){
    const key=dateKey(r.start);if(!days.has(key))days.set(key,[]);days.get(key).push(...workSlices(r));byId.set(r.id,{ot:0,night:0,pay:0});
  }
  const payable=[];
  for(const slices of days.values()){
    slices.sort((a,b)=>a.start-b.start);
    const work=slices.reduce((n,s)=>n+s.hours,0),outside=slices.filter(s=>s.outside).reduce((n,s)=>n+s.hours,0);
    let extra=Math.max(0,work-(Number(settings.dailyStandardHours)||8)-outside);
    // Outside-schedule work is already overtime. Assign any extra daily excess to the latest inside-schedule work.
    for(let i=slices.length-1;i>=0;i--){const s=slices[i];
      if(s.outside){payable.push({...s,ot:true});continue}
      const take=Math.min(extra,s.hours);extra-=take;
      if(take>0)payable.push({...s,start:s.end-take*3600000,hours:take,ot:true});
      if(s.hours>take)payable.push({...s,end:s.end-take*3600000,hours:s.hours-take,ot:false});
    }
  }
  let monthlyOt=0;
  for(const s of payable.sort((a,b)=>a.start-b.start)){
    const p=byId.get(s.id);if(s.night){p.night+=s.hours;p.pay+=rate*s.hours*.25}
    if(s.ot){const over60=Math.max(0,monthlyOt+s.hours-60)-Math.max(0,monthlyOt-60);p.ot+=s.hours;p.pay+=rate*(s.hours*1.25+over60*.25);monthlyOt+=s.hours}
  }
  return byId;
}
function nightWorkHours(r){let total=0;for(const s of (r.segments||[])){if(!s.start||!s.end||s.type==='break')continue;let d0=new Date(s.start),d1=new Date(s.end);for(let day=new Date(d0.getFullYear(),d0.getMonth(),d0.getDate()-1);day<=d1;day.setDate(day.getDate()+1)){const n1=new Date(day.getFullYear(),day.getMonth(),day.getDate(),22,0,0),n2=new Date(day.getFullYear(),day.getMonth(),day.getDate()+1,5,0,0);total+=overlapHours(d0,d1,n1,n2)}}return total}

function restAfter(r,sorted){const i=sorted.findIndex(x=>x.id===r.id);if(i<0||i===sorted.length-1)return null;return Math.max(0,(new Date(sorted[i+1].start)-new Date(r.end))/3600000)}

function dailyMap(calc,month){const map=new Map();for(const r of calc){if(month&&monthKey(r.startD)!==month)continue;const k=dateKey(r.startD);if(!map.has(k))map.set(k,{date:k,records:[],duration:0,work:0,by:{drive:0,wait:0,load:0,unload:0,break:0,other:0},maxContinuous:0,rolling24:0,breakShort:0,level:'good',returnMemo:[],outboundMemo:[]});const d=map.get(k);d.records.push(r);d.duration+=r.duration;d.work+=r.work;for(const t of Object.keys(d.by))d.by[t]+=r.by[t]||0;d.maxContinuous=Math.max(d.maxContinuous,r.maxContinuous);d.rolling24=Math.max(d.rolling24,r.rolling24);d.breakShort=Math.max(d.breakShort,r.breakShort);if(r.level==='bad')d.level='bad';else if(r.level==='warn'&&d.level==='good')d.level='warn';if(r.returnMemo)d.returnMemo.push(r.returnMemo);if(r.outboundMemo)d.outboundMemo.push(r.outboundMemo)}return map}

function biweekBlockStart(date){const base=new Date(settings.biweekStart+'T00:00:00');if(Number.isNaN(+base))return null;const days=Math.floor((new Date(dateKey(date)+'T00:00:00')-base)/86400000);const n=Math.floor(days/14);return new Date(base.getTime()+n*14*86400000)}
function applyBiweek(daily,allDaily){for(const [k,d] of daily){const bs=biweekBlockStart(new Date(k+'T00:00:00'));if(!bs){d.biweek='pending';continue}const be=new Date(bs.getTime()+14*86400000);let drive=0;for(const [ak,ad] of allDaily){const dt=new Date(ak+'T00:00:00');if(dt>=bs&&dt<be)drive+=ad.by.drive}d.biweekDrive=drive;const complete=be<=new Date();d.biweek=drive>88+1e-6?'bad':complete?'good':'pending'}}


const RULE_EPS=1e-9;
function fmtRuleHours(h){const sec=Math.max(0,Math.round(h*3600));return Math.floor(sec/3600)+':'+pad(Math.floor(sec/60)%60)+':'+pad(sec%60)}
function issue(code,severity,message){return {code,severity,message}}
function issuesLevel(issues){return issues.some(i=>i.severity==='bad')?'bad':issues.some(i=>i.severity==='warn')?'warn':issues.some(i=>i.severity==='pending')?'pending':'good'}
function uniqueIssues(items){return [...new Map(items.map(i=>[i.code+'|'+i.message,i])).values()]}
function issuesText(items){return uniqueIssues(items).map(i=>(i.severity==='bad'?'違反：':i.severity==='warn'?'注意：':'判定待ち：')+i.message).join('\n')}
function issuesHtml(items){return '<ul class="issue-list">'+uniqueIssues(items).map(i=>'<li class="issue-'+i.severity+'">'+escapeHtml((i.severity==='bad'?'違反：':i.severity==='warn'?'注意：':'判定待ち：')+i.message)+'</li>').join('')+'</ul>'}
function recordIssues(c){
  const items=[],bad=(code,text)=>items.push(issue(code,'bad',text)),warn=(code,text)=>items.push(issue(code,'warn',text));
  if(c.maxContinuous>4+RULE_EPS)bad('continuous','連続運転 '+fmtRuleHours(c.maxContinuous)+'（上限4:00・休憩のみで中断判定）');
  if(c.shortViolation)bad('short-breaks','10分未満の運転中断が3回以上連続');
  else if(c.shortCount>0)warn('short-review','10分未満の休憩あり：「おおむね10分」の条件を確認');
  if(c.nonBreakInterruption)warn('work-interruption','運転中断に荷役・待機等あり：休憩として自動算入しません');
  if(c.rolling24>15+RULE_EPS)bad('rolling24','始業から24時間の拘束 '+fmtRuleHours(c.rolling24)+'（上限15:00）');
  else if(c.rolling24>13+RULE_EPS)warn('rolling24-basic','始業から24時間の拘束 '+fmtRuleHours(c.rolling24)+'（原則13:00超）');
  if(c.duration>15+RULE_EPS)bad('shift-duration','1勤務の拘束 '+fmtRuleHours(c.duration)+'（15:00超）');
  else if(c.duration>13+RULE_EPS)warn('shift-basic','1勤務の拘束 '+fmtRuleHours(c.duration)+'（原則13:00超）');
  for(const [name,h] of [['勤務前',c.restBefore],['勤務後',c.restAfter]]){
    if(h==null)continue;
    if(h<9-RULE_EPS)bad('rest-'+name,name+'の休息 '+fmtRuleHours(h)+'（最低9:00）');
    else if(h<11-RULE_EPS)warn('rest-basic-'+name,name+'の休息 '+fmtRuleHours(h)+'（基本11:00未満）');
  }
  if(c.breakShort>RULE_EPS)bad('daily-break','同一始業日の休憩不足 '+Math.ceil(c.breakShort*60-1e-6)+'分（必要'+Math.round(c.breakReq*60)+'分）');
  if(c.overlapping)bad('overlap','勤務時刻が重複：記録を確認してください');
  if(c.coverageGap)warn('coverage','作業未記録の時間あり：運転・休憩の集計を確認');
  if(c.restAfter===null)items.push(issue('next-rest','pending','勤務後の休息は次の始業後に確定'));
  if(c.isLive)items.push(issue('live','pending','勤務中のため集計は暫定'));
  return items;
}
function calcContinuous(r,initial={}){
  const segs=[];
  for(const s of [...(r.segments||[])].sort((a,b)=>new Date(a.start)-new Date(b.start))){
    if(!s.start||!s.end||hoursBetween(s.start,s.end)===0)continue;
    const type=s.type==='drive'?'drive':s.type==='break'?'break':'work',prev=segs.at(-1);
    if(prev&&prev.type===type&&+new Date(prev.end)===+new Date(s.start))prev.end=s.end;else segs.push({type,start:s.start,end:s.end});
  }
  let current=initial.current||0,interrupt=initial.interrupt||0,shortRun=initial.shortRun||0,max=0,resets=0,shortCount=0,shortViolation=false,nonBreakInterruption=false;
  for(const s of segs){
    const h=hoursBetween(s.start,s.end),m=h*60;
    if(s.type==='drive'){current+=h;max=Math.max(max,current);continue}
    if(s.type==='work'){if(current>0)nonBreakInterruption=true;continue}
    if(m>=10-1e-6)shortRun=0;
    else if(current>0){shortCount++;shortRun++;if(shortRun>=3){shortViolation=true;interrupt=0;continue}}
    if(current<=0)continue;
    interrupt+=m;if(interrupt>=30-1e-6){current=0;interrupt=0;resets++}
  }
  return {maxContinuous:max,resets,shortCount,shortViolation,nonBreakInterruption,carry:{current,interrupt,shortRun}};
}
function rolling24For(r,all){
  const start=+new Date(r.start),end=start+86400000,spans=all.map(x=>[Math.max(start,+new Date(x.start)),Math.min(end,+new Date(x.end))]).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);
  let total=0,lastStart=null,lastEnd=0;
  for(const [a,b] of spans){if(lastStart===null){lastStart=a;lastEnd=b}else if(a<=lastEnd)lastEnd=Math.max(lastEnd,b);else{total+=lastEnd-lastStart;lastStart=a;lastEnd=b}}
  if(lastStart!==null)total+=lastEnd-lastStart;return total/3600000;
}
function levelForRecord(c){return issuesLevel(recordIssues(c))}
function calcRecords(list){
  const sorted=[...list].sort((a,b)=>new Date(a.start)-new Date(b.start)),totals=new Map();
  for(const r of sorted){const key=dateKey(r.start),t=totals.get(key)||{work:0,break:0};t.work+=workHours(r);t.break+=segmentHours(r,'break');totals.set(key,t)}
  let carry={};
  return sorted.map((r,index)=>{
    const previous=sorted[index-1],by={};for(const t of Object.keys(TYPES))by[t]=segmentHours(r,t);
    let gap=null;
    if(previous&&+new Date(r.start)>+new Date(previous.end)){gap=calcContinuous({segments:[{type:'break',start:previous.end,end:r.start}]},carry);carry=gap.carry}
    const cont=calcContinuous(r,carry);carry=cont.carry;
    if(gap){cont.shortCount+=gap.shortCount;cont.shortViolation ||= gap.shortViolation}
    const day=totals.get(dateKey(r.start)),breakReq=requiredBreak(day.work),breakShort=Math.max(0,breakReq-day.break);
    const c={...r,startD:new Date(r.start),endD:new Date(r.end),by,work:workHours(r),duration:durationHours(r),rolling24:rolling24For(r,sorted),restBefore:previous?hoursBetween(previous.end,r.start):null,restAfter:restAfter(r,sorted),breakReq,breakShort,...cont};
    c.overlapping=!!previous&&new Date(previous.end)>new Date(r.start);
    c.coverageGap=c.duration-Object.values(by).reduce((a,b)=>a+b,0)>RULE_EPS;
    c.issues=recordIssues(c);c.level=issuesLevel(c.issues);return c;
  });
}
function applyTwoDay(daily,allDaily){
  const todayEnd=new Date();todayEnd.setHours(0,0,0,0);
  for(const [k,d] of daily){
    const dt=new Date(k+'T00:00:00'),pd=new Date(dt),nd=new Date(dt),ne=new Date(dt);pd.setDate(pd.getDate()-1);nd.setDate(nd.getDate()+1);ne.setDate(ne.getDate()+2);
    const a=((allDaily.get(dateKey(pd))?.by.drive||0)+d.by.drive)/2,b=(d.by.drive+(allDaily.get(dateKey(nd))?.by.drive||0))/2;
    d.twoDayPrev=a;d.twoDayNext=b;
    d.twoDay=a>9+RULE_EPS&&b>9+RULE_EPS?'bad':a<=9+RULE_EPS||ne<=todayEnd?'good':'pending';
  }
}
function weekKey(date){const d=new Date(date+'T00:00:00');d.setDate(d.getDate()-(d.getDay()+6)%7);return dateKey(d)}
function aggregateForMonth(month){
  const calc=calcRecords(effectiveRecords()),allDaily=dailyMap(calc,null),daily=new Map();applyTwoDay(allDaily,allDaily);applyBiweek(allDaily,allDaily);
  const payMaps=new Map(),weekCounts=new Map();
  for(const d of allDaily.values())if(d.rolling24>14+RULE_EPS)weekCounts.set(weekKey(d.date),(weekCounts.get(weekKey(d.date))||0)+1);
  const months=new Map(),years=new Map();
  for(const [key,d] of [...allDaily].sort(([a],[b])=>a.localeCompare(b))){
    const m=key.slice(0,7),year=key.slice(0,4);months.set(m,(months.get(m)||0)+d.duration);years.set(year,(years.get(year)||0)+d.duration);
    d.monthRestraint=months.get(m);d.yearRestraint=years.get(year);
    const shared=[];
    if(d.twoDay==='bad')shared.push(issue('two-day','bad','2日平均運転：前日組 '+fmtRuleHours(d.twoDayPrev)+'・翌日組 '+fmtRuleHours(d.twoDayNext)+'（両方9:00超）'));
    else if(d.twoDay==='pending')shared.push(issue('two-day-pending','pending','2日平均運転は翌日終了後に確定'));
    if(d.biweek==='bad')shared.push(issue('biweek','bad','2週間の運転 '+fmtRuleHours(d.biweekDrive)+'（上限88:00）'));
    else if(d.biweek==='pending')shared.push(issue('biweek-pending','pending','2週間の運転は対象期間の終了後に確定'));
    if(d.monthRestraint>284+RULE_EPS)shared.push(issue('month','bad','月間拘束累計 '+fmtRuleHours(d.monthRestraint)+'（通常上限284:00）'));
    if(d.yearRestraint>3300+RULE_EPS)shared.push(issue('year','bad','年間拘束累計 '+fmtRuleHours(d.yearRestraint)+'（暦年・通常上限3300:00）'));
    const weekly=weekCounts.get(weekKey(key))||0;
    if(d.rolling24>14+RULE_EPS&&weekly>2)shared.push(issue('week14','warn','14時間超の拘束が週'+weekly+'日（月～日・週2回目安超）'));
    const previousDate=new Date(key+'T00:00:00');previousDate.setDate(previousDate.getDate()-1);
    if(d.rolling24>14+RULE_EPS&&(allDaily.get(dateKey(previousDate))?.rolling24||0)>14+RULE_EPS)shared.push(issue('consecutive14','warn','14時間超の拘束が連日発生'));
    for(const r of d.records)r.allIssues=uniqueIssues([...r.issues,...shared]);
    d.issues=uniqueIssues([...d.records.flatMap(r=>r.issues),...shared]);d.level=issuesLevel(d.issues);
    if(!payMaps.has(m))payMaps.set(m,applyPay(calc.filter(r=>monthKey(r.startD)===m)));
    d.ot=0;d.night=0;d.pay=0;for(const r of d.records){const p=payMaps.get(m).get(r.id);if(p){d.ot+=p.ot;d.night+=p.night;d.pay+=p.pay}}
    if(m===month)daily.set(key,d);
  }
  return {calc,daily,allDaily};
}

function twoDayText(v){return v==='bad'?'違反':v==='good'?'適合':'判定待ち'}
function biweekText(d){const t=d.biweek==='bad'?'違反':d.biweek==='good'?'適合':'集計中';return `${t}${Number.isFinite(d.biweekDrive)?` (${fmtHM(d.biweekDrive)}/88:00)`:''}`}
function levelBadge(level){return `<span class="badge ${level}">${level==='bad'?'違反':level==='warn'?'注意':level==='good'?'適合':'判定待ち'}</span>`}

function renderClock(){const d=new Date();$('liveClock').textContent=`${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())}（${dayLabel(d)}） ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`}
function renderStatus(){const now=localIso();$('shiftState').textContent=live?'勤務中':'未始業';$('shiftStartText').textContent=live?fmtDateTime(live.start):'-';$('activeTypeText').textContent=live?.active?TYPES[live.active.type]:'-';$('elapsedText').textContent=live?fmtHM(hoursBetween(live.start,now)):'0:00';$('startShiftBtn').disabled=!!live;$('endShiftBtn').disabled=!live;const latest=[...records].reverse().find(r=>r.source==='punch');const sg=live?.startGps||latest?.startGps,eg=live?null:latest?.endGps;$('startGpsText').textContent=startGpsDisplay(sg);$('startGpsText').className=gpsClass(sg);$('endGpsText').textContent=live?'勤務中（終業時に取得）':gpsDisplay(eg);$('endGpsText').className=gpsClass(eg);$('retryStartGpsBtn').disabled=!(live||latest)||gpsRequests.has((live||latest)?.id+':startGps');$('retryEndGpsBtn').disabled=!!live||!latest||gpsRequests.has(latest?.id+':endGps')}
function renderActivities(){const root=$('activityButtons');root.innerHTML='';for(const [type,name] of Object.entries(TYPES)){if(type==='drive')continue;const div=document.createElement('div');div.className='activity-card';div.innerHTML=`<b>${name}</b><div class="pair"><button class="btn start" data-start="${type}">開始</button><button class="btn end" data-end="${type}">終了</button></div>`;root.appendChild(div)}root.querySelectorAll('[data-start]').forEach(b=>{b.disabled=!live;b.onclick=()=>startActivity(b.dataset.start)});root.querySelectorAll('[data-end]').forEach(b=>{b.disabled=!live?.active||live.active.type!==b.dataset.end;b.onclick=()=>endActivity(b.dataset.end)});const tl=$('liveTimeline');if(!live){tl.innerHTML='<p class="hint">始業開始と同時に運転時間の計測を開始します。</p>';return}let rows=(live.segments||[]).map(s=>`<div class="timeline-row"><span>${escapeHtml(TYPES[s.type])}</span><span>${fmtTime(s.start)} ～ ${fmtTime(s.end)}</span><span>${fmtHM(hoursBetween(s.start,s.end))}</span></div>`).join('');if(live.active)rows+=`<div class="timeline-row"><span>${escapeHtml(TYPES[live.active.type])}</span><span class="running">${fmtTime(live.active.start)} ～ 継続中</span><span>${fmtHM(hoursBetween(live.active.start,localIso()))}</span></div>`;tl.innerHTML=rows||'<p class="hint">始業開始と同時に運転時間の計測を開始します。</p>'}
function renderRest(){if(restState?.start){$('restStatus').textContent=`休息中：${fmtDateTime(restState.start)} ～（${fmtHM(hoursBetween(restState.start,localIso()))}）`;$('restStartBtn').disabled=true;$('restEndBtn').disabled=false}else{const last=restLog.at(-1);$('restStatus').textContent=last?`前回：${fmtDateTime(last.start)} ～ ${fmtDateTime(last.end)}（${fmtHM(hoursBetween(last.start,last.end))}）`:'休息記録なし';$('restStartBtn').disabled=!!live;$('restEndBtn').disabled=true}}
function renderSettings(){$('hourlyRate').value=settings.hourlyRate;$('scheduledStart').value=settings.scheduledStart;$('scheduledEnd').value=settings.scheduledEnd;$('dailyStandardHours').value=settings.dailyStandardHours;$('biweekStart').value=settings.biweekStart}
function renderSummary(daily){let work=0,drive=0,ot=0,pay=0,restraint=0,bad=0,over14=0;for(const d of daily.values()){work+=d.work;drive+=d.by.drive;ot+=d.ot;pay+=d.pay;restraint+=d.duration;if(d.level==='bad')bad++;if(d.rolling24>14+1e-6)over14++}const rem=284-restraint;const data=[['拘束時間',fmtHM(restraint)],['実働',fmtHM(work)],['運転',fmtHM(drive)],['時間外',fmtHM(ot)],['概算時間外等',`${Math.round(pay).toLocaleString()}円`],[rem>=0?'284h残り':'284h超過',fmtHM(Math.abs(rem))],['14h超日',`${over14}日`],['違反日',`${bad}日`]];$('monthSummary').innerHTML=data.map(x=>`<div class="summary-item"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join('')}
function renderMonth(){const month=$('monthPicker').value||nowMonth();$('monthPicker').value=month;const {daily}=aggregateForMonth(month),[y,m]=month.split('-').map(Number),days=new Date(y,m,0).getDate(),body=$('monthBody');body.innerHTML='';for(let day=1;day<=days;day++){const k=`${y}-${pad(m)}-${pad(day)}`,d=daily.get(k),dt=new Date(y,m-1,day);const tr=document.createElement('tr');if(d?.level==='bad')tr.className='row-bad';else if(d?.level==='warn')tr.className='row-warn';if(!d){tr.innerHTML=`<td>${day}</td><td>${dayLabel(dt)}</td>${'<td></td>'.repeat(23)}`;body.appendChild(tr);continue}const starts=d.records.map(r=>fmtTime(r.start)).join('<br>'),ends=d.records.map(r=>fmtTime(r.end)).join('<br>'),sg=d.records.map(r=>escapeHtml(gpsDisplay(r.startGps))).join('<br>'),eg=d.records.map(r=>escapeHtml(gpsDisplay(r.endGps))).join('<br>'),rest=d.records.map(r=>r.restAfter===null?'判定待ち':r.restAfter<9?`違反 ${fmtHM(r.restAfter)}`:r.restAfter<11?`注意 ${fmtHM(r.restAfter)}`:`適合 ${fmtHM(r.restAfter)}`).join('<br>');tr.innerHTML=`<td>${day}</td><td>${dayLabel(dt)}</td><td>${starts}</td><td class="wrap gps-cell">${sg}</td><td>${ends}</td><td class="wrap gps-cell">${eg}</td><td>${fmtHM(d.duration)}</td><td>${fmtHM(d.work)}</td><td>${fmtHM(d.by.drive)}</td><td>${fmtHM(d.by.wait)}</td><td>${fmtHM(d.by.load)}</td><td>${fmtHM(d.by.unload)}</td><td>${fmtHM(d.by.break)}</td><td>${fmtHM(d.by.other)}</td><td>${fmtHM(d.ot)}</td><td>${fmtHM(d.night)}</td><td>${Math.round(d.pay).toLocaleString()}円</td><td>${d.breakShort>0?`不足${Math.round(d.breakShort*60)}分`:'適合'}</td><td>${d.rolling24>15?'違反':d.rolling24>13?'注意':'適合'} ${fmtHM(d.rolling24)}</td><td>${rest}</td><td>${twoDayText(d.twoDay)}</td><td>${biweekText(d)}</td><td class="wrap overall-cell">${levelBadge(d.level)}${issuesHtml(d.issues)}</td><td class="wrap">${escapeHtml(d.returnMemo.join(' / '))}</td><td class="wrap">${escapeHtml(d.outboundMemo.join(' / '))}</td>`;body.appendChild(tr)}renderSummary(daily)}
function renderHistory(){
  const calc=aggregateForMonth($('monthPicker').value||nowMonth()).calc.filter(r=>!r.isLive).reverse(),root=$('history');root.replaceChildren();
  if(!calc.length){const p=document.createElement('p');p.className='hint';p.textContent='勤務履歴はありません。';root.appendChild(p);return}
  for(const r of calc.slice(0,60)){
    const item=document.createElement('div');item.className='history-item';
    const title=document.createElement('div');title.className='history-title';title.textContent=fmtDateTime(r.start)+' ～ '+fmtDateTime(r.end);
    const meta=document.createElement('div');meta.className='history-meta';meta.style.whiteSpace='pre-line';
    meta.textContent='拘束 '+fmtHM(r.duration)+' ／ 実働 '+fmtHM(r.work)+' ／ 運転 '+fmtHM(r.by.drive)+' ／ 休憩 '+fmtHM(r.by.break)+'\n📍 '+gpsDisplay(r.startGps)+'\n🏁 '+gpsDisplay(r.endGps)+'\n復路：'+(r.returnMemo||'')+'\n往路：'+(r.outboundMemo||'');
    const badge=document.createElement('span');const level=issuesLevel(r.allIssues||r.issues);badge.className='badge '+level;badge.textContent=level==='bad'?'違反':level==='warn'?'注意':level==='pending'?'判定待ち':'適合';
    const note=document.createElement('p');note.className='history-issues';note.style.whiteSpace='pre-line';note.textContent=issuesText(r.allIssues||r.issues);
    const actions=document.createElement('div');actions.className='history-actions';
    for(const [label,fn,danger] of [['開始GPS再取得',()=>window.retryRecordStart(r.id)],['終了GPS再取得',()=>window.retryRecordEnd(r.id)],['削除',()=>window.deleteRecord(r.id),true]]){
      const b=document.createElement('button');b.className='btn small '+(danger?'danger':'soft');b.textContent=label;b.disabled=!danger&&gpsRequests.has(r.id+':'+(label.startsWith('開始')?'startGps':'endGps'));b.addEventListener('click',fn);actions.appendChild(b);
    }
    item.append(title,meta,badge,note,actions);root.appendChild(item);
  }
}
function renderAppStatus(){$('appStatus').textContent=`${navigator.onLine?'オンライン':'オフライン'} ／ v${APP_VERSION} ／ データ保存先：この端末のブラウザ`}
function renderAll(){renderStatus();renderActivities();renderRest();renderMonth();renderHistory();renderAppStatus()}

window.retryRecordStart=async id=>retryGps(id,'startGps');
window.retryRecordEnd=async id=>setEndGpsForRecord(id);
window.deleteRecord=id=>{if(!confirm('この勤務記録を削除しますか？'))return;records=records.filter(r=>r.id!==id);store(KEYS.records,records);renderAll()};

function saveSettings(){
  try{
    const candidate=validateSettings({hourlyRate:Number($('hourlyRate').value),scheduledStart:$('scheduledStart').value,scheduledEnd:$('scheduledEnd').value,dailyStandardHours:Number($('dailyStandardHours').value),biweekStart:$('biweekStart').value});
    store(KEYS.settings,candidate);settings=candidate;renderMonth();alert('設定を保存しました');
  }catch(e){alert('設定を保存できません：'+e.message)}
}
function exportCsv(){const month=$('monthPicker').value||nowMonth(),{daily}=aggregateForMonth(month),[y,m]=month.split('-').map(Number),days=new Date(y,m,0).getDate();const out=[['日付','曜日','出勤','開始場所','開始精度m','退勤','終了場所','終了精度m','拘束','実働','運転','待機','荷積','荷卸','休憩','その他','時間外','深夜','概算時間外等円','休憩判定','24h拘束','休息','2日平均','2週平均','総合','復路','往路']];for(let day=1;day<=days;day++){const k=`${y}-${pad(m)}-${pad(day)}`,d=daily.get(k),dt=new Date(y,m-1,day);if(!d){out.push([k,dayLabel(dt),...Array(25).fill('')]);continue}const sg=d.records.map(r=>r.startGps||{}),eg=d.records.map(r=>r.endGps||{});out.push([k,dayLabel(dt),d.records.map(r=>fmtTime(r.start)).join('/'),sg.map(g=>startGpsDisplay(g)).join(' / '),sg.map(g=>g.accuracy??'').join('/'),d.records.map(r=>fmtTime(r.end)).join('/'),eg.map(g=>gpsDisplay(g)).join(' / '),eg.map(g=>g.accuracy??'').join('/'),fmtHM(d.duration),fmtHM(d.work),fmtHM(d.by.drive),fmtHM(d.by.wait),fmtHM(d.by.load),fmtHM(d.by.unload),fmtHM(d.by.break),fmtHM(d.by.other),fmtHM(d.ot),fmtHM(d.night),Math.round(d.pay),d.breakShort>0?`不足${Math.round(d.breakShort*60)}分`:'適合',`${d.rolling24>15?'違反':d.rolling24>13?'注意':'適合'} ${fmtHM(d.rolling24)}`,d.records.map(r=>r.restAfter===null?'判定待ち':fmtHM(r.restAfter)).join('/'),twoDayText(d.twoDay),biweekText(d),[d.level==='bad'?'違反':d.level==='warn'?'注意':d.level==='pending'?'判定待ち':'適合',issuesText(d.issues)].filter(Boolean).join('\n'),d.returnMemo.join(' / '),d.outboundMemo.join(' / ')])}downloadBlob('\uFEFF'+out.map(r=>r.map(csvCell).join(',')).join('\r\n'),`kintai_${month}.csv`,'text/csv;charset=utf-8')}
function downloadBlob(content,name,type){const b=new Blob([content],{type}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
function backup(){const data={app:'truck-kintai-v8',version:APP_VERSION,exportedAt:new Date().toISOString(),records,settings,live,restState,restLog};downloadBlob(JSON.stringify(data,null,2),`kintai_backup_${dateKey(new Date())}.json`,'application/json')}
function recoverRestore(){
  const raw=localStorage.getItem(RESTORE_JOURNAL);if(!raw)return;
  const previous=JSON.parse(raw);
  for(const key of [KEYS.records,KEYS.settings,KEYS.live,KEYS.rest,KEYS.restLog]){
    if(!Object.hasOwn(previous,key))throw new Error('復元保護データが不正です');
    if(previous[key]===null)localStorage.removeItem(key);else localStorage.setItem(key,previous[key]);
  }
  localStorage.removeItem(RESTORE_JOURNAL);
}
function validateSettings(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('設定形式が違います');
  const s={hourlyRate:value.hourlyRate,scheduledStart:value.scheduledStart,scheduledEnd:value.scheduledEnd,dailyStandardHours:value.dailyStandardHours,biweekStart:value.biweekStart};
  if(!Number.isFinite(s.hourlyRate)||s.hourlyRate<0||s.hourlyRate>1000000)throw new Error('基礎時給が不正です');
  if(!Number.isFinite(s.dailyStandardHours)||s.dailyStandardHours<1||s.dailyStandardHours>12)throw new Error('所定実働が不正です');
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.scheduledStart)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.scheduledEnd)||s.scheduledStart===s.scheduledEnd)throw new Error('所定開始・終了を異なる有効な時刻にしてください');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s.biweekStart)||!validTimestamp(s.biweekStart+'T00:00:00'))throw new Error('起算日が不正です');
  return s;
}
function validTimestamp(v){
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/.test(v)||!Number.isFinite(+new Date(v)))return false;
  const [y,m,d]=v.slice(0,10).split('-').map(Number),dt=new Date(Date.UTC(y,m-1,d));return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d;
}
function validateBackup(input){
  const fail=message=>{throw new Error(message)};
  if(!input||typeof input!=='object'||!Array.isArray(input.records))fail('バックアップ形式が違います');
  if(input.app!=null&&!['truck-kintai-v8','truck-kintai-v6'].includes(input.app))fail('このアプリのバックアップではありません');
  const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
  if(input.settings!=null&&!object(input.settings))fail('設定形式が違います');
  const ids=new Set();
  function identifier(value){
    const id=typeof value==='number'?String(value):value;
    if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(id)||id==='__live__'||ids.has(id))fail('記録IDが不正または重複しています');ids.add(id);return id;
  }
  function time(value){if(!validTimestamp(value))fail('日時が不正です');return value}
  function gps(g){
    if(g==null)return null;if(!object(g)||!['ok','error','pending'].includes(g.status))fail('GPS形式が不正です');
    const result={status:g.status};
    for(const k of ['error','requestedAt','positionAt','address','prefecture','municipality','locality','muniCd','reverseError','attemptAt','retryError'])if(g[k]!=null){if(typeof g[k]!=='string'||g[k].length>2000)fail('GPS情報が不正です');result[k]=g[k]}
    for(const [k,min,max] of [['lat',-90,90],['lon',-180,180],['accuracy',0,10000000]])if(g[k]!=null){if(!Number.isFinite(g[k])||g[k]<min||g[k]>max)fail('GPS座標が不正です');result[k]=g[k]}
    for(const k of ['lateAcquisition'])if(g[k]!=null){if(typeof g[k]!=='boolean')fail('GPS形式が不正です');result[k]=g[k]}
    if(g.status==='ok'&&(!Number.isFinite(g.lat)||!Number.isFinite(g.lon)))fail('GPS座標がありません');
    if(result.status==='pending'){result.status='error';result.error='バックアップ時の取得は中断されています。再取得してください'}
    return result;
  }
  function shift(r,isLive=false){
    if(!object(r)||!Array.isArray(r.segments))fail('勤務記録の形式が違います');
    if(r.source!=null&&r.source!=='punch')fail('未対応の勤務記録形式です');
    const out={id:identifier(r.id),source:'punch',start:time(r.start),segments:[]};
    if(!isLive){out.end=time(r.end);if(new Date(out.end)<new Date(out.start))fail('終業が始業より前です')}
    let previous=+new Date(out.start);
    for(const segment of r.segments){
      if(!object(segment)||!Object.hasOwn(TYPES,segment.type))fail('作業区分が不正です');
      const start=time(segment.start),end=time(segment.end),a=+new Date(start),b=+new Date(end);
      if(a<previous||b<a||(!isLive&&b>+new Date(out.end)))fail('作業区間が重複しているか勤務範囲外です');
      const cleaned={type:segment.type,start,end};
      if(segment.id!=null)cleaned.id=identifier(segment.id);
      if(segment.startGps!=null)cleaned.startGps=gps(segment.startGps);
      if(segment.endGps!=null)cleaned.endGps=gps(segment.endGps);
      out.segments.push(cleaned);previous=b;
    }
    if(isLive){
      if(r.active!=null){if(!object(r.active)||!Object.hasOwn(TYPES,r.active.type))fail('進行中の作業が不正です');out.active={type:r.active.type,start:time(r.active.start)};if(+new Date(out.active.start)<previous)fail('進行中の作業が重複しています')}
      else out.active={type:'drive',start:out.segments.at(-1)?.end||out.start};
      if(r.active?.id!=null)out.active.id=identifier(r.active.id);
      if(r.active?.startGps!=null)out.active.startGps=gps(r.active.startGps);
      if(+new Date(out.active.start)>Date.now())fail('進行中の作業日時が未来です');
    }
    for(const k of ['returnPref','returnCity','returnExtra','outPref','outCity','outExtra','returnMemo','outboundMemo']){
      if(r[k]!=null&&(typeof r[k]!=='string'||r[k].length>10000))fail('運行メモが不正です');out[k]=r[k]||'';
    }
    out.startGps=gps(r.startGps);out.endGps=gps(r.endGps);return out;
  }
  const candidate={records:input.records.map(r=>shift(r)),settings:validateSettings({...settings,...(input.settings||{})}),live:input.live==null?null:shift(input.live,true),restState:null,restLog:[]};
  const chronological=[...candidate.records,...(candidate.live?[candidate.live]:[])].sort((a,b)=>new Date(a.start)-new Date(b.start));
  for(let i=1;i<chronological.length;i++)if(!chronological[i-1].end||+new Date(chronological[i].start)<+new Date(chronological[i-1].end))fail('勤務記録が重複しています');
  if(input.restLog!=null&&!Array.isArray(input.restLog))fail('休息履歴が不正です');
  candidate.restLog=(input.restLog||[]).map(r=>{if(!object(r))fail('休息履歴が不正です');const out={id:identifier(r.id),start:time(r.start),end:time(r.end)};if(new Date(out.end)<new Date(out.start))fail('休息終了が開始より前です');return out});
  if(input.restState!=null){if(!object(input.restState))fail('休息状態が不正です');candidate.restState={start:time(input.restState.start)}}
  // Repair old backups that contain both a live shift and a running rest timer.
  if(candidate.live&&candidate.restState){
    const start=candidate.restState.start;
    if(new Date(start)>new Date(candidate.live.start))fail('勤務中の休息開始が不正です');
    candidate.restLog.push({id:uid(),start,end:candidate.live.start});candidate.restState=null;
  }
  calcRecords(candidate.records);return candidate;
}
function commitBackup(candidate){
  const pairs=[[KEYS.records,candidate.records],[KEYS.settings,candidate.settings],[KEYS.live,candidate.live],[KEYS.rest,candidate.restState],[KEYS.restLog,candidate.restLog]];
  const previous={};for(const [key] of pairs)previous[key]=localStorage.getItem(key);
  // The journal remains until all writes succeed, including across a tab/browser interruption.
  localStorage.setItem(RESTORE_JOURNAL,JSON.stringify(previous));
  try{for(const [key,value] of pairs)store(key,value);localStorage.removeItem(RESTORE_JOURNAL)}
  catch(e){try{recoverRestore()}catch(rollbackError){throw new Error('保存に失敗しました。元データは復元保護領域に保持しています。空き容量を確保して再読み込みしてください')}throw e}
  dataEpoch++;gpsRequests.clear();
  records=candidate.records;settings=candidate.settings;live=candidate.live;restState=candidate.restState;restLog=candidate.restLog;
}
function restoreFile(file){
  const fr=new FileReader();
  fr.onerror=()=>alert('復元できません：ファイルを読み込めません');
  fr.onload=()=>{
    try{const candidate=validateBackup(JSON.parse(fr.result));commitBackup(candidate)}
    catch(e){alert('復元できません：'+e.message);return}
    loadRouteFromLive();renderSettings();renderAll();alert('復元しました');
  };
  fr.readAsText(file);
}
function clearAll(){if(!confirm('勤怠・GPS・設定をすべて削除します。よろしいですか？'))return;dataEpoch++;gpsRequests.clear();for(const k of Object.values(KEYS))localStorage.removeItem(k);for(const k of Object.values(LEGACY)){localStorage.removeItem(k);localStorage.removeItem(k.replace('_v6_','_v7_'))}for(const k of ['truck_kintai_v8_migrated_801','truck_kintai_v8_migrated_802'])localStorage.removeItem(k);records=[];settings={hourlyRate:1200,scheduledStart:'08:00',scheduledEnd:'17:00',dailyStandardHours:8,biweekStart:'2026-01-05'};live=null;restState=null;restLog=[];loadRouteFromLive();renderSettings();renderAll()}

function bind(){
  $('startShiftBtn').onclick=startShift;$('endShiftBtn').onclick=endShift;$('retryStartGpsBtn').onclick=retryStartGps;$('retryEndGpsBtn').onclick=retryEndGps;$('restStartBtn').onclick=startRest;$('restEndBtn').onclick=endRest;$('saveSettingsBtn').onclick=saveSettings;$('refreshBtn').onclick=renderMonth;$('csvBtn').onclick=exportCsv;$('printBtn').onclick=()=>window.print();$('backupBtn').onclick=backup;$('restoreBtn').onclick=()=>$('restoreFile').click();$('restoreFile').onchange=e=>{if(e.target.files[0])restoreFile(e.target.files[0]);e.target.value=''};$('clearTestBtn').onclick=clearAll;$('monthPicker').onchange=renderMonth;
  $('returnPref').addEventListener('change',async()=>{await populateCity('return','');syncRouteToLive()});
  $('outPref').addEventListener('change',async()=>{await populateCity('out','');syncRouteToLive()});
  $('returnCity').addEventListener('change',syncRouteToLive);$('outCity').addEventListener('change',syncRouteToLive);
  $('returnExtra').addEventListener('input',syncRouteToLive);$('outExtra').addEventListener('input',syncRouteToLive);
  window.addEventListener('online',async()=>{renderAppStatus();await Promise.all(['return','out'].map(p=>populateCity(p,$(p+'City').value)));syncRouteToLive();void retryMissingAddresses()});window.addEventListener('offline',renderAppStatus);
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('installBtn').disabled=false});$('installBtn').onclick=async()=>{if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null}else alert('Chromeのメニューから「アプリをインストール」または「ホーム画面に追加」を選んでください。')};
}
function initPwa(){if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').then(r=>r.update()).catch(e=>console.warn(e))}}
async function init(){migrateLegacy();ensureAutoDriveLive();if(live&&restState)finishRestAt(live.start);recoverPendingGps();$('monthPicker').value=nowMonth();renderSettings();bind();const routes=initRouteSelectors();renderAll();renderClock();setInterval(()=>{renderClock();if(live){renderStatus();renderActivities()}if(restState)renderRest()},1000);setInterval(()=>{if(live)renderMonth()},15000);initPwa();await routes;void retryMissingAddresses()}

document.addEventListener('DOMContentLoaded',init);
