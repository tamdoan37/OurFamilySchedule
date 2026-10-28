import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Button, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ExpoCalendar from 'expo-calendar';
import { useScheduleStore, toOffsetISO } from '../../src/store/scheduleStore';
import { EventDraftFields, EventFields } from '../../src/components/EventFields';
import { draftProblems } from '../../src/parser/reviewDrafts';
import { AppEvent } from '../../src/types';

export default function EditEventScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const event = useScheduleStore((state) => state.events.find((item) => item.id === id));
  const caregivers = useScheduleStore((state) => state.caregivers);
  const children = useScheduleStore((state) => state.children);
  const updateEventFields = useScheduleStore((state) => state.updateEventFields);
  const [loadedId, setLoadedId] = useState(event?.id ?? '');
  const [draft, setDraft] = useState<EventDraftFields | null>(() => (event ? toDraft(event) : null));
  const [showErrors, setShowErrors] = useState(false);
  if (event && event.id !== loadedId) {
    setLoadedId(event.id);
    setDraft(toDraft(event));
  }

  if (!id || !event || !draft) {
    return (
      <View style={styles.missing}>
        <Text style={styles.note}>This event is not on the timeline.</Text>
        <Button title="Back" onPress={() => router.back()} />
      </View>
    );
  }

  const problems = draftProblems(draft);

  async function save() {
    if (!event || !draft) return;
    if (draftProblems(draft).length > 0) {
      setShowErrors(true);
      return;
    }
    updateEventFields(event.id, {
      title: draft.title.trim(),
      startTime: toOffsetISO(draft.start),
      endTime: toOffsetISO(draft.end),
      location: draft.location.trim(),
      childIds: draft.childIds,
      caregiverId: draft.caregiverId,
      icon: draft.icon.trim(),
    });
    if (event.calendarEventId) {
      try {
        const permission = await ExpoCalendar.requestCalendarPermissionsAsync();
        if (permission.status !== 'granted') {
          Alert.alert('Calendar permission was not allowed. The event was saved in this app.');
        } else {
          await ExpoCalendar.updateEventAsync(event.calendarEventId, {
            title: draft.title.trim(),
            startDate: draft.start,
            endDate: draft.end,
            location: draft.location.trim(),
          });
        }
      } catch {
        Alert.alert('The phone calendar was not updated. The event was saved in this app.');
      }
    }
    router.back();
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <EventFields value={draft} onChange={setDraft} caregivers={caregivers} children={children} />
      {showErrors && problems.map((problem) => <Text key={problem} style={styles.error}>{problem}</Text>)}
      <Button title="Save" onPress={() => void save()} />
    </ScrollView>
  );
}

function toDraft(event: AppEvent): EventDraftFields {
  return {
    title: event.title,
    start: new Date(event.startTime),
    end: new Date(event.endTime),
    location: event.location,
    childIds: [...event.childIds],
    caregiverId: event.caregiverId,
    icon: event.icon,
  };
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  missing: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 },
  note: { fontSize: 16, color: '#666', textAlign: 'center' },
  error: { color: '#9b1c1c', fontWeight: '600' },
});
