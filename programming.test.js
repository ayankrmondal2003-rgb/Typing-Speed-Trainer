const test = require('node:test');
const assert = require('node:assert/strict');
const { TypingEngine } = require('./typing-engine');
const { SessionStore } = require('./session-analytics');
const snippets = require('./programming-snippets');

test('programming: snippet provider returns valid code for all 7 languages and 3 difficulties', () => {
  const languages = ['python', 'javascript', 'c', 'cpp', 'html', 'css', 'sql'];
  const difficulties = ['beginner', 'intermediate', 'advanced'];

  for (const lang of languages) {
    for (const diff of difficulties) {
      const snip = snippets.getSnippet(lang, diff, 0);
      assert.ok(snip, `Snippet exists for ${lang} - ${diff}`);
      assert.equal(snip.language, lang);
      assert.equal(snip.difficulty, diff);
      assert.ok(typeof snip.code === 'string' && snip.code.length > 5);
      // Brackets, punctuation and code structure preserved
      assert.ok(snip.code.includes('\n') || snip.code.includes(';') || snip.code.includes('('));
    }
  }

  // Random language resolution
  const rand = snippets.getSnippet('random', 'intermediate', 42);
  assert.ok(languages.includes(rand.language));
});

test('programming: TypingEngine configures and handles code with Tab key and spaces', () => {
  const code = 'function add(a, b) {\n    return a + b;\n}';
  const engine = new TypingEngine({
    mode: 'programming',
    language: 'javascript',
    difficulty: 'medium',
    customText: code,
    duration: 60
  });

  const state = engine.getState();
  assert.equal(state.mode, 'programming');
  assert.equal(state.prompt, code);

  // Type function keyword
  for (const char of 'function add(a, b) {\n') {
    engine.handleKey(char);
  }

  // Next char is space for indentation
  assert.equal(engine.getState().prompt[engine.getState().position], ' ');
  // Test Tab key handling
  engine.handleKey('Tab');
  assert.ok(engine.getState().position > 21); // Advanced into indented line
});

test('programming: session analytics tracks programming bests separately from normal bests', () => {
  const store = new SessionStore({ storage: null });

  const progSession = {
    status: 'finished',
    sessionId: 'p1',
    date: new Date().toISOString(),
    mode: 'programming',
    difficulty: 'intermediate',
    duration: 60,
    elapsed: 60,
    finishReason: 'completed',
    wpm: 62.0,
    accuracy: 96.0,
    mistakes: 2,
    perKey: [{ key: 'a', attempts: 5, errors: 2, errorRate: 0.4, incorrectKeys: [{ key: 's', count: 2 }] }],
    timeline: [{ t: 0, p: 0, w: 0 }, { t: 60, p: 1.0, w: 62.0 }]
  };

  store.saveSession(progSession);

  const progBests = store.getPersonalBests('programming');
  const normalBests = store.getPersonalBests('test');

  assert.equal(progBests[60], 62.0);
  assert.equal(normalBests[60], 0); // Normal best unaffected!
});
