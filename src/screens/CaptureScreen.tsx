import React, { useState } from 'react';
import { View, Text, FlatList, TextInput, Image, StyleSheet, Button, Alert } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import * as Calendar from 'expo-calendar';
import { DraftEvent } from '../types';

// Mock on-device AI parser (replace with native bridge to Foundation Models / Gemini Nano)
async function parseScheduleFromImage(uri: string): Promise<DraftEvent[]> {
  // In real impl: pass base64 or file to native module
  // Prompt: "Extract tabular schedule as JSON array of {title, startTime, endTime, location}"
  return [
    {
      id: 'd1',
      title: 'Soccer Practice',
      startTime: '2026-10-28T16:00:00',
      endTime: '2026-10-28T17:30:00',
      location: 'Field 3',
      confidence: 0.92,
    },
    {
      id: 'd2',
      title: 'Piano Lesson',
      startTime: '2026-10-29T15:00:00',
      endTime: '2026-10-29T15:45:00',
      location: 'Music Studio',
      confidence: 0.87,
    },
  ];
}

export default function CaptureScreen() {
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const [photo, setPhoto] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftEvent[]>([]);
  const [editing, setEditing] = useState<Record<string, Partial<DraftEvent>>>({});

  if (!hasPermission) {
    return (
      <View style={styles.center}>
        <Text>Camera permission required</Text>
        <Button title="Grant Permission" onPress={requestPermission} />
      </View>
    );
  }

  const takePhoto = async () => {
    // Simplified - real impl uses camera ref
    const mockUri = 'file://mock-schedule.jpg';
    setPhoto(mockUri);
    const parsed = await parseScheduleFromImage(mockUri);
    setDrafts(parsed);
  };

  const saveToCalendar = async () => {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed');
      return;
    }
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const defaultCal = calendars.find(c => c.isPrimary) || calendars[0];
    if (!defaultCal) return;

    for (const draft of drafts) {
      const final = { ...draft, ...editing[draft.id] };
      await Calendar.createEventAsync(defaultCal.id, {
        title: final.title || '',
        startDate: new Date(final.startTime || ''),
        endDate: new Date(final.endTime || ''),
        location: final.location,
      });
    }
    Alert.alert('Saved', `${drafts.length} events added to calendar`);
    setDrafts([]);
    setPhoto(null);
  };

  return (
    <View style={styles.container}>
      {!photo ? (
        <View style={styles.cameraHalf}>
          {device && <Camera style={StyleSheet.absoluteFill} device={device} isActive />}
          <Button title="Capture Schedule" onPress={takePhoto} />
        </View>
      ) : (
        <Image source={{ uri: photo }} style={styles.photo} resizeMode="contain" />
      )}
      <View style={styles.listHalf}>
        <Text style={styles.header}>Review Drafts</Text>
        <FlatList
          data={drafts}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <View style={styles.draft}>
              <TextInput
                value={editing[item.id]?.title ?? item.title}
                onChangeText={t => setEditing(e => ({ ...e, [item.id]: { ...e[item.id], title: t } }))}
                style={styles.input}
              />
              <Text>{item.startTime} – {item.endTime}</Text>
              <Text>{item.location}</Text>
            </View>
          )}
        />
        {drafts.length > 0 && <Button title="Save to Calendar" onPress={saveToCalendar} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  cameraHalf: { flex: 1, backgroundColor: '#000', justifyContent: 'flex-end' },
  photo: { flex: 1 },
  listHalf: { flex: 1, padding: 16 },
  header: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  draft: { padding: 12, borderBottomWidth: 1, borderColor: '#eee' },
  input: { fontSize: 16, borderBottomWidth: 1, marginBottom: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
