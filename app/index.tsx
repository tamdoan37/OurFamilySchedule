import { View, Text, Button, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { useScheduleStore } from '../src/store/scheduleStore';

export default function HomeScreen() {
  const loadDemoData = useScheduleStore(s => s.loadDemoData);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>OurFamilySchedule</Text>
      <Text style={styles.sub}>Local-first • Zero-knowledge • AI-powered</Text>
      <Text style={styles.demo}>DEMO DATA</Text>
      <Button title="Load Demo Events" onPress={loadDemoData} />
      <Link href="/capture" asChild>
        <Button title="Scan Schedule Flyer" />
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
  sub: { fontSize: 14, color: '#666', marginBottom: 8, textAlign: 'center' },
  demo: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: '#856404' },
});
