// Optional native browser smoke. Requires Playwright + permitted Chromium.
// No app/user audio; synthetic fixtures and a temporary loopback-only server.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {synthesize, melody} = require('./audio-fixtures.cjs');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/KeyMemory/test.html') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><meta charset="utf-8"><script src="audio-transcription.js"></script>Audio worker smoke');
    return;
  }
  const relative = pathname.replace(/^\/KeyMemory\//, '');
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) {res.writeHead(403); res.end(); return;}
  res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
  fs.readFile(file, (error, data) => {res.statusCode = error ? 404 : 200; res.end(error ? '' : data);});
});
(async () => {
  let browser;
  try {
    await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox']});
    const context = await browser.newContext();
    const requests = [];
    let failModel = false;
    await context.route('**/*', route => {
      const request = route.request();
      requests.push({url: request.url(), method: request.method(), body: request.postData()});
      if (!request.url().startsWith(base + '/')) return route.abort();
      if (failModel && request.url().endsWith('/model.json')) return route.fulfill({status: 503, body: 'Unavailable'});
      return route.continue();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/KeyMemory/test.html');
    assert.equal(await page.evaluate(() => crossOriginIsolated), false, 'works without COOP/COEP');
    assert(!requests.some(request => request.url.includes('/assets/audio/')), 'assets stay lazy');
    const samples = Array.from(synthesize(melody, 7));
    const notes = await page.evaluate(data => KeyMemoryAudio.transcribe(new Float32Array(data)), samples);
    for (const expected of melody) {
      assert(notes.some(note => note.pitchMidi === expected.pitch && Math.abs(note.startTimeSeconds - expected.start) < 0.12));
    }
    for (const stage of ['loading', 'transcribing']) {
      const name = await page.evaluate(async ({samples: data, stage}) => {
        const aborter = new AbortController();
        try {
          await KeyMemoryAudio.transcribe(new Float32Array(data), {signal: aborter.signal,
            onProgress: progress => {if (progress.stage === stage) aborter.abort();}});
          return 'unexpected success';
        } catch (error) {return error.name;}
      }, {samples, stage});
      assert.equal(name, 'AbortError');
    }
    const repeat = await page.evaluate(data => KeyMemoryAudio.transcribe(new Float32Array(data)), samples);
    assert.deepEqual(repeat, notes, 'retry after abort works');
    failModel = true;
    assert.equal(await page.evaluate(async data => {
      try {await KeyMemoryAudio.transcribe(new Float32Array(data)); return false;}
      catch (_) {return true;}
    }, samples), true, 'failed model load rejects');
    failModel = false;
    assert.deepEqual(await page.evaluate(data => KeyMemoryAudio.transcribe(new Float32Array(data)), samples), notes, 'retry after failure works');
    assert(requests.every(request => request.url.startsWith(base + '/') && request.method === 'GET' && request.body === null), 'no uploads or third-party requests');
    assert(requests.some(request => request.url.endsWith('.wasm')));
    assert(!requests.some(request => request.url.includes('threaded-simd')));
    assert.deepEqual(errors, []);
    console.log('Native browser audio worker: real notes, subdirectory paths, no isolation headers, lazy same-origin GETs, loading/inference abort and repeat/failure retry passed.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
