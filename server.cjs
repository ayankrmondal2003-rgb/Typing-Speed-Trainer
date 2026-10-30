// Real-time Multiplayer WebSocket Server for Type!e
const http = require('node:http');
const { WebSocketServer, WebSocket } = require('ws');
const { PROMPTS } = require('./typing-engine');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), rooms: rooms.size }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Type!e Multiplayer WebSocket Server is running.');
});

const wss = new WebSocketServer({ server });
const rooms = new Map();

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(id) ? generateRoomId() : id;
}

function broadcastToRoom(room, message, excludeWs = null) {
  const payload = JSON.stringify(message);
  for (const player of room.players.values()) {
    if (player.ws !== excludeWs && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(payload);
    }
  }
}

function sanitizeString(str, max = 50) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, max);
}

wss.on('connection', (ws) => {
  let currentRoomId = null;
  let playerId = null;
  ws.isAlive = true;

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw); }
    catch { return ws.send(JSON.stringify({ type: 'ERROR', message: 'Malformed JSON payload.' })); }

    if (data.type === 'PING') {
      return ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
    }

    if (data.type === 'CREATE_ROOM') {
      const roomId = generateRoomId();
      currentRoomId = roomId;
      playerId = `player-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const nickname = sanitizeString(data.nickname, 15) || 'SpeedRacer';
      const duration = [30, 60, 120].includes(Number(data.duration)) ? Number(data.duration) : 60;
      const difficulty = ['easy', 'medium', 'hard'].includes(data.difficulty) ? data.difficulty : 'medium';
      const mode = ['test', 'programming'].includes(data.mode) ? data.mode : 'test';

      const player = {
        id: playerId,
        name: nickname,
        isHost: true,
        ready: false,
        carIndex: 0,
        progress: 0,
        wpm: 0,
        finished: false,
        rank: null,
        ws
      };

      const room = {
        id: roomId,
        hostId: playerId,
        duration,
        difficulty,
        mode,
        language: data.language || 'javascript',
        status: 'lobby',
        players: new Map([[playerId, player]]),
        createdAt: Date.now()
      };

      rooms.set(roomId, room);
      ws.send(JSON.stringify({
        type: 'ROOM_CREATED',
        roomId,
        player: { id: player.id, name: player.name, isHost: true, carIndex: 0 },
        settings: { duration, difficulty, mode, language: room.language }
      }));
      return;
    }

    if (data.type === 'JOIN_ROOM') {
      const reqRoomId = (sanitizeString(data.roomId, 10)).toUpperCase();
      const room = rooms.get(reqRoomId);
      if (!room) {
        return ws.send(JSON.stringify({ type: 'ERROR', message: 'Room not found or has expired.' }));
      }
      if (room.players.size >= 4) {
        return ws.send(JSON.stringify({ type: 'ERROR', message: 'Room is full (max 4 racers).' }));
      }
      if (room.status === 'racing') {
        return ws.send(JSON.stringify({ type: 'ERROR', message: 'Race is already in progress.' }));
      }

      currentRoomId = reqRoomId;
      playerId = `player-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const nickname = sanitizeString(data.nickname, 15) || `Racer #${room.players.size + 1}`;
      const carIndex = room.players.size;

      const player = {
        id: playerId,
        name: nickname,
        isHost: false,
        ready: false,
        carIndex,
        progress: 0,
        wpm: 0,
        finished: false,
        rank: null,
        ws
      };

      room.players.set(playerId, player);

      const playersList = Array.from(room.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        ready: p.ready,
        carIndex: p.carIndex
      }));

      ws.send(JSON.stringify({
        type: 'ROOM_JOINED',
        roomId: room.id,
        player: { id: player.id, name: player.name, isHost: false, carIndex },
        settings: { duration: room.duration, difficulty: room.difficulty, mode: room.mode, language: room.language },
        players: playersList
      }));

      broadcastToRoom(room, {
        type: 'PLAYER_JOINED',
        player: { id: player.id, name: player.name, isHost: false, ready: false, carIndex },
        players: playersList
      }, ws);
      return;
    }

    const room = rooms.get(currentRoomId);
    if (!room || !room.players.has(playerId)) return;
    const player = room.players.get(playerId);

    if (data.type === 'PLAYER_READY') {
      player.ready = Boolean(data.ready);
      broadcastToRoom(room, {
        type: 'PLAYER_READY_UPDATE',
        playerId,
        ready: player.ready,
        players: Array.from(room.players.values()).map(p => ({ id: p.id, name: p.name, ready: p.ready, isHost: p.isHost, carIndex: p.carIndex }))
      });
      return;
    }

    if (data.type === 'START_RACE') {
      if (!player.isHost) {
        return ws.send(JSON.stringify({ type: 'ERROR', message: 'Only the host can start the race.' }));
      }
      room.status = 'countdown';
      const promptText = (PROMPTS && PROMPTS[room.difficulty]) || 'Steady practice builds confidence. Keep your hands relaxed and focus on each word.';
      const startTime = Date.now() + 3000;

      for (const p of room.players.values()) {
        p.progress = 0;
        p.wpm = 0;
        p.finished = false;
        p.rank = null;
      }

      broadcastToRoom(room, {
        type: 'RACE_START',
        prompt: promptText,
        duration: room.duration,
        startTime,
        players: Array.from(room.players.values()).map(p => ({ id: p.id, name: p.name, carIndex: p.carIndex }))
      });

      setTimeout(() => {
        if (room.status === 'countdown') room.status = 'racing';
      }, 3000);
      return;
    }

    if (data.type === 'PROGRESS') {
      player.progress = Math.max(0, Math.min(100, Number(data.progress) || 0));
      player.wpm = Math.max(0, Number(data.wpm) || 0);

      broadcastToRoom(room, {
        type: 'PROGRESS_UPDATE',
        playerId,
        progress: player.progress,
        wpm: player.wpm,
        carIndex: player.carIndex
      }, ws);
      return;
    }

    if (data.type === 'FINISH') {
      if (!player.finished) {
        player.finished = true;
        player.progress = 100;
        player.wpm = Number(data.wpm) || player.wpm;
        player.accuracy = Number(data.accuracy) || 100;
        const finishedCount = Array.from(room.players.values()).filter(p => p.finished).length;
        player.rank = finishedCount;

        broadcastToRoom(room, {
          type: 'PLAYER_FINISHED',
          playerId,
          rank: player.rank,
          wpm: player.wpm,
          accuracy: player.accuracy,
          name: player.name
        });

        // Check if all players finished
        if (finishedCount === room.players.size) {
          room.status = 'finished';
          const standings = Array.from(room.players.values())
            .sort((a, b) => (a.rank || 99) - (b.rank || 99))
            .map(p => ({ id: p.id, name: p.name, rank: p.rank, wpm: p.wpm, accuracy: p.accuracy, carIndex: p.carIndex }));

          broadcastToRoom(room, {
            type: 'RACE_FINISHED',
            standings
          });
        }
      }
      return;
    }

    if (data.type === 'REMATCH') {
      room.status = 'lobby';
      for (const p of room.players.values()) {
        p.ready = false;
        p.finished = false;
        p.progress = 0;
        p.wpm = 0;
        p.rank = null;
      }
      broadcastToRoom(room, {
        type: 'REMATCH_ACCEPTED',
        players: Array.from(room.players.values()).map(p => ({ id: p.id, name: p.name, ready: false, isHost: p.isHost, carIndex: p.carIndex }))
      });
      return;
    }
  });

  ws.on('close', () => {
    if (currentRoomId && rooms.has(currentRoomId)) {
      const room = rooms.get(currentRoomId);
      room.players.delete(playerId);
      if (room.players.size === 0) {
        rooms.delete(currentRoomId);
      } else {
        // If host left, elect new host
        let hasHost = false;
        for (const p of room.players.values()) {
          if (p.isHost) { hasHost = true; break; }
        }
        if (!hasHost) {
          const first = room.players.values().next().value;
          if (first) { first.isHost = true; room.hostId = first.id; }
        }
        broadcastToRoom(room, {
          type: 'PLAYER_LEFT',
          playerId,
          players: Array.from(room.players.values()).map(p => ({ id: p.id, name: p.name, ready: p.ready, isHost: p.isHost, carIndex: p.carIndex }))
        });
      }
    }
  });
});

// Heartbeat sweep
const interval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
interval.unref();

wss.on('close', () => clearInterval(interval));

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Type!e WebSocket Server listening on ${HOST}:${PORT}`);
  });
}

module.exports = { server, wss, rooms };
