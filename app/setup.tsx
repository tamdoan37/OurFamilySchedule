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
import { KID_PALETTES, useTheme } from '../src/theme';
import { useTypeface } from '../src/fonts';
import { Pronoun } from '../src/types';

const COLORS = [
  { name: 'Red', value: '#C2412F' },
  { name: 'Teal', value: '#0F7C78' },
  { name: 'Moss', value: '#2F5D4A' },
  { name: 'Gold', value: '#8A5A12' },
];

const PRONOUNS: { id: Pronoun; label: string }[] = [
  { id: 'himself', label: 'Himself' },
  { id: 'herself', label: 'Herself' },
  { id: 'themselves', label: 'Themselves' },
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
  const type = useTypeface();
  const theme = useTheme();
  const [caregiverName, setCaregiverName] = useState('');
  const [caregiverColor, setCaregiverColor] = useState(COLORS[0].value);
  const [childName, setChildName] = useState('');
  const [childPalette, setChildPalette] = useState(KID_PALETTES[0].name);
  const [canDrive, setCanDrive] = useState(false);
  const [pronouns, setPronouns] = useState<Pronoun>('themselves');
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
        <Text style={[styles.title, { fontFamily: type.extra }]}>Reminders</Text>
        <Text style={[styles.sub, { fontFamily: type.medium }]}>The person on duty gets reminders before each event</Text>
        <Button title={asking ? 'Saving…' : 'Allow reminders'} onPress={() => void answer(true)} disabled={asking} />
        <Button title="Not now" onPress={() => void answer(false)} disabled={asking} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={[styles.title, { fontFamily: type.extra }]}>Family setup</Text>
      <Text style={[styles.sub, { fontFamily: type.medium }]}>Add the people who share this calendar. This phone's person stays on this phone.</Text>
      <Button title="Join an existing family" onPress={() => router.push('/pair')} />

      <Text style={[styles.heading, { fontFamily: type.semibold }]}>Caregivers</Text>
      <TextInput value={caregiverName} onChangeText={setCaregiverName} placeholder="Name" style={[styles.input, { fontFamily: type.medium }]} />
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
        <Text key={person.id} style={{ color: person.color, fontFamily: type.semibold }}>{person.name}</Text>
      ))}

      <Text style={[styles.heading, { fontFamily: type.semibold }]}>Children</Text>
      <TextInput value={childName} onChangeText={setChildName} placeholder="Name" style={[styles.input, { fontFamily: type.medium }]} />
      <View style={styles.colors}>
        {KID_PALETTES.map((palette) => (
          <Pressable
            key={palette.name}
            onPress={() => setChildPalette(palette.name)}
            style={[styles.swatch, { backgroundColor: palette.solid }, childPalette === palette.name && styles.swatchOn]}
          >
            <Text style={[styles.swatchLabel, { fontFamily: type.semibold }]}>{palette.name}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={() => setCanDrive((current) => !current)} style={[styles.choice, canDrive && styles.choiceOn]}>
        <Text style={{ color: theme.text, fontFamily: type.semibold }}>{canDrive ? 'Can drive' : 'Does not drive yet'}</Text>
      </Pressable>
      <Text style={[styles.sub, { fontFamily: type.medium }]}>Drives themself as</Text>
      <View style={styles.colors}>
        {PRONOUNS.map((option) => (
          <Pressable key={option.id} onPress={() => setPronouns(option.id)} style={[styles.choice, pronouns === option.id && styles.choiceOn]}>
            <Text style={{ color: theme.text, fontFamily: type.semibold }}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
      <Button
        title="Add child"
        onPress={() => {
          if (!childName.trim()) return;
          const palette = KID_PALETTES.find((entry) => entry.name === childPalette) ?? KID_PALETTES[0];
          addChild(childName, palette.solid, { palette: palette.name, canDrive, pronouns });
          setChildName('');
          setCanDrive(false);
          setPronouns('themselves');
        }}
      />
      {children.map((child) => (
        <Text key={child.id} style={{ color: child.color, fontFamily: type.semibold }}>
          {child.name}{child.canDrive ? ` · drives ${child.pronouns}` : ''}
        </Text>
      ))}

      <Text style={[styles.heading, { fontFamily: type.semibold }]}>This phone belongs to</Text>
      {caregivers.map((person) => (
        <Pressable key={person.id} onPress={() => setPhoneOwner(person.id)} style={[styles.choice, phoneOwner === person.id && styles.choiceOn]}>
          <Text style={{ color: person.color, fontFamily: type.semibold }}>{person.name}</Text>
        </Pressable>
      ))}
      <Button title="Save" onPress={() => void finish()} disabled={!phoneOwner} />
    </ScrollView>
  );
}

function ColorRow({ selected, onPick }: { selected: string; onPick: (color: string) => void }) {
  const styles = useSetupStyles();
  const type = useTypeface();
  return (
    <View style={styles.colors}>
      {COLORS.map((color) => (
        <Pressable key={color.value} onPress={() => onPick(color.value)} style={[styles.swatch, { backgroundColor: color.value }, selected === color.value && styles.swatchOn]}>
          <Text style={[styles.swatchLabel, { fontFamily: type.semibold }]}>{color.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function useSetupStyles() {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create({
    container: { padding: 24, gap: 12, backgroundColor: theme.bg },
    title: { fontSize: 28, color: theme.text },
    sub: { fontSize: 14, color: theme.muted },
    heading: { fontSize: 18, marginTop: 12, color: theme.text },
    input: { borderBottomWidth: 1, borderColor: theme.border, fontSize: 16, minHeight: 44, color: theme.text },
    colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    swatch: { minHeight: 44, paddingHorizontal: 12, borderRadius: 12, justifyContent: 'center' },
    swatchOn: { borderWidth: 2, borderColor: theme.primary },
    swatchLabel: { color: '#fff' },
    choice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: theme.card },
    choiceOn: { borderWidth: 2, borderColor: theme.primary },
    choiceText: { color: theme.text },
    explain: { flex: 1, justifyContent: 'center', padding: 24, gap: 16, backgroundColor: theme.bg },
  }), [theme]);
}
