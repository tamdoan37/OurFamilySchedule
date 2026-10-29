import { View, Text, StyleSheet, Alert } from 'react-native';
import { Link } from 'expo-router';
import { useScheduleStore } from '../src/store/scheduleStore';
import { PillButton } from '../src/components/PillButton';
import { useTheme } from '../src/theme';

export default function HomeScreen() {
  const loadDemoData = useScheduleStore((state) => state.loadDemoData);
  const caregivers = useScheduleStore((state) => state.caregivers);
  const paired = useScheduleStore((state) => state.paired);
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <Text style={[styles.title, { color: theme.text }]}>OurFamilySchedule</Text>
      <Text style={[styles.sub, { color: theme.muted }]}>Local-first • Zero-knowledge • AI-powered</Text>
      {paired && caregivers.length === 0 && <Text style={[styles.sub, { color: theme.muted }]}>Waiting for the family to sync.</Text>}
      <PillButton
        variant="secondary"
        title="Load Demo Events"
        style={styles.button}
        onPress={() => {
          if (caregivers.length === 0) {
            Alert.alert('Add your family first');
            return;
          }
          loadDemoData();
        }}
      />
      <Link href="/capture" asChild>
        <PillButton title="Scan Schedule Flyer" style={styles.button} />
      </Link>
      <Link href="/setup" asChild>
        <PillButton variant="secondary" title="Family" style={styles.button} />
      </Link>
      <Link href="/timeline" asChild>
        <PillButton title="View Timeline" style={styles.button} />
      </Link>
      <Link href="/settings" asChild>
        <PillButton variant="secondary" title="Settings" style={styles.button} />
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 },
  title: { fontSize: 28, fontWeight: 'bold' },
  sub: { fontSize: 14, marginBottom: 8, textAlign: 'center' },
  button: { minWidth: 240 },
});
