// Real Chromium CSS animation and mouse/touch/native-keyboard/synthetic-MIDI input.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = path.join(root, new URL(req.url, 'http://localhost').pathname === '/' ? 'index.html' : new URL(req.url, 'http://localhost').pathname);
  res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html');
  fs.readFile(file, (error, data) => { res.statusCode = error ? 404 : 200; res.end(error ? '' : data); });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox'] });
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } });
      await context.addInitScript(() => {
        localStorage.setItem('keymemory.phrase.v1', JSON.stringify({ version: 1, sourceBpm: 120, duration: 1000, notes: [
          { note: 60, velocity: 90, channel: 0, start: 0, duration: 400 },
          { note: 64, velocity: 90, channel: 0, start: 600, duration: 400 }
        ] }));
        window.testMidi = { id: 'yc', name: 'YC Series Port 1', state: 'connected', open: () => Promise.resolve(), close: () => Promise.resolve() };
        Object.defineProperty(navigator, 'requestMIDIAccess', { value: () => Promise.resolve({ inputs: new Map([['yc', window.testMidi]]) }) });
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.evaluate(() => document.getElementById('connectMidi').click());
      await page.waitForFunction(() => !!window.testMidi.onmidimessage);
      for (const input of mobile ? ['touch'] : ['mouse', 'keyboard', 'midi']) {
        for (const mode of ['find', 'remember', 'semitones', 'degrees', 'builder', 'dictionary', 'scale-race', 'scale-degrees', 'phrase']) {
          await page.evaluate(mode => {
            activateMode(mode.startsWith('scale') ? 'scale' : mode);
            if (mode === 'dictionary') toggleChordNotes.click();
            if (mode === 'scale-race') { scaleStart.click(); document.getElementById('confirmScaleRun').click(); }
            if (mode === 'scale-degrees') {
              clearScaleDelay(); stopCountdown(); scalePhase = 'degrees'; scaleIndex = 2;
              scaleTarget = scaleNotes[2]; targetMidi = scaleTarget; scaleDegreeDeadline = performance.now() + 2000;
              selected.clear(); renderPiano(); updatePracticeChrome();
            }
            if (mode === 'phrase') phraseEngine.practice();
          }, mode);
          if (mode === 'remember') await page.waitForFunction(() => challengeTimer === null);
          if (mode === 'phrase') await page.waitForFunction(() => phraseSnapshot.state === 'practice');
          const wrong = await page.evaluate(mode => [48, 49, 60, 61, 52].find(note => piano.querySelector(`[data-midi="${note}"]`) && (
            mode === 'dictionary' ? !dictionaryVoicing.includes(note) :
            mode === 'phrase' ? !phraseSnapshot.target.includes(note) :
            mode === 'degrees' ? note % 12 !== chordAnswer : note % 12 !== targetMidi % 12)), mode);
          const key = page.locator(`.key[data-midi="${wrong}"]`);
          await key.scrollIntoViewIfNeeded();
          const base = await key.evaluate(k => getComputedStyle(k).backgroundImage);
          if (input === 'mouse') await key.click();
          else if (input === 'touch') await key.tap();
          else if (input === 'keyboard') await key.press('Enter');
          else await page.evaluate(note => window.testMidi.onmidimessage({ data: new Uint8Array([0x90, note, 100]), timeStamp: performance.now() }), wrong);
          assert(await key.evaluate(k => k.classList.contains('wrongAnswer')), `${mode}/${input}: marked wrong`);
          await page.waitForTimeout(180);
          const held = await key.evaluate(k => { const css = getComputedStyle(k, '::after'); return { opacity: +css.opacity, animation: css.animationName, duration: css.animationDuration, red: css.backgroundColor }; });
          assert(held.opacity > .8, `${mode}/${input}: red holds`);
          assert.equal(held.animation, 'wrongKeyFade'); assert.equal(held.duration, '0.95s'); assert.equal(held.red, 'rgb(239, 68, 68)');
          await page.evaluate(() => renderPiano());
          await page.waitForTimeout(450);
          const fading = await key.evaluate(k => +getComputedStyle(k, '::after').opacity);
          assert(fading > 0 && fading < held.opacity, `${mode}/${input}: same fading overlay after rerender (${fading})`);
          await page.waitForTimeout(450);
          assert(!await key.evaluate(k => k.classList.contains('wrongAnswer')), `${mode}/${input}: feedback clears`);
          if (mode === 'phrase' && input === 'midi') {
            assert(await key.evaluate(k => k.classList.contains('phraseLive')), 'a held MIDI note remains identifiable after red fades');
            assert.equal(await key.evaluate(k => getComputedStyle(k).backgroundColor), 'rgb(240, 140, 224)');
          } else assert.equal(await key.evaluate(k => getComputedStyle(k).backgroundImage), base, `${mode}/${input}: no permanent red base`);
          if (mode.startsWith('scale')) {
            assert.equal(await page.evaluate(() => scalePhase), 'correction');
            assert.equal(await page.locator('.key.correctionTarget').count(), 1);
            assert(await page.locator('#continueScaleCorrection').isVisible());
          }
          if (input === 'midi') await page.evaluate(note => window.testMidi.onmidimessage({ data: new Uint8Array([0x80, note, 0]), timeStamp: performance.now() }), wrong);
          console.log(`PASS ${mode}/${input}: shared red hold/fade/clear after rerender`);
        }
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('PASS: real Chromium hold/fade/clear in every graded mode via mouse, native Enter, synthetic raw MIDI and mobile touch; Scale correct-answer/Continue remains. Physical MIDI/audio not tested.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
