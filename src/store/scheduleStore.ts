import { create } from 'zustand';
import { AppState } from 'react-native';
import * as Y from 'yjs';
import * as Crypto from 'expo-crypto';
import { openDatabaseAsync, type ScheduleDatabase } from '../db/openDatabase';
import { AppEvent, Caregiver, ChecklistItem, Child, EventField, Pronoun } from '../types';
import { emitLocalClaim, emitLocalUpdate } from '../sync/bridge';
import { loadSyncEngine } from '../sync/loadSync';
import { emitClaimAttempt, emitScheduleObserved } from '../notifications/bridge';
import { clampLead } from '../notifications/planReminders';
import { closestKidPalette, kidLook } from '../theme';

interface ScheduleState {
  ready: boolean;
  loadError: string;
  events: AppEvent[];
  caregivers: Caregiver[];
  children: Child[];
  deviceCaregiverId: string;
  demoEventIds: string[];
  paired: boolean;
  syncStatus: 'synced' | 'syncing' | 'offline';
  syncWaiting: number;
  syncError: string;
  unsyncedClaimIds: string[];
  reminderLeads: [number, number];
  ydoc: Y.Doc;
  hydrate: () => Promise<void>;
  retryHydrate: () => Promise<void>;
  addCaregiver: (name: string, color: string) => string;
  addChild: (name: string, color: string, extra?: { palette?: string; canDrive?: boolean; pronouns?: Pronoun }) => string;
  setDeviceCaregiver: (caregiverId: string) => Promise<void>;
  addEvent: (input: NewEvent) => string;
  updateEventField: (id: string, field: EventField, value: string | boolean | string[] | ChecklistItem[]) => void;
  updateEventFields: (id: string, patch: EventPatch) => void;
  claimEvent: (id: string) => void;
  unclaimEvent: (id: string) => void;
  deleteEvent: (id: string) => void;
  loadDemoData: () => void;
  setReminderLeads: (first: number, second: number) => void;
}

type NewEvent = {
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
  childIds?: string[];
  caregiverId?: string;
  backupCaregiverId?: string;
  notes?: string;
  icon?: string;
  scanId?: string;
  calendarEventId?: string;
  timeTbd?: boolean;
  cancelled?: boolean;
  coverRequestedBy?: string;
  checklist?: ChecklistItem[];
  noRide?: boolean;
};

type EventPatch = Partial<{
  title: string;
  startTime: string;
  endTime: string;
  location: string;
  childIds: string[];
  caregiverId: string;
  backupCaregiverId: string;
  notes: string;
  icon: string;
  scanId: string;
  calendarEventId: string;
  deleted: boolean;
  timeTbd: boolean;
  cancelled: boolean;
  coverRequestedBy: string;
  checklist: ChecklistItem[];
  noRide: boolean;
}>;

const ydocHolder: { current: Y.Doc } = { current: new Y.Doc() };

function ydoc() {
  return ydocHolder.current;
}
const SAVE_DELAY_MS = 500;

let persistenceEnabled = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let hydratePromise: Promise<void> | null = null;
let databasePromise: Promise<ScheduleDatabase> | null = null;
let database: ScheduleDatabase | null = null;
let loadGeneration = 0;

