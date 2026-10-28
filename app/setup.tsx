import { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useScheduleStore } from '../src/store/scheduleStore';

const COLORS = [
  { name: 'Red', value: '#FF6B6B' },
  { name: 'Teal', value: '#4ECDC4' },
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
  const [caregiverName, setCaregiverName] = useState('');
  const [caregiverColor, setCaregiverColor] = useState(COLORS[0].value);
  const [childName, setChildName] = useState('');
  const [childColor, setChildColor] = useState(COLORS[1].value);
  const [phoneOwner, setPhoneOwner] = useState(() =>
    caregivers.some((person) => person.id === deviceCaregiverId) ? deviceCaregiverId : '',
  );

  async function finish() {
    if (!phoneOwner) return;
    await setDeviceCaregiver(phoneOwner);
    router.replace('/');
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Family setup</Text>
      <Text style={styles.sub}>Add the people who share this calendar. This phone's person stays on this phone.</Text>
      <Button title="Join an existing family" onPress={() => router.push('/settings')} />

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

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: 'bold' },
  sub: { fontSize: 14, color: '#666' },
  heading: { fontSize: 18, fontWeight: '600', marginTop: 12 },
  input: { borderBottomWidth: 1, borderColor: '#ccc', fontSize: 16, minHeight: 44 },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatch: { minHeight: 44, paddingHorizontal: 12, borderRadius: 12, justifyContent: 'center' },
  swatchOn: { borderWidth: 2, borderColor: '#111' },
  swatchLabel: { color: '#fff', fontWeight: '600' },
  choice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#f8f9fa' },
  choiceOn: { borderWidth: 2, borderColor: '#111' },
});
