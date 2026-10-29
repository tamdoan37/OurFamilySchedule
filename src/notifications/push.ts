import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { getScheduleDatabase } from '../store/scheduleStore';
import { getInstallId } from './device';

export async function registerPushDevice(session: { relayUrl: string; roomId: string; token: string }): Promise<void> {
  const permission = await hasNotificationPermission();
  if (!permission) return;
  const projectId = readProjectId();
  let pushToken = '';
  try {
    const result = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    pushToken = result.data;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Could not read a push token');
    return;
  }
  if (!pushToken.startsWith('ExponentPushToken[') && !pushToken.startsWith('ExpoPushToken[')) return;
  const deviceId = await getInstallId();
  const response = await fetch(`${session.relayUrl}/rooms/${session.roomId}/devices`, {
    method: 'POST',
    redirect: 'error',
    headers: {
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ deviceId, pushToken }),
  });
  if (!response.ok) console.error('The relay rejected the push token');
}

export async function hasNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  return current.granted === true;
}

export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted === true;
}

export async function notificationsAlreadyAsked(): Promise<boolean> {
  const db = await getScheduleDatabase();
  const row = await db.getFirstAsync<{ notifications_asked: number }>(
    'SELECT notifications_asked FROM device_meta WHERE id = 1',
  );
  return row?.notifications_asked === 1;
}

export async function markNotificationsAsked(): Promise<void> {
  await getInstallId();
  const db = await getScheduleDatabase();
  await db.runAsync('UPDATE device_meta SET notifications_asked = 1 WHERE id = 1');
}

function readProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const configured = extra?.eas?.projectId || Constants.easConfig?.projectId;
  return configured || undefined;
}