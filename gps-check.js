'use strict';
const button=document.getElementById('start'),output=document.getElementById('result');
let lines=[];
function log(s){lines.push(s);output.textContent=lines.join('\n')}
function probe(label,high,watch){return new Promise(resolve=>{
  const started=Date.now();let done=false,id=null;
  const timer=setTimeout(()=>finish('応答なし（20秒）'),20000);
  function finish(message){if(done)return;done=true;clearTimeout(timer);if(id!==null)navigator.geolocation.clearWatch(id);log(label+'：'+message+' ／ '+((Date.now()-started)/1000).toFixed(1)+'秒');resolve()}
  function success(p){const c=p.coords;const valid=Number.isFinite(c?.latitude)&&Number.isFinite(c?.longitude)&&Math.abs(c.latitude)<=90&&Math.abs(c.longitude)<=180;const age=Number.isFinite(p.timestamp)?Math.round((Date.now()-p.timestamp)/1000)+'秒前':'不明';finish('応答あり・座標形式'+(valid?'正常':'不正')+'・精度 '+(Number.isFinite(c?.accuracy)?'±'+Math.round(c.accuracy)+'m':'不明')+'・取得時刻 '+age)}
  function error(e){finish('エラー '+e.code+'（'+({1:'許可されていません',2:'現在地を特定できません',3:'取得タイムアウト'}[e.code]||'取得処理エラー')+'）')}
  try{const options={enableHighAccuracy:high,maximumAge:0,timeout:15000};if(watch){id=navigator.geolocation.watchPosition(success,error,options);if(done)navigator.geolocation.clearWatch(id)}else navigator.geolocation.getCurrentPosition(success,error,options)}catch(e){finish('取得処理を開始できません')}
})}
button.onclick=async()=>{
  button.disabled=true;lines=[];log('GPS確認 v8.6.4');log('画面：'+document.visibilityState+' ／ '+(isSecureContext?'HTTPS対応':'HTTPS未対応'));
  try{if(!navigator.geolocation){log('このブラウザでは位置情報を利用できません');return}
    log('確認中…');
    await probe('① 通常の位置取得',false,false);
    await probe('② 高精度の位置取得',true,false);
    await probe('③ 継続測位の初回取得',true,true);
    log('確認終了。この結果を共有してください。');
  }finally{button.disabled=false}
};
