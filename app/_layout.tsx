import { useEffect } from 'react';
import { View, Text, StyleSheet, Button } from 'react-native';
import { useFonts, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, usePathname, useRouter } from 'expo-router';
import { useScheduleStore } from '../src/store/scheduleStore';
import SyncStatus from '../src/components/SyncStatus';
import { loadSyncEngine, syncSupported } from '../src/sync/loadSync';
import { ScheduleNotices, startNotices } from '../src/notifications/notices';
import { startNotificationNavigation, startReminders } from '../src/notifications/reminders';
import { FontReadyContext } from '../src/fonts';
import { useTheme } from '../src/theme';

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
  const theme = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const typeReady = fontsLoaded && !fontError;

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
    if (pathname === '/settings' || pathname === '/pair') {
      if (paired && caregivers.length > 0 && !ownerKnown) router.replace('/setup');
      return;
    }
    if (caregivers.length === 0 && !paired) router.replace('/setup');
    else if (caregivers.length > 0 && !ownerKnown) router.replace('/setup');
  }, [ready, caregivers, deviceCaregiverId, paired, pathname, router]);

  return (
    <FontReadyContext.Provider value={typeReady}>
    <GestureHandlerRootView style={styles.root}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.bg },
          headerTintColor: theme.text,
          headerTitleStyle: { color: theme.text },
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'OurFamilySchedule', headerRight: () => <SyncStatus /> }} />
        <Stack.Screen name="setup" options={{ title: 'Family setup', headerRight: () => <SyncStatus /> }} />
        <Stack.Screen name="capture" options={{ headerShown: false }} />
        <Stack.Screen name="timeline" options={{ headerShown: false }} />
        <Stack.Screen name="notes" options={{ headerShown: false }} />
        <Stack.Screen name="pair" options={{ headerShown: false }} />
        <Stack.Screen name="event/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: 'Settings', headerRight: () => <SyncStatus /> }} />
      </Stack>
      <ScheduleNotices onOpenEvent={(eventId) => router.push(`/event/${eventId}`)} />
      {(!ready || (!fontsLoaded && !fontError)) && (
        <View style={[styles.loading, { backgroundColor: theme.bg }]}>
          <Text style={[styles.loadingText, { color: theme.muted }]}>{loadError || 'Loading…'}</Text>
          {!!loadError && <Button title="Try again" onPress={() => void retryHydrate()} />}
        </View>
      )}
    </GestureHandlerRootView>
    </FontReadyContext.Provider>
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