function getDatabase() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await openDatabaseAsync('our-family-schedule.db');
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS local_state (
          id INTEGER PRIMARY KEY NOT NULL,
          ydoc BLOB NOT NULL,
          device_caregiver_id TEXT NOT NULL,
          demo_event_ids TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sync_state (
          id INTEGER PRIMARY KEY NOT NULL,
          last_seq INTEGER NOT NULL,
          pending_claims TEXT NOT NULL,
          last_snapshot_at INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS outbox (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ciphertext TEXT NOT NULL,
          iv TEXT NOT NULL,
          tag TEXT NOT NULL,
          snapshot_seq INTEGER
        );
        CREATE TABLE IF NOT EXISTS inbound_parts (
          group_id TEXT NOT NULL,
          part_index INTEGER NOT NULL,
          part_count INTEGER NOT NULL,
          payload BLOB NOT NULL,
          received_at INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (group_id, part_index)
        );
        CREATE TABLE IF NOT EXISTS device_meta (
          id INTEGER PRIMARY KEY NOT NULL,
          install_id TEXT NOT NULL,
          notifications_asked INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS reminder_settings (
          id INTEGER PRIMARY KEY NOT NULL,
          first_minutes INTEGER NOT NULL,
          second_minutes INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notice_state (
          id INTEGER PRIMARY KEY NOT NULL,
          claims TEXT NOT NULL
        );
      `);
      await addColumn(db, 'ALTER TABLE sync_state ADD COLUMN last_snapshot_at INTEGER NOT NULL DEFAULT 0');
      await addColumn(db, 'ALTER TABLE outbox ADD COLUMN snapshot_seq INTEGER');
      await addColumn(db, 'ALTER TABLE inbound_parts ADD COLUMN received_at INTEGER NOT NULL DEFAULT 0');
      await addColumn(db, 'ALTER TABLE device_meta ADD COLUMN notifications_asked INTEGER NOT NULL DEFAULT 0');
      return db;
    })();
  }
  return databasePromise;
}

export function getScheduleDatabase() {
  return getDatabase();
}

async function addColumn(db: ScheduleDatabase, sql: string) {
  try {
    await db.execAsync(sql);
  } catch {
    // The column is already there on databases created with the new schema.
  }
}

export function applyRemoteUpdate(update: Uint8Array) {
  Y.applyUpdate(ydoc(), update, 'remote');
}

export function encodeSnapshot(): Uint8Array {
  return Y.encodeStateAsUpdate(ydoc());
}

export function eraseLocalFamily() {
  const previous = ydoc();
  previous.off('update', onDocUpdate);
  const next = new Y.Doc();
  next.on('update', onDocUpdate);
  ydocHolder.current = next;
  previous.destroy();
  useScheduleStore.setState({
    ydoc: next,
    events: [],
    caregivers: [],
    children: [],
    deviceCaregiverId: '',
    demoEventIds: [],
    unsyncedClaimIds: [],
  });
  if (database) {
    database.runSync('DELETE FROM outbox');
    database.runSync(`UPDATE sync_state SET last_seq = 0, pending_claims = '[]', last_snapshot_at = 0 WHERE id = 1`);
  }
  persistNow();
}

function asUpdate(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value) && value.every((item) => typeof item === 'number')) return Uint8Array.from(value);
  return null;
}

function parseIdList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed;
  } catch {
    return [];
  }
  return [];
}

function persistNow() {
  if (!persistenceEnabled || !database) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const update = Y.encodeStateAsUpdate(ydoc());
  const { deviceCaregiverId, demoEventIds } = useScheduleStore.getState();
  database.runSync(
    `INSERT OR REPLACE INTO local_state (id, ydoc, device_caregiver_id, demo_event_ids)
     VALUES (1, ?, ?, ?)`,
    update,
    deviceCaregiverId,
    JSON.stringify(demoEventIds),
  );
}

function schedulePersist() {
  if (!persistenceEnabled || !database) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistNow();
  }, SAVE_DELAY_MS);
}

async function loadPersistedState() {
  const generation = ++loadGeneration;
  try {
    const db = await getDatabase();
    if (generation !== loadGeneration) return;
    database = db;
    const row = await db.getFirstAsync<{
      ydoc: unknown;
      device_caregiver_id: string;
      demo_event_ids: string;
    }>('SELECT ydoc, device_caregiver_id, demo_event_ids FROM local_state WHERE id = 1');
    if (generation !== loadGeneration) return;
    if (row) {
      const update = asUpdate(row.ydoc);
      if (!update) throw new Error('Saved calendar could not be read');
      if (update.byteLength > 0) Y.applyUpdate(ydoc(), update, 'load');
    }
    if (generation !== loadGeneration) return;
    persistenceEnabled = true;
    const sync = loadSyncEngine();
    if (generation !== loadGeneration) return;
    if (sync) await sync.prepareSync();
    const reminderRow = await db.getFirstAsync<{ first_minutes: number; second_minutes: number }>(
      'SELECT first_minutes, second_minutes FROM reminder_settings WHERE id = 1',
    );
    useScheduleStore.setState({
      ready: true,
      loadError: '',
      deviceCaregiverId: row?.device_caregiver_id ?? '',
      demoEventIds: parseIdList(row?.demo_event_ids),
      events: readEvents(),
      caregivers: readCaregivers(),
      children: readChildren(),
      reminderLeads: reminderRow
        ? [clampLead(reminderRow.first_minutes), clampLead(reminderRow.second_minutes)]
        : [120, 15],
    });
  } catch (error) {
    if (generation !== loadGeneration) return;
    console.error(error);
    persistenceEnabled = false;
    databasePromise = null;
    database = null;
    hydratePromise = null;
    useScheduleStore.setState({
      ready: false,
      loadError: "Couldn't open the saved calendar.",
    });
  }
}

function eventsMap() {
  return ydoc().getMap('events');
}
function caregiversMap() {
  return ydoc().getMap('caregivers');
}
function childrenMap() {
  return ydoc().getMap('children');
}

export function toOffsetISO(date: Date): string {
  const pad = (value: number) => String(Math.abs(value)).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}

function readCaregivers(): Caregiver[] {
  const rows: Caregiver[] = [];
  caregiversMap().forEach((value, id) => {
    const map = value as Y.Map<string>;
    rows.push({ id, name: map.get('name') ?? '', color: map.get('color') ?? '#666666' });
  });
  if (rows.length === 2) {
    const first = rows[0].name.trim().toLowerCase();
    const second = rows[1].name.trim().toLowerCase();
    if (first === 'dad' && second === 'mom') return [rows[1], rows[0]];
  }
  return rows;
}

function readPronoun(value: string | undefined): Pronoun {
  if (value === 'himself' || value === 'herself') return value;
  return 'themselves';
}

function readChildren(): Child[] {
  const rows: Child[] = [];
  childrenMap().forEach((value, id) => {
    const map = value as Y.Map<string>;
    const look = kidLook({ palette: map.get('palette') ?? '', color: map.get('color') ?? '' });
    rows.push({
      id,
      name: map.get('name') ?? '',
      color: look.solid,
      palette: look.name,
      canDrive: map.get('canDrive') === '1',
      pronouns: readPronoun(map.get('pronouns')),
    });
  });
  return rows;
}

function readEvents(): AppEvent[] {
  const rows: AppEvent[] = [];
  eventsMap().forEach((value, id) => {
    const map = value as Y.Map<unknown>;
    if (map.get('deleted') === true) return;
    rows.push({
      id,
      title: String(map.get('title') ?? ''),
      startTime: String(map.get('startTime') ?? ''),
      endTime: String(map.get('endTime') ?? ''),
      location: String(map.get('location') ?? ''),
      childIds: readChildIds(map),
      caregiverId: String(map.get('caregiverId') ?? ''),
      backupCaregiverId: String(map.get('backupCaregiverId') ?? ''),
      notes: String(map.get('notes') ?? ''),
      icon: String(map.get('icon') ?? ''),
      scanId: String(map.get('scanId') ?? ''),
      calendarEventId: String(map.get('calendarEventId') ?? ''),
      deleted: false,
      lastEditedBy: String(map.get('lastEditedBy') ?? ''),
      lastEditedAt: String(map.get('lastEditedAt') ?? ''),
      timeTbd: map.get('timeTbd') === true,
      cancelled: map.get('cancelled') === true,
      coverRequestedBy: typeof map.get('coverRequestedBy') === 'string' ? String(map.get('coverRequestedBy')) : '',
      checklist: readChecklist(map),
      noRide: map.get('noRide') === true,
    });
  });
  return rows.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
}

function publish() {
  useScheduleStore.setState({
    events: readEvents(),
    caregivers: readCaregivers(),
    children: readChildren(),
  });
}

function stamp(map: Y.Map<unknown>) {
  map.set('lastEditedBy', useScheduleStore.getState().deviceCaregiverId);
  map.set('lastEditedAt', toOffsetISO(new Date()));
}

function writeChildIds(map: Y.Map<unknown>, ids: string[]) {
  map.set('childIds', ids.filter((id) => typeof id === 'string'));
}

function readChildIds(map: Y.Map<unknown>): string[] {
  const plain = map.get('childIds');
  if (Array.isArray(plain)) return plain.filter((id): id is string => typeof id === 'string');
  const legacy = map.get('children');
  if (legacy instanceof Y.Array) {
    return (legacy.toArray() as unknown[]).filter((id): id is string => typeof id === 'string');
  }
  return [];
}

function readChecklist(map: Y.Map<unknown>): ChecklistItem[] {
  const plain = map.get('checklist');
  if (!Array.isArray(plain)) return [];
  const items: ChecklistItem[] = [];
  for (const item of plain) {
    if (!item || typeof item !== 'object') continue;
    const record = item as { id?: unknown; text?: unknown; done?: unknown };
    if (typeof record.id !== 'string' || typeof record.text !== 'string') continue;
    items.push({ id: record.id, text: record.text, done: record.done === true });
  }
  return items;
}

function writeChecklist(map: Y.Map<unknown>, items: ChecklistItem[]) {
  map.set('checklist', items.filter((item) => item && typeof item.id === 'string' && typeof item.text === 'string').map((item) => ({
    id: item.id,
    text: item.text,
    done: item.done === true,
  })));
}

function writeEvent(input: NewEvent & { id: string }) {
  const map = new Y.Map<unknown>();
  map.set('title', input.title);
  map.set('startTime', input.startTime);
  map.set('endTime', input.endTime);
  map.set('location', input.location ?? '');
  map.set('caregiverId', input.caregiverId ?? '');
  map.set('backupCaregiverId', input.backupCaregiverId ?? '');
  map.set('notes', input.notes ?? '');
  map.set('icon', input.icon ?? '');
  map.set('scanId', input.scanId ?? '');
  map.set('calendarEventId', input.calendarEventId ?? '');
  map.set('deleted', false);
  map.set('timeTbd', input.timeTbd === true);
  map.set('cancelled', input.cancelled === true);
  map.set('coverRequestedBy', input.coverRequestedBy ?? '');
  map.set('noRide', input.noRide === true);
  writeChildIds(map, input.childIds ?? []);
  writeChecklist(map, input.checklist ?? []);
  stamp(map);
  eventsMap().set(input.id, map);
}

function onDocUpdate(update: Uint8Array, origin: unknown) {
  publish();
  emitScheduleObserved(origin);
  if (origin !== 'load') schedulePersist();
  if (origin !== 'load' && origin !== 'remote') emitLocalUpdate(update);
}

ydoc().on('update', onDocUpdate);

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  ready: false,
  loadError: '',
  events: [],
  caregivers: [],
  children: [],
  deviceCaregiverId: '',
  demoEventIds: [],
  paired: false,
  syncStatus: 'synced',
  syncWaiting: 0,
  syncError: '',
  unsyncedClaimIds: [],
  reminderLeads: [120, 15],
  ydoc: ydoc(),
  hydrate: () => {
    if (!hydratePromise) hydratePromise = loadPersistedState();
    return hydratePromise;
  },
  retryHydrate: () => {
    loadGeneration += 1;
    hydratePromise = null;
    databasePromise = null;
    database = null;
    persistenceEnabled = false;
    set({ ready: false, loadError: '' });
    return get().hydrate();
  },
  addCaregiver: (name, color) => {
    const id = Crypto.randomUUID();
    ydoc().transact(() => {
      const map = new Y.Map<string>();
      map.set('name', name.trim());
      map.set('color', color);
      caregiversMap().set(id, map);
    });
    return id;
  },
  addChild: (name, color, extra) => {
    const id = Crypto.randomUUID();
    const look = kidLook({ palette: extra?.palette, color: extra?.palette ? '' : color });
    const stored = extra?.palette ? look : closestKidPalette(color);
    ydoc().transact(() => {
      const map = new Y.Map<string>();
      map.set('name', name.trim());
      map.set('color', stored.solid);
      map.set('palette', stored.name);
      map.set('canDrive', extra?.canDrive ? '1' : '0');
      map.set('pronouns', extra?.pronouns === 'himself' || extra?.pronouns === 'herself' ? extra.pronouns : 'themselves');
      childrenMap().set(id, map);
    });
    return id;
  },
  setDeviceCaregiver: async (caregiverId) => {
    set({ deviceCaregiverId: caregiverId });
    persistNow();
  },
  addEvent: (input) => {
    const id = Crypto.randomUUID();
    ydoc().transact(() => {
      writeEvent({ ...input, id });
    });
    set({ demoEventIds: get().demoEventIds.filter((demoId) => demoId !== id) });
    return id;
  },
  updateEventFields: (id, patch) => {
    const map = eventsMap().get(id) as Y.Map<unknown> | undefined;
    if (!map) return;
    const fields = (Object.keys(patch) as (keyof EventPatch)[]).filter((field) => patch[field] !== undefined);
    if (fields.length === 0) return;
    const caregiverChanged = patch.caregiverId !== undefined && String(map.get('caregiverId') ?? '') !== patch.caregiverId;
    ydoc().transact(() => {
      for (const field of fields) {
        const value = patch[field];
        if (value === undefined) continue;
        if (field === 'childIds' && Array.isArray(value)) writeChildIds(map, value as string[]);
        else if (field === 'checklist' && Array.isArray(value)) writeChecklist(map, value as ChecklistItem[]);
        else map.set(field, value);
      }
      stamp(map);
    });
    if (caregiverChanged) emitLocalClaim(id);
  },
  updateEventField: (id, field, value) => {
    get().updateEventFields(id, { [field]: value } as EventPatch);
  },
  claimEvent: (id) => {
    const caregiverId = get().deviceCaregiverId;
    if (!caregiverId) return;
    const offline = get().paired && (get().syncStatus === 'offline' || get().syncWaiting > 0);
    emitClaimAttempt(id, offline);
    const map = eventsMap().get(id) as Y.Map<unknown> | undefined;
    if (map?.get('noRide') === true) get().updateEventFields(id, { caregiverId, noRide: false });
    else get().updateEventField(id, 'caregiverId', caregiverId);
  },
  unclaimEvent: (id) => {
    get().updateEventField(id, 'caregiverId', '');
  },
  deleteEvent: (id) => {
    get().updateEventField(id, 'deleted', true);
    set({ demoEventIds: get().demoEventIds.filter((demoId) => demoId !== id) });
  },
  setReminderLeads: (first, second) => {
    const reminderLeads: [number, number] = [clampLead(first), clampLead(second)];
    set({ reminderLeads });
    if (!database) return;
    database.runSync(
      'INSERT OR REPLACE INTO reminder_settings (id, first_minutes, second_minutes) VALUES (1, ?, ?)',
      reminderLeads[0],
      reminderLeads[1],
    );
  },
  loadDemoData: () => {
    const { caregivers, children, deviceCaregiverId } = get();
    if (caregivers.length === 0) return;
    const primary = caregivers.find((person) => person.id === deviceCaregiverId) ?? caregivers[0];
    const other = caregivers.find((person) => person.id !== primary.id);
    const childIds = children.map((child) => child.id);
    const now = new Date();
    const samples = [
      { title: 'Soccer practice', icon: '⚽', hours: 24, caregiverId: primary.id, backupCaregiverId: other?.id ?? '' },
      { title: 'Piano lesson', icon: '🎹', hours: 48, caregiverId: other?.id ?? '', backupCaregiverId: primary.id },
      { title: 'Checkup', icon: '🩺', hours: 72, caregiverId: '', backupCaregiverId: primary.id },
    ];
    const demoEventIds: string[] = [];
    ydoc().transact(() => {
      for (const sample of samples) {
        const id = Crypto.randomUUID();
        demoEventIds.push(id);
        const start = new Date(now.getTime() + sample.hours * 60 * 60 * 1000);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        writeEvent({
          id,
          title: sample.title,
          startTime: toOffsetISO(start),
          endTime: toOffsetISO(end),
          location: '',
          childIds,
          caregiverId: sample.caregiverId,
          backupCaregiverId: sample.backupCaregiverId,
          notes: '',
          icon: sample.icon,
          scanId: '',
          calendarEventId: '',
        });
      }
    });
    set({ demoEventIds: [...get().demoEventIds, ...demoEventIds] });
  },
}));

AppState.addEventListener('change', (next) => {
  if (next === 'background' || next === 'inactive') persistNow();
});

void useScheduleStore.getState().hydrate();
