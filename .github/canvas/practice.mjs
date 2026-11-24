// Enrich only the published guest snapshot. Project vocabulary and question
// numbers come from the same release that supplied the captured screens.
export function attachPractice({screens,bank,covers}) {
  const bySubject = new Map(bank.pdfs.map(pdf=>[pdf.title.replace(/\s+v\d+.*$/i,''),pdf.subjectId]));
  const esc = text => String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const css = '.practice-sheet{box-sizing:border-box;background:white;color:#183448;width:min(100%,580px);max-height:95%;overflow:auto;margin:0 auto;border-radius:16px 16px 0 0;padding:16px;font:15px/1.55 system-ui,sans-serif}.practice-sheet h2{font-size:18px}.practice-sheet small{display:block;color:#685627}.practice-sheet fieldset{border:0;padding:0;margin:12px 0}.practice-sheet label,.practice-sheet button{display:block;text-align:left;width:100%;box-sizing:border-box;margin:6px 0;padding:10px;border:1px solid #d7e2e9;border-radius:8px;background:#f7fafc;color:#183448;font:inherit}.practice-sheet button:disabled{opacity:.45}.practice-sheet input{margin-inline-end:8px}.practice-sheet p{white-space:pre-wrap}';
  function bankFor(name) {
    const setId=bySubject.get(name);
    if(!setId) throw Error('No published question set for '+name);
    const seen=new Set();
    return bank.questions.filter(q=>q.setId===setId).flatMap((q,i)=>{
      const category=q.category || '未分類';
      if(i>=3 && seen.has(category))return [];
      seen.add(category);
      return [{number:i+1,category,prompt:q.question,choices:q.choices,correct:q.answerIndexes?.length?q.answerIndexes:[q.answerIndex],explanation:q.explanation || q.answerText || ''}];
    });
  }
  for(const screen of screens){
    const doc=new DOMParser().parseFromString(screen.html,'text/html');
    const buttons=[...doc.querySelectorAll('button')];
    const text=b=>(b.getAttribute('aria-label') || b.textContent).replace(/\s+/g,' ').trim();
    const bind=(b,props)=>{
      if(!b)return;
      const el=b.getAttribute('data-node-id');
      const old=screen.actions.find(a=>a.elementId===el);
      const action={id:old?.id || el,elementId:el,label:text(b),...props};
      if(old)screen.actions[screen.actions.indexOf(old)]=action;else screen.actions.push(action);
    };
    const overlay = (id,title,html,actions,extra={})=>screen.overlays.push({id,name:title,html,css,actions,...extra});
    const close=(el,label='閉じる')=>({id:el,elementId:el,label,type:'closeOverlay'});
    const hub=screen.id==='cardio' || /^subject-[a-f0-9]+$/.test(screen.id);
    const recorded=['questions','detail','practice','answer'].includes(screen.id);
    if(hub || recorded){
      const questions=bankFor(hub?screen.name:'循環器');
      overlay('practice-sample','演習モック','<article class="practice-sheet"><button data-node-id="practice-close">閉じる</button><small>演習モック · 公開教材から抜粋</small><section data-node-id="practice-content"></section></article>',[close('practice-close')],{questions});
      const start=(b,mode,number,initialChoice)=>bind(b,{type:'openOverlay',targetId:'practice-sample',practiceMode:mode,...(number?{questionNumber:number}:{}),...(initialChoice!==undefined?{initialChoice}:{})});
      if(hub) {
        for(const [group,name] of [['分類一覧','practice-category'],['Level条件','practice-level']]){
          const parent=doc.querySelector('[aria-label="'+group+'"]');
          if (!parent) throw Error('Missing '+group+' in '+screen.name);
          const items=[...parent.querySelectorAll('button')];
          const base=items.find(b=>b.getAttribute('aria-pressed')==='false')?.className;
          for(const b of items){
            const label=doc.createElement('label'),input=doc.createElement('input');
            label.className=(base || b.className)+' practice-filter';
            label.setAttribute('data-node-id',b.getAttribute('data-node-id'));
            input.type='radio';input.name=name;input.value=text(b);
            if(b.getAttribute('aria-pressed')==='true')input.setAttribute('checked','');
            label.append(input,doc.createTextNode(text(b)));b.replaceWith(label);
          }
        }
        screen.css+='\n.practice-filter{position:relative;cursor:pointer}.practice-filter input{position:absolute;inset:0;opacity:0;width:100%;height:100%;margin:0;cursor:pointer}.practice-filter:has(:checked){background:#185b79;color:white}.practice-filter:focus-within{outline:2px solid #206db1}';
        for(const b of buttons){
          if(/登録順で解く/.test(text(b)))start(b,'ordered');
          if(/ランダムで解く/.test(text(b)))start(b,'random');
          if(/問題一覧/.test(text(b)) && screen.id!=='cardio')start(b,'list');
        }
      } else {
        for(const b of buttons){
          const label=text(b), entry=/^Q(\d+)(の詳細を開く|から解く)$/.exec(label);
          if(entry && !screen.actions.some(a=>a.elementId===b.dataset.nodeId))start(b,entry[2]==='の詳細を開く'?'detail':'ordered',Number(entry[1]));
          if(b.closest('[aria-label="分野へ移動"],[aria-label="並び替え"]'))bind(b,{type:'openOverlay',targetId:'practice-sample',practiceMode:'list',practiceCategory:b.closest('[aria-label="分野へ移動"]')?label:'すべて'});
          if(label.includes('この問題を解く'))start(b,'ordered',1);
          if(/^選択肢\s*\d/.test(label) && screen.id==='practice'){
            const clean=v=>v.replace(/\s/g,'');
            const choice=questions[0].choices.findIndex(c=>clean(label).endsWith(clean(c)));
            if(choice>=0)start(b,'ordered',1,choice);
          }
          if(label==='戻る' && ['practice','answer'].includes(screen.id))bind(b,{type:'navigate',targetId:'cardio'});
          if(label==='次へ' && screen.id==='answer')start(b,'ordered',2);
        }
      }
    }
    if(screen.id==='settings'){
      const proceed='login-preview', done='login-close';
      overlay('login-mock','ログイン後のモック','<article class="practice-sheet"><small>モックアップ</small><h2>ログイン後のホーム</h2><button data-node-id="'+proceed+'">架空のアカウントで見る</button><button data-node-id="'+done+'">閉じる</button></article>',
        [{id:proceed,elementId:proceed,label:'架空のアカウントで見る',type:'navigate',targetId:'mock-home'},close(done)]);
      for(const b of buttons)if(/LINEでログイン|ログインリンクを送る/.test(text(b)))bind(b,{type:'openOverlay',targetId:'login-mock'});
    }
    if(hub){
      const b=buttons.find(b=>text(b)==='学習済みにする');
      if(b){
        const label=doc.createElement('label'),check=doc.createElement('input');
        check.type='checkbox';label.className=b.className+' local-completion';label.dataset.nodeId=b.dataset.nodeId;
        label.append(check,doc.createTextNode('学習済み（モック）'));b.replaceWith(label);
        const status=label.previousElementSibling;
        if(status)status.classList.add('completion-status');
        screen.css+='\n.local-completion{cursor:pointer}.local-completion input{margin-right:6px}.completion-status:has(+ label input:checked){font-size:0}.completion-status:has(+ label input:checked)::after{content:"学習済み";font-size:14px}';
      }
    }
    if(screen.id==='materials'||hub||screen.id.endsWith('-notes')){
      for(const [subject,setId] of bySubject){
        const b=screen.id==='materials'?buttons.find(b=>text(b).startsWith(subject+' v')):
          (screen.name===subject || screen.name.startsWith(subject+'・')) && buttons.find(b=>/^資料(を開く)?\s*›/.test(text(b)));
        if(!b)continue;
        const info=bank.pdfs.find(p=>p.subjectId===setId), id='material-'+setId, done='close-'+id;
        const cover=covers[setId]?'<img alt="教材の表紙" width="160" src="'+covers[setId]+'">':'';
        overlay(id,subject+'・資料情報','<article class="practice-sheet"><small>資料モック</small><h2>'+esc(info.title)+'</h2><p>全'+Number(info.pages)+'ページ</p>'+cover+'<button data-node-id="'+done+'">閉じる</button></article>',[close(done)]);
        bind(b,{type:'openOverlay',targetId:id});
        if(screen.id.endsWith('-notes')){
          for(const go of buttons.filter(go=>/^Q\d+の資料のページへ移動$|^資料を開く$/.test(text(go))))bind(go,{type:'openOverlay',targetId:id});
        }
      }
    }
    if(screen.id.endsWith('-notes')){
      const entries=[...doc.querySelectorAll('article[aria-label]')];
      for(const [i,item] of entries.entries()){
        const edit=[...item.querySelectorAll('button')].find(b=>text(b)==='編集・追加');
        if(!edit)continue;
        const id='entry-note-'+i, done='save-note-'+i;
        overlay(id,'メモ編集（モック）','<article class="practice-sheet"><small>このプレビュー内のメモ</small><h2>'+esc(item.getAttribute('aria-label'))+'</h2><label>メモ<textarea data-node-id="note-text-'+i+'" rows="4"></textarea></label><button data-node-id="'+done+'">メモを残して閉じる</button></article>',[close(done,'メモを残して閉じる')]);
        bind(edit,{type:'openOverlay',targetId:id});
      }
    }
    screen.html=doc.body.innerHTML;
  }
  return screens;
}
