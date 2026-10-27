import { create } from 'zustand';
import * as Y from 'yjs';
import { AppEvent, Caregiver } from '../types';

interface ScheduleState {
  events: AppEvent[];
  caregivers: Caregiver[];
  ydoc: Y.Doc;
  setEvents: (events: AppEvent[]) => void;
  addEvent: (event: AppEvent) => void;
  updateEvent: (id: string, patch: Partial<AppEvent>) => void;
  loadDemoData: () => void;
}

const ydoc = new Y.Doc();
const yEvents = ydoc.getArray<AppEvent>('events');

const demoEvents: AppEvent[] = [
  {
    id: 'demo1',
    title: 'Soccer Practice',
    startTime: new Date(Date.now() + 86400000).toISOString(),
    endTime: new Date(Date.now() + 86400000 + 5400000).toISOString(),
    location: 'Field 3',
    assignedCaregiverId: 'mom',
  },
  {
    id: 'demo2',
    title: 'Piano Lesson',
    startTime: new Date(Date.now() + 172800000).toISOString(),
    endTime: new Date(Date.now() + 172800000 + 2700000).toISOString(),
    location: 'Music Studio',
    assignedCaregiverId: 'dad',
  },
  {
    id: 'demo3',
    title: 'Doctor Appointment',
    startTime: new Date(Date.now() + 259200000).toISOString(),
    endTime: new Date(Date.now() + 259200000 + 3600000).toISOString(),
    location: 'Pediatric Clinic',
    assignedCaregiverId: null,
  },
];

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  events: [],
  caregivers: [
    { id: 'mom', name: 'Mom', colorCode: '#FF6B6B' },
    { id: 'dad', name: 'Dad', colorCode: '#4ECDC4' },
  ],
  ydoc,
  setEvents: (events) => set({ events }),
  addEvent: (event) => {
    yEvents.push([event]);
    set({ events: yEvents.toArray() });
  },
  updateEvent: (id, patch) => {
    const idx = yEvents.toArray().findIndex(e => e.id === id);
    if (idx >= 0) {
      const current = yEvents.get(idx);
      yEvents.delete(idx, 1);
      yEvents.insert(idx, [{ ...current, ...patch }]);
    }
    set({ events: yEvents.toArray() });
  },
  loadDemoData: () => {
    yEvents.delete(0, yEvents.length);
    yEvents.push(demoEvents);
    set({ events: yEvents.toArray() });
  },
}));

// Persist stub - wire to MMKV/SQLite in full impl
ydoc.on('update', () => {
  // save to expo-sqlite or mmkv
});
