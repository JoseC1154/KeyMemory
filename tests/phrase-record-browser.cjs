// Optional native desktop/mobile checks. Synthetic MIDI; no physical-device/audio claim.
const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.join(root,pathname==='/'?'index.html':pathname);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');fs.readFile(file,(error,data)=>{res.statusCode=error?404:200;res.end(error?'':data);});});
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const [width,height,mobile]of[[1280,900,false],[390,844,true],[320,740,true],[844,390,true]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile});await context.addInitScript(()=>{
   localStorage.setItem('keymemory.phrase.v1',JSON.stringify({version:1,sourceBpm:120,duration:2000,notes:[{note:60,velocity:90,channel:0,start:0,duration:800},{note:64,velocity:80,channel:0,start:1000,duration:600}]}));
   localStorage.setItem('keymemory.midiTransport.v1',JSON.stringify({version:1,enabled:true,mappings:{record:{kind:'note',number:36,channel:0},transposeUp:{kind:'control',number:22,channel:0}}}));
   const port={id:'qa',name:'Synthetic test keyboard',state:'connected',onmidimessage:null,open:()=>Promise.resolve(),close:()=>Promise.resolve()};
   window.recordTestMidi=(kind,number,value)=>port.onmidimessage?.({data:new Uint8Array([kind,number,value]),timeStamp:performance.now()});
   navigator.requestMIDIAccess=()=>Promise.resolve({inputs:new Map([['qa',port]]),onstatechange:null});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{errors.push('Unexpected native confirmation');d.dismiss();});
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.evaluate(()=>activateMode('phrase'));
  assert.equal(await page.locator('#phraseDelete').count(),0);assert(!await page.locator('#phraseDown').isVisible());await page.locator('#openSettings').click();assert(await page.locator('#phraseDown').isVisible());await page.locator('#connectMidi').click();await page.waitForFunction(()=>midiController.isConnected());await page.locator('#closeSettings').click();
  await page.evaluate(()=>phraseEngine.setOptions({countInBars:0,metronome:false}));
  const original=await page.evaluate(()=>localStorage.getItem('keymemory.phrase.v1')),record=page.locator('#phraseRecord'),prompt=page.locator('#phraseRecordConfirm');
  const press=()=>mobile?record.tap():record.click();await press();assert(await prompt.isVisible());assert.equal(await page.evaluate(()=>phraseSnapshot.state),'idle');assert.equal(await page.evaluate(()=>localStorage.getItem('keymemory.phrase.v1')),original);
  const fits=await prompt.evaluate(el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,width:innerWidth,overflow:document.documentElement.scrollWidth};});assert(fits.left>=0&&fits.right<=fits.width+1&&fits.overflow<=fits.width+1,JSON.stringify(fits));
  await page.locator('#phraseRecordCancel').click();assert(!await prompt.isVisible());assert(await record.evaluate(el=>el===document.activeElement));
  await press();await page.keyboard.press('Escape');assert(!await prompt.isVisible());
  if(!mobile){await record.focus();await page.keyboard.down('Enter');assert(await prompt.isVisible());await page.keyboard.down('Enter');assert.equal(await page.evaluate(()=>phraseSnapshot.state),'idle','held Enter cannot confirm');await page.keyboard.up('Enter');await page.keyboard.press('Enter');}
  else{await press();await press();}
  await page.waitForFunction(()=>phraseSnapshot.state==='recording');assert(!await prompt.isVisible());await page.locator('#phraseStop').click();assert.equal(await page.evaluate(()=>localStorage.getItem('keymemory.phrase.v1')),original,'empty recording preserves saved phrase');
  // MIDI confirmation and hidden-settings transposition use the same current UI actions.
  await page.evaluate(()=>recordTestMidi(0x90,36,100));assert(await prompt.isVisible());await page.evaluate(()=>recordTestMidi(0x90,36,100));assert.equal(await page.evaluate(()=>phraseSnapshot.state),'idle');
  await page.evaluate(()=>{recordTestMidi(0x80,36,0);recordTestMidi(0x90,36,100);recordTestMidi(0x80,36,0);});await page.waitForFunction(()=>phraseSnapshot.state==='recording');await page.locator('#phraseStop').click();
  await page.evaluate(()=>{recordTestMidi(0xb0,22,127);recordTestMidi(0xb0,22,0);});assert.equal(await page.evaluate(()=>phraseSnapshot.options.transpose),1);assert(!await page.locator('#phraseUp').isVisible());
  await page.locator('#openSettings').click();assert.equal(await page.locator('#phraseTransposeValue').innerText(),'+1 st');await page.locator('#phraseDown').click();assert.equal(await page.evaluate(()=>phraseSnapshot.options.transpose),0);await page.locator('#closeSettings').click();
  await press();await page.screenshot({path:path.join(__dirname,`phrase-record-${width}x${height}.png`),fullPage:true});assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS native two-press Record, mouse/touch/keyboard-repeat cancellation, saved-data retention, mapped MIDI and hidden-settings transpose, responsive prompt layout.');
}finally{await browser?.close();server.close();}})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
