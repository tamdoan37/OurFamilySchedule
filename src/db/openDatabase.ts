import { openDatabaseAsync as openNative } from 'expo-sqlite';
import type { ScheduleDatabase } from './database';

export type { ScheduleDatabase } from './database';

export function openDatabaseAsync(name: string): Promise<ScheduleDatabase> {
  return openNative(name);
}
