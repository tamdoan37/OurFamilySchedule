import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { useScheduleStore } from '../store/scheduleStore';
import { loadSyncEngine, syncSupported } from '../sync/loadSync';
import { refreshReminders } from './reminders';

export const SYNC_TASK = 'family-schedule-sync';

function kindOf(value: unknown, depth = 0): string {
  if (depth > 4 || value == null) return '';
  if (typeof value === 'string') {
    try {
      return kindOf(JSON.parse(value), depth + 1);
    } catch {
      return '';
    }
  }
  if (typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  if (record.kind === 'sync') return 'sync';
  return kindOf(record.body, depth + 1) || kindOf(record.data, depth + 1) || kindOf(record.notification, depth + 1);
}

try {
  if (!TaskManager.isTaskDefined(SYNC_TASK)) {
    TaskManager.defineTask(SYNC_TASK, async ({ data, error }) => {
      if (error || kindOf(data) !== 'sync') return 1;
      try {
        if (!useScheduleStore.getState().ready) await useScheduleStore.getState().hydrate();
        if (syncSupported()) await loadSyncEngine()?.backgroundSync();
        await refreshReminders();
        return 2;
      } catch {
        return 3;
      }
    });
  }
  void Notifications.registerTaskAsync(SYNC_TASK).catch(() => {});
} catch {
  // Expo Go has no background-task runtime. Opening the app still catches up.
}
