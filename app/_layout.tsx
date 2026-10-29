import { useEffect } from 'react';
import { View, Text, StyleSheet, Button } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, usePathname, useRouter } from 'expo-router';
import { useScheduleStore } from '../src/store/scheduleStore';
import SyncStatus from '../src/components/SyncStatus';
import { loadSyncEngine, syncSupported } from '../src/sync/loadSync';
import { ScheduleNotices, startNotices } from '../src/notifications/notices';
import { startNotificationNavigation, startReminders } from '../src/notifications/reminders';

export default function RootLayout() {
  const hydrate = useScheduleStore((state) => state.hydrate);
  const retryHydrate = useScheduleStore((state) => state.retryHydrate);
  const ready = useScheduleStore((state) => state.ready);
  const loadError = useScheduleStore((state) => state.loadError);
  const caregivers = useScheduleStore((state) => state.caregivers);
  const deviceCaregiverId = useScheduleStore((state) => state.deviceCaregiverId);
  const paired = useScheduleStore((state) => state.paired);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!ready) return;
    return startNotices();
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    return startReminders();
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    return startNotificationNavigation({
      openEvent: (eventId) => router.push(`/event/${eventId}`),
      onWake: () => {
        if (syncSupported()) loadSyncEngine()?.syncNow();
      },
    });
  }, [ready, router]);

  useEffect(() => {
    if (ready && syncSupported()) loadSyncEngine()?.startSync();
  }, [ready]);

  useEffect(() => {
    if (!ready || pathname === '/setup') return;
    const ownerKnown = caregivers.some((person) => person.id === deviceCaregiverId);
    if (pathname === '/settings') {
      if (paired && caregivers.length > 0 && !ownerKnown) router.replace('/setup');
      return;
    }
    if (caregivers.length === 0 && !paired) router.replace('/setup');
    else if (caregivers.length > 0 && !ownerKnown) router.replace('/setup');
  }, [ready, caregivers, deviceCaregiverId, paired, pathname, router]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <Stack screenOptions={{ headerRight: () => <SyncStatus /> }}>
        <Stack.Screen name="index" options={{ title: 'OurFamilySchedule' }} />
        <Stack.Screen name="setup" options={{ title: 'Family setup' }} />
        <Stack.Screen name="capture" options={{ title: 'Scan Schedule' }} />
        <Stack.Screen name="timeline" options={{ title: 'Timeline' }} />
        <Stack.Screen name="event/[id]" options={{ title: 'Edit event' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
      <ScheduleNotices onOpenEvent={(eventId) => router.push(`/event/${eventId}`)} />
      {!ready && (
        <View style={styles.loading}>
          <Text style={styles.loadingText}>{loadError || 'Loading…'}</Text>
          {!!loadError && <Button title="Try again" onPress={() => void retryHydrate()} />}
        </View>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    elevation: 10,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  loadingText: { fontSize: 16, color: '#666', textAlign: 'center' },
});
