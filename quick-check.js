'use strict';

// Read the same punch records as the attendance screen. No duplicate time entry.
const QUICK_LABELS={good:'範囲内',warn:'注意',bad:'基準超過',pending:'確認待ち'};
let quickView='day';
function quickDate(key,offset=0){const d=new Date(key+'T00:00:00');d.setDate(d.getDate()+offset);return d}
function quickDates(a,b){const out=[];for(let d=new Date(a);d<b;d.setDate(d.getDate()+1))out.push(dateKey(d));return out}
function quickPrefs(){return settings.quickCheck||{daysOff:[],exceptions:{}}}
function quickCoverage(a,b,all){
  const off=new Set(quickPrefs().daysOff),worked=new Set(all.map(r=>dateKey(r.start)));
  return quickDates(a,b).filter(k=>!worked.has(k)&&!off.has(k));
}
function quickDrive(all,a,b){return all.reduce((sum,r)=>sum+(r.segments||[]).filter(s=>s.type==='drive').reduce((n,s)=>n+overlapHours(s.start,s.end,a,b),0),0)}
function quickModel(key,now=new Date()){
  const calc=calcRecords(effectiveRecords()),dayStart=quickDate(key),dayEnd=quickDate(key,1),day=calc.filter(r=>dateKey(r.start)===key);
  const prefs=quickPrefs(),exception=prefs.exceptions[key]||{},off=prefs.daysOff.includes(key)&&!day.length;
  const before=quickDate(key,-1),previous=calc.filter(r=>dateKey(r.start)===dateKey(before));
  const anchor=day.length?new Date(day[0].start):dayStart,previousAnchor=previous.length?new Date(previous[0].start):before;
  const previousEnd=new Date(+previousAnchor+48*3600000),nextEnd=new Date(+anchor+48*3600000);
  const prevAvg=quickDrive(calc,previousAnchor,previousEnd)/2,nextAvg=quickDrive(calc,anchor,nextEnd)/2;
  const windowKnown=(a,b)=>{
    const end=new Date(b);if(end.getHours()||end.getMinutes()||end.getSeconds())end.setDate(end.getDate()+1);end.setHours(0,0,0,0);
    return b<=now&&!quickCoverage(quickDate(dateKey(a)),end,calc).length&&!calc.some(r=>r.isLive&&new Date(r.start)<b&&new Date(r.end)>a);
  };
  const prevKnown=windowKnown(previousAnchor,previousEnd),nextKnown=windowKnown(anchor,nextEnd);
  const twoLevel=prevAvg>9+RULE_EPS&&nextAvg>9+RULE_EPS?'bad':(prevKnown&&prevAvg<=9+RULE_EPS)||(nextKnown&&nextAvg<=9+RULE_EPS)?'good':'pending';
  const weekStart=quickDate(weekKey(key)),weekEnd=new Date(+weekStart+7*86400000),block=biweekBlockStart(dayStart),blockEnd=new Date(+block+14*86400000);
  const monthStart=new Date(dayStart.getFullYear(),dayStart.getMonth(),1),monthEnd=new Date(dayStart.getFullYear(),dayStart.getMonth()+1,1);
  const yearStart=new Date(dayStart.getFullYear(),0,1),yearEnd=new Date(dayStart.getFullYear()+1,0,1);
  function period(start,end,limit,kind='duration'){
    const rows=calc.filter(r=>new Date(r.start)>=start&&new Date(r.start)<end),value=rows.reduce((n,r)=>n+(kind==='drive'?r.by.drive:r.duration),0),missing=quickCoverage(start,end,calc);
    const level=value>limit+RULE_EPS?'bad':end>now||missing.length||rows.some(r=>r.isLive)?'pending':'good';
    return {start,end,value,limit,missing,rows,level};
  }
  const week=period(weekStart,weekEnd,Infinity),biweek=period(block,blockEnd,88,'drive'),month=period(monthStart,monthEnd,284),year=period(yearStart,yearEnd,3300);
  const rolling=Math.max(0,...day.map(r=>r.rolling24)),continuous=Math.max(0,...day.map(r=>r.maxContinuous)),drive=day.reduce((n,r)=>n+r.by.drive,0),duration=day.reduce((n,r)=>n+r.duration,0);
  const issues=uniqueIssues(day.flatMap(r=>r.issues));
  if(!day.length&&!off)issues.push(issue('missing-day','pending','この日の打刻がありません。休日なら「休日として記録」を押してください。'));
  if(day.length&&(!previous.length&&!prefs.daysOff.includes(dateKey(before))))issues.push(issue('missing-prev','pending','前日の勤務・休日が未記録です。勤務前の休息を確認してください。'));
  if(day.some(r=>+new Date(r.start)+86400000>+now))issues.push(issue('open24','pending','始業から24時間が経過するまで拘束時間は暫定です。'));
  if(day.length&&twoLevel!=='good')issues.push(issue('quick-two',twoLevel,'2日平均運転：前日組 '+fmtHM(prevAvg)+'／翌日組 '+fmtHM(nextAvg)+(twoLevel==='bad'?'（両方9時間超）':'（48時間の対象記録・期間終了を確認）')));
  for(const [name,p] of [['2週間の運転',biweek],['月間拘束',month],['年間拘束',year]])if(p.level!=='good')issues.push(issue('quick-'+name,p.level,name+' '+fmtHM(p.value)+' / '+fmtHM(p.limit)+(p.level==='bad'?'（通常上限超過）':'（未記録日または集計中の期間あり）')));
  const over14=week.rows.filter(r=>r.rolling24>14+RULE_EPS).length;
  if(over14>2)issues.push(issue('quick-week14','warn','14時間超の拘束が週'+over14+'回（月～日・週2回の目安を超過）'));
  if(exception.longDistance)issues.push(issue('long-review','warn','長距離特例を確認中：通常基準の表示は維持しています。週内全運行450km以上・住所地外の休息・週2回以内・運行後の回復休息を確認してください。'));
  if(exception.unexpected)issues.push(issue('event-review','warn','予期し得ない事象あり：客観的記録と対応時間の確認が必要です。対応時間は自動控除しません。'));
  return {key,calc,day,off,exception,issues,level:issuesLevel(issues),rolling,continuous,drive,duration,prevAvg,nextAvg,twoLevel,week,biweek,month,year,over14};
}
function quickBadge(level){return '<span class="quick-badge '+level+'">'+QUICK_LABELS[level]+'</span>'}
function quickRow(title,value,level,note){return '<div class="quick-row"><div><b>'+escapeHtml(title)+'</b><p>'+escapeHtml(note)+'</p></div><div class="quick-value">'+escapeHtml(value)+'<br>'+quickBadge(level)+'</div></div>'}
function quickIssueLevel(model,codes,fallback='good'){return issuesLevel(model.issues.filter(i=>codes.some(c=>i.code.startsWith(c))))==='good'?fallback:issuesLevel(model.issues.filter(i=>codes.some(c=>i.code.startsWith(c))))}
function quickPeriodHtml(title,p){return quickRow(title,fmtHM(p.value)+' / '+fmtHM(p.limit),p.level,dateKey(p.start)+' ～ '+dateKey(new Date(+p.end-86400000))+'・未記録 '+p.missing.length+'日')}
function renderQuickCheck(){
  if(!$('quickDate'))return;
  const key=$('quickDate').value||dateKey(new Date());if(!validTimestamp(key+'T00:00:00'))return;
  const m=quickModel(key);$('quickTotal').className='quick-total '+m.level;
  $('quickTotal').textContent=QUICK_LABELS[m.level];
  $('quickSummary').textContent=m.day.some(r=>r.isLive)?'勤務中の暫定判定':m.day.length?'保存済みの打刻から確認':m.off?'休日として記録済み':'打刻・休日の記録を待っています';
  $('quickDayOff').textContent=m.off?'休日の記録を取り消す':'休日として記録';
  const occupied=m.calc.some(r=>overlapHours(r.start,r.end,quickDate(key),quickDate(key,1))>0);
  $('quickDayOff').disabled=!!m.day.length||occupied||quickDate(key,1)>new Date();
  $('quickLong').checked=!!m.exception.longDistance;$('quickUnexpected').checked=!!m.exception.unexpected;
  const labels={day:'選んだ日',week:'週間',month:'月間'};
  document.querySelectorAll('[data-quick-view]').forEach(b=>{b.classList.toggle('selected',b.dataset.quickView===quickView);b.setAttribute('aria-pressed',String(b.dataset.quickView===quickView))});
  $('quickDetailTitle').textContent=labels[quickView];
  let html='';
  if(quickView==='day'){
    html='<div class="quick-metrics"><div><span>拘束（勤務合計）</span><strong>'+fmtHM(m.duration)+'</strong></div><div><span>運転</span><strong>'+fmtHM(m.drive)+'</strong></div></div>';
    const empty=m.day.length?'good':'pending';
    html+=quickRow('始業から24時間の拘束',fmtHM(m.rolling),quickIssueLevel(m,['rolling24','open24'],empty),'原則13時間・最大15時間。次の勤務も含む');
    const last=m.day.at(-1),first=m.day[0];
    for(const [label,h,code] of [['勤務前の休息',first?.restBefore,'勤務前'],['勤務後の休息',last?.restAfter,'勤務後']])html+=quickRow(label,h==null?'未確定':fmtHM(h),h==null?'pending':quickIssueLevel(m,['rest-'+code,'rest-basic-'+code,code==='勤務前'?'missing-prev':'next-rest']),'11時間以上が基本・最低9時間');
    html+=quickRow('最大連続運転',fmtHM(m.continuous),quickIssueLevel(m,['continuous','short','work-interruption','coverage'],empty),'4時間以内。30分の中断は打刻した休憩区間で確認');
    html+=quickRow('2日平均の運転','前 '+fmtHM(m.prevAvg)+' / 翌 '+fmtHM(m.nextAvg),m.day.length?m.twoLevel:'pending','前日組・翌日組の48時間窓を比較。両方9時間超で超過');
    html+=quickPeriodHtml('2週平均の運転（2週間合計）',m.biweek);
  }else if(quickView==='week'){
    html=quickRow('週の拘束 / 運転',fmtHM(m.week.value)+' / '+fmtHM(m.week.rows.reduce((n,r)=>n+r.by.drive,0)),'pending','月曜日～日曜日の参考集計（週の拘束上限判定ではありません）');
    html+=quickRow('14時間超の拘束',m.over14+'回',m.over14>2?'warn':'pending','週2回以内が目安。週内の記録を確認');
    html+=quickPeriodHtml('2週間の運転',m.biweek);
    html+='<div class="quick-days">'+quickDates(m.week.start,m.week.end).map(k=>'<button type="button" class="btn soft" data-quick-date="'+k+'">'+k.slice(5)+'<span>'+(m.calc.some(r=>dateKey(r.start)===k)?'打刻あり':quickPrefs().daysOff.includes(k)?'休日':'未記録')+'</span></button>').join('')+'</div>';
  }else{
    html=quickPeriodHtml('月間拘束',m.month)+quickPeriodHtml('年間拘束（暦年）',m.year);
    html+='<p class="quick-note">始業日・始業月に計上。年は1月～12月で集計します。会社の起算日が異なる場合は参考値です。労使協定による月310時間・年3,400時間への延長は自動適用しません。</p>';
  }
  $('quickDetails').innerHTML=html;
  $('quickReasons').replaceChildren();
  for(const i of m.issues){const li=document.createElement('li');li.className='issue-'+i.severity;li.textContent=QUICK_LABELS[i.severity]+'：'+i.message;$('quickReasons').appendChild(li)}
  if(!m.issues.length){const li=document.createElement('li');li.textContent='登録された通常ルールの確認項目は範囲内です。';$('quickReasons').appendChild(li)}
}
function saveQuickPrefs(candidate){
  try{const next=validateSettings({...settings,quickCheck:candidate});store(KEYS.settings,next);settings=next;$('quickSaveStatus').textContent='保存しました。バックアップにも含まれます。'}
  catch(e){$('quickSaveStatus').textContent='保存できません：'+e.message}
  renderQuickCheck();
}
function initQuickCheck(){
  $('quickDate').value=dateKey(new Date());
  $('quickDate').addEventListener('change',renderQuickCheck);
  $('quickToday').onclick=()=>{$('quickDate').value=dateKey(new Date());renderQuickCheck()};
  $('quickCheck').addEventListener('click',e=>{const tab=e.target.closest('[data-quick-view]'),day=e.target.closest('[data-quick-date]');if(tab){quickView=tab.dataset.quickView;renderQuickCheck()}if(day){$('quickDate').value=day.dataset.quickDate;quickView='day';renderQuickCheck()}});
  $('quickDayOff').onclick=()=>{const k=$('quickDate').value,p=structuredCloneSafe(quickPrefs());p.daysOff=p.daysOff.includes(k)?p.daysOff.filter(x=>x!==k):[...p.daysOff,k];saveQuickPrefs(p)};
  for(const id of ['quickLong','quickUnexpected'])$(id).onchange=()=>{const k=$('quickDate').value,p=structuredCloneSafe(quickPrefs());p.exceptions[k]={longDistance:$('quickLong').checked,unexpected:$('quickUnexpected').checked};saveQuickPrefs(p)};
  renderQuickCheck();
}
document.addEventListener('DOMContentLoaded',initQuickCheck);
