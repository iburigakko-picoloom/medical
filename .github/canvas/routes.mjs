import { createHash } from 'node:crypto';
// A route is a reproducible path from a clean guest session. Each exported edge
// is separately clicked from its source and must satisfy its destination marker.
const tabs = { home:'ホーム', study:'学習', groups:'グループ', settings:'設定' };
const tab = id => ({ name:tabs[id], nav:true });
const button = (page, control) => {
  const scope = control.nav ? page.locator('[aria-label="メインメニュー"]') : page;
  const name = control.name ?? control;
  return scope.getByRole('button', {name, exact:typeof name === 'string'});
};
const heading = name => page => page.getByRole('heading',{name,exact:true}).first();
const has = control => page => button(page,control);
const expanded = value => page => button(page,/^臨床医学/).and(page.locator('[aria-expanded="'+value+'"]'));
const openClinical = /^臨床医学/, openCardio = /^循環器\s/, list = /^問題一覧/, practice = /登録順で解く/;
const clinical = [tab('study'),openClinical], cardio = [...clinical,openCardio];
const questions = [...cardio,list], detail = [...questions,'Q1の詳細を開く'];
const back = target => ['戻る',target];

export function makeRoutes() {
  const routes = [
    {id:'home',name:'ホーム',path:[],marker:has('学習記録を開く'),edges:[['学習計画','plans'],['学習記録を開く','history'],['ログインへ','settings']]},
    {id:'study',name:'学習',path:[tab('study')],marker:expanded(false),edges:[['資料','materials'],[openClinical,'clinical'],[/^補完分野/,'supplement']]},
    {id:'groups',name:'グループ',path:[tab('groups')],marker:heading('グループ')},
    {id:'settings',name:'設定',path:[tab('settings')],marker:has('LINEでログイン'),edges:[['改善履歴','changes'],['報告履歴','reports']]},
    {id:'clinical',name:'学習・臨床医学',path:clinical,marker:expanded(true),edges:[[openClinical,'study'],[openCardio,'cardio'],['資料','materials']]},
    {id:'supplement',name:'学習・補完分野',path:[tab('study'),/^補完分野/],marker:page=>button(page,/^補完分野/).and(page.locator('[aria-expanded="true"]')),edges:[[/^補完分野/,'study'],['資料','materials']]},
    {id:'materials',name:'学習資料',path:[tab('study'),'資料'],marker:page=>button(page,'資料').and(page.locator('[aria-pressed="true"]')),edges:[['問題','study']]},
    {id:'cardio',name:'循環器',path:cardio,marker:has(practice),edges:[back('clinical'),[list,'questions'],[practice,'practice'],[/学習計画/,'cardio-plan'],[/追加解説・メモ/,'cardio-notes']]},
    {id:'cardio-plan',name:'循環器・計画を作成',path:[...cardio,/学習計画/],marker:heading('計画を作成'),edges:[back('cardio')]},
    {id:'cardio-notes',name:'循環器・追加解説とメモ',path:[...cardio,/追加解説・メモ/],marker:heading('追加解説・メモ一覧'),edges:[back('cardio')]},
    {id:'questions',name:'循環器・問題一覧',path:questions,marker:has('Q1の詳細を開く'),edges:[back('cardio'),['Q1の詳細を開く','detail']],purpose:'一覧は先頭の問題を抜粋。問題詳細への操作はQ1で確認。'},
    {id:'detail',name:'循環器・問題詳細',path:detail,marker:heading('問題詳細'),edges:[back('questions'),[/詳しく知りたいことをメモ/,'note']]},
    {id:'note',name:'循環器・苦手メモ',path:[...detail,/詳しく知りたいことをメモ/],marker:has('苦手メモに保存'),edges:[back('detail')]},
    {id:'practice',name:'循環器・演習',path:[...cardio,practice],marker:has('わからない'),edges:[['わからない','answer']]},
    {id:'answer',name:'循環器・解答解説',path:[...cardio,practice,'わからない'],marker:heading('解答')},
    {id:'plans',name:'学習計画',path:['学習計画'],marker:has('作成'),edges:[back('home'),['作成','create-plan'],['計画を作成','create-plan']]},
    {id:'create-plan',name:'計画を作成',path:['学習計画','作成'],marker:heading('計画を作成'),edges:[back('plans')]},
    {id:'history',name:'学習記録',path:['学習記録を開く'],marker:has('ホームへ戻る'),edges:[['ホームへ戻る','home']]},
    {id:'changes',name:'改善履歴',path:[tab('settings'),'改善履歴'],marker:heading('改善履歴'),edges:[back('settings')]},
    {id:'reports',name:'報告履歴',path:[tab('settings'),'報告履歴'],marker:heading('報告履歴'),edges:[back('settings')]},
  ];
  for (const route of routes) {
    route.edges ??= [];
    if (route.id in tabs || ['changes','reports','clinical','supplement','materials'].includes(route.id)) {
      const activeTab = ['changes','reports'].includes(route.id) ? 'settings' : ['clinical','supplement','materials'].includes(route.id) ? 'study' : route.id;
      for (const id of Object.keys(tabs)) if (id !== activeTab) route.edges.push([tab(id),id]);
    }
  }
  return routes;
}

