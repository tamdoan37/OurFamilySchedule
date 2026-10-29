import { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'qrcode';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { isRelayUrl, suggestedRelayUrl } from '../src/sync/pairing';
import { eraseLocalFamily, useScheduleStore } from '../src/store/scheduleStore';
import { loadSyncEngine, syncSupported } from '../src/sync/loadSync';
import { TabBar } from '../src/components/TabBar';
import { useTypeface } from '../src/fonts';
import { useTheme } from '../src/theme';

export default function PairScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const type = useTypeface();
  const paired = useScheduleStore((state) => state.paired);
  const syncStatus = useScheduleStore((state) => state.syncStatus);
  const [relayUrl, setRelayUrl] = useState(suggestedRelayUrl);
  const [code, setCode] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);
  const styles = usePairStyles();

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
          { text: 'Erase and join', style: 'destructive', onPress: () => { void acceptJoin(trimmed, true); } },
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

  if (scanning) {
    if (!permission) {
      return <View style={[styles.screen, { paddingTop: insets.top }]}><Text style={styles.note}>Loading…</Text></View>;
    }
    if (!permission.granted) {
      return (
        <View style={[styles.screen, { paddingTop: insets.top + 24, paddingHorizontal: 20 }]}>
          <Text style={styles.note}>Camera permission is needed to scan the pairing code.</Text>
          <Pressable onPress={() => void requestPermission()} style={[styles.button, { backgroundColor: theme.primary }]}>
            <Text style={{ color: theme.onPrimary, fontFamily: type.bold }}>Allow camera</Text>
          </Pressable>
          <Pressable onPress={() => setScanning(false)} style={styles.textButton}><Text style={{ color: theme.text, fontFamily: type.semibold }}>Cancel</Text></Pressable>
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
          <Pressable onPress={() => { handled.current = false; setScanning(false); }} style={[styles.button, { backgroundColor: theme.card }]}>
            <Text style={{ color: theme.text, fontFamily: type.bold }}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={[styles.page, { paddingTop: insets.top + 16 }]}>
        <Text style={[styles.kicker, { color: theme.muted, fontFamily: type.semibold }]}>This phone</Text>
        <Text style={[styles.title, { color: theme.text, fontFamily: type.extra }]}>Pair</Text>
        {!syncSupported() && (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.text, fontFamily: type.bold }]}>Development build</Text>
            <Text style={styles.note}>Sync needs a development build. The schedule on this phone still works.</Text>
          </View>
        )}
        {syncSupported() && (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.text, fontFamily: type.bold }]}>{paired ? 'Paired' : 'Not paired yet'}</Text>
            <Text style={styles.note}>The family key stays on the phones. The relay only stores encrypted messages.</Text>
            {paired && <Text style={styles.note}>{syncStatus === 'synced' ? 'Synced' : syncStatus === 'syncing' ? 'Syncing…' : 'Offline'}</Text>}
            {!paired && (
              <>
                <Text style={[styles.label, { color: theme.text, fontFamily: type.bold }]}>Relay address</Text>
                <TextInput
                  value={relayUrl}
                  onChangeText={setRelayUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg, fontFamily: type.medium }]}
                />
                <Text style={styles.note}>On a phone, use the computer's address, not localhost.</Text>
                <Pressable onPress={() => void create()} style={[styles.button, { backgroundColor: theme.primary }]}>
                  <Text style={{ color: theme.onPrimary, fontFamily: type.bold }}>Create family</Text>
                </Pressable>
                <Pressable onPress={() => { handled.current = false; setScanning(true); }} style={[styles.button, styles.outline, { borderColor: theme.border, backgroundColor: theme.bg }]}>
                  <Text style={{ color: theme.text, fontFamily: type.bold }}>Join family</Text>
                </Pressable>
              </>
            )}
            {paired && (
              <>
                <Pressable onPress={() => void showCode()} style={[styles.button, { backgroundColor: theme.primary }]}>
                  <Text style={{ color: theme.onPrimary, fontFamily: type.bold }}>Show pairing code again</Text>
                </Pressable>
                <Pressable onPress={confirmLeave} style={[styles.button, styles.outline, { borderColor: theme.border, backgroundColor: theme.bg }]}>
                  <Text style={{ color: theme.danger, fontFamily: type.bold }}>Leave family</Text>
                </Pressable>
              </>
            )}
            {code && (
              <>
                <Text style={[styles.label, { color: theme.text, fontFamily: type.bold }]}>Scan this with the other phone</Text>
                <PairingCode value={code} />
                <Pressable onPress={() => setCode(null)} style={styles.textButton}>
                  <Text style={{ color: theme.text, fontFamily: type.semibold }}>Hide code</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </ScrollView>
      <TabBar />
    </View>
  );
}

function PairingCode({ value }: { value: string }) {
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const cell = 4;
  return (
    <View style={stylesStatic.qr}>
      {Array.from({ length: size }, (_, row) => (
        <View key={row} style={stylesStatic.qrRow}>
          {Array.from({ length: size }, (_, column) => (
            <View
              key={column}
              style={{ width: cell, height: cell, backgroundColor: qr.modules.data[row * size + column] ? '#17202A' : '#fff' }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function usePairStyles() {
  const theme = useTheme();
  const type = useTypeface();
  return useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.bg },
    page: { paddingHorizontal: 20, paddingBottom: 120, gap: 12 },
    kicker: { fontSize: 13 },
    title: { fontSize: 30, lineHeight: 33, letterSpacing: -0.5 },
    card: { borderRadius: 16, padding: 16, gap: 10, borderWidth: 1 },
    cardTitle: { fontSize: 16 },
    label: { fontSize: 14, marginTop: 4 },
    note: { fontSize: 14, color: theme.muted, fontFamily: type.medium },
    input: { borderWidth: 1, borderRadius: 14, fontSize: 16, minHeight: 48, paddingHorizontal: 14 },
    button: { minHeight: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
    outline: { borderWidth: 1 },
    textButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    cameraWrap: { flex: 1, backgroundColor: '#000', justifyContent: 'flex-end' },
    cameraActions: { padding: 16, backgroundColor: 'rgba(0,0,0,0.35)' },
  }), [theme, type]);
}

const stylesStatic = StyleSheet.create({
  qr: { backgroundColor: '#fff', padding: 16, alignSelf: 'center', borderRadius: 16 },
  qrRow: { flexDirection: 'row' },
});
