const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(`${__dirname}/index.html`, 'utf8');
const sources = ['typing-engine.js', 'session-analytics.js', 'script.js'].map(file => fs.readFileSync(`${__dirname}/${file}`, 'utf8'));

async function createApp(t) {
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const w = dom.window;
  await new Promise(resolve => w.addEventListener('load', resolve));
  sources.forEach(source => w.eval(source));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const $ = selector => w.document.querySelector(selector);
  const settle = () => new Promise(resolve => setTimeout(resolve, 5));
  const navigate = async page => { w.location.hash = page; await settle(); };
  const click = async selector => { $(selector).click(); await settle(); };
  return { w, $, settle, navigate, click };
}

test('branding: title, brandmark, SVG circuit, and footer display Type e', async t => {
  const { w, $ } = await createApp(t);
  assert.match(w.document.title, /^Type e /);
  assert.equal($('.brand span:last-child').childNodes[0].textContent.trim(), 'Type e');
  assert.equal($('.brand-mark').textContent.trim(), 'e');
  assert.match($('.circuit text').textContent, /TYPE E MOTOR CIRCUIT/);
  assert.match($('footer span:first-child').textContent, /TYPE E /);
});

test('flow layout: single-page no-scroll container and grid structure exist in #typing', async t => {
  const { w, $, settle } = await createApp(t);
  $('#mode').value = 'test';
  $('#session-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  await settle();

  assert.equal($('#typing').hidden, false);
  assert.ok($('.flow-topbar'));
  assert.ok($('.flow-grid'));
  assert.ok($('.flow-col-typing'));
  assert.ok($('.flow-col-visuals'));
  assert.ok($('#racer'));
  assert.ok($('#racer-p2'));
  assert.ok($('#racer-p3'));
  assert.ok($('#racer-p4'));
});

test('multiplayer: create room, share ID, join room, and lobby state', async t => {
  const host = await createApp(t);
  await host.navigate('multiplayer');
  assert.equal(host.$('#multiplayer').hidden, false);

  host.$('#host-nickname').value = 'ApexRacer';
  await host.click('#btn-create-room');

  const roomId = host.$('#lobby-room-id').textContent;
  assert.match(roomId, /^TE-\d{4}$/);
  assert.equal(host.$('#mp-lobby').hidden, false);
  assert.equal(host.$('#lobby-count').textContent, '1');

  // Test join in a second client instance
  const guest = await createApp(t);
  await guest.navigate('multiplayer');
  guest.$('#join-nickname').value = 'TurboRacer';
  guest.$('#join-room-input').value = roomId;
  await guest.click('#btn-join-room');

  assert.equal(guest.$('#lobby-room-id').textContent, roomId);
  assert.equal(guest.$('#mp-lobby').hidden, false);
});
