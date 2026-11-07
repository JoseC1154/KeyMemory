// Real local video decoding + real worker transcription. No publishing or remote media.
'use strict';
const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createVideoFixtures}=require('./video-fixtures.cjs'),root=path.resolve(__dirname,'..');
async function runVideoImportChecks(browser,origin,fixtureDir){
 for(const [width,height,mobile]of[[1280,900,false],[390,844,true],[320,740,true]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),requests=[],errors=[];
  page.on('request',r=>requests.push({url:r.url(),method:r.method()}));page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>localStorage.setItem('keymemory.phrase.v1',JSON.stringify({version:1,sourceBpm:90,duration:1000,notes:[{note:48,velocity:90,channel:0,start:0,duration:800}]})));
  await page.goto(origin);await page.locator('#openModes').click();await page.locator('[data-mode=phrase]').click();const saved=await page.evaluate(()=>localStorage.getItem('keymemory.phrase.v1'));
  await page.locator('#phraseImport').click();assert.match(await page.locator('#audioImportTitle').innerText(),/video/);
  for(const filename of mobile?['generated-piano.webm']:['generated-piano.mp4','generated-piano.mov','generated-piano.webm']){
   await page.locator('#audioImportFile').setInputFiles(path.join(fixtureDir,filename));
   await page.waitForFunction(()=>document.getElementById('audioImportCancel').hidden);
   assert(!await page.locator('#audioImportAnalyze').isDisabled(),`${filename}: ${await page.locator('#audioImportStatus').innerText()}`);
   assert.match(await page.locator('#audioImportStatus').innerText(),/Video audio is ready/);
   assert.equal(await page.evaluate(()=>localStorage.getItem('keymemory.phrase.v1')),saved);
  }
  assert(!requests.some(r=>r.url.includes('/assets/audio/')),'metadata and decode do not fetch the model');
  await page.locator('#audioImportAnalyze').click();await page.waitForFunction(()=>!document.getElementById('audioImportReview').hidden,{},{timeout:120000});
  assert(await page.locator('.audioImportNote').count()>=3,'compressed synthetic notes reach real model review');
  assert(!await page.locator('#audioImportUse').isDisabled());assert.equal(await page.evaluate(()=>localStorage.getItem('keymemory.phrase.v1')),saved);
  const bounds=await page.locator('.audioImportPanel').evaluate(panel=>{const r=panel.getBoundingClientRect();return{left:r.left,right:r.right,width:innerWidth,overflow:panel.scrollWidth>panel.clientWidth+1};});assert(bounds.left>=0&&bounds.right<=bounds.width+1&&!bounds.overflow,JSON.stringify(bounds));
  await page.screenshot({path:path.join(fixtureDir,`video-review-${width}x${height}.png`)});
  page.once('dialog',dialog=>dialog.accept());await page.locator('#audioImportUse').click();assert(!await page.locator('#phraseImportOverlay').isVisible());
  const imported=await page.evaluate(()=>localStorage.getItem('keymemory.phrase.v1'));assert.equal(JSON.parse(imported).origin,'audio');assert(!imported.includes('generated-piano'));assert(await page.locator('#phraseAudioOrigin').isVisible());
  await page.locator('#phraseImport').click();
  for(const filename of ['no-audio.mp4','invalid.mp4']){
   await page.locator('#audioImportFile').setInputFiles(path.join(fixtureDir,filename));await page.waitForFunction(()=>document.getElementById('audioImportCancel').hidden);
   assert(await page.locator('#audioImportAnalyze').isDisabled());assert.match(await page.locator('#audioImportStatus').innerText(),/no audio track this browser can decode/);assert.equal(await page.evaluate(()=>localStorage.getItem('keymemory.phrase.v1')),imported);
  }
  await page.locator('#audioImportFile').setInputFiles(path.join(fixtureDir,'generated-piano.webm'));await page.waitForFunction(()=>!document.getElementById('audioImportAnalyze').disabled);
  await page.locator('#audioImportAnalyze').click();await page.locator('#audioImportCancel').click();await page.locator('#audioImportClose').click();await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>localStorage.getItem('keymemory.phrase.v1')),imported);
  assert(requests.every(r=>r.method==='GET'&&(r.url.startsWith(origin+'/')||r.url.startsWith('blob:'+origin+'/'))),JSON.stringify(requests));assert(requests.some(r=>r.url.endsWith('.wasm')));assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS real Chromium video import: MP4/AAC, MOV/AAC, WebM/Opus decode; real WebM audio resampling/worker transcription/review/accept; silent/corrupt video rejection; no media upload/persistence; cancel/retry; desktop and two mobile layouts. Synthetic media, not physical-device or listening validation. Screenshots: '+fixtureDir);
}
module.exports={runVideoImportChecks};
if(require.main===module)(async()=>{
 const fixtureDir=process.env.VIDEO_FIXTURE_DIR||createVideoFixtures();let browser;
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':file.endsWith('.wasm')?'application/wasm':file.endsWith('.bin')?'application/octet-stream':file.endsWith('.css')?'text/css':'text/html');fs.readFile(file,(err,bytes)=>{res.statusCode=err?404:200;res.end(err?'':bytes);});});
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-crash-reporter']});await runVideoImportChecks(browser,`http://127.0.0.1:${server.address().port}`,fixtureDir);}
 finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
