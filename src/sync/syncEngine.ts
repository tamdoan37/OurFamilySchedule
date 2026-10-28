import { AppState } from 'react-native';
import * as Crypto from 'expo-crypto';
import { io, Socket } from 'socket.io-client';
import { encryptDelta, decryptDelta } from '../utils/crypto';
import { applyRemoteUpdate, encodeSnapshot, getScheduleDatabase, useScheduleStore } from '../store/scheduleStore';
import { setLocalClaimHandler, setLocalUpdateHandler } from './bridge';
import {
  bytesToBase64,
  clearPairing,
  decodePairing,
  encodePairing,
  Pairing,
  readPairing,
  roomToken,
  writePairing,
} from './pairing';

type RelayMessage = { seq: number; ciphertext: string; iv: string; tag: string };
type Session = Pairing & { token: string };

const PAGE = 200;
const SNAPSHOT_GAP_MS = 2 * 60 * 1000;

let session: Session | null = null;
let socket: Socket | null = null;
let started = false;
let chain: Promise<void> = Promise.resolve();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let localCount = 0;
let lastSnapshotAt = 0;
const sentIvs = new Set<string>();

export async function prepareSync(): Promise<void> {
  const pairing = await readPairing();
  session = pairing ? { ...pairing, token: await roomToken(pairing.familyKey) } : null;
  const stored = await readSyncRow();
  useScheduleStore.setState({
    paired: session !== null,
    syncWaiting: stored.waiting,
    unsyncedClaimIds: stored.pendingClaims,
    syncStatus: session ? useScheduleStore.getState().syncStatus : 'synced',
  });
}

export function startSync() {
  if (started) return;
  started = true;
  setLocalUpdateHandler((update) => {
    void serial(() => enqueue(update));
  });
  setLocalClaimHandler((eventId) => {
    void rememberClaim(eventId);
  });
  AppState.addEventListener('change', (next) => {
    if (next === 'active') void serial(() => onForeground());
  });
  void serial(async () => {
    await prepareSync();
    await waitUntilReady();
    if (session) await connect();
  });
}

export async function createFamily(relayUrl: string): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const pairing: Pairing = {
    familyKey: bytesToBase64(bytes),
    roomId: Crypto.randomUUID(),
    relayUrl: relayUrl.replace(/\/+$/, ''),
  };
  await writePairing(pairing);
  session = { ...pairing, token: await roomToken(pairing.familyKey) };
  useScheduleStore.setState({ paired: true });
  await serial(() => connect());
  return encodePairing(pairing);
}

export async function joinFamily(raw: string): Promise<void> {
  const pairing = decodePairing(raw);
  if (!pairing) throw new Error('That code is not a family pairing.');
  await writePairing(pairing);
  session = { ...pairing, token: await roomToken(pairing.familyKey) };
  useScheduleStore.setState({ paired: true, syncStatus: 'syncing' });
  await serial(() => connect());
}

export async function leaveFamily(): Promise<void> {
  session = null;
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  sentIvs.clear();
  localCount = 0;
  await clearPairing();
  await serial(async () => {
    const db = await getScheduleDatabase();
    db.runSync('DELETE FROM outbox');
    db.runSync(`INSERT OR REPLACE INTO sync_state (id, last_seq, pending_claims) VALUES (1, 0, '[]')`);
    useScheduleStore.setState({
      paired: false,
      syncStatus: 'synced',
      syncWaiting: 0,
      unsyncedClaimIds: [],
    });
  });
}

export async function currentPairingCode(): Promise<string | null> {
  const pairing = await readPairing();
  return pairing ? encodePairing(pairing) : null;
}

async function onForeground() {
  if (!session) return;
  await catchUp();
  const waiting = await outboxCount();
  if (waiting > 0 || Date.now() - lastSnapshotAt > SNAPSHOT_GAP_MS) await queueSnapshot();
  await flush();
}

