// Authenticated layouts are authored examples. Keep them separate from the guest
// browser recording and never reuse login buttons as links into these examples.
export function loginMockups() {
  const views = [
    ['mock-groups','グループ一覧','参加中','医学スタディ班 · 3人', [['医学スタディ班','mock-timeline'],['グループを追加','mock-add'],['ホーム','mock-home']]],
    ['mock-add','グループを追加','参加方法','招待を受けるか、新しいグループを作れます。',[['招待コードで参加','mock-join'],['新しいグループを作成','mock-create'],['戻る','mock-groups']]],
    ['mock-join','招待コードで参加','招待コード','SAMPLE · 架空の招待コード',[['参加後の画面を見る','mock-timeline'],['戻る','mock-add']]],
    ['mock-create','グループを作成','グループ名','医学スタディ班',[['作成後の画面を見る','mock-timeline'],['戻る','mock-add']]],
    ['mock-home','ホーム','タイムライン','サンプルさんが循環器の問題を10問解きました。',[['グループ','mock-groups'],['報告履歴','mock-reports']]],
    ['mock-reports','報告履歴','送信した報告','例題の表記について · 確認中',[['ホーム','mock-home']]],
    ...[
      ['timeline','タイムライン','サンプルさんが学習記録を共有しました。'],
      ['duel','対戦','サンプルさんとの対戦 · 待機中'],
      ['progress','進捗','今週の学習 · 10問'],
      ['members','メンバー','サンプルさん（管理者）ほか2人'],
    ].map(([id,name,body])=>['mock-'+id,name,'医学スタディ班',body,
      [['タイムライン','mock-timeline'],['対戦','mock-duel'],['進捗','mock-progress'],['メンバー','mock-members'],['管理者の設定','mock-admin'],['一覧へ','mock-groups']].filter(([,target])=>target!=='mock-'+id)]),
    ['mock-admin','グループ設定','管理者用','グループ名、招待、メンバー管理',[['メンバーを見る','mock-members'],['グループに戻る','mock-timeline']]],
  ];
  const css = 'body{margin:0;background:#f5f7fa;color:#23384a;font:16px system-ui,sans-serif}.mock{padding:24px;max-width:640px;margin:auto}.mock small{color:#725120;background:#fff1d7;padding:5px 10px;border-radius:20px}.mock h1{font-size:26px;margin:24px 0}.mock article{padding:18px;background:white;border:1px solid #d9e2e9;border-radius:14px}.mock nav{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}.mock button{padding:12px;border:1px solid #c5d6e0;border-radius:9px;background:white;color:#214c60}';
  return views.map(([id,title,sub,body,links])=>{
    const actions = links.map(([label,targetId],n)=>({id:'link-'+n,elementId:'link-'+n,label,type:'navigate',targetId}));
    const html = '<main class="mock" data-node-id="main"><small data-node-id="badge">モックアップ · ログイン後</small><h1 data-node-id="title">'+title+'</h1><article data-node-id="card"><strong data-node-id="heading">'+sub+'</strong><p data-node-id="example">'+body+'</p></article><nav data-node-id="menu">'+actions.map(a=>'<button data-node-id="'+a.id+'">'+a.label+'</button>').join('')+'</nav></main>';
    return {id,name:title+'（モック）',presentation:'mockup',purpose:'ログイン後の設計例。表示する記録・参加者は架空です。',html,css,actions,overlays:[],states:[],status:'draft'};
  });
}
