import { chromium } from 'playwright-core';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { captureScreen } from './screen.mjs';

// Render only this published build in an empty, signed-out browser.
const release = resolve(process.argv[2] || '.');
const output = process.argv[3] || 'snapshot.json';
const commit = process.argv[4];
if (!/^[a-f0-9]{40}$/.test(commit || '')) throw Error('Missing release commit');
const { buildId } = JSON.parse(await readFile(resolve(release, 'build-info.json'), 'utf8'));
if (!/^[a-zA-Z0-9_-]{1,80}$/.test(buildId)) throw Error('Invalid build ID');
const origin = 'https://iburigakko-picoloom.github.io';
const mime = { '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.html':'text/html',
  '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.jpg':'image/jpeg', '.woff2':'font/woff2' };
const browser = await chromium.launch({ channel: process.env.CANVAS_BROWSER_CHANNEL || undefined });
try {
  const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, locale:'ja-JP', timezoneId:'Asia/Tokyo', serviceWorkers:'block', reducedMotion:'reduce' });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || !url.pathname.startsWith('/medical/') || route.request().method() !== 'GET') return route.abort();
    const name = decodeURIComponent(url.pathname.slice('/medical/'.length)) || 'index.html';
    const file = resolve(release, name);
    if (!file.startsWith(release + sep)) return route.abort();
    try { await route.fulfill({ body: await readFile(file), contentType: mime[extname(file)] || 'application/octet-stream' }); }
    catch { await route.fulfill({ status:404, body:'' }); }
  });
  const page = await context.newPage();
  const tabs = { home:'ホーム', study:'学習', groups:'グループ', settings:'設定' };
  const routes = [
    ...Object.entries(tabs).map(([id,name])=>({id,name,tab:id,links:id==='home'?{plans:'学習計画', history:'学習記録を開く'}:id==='study'?{materials:'資料'}:{}})),
    {id:'materials',name:'学習資料',tab:'study',via:'資料',links:{study:'問題'}},
    {id:'plans',name:'学習計画',tab:'home',via:'学習計画',links:{home:'戻る'}},
    {id:'history',name:'学習記録',tab:'home',via:'学習記録を開く',links:{home:'ホームへ戻る'}},
  ];
  const screens = [];
  for (const {id, name, tab:tabId, via, links} of routes) {
    await page.goto(origin + '/medical/');
    const nav = page.locator('[aria-label="メインメニュー"]');
    const tab = nav.getByRole('button', {name:tabs[tabId], exact:true});
    await tab.waitFor({timeout:10000}).catch(async error => {
      console.error((await page.locator('body').innerText()).slice(0,600), await page.getByRole('button').allTextContents());
      throw error;
    });
    if (await page.locator('meta[name="quiz-build-id"]').getAttribute('content') !== buildId) throw Error('Build mismatch');
    await tab.click();
    if (id === 'study') await page.getByRole('button',{name:'問題',exact:true}).click();
    if (via) {
      await page.getByRole('button',{name:via,exact:true}).click();
      if (id === 'materials') await page.locator('button[aria-pressed="true"]').filter({hasText:'資料'}).waitFor();
      else await page.getByRole('heading',{name,exact:true}).first().waitFor({timeout:10000});
    }
    await page.waitForLoadState('networkidle');
    const screen = await page.evaluate(captureScreen, {id, name, tabs, links});
    if ((!via && Object.keys(tabs).some(key=>!screen.actions.some(a=>a.targetId===key))) || !screen.html.includes('<h1')) throw Error('Incomplete screen: ' + name);
    screens.push(screen);
  }
  const date = new Date().toISOString();
  const snapshot = {
    schemaVersion:1, kind:'design-snapshot',
    source:{url:'https://github.com/iburigakko-picoloom/medical', branch:'main', commit, confidence:'code', buildId:'v2-'+buildId},
    design:{schemaVersion:1, id:'quiz-medical-public', title:'Quiz Medical', revision:1, createdAt:date, updatedAt:date,
      description:'Quiz Medical 公開版の主要画面（ログイン前）', screens, components:[], connections:[], implementation:[], decisions:[]}
  };
  const json = JSON.stringify(snapshot);
  if (Buffer.byteLength(json) > 4500000 || screens.some(s=>s.html.length>180000 || s.css.length>80000)) throw Error('Design exceeds Canvas limits');
  await writeFile(output, json);
  console.log(buildId, screens.map(s => s.name).join(' / '));
} finally { await browser.close(); }
