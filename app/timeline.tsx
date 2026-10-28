import React from 'react';
import { View, Text, StyleSheet, ScrollView, Button } from 'react-native';
import { useScheduleStore } from '../src/store/scheduleStore';

export default function TimelineScreen() {
  const events = useScheduleStore((state) => state.events);
  const caregivers = useScheduleStore((state) => state.caregivers);
  const children = useScheduleStore((state) => state.children);
  const demoEventIds = useScheduleStore((state) => state.demoEventIds);
  const claimEvent = useScheduleStore((state) => state.claimEvent);
  const unclaimEvent = useScheduleStore((state) => state.unclaimEvent);
  const showingDemo = events.some((event) => demoEventIds.includes(event.id));

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Family Timeline</Text>
      {showingDemo && <Text style={styles.demo}>DEMO DATA</Text>}
      {events.length === 0 && <Text style={styles.empty}>No events yet. Scan a schedule!</Text>}
      {events.map((event) => {
        const caregiver = caregivers.find((person) => person.id === event.caregiverId);
        const backup = caregivers.find((person) => person.id === event.backupCaregiverId);
        const names = children.filter((child) => event.childIds.includes(child.id)).map((child) => child.name);
        const isUnassigned = !event.caregiverId;
        return (
          <View
            key={event.id}
            style={[
              styles.block,
              isUnassigned && styles.unassigned,
              caregiver && { borderLeftColor: caregiver.color, borderLeftWidth: 6 },
            ]}
          >
            <Text style={styles.eventTitle}>{event.icon ? `${event.icon} ` : ''}{event.title}</Text>
            <Text>{new Date(event.startTime).toLocaleString()} – {new Date(event.endTime).toLocaleTimeString()}</Text>
            {event.location ? <Text>{event.location}</Text> : null}
            {names.length > 0 && <Text>{names.join(', ')}</Text>}
            {event.notes ? <Text>{event.notes}</Text> : null}
            {isUnassigned && <Text style={styles.claim}>Unassigned</Text>}
            {caregiver && <Text style={{ color: caregiver.color }}>{caregiver.name}</Text>}
            {backup && <Text>Backup: {backup.name}</Text>}
            {isUnassigned ? (
              <Button title="Claim" onPress={() => claimEvent(event.id)} />
            ) : (
              <Button title="Unclaim" onPress={() => unclaimEvent(event.id)} />
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
  demo: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: '#856404', marginBottom: 12 },
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
