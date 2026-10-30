const test = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const { server, rooms } = require('./server.cjs');

function connectClient(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function nextMessage(ws) {
  return new Promise((resolve) => {
    ws.once('message', (raw) => {
      resolve(JSON.parse(raw));
    });
  });
}

test('multiplayer websocket: lifecycle, room creation, joining, race start, and progress', async (t) => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  t.after(() => {
    server.close();
  });

  const client1 = await connectClient(port);
  t.after(() => client1.close());

  // 1. Create Room
  client1.send(JSON.stringify({ type: 'CREATE_ROOM', nickname: 'Alice', duration: 30, difficulty: 'easy' }));
  const createdMsg = await nextMessage(client1);
  assert.equal(createdMsg.type, 'ROOM_CREATED');
  assert.equal(typeof createdMsg.roomId, 'string');
  assert.equal(createdMsg.roomId.length, 6);
  assert.equal(createdMsg.player.name, 'Alice');
  assert.equal(createdMsg.player.isHost, true);

  const roomId = createdMsg.roomId;

  // 2. Join Room from second client
  const client2 = await connectClient(port);
  t.after(() => client2.close());

  client2.send(JSON.stringify({ type: 'JOIN_ROOM', roomId, nickname: 'Bob' }));
  const [joinedMsg2, broadcastTo1] = await Promise.all([
    nextMessage(client2),
    nextMessage(client1)
  ]);

  assert.equal(joinedMsg2.type, 'ROOM_JOINED');
  assert.equal(joinedMsg2.player.name, 'Bob');
  assert.equal(joinedMsg2.player.isHost, false);
  assert.equal(broadcastTo1.type, 'PLAYER_JOINED');
  assert.equal(broadcastTo1.player.name, 'Bob');

  // 3. Ready state
  client2.send(JSON.stringify({ type: 'PLAYER_READY', ready: true }));
  const [ready1, ready2] = await Promise.all([
    nextMessage(client1),
    nextMessage(client2)
  ]);
  assert.equal(ready1.type, 'PLAYER_READY_UPDATE');
  assert.equal(ready1.ready, true);
  assert.equal(ready2.type, 'PLAYER_READY_UPDATE');

  // 4. Host starts race
  client1.send(JSON.stringify({ type: 'START_RACE' }));
  const [start1, start2] = await Promise.all([
    nextMessage(client1),
    nextMessage(client2)
  ]);
  assert.equal(start1.type, 'RACE_START');
  assert.equal(start2.type, 'RACE_START');
  assert.ok(start1.prompt.length > 10);
  assert.ok(start1.startTime > Date.now());

  // 5. Progress updates
  client1.send(JSON.stringify({ type: 'PROGRESS', progress: 45, wpm: 72 }));
  const prog2 = await nextMessage(client2);
  assert.equal(prog2.type, 'PROGRESS_UPDATE');
  assert.equal(prog2.progress, 45);
  assert.equal(prog2.wpm, 72);

  // 6. Finish
  client1.send(JSON.stringify({ type: 'FINISH', wpm: 78, accuracy: 98 }));
  const finish1 = await nextMessage(client1);
  assert.equal(finish1.type, 'PLAYER_FINISHED');
  assert.equal(finish1.rank, 1);

  // 7. Test invalid room join
  const client3 = await connectClient(port);
  t.after(() => client3.close());
  client3.send(JSON.stringify({ type: 'JOIN_ROOM', roomId: 'NOPE99', nickname: 'Ghost' }));
  const errorMsg = await nextMessage(client3);
  assert.equal(errorMsg.type, 'ERROR');
  assert.match(errorMsg.message, /not found/i);
});

