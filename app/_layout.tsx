import { useEffect } from 'react';
import { View, Text, StyleSheet, Button } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, usePathname, useRouter } from 'expo-router';
import { useScheduleStore } from '../src/store/scheduleStore';

export default function RootLayout() {
  const hydrate = useScheduleStore((state) => state.hydrate);
  const retryHydrate = useScheduleStore((state) => state.retryHydrate);
  const ready = useScheduleStore((state) => state.ready);
  const loadError = useScheduleStore((state) => state.loadError);
  const caregivers = useScheduleStore((state) => state.caregivers);
  const deviceCaregiverId = useScheduleStore((state) => state.deviceCaregiverId);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!ready || pathname === '/setup') return;
    const ownerKnown = caregivers.some((person) => person.id === deviceCaregiverId);
    if (caregivers.length === 0 || !ownerKnown) router.replace('/setup');
  }, [ready, caregivers, deviceCaregiverId, pathname, router]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'OurFamilySchedule' }} />
        <Stack.Screen name="setup" options={{ title: 'Family setup' }} />
        <Stack.Screen name="capture" options={{ title: 'Scan Schedule' }} />
        <Stack.Screen name="timeline" options={{ title: 'Timeline' }} />
        <Stack.Screen name="event/[id]" options={{ title: 'Edit event' }} />
      </Stack>
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
