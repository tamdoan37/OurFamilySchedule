const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3001);
const MAX_BODY = 400 * 1024;
const MAX_CIPHERTEXT = 350000;
const MAX_MESSAGES = 5000;
const PAGE = 200;
const RATE_LIMIT = 120;
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const allowedOrigins = (process.env.RELAY_CORS_ORIGINS || 'http://localhost:8081,http://localhost:19006')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'relay.sqlite'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    next_seq INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    room_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    ciphertext TEXT NOT NULL,
    iv TEXT NOT NULL,
    tag TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (room_id, seq)
  );
`);

const buckets = new Map();

function allowOrigin(origin) {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

function tokensMatch(stored, given) {
  if (typeof stored !== 'string' || typeof given !== 'string') return false;
  const left = Buffer.from(stored);
  const right = Buffer.from(given);
  if (left.length === 0 || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function authorize(roomId, token) {
  if (!/^[A-Za-z0-9-]{8,80}$/.test(roomId || '')) return false;
  if (typeof token !== 'string' || token.length < 16 || token.length > 128) return false;
  const existing = db.prepare('SELECT token FROM rooms WHERE id = ?').get(roomId);
  if (!existing) {
    db.prepare('INSERT INTO rooms (id, token, created_at, next_seq) VALUES (?, ?, ?, 0)').run(roomId, token, Date.now());
    return true;
  }
  return tokensMatch(existing.token, token);
}

function limited(roomId) {
  const now = Date.now();
  const bucket = buckets.get(roomId);
  if (!bucket || now >= bucket.reset) {
    buckets.set(roomId, { count: 1, reset: now + 60 * 1000 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT;
}

function bearer(header) {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return '';
  return header.slice(7);
}

function cleanup() {
  const cutoff = Date.now() - THIRTY_DAYS;
  db.prepare('DELETE FROM messages WHERE created_at < ?').run(cutoff);
  const rooms = db.prepare('SELECT id FROM rooms').all();
  for (const room of rooms) {
    const row = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE room_id = ?').get(room.id);
    if (row.n <= MAX_MESSAGES) continue;
    db.prepare(`
      DELETE FROM messages WHERE room_id = ? AND seq IN (
        SELECT seq FROM messages WHERE room_id = ? ORDER BY seq ASC LIMIT ?
      )
    `).run(room.id, room.id, row.n - MAX_MESSAGES);
  }
}

const app = express();
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (typeof origin === 'string') {
    res.status(403).json({ error: 'origin' });
    return;
  }
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});
app.use(express.json({ limit: MAX_BODY }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/rooms/:roomId/messages', (req, res) => {
  const roomId = req.params.roomId;
  const token = bearer(req.headers.authorization);
  if (!authorize(roomId, token)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  if (limited(roomId)) {
    res.status(429).json({ error: 'limited' });
    return;
  }
  const { ciphertext, iv, tag } = req.body || {};
  if (typeof ciphertext !== 'string' || typeof iv !== 'string' || typeof tag !== 'string') {
    res.status(400).json({ error: 'bad message' });
    return;
  }
  if (ciphertext.length > MAX_CIPHERTEXT || iv.length > 64 || tag.length > 64) {
    res.status(413).json({ error: 'too large' });
    return;
  }
  const seq = db.prepare('UPDATE rooms SET next_seq = next_seq + 1 WHERE id = ? RETURNING next_seq').get(roomId).next_seq;
  const createdAt = Date.now();
  db.prepare(
    'INSERT INTO messages (room_id, seq, ciphertext, iv, tag, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(roomId, seq, ciphertext, iv, tag, createdAt);
  io.to(roomId).emit('relay-message', { seq, ciphertext, iv, tag });
  res.json({ seq });
});

app.get('/rooms/:roomId/messages', (req, res) => {
  const roomId = req.params.roomId;
  const token = bearer(req.headers.authorization);
  if (!authorize(roomId, token)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  if (limited(roomId)) {
    res.status(429).json({ error: 'limited' });
    return;
  }
  const after = Number(req.query.after);
  const cursor = Number.isInteger(after) && after >= 0 ? after : 0;
  const messages = db.prepare(
    'SELECT seq, ciphertext, iv, tag FROM messages WHERE room_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?',
  ).all(roomId, cursor, PAGE);
  res.json({ messages });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (allowOrigin(origin)) callback(null, true);
      else callback(new Error('origin not allowed'));
    },
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: MAX_BODY,
});

io.use((socket, next) => {
  const { roomId, token } = socket.handshake.auth || {};
  if (!authorize(roomId, token)) {
    next(new Error('unauthorized'));
    return;
  }
  if (limited(roomId)) {
    next(new Error('limited'));
    return;
  }
  socket.data.roomId = roomId;
  next();
});

io.on('connection', (socket) => {
  socket.join(socket.data.roomId);
});

cleanup();
setInterval(cleanup, 60 * 60 * 1000).unref();

server.listen(PORT, () => {
  console.log(`Relay listening on :${PORT}`);
});
