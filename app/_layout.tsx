import { useEffect, useLayoutEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { useScheduleStore } from '../src/store/scheduleStore';

export default function RootLayout() {
  const hydrate = useScheduleStore((state) => state.hydrate);
  const ready = useScheduleStore((state) => state.ready);
  const loadError = useScheduleStore((state) => state.loadError);
  const caregivers = useScheduleStore((state) => state.caregivers);
  const deviceCaregiverId = useScheduleStore((state) => state.deviceCaregiverId);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useLayoutEffect(() => {
    if (!ready || pathname === '/setup') return;
    if (caregivers.length === 0 || !deviceCaregiverId) router.replace('/setup');
  }, [ready, caregivers.length, deviceCaregiverId, pathname, router]);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>{loadError || 'Loading…'}</Text>
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'OurFamilySchedule' }} />
      <Stack.Screen name="setup" options={{ title: 'Family setup' }} />
      <Stack.Screen name="capture" options={{ title: 'Scan Schedule' }} />
      <Stack.Screen name="timeline" options={{ title: 'Timeline' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { fontSize: 16, color: '#666', textAlign: 'center' },
});
