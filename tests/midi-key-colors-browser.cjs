// Actual CSS/layout/transition checks with synthetic MIDI. No hardware or listening claim.
const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://localhost').pathname==='/'?'index.html':new URL(req.url,'http://localhost').pathname);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');fs.readFile(file,(error,data)=>{res.statusCode=error?404:200;res.end(error?'':data);});});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  for(const [width,height,mobile]of[[1280,900,false],[390,844,true],[320,740,true],[844,390,true]]){
   const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile});
   await context.addInitScript(()=>{
    const actions=['record','stop','play','practice','continue','transposeDown','transposeUp'];
    localStorage.setItem('keymemory.midiTransport.v1',JSON.stringify({version:1,enabled:true,mappings:Object.fromEntries(actions.map((action,i)=>[action,{kind:'note',number:48+i,channel:i}]))}));
    localStorage.setItem('keymemory.phrase.v1',JSON.stringify({version:1,sourceBpm:120,duration:2000,notes:[{note:60,velocity:90,channel:0,start:0,duration:1500},{note:64,velocity:90,channel:0,start:0,duration:1500}]}));
    const port={id:'test',name:'Test MIDI input',state:'connected',open:async()=>{},close:async()=>{},onmidimessage:null};
    navigator.requestMIDIAccess=async()=>({inputs:new Map([['test',port]]),onstatechange:null});
    window.sendTestMidi=(note,velocity=100,channel=0)=>port.onmidimessage?.({data:new Uint8Array([0x90|channel,note,velocity]),timeStamp:performance.now()});
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(`http://127.0.0.1:${server.address().port}`);await page.evaluate(()=>activateMode('phrase'));
   await page.locator('#openSettings').click();await page.locator('#connectMidi').click();await page.waitForFunction(()=>midiController.isConnected());await page.locator('#closeSettings').click();
   if(mobile&&await page.locator('#phraseViewSwitch').innerText()==='Show piano')await page.locator('#phraseViewSwitch').click();
   const colors=await page.evaluate(()=>{
    const ids=['phraseRecord','phraseStop','phrasePlay','phrasePractice','scaleStart','phraseDown','phraseUp'];
    return ids.map((id,i)=>{const key=document.querySelector(`.key[data-midi="${48+i}"]`),button=document.getElementById(id);return{key:getComputedStyle(key).backgroundColor,button:getComputedStyle(button).backgroundColor,label:key.getAttribute('aria-label'),action:key.dataset.midiActions};});
   });
   assert.equal(new Set(colors.map(x=>x.key)).size,7,'each action has a distinct key color');for(const item of colors){assert.equal(item.key,item.button,item.action+' key matches control');assert.match(item.label,/MIDI shortcuts/);}
   assert.equal(await page.locator('.transposeKeyBadge').count(),0);
   // Black and white shortcut keys must move without losing their assignment color.
   for(const [note,channel,depth]of[[49,1,3],[52,4,4]]){
    const key=page.locator(`.key[data-midi="${note}"]`);await key.scrollIntoViewIfNeeded();
    const before=await key.evaluate(el=>{el.retainedForTest=true;return{color:getComputedStyle(el).backgroundColor,shadow:getComputedStyle(el).boxShadow};});
    await page.evaluate(([n,ch])=>sendTestMidi(n,100,ch),[note,channel]);await page.waitForTimeout(120);
    const down=await key.evaluate(el=>({y:new DOMMatrix(getComputedStyle(el).transform).m42,color:getComputedStyle(el).backgroundColor,shadow:getComputedStyle(el).boxShadow,retained:el.retainedForTest}));
    assert.equal(down.y,depth);assert.equal(down.color,before.color);assert.notEqual(down.shadow,before.shadow);assert(down.retained);
    await page.evaluate(()=>renderPiano());assert(await key.evaluate(el=>el.retainedForTest),'key node survives rerender');
    await page.evaluate(([n,ch])=>sendTestMidi(n,0,ch),[note,channel]);await page.waitForTimeout(120);assert.equal(await key.evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m42),0);
   }
   // Multiple channels share split body fills and retain exact accessible identities.
   await page.evaluate(()=>{midiTransport.setMapping('transposeDown',{kind:'note',number:60,channel:0});midiTransport.setMapping('transposeUp',{kind:'note',number:60,channel:1});});
   const split=page.locator('.key[data-midi="60"]');assert.match(await split.evaluate(el=>getComputedStyle(el).backgroundImage),/linear-gradient/);assert.match(await split.getAttribute('aria-label'),/channel 1; Transpose up on MIDI channel 2/);
   await page.evaluate(()=>inspectPhraseTime(200));assert(await split.evaluate(el=>el.classList.contains('phraseInspectKey')));assert.match(await split.evaluate(el=>getComputedStyle(el).backgroundImage),/linear-gradient/,'inspection keeps shortcut colors');
   await page.evaluate(()=>{const el=document.querySelector('.key[data-midi="60"]');el.classList.add('selected','chordTone','builderNewest','correctionTarget');});assert.match(await split.evaluate(el=>getComputedStyle(el).backgroundImage),/linear-gradient/,'grading preserves mapped fill');
   await page.evaluate(()=>renderPiano());await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await split.evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
   await page.evaluate(()=>sendTestMidi(60,100,0));assert.equal(await split.evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m42),4);await page.evaluate(()=>sendTestMidi(60,0,0));await page.emulateMedia({reducedMotion:'no-preference'});
   const geometry=await page.evaluate(()=>({body:document.documentElement.scrollWidth,width:innerWidth,legend:document.getElementById('midiShortcutLegend').getBoundingClientRect().toJSON()}));assert(geometry.body<=geometry.width+1,JSON.stringify(geometry));assert(geometry.legend.left>=0&&geometry.legend.right<=geometry.width+1);
   await page.locator('#midiShortcutLegend').screenshot({path:path.join(__dirname,`midi-key-legend-${width}x${height}.png`)});
   await page.evaluate(()=>midiTransport.setEnabled(false));assert.equal(await page.locator('.midiMappedKey').count(),0);assert.equal(await page.locator('.midiKeyDown').count(),0);assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS: real Chromium desktop/mobile/landscape full-key colors, matching controls, stable press/release transforms and shadows, no badges, channel splits, inspection/grading overlap, reduced motion and responsive legend. Synthetic MIDI only.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
