import { create } from 'zustand';
import * as Y from 'yjs';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system';
import { AppEvent, Caregiver, Child, EventField } from '../types';

interface ScheduleState {
  ready: boolean;
  events: AppEvent[];
  caregivers: Caregiver[];
  children: Child[];
  deviceCaregiverId: string;
  demoEventIds: string[];
  ydoc: Y.Doc;
  hydrate: () => Promise<void>;
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
const OWNER_FILE = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}device-owner.json` : null;

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
    const children = map.get('children');
    rows.push({
      id,
      title: String(map.get('title') ?? ''),
      startTime: String(map.get('startTime') ?? ''),
      endTime: String(map.get('endTime') ?? ''),
      location: String(map.get('location') ?? ''),
      childIds: children instanceof Y.Array ? (children.toArray() as string[]) : [],
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

function writeChildren(map: Y.Map<unknown>, ids: string[]) {
  const existing = map.get('children');
  const list = existing instanceof Y.Array ? (existing as Y.Array<string>) : new Y.Array<string>();
  if (!(existing instanceof Y.Array)) map.set('children', list);
  if (list.length > 0) list.delete(0, list.length);
  if (ids.length > 0) list.push(ids);
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
  writeChildren(map, input.childIds ?? []);
  stamp(map);
  eventsMap().set(input.id, map);
}

ydoc.on('update', () => {
  publish();
});

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  ready: false,
  events: [],
  caregivers: [],
  children: [],
  deviceCaregiverId: '',
  demoEventIds: [],
  ydoc,
  hydrate: async () => {
    if (get().ready) return;
    let deviceCaregiverId = '';
    if (OWNER_FILE) {
      const info = await FileSystem.getInfoAsync(OWNER_FILE);
      if (info.exists) {
        try {
          const raw = await FileSystem.readAsStringAsync(OWNER_FILE);
          const parsed = JSON.parse(raw) as { deviceCaregiverId?: string };
          if (typeof parsed.deviceCaregiverId === 'string') deviceCaregiverId = parsed.deviceCaregiverId;
        } catch {
          deviceCaregiverId = '';
        }
      }
    }
    set({
      ready: true,
      deviceCaregiverId,
      events: readEvents(),
      caregivers: readCaregivers(),
      children: readChildren(),
    });
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
    if (OWNER_FILE) {
      await FileSystem.writeAsStringAsync(OWNER_FILE, JSON.stringify({ deviceCaregiverId: caregiverId }));
    }
    set({ deviceCaregiverId: caregiverId });
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
      if (field === 'childIds' && Array.isArray(value)) writeChildren(map, value);
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
