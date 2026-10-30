const test = require('node:test');
const assert = require('node:assert/strict');
const { TypingEngine } = require('./typing-engine');
const { SessionStore } = require('./session-analytics');

test('ghost: timeline records timestamped progress during session', () => {
  let time = 1000;
  const engine = new TypingEngine({
    difficulty: 'easy',
    duration: 60,
    customText: 'hello world',
    now: () => time
  });

  assert.equal(engine.getState().timeline.length, 0);

  // First keystroke starts the timer
  engine.handleKey('h');
  const st1 = engine.getState();
  assert.ok(st1.timeline.length >= 1);
  assert.equal(st1.timeline[0].t, 0);

  time += 500;
  engine.handleKey('e');
  const st2 = engine.getState();
  assert.ok(st2.timeline.length >= 2);
  const lastSample = st2.timeline[st2.timeline.length - 1];
  assert.equal(lastSample.t, 0.5);
  assert.ok(lastSample.p > 0);
  assert.ok(lastSample.w >= 0);
});

test('ghost: stores separate best for 30, 60, 120s and only updates on genuine improvement', () => {
  const store = new SessionStore({ storage: null });

  // Record a 60s session with 40 WPM
  const session1 = {
    status: 'finished',
    sessionId: 's1',
    date: new Date().toISOString(),
    mode: 'test',
    difficulty: 'medium',
    duration: 60,
    elapsed: 60,
    finishReason: 'completed',
    wpm: 40.0,
    accuracy: 95.0,
    mistakes: 2,
    perKey: [{ key: 'a', attempts: 5, errors: 2, errorRate: 0.4, incorrectKeys: [{ key: 's', count: 2 }] }],
    timeline: [
      { t: 0, p: 0, w: 0 },
      { t: 30, p: 0.5, w: 40 },
      { t: 60, p: 1.0, w: 40 }
    ]
  };

  store.saveSession(session1);
  const ghost60 = store.getGhost(60, 'test');
  assert.ok(ghost60);
  assert.equal(ghost60.wpm, 40.0);
  assert.equal(ghost60.timeline.length, 3);
  assert.equal(store.getGhost(30, 'test'), null);

  // Slower session does NOT overwrite ghost
  const session2 = {
    status: 'finished',
    sessionId: 's2',
    date: new Date().toISOString(),
    mode: 'test',
    difficulty: 'medium',
    duration: 60,
    elapsed: 60,
    finishReason: 'completed',
    wpm: 35.0,
    accuracy: 98.0,
    mistakes: 1,
    perKey: [{ key: 'a', attempts: 5, errors: 1, errorRate: 0.2, incorrectKeys: [{ key: 's', count: 1 }] }],
    timeline: [
      { t: 0, p: 0, w: 0 },
      { t: 60, p: 1.0, w: 35 }
    ]
  };
  store.saveSession(session2);
  const ghostAfterSlower = store.getGhost(60, 'test');
  assert.equal(ghostAfterSlower.wpm, 40.0);

  // Faster session DOES update ghost
  const session3 = {
    status: 'finished',
    sessionId: 's3',
    date: new Date().toISOString(),
    mode: 'test',
    difficulty: 'medium',
    duration: 60,
    elapsed: 60,
    finishReason: 'completed',
    wpm: 55.0,
    accuracy: 100.0,
    mistakes: 0,
    perKey: [],
    timeline: [
      { t: 0, p: 0, w: 0 },
      { t: 60, p: 1.0, w: 55 }
    ]
  };
  store.saveSession(session3);
  const ghostAfterFaster = store.getGhost(60, 'test');
  assert.equal(ghostAfterFaster.wpm, 55.0);
});
