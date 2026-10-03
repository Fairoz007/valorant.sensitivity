import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await mkdir('validation-artifacts/ui-qa',{recursive:true});
const report=[];
await page.goto('http://127.0.0.1:5173/?e2e');
await page.locator('input[placeholder="800"]').fill('800');
await page.locator('input[placeholder="0.30"]').fill('0.30');
async function capture(name){for(const [width,height] of [[1920,1080],[2560,1440],[1366,768],[960,720]]){await page.setViewportSize({width,height});await page.waitForTimeout(150);await page.screenshot({path:`validation-artifacts/ui-qa/${name}-${width}.png`,fullPage:true});report.push(await page.evaluate(name=>({name,width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,overflow:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.left < -1 || r.right>innerWidth+1)}).slice(0,12).map(e=>({tag:e.tagName,class:e.className,text:e.textContent?.slice(0,70)}))}),name));}}
await capture('setup');
await page.locator('button[type="submit"]').click();await page.waitForTimeout(1200);await capture('diagnostics');
await page.getByRole('button',{name:/Continue to Motion Calibration/}).click();await capture('calibration');
await page.getByRole('button',{name:/Skip/}).click();await page.waitForFunction(()=>!!window.__valorantArena);await capture('aim-battery');
await page.setViewportSize({width:1920,height:1080});await page.mouse.click(960,540);await page.waitForFunction(()=>window.__valorantArena.engine.isLocked());await capture('gameplay');
await page.evaluate(()=>document.exitPointerLock());
await page.goto('http://127.0.0.1:5173/?e2e');
const saved=JSON.parse(await readFile('validation-artifacts/browser-session.json','utf8'));
await page.evaluate(async result=>{const {useAppStore}=await import('/src/store/useAppStore.ts');useAppStore.getState().completeSession(result)},saved.result);
await capture('results');
await writeFile('validation-artifacts/ui-qa/report.json',JSON.stringify({report,errors},null,2));
console.log(JSON.stringify({errors,overflow:report.filter(r=>r.overflow.length)},null,2));
await browser.close();