async function connect() {
  if (!session) return;
  socket?.removeAllListeners();
  socket?.disconnect();
  const current = session;
  setStatus('syncing');
  socket = io(current.relayUrl, {
    auth: { roomId: current.roomId, token: current.token },
    autoConnect: true,
    reconnection: true,
    transports: ['websocket', 'polling'],
  });
  socket.on('relay-message', (message: RelayMessage) => {
    void serial(() => receive(message));
  });
  socket.on('connect', () => {
    void serial(async () => {
      await catchUp();
      await flush();
    });
  });
  socket.on('disconnect', () => {
    if (session && useScheduleStore.getState().syncWaiting > 0) setStatus('offline');
  });
  socket.on('connect_error', () => {
    if (session) setStatus('offline');
    console.error('Could not reach the relay');
  });
  try {
    await catchUp();
    await queueSnapshot();
    await flush();
  } catch (error) {
    setStatus('offline');
    console.error(error instanceof Error ? error.message : 'Could not sync');
  }
}

async function receive(message: RelayMessage) {
  if (!session || !Number.isInteger(message.seq)) return;
  const cursor = await readCursor();
  if (message.seq <= cursor) return;
  if (message.seq > cursor + 1) {
    await catchUp();
    return;
  }
  await applyMessage(message);
  await writeCursor(message.seq);
}

async function catchUp() {
  if (!session) return;
  setStatus('syncing');
  try {
    for (let page = 0; page < 50; page += 1) {
      const cursor = await readCursor();
      const messages = await pull(cursor);
      if (messages.length === 0) break;
      let next = cursor;
      for (const message of messages) {
        if (message.seq <= next) continue;
        await applyMessage(message);
        next = message.seq;
        await writeCursor(next);
      }
      if (messages.length < PAGE) break;
    }
    if ((await outboxCount()) === 0) setStatus(socket?.connected ? 'synced' : 'offline');
  } catch (error) {
    setStatus('offline');
    console.error(error instanceof Error ? error.message : 'Could not catch up');
  }
}

async function applyMessage(message: RelayMessage) {
  if (!session || sentIvs.has(message.iv)) return;
  try {
    applyRemoteUpdate(decryptDelta(message, session.familyKey));
  } catch {
    console.error('Could not decrypt a relay message');
  }
}

async function enqueue(update: Uint8Array) {
  if (!session) return;
  localCount += 1;
  if (localCount >= 15) {
    localCount = 0;
    await queueSnapshot();
    return;
  }
  await insertEncrypted(update);
  scheduleFlush();
}

async function queueSnapshot() {
  if (!session) return;
  const db = await getScheduleDatabase();
  db.runSync('DELETE FROM outbox');
  await insertEncrypted(encodeSnapshot());
  lastSnapshotAt = Date.now();
  localCount = 0;
  scheduleFlush();
}

async function insertEncrypted(update: Uint8Array) {
  if (!session) return;
  const sealed = encryptDelta(update, session.familyKey);
  if (sealed.ciphertext.length > 350000) {
    console.error('A sync message was too large to send');
    return;
  }
  sentIvs.add(sealed.iv);
  const db = await getScheduleDatabase();
  db.runSync(
    'INSERT INTO outbox (ciphertext, iv, tag) VALUES (?, ?, ?)',
    sealed.ciphertext,
    sealed.iv,
    sealed.tag,
  );
  useScheduleStore.setState({ syncWaiting: await outboxCount() });
}

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void serial(() => flush());
  }, 400);
}

async function flush() {
  if (!session) return;
  setStatus('syncing');
  try {
    while (session) {
      const db = await getScheduleDatabase();
      const row = db.getFirstSync<{ id: number; ciphertext: string; iv: string; tag: string }>(
        'SELECT id, ciphertext, iv, tag FROM outbox ORDER BY id ASC LIMIT 1',
      );
      if (!row) break;
      await push(row);
      db.runSync('DELETE FROM outbox WHERE id = ?', row.id);
    }
    const waiting = await outboxCount();
    useScheduleStore.setState({
      syncWaiting: waiting,
      unsyncedClaimIds: waiting === 0 ? [] : useScheduleStore.getState().unsyncedClaimIds,
      syncStatus: waiting === 0 ? 'synced' : 'offline',
    });
    if (waiting === 0) {
      const db = await getScheduleDatabase();
      db.runSync(`UPDATE sync_state SET pending_claims = '[]' WHERE id = 1`);
    }
  } catch (error) {
    setStatus('offline');
    console.error(error instanceof Error ? error.message : 'Could not send sync');
  }
}

