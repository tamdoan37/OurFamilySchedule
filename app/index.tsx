import { View, Text, Button, StyleSheet, Alert } from 'react-native';
import { Link } from 'expo-router';
import { useScheduleStore } from '../src/store/scheduleStore';

export default function HomeScreen() {
  const loadDemoData = useScheduleStore((state) => state.loadDemoData);
  const caregivers = useScheduleStore((state) => state.caregivers);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>OurFamilySchedule</Text>
      <Text style={styles.sub}>Local-first • Zero-knowledge • AI-powered</Text>
      <Button
        title="Load Demo Events"
        onPress={() => {
          if (caregivers.length === 0) {
            Alert.alert('Add your family first');
            return;
          }
          loadDemoData();
        }}
      />
      <Link href="/capture" asChild>
        <Button title="Scan Schedule Flyer" />
      </Link>
      <Link href="/setup" asChild>
        <Button title="Family" />
      </Link>
      <Link href="/timeline" asChild>
        <Button title="View Timeline" />
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 },
  title: { fontSize: 28, fontWeight: 'bold' },
  sub: { fontSize: 14, color: '#666', marginBottom: 24, textAlign: 'center' },
});
