import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { getInstallId } from './device';

export async function registerPushDevice(session: { relayUrl: string; roomId: string; token: string }): Promise<void> {
  const permission = await ensureNotificationPermission();
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

export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

function readProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const configured = extra?.eas?.projectId || Constants.easConfig?.projectId;
  return configured || undefined;
}