async function push(row: { ciphertext: string; iv: string; tag: string }) {
  if (!session) return;
  const response = await fetch(`${session.relayUrl}/rooms/${session.roomId}/messages`, {
    method: 'POST',
    redirect: 'error',
    headers: {
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ciphertext: row.ciphertext, iv: row.iv, tag: row.tag }),
  });
  if (!response.ok) throw new Error('The relay rejected a message');
}

async function pull(after: number): Promise<RelayMessage[]> {
  if (!session) return [];
  const response = await fetch(`${session.relayUrl}/rooms/${session.roomId}/messages?after=${after}`, {
    redirect: 'error',
    headers: { Authorization: `Bearer ${session.token}` },
  });
  if (!response.ok) throw new Error('The relay rejected catch-up');
  const body = await response.json() as { messages?: RelayMessage[] };
  return Array.isArray(body.messages) ? body.messages : [];
}

async function rememberClaim(eventId: string) {
  const current = useScheduleStore.getState().unsyncedClaimIds;
  if (current.includes(eventId)) return;
  const next = [...current, eventId];
  useScheduleStore.setState({ unsyncedClaimIds: next });
  const db = await getScheduleDatabase();
  await ensureSyncRow(db);
  db.runSync('UPDATE sync_state SET pending_claims = ? WHERE id = 1', JSON.stringify(next));
}

async function readSyncRow(): Promise<{ waiting: number; pendingClaims: string[] }> {
  const db = await getScheduleDatabase();
  await ensureSyncRow(db);
  const row = db.getFirstSync<{ pending_claims: string }>('SELECT pending_claims FROM sync_state WHERE id = 1');
  let pendingClaims: string[] = [];
  try {
    const parsed = JSON.parse(row?.pending_claims ?? '[]') as unknown;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) pendingClaims = parsed;
  } catch {
    pendingClaims = [];
  }
  return { waiting: await outboxCount(), pendingClaims };
}

async function readCursor(): Promise<number> {
  const db = await getScheduleDatabase();
  await ensureSyncRow(db);
  const row = db.getFirstSync<{ last_seq: number }>('SELECT last_seq FROM sync_state WHERE id = 1');
  return row?.last_seq ?? 0;
}

async function writeCursor(seq: number) {
  const db = await getScheduleDatabase();
  await ensureSyncRow(db);
  db.runSync('UPDATE sync_state SET last_seq = ? WHERE id = 1', seq);
}

async function outboxCount(): Promise<number> {
  const db = await getScheduleDatabase();
  const row = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox');
  return row?.n ?? 0;
}

async function ensureSyncRow(db: Awaited<ReturnType<typeof getScheduleDatabase>>) {
  db.runSync(`INSERT OR IGNORE INTO sync_state (id, last_seq, pending_claims) VALUES (1, 0, '[]')`);
}

function waitUntilReady() {
  if (useScheduleStore.getState().ready) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const unsubscribe = useScheduleStore.subscribe((state) => {
      if (!state.ready) return;
      unsubscribe();
      resolve();
    });
  });
}

function setStatus(syncStatus: 'synced' | 'syncing' | 'offline') {
  if (!useScheduleStore.getState().paired && syncStatus !== 'synced') return;
  useScheduleStore.setState({ syncStatus });
  void outboxCount().then((syncWaiting) => {
    if (useScheduleStore.getState().syncWaiting !== syncWaiting) useScheduleStore.setState({ syncWaiting });
  });
}

function serial(task: () => Promise<void>) {
  chain = chain.then(task, task);
  return chain;
}

startSync();

