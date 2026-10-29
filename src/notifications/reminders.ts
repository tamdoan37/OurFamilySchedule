import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useScheduleStore } from '../store/scheduleStore';
import { ensureNotificationPermission } from './push';
import { formatLead, planReminders } from './planReminders';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const quiet = notification.request.content.data?.quiet === true;
    return { shouldShowAlert: true, shouldPlaySound: !quiet, shouldSetBadge: false };
  },
});

let generation = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

export function startReminders(): () => void {
  const subscription = AppState.addEventListener('change', (next) => {
    if (next === 'active') scheduleRefresh();
  });
  const unsubscribe = useScheduleStore.subscribe((state, previous) => {
    if (
      state.events !== previous.events
      || state.deviceCaregiverId !== previous.deviceCaregiverId
      || state.reminderLeads !== previous.reminderLeads
      || state.ready !== previous.ready
    ) scheduleRefresh();
  });
  scheduleRefresh();
  return () => {
    subscription.remove();
    unsubscribe();
    if (timer) clearTimeout(timer);
  };
}

export function startNotificationNavigation(handlers: {
  openEvent: (eventId: string) => void;
  onWake: () => void;
}): () => void {
  const handle = (response: Notifications.NotificationResponse | null) => {
    if (!response) return;
    const data = response.notification.request.content.data as { eventId?: unknown; kind?: unknown };
    if (data?.kind === 'sync') handlers.onWake();
    if (typeof data?.eventId === 'string' && data.eventId) handlers.openEvent(data.eventId);
  };
  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  const received = Notifications.addNotificationReceivedListener((notification) => {
    if (notification.request.content.data?.kind === 'sync') handlers.onWake();
  });
  void Notifications.getLastNotificationResponseAsync().then(async (response) => {
    handle(response);
    if (response) await Notifications.clearLastNotificationResponseAsync();
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : 'Could not open a notification');
  });
  return () => {
    subscription.remove();
    received.remove();
  };
}

function scheduleRefresh() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void refreshReminders();
  }, 700);
}

async function refreshReminders() {
  const ticket = ++generation;
  const state = useScheduleStore.getState();
  if (!state.ready) return;
  const allowed = await ensureNotificationPermission().catch(() => false);
  if (!allowed || ticket !== generation) return;
  await Notifications.setNotificationChannelAsync('reminders', {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync('backup', {
    name: 'Backup reminders',
    importance: Notifications.AndroidImportance.LOW,
    sound: null,
    enableVibrate: false,
  });
  if (ticket !== generation) return;
  const plans = planReminders({
    now: Date.now(),
    deviceCaregiverId: state.deviceCaregiverId,
    leads: state.reminderLeads,
    events: state.events,
  });
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (ticket !== generation) return;
  for (const plan of plans) {
    if (ticket !== generation) return;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: `ofs:${plan.eventId}:${plan.quiet ? 'backup' : plan.leadMinutes}`,
        content: {
          title: plan.title,
          body: plan.quiet ? 'Backup, 2 hours before' : `Starts in ${formatLead(plan.leadMinutes)}`,
          data: { eventId: plan.eventId, quiet: plan.quiet },
          sound: plan.quiet ? false : 'default',
          interruptionLevel: plan.quiet ? 'passive' : 'active',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: plan.fireAt,
          channelId: plan.quiet ? 'backup' : 'reminders',
        },
      });
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Could not schedule a reminder');
      return;
    }
  }
}
