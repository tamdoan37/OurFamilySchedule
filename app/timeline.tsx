import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useScheduleStore } from '../src/store/scheduleStore';

export default function TimelineScreen() {
  const { events, caregivers } = useScheduleStore();

  // Anti-grid: only render blocks with events, caregiver lanes
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Family Timeline</Text>
      {events.length === 0 && <Text style={styles.empty}>No events yet. Scan a schedule!</Text>}
      {events.map(event => {
        const caregiver = caregivers.find(c => c.id === event.assignedCaregiverId);
        const isUnassigned = !event.assignedCaregiverId;
        return (
          <View
            key={event.id}
            style={[
              styles.block,
              isUnassigned && styles.unassigned,
              caregiver && { borderLeftColor: caregiver.colorCode, borderLeftWidth: 6 },
            ]}
          >
            <Text style={styles.eventTitle}>{event.title}</Text>
            <Text>{new Date(event.startTime).toLocaleString()}</Text>
            <Text>{event.location}</Text>
            {isUnassigned && <Text style={styles.claim}>Swipe to claim</Text>}
            {caregiver && <Text style={{ color: caregiver.colorCode }}>{caregiver.name}</Text>}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
  empty: { color: '#999', textAlign: 'center', marginTop: 40 },
  block: {
    padding: 16,
    marginVertical: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
  },
  unassigned: { backgroundColor: '#fff3cd', alignSelf: 'center', width: '100%' },
  eventTitle: { fontSize: 16, fontWeight: '600' },
  claim: { color: '#856404', fontStyle: 'italic', marginTop: 4 },
});