export async function captureRoutes(page, url, buildId, routes, captureScreen, subjects) {
  const screens = [];
  const arrive = async route => {
    await page.goto(url, {waitUntil:'domcontentloaded'});
    for (const step of route.path) await button(page,step).click();
    await route.marker(page).waitFor({timeout:6000});
  };
  // Discover enabled subjects in this release. Preserve each subject's own hub.
  for (const id of ['clinical','supplement']) {
    const library = routes.find(r=>r.id===id);
    await arrive(library);
    // Folder headings render before the release finishes loading. A snapshot
    // must contain every published subject even on a cold, slower CI browser.
    await page.waitForLoadState('networkidle');
    for (const name of subjects) {
      if (name==='循環器') continue;
      const label=new RegExp('^'+name.replace(/[.*+?^\x24{}()|[\]\\]/g,'\\$&')+'(?:\\s|\\d)');
      const candidate=button(page,label);
      if(!await candidate.count())continue;
      await candidate.and(page.locator('button:not([disabled]):not([aria-disabled="true"])')).waitFor();
      const target = 'subject-' + createHash('sha256').update(name).digest('hex').slice(0,12);
      library.edges.push([label,target]);
      const path=[...library.path,label];
      const plan=/学習計画/, notes=/追加解説・メモ/;
      routes.push({id:target,name,path,marker:heading(name),edges:[back(id),[plan,target+'-plan'],[notes,target+'-notes']]});
      routes.push({id:target+'-plan',name:name+'・計画を作成',path:[...path,plan],marker:heading('計画を作成'),edges:[back(target)]});
      routes.push({id:target+'-notes',name:name+'・追加解説とメモ',path:[...path,notes],marker:heading('追加解説・メモ一覧'),edges:[back(target)]});
    }
  }
  for (const route of routes) {
    await arrive(route);
    if (await page.locator('meta[name="quiz-build-id"]').getAttribute('content') !== buildId) throw Error('Build mismatch');
    for (const [index,[control,target]] of route.edges.entries()) {
      const source = button(page,control);
      if (await source.count() !== 1 || !await source.isEnabled() || !await source.isVisible()) throw Error('Ambiguous or unavailable: '+route.id+' → '+target);
      await source.evaluate((el,meta)=>Object.assign(el.dataset, meta), {canvasEdge:(control.nav?'nav-':'open-')+target+(route.edges.slice(0,index).some(([,id])=>id===target)?'-'+index:''), canvasTarget:target});
    }
    if (route.id==='questions') await page.locator('.quiz-list__card').evaluateAll(cards=>{
      for (const card of cards.slice(3)) card.dataset.canvasOmit='true';
      for (const section of document.querySelectorAll('.quiz-list__section'))
        if (!section.querySelector('.quiz-list__card:not([data-canvas-omit])')) section.dataset.canvasOmit='true';
    });
    if(route.id.endsWith('-notes')) {
      await page.locator('.note-explanation-item').evaluateAll(items=>items.slice(2).forEach(el=>el.dataset.canvasOmit='true'));
      route.purpose='科目の追加解説とメモ。内容は先頭2件を抜粋。';
    }
    const planEditor=route.id.endsWith('-plan');
    const markPlanControls=async()=>{
      for(const [label,id] of [['毎日○問','plan-daily'],['期限までに1周','plan-deadline'],['この対象と予定で保存','plan-save']])
        await button(page,label).evaluate((b,id)=>b.dataset.canvasControl=id,id);
      await button(page,'戻る').evaluate(b=>b.dataset.canvasControl=b.dataset.canvasEdge || 'open-back');
    };
    if(planEditor)await markPlanControls();
    await page.evaluate(()=>document.fonts.ready);
    const screen = await page.evaluate(captureScreen,{id:route.id,name:route.name,purpose:route.purpose});
    if (screen.actions.length!==route.edges.length || !screen.html.includes('<h1')) throw Error('Incomplete capture: '+route.id);
    if(planEditor){
      await button(page,'毎日○問').click();
      await markPlanControls();
      const backButton=button(page,'戻る');
      await backButton.evaluate((el,key)=>el.dataset.canvasControl=key,screen.actions[0].elementId);
      const daily=await page.evaluate(captureScreen,{id:route.id,name:route.name});
      screen.states.push({id:'daily',name:'毎日○問',html:daily.html,css:daily.css},
        {id:'saved',name:'計画を保存（モック）',html:'<main style="padding:20px"><h1>計画を保存しました</h1><p>モック内の学習計画です。</p><button data-node-id="plan-edit">計画に戻る</button></main>'});
      for(const [el,label,to] of [['plan-daily','毎日○問','daily'],['plan-deadline','期限までに1周','default'],['plan-edit','計画に戻る','default']])
        screen.actions.push({id:el,elementId:el,label,type:'setState',targetId:to});
      screen.actions.push({id:'plan-save',elementId:'plan-save',label:'計画を保存（モック）',type:'simulateRequest',successStateId:'saved'});
      await arrive(route);
    }
    screens.push(screen);
    for (const [index,[control,target]] of route.edges.entries()) {
      try {
        if (index) await arrive(route);
        await button(page,control).click();
        await routes.find(r=>r.id===target).marker(page).waitFor({timeout:6000});
      } catch (error) { throw Error('Failed to verify '+route.id+' → '+target,{cause:error}); }
    }
    console.log(route.id,screen.actions.length,screen.html.length,screen.css.length);
  }
  return screens;
}
