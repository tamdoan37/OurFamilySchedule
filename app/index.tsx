import { View, Text, Button, StyleSheet } from 'react-native';
import { Link } from 'expo-router';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>OurFamilySchedule</Text>
      <Text style={styles.sub}>Local-first • Zero-knowledge • AI-powered</Text>
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
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  title: { fontSize: 28, fontWeight: 'bold' },
  sub: { fontSize: 14, color: '#666', marginBottom: 24 },
});
