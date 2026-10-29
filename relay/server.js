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
const NEW_ROOMS_PER_HOUR = 10;
const HOUR = 60 * 60 * 1000;
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const configuredInterval = Number(process.env.PUSH_INTERVAL_MS);
const PUSH_INTERVAL = Number.isFinite(configuredInterval) && configuredInterval >= 1000
  ? configuredInterval
  : 5 * 60 * 1000;
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
  CREATE TABLE IF NOT EXISTS room_creates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS push_devices (
    room_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    push_token TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    last_push_at INTEGER NOT NULL DEFAULT 0,
    next_push_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (room_id, device_id)
  );
`);
try {
  db.exec('ALTER TABLE push_devices ADD COLUMN last_push_at INTEGER NOT NULL DEFAULT 0');
} catch {
  // Existing databases already have the column.
}
try {
  db.exec('ALTER TABLE push_devices ADD COLUMN next_push_at INTEGER NOT NULL DEFAULT 0');
} catch {
  // Existing databases already have the column.
}

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

function authorize(roomId, token, ip) {
  if (!/^[A-Za-z0-9-]{8,80}$/.test(roomId || '')) return 'bad';
  if (typeof token !== 'string' || token.length < 16 || token.length > 128) return 'bad';
  const existing = db.prepare('SELECT token FROM rooms WHERE id = ?').get(roomId);
  if (!existing) {
    if (tooManyRooms(ip || 'unknown')) return 'limited';
    db.prepare('INSERT INTO rooms (id, token, created_at, next_seq) VALUES (?, ?, ?, 0)').run(roomId, token, Date.now());
    return 'ok';
  }
  return tokensMatch(existing.token, token) ? 'ok' : 'bad';
}

function tooManyRooms(ip) {
  const since = Date.now() - HOUR;
  db.prepare('DELETE FROM room_creates WHERE created_at < ?').run(since);
  const row = db.prepare('SELECT COUNT(*) AS n FROM room_creates WHERE ip = ? AND created_at >= ?').get(ip, since);
  if (row.n >= NEW_ROOMS_PER_HOUR) return true;
  db.prepare('INSERT INTO room_creates (ip, created_at) VALUES (?, ?)').run(ip, Date.now());
  return false;
}

function forwardedIp(value) {
  if (process.env.TRUST_PROXY !== '1') return '';
  const header = Array.isArray(value) ? value[value.length - 1] : value;
  if (typeof header !== 'string') return '';
  const parts = header.split(',');
  const last = parts[parts.length - 1].trim();
  if (!last || last.length > 80) return '';
  return last;
}

function clientIp(req) {
  const address = forwardedIp(req.headers['x-forwarded-for']) || req.socket?.remoteAddress || req.ip || 'unknown';
  return String(address).slice(0, 80);
}

function socketIp(socket) {
  const address = forwardedIp(socket.handshake?.headers?.['x-forwarded-for']) || socket.handshake?.address || 'unknown';
  return String(address).slice(0, 80);
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
  db.prepare('DELETE FROM push_devices WHERE updated_at < ?').run(cutoff);
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
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Device-Id');
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

app.post('/rooms/:roomId/devices', (req, res) => {
  const roomId = req.params.roomId;
  const token = bearer(req.headers.authorization);
  const access = authorize(roomId, token, clientIp(req));
  if (access === 'limited') {
    res.status(429).json({ error: 'limited' });
    return;
  }
  if (access !== 'ok') {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  if (limited(roomId)) {
    res.status(429).json({ error: 'limited' });
    return;
  }
  const { deviceId, pushToken } = req.body || {};
  if (typeof deviceId !== 'string' || !/^[A-Za-z0-9-]{8,80}$/.test(deviceId)) {
    res.status(400).json({ error: 'bad device' });
    return;
  }
  if (!isExpoToken(pushToken)) {
    res.status(400).json({ error: 'bad token' });
    return;
  }
  db.prepare(`
    INSERT INTO push_devices (room_id, device_id, push_token, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(room_id, device_id) DO UPDATE SET
      push_token = excluded.push_token,
      updated_at = excluded.updated_at
  `).run(roomId, deviceId, pushToken, Date.now());
  res.json({ ok: true });
});

app.post('/rooms/:roomId/messages', async (req, res) => {
  const roomId = req.params.roomId;
  const token = bearer(req.headers.authorization);
  const access = authorize(roomId, token, clientIp(req));
  if (access === 'limited') {
    res.status(429).json({ error: 'limited' });
    return;
  }
  if (access !== 'ok') {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  if (limited(roomId)) {
    res.status(429).json({ error: 'limited' });
    return;
  }
  const { ciphertext, iv, tag, snapshotSeq } = req.body || {};
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
  if (Number.isInteger(snapshotSeq) && snapshotSeq >= 0) {
    const covered = Math.min(snapshotSeq, seq - 1);
    db.prepare('DELETE FROM messages WHERE room_id = ? AND seq <= ?').run(roomId, covered);
  }
  io.to(roomId).emit('relay-message', { seq, ciphertext, iv, tag });
  const sender = typeof req.headers['x-device-id'] === 'string' ? req.headers['x-device-id'] : '';
  notifyOthers(roomId, sender);
  res.json({ seq });
});

app.get('/rooms/:roomId/messages', (req, res) => {
  const roomId = req.params.roomId;
  const token = bearer(req.headers.authorization);
  const access = authorize(roomId, token, clientIp(req));
  if (access === 'limited') {
    res.status(429).json({ error: 'limited' });
    return;
  }
  if (access !== 'ok') {
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

function isExpoToken(token) {
  return typeof token === 'string'
    && token.length <= 200
    && (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken['))
    && token.endsWith(']');
}

function silentPush(token) {
  return {
    to: token,
    _contentAvailable: true,
    priority: 'high',
    data: { kind: 'sync' },
  };
}

function sendPushes(messages) {
  if (messages.length === 0) return;
  void fetch(process.env.EXPO_PUSH_URL || 'https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(4000),
  }).then((response) => {
    if (!response.ok) console.error('Could not send a wake-up push');
  }).catch(() => {
    console.error('Could not send a wake-up push');
  });
}

function notifyOthers(roomId, sender) {
  const now = Date.now();
  const rows = db.prepare(
    'SELECT device_id, push_token, last_push_at, next_push_at FROM push_devices WHERE room_id = ?',
  ).all(roomId);
  const messages = [];
  const markSent = db.prepare(
    'UPDATE push_devices SET last_push_at = ?, next_push_at = 0 WHERE room_id = ? AND device_id = ?',
  );
  const markDue = db.prepare(
    'UPDATE push_devices SET next_push_at = ? WHERE room_id = ? AND device_id = ? AND next_push_at = 0',
  );
  for (const row of rows) {
    if (row.device_id === sender || !isExpoToken(row.push_token)) continue;
    if (now - (row.last_push_at || 0) < PUSH_INTERVAL) {
      if (!row.next_push_at) markDue.run((row.last_push_at || 0) + PUSH_INTERVAL, roomId, row.device_id);
      continue;
    }
    markSent.run(now, roomId, row.device_id);
    messages.push(silentPush(row.push_token));
  }
  sendPushes(messages);
}

function deliverDuePushes() {
  const now = Date.now();
  const rows = db.prepare(
    'SELECT room_id, device_id, push_token FROM push_devices WHERE next_push_at > 0 AND next_push_at <= ?',
  ).all(now);
  if (rows.length === 0) return;
  const mark = db.prepare(
    'UPDATE push_devices SET last_push_at = ?, next_push_at = 0 WHERE room_id = ? AND device_id = ? AND next_push_at > 0 AND next_push_at <= ?',
  );
  const messages = [];
  for (const row of rows) {
    const updated = mark.run(now, row.room_id, row.device_id, now);
    if (!updated.changes || !isExpoToken(row.push_token)) continue;
    messages.push(silentPush(row.push_token));
  }
  sendPushes(messages);
}

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
  const access = authorize(roomId, token, socketIp(socket));
  if (access === 'limited') {
    next(new Error('limited'));
    return;
  }
  if (access !== 'ok') {
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
setInterval(deliverDuePushes, 1000).unref();

server.listen(PORT, () => {
  console.log(`Relay listening on :${PORT}`);
});
