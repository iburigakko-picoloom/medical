import { chromium } from 'playwright-core';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { makeRoutes, captureRoutes } from './routes.mjs';
import { attachPractice } from './practice.mjs';
import { loginMockups } from './mockups.mjs';
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
  await page.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(origin+'/medical/');
  await page.getByRole('button',{name:'設定',exact:true}).click();
  const versionTitle=await page.getByRole('heading',{name:/共通教材[\s　]*v\d+/}).innerText();
  const version=/v(\d+)/.exec(versionTitle)[1];
  const bank = JSON.parse(await readFile(resolve(release,'content/common-v'+version+'.json'),'utf8'));
  const subjects=bank.pdfs.map(pdf=>pdf.title.replace(/\s+v\d+.*$/i,''));
  const captured = await captureRoutes(page, origin + '/medical/', buildId, makeRoutes(), captureScreen, subjects);
  if(subjects.some(name=>!captured.some(s=>s.name===name && s.actions.some(a=>a.label.includes('学習計画')))))throw Error('Missing published subject workflow');
  const covers={};
  for (const pdf of bank.pdfs) {
    if (!/^[0-9a-f]{64}$/.test(pdf.sha256)) continue;
    const image=await readFile(resolve(release,'content/covers/'+pdf.sha256+'.webp')).catch(()=>null);
    if (image && image.length<=35000) covers[pdf.subjectId]='data:image/webp;base64,'+image.toString('base64');
  }
  const screens = await page.evaluate(attachPractice,{screens:captured,bank,covers});
  screens.push(...loginMockups());
  const date = new Date().toISOString();
  const snapshot = {
    schemaVersion:1, kind:'design-snapshot',
    source:{url:'https://github.com/iburigakko-picoloom/medical', branch:'main', commit, confidence:'code', buildId:'v5-'+buildId},
    design:{schemaVersion:1, id:'quiz-medical-public', title:'Quiz Medical', revision:1, createdAt:date, updatedAt:date,
      description:'公開画面の操作記録と、ログイン後のモックアップ', screens, components:[], connections:[], implementation:[], decisions:[]}
  };
  const json = JSON.stringify(snapshot);
  if (Buffer.byteLength(json) > 4500000 || screens.some(s=>s.html.length>180000 || s.css.length>80000)) throw Error('Design exceeds Canvas limits: '+Buffer.byteLength(json)+' bytes; '+screens.filter(s=>s.html.length>180000 || s.css.length>80000).map(s=>s.id).join(', '));
  await writeFile(output, json);
  console.log(buildId, screens.map(s => s.name).join(' / '));
} finally { await browser.close(); }
