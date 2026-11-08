// Actual CSS/layout using synthetic Web MIDI. No physical-keyboard/audio claim.
const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.join(root,pathname==='/'?'index.html':pathname);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');fs.readFile(file,(err,data)=>{res.statusCode=err?404:200;res.end(err?'':data);});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{for(const [width,height,mobile]of[[1280,900,false],[390,844,true],[320,740,true],[844,390,true]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile});
  await context.addInitScript(()=>{
   localStorage.setItem('keymemory.phrase.view',JSON.stringify({visibility:'hide'}));
   localStorage.setItem('keymemory.phrase.v1',JSON.stringify({version:1,sourceBpm:120,duration:5000,notes:[{note:60,channel:0,velocity:100,start:0,duration:4000},{note:61,channel:0,velocity:100,start:0,duration:4000}]}));
   const port={id:'test',name:'Synthetic keyboard',state:'connected',open:async()=>{},close:async()=>{},onmidimessage:null};
   navigator.requestMIDIAccess=async()=>({inputs:new Map([['test',port]]),onstatechange:null});
   window.sendMidi=(note,velocity=100,channel=0)=>port.onmidimessage?.({data:new Uint8Array([0x90|channel,note,velocity]),timeStamp:performance.now()});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(()=>{activateMode('phrase');document.getElementById('connectMidi').click();});await page.waitForFunction(()=>midiController.isConnected());
  for(const n of [60,61]){
   const key=page.locator(`.key[data-midi="${n}"]`);await key.scrollIntoViewIfNeeded();await page.evaluate(n=>sendMidi(n),n);await page.waitForTimeout(150);
   const state=await key.evaluate(el=>{const s=getComputedStyle(el),m=el.querySelector('.phraseLiveMarker'),ms=getComputedStyle(m);return{background:s.backgroundColor,color:s.color,marker:ms.display,markerRect:m.getBoundingClientRect().toJSON(),keyRect:el.getBoundingClientRect().toJSON(),down:new DOMMatrix(s.transform).m42,label:el.getAttribute('aria-label')};});
   assert.equal(state.background,'rgb(240, 140, 224)');assert.equal(state.color,'rgb(64, 9, 54)');assert.equal(state.marker,'block');assert.equal(state.down,n===60?4:3);assert.match(state.label,/your MIDI key held/);assert(state.markerRect.top>=state.keyRect.top&&state.markerRect.bottom<=state.keyRect.bottom);
   await page.evaluate(n=>sendMidi(n,0),n);assert.equal(await key.evaluate(el=>el.classList.contains('phraseLive')),false);
  }
  await page.evaluate(()=>{phraseEngine.setOptions({countInBars:0});document.getElementById('phrasePlay').click();});await page.waitForFunction(()=>phraseSnapshot.state==='playing');
  const key=page.locator('.key[data-midi="60"]');await page.evaluate(()=>sendMidi(60));
  const overlap=await key.evaluate(el=>({image:getComputedStyle(el).backgroundImage,label:el.getAttribute('aria-label'),play:el.classList.contains('phrasePlaying')}));assert(overlap.play);assert.match(overlap.image,/rgb\(137, 215, 255\).*22%.*rgb\(240, 140, 224\)/);assert.match(overlap.label,/playing, key held.*your MIDI key held/);
  await page.evaluate(()=>sendMidi(60,0));assert(await key.evaluate(el=>el.classList.contains('phrasePlaying')&&!el.classList.contains('phraseLive')));
  await page.evaluate(()=>{document.getElementById('phraseStop').click();inspectPhraseTime(200);sendMidi(61);});
  const black=page.locator('.key[data-midi="61"]');assert(await black.evaluate(el=>el.classList.contains('phraseInspectKey')&&el.classList.contains('phraseLive')));await page.evaluate(()=>flashWrongKey(61));
  const overlay=await black.evaluate(el=>{const s=getComputedStyle(el,'::after');return{content:s.content,background:s.backgroundColor,top:s.top,left:s.left,right:s.right,bottom:s.bottom,transform:s.transform};});assert.equal(overlay.background,'rgb(239, 68, 68)');assert.equal(overlay.content,'""');assert.equal(overlay.transform,'none');for(const edge of ['top','left','right','bottom'])assert.equal(overlay[edge],'0px');
  await page.waitForTimeout(1000);assert(await black.evaluate(el=>el.classList.contains('phraseLive')&&!el.classList.contains('wrongAnswer')));await page.evaluate(()=>sendMidi(61,0));
  await page.evaluate(()=>{midiTransport.setMapping('stop',{kind:'note',number:60,channel:0});midiTransport.setEnabled(true);sendMidi(60);});assert.equal(await key.evaluate(el=>el.classList.contains('phraseLive')),false);
  await page.evaluate(()=>sendMidi(60,100,1));assert.match(await key.evaluate(el=>getComputedStyle(el).backgroundImage),/rgb\(240, 140, 224\).*35%/);assert.match(await key.getAttribute('aria-label'),/MIDI shortcuts: Stop.*your MIDI key held/);await page.evaluate(()=>{sendMidi(60,0,1);sendMidi(60,0);});
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>sendMidi(64));assert.equal(await page.locator('.key[data-midi="64"]').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');await page.evaluate(()=>sendMidi(64,0));
  await page.locator('#phraseHelp > summary').click();
  const bounds=await page.locator('#phraseKeyLegend').boundingBox();assert(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width+1);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('#phraseKeyLegend').screenshot({path:path.join(__dirname,`phrase-live-legend-${width}x${height}.png`)});assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();}
 console.log('PASS: live pink/diamond, black/white geometry, playback and inspection overlap, red overlay, channel-specific shortcuts, reduced motion and responsive legend. Synthetic MIDI only.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
