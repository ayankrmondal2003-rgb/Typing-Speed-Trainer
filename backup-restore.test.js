const test = require('node:test');
const assert = require('node:assert/strict');
const { SessionStore } = require('./session-analytics');

test('backup-restore: exports JSON with history, personal bests, and ghosts', () => {
  const store = new SessionStore({ storage: null });

  const session = {
    status: 'finished',
    sessionId: 'session-bk-1',
    date: new Date().toISOString(),
    mode: 'test',
    difficulty: 'medium',
    duration: 60,
    elapsed: 60,
    finishReason: 'completed',
    wpm: 50.0,
    accuracy: 97.0,
    mistakes: 1,
    perKey: [{ key: 'h', attempts: 5, errors: 1, errorRate: 0.2, incorrectKeys: [{ key: 'j', count: 1 }] }],
    timeline: [{ t: 0, p: 0, w: 0 }, { t: 60, p: 1.0, w: 50.0 }]
  };

  store.saveSession(session);
  const jsonStr = store.exportJson();
  assert.ok(typeof jsonStr === 'string');

  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.history.length, 1);
  assert.equal(parsed.bests[60], 50.0);
  assert.ok(parsed.ghosts['ghost-normal-60']);
});

test('backup-restore: restores sessions, deduplicates IDs, and updates personal bests', () => {
  const store = new SessionStore({ storage: null });

  const sessionA = {
    sessionId: 'bk-a',
    date: new Date('2026-01-01T10:00:00Z').toISOString(),
    mode: 'test',
    difficulty: 'easy',
    duration: 30,
    elapsed: 30,
    finishReason: 'completed',
    wpm: 45.0,
    accuracy: 98.0,
    mistakes: 0,
    perKey: [],
    timeline: [{ t: 0, p: 0, w: 0 }, { t: 30, p: 1.0, w: 45.0 }]
  };

  const payload = JSON.stringify({
    version: 1,
    history: [sessionA],
    ghosts: {
      'ghost-normal-30': {
        duration: 30,
        mode: 'test',
        wpm: 45.0,
        accuracy: 98.0,
        timeline: [{ t: 0, p: 0, w: 0 }, { t: 30, p: 1.0, w: 45.0 }]
      }
    }
  });

  const imported = store.importJson(payload);
  assert.equal(imported, 1);
  assert.equal(store.getHistory().length, 1);
  assert.equal(store.getPersonalBests('test')[30], 45.0);
  assert.ok(store.getGhost(30, 'test'));

  // Re-importing duplicate payload does not duplicate history
  const duplicateImport = store.importJson(payload);
  assert.equal(duplicateImport, 0);
  assert.equal(store.getHistory().length, 1);
});

test('backup-restore: rejects invalid or corrupted backup payloads', () => {
  const store = new SessionStore({ storage: null });

  assert.throws(() => store.importJson(''), /non-empty JSON/);
  assert.throws(() => store.importJson('{ "invalid": true }'), /corrupted backup/);
  assert.throws(() => store.importJson('{ "version": 2, "history": [] }'), /corrupted backup/);
});
