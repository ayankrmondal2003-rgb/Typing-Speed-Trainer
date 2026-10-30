const test = require('node:test');
const assert = require('node:assert/strict');
const { TypingEngine } = require('./typing-engine');
const { SessionStore, PracticeGenerator, keyAnalytics, weakestKeys, STORAGE_KEY } = require('./session-analytics');
function memory(initial = null) {
  return { value: initial, writes: 0, getItem() { return this.value; }, setItem(key, value) { assert.equal(key, STORAGE_KEY); this.value = value; this.writes++; } };
}
function fixture(options = {}) {
  let time = 0;
  const storage = options.storage ?? memory();
  const store = new SessionStore({ storage, ...options });
  const completed = [];
  const engine = new TypingEngine({ customText: 'ab', now: () => time,
    onComplete: state => { completed.push(state); store.saveSession(state); } });
  return { storage, store, engine, completed, advance(ms) { time += ms; },
    finish() { engine.handleKey('a'); time += 1000; engine.handleKey('b'); } };
}
test('expected-key errors retain incorrect typed keys after correction and Backspace', () => {
  const { engine } = fixture();
  engine.handleKey('x'); engine.handleKey('Backspace'); engine.handleKey('a'); engine.handleKey('Backspace'); engine.handleKey('y');
  const [a] = engine.getState().perKey;
  assert.deepEqual(a, { key: 'a', attempts: 3, errors: 2, errorRate: 2 / 3, incorrectKeys: [{ key: 'x', count: 1 }, { key: 'y', count: 1 }] });
  a.incorrectKeys[0].count = 50;
  assert.equal(engine.getState().perKey[0].incorrectKeys[0].count, 1);
  assert.deepEqual(engine.restart().perKey, []);
});
test('ranking excludes untested, insufficient and error-free keys; aggregation is weighted', () => {
  const row = (key, attempts, errors) => ({ key, attempts, errors, incorrectKeys: errors ? [{ key: '!', count: errors }] : [] });
  const rows = keyAnalytics([{ perKey: [row('a', 3, 1), row('b', 3, 2), row('c', 1, 1), row('d', 4, 0)] }, { perKey: [row('a', 3, 2)] }], ['z']);
  assert.deepEqual(weakestKeys(rows).map(row => row.key), ['b', 'a']);
  assert.equal(rows.find(row => row.key === 'a').errorRate, 0.5);
  assert.deepEqual(rows[0], { key: 'z', attempts: 0, errors: 0, errorRate: 0, tested: false, sufficient: false, incorrectKeys: [] });
  assert.throws(() => keyAnalytics([], [], 0));
});
test('completed session saves exactly once; reload and detached API snapshots work', () => {
  const f = fixture(); f.finish();
  for (let i = 0; i < 5; i++) { f.engine.getState(); f.engine.handleKey('a'); }
  assert.equal(f.store.saveSession(f.completed[0]), false);
  assert.equal(f.storage.writes, 1);
  const loaded = new SessionStore({ storage: f.storage });
  assert.deepEqual(loaded.getHistory(), f.store.getHistory());
  const history = loaded.getHistory(); history[0].perKey[0].attempts = 999;
  assert.equal(loaded.getHistory()[0].perKey[0].attempts, 1);
  assert.equal(loaded.getProgress()[0].timestamp, Date.parse(history[0].date));
  assert.equal(loaded.saveSession(f.completed[0]), false);
});
test('incomplete/restarted sessions never save; polling timeout saves only once', () => {
  const f = fixture();
  assert.equal(f.store.saveSession(f.engine.getState()), false);
  f.engine.handleKey('a'); f.engine.restart();
  assert.equal(f.store.getHistory().length, 0);
  f.engine.handleKey('x'); f.advance(60000); f.engine.getState(); f.engine.getState();
  assert.equal(f.store.getHistory().length, 1);
  assert.equal(f.store.getHistory()[0].finishReason, 'timeout');
  f.engine.restart(); f.finish();
  assert.equal(f.store.getHistory().length, 2);
});
test('history is bounded, chronological and filterable; all timer bests survive pruning and reload', () => {
  let date = 3000;
  const f = fixture({ limit: 2, now: () => new Date(date) });
  for (const duration of [30, 60, 120]) {
    f.engine.configure({ duration, customText: 'ab', difficulty: duration === 30 ? 'hard' : 'easy', mode: duration === 120 ? 'practice' : 'test' });
    f.finish(); date -= 1000;
  }
  const history = f.store.getHistory();
  assert.equal(history.length, 2);
  assert.deepEqual(history.map(row => row.duration), [60, 30]);
  assert.deepEqual(f.store.getPersonalBests(), { 30: 24, 60: 24, 120: 24 });
  assert.equal(f.store.getProgress({ difficulty: 'hard', mode: 'test', duration: 30 }).length, 1);
  const loaded = new SessionStore({ storage: f.storage, limit: 2 });
  assert.deepEqual(loaded.getPersonalBests(), f.store.getPersonalBests());
  f.engine.restart(); f.engine.handleKey('a'); f.advance(10000); f.engine.handleKey('b');
  assert.equal(f.store.getPersonalBests()[120], 24);
});
test('missing, corrupt and unavailable storage recover with in-memory results', () => {
  for (const initial of [null, '{bad', '{}', '{"version":99,"history":[]}', '{"version":1,"history":[null,{}]}']) {
    const f = fixture({ storage: memory(initial) });
    assert.deepEqual(f.store.getHistory(), []); f.finish();
    assert.equal(new SessionStore({ storage: f.storage }).getHistory().length, 1);
  }
  const f = fixture({ storage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } } });
  f.finish(); assert.equal(f.store.storageAvailable, false); assert.equal(f.store.getHistory().length, 1);
  const absent = new SessionStore({ storage: null });
  assert.equal(absent.storageAvailable, false);
});
test('load discards invalid records and deduplicates valid records', () => {
  const f = fixture(); f.finish();
  const data = JSON.parse(f.storage.value);
  data.history.push(data.history[0], { ...data.history[0], sessionId: 'bad', accuracy: 101 },
    { ...data.history[0], sessionId: 'bad-key', perKey: [{ key: 'a', attempts: 0, errors: 1, incorrectKeys: [] }] });
  data.bests = { 30: -1, 60: 'bad', 120: null };
  f.storage.value = JSON.stringify(data);
  assert.equal(new SessionStore({ storage: f.storage }).getHistory().length, 1);
});
test('drills are deterministic, varied, readable, and emphasize ranked weak keys', () => {
  const rows = [{ key: 'q', sufficient: true, attempts: 5, errors: 4, errorRate: 0.8 }];
  const generator = new PracticeGenerator();
  const first = generator.generate(rows);
  assert.equal(first.text, new PracticeGenerator().generate(rows).text);
  assert.notEqual(first.text, generator.generate(rows).text);
  assert.ok(first.text.split(' ').every(word => word.includes('q')));
  assert.deepEqual(first.targetKeys, ['q']); assert.equal(first.fallback, false);
  for (const key of ['!', '7', '\n', ' ', '\u{1F600}', 'Q']) {
    const special = [{ ...rows[0], key }];
    const a = generator.generate(special); const b = generator.generate(special);
    assert.ok(a.text.includes(key)); assert.notEqual(a.text, b.text);
  }
  const fallback = generator.generate([{ ...rows[0], sufficient: false }]);
  assert.equal(fallback.fallback, true); assert.ok(fallback.text.length > 20);
  assert.notEqual(fallback.text, generator.generate([]).text);
});
test('generated drills use existing engine and persist as practice sessions', () => {
  const f = fixture();
  const drill = new PracticeGenerator().generate(f.store.getKeyStats());
  f.engine.configure({ customText: drill.text, mode: 'practice' });
  for (const key of drill.text) { f.advance(10); f.engine.handleKey(key); }
  const record = f.store.getHistory()[0];
  assert.equal(record.mode, 'practice'); assert.equal(record.accuracy, 100);
  assert.ok(f.store.getKeyStats().length > 0);
  assert.deepEqual(f.store.getWeakestKeys(), []);
});
