const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(`${__dirname}/index.html`, 'utf8');
const sources = ['typing-engine.js', 'session-analytics.js', 'programming-snippets.js', 'script.js'].map(file => fs.readFileSync(`${__dirname}/${file}`, 'utf8'));

test('layouts: QWERTY, Dvorak, and Colemak render physical rows correctly', () => {
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  sources.forEach(src => w.eval(src));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));

  const $ = selector => w.document.querySelector(selector);
  const $$ = selector => [...w.document.querySelectorAll(selector)];

  // Navigate to stats view where stats-keyboard is rendered
  w.location.hash = '#stats';
  w.dispatchEvent(new w.HashChangeEvent('hashchange'));

  // Check default layout (QWERTY)
  const qwertyFirstRow = $$('#stats-keyboard .keyboard-row')[1];
  assert.ok(qwertyFirstRow);
  const qwertyKeys = [...qwertyFirstRow.querySelectorAll('.key')].map(k => k.textContent.trim());
  assert.equal(qwertyKeys[1], 'Q');
  assert.equal(qwertyKeys[2], 'W');
  assert.equal(qwertyKeys[3], 'E');

  // Change to Dvorak
  const layoutSelect = $('#settings-layout') || $('#racer-layout-select');
  assert.ok(layoutSelect);
  layoutSelect.value = 'dvorak';
  layoutSelect.dispatchEvent(new w.Event('change', { bubbles: true }));

  const dvorakHomeRow = $$('#stats-keyboard .keyboard-row')[2];
  const dvorakKeys = [...dvorakHomeRow.querySelectorAll('.key')].map(k => k.textContent.trim());
  assert.equal(dvorakKeys[1], 'A');
  assert.equal(dvorakKeys[2], 'O');
  assert.equal(dvorakKeys[3], 'E');
  assert.equal(dvorakKeys[4], 'U');
  assert.equal(dvorakKeys[5], 'I');

  // Change to Colemak
  layoutSelect.value = 'colemak';
  layoutSelect.dispatchEvent(new w.Event('change', { bubbles: true }));

  const colemakFirstRow = $$('#stats-keyboard .keyboard-row')[1];
  const colemakKeys = [...colemakFirstRow.querySelectorAll('.key')].map(k => k.textContent.trim());
  assert.equal(colemakKeys[1], 'Q');
  assert.equal(colemakKeys[2], 'W');
  assert.equal(colemakKeys[3], 'F');
  assert.equal(colemakKeys[4], 'P');
  assert.equal(colemakKeys[5], 'G');

  dom.window.close();
});
