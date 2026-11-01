// Run: node tests/browser-regression.cjs (requires Playwright and Chromium).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = path.join(root, req.url === '/' ? 'index.html' : new URL(req.url,'http://localhost').pathname);
  res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html');
  fs.readFile(file, (error, data) => { res.statusCode = error ? 404 : 200; res.end(error ? '' : data); });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args:['--no-sandbox'] });
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext(mobile ? { viewport:{width:390,height:844}, isMobile:true, hasTouch:true } : {viewport:{width:1280,height:900}});
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.evaluate(()=>{document.getElementById('builderLevel').value='sevenths';});
      const settings = async action => { await page.locator('#openSettings').click(); await action(); await page.locator('#closeSettings').click(); };
      const press = async midi => mobile ? page.locator(`[data-midi="${midi}"]`).tap() : page.locator(`[data-midi="${midi}"]`).click();
      for (const mode of ['find','semitones','degrees','remember','builder']) {
        await page.evaluate(mode => activateMode(mode), mode);
        if (mode === 'remember') await page.waitForTimeout(1900);
        const wrong = await page.evaluate(() => [...piano.querySelectorAll('.key')].map(k=>+k.dataset.midi).find(m => activeMode === 'degrees' ? m%12 !== chordAnswer : m%12 !== targetMidi%12));
        const before = await page.evaluate(()=>({target:targetMidi,prompt:trainingPrompt.textContent}));
        await press(wrong);
        const key = page.locator(`[data-midi="${wrong}"]`);
        assert.equal(await key.evaluate(k=>k.classList.contains('wrongAnswer')), true, `${mode}: red feedback`);
        assert.equal(await key.evaluate(k=>k.classList.contains('selected')), false, `${mode}: never green`);
        assert.equal(await key.getAttribute('aria-pressed'), 'false');
        await page.waitForTimeout(300);
        const held = await key.evaluate(k=>Number(getComputedStyle(k,'::after').opacity));
        assert(held > .8, `${mode}: red holds briefly`);
        await page.waitForTimeout(400);
        const fading = await key.evaluate(k=>Number(getComputedStyle(k,'::after').opacity));
        assert(fading > 0 && fading < held, `${mode}: red fades`);
        await page.waitForTimeout(400);
        assert.equal(await key.evaluate(k=>k.classList.contains('wrongAnswer')), false, `${mode}: red clears`);
        assert.equal(await page.locator('#nextChallenge').isVisible(), false, `${mode}: no retry gate`);
        assert.deepEqual(await page.evaluate(()=>({target:targetMidi,prompt:trainingPrompt.textContent})),before);
        await press(wrong);await press(wrong); // immediate repeat restarts feedback, never needs Next
        assert.equal(await key.evaluate(k=>k.classList.contains('wrongAnswer')),true);
        const answer = await page.evaluate(() => activeMode==='degrees' ? [...piano.querySelectorAll('.key')].map(k=>+k.dataset.midi).find(m=>m%12===chordAnswer) : targetMidi);
        await press(answer);
        assert.equal(await page.locator(`[data-midi="${answer}"]`).evaluate(k=>k.classList.contains('selected')), true, `${mode}: correct is green`);
      }
      // Finish two untimed chords, exercising the original dominant-seventh dead end.
      await page.evaluate(() => activateMode('builder'));
      for (let chord=0; chord<2; chord++) {
        for (let step=1;step<=3;step++) {
          await press(await page.evaluate(()=>targetMidi));
          if(step<3) await page.locator('#nextChallenge').click();
        }
        assert.equal(await page.evaluate(()=>builderStep), 4);
        assert.equal(await page.locator('#nextChallenge').isVisible(), true);
        assert.equal(await page.locator('#nextChallenge').textContent(), 'Build another chord');
        assert.equal(await page.locator('.key.chordTone').count(), 4);
        await page.locator('#nextChallenge').click();
        assert.equal(await page.evaluate(()=>builderStep), 1);
        assert.notEqual(await page.evaluate(()=>targetMidi), null);
      }
      // Timed completion continues automatically, with a manual fallback on timer disable.
      await settings(()=>page.locator('#timerEnabled').check());
      for (let step=1;step<=3;step++) {
        await press(await page.evaluate(()=>targetMidi));
        await page.waitForTimeout(step===2?4100:1900);
      }
      assert.equal(await page.evaluate(()=>builderStep), 4);
      assert.equal(await page.locator('#nextChallenge').isVisible(), true);
      await page.waitForTimeout(4100);
      assert.equal(await page.evaluate(()=>builderStep), 1);
      await page.evaluate(()=>{builderStep=3;builderNotes=builderTargets.slice(0,3);builderQuestion();});
      await press(await page.evaluate(()=>targetMidi));
      await page.waitForTimeout(1900);
      await settings(()=>page.locator('#timerEnabled').uncheck());
      assert.equal(await page.locator('#nextChallenge').isVisible(), true);
      await page.locator('#nextChallenge').click();
      assert.equal(await page.evaluate(()=>builderStep), 1);
      // A prior wrong-key animation cannot clear a new question's correct key.
      await page.evaluate(()=>activateMode('find'));
      const wrong = await page.evaluate(()=>48+(targetMidi+1)%12);
      await press(wrong);
      await page.evaluate(m=>{chooseChallenge();targetMidi=m;}, wrong);
      await press(wrong);
      await page.waitForTimeout(1100);
      assert.equal(await page.locator(`[data-midi="${wrong}"]`).evaluate(k=>k.classList.contains('selected')), true);
      await page.evaluate(()=>activateMode('free'));
      await press(48); await press(52);
      assert.equal(await page.locator('.key.selected').count(),2);
      await page.evaluate(()=>activateMode('dictionary'));
      assert.equal(await page.locator('.key.chordTone').count(),3);
      await settings(()=>page.locator('#dictionaryInversion').selectOption('1'));
      assert.deepEqual(await page.evaluate(()=>dictionaryVoicing),[52,55,60]);
      await page.locator('#toggleChordNotes').click();
      await settings(()=>page.locator('#timerEnabled').check());
      const deadlineBefore=await page.evaluate(()=>deadline);
      await press(52);await press(49);await press(49);
      assert.equal(await page.locator('[data-midi="49"]').evaluate(k=>k.classList.contains('wrongAnswer')),true);
      assert.deepEqual(await page.evaluate(()=>[...selected]),[52]);
      await page.locator('#checkChordAnswer').click();
      assert.equal(await page.locator('#checkChordAnswer').isDisabled(),false);
      assert.equal(await page.evaluate(()=>deadline),deadlineBefore);
      await press(55);await press(60);await page.locator('#checkChordAnswer').click();
      assert.equal(await page.locator('#checkChordAnswer').isDisabled(),true);
      await press(52);assert.deepEqual(await page.evaluate(()=>[...selected]),[52,55,60]);
      await settings(()=>page.locator('#timerEnabled').uncheck());
      await page.waitForTimeout(1100);
      assert.equal(await page.locator('[data-midi="49"]').evaluate(k=>k.classList.contains('wrongAnswer')),false);
      assert.deepEqual(errors, []);
      await page.screenshot({path:path.join(root, `tests/${mobile?'mobile':'desktop'}-verified.png`)});
      console.log(`PASS ${mobile?'mobile touch':'desktop'}: red hold/fade/repeat, immediate retries, correct green, five training modes, two complete chords, timed advance/toggle, stale feedback, Free Play/dictionary inversion partial retry/success lock, no console errors`);
      await context.close();
    }
  } finally { await browser.close(); server.close(); }
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
