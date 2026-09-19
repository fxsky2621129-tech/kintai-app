'use strict';
const LAW_ITEMS=[
  {id:'law-2024-overtime',year:'2024',revision:1,title:'時間外労働の上限を確認',status:'2024年4月施行',who:'自動車運転業務を行う労働者・使用者',body:'原則は月45時間・年360時間。臨時的な特別の事情がある場合も、特別条項付き36協定の下で年960時間が限度です。960時間に法定休日労働は含みません。',action:'36協定の内容・起算日・法定休日の区分を会社と確認する。このアプリの概算時間外だけで年960時間の適否を判断しない。',url:'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/gyosyu/topics/01.html',source:'厚生労働省：時間外労働の上限規制'},
  {id:'law-2024-rest',year:'2024',revision:1,title:'拘束時間と勤務間の休息',status:'2024年4月適用',who:'トラック運転者・運行管理担当者',body:'通常は拘束1日13時間以内、延長時も最大15時間。月284時間・年3,300時間以内が原則です。休息は継続11時間以上を与えるよう努めることを基本とし、9時間を下回らないことが必要です。',action:'月間勤務表の拘束・休息欄を確認する。労使協定や長距離運送等の例外条件は資料で個別に確認する。',url:'https://driver-roudou-jikan.mhlw.go.jp/truck/notice',source:'厚生労働省：トラック運転者の改善基準告示'},
  {id:'law-2024-driving',year:'2024',revision:1,title:'運転時間と運転の中断',status:'2024年4月適用',who:'トラック運転者・運行管理担当者',body:'運転時間は2日平均で1日9時間以内、2週平均で1週44時間以内。連続運転は4時間以内で、原則として合計30分以上の休憩による中断を確保します。',action:'運転・待機・荷役・休憩を分けて打刻し、勤務表の連続運転等の警告を確認する。例外条件は公式資料を確認する。',url:'https://www.mhlw.go.jp/content/2023_Pamphlet_T.pdf',source:'厚生労働省：改善基準告示パンフレット'},
  {id:'law-2026-efficiency',year:'2026',revision:1,title:'物流効率化法の特定事業者対応',status:'2026年4月施行',who:'一定規模以上の荷主・物流事業者',body:'特定事業者には中長期計画・定期報告等の義務があります。特定貨物自動車運送事業者等の基準は保有車両150台以上。物流統括管理者（CLO）の選任は特定荷主・特定連鎖化事業者が対象です。',action:'自社の指定対象・届出・提出期限を確認し、荷待ち・荷役時間を記録する。勤怠記録だけでは法定の計画・報告書は完成しません。',url:'https://www.revised-logistics-act-portal.mlit.go.jp/designation/',source:'国土交通省：特定事業者の指定'},
  {id:'law-2026-subcontract',year:'2026',revision:1,title:'委託次数を減らす取組',status:'2026年4月施行',who:'運送を他者へ委託するトラック事業者等',body:'委託次数の制限に関する努力義務が導入されました。委託の連鎖を把握し、実際に運ぶ事業者までの取引を確認します。',action:'元請・委託先・実運送事業者を整理し、再委託の条件と運送体制を確認する。',url:'https://www.mlit.go.jp/jidosha/jidosha_mn4_000019.html',source:'国土交通省：トラック適正化二法'},
  {id:'law-2026-documents',year:'2026',revision:1,title:'貨物利用運送事業者の書面・管理簿',status:'2026年4月施行',who:'貨物利用運送事業者',body:'書面交付等の規定が貨物利用運送事業者にも広がりました。元請となる場合の実運送体制管理簿や、利用運送量に応じた管理規程・管理者の要件があります。',action:'自社の立場・取扱量に応じて必要な書面、管理簿、管理者の要件を公式資料で確認する。',url:'https://www.mlit.go.jp/jidosha/jidosha_mn4_000019.html',source:'国土交通省：トラック適正化二法'},
  {id:'law-2026-white-truck',year:'2026',revision:1,title:'違法な白トラ利用の規制',status:'2026年4月施行',who:'運送を依頼する荷主等',body:'必要な許可・届出なく有償運送を行う、いわゆる違法な白トラについて、利用する荷主等も処罰の対象となりました。',action:'依頼先が必要な許可・届出を備えているか確認する。ナンバーの色だけで適否を判断しない。',url:'https://www.mlit.go.jp/jidosha/jidosha_mn4_000019.html',source:'国土交通省：トラック適正化二法'},
  {id:'law-2028-permit',year:'2028',revision:1,title:'事業許可の更新制度に備える',status:'施行準備・具体日は政令で決定',who:'トラック運送事業者',body:'許可更新制度の導入が法定されました。施行は2025年6月11日の公布から3年以内の政令で定める日とされています。この画面では2028年4月開始とは扱いません。',action:'許可関係書類、運行・労務管理の記録を整え、施行日・申請方法・経過措置の公表を確認する。',url:'https://www.mlit.go.jp/jidosha/jidosha_mn4_000019.html',source:'国土交通省：トラック適正化二法'},
  {id:'law-2028-cost',year:'2028',revision:1,title:'適正原価制度に備える',status:'施行準備・公布後3年以内',who:'トラック運送事業者等',body:'国土交通大臣が定める適正原価を継続して下回る運賃・料金を制限する制度が設けられます。国交省で原価設定の検討が進められています。',action:'人件費・燃料費・車両費などの原価を整理し、運賃・料金の見直しに備える。現行の標準的な運賃と新制度を区別し、詳細の公表を確認する。',url:'https://www.mlit.go.jp/jidosha/jidosha_mn4_000020.html',source:'国土交通省：適正原価の設定に向けた有識者検討会'}
];
function lawIsChecked(item){return lawChecks[item.id]?.revision===item.revision}
function renderLawGuide(){
  const root=document.getElementById('lawCards');if(!root)return;
  const year=document.getElementById('lawYear').value,query=document.getElementById('lawSearch').value.trim().toLocaleLowerCase('ja'),unchecked=document.getElementById('lawUnchecked').checked;
  const pool=LAW_ITEMS.filter(i=>year==='all'||i.year===year);
  const shown=pool.filter(i=>(!unchecked||!lawIsChecked(i))&&[i.title,i.body,i.action,i.who].join(' ').toLocaleLowerCase('ja').includes(query));
  document.getElementById('lawProgress').textContent=`対象年の確認済み ${pool.filter(lawIsChecked).length} / ${pool.length}件 · 表示 ${shown.length}件`;
  root.replaceChildren();
  for(const item of shown){
    const article=document.createElement('article');article.className='law-card';
    const badge=document.createElement('span');badge.className='badge '+(item.year==='2028'?'warn':'good');badge.textContent=item.status;article.append(badge);
    const title=document.createElement('h3');title.textContent=item.title;article.append(title);
    for(const text of ['対象：'+item.who,item.body,'やること：'+item.action]){const p=document.createElement('p');p.textContent=text;article.append(p)}
    const link=document.createElement('a');link.href=item.url;link.textContent=item.source+' ↗';link.target='_blank';link.rel='noopener noreferrer';article.append(link);
    const label=document.createElement('label');label.className='law-confirm';
    const check=document.createElement('input');check.type='checkbox';check.checked=lawIsChecked(item);check.setAttribute('aria-label',item.title+'を確認済みにする');
    const text=document.createElement('span');text.textContent=check.checked?'確認済み · '+new Date(lawChecks[item.id].checkedAt).toLocaleString('ja-JP'):'内容を確認した';
    check.addEventListener('change',()=>{
      try{
        // Read the latest state so another tab's checks are not overwritten.
        const next=validateLawChecks(load(KEYS.lawChecks,{}));
        if(check.checked)next[item.id]={revision:item.revision,checkedAt:new Date().toISOString()};else delete next[item.id];
        store(KEYS.lawChecks,next);lawChecks=next;
        document.getElementById('lawSaveStatus').textContent='確認状態をこの端末に保存しました。';
        text.textContent=check.checked?'確認済み · '+new Date(next[item.id].checkedAt).toLocaleString('ja-JP'):'内容を確認した';
        if(unchecked)renderLawGuide();else document.getElementById('lawProgress').textContent=`対象年の確認済み ${pool.filter(lawIsChecked).length} / ${pool.length}件 · 表示 ${shown.length}件`;
      }catch(e){check.checked=lawIsChecked(item);document.getElementById('lawSaveStatus').textContent='保存できませんでした。ブラウザーの保存設定・空き容量を確認してください。'}
    });
    label.append(check,text);article.append(label);root.append(article);
  }
  if(!shown.length){const p=document.createElement('p');p.textContent='該当する項目はありません。検索や年の条件を変更してください。';root.append(p)}
}
document.addEventListener('DOMContentLoaded',()=>{
  for(const id of ['lawYear','lawUnchecked'])document.getElementById(id).addEventListener('change',renderLawGuide);
  document.getElementById('lawSearch').addEventListener('input',renderLawGuide);
  renderLawGuide();
  window.addEventListener('storage',e=>{if(e.key===KEYS.lawChecks||e.key===null){try{lawChecks=validateLawChecks(load(KEYS.lawChecks,{}));renderLawGuide()}catch{document.getElementById('lawSaveStatus').textContent='確認履歴を読み込めませんでした。バックアップを確認してください。'}}});
});
