import { useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Button, Alert, ScrollView, Pressable } from 'react-native';
import QRCode from 'qrcode';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { isRelayUrl, suggestedRelayUrl } from '../src/sync/pairing';
import { eraseLocalFamily, useScheduleStore } from '../src/store/scheduleStore';
import { loadSyncEngine, syncSupported } from '../src/sync/loadSync';

export default function SettingsScreen() {
  const paired = useScheduleStore((state) => state.paired);
  const [relayUrl, setRelayUrl] = useState(suggestedRelayUrl);
  const [code, setCode] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  async function create() {
    const sync = loadSyncEngine();
    if (!sync) return;
    if (!isRelayUrl(relayUrl)) {
      Alert.alert('Enter a relay address that starts with http:// or https://');
      return;
    }
    try {
      setCode(await sync.createFamily(relayUrl.trim()));
    } catch {
      Alert.alert('Could not create the family key on this phone.');
    }
  }

  async function showCode() {
    const sync = loadSyncEngine();
    if (!sync) return;
    const existing = await sync.currentPairingCode();
    if (!existing) {
      Alert.alert('This phone is not paired.');
      return;
    }
    setCode(existing);
  }

  function confirmLeave() {
    Alert.alert('Leave family?', 'This phone will stop syncing. Events already on it stay here.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => {
          const sync = loadSyncEngine();
          if (!sync) return;
          void sync.leaveFamily().then(() => setCode(null));
        },
      },
    ]);
  }

  async function onScan(data: string) {
    if (handled.current || typeof data !== 'string') return;
    const trimmed = data.trim();
    if (!trimmed.startsWith('{')) return;
    handled.current = true;
    const state = useScheduleStore.getState();
    if (state.caregivers.length > 0 || state.events.length > 0) {
      setScanning(false);
      Alert.alert(
        'Join family',
        "This phone already has a family set up. Joining will merge it, which can create duplicate people. Erase this phone's family and join, or cancel?",
        [
          { text: 'Cancel', style: 'cancel', onPress: () => { handled.current = false; } },
          {
            text: 'Erase and join',
            style: 'destructive',
            onPress: () => { void acceptJoin(trimmed, true); },
          },
        ],
      );
      return;
    }
    await acceptJoin(trimmed, false);
  }

  async function acceptJoin(raw: string, erase: boolean) {
    const sync = loadSyncEngine();
    if (!sync) return;
    try {
      if (erase) eraseLocalFamily();
      await sync.joinFamily(raw);
      setScanning(false);
      setCode(null);
      Alert.alert('Joined. If this phone does not already have a person, pick who it belongs to.');
    } catch {
      handled.current = false;
      Alert.alert('That code could not be joined.');
    }
  }

  if (!syncSupported()) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Pairing</Text>
        <Text style={styles.note}>Sync needs a development build</Text>
        <ReminderChoices />
      </ScrollView>
    );
  }

  if (scanning) {
    if (!permission) return <View style={styles.container}><Text>Loading…</Text></View>;
    if (!permission.granted) {
      return (
        <View style={styles.container}>
          <Text style={styles.note}>Camera permission is needed to scan the pairing code.</Text>
          <Button title="Allow camera" onPress={() => void requestPermission()} />
          <Button title="Cancel" onPress={() => setScanning(false)} />
        </View>
      );
    }
    return (
      <View style={styles.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={(result) => { void onScan(result.data); }}
        />
        <View style={styles.cameraActions}>
          <Button title="Cancel" onPress={() => { handled.current = false; setScanning(false); }} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Pairing</Text>
      <Text style={styles.note}>The family key stays on the phones. The relay only stores encrypted messages.</Text>
      {!paired && (
        <>
          <Text style={styles.label}>Relay address</Text>
          <TextInput
            value={relayUrl}
            onChangeText={setRelayUrl}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <Text style={styles.note}>On a phone, use the computer's address, not localhost.</Text>
          <Button title="Create family" onPress={() => void create()} />
          <Button title="Join family" onPress={() => { handled.current = false; setScanning(true); }} />
        </>
      )}
      {paired && (
        <>
          <Button title="Show pairing code again" onPress={() => void showCode()} />
          <Button title="Leave family" onPress={confirmLeave} />
        </>
      )}
      {code && (
        <>
          <Text style={styles.label}>Scan this with the other phone</Text>
          <PairingCode value={code} />
          <Button title="Hide code" onPress={() => setCode(null)} />
        </>
      )}
      <ReminderChoices />
    </ScrollView>
  );
}

function ReminderChoices() {
  const leads = useScheduleStore((state) => state.reminderLeads);
  const setReminderLeads = useScheduleStore((state) => state.setReminderLeads);
  return (
    <>
      <Text style={styles.title}>Reminders</Text>
      <Text style={styles.note}>On duty, this phone is reminded before the event. The backup gets one quiet reminder, 2 hours before.</Text>
      <LeadRow
        label="First reminder"
        selected={leads[0]}
        onPick={(minutes) => setReminderLeads(minutes, leads[1])}
      />
      <LeadRow
        label="Second reminder"
        selected={leads[1]}
        onPick={(minutes) => setReminderLeads(leads[0], minutes)}
      />
    </>
  );
}

function LeadRow({ label, selected, onPick }: { label: string; selected: number; onPick: (minutes: number) => void }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choices}>
        {LEAD_OPTIONS.map((option) => (
          <Pressable
            key={option.minutes}
            onPress={() => onPick(option.minutes)}
            style={[styles.choice, selected === option.minutes && styles.choiceOn]}
          >
            <Text style={selected === option.minutes ? styles.choiceOnText : styles.choiceText}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const LEAD_OPTIONS = [
  { minutes: 15, label: '15 min' },
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
  { minutes: 1440, label: '1 day' },
];

function PairingCode({ value }: { value: string }) {
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const cell = 4;
  return (
    <View style={styles.qr}>
      {Array.from({ length: size }, (_, row) => (
        <View key={row} style={styles.qrRow}>
          {Array.from({ length: size }, (_, column) => (
            <View
              key={column}
              style={{ width: cell, height: cell, backgroundColor: qr.modules.data[row * size + column] ? '#111' : '#fff' }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: 'bold' },
  label: { fontSize: 14, fontWeight: '600', marginTop: 4 },
  note: { fontSize: 14, color: '#666' },
  input: { borderBottomWidth: 1, borderColor: '#ccc', fontSize: 16, minHeight: 44 },
  cameraWrap: { flex: 1, backgroundColor: '#000', justifyContent: 'flex-end' },
  cameraActions: { padding: 16, backgroundColor: 'rgba(0,0,0,0.35)' },
  qr: { backgroundColor: '#fff', padding: 16, alignSelf: 'center' },
  qrRow: { flexDirection: 'row' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderColor: '#ccc', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  choiceOn: { borderColor: '#111', backgroundColor: '#111' },
  choiceText: { fontSize: 14, color: '#333' },
  choiceOnText: { fontSize: 14, color: '#fff' },
});
