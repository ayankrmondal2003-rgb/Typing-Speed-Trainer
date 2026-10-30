const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(`${__dirname}/index.html`, 'utf8');
const sources = ['typing-engine.js', 'session-analytics.js', 'script.js'].map(file => fs.readFileSync(`${__dirname}/${file}`, 'utf8'));
async function app(t, saved = {}) {
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const w = dom.window;
  await new Promise(resolve => w.addEventListener('load', resolve));
  let time = 0;
  let tick;
  let nextTimer = 0;
  const timers = new Set();
  const charts = [];
  w.performance.now = () => time;
  w.setInterval = callback => { tick = callback; timers.add(++nextTimer); return nextTimer; };
  w.clearInterval = id => timers.delete(id);
  w.Chart = class { constructor(canvas, config) { this.config = config; charts.push(this); } destroy() { this.destroyed = true; } };
  for (const [key, value] of Object.entries(saved)) w.localStorage.setItem(key, value);
  sources.forEach(source => w.eval(source));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const $ = selector => w.document.querySelector(selector);
  const change = (selector, value) => { $(selector).value = value; $(selector).dispatchEvent(new w.Event('change', { bubbles: true })); };
  const settle = () => new Promise(resolve => setTimeout(resolve, 5));
  const navigate = async page => { w.location.hash = page; await settle(); };
  const click = async selector => { $(selector).click(); await settle(); };
  const key = value => $('#typing-input').dispatchEvent(new w.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
  const start = async () => { $('#session-form').dispatchEvent(new w.Event('submit', { cancelable: true })); await settle(); };
  return { w, $, change, charts, timers, settle, navigate, click, key, start, advance: ms => { time += ms; tick?.(); } };
}
test('frontend: defaults, empty states, settings persistence and configuration navigation', async t => {
  const a = await app(t); const { $, change } = a;
  assert.equal($('#difficulty').value, 'medium'); assert.equal($('#duration').value, '60');
  assert.equal($('#mode').value, 'test'); assert.equal($('#custom-wrap').hidden, true);
  await a.navigate('stats'); assert.match($('#chart-empty').textContent, /Complete a test/);
  assert.equal($('#chart-wrap').hidden, true); assert.equal($('#stats-keyboard .key.low'), null);
  await a.navigate('home'); change('#difficulty', 'hard'); change('#duration', '120');
  await a.navigate('settings'); change('#settings-theme', 'dark');
  assert.equal(a.w.localStorage.getItem('zenith-theme'), 'dark');
  assert.equal(a.w.document.documentElement.dataset.theme, 'dark');
  await a.navigate('home'); assert.equal($('#difficulty').value, 'hard'); assert.equal($('#duration').value, '120');
  assert.equal($('#home-theme').value, 'dark');
  change('#home-theme', 'light'); assert.equal($('#settings-theme').value, 'light');
  change('#home-theme', 'neo'); assert.equal(a.w.document.documentElement.dataset.theme, 'neo');
  const b = await app(t, { 'zenith-theme': 'dark' }); assert.equal(b.w.document.documentElement.dataset.theme, 'dark');
});
test('frontend: Home → custom → input/correction → results → stats/chart → practice', async t => {
  const a = await app(t); const { $, change } = a;
  change('#source', 'custom'); assert.equal($('#custom-wrap').hidden, false);
  await a.start(); assert.match($('#config-error').textContent, /non-whitespace/); assert.equal($('#typing').hidden, true);
  $('#custom-text').value = 'aaa'; await a.start(); assert.equal($('#typing').hidden, false);
  a.key('x'); assert.ok($('#prompt .incorrect')); assert.equal($('#live-mistakes').textContent, '1');
  a.key('Backspace'); a.key('x'); a.key('Backspace'); a.key('a');
  assert.match($('#live-weak').textContent, /Focus next: a/); assert.ok($('#live-keyboard .key.high'));
  assert.ok($('#prompt .correct')); assert.equal($('#prompt .current').textContent, 'a');
  a.advance(1000); assert.equal($('#live-time').textContent, '59s');
  a.key('a'); a.key('a'); await a.settle();
  assert.equal($('#results').hidden, false); assert.equal($('#result-accuracy').textContent, '60.0%');
  assert.equal($('#result-wpm').textContent, '36.0');
  assert.equal(a.w.zenith.sessionStore.getHistory().length, 1);
  await a.navigate('stats'); assert.equal($('#history-body').children.length, 1);
  assert.equal(a.charts.at(-1).config.data.datasets[0].data[0], 36);
  assert.equal($('#chart-wrap').hidden, false);
  assert.equal(a.w.zenith.sessionStore.getPersonalBests()[60], 36);
  await a.click('#stats [data-practice]'); assert.equal($('#typing').hidden, false);
  assert.equal(a.w.typingEngine.getState().mode, 'practice');
  assert.notEqual(a.w.typingEngine.getState().prompt, 'aaa');
  assert.equal(a.w.zenith.sessionStore.getHistory().length, 1);
});
test('frontend: all difficulty and time options, restart, timeout and try again', async t => {
  const a = await app(t);
  for (const difficulty of ['easy','medium','hard']) for (const duration of ['30','60','120']) {
    await a.navigate('home'); a.change('#difficulty', difficulty); a.change('#duration', duration); await a.start();
    assert.equal(a.w.typingEngine.getState().difficulty, difficulty); assert.equal(a.w.typingEngine.getState().duration, Number(duration));
    a.key('x'); await a.click('#restart'); assert.equal(a.w.typingEngine.getState().totalKeystrokes, 0);
    assert.equal(a.w.typingEngine.getState().status, 'ready');
  }
  assert.equal(a.w.zenith.sessionStore.getHistory().length, 0);
  a.key('A'); a.advance(120000); await a.settle();
  assert.equal(a.$('#results').hidden, false); assert.match(a.$('#result-description').textContent, /Time is up/);
  assert.equal(a.w.zenith.sessionStore.getHistory().length, 1);
  await a.click('#try-again'); assert.equal(a.$('#typing').hidden, false); assert.equal(a.w.typingEngine.getState().status, 'ready');
  assert.equal(a.w.zenith.sessionStore.getHistory().length, 1);
});
test('frontend: end and navigation discard partial sessions without duplicate records', async t => {
  const a = await app(t); await a.start(); a.key('x'); a.advance(1000); await a.click('#end-test');
  assert.equal(a.$('#results').hidden, false); assert.match(a.$('#result-description').textContent, /not saved/);
  assert.equal(a.w.zenith.sessionStore.getHistory().length, 0);
  await a.click('#try-again'); a.key('a'); await a.navigate('stats'); a.advance(120000);
  assert.equal(a.w.zenith.sessionStore.getHistory().length, 0);
  await a.navigate('typing'); assert.equal(a.$('#home').hidden, false);
  await a.navigate('home'); a.change('#source', 'custom'); a.$('#custom-text').value = 'x'; await a.start();
  a.key('x'); await a.settle(); await a.navigate('stats'); await a.navigate('results');
  assert.equal(a.w.zenith.sessionStore.getHistory().length, 1);
});
test('frontend: generated practice ignores custom source and preserves its selection', async t => {
  const a = await app(t); a.change('#source', 'custom'); a.change('#mode', 'practice');
  assert.equal(a.$('#source').disabled, true); assert.equal(a.$('#custom-wrap').hidden, true);
  await a.start(); assert.equal(a.w.typingEngine.getState().mode, 'practice');
  await a.navigate('home'); a.change('#mode', 'test'); assert.equal(a.$('#source').value, 'custom');
  assert.equal(a.$('#custom-wrap').hidden, false);
});
test('frontend: mobile beforeinput, paste prevention, chart filters and missing-chart fallback', async t => {
  const a = await app(t); a.change('#source', 'custom'); a.$('#custom-text').value = 'abc'; await a.start();
  const input = a.$('#typing-input');
  const paste = new a.w.Event('paste', { cancelable: true }); input.dispatchEvent(paste); assert.equal(paste.defaultPrevented, true);
  input.dispatchEvent(new a.w.InputEvent('beforeinput', { inputType: 'insertText', data: 'ab', cancelable: true }));
  assert.equal(a.w.typingEngine.getState().position, 2);
  input.dispatchEvent(new a.w.InputEvent('beforeinput', { inputType: 'deleteContentBackward', cancelable: true }));
  assert.equal(a.w.typingEngine.getState().position, 1);
  a.advance(1000); a.key('b'); a.key('c'); await a.settle(); await a.navigate('stats');
  a.change('#history-filter', 'test'); assert.equal(a.$('#history-body').children.length, 0);
  a.change('#history-filter', 'custom'); assert.equal(a.$('#history-body').children.length, 1);
  a.w.Chart = undefined; a.change('#history-filter', 'all'); assert.match(a.$('#chart-empty').textContent, /Chart unavailable/);
});
test('frontend: storage survives reload and blocked writes keep the journey functional', async t => {
  const a = await app(t); a.change('#source', 'custom'); a.$('#custom-text').value = 'ab'; await a.start(); a.key('a'); a.advance(1000); a.key('b'); await a.settle();
  const saved = Object.fromEntries(Object.keys(a.w.localStorage).map(key => [key, a.w.localStorage.getItem(key)]));
  const b = await app(t, saved); await b.navigate('stats'); assert.equal(b.$('#history-body').children.length, 1);
  assert.equal(b.w.zenith.sessionStore.getPersonalBests()[60], 24);
  b.w.Storage.prototype.setItem = () => { throw Error('blocked'); };
  await b.navigate('settings'); b.change('#settings-theme', 'dark'); assert.match(b.$('#theme-status').textContent, /unavailable/);
  await b.navigate('home'); b.change('#source', 'custom'); b.$('#custom-text').value = 'x'; await b.start(); b.key('x'); await b.settle();
  assert.match(b.$('#save-status').textContent, /this visit only/);
});
test('frontend: idle timer ticks retain passage and keyboard DOM nodes', async t => {
  const a = await app(t); await a.start(); a.key('S');
  const character = a.$('#prompt span'); const key = a.$('#live-keyboard .key');
  a.advance(500);
  assert.equal(a.$('#prompt span'), character);
  assert.equal(a.$('#live-keyboard .key'), key);
});
test('frontend: IME composition survives timer ticks and commits once', async t => {
  const a = await app(t); a.change('#source', 'custom'); a.$('#custom-text').value = '日本'; await a.start();
  const input = a.$('#typing-input');
  input.dispatchEvent(new a.w.CompositionEvent('compositionstart'));
  input.value = 'に'; a.advance(100);
  assert.equal(input.value, 'に');
  input.dispatchEvent(new a.w.CompositionEvent('compositionend', { data: '日' }));
  assert.equal(a.w.typingEngine.getState().position, 1);
});
test('frontend: live weak-key action targets the current unsaved session', async t => {
  const a = await app(t); a.change('#source', 'custom'); a.$('#custom-text').value = 'qq'; await a.start();
  for (let i = 0; i < 3; i++) { a.key('x'); a.key('Backspace'); }
  const drill = a.w.zenith.startPractice(); await a.settle();
  assert.equal(drill.fallback, false); assert.ok(drill.targetKeys.includes('q'));
  assert.equal(a.w.zenith.sessionStore.getHistory().length, 0);
});
test('frontend: timers and charts are released, initialization cannot duplicate listeners', async t => {
  const a = await app(t); assert.equal(a.timers.size, 0);
  a.w.document.dispatchEvent(new a.w.Event('DOMContentLoaded'));
  await a.start(); assert.equal(a.timers.size, 1);
  a.key('S'); assert.equal(a.w.typingEngine.getState().totalKeystrokes, 1);
  await a.click('#restart'); assert.equal(a.timers.size, 1);
  await a.navigate('home'); assert.equal(a.timers.size, 0);
  a.change('#source', 'custom'); a.$('#custom-text').value = 'ab'; await a.start();
  a.key('a'); a.advance(1000); a.key('b'); await a.settle(); assert.equal(a.timers.size, 0);
  await a.navigate('stats'); const chart = a.charts.at(-1);
  await a.navigate('home'); assert.equal(chart.destroyed, true);
  await a.start(); a.w.dispatchEvent(new a.w.Event('pagehide')); assert.equal(a.timers.size, 0);
});
test('phase5: racer follows real input, corrections and completion; practice hides it', async t => {
  const a = await app(t); a.change('#source', 'custom'); a.$('#custom-text').value = 'abcd'; await a.start();
  assert.equal(a.$('#race-experience').hidden, false); assert.equal(a.$('#racer').style.left, '0%');
  a.key('a'); a.advance(1000); assert.equal(a.$('#racer').style.left, '25%');
  a.key('x'); assert.equal(a.$('#racer').style.left, '50%');
  a.key('Backspace'); assert.equal(a.$('#racer').style.left, '25%');
  a.key('b'); a.key('c'); a.key('d'); await a.settle();
  assert.equal(a.$('#racer').style.left, '100%');
  assert.match(a.$('#race-experience').textContent, /no recorded progress timeline/);
  await a.click('#result-practice'); assert.equal(a.$('#race-experience').hidden, true);
  assert.equal(a.$('#practice-context').hidden, false);
  assert.match(a.$('#practice-reason').textContent, /balanced warm-up/);
});
test('phase5: personal-best achievement is genuine and excludes ties and partial exits', async t => {
  const a = await app(t); a.change('#source', 'custom'); a.$('#custom-text').value = 'ab'; await a.start();
  a.key('a'); a.advance(1000); a.key('b'); await a.settle();
  assert.equal(a.$('#personal-best-achievement').hidden, false);
  assert.match(a.$('#personal-best-achievement').textContent, /24.0 WPM/);
  await a.click('#try-again'); a.key('a'); a.advance(1000); a.key('b'); await a.settle();
  assert.equal(a.$('#personal-best-achievement').hidden, true);
  await a.click('#try-again'); a.key('a'); await a.click('#end-test');
  assert.equal(a.$('#personal-best-achievement').hidden, true);
});
test('phase5: practice shows actual targets, measured improvement, retry and new drills', async t => {
  const a = await app(t); a.change('#source', 'custom'); a.$('#custom-text').value = 'qq'; await a.start();
  for (let i = 0; i < 3; i++) { a.key('x'); a.key('Backspace'); }
  const drill = a.w.zenith.startPractice(); await a.settle();
  assert.equal(a.$('#practice-targets kbd').textContent, 'q');
  assert.match(a.$('#practice-reason').textContent, /100% errors in 3 attempts/);
  for (const key of drill.text) { a.advance(100); a.key(key); }
  await a.settle(); assert.match(a.$('#practice-feedback').textContent, /100.0% → 0.0% errors/);
  assert.match(a.$('#practice-feedback').textContent, /100.0 percentage points lower/);
  assert.equal(a.$('#result-practice').textContent, 'New Drill');
  await a.click('#try-again'); assert.equal(a.w.typingEngine.getState().prompt, drill.text);
  await a.click('#new-drill'); assert.notEqual(a.w.typingEngine.getState().prompt, drill.text);
  assert.equal(a.w.zenith.sessionStore.getHistory().length, 1);
});
test('phase5: CSV exports actual full history, handles empty data and releases download URL', async t => {
  const a = await app(t); await a.navigate('stats');
  assert.equal(a.$('#export-csv').disabled, true); assert.equal(a.w.zenith.historyCsv(), '');
  await a.navigate('home'); a.change('#source', 'custom'); a.$('#custom-text').value = 'ab'; await a.start();
  a.key('a'); a.advance(1000); a.key('b'); await a.settle(); await a.navigate('stats');
  a.change('#history-filter', 'test'); assert.equal(a.$('#history-body').children.length, 0);
  assert.equal(a.$('#export-csv').disabled, false);
  const csv = a.w.zenith.historyCsv(); const record = a.w.zenith.sessionStore.getHistory()[0];
  assert.ok(csv.startsWith('"timestamp","mode","duration","difficulty","wpm","accuracy","mistakes"\r\n'));
  assert.ok(csv.includes(`"${record.date}","custom","60","medium","24","100","0"`));
  let downloaded = false; let revoked = false;
  a.w.URL.createObjectURL = blob => { assert.ok(blob.size > 0); return 'blob:zenith-test'; };
  a.w.URL.revokeObjectURL = url => { assert.equal(url, 'blob:zenith-test'); revoked = true; };
  a.w.HTMLAnchorElement.prototype.click = function () { assert.equal(this.download, 'zenith-history.csv'); downloaded = true; };
  a.w.setTimeout = callback => { callback(); return 1; };
  await a.click('#export-csv'); assert.equal(downloaded, true); assert.equal(revoked, true);
  assert.match(a.$('#export-status').textContent, /Exported 1 sessions/);
  assert.equal(a.w.zenith.sessionStore.getHistory().length, 1);
});
test('reference redesign: circuit car follows SVG geometry and live telemetry', async t => {
  const a = await app(t); a.change('#source', 'custom'); a.$('#custom-text').value = 'abcd';
  const path = a.$('#circuit-route');
  path.getTotalLength = () => 100;
  path.getPointAtLength = distance => ({ x: distance * 2, y: distance });
  await a.start(); a.key('a'); a.advance(1000);
  assert.match(a.$('#racer').getAttribute('transform'), /^translate\(50 25\) rotate\(/);
  assert.equal(a.$('#race-telemetry').textContent, 'YOU · 12.0 WPM');
  a.key('Backspace');
  assert.match(a.$('#racer').getAttribute('transform'), /^translate\(0 0\)/);
});
