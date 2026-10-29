import { useMemo, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useScheduleStore } from '../src/store/scheduleStore';
import { refreshReminders } from '../src/notifications/reminders';
import {
  markNotificationsAsked,
  notificationsAlreadyAsked,
  requestNotificationPermission,
} from '../src/notifications/push';
import { loadSyncEngine, syncSupported } from '../src/sync/loadSync';
import { useTheme } from '../src/theme';

const COLORS = [
  { name: 'Red', value: '#C2412F' },
  { name: 'Teal', value: '#0F7C78' },
  { name: 'Moss', value: '#2F5D4A' },
  { name: 'Gold', value: '#8A5A12' },
];

export default function SetupScreen() {
  const caregivers = useScheduleStore((state) => state.caregivers);
  const children = useScheduleStore((state) => state.children);
  const addCaregiver = useScheduleStore((state) => state.addCaregiver);
  const addChild = useScheduleStore((state) => state.addChild);
  const setDeviceCaregiver = useScheduleStore((state) => state.setDeviceCaregiver);
  const deviceCaregiverId = useScheduleStore((state) => state.deviceCaregiverId);
  const router = useRouter();
  const styles = useSetupStyles();
  const [caregiverName, setCaregiverName] = useState('');
  const [caregiverColor, setCaregiverColor] = useState(COLORS[0].value);
  const [childName, setChildName] = useState('');
  const [childColor, setChildColor] = useState(COLORS[1].value);
  const [phoneOwner, setPhoneOwner] = useState(() =>
    caregivers.some((person) => person.id === deviceCaregiverId) ? deviceCaregiverId : '',
  );
  const [explain, setExplain] = useState(false);
  const [asking, setAsking] = useState(false);

  async function finish() {
    if (!phoneOwner || asking) return;
    await setDeviceCaregiver(phoneOwner);
    if (await notificationsAlreadyAsked()) {
      router.replace('/');
      return;
    }
    setExplain(true);
  }

  async function answer(allow: boolean) {
    if (asking) return;
    setAsking(true);
    try {
      if (allow) {
        await requestNotificationPermission().catch(() => false);
        await refreshReminders().catch(() => undefined);
        if (syncSupported()) loadSyncEngine()?.syncNow();
      }
      await markNotificationsAsked();
      router.replace('/');
    } finally {
      setAsking(false);
    }
  }

  if (explain) {
    return (
      <View style={styles.explain}>
        <Text style={styles.title}>Reminders</Text>
        <Text style={styles.sub}>The person on duty gets reminders before each event</Text>
        <Button title={asking ? 'Saving…' : 'Allow reminders'} onPress={() => void answer(true)} disabled={asking} />
        <Button title="Not now" onPress={() => void answer(false)} disabled={asking} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Family setup</Text>
      <Text style={styles.sub}>Add the people who share this calendar. This phone's person stays on this phone.</Text>
      <Button title="Join an existing family" onPress={() => router.push('/pair')} />

      <Text style={styles.heading}>Caregivers</Text>
      <TextInput value={caregiverName} onChangeText={setCaregiverName} placeholder="Name" style={styles.input} />
      <ColorRow selected={caregiverColor} onPick={setCaregiverColor} />
      <Button
        title="Add caregiver"
        onPress={() => {
          if (!caregiverName.trim()) return;
          const id = addCaregiver(caregiverName, caregiverColor);
          setPhoneOwner((current) => current || id);
          setCaregiverName('');
        }}
      />
      {caregivers.map((person) => (
        <Text key={person.id} style={{ color: person.color }}>{person.name}</Text>
      ))}

      <Text style={styles.heading}>Children</Text>
      <TextInput value={childName} onChangeText={setChildName} placeholder="Name" style={styles.input} />
      <ColorRow selected={childColor} onPick={setChildColor} />
      <Button
        title="Add child"
        onPress={() => {
          if (!childName.trim()) return;
          addChild(childName, childColor);
          setChildName('');
        }}
      />
      {children.map((child) => (
        <Text key={child.id} style={{ color: child.color }}>{child.name}</Text>
      ))}

      <Text style={styles.heading}>This phone belongs to</Text>
      {caregivers.map((person) => (
        <Pressable key={person.id} onPress={() => setPhoneOwner(person.id)} style={[styles.choice, phoneOwner === person.id && styles.choiceOn]}>
          <Text style={{ color: person.color, fontWeight: '600' }}>{person.name}</Text>
        </Pressable>
      ))}
      <Button title="Save" onPress={() => void finish()} disabled={!phoneOwner} />
    </ScrollView>
  );
}

function ColorRow({ selected, onPick }: { selected: string; onPick: (color: string) => void }) {
  const styles = useSetupStyles();
  return (
    <View style={styles.colors}>
      {COLORS.map((color) => (
        <Pressable key={color.value} onPress={() => onPick(color.value)} style={[styles.swatch, { backgroundColor: color.value }, selected === color.value && styles.swatchOn]}>
          <Text style={styles.swatchLabel}>{color.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function useSetupStyles() {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create({
    container: { padding: 24, gap: 12, backgroundColor: theme.bg },
    title: { fontSize: 28, fontWeight: 'bold', color: theme.text },
    sub: { fontSize: 14, color: theme.muted },
    heading: { fontSize: 18, fontWeight: '600', marginTop: 12, color: theme.text },
    input: { borderBottomWidth: 1, borderColor: theme.border, fontSize: 16, minHeight: 44, color: theme.text },
    colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    swatch: { minHeight: 44, paddingHorizontal: 12, borderRadius: 12, justifyContent: 'center' },
    swatchOn: { borderWidth: 2, borderColor: theme.primary },
    swatchLabel: { color: '#fff', fontWeight: '600' },
    choice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: theme.card },
    choiceOn: { borderWidth: 2, borderColor: theme.primary },
    explain: { flex: 1, justifyContent: 'center', padding: 24, gap: 16, backgroundColor: theme.bg },
  }), [theme]);
}
