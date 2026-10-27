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
}

const ydoc = new Y.Doc();
const yEvents = ydoc.getArray<AppEvent>('events');

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
}));

// Persist stub - wire to MMKV/SQLite in full impl
ydoc.on('update', () => {
  // save to expo-sqlite or mmkv
});
