import { create } from 'zustand';
import { AppState } from 'react-native';
import * as Y from 'yjs';
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { AppEvent, Caregiver, Child, EventField } from '../types';

interface ScheduleState {
  ready: boolean;
  loadError: string;
  events: AppEvent[];
  caregivers: Caregiver[];
  children: Child[];
  deviceCaregiverId: string;
  demoEventIds: string[];
  ydoc: Y.Doc;
  hydrate: () => Promise<void>;
  retryHydrate: () => Promise<void>;
  addCaregiver: (name: string, color: string) => string;
  addChild: (name: string, color: string) => string;
  setDeviceCaregiver: (caregiverId: string) => Promise<void>;
  addEvent: (input: NewEvent) => string;
  updateEventField: (id: string, field: EventField, value: string | boolean | string[]) => void;
  claimEvent: (id: string) => void;
  unclaimEvent: (id: string) => void;
  deleteEvent: (id: string) => void;
  loadDemoData: () => void;
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
};

const ydoc = new Y.Doc();
const SAVE_DELAY_MS = 500;

let persistenceEnabled = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let hydratePromise: Promise<void> | null = null;
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let database: SQLite.SQLiteDatabase | null = null;
let loadGeneration = 0;

function getDatabase() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await SQLite.openDatabaseAsync('our-family-schedule.db');
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS local_state (
          id INTEGER PRIMARY KEY NOT NULL,
          ydoc BLOB NOT NULL,
          device_caregiver_id TEXT NOT NULL,
          demo_event_ids TEXT NOT NULL
        );
      `);
      return db;
    })();
  }
  return databasePromise;
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
  const update = Y.encodeStateAsUpdate(ydoc);
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
      if (update.byteLength > 0) Y.applyUpdate(ydoc, update);
    }
    if (generation !== loadGeneration) return;
    persistenceEnabled = true;
    useScheduleStore.setState({
      ready: true,
      loadError: '',
      deviceCaregiverId: row?.device_caregiver_id ?? '',
      demoEventIds: parseIdList(row?.demo_event_ids),
      events: readEvents(),
      caregivers: readCaregivers(),
      children: readChildren(),
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
  return ydoc.getMap('events');
}
function caregiversMap() {
  return ydoc.getMap('caregivers');
}
function childrenMap() {
  return ydoc.getMap('children');
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
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

function readChildren(): Child[] {
  const rows: Child[] = [];
  childrenMap().forEach((value, id) => {
    const map = value as Y.Map<string>;
    rows.push({ id, name: map.get('name') ?? '', color: map.get('color') ?? '#666666' });
  });
  return rows.sort((a, b) => a.name.localeCompare(b.name));
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
  writeChildIds(map, input.childIds ?? []);
  stamp(map);
  eventsMap().set(input.id, map);
}

ydoc.on('update', () => {
  publish();
  schedulePersist();
});

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  ready: false,
  loadError: '',
  events: [],
  caregivers: [],
  children: [],
  deviceCaregiverId: '',
  demoEventIds: [],
  ydoc,
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
    ydoc.transact(() => {
      const map = new Y.Map<string>();
      map.set('name', name.trim());
      map.set('color', color);
      caregiversMap().set(id, map);
    });
    return id;
  },
  addChild: (name, color) => {
    const id = Crypto.randomUUID();
    ydoc.transact(() => {
      const map = new Y.Map<string>();
      map.set('name', name.trim());
      map.set('color', color);
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
    ydoc.transact(() => {
      writeEvent({ ...input, id });
    });
    set({ demoEventIds: get().demoEventIds.filter((demoId) => demoId !== id) });
    return id;
  },
  updateEventField: (id, field, value) => {
    const map = eventsMap().get(id) as Y.Map<unknown> | undefined;
    if (!map) return;
    ydoc.transact(() => {
      if (field === 'childIds' && Array.isArray(value)) writeChildIds(map, value);
      else map.set(field, value);
      stamp(map);
    });
  },
  claimEvent: (id) => {
    const caregiverId = get().deviceCaregiverId;
    if (!caregiverId) return;
    get().updateEventField(id, 'caregiverId', caregiverId);
  },
  unclaimEvent: (id) => {
    get().updateEventField(id, 'caregiverId', '');
  },
  deleteEvent: (id) => {
    get().updateEventField(id, 'deleted', true);
    set({ demoEventIds: get().demoEventIds.filter((demoId) => demoId !== id) });
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
    ydoc.transact(() => {
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
