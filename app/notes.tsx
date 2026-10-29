import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScheduleStore } from '../src/store/scheduleStore';
import { TabBar } from '../src/components/TabBar';
import { useTypeface } from '../src/fonts';
import { useTheme } from '../src/theme';

export default function NotesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const type = useTypeface();
  const events = useScheduleStore((state) => state.events);
  const notes = events
    .filter((event) => !event.deleted && (event.notes.trim().length > 0 || event.checklist.length > 0))
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={[styles.page, { paddingTop: insets.top + 16 }]}>
        <Text style={[styles.kicker, { color: theme.muted, fontFamily: type.semibold }]}>For the drive</Text>
        <Text style={[styles.title, { color: theme.text, fontFamily: type.extra }]}>Notes</Text>
        {notes.length === 0 && (
          <View style={[styles.card, styles.shadow, { backgroundColor: theme.card }]}>
            <Text style={{ color: theme.text, fontFamily: type.bold, fontSize: 16 }}>Nothing written down yet</Text>
            <Text style={{ color: theme.muted, fontFamily: type.medium, marginTop: 4 }}>Notes and the bring list live on each event.</Text>
          </View>
        )}
        {notes.map((event) => {
          const packed = event.checklist.filter((item) => item.done).length;
          const when = new Date(event.startTime);
          const whenText = Number.isNaN(when.getTime())
            ? 'Time not set'
            : when.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
          return (
            <Pressable key={event.id} onPress={() => router.push(`/event/${event.id}`)} style={[styles.card, styles.shadow, { backgroundColor: theme.card }]}>
              <Text style={{ color: theme.text, fontSize: 16, fontFamily: type.bold }}>{event.title}</Text>
              <Text style={{ color: theme.meta, fontSize: 13, fontFamily: type.medium, marginTop: 2 }}>{whenText}</Text>
              {!!event.notes && <Text style={{ color: theme.text, fontSize: 14, fontFamily: type.medium, marginTop: 8 }}>{event.notes}</Text>}
              {event.checklist.length > 0 && (
                <Text style={{ color: theme.muted, fontSize: 12, fontFamily: type.semibold, marginTop: 8 }}>{packed} of {event.checklist.length} packed</Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      <TabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
  kicker: { fontSize: 13, fontWeight: '600' },
  title: { fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
  card: { borderRadius: 16, padding: 16 },
  shadow: {
    shadowColor: '#17202A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});
