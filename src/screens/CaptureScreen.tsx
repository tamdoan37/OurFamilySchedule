import React, { useState } from 'react';
import { View, Text, FlatList, TextInput, Image, StyleSheet, Button, Alert } from 'react-native';
import * as Calendar from 'expo-calendar';
import Constants from 'expo-constants';
import { DraftEvent } from '../types';

// Mock on-device parser until the native model bridge exists.
async function parseScheduleFromImage(_uri: string): Promise<DraftEvent[]> {
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
  // Expo Go has no vision-camera native module. Skip those hooks so this screen still opens.
  if (Constants.appOwnership === 'expo') {
    return <DraftReview cameraNote="Camera needs a development build. Sample rows are shown instead." />;
  }
  return <CameraCapture />;
}

function CameraCapture() {
  const vision = require('react-native-vision-camera') as typeof import('react-native-vision-camera');
  const device = vision.useCameraDevice('back');
  const { hasPermission, requestPermission } = vision.useCameraPermission();
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
    const mockUri = 'file://mock-schedule.jpg';
    setPhoto(mockUri);
    setDrafts(await parseScheduleFromImage(mockUri));
  };

  return (
    <View style={styles.container}>
      {!photo ? (
        <View style={styles.cameraHalf}>
          {device && <vision.Camera style={StyleSheet.absoluteFill} device={device} isActive />}
          <Button title="Capture Schedule" onPress={takePhoto} />
        </View>
      ) : (
        <Image source={{ uri: photo }} style={styles.photo} resizeMode="contain" />
      )}
      <DraftList drafts={drafts} editing={editing} setEditing={setEditing} onSaved={() => { setDrafts([]); setPhoto(null); }} />
    </View>
  );
}

function DraftReview({ cameraNote }: { cameraNote: string }) {
  const [drafts, setDrafts] = useState<DraftEvent[]>([]);
  const [editing, setEditing] = useState<Record<string, Partial<DraftEvent>>>({});

  const loadSample = async () => {
    setDrafts(await parseScheduleFromImage('file://mock-schedule.jpg'));
  };

  return (
    <View style={styles.container}>
      <View style={styles.cameraHalf}>
        <Text style={styles.cameraNote}>{cameraNote}</Text>
        <Button title="Capture Schedule" onPress={loadSample} />
      </View>
      <DraftList drafts={drafts} editing={editing} setEditing={setEditing} onSaved={() => setDrafts([])} />
    </View>
  );
}

function DraftList({
  drafts,
  editing,
  setEditing,
  onSaved,
}: {
  drafts: DraftEvent[];
  editing: Record<string, Partial<DraftEvent>>;
  setEditing: React.Dispatch<React.SetStateAction<Record<string, Partial<DraftEvent>>>>;
  onSaved: () => void;
}) {
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
    onSaved();
  };

  return (
    <View style={styles.listHalf}>
      <Text style={styles.demo}>DEMO DATA</Text>
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  cameraHalf: { flex: 1, backgroundColor: '#000', justifyContent: 'flex-end' },
  cameraNote: { color: '#fff', padding: 16 },
  photo: { flex: 1 },
  listHalf: { flex: 1, padding: 16 },
  demo: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: '#856404', marginBottom: 4 },
  header: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  draft: { padding: 12, borderBottomWidth: 1, borderColor: '#eee' },
  input: { fontSize: 16, borderBottomWidth: 1, marginBottom: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
