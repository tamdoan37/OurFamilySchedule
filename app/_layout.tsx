import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'OurFamilySchedule' }} />
      <Stack.Screen name="capture" options={{ title: 'Scan Schedule' }} />
      <Stack.Screen name="timeline" options={{ title: 'Timeline' }} />
    </Stack>
  );
}
