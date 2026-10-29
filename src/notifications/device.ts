import * as Crypto from 'expo-crypto';
import { getScheduleDatabase } from '../store/scheduleStore';

let cached = '';

export async function getInstallId(): Promise<string> {
  if (cached) return cached;
  const db = await getScheduleDatabase();
  const row = await db.getFirstAsync<{ install_id: string }>('SELECT install_id FROM device_meta WHERE id = 1');
  if (row?.install_id) {
    cached = row.install_id;
    return cached;
  }
  const installId = Crypto.randomUUID();
  await db.runAsync('INSERT INTO device_meta (id, install_id) VALUES (1, ?)', installId);
  cached = installId;
  return installId;
}
