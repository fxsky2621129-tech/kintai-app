'use strict';

// A conservative view over the existing punch records; never synthesize driving
// intervals from a daily total or silently treat missing history as a holiday.
function quickModel(key,data){
  const {calc,allDaily}=data,d=allDaily.get(key),weekStart=weekKey(key),weekEnd=quickDateOffset(weekStart,6);
  const weekDays=Array.from({length:7},(_,i)=>{const date=quickDateOffset(weekStart,i);return {date,day:allDaily.get(date)}});
  const over14=weekDays.filter(x=>x.day?.rolling24>14+RULE_EPS).length;
  if(!d)return {day:null,weekDays,weekStart,weekEnd,over14,rows:[],level:'pending'};
  const rows=[],add=(title,level,text)=>rows.push({title,level,text});
  const flags=d.records.some(r=>r.checkConditions?.longDistance||r.checkConditions?.unforeseen);
  const duration=Math.max(d.rolling24,...d.records.map(r=>r.duration));
  add('1日の拘束',duration>15+RULE_EPS?'bad':duration>13+RULE_EPS?'warn':'good',fmtHM(duration)+' / 原則13:00・最大15:00（始業から24時間内の別勤務も合算）');
  const before=d.records.map(r=>r.restBefore),after=d.records.map(r=>r.restAfter),rests=[...before,...after].filter(x=>x!=null);
  add('勤務間の休息',rests.some(h=>h<9-RULE_EPS)?'bad':rests.some(h=>h<11-RULE_EPS)?'warn':before.some(h=>h==null)||after.some(h=>h==null)?'pending':'good','勤務前 '+before.map(h=>h==null?'未確認':fmtHM(h)).join(' / ')+'・勤務後 '+after.map(h=>h==null?'次の始業待ち':fmtHM(h)).join(' / ')+'（基本11:00・最低9:00）');
  const two=quickTwoDay(d,calc);
  add('2日平均の運転',two.level,two.pairs.map(p=>'前側 '+fmtHM(p.prev)+'・後側 '+fmtHM(p.next)).join(' / ')+' / 1日平均9:00以内。前日の始業から48時間と当日の始業から48時間を集計。前日記録なしは前側未確認、未完了の範囲は暫定。');
  const bs=biweekBlockStart(new Date(key+'T00:00:00'));
  if(bs){const be=new Date(+bs+14*86400000),drive=quickDrivingWindow(calc,bs,be);add('2週平均の運転',drive>88+RULE_EPS?'bad':quickRangeComplete(bs,be,calc)?'good':'pending',fmtHM(drive/2)+' / 週44:00（'+dateKey(bs)+' ～ '+dateKey(new Date(+be-1))+'、運転合計 '+fmtHM(drive)+'）')}
  else add('2週平均の運転','pending','設定で起算日を確認してください');
  add('連続運転・運転中断',d.maxContinuous>4+RULE_EPS||d.records.some(r=>r.shortViolation)?'bad':d.records.some(r=>r.shortCount||r.nonBreakInterruption)?'warn':'good','最大 '+fmtHM(d.maxContinuous)+' / 4:00以内。休憩の合計30分で中断を判定。1日の休憩合計だけではリセットしません。');
  const month=key.slice(0,7),year=key.slice(0,4),monthEnd=dateKey(new Date(Number(year),Number(key.slice(5,7)),0)),yearEnd=year+'-12-31';
  const monthHours=[...allDaily].filter(([k])=>k.startsWith(month)).reduce((n,[,v])=>n+v.duration,0),yearHours=[...allDaily].filter(([k])=>k.startsWith(year)).reduce((n,[,v])=>n+v.duration,0);
  const complete=(a,b)=>quickRangeComplete(new Date(a+'T00:00:00'),new Date(quickDateOffset(b,1)+'T00:00:00'),calc);
  add('月間拘束',monthHours>284+RULE_EPS?'bad':complete(month+'-01',monthEnd)?'good':'pending',fmtHM(monthHours)+' / 原則284:00（'+month+'・入力済み累計、始業日計上）');
  add('年間拘束',yearHours>3300+RULE_EPS?'bad':complete(year+'-01-01',yearEnd)?'good':'pending',fmtHM(yearHours)+' / 原則3,300:00（'+year+'年1月～12月・入力済み累計）');
  add('14時間超の拘束',over14>2?'warn':quickCovered(weekStart,weekEnd)&&weekEnd<dateKey(new Date())?'good':'pending','今週 '+over14+'日 / 週2回以内が目安（月～日）');
  const extra=d.records.flatMap(r=>r.issues).filter(i=>['daily-break','overlap','coverage','short-breaks','short-review','work-interruption'].includes(i.code));
  for(const i of uniqueIssues(extra))add('記録・休憩の確認',i.severity,i.message);
  if(d.records.some(r=>r.isLive))add('勤務中','pending','終業前のため、表示は現在までの暫定値です。');
  if(!quickCovered(key,key))add('入力状況','pending','設定の「集計の入力完了期間」が未確認です。未記録の勤務がないか確認してください。');
  if(flags)add('特例条件','pending','長距離運行・予期し得ない事象の申告があります。各項目は通常基準で表示しています。特例の適用・控除後の違反を確定するものではありません。');
  return {day:d,weekDays,weekStart,weekEnd,over14,rows,flags,level:rows.some(r=>r.level==='bad')?'bad':rows.some(r=>r.level==='warn')?'warn':rows.some(r=>r.level==='pending')?'pending':'good'};
}
function renderQuickCheck(refreshConditions=false){
  if(!$('checkResult'))return;
  const key=$('checkDate').value||dateKey(new Date());$('checkDate').value=key;
  const model=quickModel(key,aggregateForMonth(key.slice(0,7))),d=model.day;
  const label=model.level==='bad'?(model.flags?'通常基準超過・特例要確認':'違反（通常基準）'):model.level==='warn'?'注意':model.level==='good'?'OK（確認範囲）':'判定待ち';
  const pending=model.rows.filter(r=>r.level==='pending').length;
  const rowHtml=r=>'<div class="check-row"><header><b>'+escapeHtml(r.title)+'</b>'+levelBadge(r.level)+'</header><p>'+escapeHtml(r.text)+'</p></div>';
  $('checkResult').innerHTML=d?'<div class="check-total '+model.level+'"><strong>'+label+'</strong><p>'+escapeHtml(key)+'・'+(pending?'未確定 '+pending+'項目':'確認済みの記録による判定')+'</p></div><div class="check-metrics">'+[['拘束（勤務計）',d.duration],['運転',d.by.drive],['最大連続運転',d.maxContinuous]].map(([name,h])=>'<div class="check-metric"><span>'+name+'</span><strong>'+fmtHM(h)+'</strong></div>').join('')+'</div><p class="hint">始業 '+d.records.map(r=>fmtDateTime(r.start)).join(' / ')+'<br>終業 '+d.records.map(r=>r.isLive?'勤務中':fmtDateTime(r.end)).join(' / ')+'</p>'+model.rows.map(rowHtml).join(''):'<div class="check-empty"><b>'+(quickCovered(key,key)?'勤務なし（入力完了期間内）':'記録がありません・判定待ち')+'</b><p>下の「始業開始」から記録できます。過去の運行は日付を選んで確認してください。</p></div>';
  $('checkConditions').hidden=!d;
  if(refreshConditions||$('checkConditions').dataset.recordId!==(quickTarget(key)?.id||''))loadQuickConditions(key);
  const weeklyDrive=model.weekDays.reduce((n,x)=>n+(x.day?.by.drive||0),0);
  $('checkWeek').innerHTML='<p>'+model.weekStart+' ～ '+model.weekEnd+'</p><p>運転 '+fmtHM(weeklyDrive)+'・14時間超 '+model.over14+'日</p><div class="check-week-list">'+model.weekDays.map(({date,day})=>'<div class="check-week-day"><a href="#quickCheck" data-check-day="'+date+'">'+date.slice(5)+'（'+dayLabel(new Date(date+'T00:00:00'))+'）</a><span>'+ (day?'拘束 '+fmtHM(day.duration)+' / 運転 '+fmtHM(day.by.drive):quickCovered(date,date)?'勤務なし':'未確認')+'</span></div>').join('')+'</div><p class="hint">日別は始業日計上。運転の上限は、設定した起算日による2週平均で確認します。</p>';
  $('checkWeek').querySelectorAll('[data-check-day]').forEach(a=>a.onclick=()=>{$('checkDate').value=a.dataset.checkDay;renderQuickCheck(true)});
}
function quickTarget(key){return [...records.filter(r=>r.source==='punch'),...(live?[live]:[])].filter(r=>dateKey(r.start)===key).sort((a,b)=>new Date(a.start)-new Date(b.start)).at(-1)}
function loadQuickConditions(key){
  const target=quickTarget(key),c=target?.checkConditions;
  $('checkConditions').dataset.recordId=target?.id||'';
  $('checkLongDistance').checked=!!c?.longDistance;$('checkUnforeseen').checked=!!c?.unforeseen;$('checkNote').value=c?.note||'';
}
function saveQuickConditions(){
  const target=quickTarget($('checkDate').value);
  if(!target||target.id!==$('checkConditions').dataset.recordId){$('checkSaveStatus').textContent='勤務が変わりました。日付を選び直してください。';return}
  const conditions=validateCheckConditions({longDistance:$('checkLongDistance').checked,unforeseen:$('checkUnforeseen').checked,note:$('checkNote').value});
  try{
    // Persist first: a storage failure must not make unsaved conditions look saved.
    if(target===live){const next={...live,checkConditions:conditions};store(KEYS.live,next);live=next}
    else{const next=records.map(r=>r.id===target.id?{...r,checkConditions:conditions}:r);store(KEYS.records,next);records=next}
    $('checkSaveStatus').textContent='この端末に保存しました。バックアップにも含まれます。';renderQuickCheck();
  }catch(e){$('checkSaveStatus').textContent='保存できませんでした。空き容量・ブラウザーの保存設定を確認してください。'}
}
document.addEventListener('DOMContentLoaded',()=>{
  $('checkDate').value=dateKey(new Date());
  $('checkDate').addEventListener('change',()=>{$('checkSaveStatus').textContent='';renderQuickCheck(true)});
  $('checkToday').onclick=()=>{$('checkDate').value=dateKey(new Date());renderQuickCheck(true)};
  $('saveCheckConditions').onclick=saveQuickConditions;renderQuickCheck();
});
