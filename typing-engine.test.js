const test = require('node:test');
const assert = require('node:assert/strict');
const { TypingEngine, PROMPTS, DURATIONS } = require('./typing-engine');
function setup(options = {}) {
  let time = 0;
  const engine = new TypingEngine({ ...options, now: () => time });
  return { engine, advance: milliseconds => { time += milliseconds; } };
}
for (const difficulty of Object.keys(PROMPTS)) {
  test(`${difficulty} prompt can be completed`, () => {
    const { engine, advance } = setup({ difficulty });
    assert.equal(engine.getState().prompt, PROMPTS[difficulty]);
    for (const key of PROMPTS[difficulty]) { advance(100); engine.handleKey(key); }
    const state = engine.getState();
    assert.equal(state.finishReason, 'completed');
    assert.equal(state.accuracy, 100);
    assert.equal(state.position, Array.from(PROMPTS[difficulty]).length);
  });
}
for (const duration of DURATIONS) {
  test(`${duration}s timer starts on first character and rejects deadline input`, () => {
    const { engine, advance } = setup({ duration });
    advance(9000);
    for (const key of ['Shift', 'ArrowLeft', 'Backspace']) engine.handleKey(key);
    engine.handleKey('a', { ctrlKey: true });
    engine.handleKey('a', { metaKey: true });
    engine.handleKey('a', { altKey: true });
    engine.handleKey('a', { isComposing: true });
    assert.equal(engine.getState().status, 'ready');
    assert.equal(engine.getState().remaining, duration);
    engine.handleKey('x');
    advance(duration * 1000 - 1);
    assert.equal(engine.getState().status, 'running');
    advance(1);
    const state = engine.handleKey('t');
    assert.equal(state.finishReason, 'timeout');
    assert.equal(state.totalKeystrokes, 1);
    assert.equal(state.elapsed, duration);
    assert.equal(state.remaining, 0);
    advance(10000);
    assert.deepEqual(engine.handleKey('Backspace'), state);
  });
}
test('custom text supports punctuation, Unicode code points and normalized newlines', () => {
  const { engine } = setup({ customText: 'A!\r\n\u{1F600}' });
  for (const key of ['A', '!', 'Enter', '\u{1F600}']) engine.handleKey(key);
  assert.equal(engine.getState().prompt, 'A!\n\u{1F600}');
  assert.equal(engine.getState().position, 4);
  assert.equal(engine.getState().accuracy, 100);
  assert.equal(engine.getState().finishReason, 'completed');
});
test('corrected mistakes remain in accuracy, while WPM counts retained correct characters', () => {
  const { engine, advance } = setup({ customText: 'abcdef', duration: 120 });
  engine.handleKey('x');
  assert.equal(engine.getState().characters[0].status, 'incorrect');
  engine.handleKey('Backspace');
  assert.equal(engine.getState().position, 0);
  for (const key of 'abcde') engine.handleKey(key);
  advance(30000);
  let state = engine.getState();
  assert.equal(state.wpm, 2);
  assert.equal(state.totalKeystrokes, 6);
  assert.equal(state.correctKeystrokes, 5);
  assert.equal(state.mistakes, 1);
  assert.equal(state.accuracy, 5 / 6 * 100);
  engine.handleKey('Backspace');
  state = engine.getState();
  assert.equal(state.correctCharacters, 4);
  assert.equal(state.wpm, 1.6);
  assert.equal(state.totalKeystrokes, 6);
});
test('completion includes wrong final characters and freezes results', () => {
  const { engine, advance } = setup({ customText: 'ab' });
  engine.handleKey('a');
  advance(1000);
  const completed = engine.handleKey('x');
  assert.equal(completed.finishReason, 'completed');
  assert.equal(completed.accuracy, 50);
  advance(100000);
  assert.deepEqual(engine.handleKey('Backspace'), completed);
  assert.deepEqual(engine.handleKey('b'), completed);
});
test('restart resets every counter and retains settings and prompt', () => {
  const { engine, advance } = setup({ difficulty: 'hard', duration: 30, customText: 'abc' });
  const initial = engine.getState();
  engine.handleKey('x');
  advance(30000);
  assert.equal(engine.getState().finishReason, 'timeout');
  assert.deepEqual(engine.restart(), initial);
  engine.handleKey('a');
  advance(1000);
  assert.equal(engine.getState().elapsed, 1);
  assert.deepEqual(engine.restart(), initial);
});
test('configuration validates atomically and can switch back from custom text', () => {
  const { engine } = setup({ customText: 'hello' });
  const initial = engine.getState();
  for (const options of [{ difficulty: 'invalid' }, { duration: 15 }, { customText: '' }, { customText: ' \n' }]) {
    assert.throws(() => engine.configure(options));
    assert.deepEqual(engine.getState(), initial);
  }
  engine.configure({ difficulty: 'medium', duration: 120, customText: null });
  assert.equal(engine.getState().prompt, PROMPTS.medium);
  assert.equal(engine.getState().remaining, 120);
});
test('zero elapsed stats are finite; snapshots cannot mutate engine buffers', () => {
  const { engine } = setup({ customText: 'abc' });
  assert.equal(engine.getState().accuracy, 0);
  engine.handleKey('a');
  const state = engine.getState();
  assert.equal(state.wpm, 0);
  state.characters[0].expected = 'z';
  assert.equal(engine.getState().characters[0].expected, 'a');
});
test('polling alone detects timeout when no further input arrives', () => {
  const { engine, advance } = setup({ duration: 30 });
  engine.handleKey('t');
  advance(35000);
  assert.equal(engine.getState().finishReason, 'timeout');
  assert.equal(engine.getState().elapsed, 30);
});
